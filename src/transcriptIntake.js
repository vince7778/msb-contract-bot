/**
 * Transcript intake / channel tidying
 * ---------------------------------------------------------------------------
 * The problem this solves (raised by Christine, 2026-09-19):
 *
 *   Sales pastes a whole call transcript straight into #sales-2-contracts-maker
 *   along with the contract details. The useful part is ~8 lines; the transcript
 *   is 6,000+ characters. The channel becomes unreadable.
 *
 * What this module does:
 *   1. Splits a pasted request into its short header (Company/Client/Rate/...)
 *      and the long transcript that follows an "Input:" style marker.
 *   2. Builds a compact Block Kit summary card for the channel.
 *   3. Gives the transcript back so the caller can upload it as a Slack file -
 *      a collapsed, clickable card instead of a wall of text. Christine asked
 *      for "a link to click on to listen or read the script"; that's this.
 *
 * Nothing here talks to Slack or throws - it's pure parsing, so it can be
 * unit-tested against the real messages from the channel.
 */

// Markers that mean "everything after this is the raw call".
// Ordered longest-first so "Call transcript:" wins over "Call:".
const TRANSCRIPT_MARKERS = [
  'call transcript:',
  'transcript:',
  'call notes:',
  'notes from call:',
  'conversation:',
  'recording:',
  'input:',
  'script:'
];

// Header fields sales actually uses, mapped to a display label.
const FIELD_PATTERNS = [
  ['company',     /^\s*company\s*:\s*(.+)$/im],
  ['client',      /^\s*client\s*:\s*(.+)$/im],
  ['signer',      /^\s*signer\s*:\s*(.+)$/im],
  ['email',       /^\s*e-?mail\s*:\s*(.+)$/im],
  ['address',     /^\s*address\s*:\s*(.+)$/im],
  ['rate',        /^\s*rate\s*:\s*(.+)$/im],
  ['website',     /^\s*website\s*:\s*(.+)$/im],
  ['medical',     /^\s*medical\s*:\s*(.+)$/im],
  ['nonMedical',  /^\s*non[\s-]?medical\s*:\s*(.+)$/im],
  ['commercial',  /^\s*(?:commercial|b2b)\s*:\s*(.+)$/im]
];

/**
 * Strip Slack's link markup so values read cleanly in the summary card:
 *   <mailto:a@b.com|a@b.com>  -> a@b.com
 *   <https://x.com/|x.com>    -> x.com
 */
function unwrapSlackLinks(s) {
  if (!s) return '';
  return String(s)
    .replace(/<mailto:([^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<mailto:([^|>]+)>/g, '$1')
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<(https?:\/\/[^|>]+)>/g, '$1');
}

/** Remove bot mentions (<@U123>) from a line of text. */
function stripMentions(s) {
  return String(s || '').replace(/<@[A-Z0-9]+(?:\|[^>]+)?>/g, '').trim();
}

function words(s) {
  const t = String(s || '').trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/**
 * Find where the transcript begins.
 * Returns the index just past the marker, or -1 when there's no marker.
 * Only matches a marker sitting at the start of a line, so the word
 * "transcript" inside a sentence doesn't trigger it.
 */
function findTranscriptStart(text) {
  const lower = String(text || '').toLowerCase();
  let best = -1;
  let bestMarker = null;

  for (const marker of TRANSCRIPT_MARKERS) {
    // start-of-line occurrence only
    const re = new RegExp('^[ \\t]*' + marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'im');
    const m = re.exec(lower);
    if (m) {
      const idx = m.index + m[0].length;
      if (best === -1 || m.index < best) {
        best = m.index;
        bestMarker = { idx, marker };
      }
    }
  }
  return bestMarker ? bestMarker.idx : -1;
}

/**
 * Split a pasted contract request into header + transcript.
 *
 * @param {String} raw  The full Slack message text
 * @returns {{header:String, transcript:String, hasTranscript:Boolean,
 *            transcriptWords:Number, fields:Object}}
 */
function parseRequest(raw) {
  const text = String(raw || '');
  const cut = findTranscriptStart(text);

  let header = text;
  let transcript = '';

  if (cut !== -1) {
    header = text.slice(0, cut);
    transcript = text.slice(cut);

    // "Input: 6465231531\nHi.\n..." - the marker line often carries a phone
    // number or speaker name before the call really starts. Keep it; it's
    // part of the record and harmless inside the snippet.
    transcript = transcript.replace(/^[ \t]*\n/, '');
  }

  // Pull the known header fields.
  const fields = {};
  for (const [key, re] of FIELD_PATTERNS) {
    const m = re.exec(header);
    if (m && m[1]) {
      const v = unwrapSlackLinks(m[1]).trim();
      if (v) fields[key] = v;
    }
  }

  return {
    header: stripMentions(header).trim(),
    transcript: transcript.trim(),
    hasTranscript: transcript.trim().length > 0,
    transcriptWords: words(transcript),
    fields
  };
}

/**
 * Should this message be tidied? True when there's a transcript worth moving
 * out of the channel. Short requests with no call attached are left alone -
 * they were never the problem.
 *
 * @param {String} raw
 * @param {Number} [minChars] transcript length that counts as "a wall"
 */
function shouldTidy(raw, minChars) {
  const limit = typeof minChars === 'number'
    ? minChars
    : Number(process.env.TRANSCRIPT_TIDY_MIN_CHARS || 600);
  const parsed = parseRequest(raw);
  return parsed.hasTranscript && parsed.transcript.length >= limit;
}

/** Account type in plain words, from whichever header field was used. */
function accountLabel(fields) {
  if (fields.commercial) return 'Commercial / B2B';
  if (fields.nonMedical) return 'Non-medical';
  if (fields.medical) return 'Medical';
  return null;
}

/**
 * Short description of the business, if sales wrote one next to the
 * medical/non-medical field (e.g. "Non medical: B2B Door instilation busines").
 */
function businessNote(fields) {
  return fields.commercial || fields.nonMedical || fields.medical || null;
}

/**
 * Build the tidy channel card.
 *
 * @param {Object} o
 * @param {Object} o.parsed         result of parseRequest()
 * @param {String} [o.requesterId]  Slack user id of whoever asked
 * @param {String} [o.transcriptUrl] permalink to the uploaded transcript file
 * @param {String} [o.transcriptName]
 * @returns {{text:String, blocks:Array}}
 */
function buildSummaryCard({ parsed, requesterId, transcriptUrl, transcriptName }) {
  const f = parsed.fields || {};
  const client = f.client || 'New client';
  const company = f.company || null;
  const acct = accountLabel(f);
  const note = businessNote(f);

  const line1 = [company, acct, f.rate].filter(Boolean).join('  ·  ');

  const detail = [];
  if (f.signer) detail.push(`*Signer:* ${f.signer}`);
  if (f.email) detail.push(`*Email:* ${f.email}`);
  if (f.address) detail.push(`*Address:* ${f.address}`);
  if (f.website) detail.push(`*Website:* ${f.website}`);
  if (note && note !== acct) detail.push(`*Business:* ${note}`);

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:clipboard: *Contract request — ${client}*` +
              (line1 ? `\n${line1}` : '')
      }
    }
  ];

  if (detail.length) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: detail.join('\n') }
    });
  }

  const context = [];
  if (requesterId) context.push(`Requested by <@${requesterId}>`);
  if (parsed.hasTranscript) {
    const size = `${parsed.transcriptWords.toLocaleString()} words`;
    context.push(
      transcriptUrl
        ? `:telephone_receiver: <${transcriptUrl}|Call transcript> (${size})`
        : `:telephone_receiver: Call transcript attached (${size})`
    );
  }
  if (context.length) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: context.join('   ·   ') }] });
  }

  return {
    text: `Contract request — ${client}`,
    blocks
  };
}

/** Filename for the uploaded transcript. */
function transcriptFileName(fields) {
  const base = (fields && fields.client) ? fields.client : 'call';
  const safe = String(base).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return `Call_Transcript_${safe || 'call'}.txt`;
}

module.exports = {
  parseRequest,
  shouldTidy,
  buildSummaryCard,
  transcriptFileName,
  // exported for tests
  _internals: { unwrapSlackLinks, findTranscriptStart, accountLabel, words }
};
