require('dotenv').config();
const { App } = require('@slack/bolt');
const Anthropic = require('@anthropic-ai/sdk');
const { generateContract } = require('./contractGenerator');
const { generateOnePager } = require('./onePagerGenerator');
const { generateEmail } = require('./emailGenerator');
const { analyzeTranscript } = require('./transcriptAnalyzer');
const { parseNaturalLanguage, parseChangeRequest, cleanClientName } = require('./naturalLanguageParser');
const { remember, recall, update, hasContext } = require('./conversationMemory');
const { detectCompany, COMPANIES } = require('./companyConfig');
const { editDocument, isWordDocument } = require('./documentEditor');
const axios = require('axios');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Initialize Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN
});

// Initialize Claude
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Download file from Slack - tries multiple methods
async function downloadSlackFile(url, token) {
  console.log(`[Download] Starting download...`);

  // Method 1: Authorization header (standard OAuth method)
  try {
    console.log(`[Download] Trying Authorization header method...`);
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'arraybuffer',
      maxRedirects: 10,
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'ContractBot/1.0'
      }
    });

    const buffer = Buffer.from(response.data);

    // Check if we got actual file content (not HTML)
    if (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B) {
      console.log(`[Download] Success with Auth header! ${buffer.length} bytes`);
      return buffer;
    }

    // If we got HTML, try next method
    const preview = buffer.slice(0, 50).toString('utf8');
    if (preview.includes('<!DOCTYPE') || preview.includes('<html')) {
      console.log(`[Download] Auth header returned HTML, trying token param...`);
    } else {
      // Might be valid file with different signature
      console.log(`[Download] Got ${buffer.length} bytes, signature: ${buffer.slice(0,4).toString('hex')}`);
      return buffer;
    }
  } catch (err) {
    console.log(`[Download] Auth header failed: ${err.message}`);
  }

  // Method 2: Token as query parameter
  try {
    const urlWithToken = url.includes('?') ? `${url}&token=${token}` : `${url}?token=${token}`;
    console.log(`[Download] Trying token query param method...`);

    const response = await axios({
      method: 'GET',
      url: urlWithToken,
      responseType: 'arraybuffer',
      maxRedirects: 10,
      timeout: 60000
    });

    const buffer = Buffer.from(response.data);
    console.log(`[Download] Got ${buffer.length} bytes with token param`);
    return buffer;

  } catch (err) {
    console.log(`[Download] Token param failed: ${err.message}`);
  }

  throw new Error('All download methods failed. Check bot has files:read scope in Slack App settings.');
}

// Check if message is asking for help
function isHelpRequest(text) {
  const helpPhrases = ['help', 'how do i', 'how to', 'what can you do', 'commands', 'usage'];
  const lowerText = text.toLowerCase();
  return helpPhrases.some(phrase => lowerText.includes(phrase)) && !lowerText.includes('client');
}

// Check if this is a new client request
function isNewClientRequest(text) {
  const lowerText = text.toLowerCase();
  const clientIndicators = [
    'new client', 'create contract', 'generate contract', 'make a contract',
    'create a contract', 'contract for', 'one-pager for', 'onepager for',
    'client:', 'prepare documents', 'draft contract'
  ];
  return clientIndicators.some(phrase => lowerText.includes(phrase));
}

// Check if this is a change/edit request
function isChangeRequest(text) {
  const lowerText = text.toLowerCase();
  const changeIndicators = [
    'change', 'update', 'fix', 'modify', 'edit', 'actually', 'instead',
    'make it', 'should be', 'wrong', 'correct', 'revise', 'redo',
    'regenerate', 're-generate', 'try again', 'not right'
  ];
  return changeIndicators.some(phrase => lowerText.includes(phrase));
}

// Generate all documents for a client
async function generateDocuments(clientData, event, client, say) {
  const company = clientData.companyConfig || COMPANIES.msb;

  // ALWAYS generate one-pager now (AI-driven creative design)
  const wantsOnePager = true;

  // Build progress message based on what we're generating
  let progressItems = [
    '• Analyzing your input',
    '• Detecting client type (Medical/Non-Medical)',
    `• Generating ${company.shortName} contract`,
    '• Creating branded one-pager',
    '• Writing follow-up email'
  ];

  await say({
    thread_ts: event.thread_ts || event.ts,
    text: `:hourglass_flowing_sand: Got it! Creating *${company.shortName}* documents for *${clientData.clientName}*...\n${progressItems.join('\n')}`
  });

  // Check for attached logo
  let clientLogoBuffer = null;
  if (event.files && event.files.length > 0) {
    const logoFile = event.files.find(f => f.mimetype && f.mimetype.startsWith('image/'));
    if (logoFile) {
      try {
        clientLogoBuffer = await downloadSlackFile(logoFile.url_private, process.env.SLACK_BOT_TOKEN);
        console.log('Downloaded client logo:', logoFile.name);
      } catch (err) {
        console.error('Failed to download logo:', err);
      }
    }
  }

  // If we don't have isMedical from parsing, analyze transcript
  if (clientData.isMedical === undefined || clientData.isMedical === null) {
    if (clientData.transcript) {
      const analysis = await analyzeTranscript(anthropic, clientData.transcript);
      clientData.isMedical = analysis.isMedical;
      clientData.painPoints = clientData.painPoints?.length ? clientData.painPoints : analysis.painPoints;
      clientData.concerns = clientData.concerns?.length ? clientData.concerns : analysis.concerns;
    } else {
      clientData.isMedical = false;
    }
  }

  // Add logo to client data
  clientData.clientLogoBuffer = clientLogoBuffer;

  // Make sure we have company config
  if (!clientData.companyConfig) {
    clientData.companyConfig = company;
  }
  clientData.company = clientData.companyConfig;

  // Generate documents - one-pager only if requested
  // Contract uses templates now, no AI needed
  const contractResult = await generateContract(clientData);
  const emailText = await generateEmail(anthropic, clientData);

  // Only generate one-pager if explicitly requested
  let onePagerResult = null;
  if (wantsOnePager) {
    onePagerResult = await generateOnePager(anthropic, clientData);
  }

  // Use contract type from generator result
  const contractType = contractResult.contractType || (clientData.isMedical ? 'Medical (with BAA)' : 'Non-Medical');
  const filePrefix = company.id === 'vegasvalley' ? 'VegasValley' : 'MSB';
  const safeClientName = clientData.clientName.replace(/[^a-zA-Z0-9]/g, '_');
  const contractFileName = `${filePrefix}_Contract_${safeClientName}_${Date.now()}.docx`;

  // Upload contract
  await client.files.uploadV2({
    channel_id: event.channel,
    thread_ts: event.thread_ts || event.ts,
    file: contractResult.buffer,
    filename: contractFileName,
    title: `${company.shortName} ${contractType} Contract - ${clientData.clientName}`,
    initial_comment: `:white_check_mark: Here's the *${company.shortName} ${contractType}* contract for *${clientData.clientName}*!`
  });

  // Upload one-pager ONLY if requested
  if (onePagerResult) {
    const onePagerFileName = `${filePrefix}_OnePager_${safeClientName}_${Date.now()}.docx`;
    await client.files.uploadV2({
      channel_id: event.channel,
      thread_ts: event.thread_ts || event.ts,
      file: onePagerResult.buffer,
      filename: onePagerFileName,
      title: `${company.shortName} One-Pager - ${clientData.clientName}`,
      initial_comment: `:page_facing_up: And here's the custom *${company.shortName}* One-Pager!`
    });
  }

  // Post email in chat
  const docNote = onePagerResult
    ? 'Contract and one-pager are attached above.'
    : 'Contract is attached above.';

  await say({
    thread_ts: event.thread_ts || event.ts,
    text: `:email: *${company.shortName} Follow-up Email for ${clientData.clientName}:*\n\n${emailText}\n\n---\n_Copy and paste the above email. ${docNote}_\n\n:bulb: *Need changes?* Just reply here and tell me what to fix (e.g., "change the rate to 25%" or "make it non-medical")`
  });

  return clientData;
}

// Listen for mentions
app.event('app_mention', async ({ event, client, say }) => {
  try {
    const text = event.text;
    const threadTs = event.thread_ts || event.ts;
    const isInThread = !!event.thread_ts;

    console.log(`[Bot] Received mention. In thread: ${isInThread}, Thread: ${threadTs}`);

    // Check if this is a help request
    if (isHelpRequest(text)) {
      await say({
        thread_ts: threadTs,
        text: `Hey! I'm ContractBot - I create contracts for *Midwest Service Bureau, LLC* and *Vegas Valley Collection Service*.\n\n*Just talk to me naturally!* For example:\n• "Create a contract for ABC Dental, contact is Dr. Smith, they have $300K in aging AR"\n• "New client Premier Auto Parts, 35% rate"\n• "Vegas Valley contract for Desert Medical Center at 30% and 40% with legal"\n• "Contract for Smith Dental with one-pager"\n\n*I'll automatically:*\n• Figure out which company (MSB or Vegas Valley)\n• Detect if it's Medical or Non-Medical\n• Use the correct standard contract template\n• Generate a follow-up email\n\n*One-pager:* I only create one-pagers if you ask for it!\n• "...with a one-pager" or "also make a one-pager"\n\n*Rates:*\n• Default is 30% if not specified\n• Say "35% and 45%" for standard + legal rate\n\n*Edit existing documents:* Upload a .docx and tell me what to change!\n• "Add 15% fee for pre-collections"\n• "Change rate to 25%"\n• "Update the date to today"\n\n*Need changes?* Just reply in the thread:\n• "Change the rate to 25%"\n• "Actually it's non-medical"\n• "Add a one-pager"`
      });
      return;
    }

    // Check if user uploaded a Word document for editing
    if (event.files && event.files.length > 0) {
      const docFile = event.files.find(f => isWordDocument(f.name));

      if (docFile) {
        // User uploaded a document - they want to edit it
        const editCommand = text.replace(/<@[A-Z0-9]+>/g, '').trim();

        if (!editCommand) {
          await say({
            thread_ts: threadTs,
            text: `:page_facing_up: I see you uploaded *${docFile.name}*. What would you like me to do with it?\n\nExamples:\n• "Add 15% fee for pre-collections"\n• "Change the rate to 25%"\n• "Update the client name to ABC Corp"\n• "Add a termination clause"`
          });
          return;
        }

        await say({
          thread_ts: threadTs,
          text: `:hourglass_flowing_sand: Reading *${docFile.name}* and applying changes...\n• Downloading document\n• Analyzing content\n• Applying: "${editCommand}"`
        });

        try {
          // Download the document (prefer url_private_download if available)
          const downloadUrl = docFile.url_private_download || docFile.url_private;
          console.log(`[Bot] File info:`, JSON.stringify({
            name: docFile.name,
            mimetype: docFile.mimetype,
            size: docFile.size,
            url_private: docFile.url_private ? 'present' : 'missing',
            url_private_download: docFile.url_private_download ? 'present' : 'missing'
          }));

          const docBuffer = await downloadSlackFile(downloadUrl, process.env.SLACK_BOT_TOKEN);
          console.log(`[Bot] Downloaded: ${docFile.name} (${docBuffer.length} bytes)`);

          // Validate the file looks like a DOCX (ZIP files start with "PK" = 0x504B)
          if (docBuffer.length < 4) {
            console.log(`[Bot] File too small: ${docBuffer.length} bytes`);
            throw new Error('Downloaded file is too small. Please re-upload.');
          }

          const signature = docBuffer.slice(0, 4).toString('hex');
          console.log(`[Bot] File signature: ${signature} (expecting 504b0304 for DOCX)`);

          if (docBuffer[0] !== 0x50 || docBuffer[1] !== 0x4B) {
            // Check if it's HTML (download error page)
            const textPreview = docBuffer.slice(0, 100).toString('utf8');
            console.log(`[Bot] File preview: ${textPreview.substring(0, 100)}`);

            if (textPreview.includes('<html') || textPreview.includes('<!DOCTYPE')) {
              throw new Error('Got HTML instead of document. Slack authentication may have failed.');
            }
            throw new Error('File is not a valid DOCX document.');
          }

          // Edit the document
          const result = await editDocument(anthropic, docBuffer, editCommand, docFile.name);

          if (result.success) {
            // Upload the modified document
            const newFilename = docFile.name.replace('.docx', '_edited.docx');

            await client.files.uploadV2({
              channel_id: event.channel,
              thread_ts: threadTs,
              file: result.buffer,
              filename: newFilename,
              title: `Edited: ${docFile.name}`,
              initial_comment: `:white_check_mark: Done! Here's your edited document.\n\n*Changes made:* ${result.message}\n\n:bulb: Need more changes? Upload the document again with your request.`
            });
          } else {
            await say({
              thread_ts: threadTs,
              text: `:warning: I couldn't make those changes: ${result.message}\n\nTry being more specific about what you want to change. For example:\n• "Change 30% to 25%"\n• "Add the text 'Pre-collection fee: 15%' after the rate section"`
            });
          }
        } catch (error) {
          console.error('[Bot] Document edit error:', error);
          await say({
            thread_ts: threadTs,
            text: `:x: Sorry, I had trouble editing that document: ${error.message}\n\nMake sure it's a valid .docx file and try again.`
          });
        }

        return;
      }
    }

    // Check if this is a change request in a thread with existing context
    if (isInThread && isChangeRequest(text)) {
      const existingContext = recall(event.channel, threadTs);

      if (existingContext) {
        console.log(`[Bot] Processing change request for ${existingContext.clientName}`);

        await say({
          thread_ts: threadTs,
          text: `:arrows_counterclockwise: Got it! Making changes to *${existingContext.clientName}*...`
        });

        // Parse the change request
        const updatedData = await parseChangeRequest(anthropic, text, existingContext);

        // Update memory
        update(event.channel, threadTs, updatedData, updatedData.changesSummary || 'User requested changes');

        // Regenerate documents
        await generateDocuments(updatedData, event, client, say);

        return;
      }
    }

    // Check if this is a new client request
    if (isNewClientRequest(text) || !isInThread) {
      // Get any existing context (in case user is adding to their request)
      const existingContext = isInThread ? recall(event.channel, threadTs) : null;

      // Parse the natural language input
      console.log('[Bot] Parsing natural language input...');
      const parsedData = await parseNaturalLanguage(anthropic, text, existingContext);

      console.log('[Bot] Parsed data:', JSON.stringify(parsedData, null, 2));

      // Validate we have at least a client name
      if (!parsedData.clientName) {
        await say({
          thread_ts: threadTs,
          text: `I'd love to help! Just tell me about the client. For example:\n\n"Create a contract for *ABC Medical Center*, contact is *Dr. Smith*, they're a *dental clinic in Wichita* with about *$200K in aging AR*. They're concerned about *HIPAA compliance*."\n\nOr keep it simple:\n"New client Premier Auto Parts for MSB"\n\n📎 Don't forget to attach their logo!`
        });
        return;
      }

      // If this was detected as a change request but no context, treat as new
      if (parsedData.isChangeRequest && parsedData.requestedChanges && existingContext) {
        const updatedData = { ...existingContext, ...parsedData };
        update(event.channel, threadTs, updatedData, parsedData.requestedChanges);
        await generateDocuments(updatedData, event, client, say);
      } else {
        // Generate documents for new client
        const finalData = await generateDocuments(parsedData, event, client, say);

        // Remember this client for the thread
        remember(event.channel, threadTs, finalData);
      }

      return;
    }

    // If we're in a thread with context, assume they want changes
    if (isInThread) {
      const existingContext = recall(event.channel, threadTs);

      if (existingContext) {
        await say({
          thread_ts: threadTs,
          text: `:thinking_face: I see you're talking about *${existingContext.clientName}*. What would you like me to change?\n\nFor example:\n• "Change the rate to 25%"\n• "Make it non-medical"\n• "Update the address to 123 Main St"`
        });
        return;
      }
    }

    // Default help message
    await say({
      thread_ts: threadTs,
      text: `Hey! I can help you create contracts for *Midwest Service Bureau* or *Vegas Valley Collection Service*.\n\nJust tell me about the client naturally:\n• "Create a contract for ABC Medical, contact is Dr. Smith, 35% rate"\n• "New client Premier Auto at 30% and 40% with legal"\n• "Vegas Valley contract for Desert Dental with one-pager"\n\nI use your standard contract templates and auto-detect medical/non-medical!`
    });

  } catch (error) {
    console.error('Error:', error);
    await say({
      thread_ts: event.thread_ts || event.ts,
      text: `:x: Sorry, I ran into an error: ${error.message}\n\nPlease try again or contact support.`
    });
  }
});

// Listen for direct messages
app.message(async ({ message, say }) => {
  if (message.channel_type === 'im') {
    await say(`Hi! I work best in channels where I can share documents with your team.\n\nJust mention me with your client details:\n"@ContractBot create a contract for ABC Medical, contact is Dr. Smith..."`);
  }
});

// Start the app
(async () => {
  await app.start();
  console.log('⚡️ Contract Bot is running!');
  console.log('📄 Template-based contracts: ENABLED');
  console.log('✏️  Document editing: ENABLED (upload .docx + command)');
  console.log('🧠 Natural language mode: ENABLED');
  console.log('💬 Thread memory: ENABLED');
  console.log('🏢 Companies: Midwest Service Bureau, Vegas Valley Collection Service');
  console.log('📋 Templates: 4 standard contracts (MSB/VV × Medical/NonMedical)');
  console.log('Listening for mentions in Slack...');
})();
