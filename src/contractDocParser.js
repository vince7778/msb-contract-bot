/**
 * Contract Document Parser
 *
 * Downloads signed contracts (.docx or .pdf) from Slack, extracts the text,
 * and uses Claude AI to parse out structured data (client name, rate, date, etc.)
 *
 * Supported formats: .docx, .doc, .pdf
 */

const mammoth = require('mammoth');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

// Lazy-load pdf-parse to avoid startup crashes if the package has issues
let pdfParse = null;
try {
  pdfParse = require('pdf-parse');
} catch (err) {
  console.warn(`[DocParser] pdf-parse not available: ${err.message}. PDF parsing disabled.`);
}

// Supported file extensions
const SUPPORTED_EXTENSIONS = ['.docx', '.doc', '.pdf'];

class ContractDocParser {
  constructor(anthropicKey) {
    if (!anthropicKey) {
      console.warn('[DocParser] No Anthropic API key, document parsing disabled');
      this.anthropic = null;
      return;
    }
    this.anthropic = new Anthropic({ apiKey: anthropicKey });
    console.log('[DocParser] Contract document parser initialized (supports .docx, .doc, .pdf)');
  }

  /**
   * Check if a file is a supported contract document
   */
  static isSupportedFile(filename) {
    const name = (filename || '').toLowerCase();
    return SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
  }

  /**
   * Get the file type from filename
   */
  static getFileType(filename) {
    const name = (filename || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.docx') || name.endsWith('.doc')) return 'docx';
    return null;
  }

  /**
   * Download a file from Slack using the bot token
   */
  async downloadFromSlack(fileUrl, botToken) {
    try {
      console.log('[DocParser] Downloading file from Slack...');

      const response = await axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'arraybuffer',
        maxRedirects: 10,
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'User-Agent': 'ContractBot/1.0'
        }
      });

      const buffer = Buffer.from(response.data);

      // Check if we got HTML instead (auth redirect)
      const preview = buffer.slice(0, 100).toString('utf8');
      if (preview.includes('<!DOCTYPE') || preview.includes('<html')) {
        console.warn('[DocParser] Got HTML instead of file — trying token param method');

        // Fallback: token as query parameter
        const urlWithToken = fileUrl.includes('?')
          ? `${fileUrl}&token=${botToken}`
          : `${fileUrl}?token=${botToken}`;

        const retryResponse = await axios({
          method: 'GET',
          url: urlWithToken,
          responseType: 'arraybuffer',
          maxRedirects: 10,
          timeout: 30000
        });

        const retryBuffer = Buffer.from(retryResponse.data);
        console.log(`[DocParser] Retry got ${retryBuffer.length} bytes`);
        return retryBuffer;
      }

      console.log(`[DocParser] Downloaded ${buffer.length} bytes`);
      return buffer;

    } catch (error) {
      console.error(`[DocParser] Download failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract plain text from a .docx buffer using mammoth
   */
  async extractTextFromDocx(buffer) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim();
      console.log(`[DocParser] Extracted ${text.length} chars from .docx`);
      return text;
    } catch (error) {
      console.error(`[DocParser] DOCX extraction failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract plain text from a PDF buffer using pdf-parse
   */
  async extractTextFromPdf(buffer) {
    if (!pdfParse) {
      console.error('[DocParser] pdf-parse not available — cannot extract PDF text');
      return null;
    }
    try {
      const result = await pdfParse(buffer);
      const text = (result.text || '').trim();
      console.log(`[DocParser] Extracted ${text.length} chars from PDF (${result.numpages} pages)`);
      return text;
    } catch (error) {
      console.error(`[DocParser] PDF extraction failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract text from a file buffer based on type
   */
  async extractText(buffer, fileType) {
    if (fileType === 'pdf') {
      return await this.extractTextFromPdf(buffer);
    } else if (fileType === 'docx') {
      return await this.extractTextFromDocx(buffer);
    }
    console.warn(`[DocParser] Unsupported file type: ${fileType}`);
    return null;
  }

  /**
   * Use Claude AI to parse structured data from contract text
   */
  async parseContractWithClaude(contractText) {
    if (!this.anthropic) {
      console.warn('[DocParser] Claude not available, skipping AI parsing');
      return null;
    }

    try {
      console.log('[DocParser] Sending contract text to Claude for parsing...');

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You are extracting information from a signed collection agency contract. Analyze the contract text below and return ONLY a valid JSON object with these fields. Use null for any field you cannot find.

{
  "clientName": "the client/company name (the party hiring the collection agency — NOT the collection agency itself)",
  "contactName": "the primary contact/signer name for the client",
  "email": "client contact email address",
  "phone": "client contact phone number",
  "entity": "which collection agency entity is providing service — return 'MSB' if Midwest Service Bureau, 'Vegas Valley' if Vegas Valley Collection Service, 'ARR' if Account Recovery Resources, 'ICS' if International Collection Service",
  "rate": "the commission/contingency rate as a percentage string (e.g. '30%' or '35% and 45% with legal'). Look for terms like 'contingency fee', 'commission rate', 'percentage', etc.",
  "address": "client's mailing/business address",
  "website": "client's website URL",
  "signedDate": "date the contract was signed/executed in YYYY-MM-DD format. Look for signature dates, effective dates, or execution dates."
}

IMPORTANT:
- The CLIENT is the company hiring the collection agency, NOT the collection agency (MSB/Vegas Valley/etc.)
- If there are multiple rates (e.g. standard and legal), combine them like "30% and 45% with legal"
- Return ONLY the JSON object, no explanation

Contract text:
${contractText.substring(0, 10000)}`
        }]
      });

      const content = response.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`[DocParser] Claude extracted: ${parsed.clientName || 'unknown client'}, rate: ${parsed.rate || 'unknown'}, entity: ${parsed.entity || 'unknown'}`);
        return parsed;
      }

      console.warn('[DocParser] Could not find JSON in Claude response');
      return null;

    } catch (error) {
      console.error(`[DocParser] Claude parsing failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Full pipeline: download file from Slack → extract text → parse with Claude
   *
   * @param {Object} file - Slack file object from message
   * @param {string} botToken - Slack bot token for downloading
   * @returns {Object} { clientInfo, contractText, fileBuffer, fileName, fileUrl }
   */
  async parseSignedContract(file, botToken) {
    const result = {
      clientInfo: null,
      contractText: null,
      fileBuffer: null,
      fileName: file.name || 'contract',
      fileUrl: file.permalink || file.url_private || null
    };

    // Check if file type is supported
    if (!ContractDocParser.isSupportedFile(file.name)) {
      console.log(`[DocParser] Skipping unsupported file: ${file.name}`);
      return result;
    }

    const fileType = ContractDocParser.getFileType(file.name);
    console.log(`[DocParser] Processing ${fileType.toUpperCase()} file: ${file.name}`);

    // Step 1: Download
    const downloadUrl = file.url_private_download || file.url_private;
    if (!downloadUrl) {
      console.warn('[DocParser] No download URL available for file');
      return result;
    }

    const buffer = await this.downloadFromSlack(downloadUrl, botToken);
    if (!buffer) return result;
    result.fileBuffer = buffer;

    // Step 2: Extract text based on file type
    const text = await this.extractText(buffer, fileType);
    if (!text) return result;
    result.contractText = text;

    // Step 3: Parse with Claude
    const parsed = await this.parseContractWithClaude(text);
    if (parsed) {
      result.clientInfo = {
        clientName: parsed.clientName || null,
        contactName: parsed.contactName || null,
        email: parsed.email || null,
        phone: parsed.phone || null,
        entity: parsed.entity || 'MSB',
        rate: parsed.rate || null,
        address: parsed.address || null,
        website: parsed.website || null,
        signedDate: parsed.signedDate || new Date().toISOString().split('T')[0]
      };
    }

    return result;
  }
}

module.exports = { ContractDocParser, SUPPORTED_EXTENSIONS };
