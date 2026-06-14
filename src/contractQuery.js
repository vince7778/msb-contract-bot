/**
 * Contract Q&A Lookup (Option A)
 * Answers natural-language questions about past contracts by reading
 * recent Slack history from #contracts-maker (the requests, which carry
 * client / company / rate / address) and #sales-2-contracts (signed PDFs
 * posted by Zapier + viewed/signed alerts), then asking Claude to answer.
 *
 * This reads data that already exists in Slack — no database required.
 * (A future upgrade can answer from a real database instead; see Option B.)
 */

// Channel IDs (overridable via env)
const REQUESTS_CHANNEL = process.env.CONTRACTS_MAKER_CHANNEL_ID || 'C0ADK85UCF2'; // #contracts-maker
const SIGNED_CHANNEL = process.env.CONTRACT_CHANNEL_ID || 'C08HFEPLJ0K';          // #sales-2-contracts

/**
 * Decide whether a mention is a QUESTION about existing contracts
 * (vs. a request to create one, or a help/edit request).
 */
function isContractQuestion(text) {
  const t = (text || '').toLowerCase().replace(/<@[a-z0-9]+>/gi, ' ').trim();

  // If it looks like a NEW contract request, it's not a question.
  const requestMarkers = [
    'contract request', 'new client', 'create a contract', 'create contract',
    'generate contract', 'make a contract', 'draft contract',
    'client:', 'company:', 'rate:', 'signer:'
  ];
  if (requestMarkers.some(m => t.includes(m))) return false;

  // Question cues.
  const cues = [
    '?', 'was ', 'is ', 'are ', 'did ', 'do we', 'does ', 'have we',
    'what ', 'which ', 'who ', 'when ', 'where ', 'how many', 'how much',
    'find ', 'look up', 'lookup', 'search', 'status of', 'signed',
    'show me', 'list ', 'any contract', 'rate for', 'rate did', 'rate of',
    'tell me about', 'do you have'
  ];
  return cues.some(c => t.includes(c));
}

/**
 * Pull a compact digest of recent messages from a channel.
 * Long call transcripts are trimmed — the labeled header fields
 * (Company / Client / Rate / etc.) live at the top and are what matter.
 */
async function fetchChannelDigest(client, channelId, label, limit = 80) {
  try {
    const res = await client.conversations.history({ channel: channelId, limit });
    const lines = (res.messages || []).map(m => {
      let line = (m.text || '').replace(/\s+/g, ' ').trim();
      if (m.files && m.files.length) {
        line += ' [files: ' + m.files.map(f => f.name).filter(Boolean).join(', ') + ']';
      }
      if (!line) return null;
      if (line.length > 550) line = line.slice(0, 550) + ' …(trimmed)';
      return '- ' + line;
    }).filter(Boolean);
    return `=== ${label} (newest first) ===\n` + (lines.join('\n') || '(no recent messages)');
  } catch (e) {
    return `=== ${label} ===\n(could not read this channel: ${e.message})`;
  }
}

/**
 * Answer a contract question using Slack history.
 * @returns {Promise<string>} the answer text to post back
 */
function statusEmoji(status) {
  const t = (status || '').toLowerCase();
  if (t.includes('sign') && !t.includes('not') && !t.includes('await') && !t.includes('unsigned')) return ':white_check_mark:';
  if (t.includes('await') || t.includes('sent') || t.includes('pending') || t.includes('not yet')) return ':hourglass_flowing_sand:';
  if (t.includes('view')) return ':eyes:';
  if (t.includes('discard')) return ':wastebasket:';
  return ':grey_question:';
}

/**
 * Build a clean Slack Block Kit card from the structured answer.
 * Returns { text, blocks } - text is the plain fallback.
 */
function buildAnswerBlocks(data, question) {
  if (!data || !data.found) {
    const msg = (data && data.note) ||
      `I couldn't find a contract matching that in the recent history. Try checking SignWell directly.`;
    return {
      text: msg,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `:mag: ${msg}` } }]
    };
  }

  const client = data.client || 'Contract';
  const company = data.company || null;
  const headerBits = [`:page_facing_up: *${client}*`];
  if (company) headerBits.push(company);
  const header = headerBits.join('  ·  ');
  const statusLine = `${statusEmoji(data.status)} *${data.status || 'Status unknown'}*`;

  const fields = [];
  if (data.rate) fields.push({ type: 'mrkdwn', text: `*Rate*\n${data.rate}` });
  if (company) fields.push({ type: 'mrkdwn', text: `*Entity*\n${company}` });
  if (data.signer) fields.push({ type: 'mrkdwn', text: `*Signer*\n${data.signer}` });
  if (data.date) fields.push({ type: 'mrkdwn', text: `*Date*\n${data.date}` });

  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: `${header}\n${statusLine}` } }];
  if (fields.length) blocks.push({ type: 'section', fields: fields.slice(0, 10) });
  if (data.note) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: data.note }] });

  const text = [client, data.status, data.rate].filter(Boolean).join(' — ');
  return { text, blocks };
}

/**
 * Answer a contract question using Slack history.
 * Returns { text, blocks } for a clean Slack card.
 */
async function answerContractQuestion(anthropic, client, question) {
  const [requests, signed] = await Promise.all([
    fetchChannelDigest(client, REQUESTS_CHANNEL, 'CONTRACT REQUESTS (#contracts-maker)'),
    fetchChannelDigest(client, SIGNED_CHANNEL, 'SIGNED CONTRACTS (#sales-2-contracts)')
  ]);

  const prompt = `You are ContractBot's lookup assistant for a debt-collection company.
Using ONLY the Slack history below, answer the team's question. Do not invent details.

How to read the data:
- "CONTRACT REQUESTS" messages have labeled fields: Company (MSB or VV/Vegas Valley),
  Client, Signer, Email, Address, Website, Rate (e.g. "30%" or "30% / 40% litigation").
- "SIGNED CONTRACTS" messages are signed PDFs (filenames include the client name) and
  view/sign status alerts. Use these to decide whether a contract was signed.

Return ONLY a JSON object (no markdown, no backticks) with these keys:
{
  "found": true or false,
  "client": "client/business name or null",
  "company": "MSB" or "Vegas Valley" or null,
  "rate": "the rate string e.g. '30% / 40% litigation', or null",
  "signer": "signer name or null",
  "status": "Signed" | "Sent, awaiting signature" | "Viewed, not signed" | "Not yet sent" | "Unknown",
  "date": "a relevant date if available, or null",
  "note": "one short sentence of extra context, or if not found, what the team should do"
}

Rules:
- If you cannot find the contract, set "found": false and put guidance in "note".
- Keep "note" to one short sentence. Do not repeat the rate/status already in other fields.
- Base "status" on the SIGNED CONTRACTS section.

Question: "${question}"

${requests}

${signed}`;

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }]
  });

  let raw = (resp.content[0] && resp.content[0].text ? resp.content[0].text : '').trim();
  // Strip code fences if the model added them
  if (raw.startsWith('```')) raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    // Fallback: convert markdown bold (**) to Slack bold (*) and send as plain text
    const cleaned = raw.replace(/\*\*(.+?)\*\*/g, '*$1*');
    return { text: cleaned || 'No result.', blocks: [{ type: 'section', text: { type: 'mrkdwn', text: cleaned || 'No result.' } }] };
  }
  return buildAnswerBlocks(data, question);
}

module.exports = { isContractQuestion, answerContractQuestion, buildAnswerBlocks };
