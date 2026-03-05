#!/usr/bin/env node
/**
 * One-time test: Full pipeline for the latest contract in #contracts
 * Downloads → Parses → Uploads file to Notion → Creates entry
 *
 * Usage: node test-pipeline.js
 */

require('dotenv').config();

const { ContractDocParser } = require('./src/contractDocParser');
const { NotionIntegration } = require('./src/notionIntegration');
const axios = require('axios');

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const NOTION_KEY = process.env.NOTION_API_KEY;
const CONTRACTS_CHANNEL = process.env.CONTRACT_CHANNEL_ID || 'C08HFEPLJ0K';

async function run() {
  console.log('\n=== CONTRACT PIPELINE TEST ===\n');

  // Step 1: Get latest message with a file from #contracts
  console.log('[1/5] Fetching latest contract from #contracts...');
  const histRes = await axios.get('https://slack.com/api/conversations.history', {
    headers: { 'Authorization': `Bearer ${BOT_TOKEN}` },
    params: { channel: CONTRACTS_CHANNEL, limit: 10 }
  });

  if (!histRes.data.ok) {
    console.error('Slack API error:', histRes.data.error);
    return;
  }

  // Find first message with a supported file
  let targetMsg = null;
  for (const msg of histRes.data.messages) {
    if (msg.files && msg.files.length > 0) {
      const hasSupported = msg.files.some(f => ContractDocParser.isSupportedFile(f.name));
      if (hasSupported) {
        targetMsg = msg;
        break;
      }
    }
  }

  if (!targetMsg) {
    console.error('No contract files found in recent messages');
    return;
  }

  const file = targetMsg.files.find(f => ContractDocParser.isSupportedFile(f.name));
  console.log(`   Found: ${file.name}`);
  console.log(`   Type: ${ContractDocParser.getFileType(file.name)}`);
  console.log(`   Size: ${(file.size / 1024).toFixed(1)} KB`);

  // Step 2: Download + parse with Claude
  console.log('\n[2/5] Downloading and parsing with Claude AI...');
  const docParser = new ContractDocParser(ANTHROPIC_KEY);
  const parseResult = await docParser.parseSignedContract(file, BOT_TOKEN);

  if (!parseResult.clientInfo) {
    console.error('Failed to parse contract — no client info extracted');
    console.log('   contractText length:', parseResult.contractText ? parseResult.contractText.length : 0);
    return;
  }

  const info = parseResult.clientInfo;
  console.log('\n[3/5] Extracted data:');
  console.log(`   Client: ${info.clientName}`);
  console.log(`   Entity: ${info.entity}`);
  console.log(`   Rate: ${info.rate}`);
  console.log(`   Contact: ${info.contactName}`);
  console.log(`   Email: ${info.email}`);
  console.log(`   Phone: ${info.phone}`);
  console.log(`   Address: ${info.address}`);
  console.log(`   Signed: ${info.signedDate}`);
  console.log(`   File buffer: ${parseResult.fileBuffer ? (parseResult.fileBuffer.length / 1024).toFixed(1) + ' KB' : 'NONE'}`);

  // Step 3: Upload to Notion with file
  console.log('\n[4/5] Uploading to Notion Contract Tracker...');
  const notion = new NotionIntegration(NOTION_KEY);

  const fileInfo = {
    fileName: parseResult.fileName,
    fileUrl: parseResult.fileUrl || file.permalink,
    fileBuffer: parseResult.fileBuffer
  };

  info.parsedFromDoc = true;
  const result = await notion.logSignedContract(info, fileInfo);

  if (result) {
    console.log('\n[5/5] SUCCESS!');
    console.log(`   Notion page: https://notion.so/${(result.id || '').replace(/-/g, '')}`);
    console.log(`   File uploaded: ${fileInfo.fileBuffer ? 'YES (via File Upload API)' : 'No (URL only)'}`);
  } else {
    console.log('\n[5/5] FAILED - check errors above');
  }

  console.log('\n=== TEST COMPLETE ===\n');
}

run().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
