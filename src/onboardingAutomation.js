/**
 * Onboarding Automation Module
 *
 * Automatically detects signed contracts in #contracts channel,
 * downloads and parses .docx files with Claude AI to extract data,
 * posts handoff messages to #onboarding-2,
 * and logs everything to Notion Contract Tracker (with file attached).
 */

const { ContractDocParser, SUPPORTED_EXTENSIONS } = require('./contractDocParser');

// Channel IDs
const CONTRACTS_CHANNEL = 'C08HFEPLJ0K';      // #contracts
const ONBOARDING_CHANNEL = 'C0ABT4558TG';     // #onboarding-2

// Team member Slack IDs
const TEAM = {
  omar: 'U03HB8DEPCG',
  avery: 'U0A90LUUKST',
  kelsey: 'U06QC14T1RC',
  vince: 'U060XHVCLTA'
};

/**
 * Check if a message indicates a finalized/signed contract
 */
function isSignedContract(message) {
  const text = (message.text || '').toLowerCase();
  const files = message.files || [];

  // Check for "FINALIZED" or "SIGNED" in filenames
  const hasFinalizedFile = files.some(file => {
    const filename = (file.name || '').toUpperCase();
    return filename.includes('FINALIZED') || filename.includes('SIGNED');
  });

  // Check for signed keywords in text
  const signedKeywords = ['signed', 'executed', 'finalized', 'contract signed', 'deal closed'];
  const hasSignedKeyword = signedKeywords.some(keyword => text.includes(keyword));

  return hasFinalizedFile || hasSignedKeyword;
}

/**
 * Extract client information from a signed contract message text
 * (fallback when no .docx file is attached or parsing fails)
 */
function extractClientInfoFromText(message) {
  const text = message.text || '';
  const files = message.files || [];

  const clientInfo = {
    clientName: null,
    contactName: null,
    email: null,
    phone: null,
    entity: 'MSB', // Default
    rate: null,
    address: null,
    website: null,
    notes: null,
    signedDate: new Date().toISOString().split('T')[0]
  };

  // Detect entity from filename or text
  const combinedText = text + ' ' + files.map(f => f.name || '').join(' ');
  if (combinedText.toLowerCase().includes('vegas') || combinedText.toLowerCase().includes('vvcs')) {
    clientInfo.entity = 'Vegas Valley';
  }

  // Try to extract client name from filename
  for (const file of files) {
    const filename = file.name || '';
    const match = filename.match(/(?:MSB|VegasValley)_(?:Contract|FINALIZED)_([^_]+)/i);
    if (match) {
      clientInfo.clientName = match[1].replace(/_/g, ' ');
      break;
    }
  }

  // Try to extract from message text
  const clientPatterns = [
    /client[:\s]+([A-Z][A-Za-z0-9\s&,.-]+?)(?:\n|$|,)/i,
    /company[:\s]+([A-Z][A-Za-z0-9\s&,.-]+?)(?:\n|$|,)/i,
    /for\s+([A-Z][A-Za-z0-9\s&,.-]+?)(?:\s+at|\s+signed|\s+contract|,|\n|$)/i
  ];

  for (const pattern of clientPatterns) {
    const match = text.match(pattern);
    if (match && !clientInfo.clientName) {
      clientInfo.clientName = match[1].trim();
      break;
    }
  }

  // Extract email
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) clientInfo.email = emailMatch[1];

  // Extract phone
  const phoneMatch = text.match(/(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) clientInfo.phone = phoneMatch[0];

  // Extract rate
  const rateMatch = text.match(/(\d{2,3})%(?:\s*(?:and|\/)\s*(\d{2,3})%)?/);
  if (rateMatch) {
    clientInfo.rate = rateMatch[2]
      ? `${rateMatch[1]}% and ${rateMatch[2]}% with legal`
      : `${rateMatch[1]}%`;
  }

  // Extract contact name
  const contactMatch = text.match(/(?:contact|signer|attn)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i);
  if (contactMatch) clientInfo.contactName = contactMatch[1];

  // Extract website
  const websiteMatch = text.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)/i);
  if (websiteMatch) clientInfo.website = websiteMatch[0];

  // Build notes from remaining text
  if (!clientInfo.clientName && text.length > 10) {
    clientInfo.notes = text.substring(0, 200);
  }

  return clientInfo;
}

/**
 * Merge document-parsed info with text-extracted info
 * Document-parsed data takes priority (it's from the actual contract)
 */
function mergeClientInfo(docParsed, textExtracted) {
  if (!docParsed) return textExtracted;

  return {
    clientName: docParsed.clientName || textExtracted.clientName,
    contactName: docParsed.contactName || textExtracted.contactName,
    email: docParsed.email || textExtracted.email,
    phone: docParsed.phone || textExtracted.phone,
    entity: docParsed.entity || textExtracted.entity,
    rate: docParsed.rate || textExtracted.rate,
    address: docParsed.address || textExtracted.address,
    website: docParsed.website || textExtracted.website,
    notes: textExtracted.notes,
    signedDate: docParsed.signedDate || textExtracted.signedDate,
    parsedFromDoc: true
  };
}

/**
 * Format the onboarding handoff message
 */
function formatHandoffMessage(clientInfo) {
  const parts = ['🆕 *NEW CLIENT ONBOARDING*\n'];

  if (clientInfo.clientName) {
    parts.push(`📋 *Client:* ${clientInfo.clientName}`);
  }
  if (clientInfo.contactName) {
    parts.push(`👤 *Contact:* ${clientInfo.contactName}`);
  }
  if (clientInfo.email) {
    parts.push(`📧 *Email:* ${clientInfo.email}`);
  }
  if (clientInfo.phone) {
    parts.push(`📞 *Phone:* ${clientInfo.phone}`);
  }
  parts.push(`🏢 *Entity:* ${clientInfo.entity}`);
  if (clientInfo.rate) {
    parts.push(`📊 *Rate:* ${clientInfo.rate}`);
  }
  if (clientInfo.address) {
    parts.push(`📍 *Address:* ${clientInfo.address}`);
  }
  if (clientInfo.website) {
    parts.push(`🌐 *Website:* ${clientInfo.website}`);
  }
  parts.push(`📅 *Contract Signed:* ${clientInfo.signedDate}`);
  if (clientInfo.parsedFromDoc) {
    parts.push('📄 _Data auto-extracted from contract document_');
  }
  if (clientInfo.notes) {
    parts.push(`📝 *Notes:* ${clientInfo.notes}`);
  }

  parts.push('');
  parts.push(`<@${TEAM.kelsey}> — Please complete:`);
  parts.push('☐ Create client login at clients.msbureau.com');
  parts.push('☐ Add client to CRM');
  parts.push('☐ Send welcome email with credentials + upload instructions');
  parts.push('☐ Reply here confirming ✅ Login Created');
  parts.push('');
  parts.push('_Auto-generated from #contracts_');

  return parts.join('\n');
}

/**
 * Check if handoff already exists for this client
 */
async function handoffExists(client, clientName) {
  if (!clientName) return false;

  try {
    const result = await client.conversations.history({
      channel: ONBOARDING_CHANNEL,
      limit: 100
    });

    const normalizedClientName = clientName.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const msg of result.messages || []) {
      const msgText = (msg.text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (msgText.includes(normalizedClientName) && msgText.includes('newclientonboarding')) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('[Onboarding] Error checking existing handoffs:', error.message);
    return false;
  }
}

/**
 * Post handoff message to #onboarding-2
 */
async function postHandoff(client, clientInfo, originalMessage) {
  try {
    // Check for duplicate
    if (await handoffExists(client, clientInfo.clientName)) {
      console.log(`[Onboarding] Handoff already exists for ${clientInfo.clientName}, skipping`);
      return { success: false, reason: 'duplicate' };
    }

    const message = formatHandoffMessage(clientInfo);

    const result = await client.chat.postMessage({
      channel: ONBOARDING_CHANNEL,
      text: message,
      unfurl_links: false,
      unfurl_media: false
    });

    console.log(`[Onboarding] Posted handoff for ${clientInfo.clientName} to #onboarding-2`);

    // React to original message to indicate it's been processed
    if (originalMessage.channel && originalMessage.ts) {
      try {
        await client.reactions.add({
          channel: originalMessage.channel,
          timestamp: originalMessage.ts,
          name: 'white_check_mark'
        });
      } catch (e) {
        // Ignore reaction errors
      }
    }

    return { success: true, ts: result.ts };
  } catch (error) {
    console.error('[Onboarding] Error posting handoff:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Find supported contract files (.docx, .doc, .pdf) in the message attachments
 */
function getContractFiles(message) {
  const files = message.files || [];
  return files.filter(file => ContractDocParser.isSupportedFile(file.name));
}

/**
 * Setup the onboarding automation listener
 */
function setupOnboardingAutomation(app, notionClient = null) {
  // Initialize document parser (uses Claude AI)
  const docParser = new ContractDocParser(process.env.ANTHROPIC_API_KEY);
  const botToken = process.env.SLACK_BOT_TOKEN;

  // Listen for all messages in #contracts channel
  app.message(async ({ message, client }) => {
    // Only process messages in #contracts channel
    if (message.channel !== CONTRACTS_CHANNEL) {
      return;
    }

    // Skip message updates
    if (message.subtype === 'message_changed') {
      return;
    }

    // Allow Slackbot messages (DocHub email-forwarded contracts)
    // but skip other bot messages (e.g. ContractBot's own replies)
    if (message.subtype === 'bot_message' && message.user !== 'USLACKBOT') {
      return;
    }

    console.log(`[Onboarding] New message in #contracts from ${message.user}`);

    // Check if this is a signed contract
    if (!isSignedContract(message)) {
      console.log('[Onboarding] Not a signed contract, skipping');
      return;
    }

    console.log('[Onboarding] Detected signed contract!');

    // Step 1: Extract client info from message text (baseline)
    const textClientInfo = extractClientInfoFromText(message);

    // Step 2: Try to parse contract files (.docx, .pdf) for better data
    let docClientInfo = null;
    let fileInfo = null;
    const contractFiles = getContractFiles(message);

    if (contractFiles.length > 0 && docParser.anthropic) {
      console.log(`[Onboarding] Found ${contractFiles.length} contract file(s), parsing with Claude...`);

      // Parse the first supported file
      const docFile = contractFiles[0];
      try {
        const parseResult = await docParser.parseSignedContract(docFile, botToken);

        if (parseResult.clientInfo) {
          docClientInfo = parseResult.clientInfo;
          console.log(`[Onboarding] Document parsed: ${docClientInfo.clientName || 'unknown'}`);
        }

        // Prepare file info for Notion attachment (include buffer for direct upload)
        if (parseResult.fileUrl || parseResult.fileBuffer) {
          fileInfo = {
            fileName: parseResult.fileName,
            fileUrl: parseResult.fileUrl,
            fileBuffer: parseResult.fileBuffer || null
          };
          console.log(`[Onboarding] File ready for Notion: ${fileInfo.fileName} (${fileInfo.fileBuffer ? (fileInfo.fileBuffer.length / 1024).toFixed(1) + ' KB buffer' : 'URL only'})`);
        }
      } catch (error) {
        console.error(`[Onboarding] Document parsing failed: ${error.message}`);
      }
    } else if (contractFiles.length === 0) {
      // No .docx files, but there might be other files to attach
      const allFiles = message.files || [];
      if (allFiles.length > 0) {
        fileInfo = {
          fileName: allFiles[0].name || 'contract',
          fileUrl: allFiles[0].permalink || allFiles[0].url_private || null
        };
      }
    }

    // Step 3: Merge data (document-parsed takes priority)
    const clientInfo = mergeClientInfo(docClientInfo, textClientInfo);

    if (!clientInfo.clientName) {
      console.log('[Onboarding] Could not extract client name, skipping auto-handoff');
      return;
    }

    console.log(`[Onboarding] Final client: ${clientInfo.clientName} (${clientInfo.entity}), rate: ${clientInfo.rate || 'unknown'}${clientInfo.parsedFromDoc ? ' [from doc]' : ''}`);

    // Step 4: Post handoff to #onboarding-2
    const handoffResult = await postHandoff(client, clientInfo, message);

    if (handoffResult.success) {
      // Step 5: Log signed contract to Notion Contract Tracker (with file attached)
      if (notionClient) {
        try {
          await notionClient.logSignedContract(clientInfo, fileInfo);
          console.log(`[Onboarding] Logged to Notion Contract Tracker: ${clientInfo.clientName}`);
        } catch (error) {
          console.error('[Onboarding] Failed to log to Notion:', error.message);
        }
      }

      // Step 6: Notify in thread of original message
      try {
        const threadMsg = clientInfo.parsedFromDoc
          ? `✅ Contract parsed and logged!\n📋 *${clientInfo.clientName}* → <#${ONBOARDING_CHANNEL}> + Notion Contract Tracker\n📄 _Data extracted from document by AI_`
          : `✅ Auto-handoff posted to <#${ONBOARDING_CHANNEL}> for *${clientInfo.clientName}*`;

        await client.chat.postMessage({
          channel: message.channel,
          thread_ts: message.ts,
          text: threadMsg
        });
      } catch (e) {
        // Ignore thread reply errors
      }
    }
  });

  console.log('🤖 Onboarding automation: ENABLED');
  console.log(`   Watching: #contracts (${CONTRACTS_CHANNEL})`);
  console.log(`   Posting to: #onboarding-2 (${ONBOARDING_CHANNEL})`);
  if (docParser.anthropic) {
    console.log('   📄 Document parsing: ENABLED (downloads + reads .docx/.pdf with Claude AI)');
  }
}

module.exports = {
  setupOnboardingAutomation,
  isSignedContract,
  extractClientInfoFromText,
  mergeClientInfo,
  formatHandoffMessage,
  postHandoff,
  getContractFiles,
  CONTRACTS_CHANNEL,
  ONBOARDING_CHANNEL,
  TEAM
};
