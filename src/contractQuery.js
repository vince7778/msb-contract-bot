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
async function answerContractQuestion(anthropic, client, question) {
  const [requests, signed] = await Promise.all([
    fetchChannelDigest(client, REQUESTS_CHANNEL, 'CONTRACT REQUESTS (#contracts-maker)'),
    fetchChannelDigest(client, SIGNED_CHANNEL, 'SIGNED CONTRACTS (#sales-2-contracts)')
  ]);

  const prompt = `You are ContractBot's lookup assistant for a debt-collection company.
Answer the team's question using ONLY the Slack history provided below. Do not invent details.

How to read the data:
- "CONTRACT REQUESTS" messages contain labeled fields: Company (MSB or VV/Vegas Valley),
  Client, Signer, Email, Address, Website, Rate (e.g. "30%" or "30% / 40% litigation").
- "SIGNED CONTRACTS" messages are signed PDFs (filenames include the client name) and
  view/sign status alerts. Use these to judge whether a contract was signed.

Rules:
- Be concise and direct. Lead with the answer.
- If asked whether something is signed, check the SIGNED CONTRACTS section and say clearly
  signed / not yet / can't tell, with the date if available.
- If you can't find the contract in the history, say so plainly and suggest the team
  check SignWell directly — do NOT guess.
- When useful, include client, company (MSB or Vegas Valley), and rate.

Question: "${question}"

${requests}

${signed}`;

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 700,
    messages: [{ role: 'user', content: prompt }]
  });
  return (resp.content[0] && resp.content[0].text ? resp.content[0].text : '').trim()
    || "I couldn't find anything matching that in the recent contract history.";
}

module.exports = { isContractQuestion, answerContractQuestion };
