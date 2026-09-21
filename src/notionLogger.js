/**
 * Notion Contract Tracker logging
 * ---------------------------------------------------------------------------
 * When a contract is approved and sent for signature, write a row to the
 * Notion "Contract Tracker" database. A background poller then flips that row
 * to Active (with a Signed Date) once SignWell reports the client has signed.
 *
 * Design notes:
 *  - Uses the Notion REST API directly through axios. No new npm dependency.
 *  - EVERY function here is non-throwing. Notion is a nice-to-have side effect;
 *    it must never be able to break or delay sending a contract to a client.
 *  - Silently disabled when NOTION_API_KEY / NOTION_CONTRACT_DB_ID aren't set,
 *    so the bot runs exactly as before until those vars exist in Railway.
 *  - All dates are US Central (America/Chicago), matching the contracts.
 *
 * Required env vars:
 *   NOTION_API_KEY          Internal integration secret (starts with "ntn_")
 *   NOTION_CONTRACT_DB_ID   The Contract Tracker database id
 */

const axios = require('axios');
const { getDocumentStatus } = require('./signwellIntegration');

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// ---------------------------------------------------------------------------
// Config / availability
// ---------------------------------------------------------------------------
function notionConfig() {
  const token = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_CONTRACT_DB_ID;
  if (!token || !dbId) return null;
  return { token, dbId };
}

function isEnabled() {
  return !!notionConfig();
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json'
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** YYYY-MM-DD in US Central, matching the date printed on the contract. */
function chicagoDate(d = new Date()) {
  // en-CA gives ISO-style YYYY-MM-DD
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

/** Notion rich_text value (trimmed to Notion's 2000-char limit). */
function text(value) {
  const s = (value === null || value === undefined) ? '' : String(value);
  return { rich_text: [{ type: 'text', text: { content: s.slice(0, 1990) } }] };
}

function title(value) {
  const s = (value === null || value === undefined) ? '' : String(value);
  return { title: [{ type: 'text', text: { content: s.slice(0, 1990) } }] };
}

function select(name) {
  return name ? { select: { name: String(name) } } : { select: null };
}

function date(isoDay) {
  return isoDay ? { date: { start: isoDay } } : { date: null };
}

/**
 * Map the bot's company config to the tracker's Company options.
 * The tracker uses "MSB" and "Vegas Valley".
 */
function companyOption(companyShort) {
  const s = (companyShort || '').toLowerCase();
  if (s.includes('vegas') || s.includes('vv')) return 'Vegas Valley';
  if (s.includes('msb') || s.includes('midwest')) return 'MSB';
  return null; // leave blank rather than guess wrong
}

/**
 * Format the rate the way the team already writes it in the tracker:
 *   "35%"  or  "35% and 45% legal"
 */
function termsPercentage({ rate, legalRate, hasLegalRate }) {
  if (!rate && rate !== 0) return null;
  return hasLegalRate && legalRate
    ? `${rate}% and ${legalRate}% legal`
    : `${rate}%`;
}

/**
 * Best-effort 2-letter state from a US address ("... , KS 67213" -> "KS").
 * Returns null when it can't be read confidently - an empty cell beats a
 * wrong one.
 */
function stateFromAddress(address) {
  if (!address) return null;
  const m = String(address).match(/,\s*([A-Za-z]{2})\.?\s*,?\s*\d{5}(?:-\d{4})?\s*$/);
  if (m) return m[1].toUpperCase();
  const m2 = String(address).match(/,\s*([A-Z]{2})\s*$/);
  return m2 ? m2[1] : null;
}

/** Strip Slack's <@U123> wrapper so the tracker shows a plain handle/name. */
function plainApprover(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^<@([^>|]+)(?:\|([^>]+))?>$/);
  if (m) return m[2] || m[1];
  return String(raw);
}

// ---------------------------------------------------------------------------
// Create the tracker row (called on Approve & Send)
// ---------------------------------------------------------------------------

/**
 * Log a sent contract to the Notion Contract Tracker.
 *
 * @param {Object} o
 * @param {String} o.clientName
 * @param {String} o.companyShort      'MSB' / 'Vegas Valley Collection Service'
 * @param {String} o.signerName
 * @param {String} o.signerEmail
 * @param {String} o.accountType       Municipal | Medical | Commercial | Education
 * @param {Number} o.rate
 * @param {Number} [o.legalRate]
 * @param {Boolean}[o.hasLegalRate]
 * @param {Number} [o.accountValueUSD]
 * @param {String} [o.address]
 * @param {String} [o.contractType]    e.g. 'Medical', 'Commercial/B2B'
 * @param {String} [o.fileName]
 * @param {String} [o.signwellId]
 * @param {String} [o.signingUrl]
 * @param {String} [o.approvedBy]      Slack mention or name
 * @returns {Promise<{ok:Boolean, pageId?:String, url?:String, reason?:String}>}
 */
async function logContractSent(o) {
  const cfg = notionConfig();
  if (!cfg) return { ok: false, reason: 'disabled' };

  try {
    const today = chicagoDate();

    const properties = {
      'Name': title(o.clientName || o.fileName || 'Untitled contract'),
      'Company': select(companyOption(o.companyShort)),
      'Contract Type': select('Client'),
      'Status': { status: { name: 'Pending' } }, // out for signature
      'Account Type': select(o.accountType || null),
      'Terms Percentage': text(termsPercentage(o) || ''),
      'Signer': text(o.signerName || ''),
      'Signer Email': { email: o.signerEmail || null },
      'Sent Date': date(today),
      'Start Date': date(today), // the date printed under Omar's signature
      'Approved By': text(plainApprover(o.approvedBy) || ''),
      'SignWell ID': text(o.signwellId || ''),
      'Logged By Bot': { checkbox: true }
    };

    const st = stateFromAddress(o.address);
    if (st) properties['State'] = text(st);

    if (typeof o.accountValueUSD === 'number' && !Number.isNaN(o.accountValueUSD)) {
      properties['Estimated Value'] = { number: o.accountValueUSD };
    }

    if (o.signingUrl) properties['Signing Link'] = { url: o.signingUrl };

    const notes = [
      o.contractType ? `Contract: ${o.contractType}` : null,
      o.fileName ? `File: ${o.fileName}` : null,
      'Logged automatically by ContractBot.'
    ].filter(Boolean).join(' • ');
    properties['Notes'] = text(notes);

    const res = await axios.post(
      `${NOTION_API}/pages`,
      { parent: { database_id: cfg.dbId }, properties },
      { headers: headers(cfg.token), timeout: 20000 }
    );

    console.log(`[Notion] Logged "${o.clientName}" to Contract Tracker (${res.data.id})`);
    return { ok: true, pageId: res.data.id, url: res.data.url };
  } catch (err) {
    const detail = err.response && err.response.data
      ? JSON.stringify(err.response.data).slice(0, 300)
      : err.message;
    console.error('[Notion] Failed to log contract:', detail);
    return { ok: false, reason: detail };
  }
}

// ---------------------------------------------------------------------------
// Signed write-back (polling)
// ---------------------------------------------------------------------------

/**
 * Find rows this bot created that are still awaiting signature.
 * Filter: Logged By Bot = true AND Status = Pending AND SignWell ID not empty.
 */
async function findAwaitingSignature(cfg) {
  const res = await axios.post(
    `${NOTION_API}/databases/${cfg.dbId}/query`,
    {
      page_size: 100,
      filter: {
        and: [
          { property: 'Logged By Bot', checkbox: { equals: true } },
          { property: 'Status', status: { equals: 'Pending' } },
          { property: 'SignWell ID', rich_text: { is_not_empty: true } }
        ]
      }
    },
    { headers: headers(cfg.token), timeout: 20000 }
  );

  return (res.data.results || []).map((page) => {
    const p = page.properties || {};
    const idProp = p['SignWell ID'] && p['SignWell ID'].rich_text;
    const nameProp = p['Name'] && p['Name'].title;
    return {
      pageId: page.id,
      signwellId: ((idProp && idProp[0] && idProp[0].plain_text) || '').trim(),
      name: (nameProp && nameProp[0] && nameProp[0].plain_text) || 'contract'
    };
  }).filter((r) => r.signwellId);
}

async function patchPage(cfg, pageId, properties) {
  await axios.patch(
    `${NOTION_API}/pages/${pageId}`,
    { properties },
    { headers: headers(cfg.token), timeout: 20000 }
  );
}

/**
 * Normalise a SignWell document status into what we do about it.
 * SignWell reports things like: Draft, Sent, Completed, Declined, Expired.
 */
function classify(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('complet') || s.includes('signed') || s.includes('executed')) return 'signed';
  if (s.includes('declin') || s.includes('cancel') || s.includes('void')) return 'dead';
  if (s.includes('expir')) return 'dead';
  return 'waiting';
}

/**
 * One polling pass: check every awaiting row against SignWell and update the
 * ones that have resolved. Never throws.
 *
 * @returns {Promise<{checked:Number, signed:Number, closed:Number}>}
 */
async function syncSignedStatuses() {
  const cfg = notionConfig();
  if (!cfg) return { checked: 0, signed: 0, closed: 0 };
  if (!process.env.SIGNWELL_API_KEY) return { checked: 0, signed: 0, closed: 0 };

  let rows = [];
  try {
    rows = await findAwaitingSignature(cfg);
  } catch (err) {
    const detail = err.response && err.response.data
      ? JSON.stringify(err.response.data).slice(0, 300)
      : err.message;
    console.error('[Notion] Status sync query failed:', detail);
    return { checked: 0, signed: 0, closed: 0 };
  }

  let signed = 0;
  let closed = 0;

  for (const row of rows) {
    try {
      const doc = await getDocumentStatus(row.signwellId);
      const verdict = classify(doc && doc.status);

      if (verdict === 'signed') {
        await patchPage(cfg, row.pageId, {
          'Status': { status: { name: 'Active' } },
          'Signed Date': date(chicagoDate())
        });
        signed++;
        console.log(`[Notion] "${row.name}" marked Active (signed).`);
      } else if (verdict === 'dead') {
        await patchPage(cfg, row.pageId, {
          'Status': { status: { name: 'Expired' } }
        });
        closed++;
        console.log(`[Notion] "${row.name}" marked Expired (${doc && doc.status}).`);
      }
    } catch (err) {
      const detail = err.response && err.response.data
        ? JSON.stringify(err.response.data).slice(0, 200)
        : err.message;
      console.error(`[Notion] Status check failed for "${row.name}":`, detail);
    }
  }

  return { checked: rows.length, signed, closed };
}

/**
 * Start the background poller. Safe to call unconditionally - it no-ops when
 * Notion isn't configured. Interval is unref'd so it can never hold the
 * process open on shutdown.
 */
function startStatusSync() {
  if (!isEnabled()) {
    console.log('[Notion] Contract Tracker logging is off (NOTION_API_KEY / NOTION_CONTRACT_DB_ID not set).');
    return null;
  }

  const minutes = Number(process.env.NOTION_SYNC_MINUTES || 30);
  const intervalMs = Math.max(5, minutes) * 60 * 1000;

  console.log(`[Notion] Contract Tracker logging is ON. Signature sync every ${minutes} min.`);

  const run = () => {
    syncSignedStatuses()
      .then(({ checked, signed, closed }) => {
        if (checked) {
          console.log(`[Notion] Sync: checked ${checked}, newly signed ${signed}, closed ${closed}.`);
        }
      })
      .catch((e) => console.error('[Notion] Sync pass error:', e.message));
  };

  // First pass shortly after boot, then on the interval.
  const kickoff = setTimeout(run, 60 * 1000);
  if (kickoff.unref) kickoff.unref();

  const timer = setInterval(run, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = {
  logContractSent,
  syncSignedStatuses,
  startStatusSync,
  isEnabled,
  // exported for tests
  _internals: { chicagoDate, companyOption, termsPercentage, stateFromAddress, plainApprover, classify }
};
