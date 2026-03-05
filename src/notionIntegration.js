/**
 * Notion Integration Module
 *
 * Logs signed contracts to the Contract Tracker database.
 * Triggered when signed contracts are detected in #contracts channel.
 *
 * Properties logged:
 *   - Name (client name)
 *   - Company (MSB, Vegas Valley, ARR, ICS)
 *   - Terms Percentage (rate)
 *   - Start Date (signed date)
 *   - Status (Active)
 *   - Contract Type (Client)
 *   - Type (Client)
 *   - Contract File (uploaded document via Notion File Upload API)
 *   - Notes (contact info, address, etc.)
 */

const { Client } = require('@notionhq/client');
const axios = require('axios');
const FormData = require('form-data');

// Contract Tracker database ID (from Notion URL)
const CONTRACT_TRACKER_DB = '1ff87395-7d95-806d-aed6-da59e59ebd79';

// Notion API version that supports file uploads
const NOTION_API_VERSION = '2025-09-03';

class NotionIntegration {
  constructor(apiKey) {
    if (!apiKey) {
      console.warn('[Notion] No API key provided, Notion integration disabled');
      this.client = null;
      this.apiKey = null;
      return;
    }

    this.apiKey = apiKey;
    this.client = new Client({ auth: apiKey });
    console.log('[Notion] Integration initialized (Contract Tracker + File Upload)');
  }

  /**
   * Make a direct Notion API call with the latest API version header.
   * Required for file_upload support (not yet in the JS SDK).
   */
  async notionApiRequest(method, endpoint, data = null, isFormData = false) {
    const url = `https://api.notion.com/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Notion-Version': NOTION_API_VERSION
    };

    if (isFormData && data && typeof data.getHeaders === 'function') {
      // Merge FormData headers (includes Content-Type with boundary)
      Object.assign(headers, data.getHeaders());
    } else {
      headers['Content-Type'] = 'application/json';
    }

    const config = { method, url, headers };
    if (data) config.data = data;

    return await axios(config);
  }

  /**
   * Get MIME content type from filename
   */
  static getContentType(fileName) {
    const name = (fileName || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'application/pdf';
    if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (name.endsWith('.doc')) return 'application/msword';
    return 'application/octet-stream';
  }

  /**
   * Upload a file buffer to Notion using the File Upload API.
   *
   * Two-step process:
   *   1. POST /v1/file_uploads — create a pending upload
   *   2. POST /v1/file_uploads/{id}/send — send binary data
   *
   * @param {Buffer} fileBuffer - The file content as a Buffer
   * @param {string} fileName - The filename (e.g., "contract.pdf")
   * @returns {string|null} The file_upload ID to use in page properties, or null on failure
   */
  async uploadFileToNotion(fileBuffer, fileName) {
    if (!this.apiKey || !fileBuffer) return null;

    try {
      const contentType = NotionIntegration.getContentType(fileName);

      // Step 1: Create file upload object
      console.log(`[Notion] Creating file upload for: ${fileName} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
      const createRes = await this.notionApiRequest('POST', '/file_uploads', {
        filename: fileName,
        content_type: contentType
      });

      const fileUploadId = createRes.data.id;
      console.log(`[Notion] File upload created: ${fileUploadId}`);

      // Step 2: Send file content as multipart/form-data
      const form = new FormData();
      form.append('file', fileBuffer, {
        filename: fileName,
        contentType: contentType
      });

      await this.notionApiRequest('POST', `/file_uploads/${fileUploadId}/send`, form, true);

      console.log(`[Notion] ✅ File uploaded to Notion: ${fileName}`);
      return fileUploadId;

    } catch (error) {
      console.error(`[Notion] ❌ File upload failed: ${error.message}`);
      if (error.response) {
        console.error(`[Notion]    Status: ${error.response.status}, Data:`, JSON.stringify(error.response.data || {}).substring(0, 200));
      }
      return null;
    }
  }

  /**
   * Build the Contract File property for Notion.
   * Uses file_upload type if we have an uploaded file ID,
   * falls back to external URL otherwise.
   */
  buildFileProperty(fileInfo, fileUploadId) {
    if (fileUploadId) {
      return {
        files: [{
          type: 'file_upload',
          file_upload: { id: fileUploadId },
          name: fileInfo.fileName || 'contract'
        }]
      };
    }

    if (fileInfo && fileInfo.fileUrl) {
      return {
        files: [{
          type: 'external',
          name: fileInfo.fileName || 'contract',
          external: { url: fileInfo.fileUrl }
        }]
      };
    }

    return null;
  }

  /**
   * Map entity name to Notion Company select value
   */
  mapEntityToCompany(entity) {
    const entityMap = {
      'msb': 'MSB',
      'midwest service bureau': 'MSB',
      'vegas valley': 'Vegas Valley',
      'vvcs': 'Vegas Valley',
      'vegas valley collection service': 'Vegas Valley',
      'arr': 'ARR',
      'ics': 'ICS',
      'arfs': 'Account Recovery Financial Solutions'
    };

    const normalized = (entity || '').toLowerCase();
    return entityMap[normalized] || 'MSB';
  }

  /**
   * Check if a contract entry already exists for this client
   */
  async findExistingEntry(clientName) {
    if (!this.client || !clientName) return null;

    try {
      const response = await this.client.databases.query({
        database_id: CONTRACT_TRACKER_DB,
        filter: {
          property: 'Name',
          title: {
            contains: clientName
          }
        }
      });

      return response.results.length > 0 ? response.results[0] : null;
    } catch (error) {
      console.error('[Notion] Error searching for existing entry:', error.message);
      return null;
    }
  }

  /**
   * Log a signed contract to the Contract Tracker database.
   * If a file buffer is provided, uploads the actual document to Notion.
   *
   * @param {Object} clientInfo - Extracted client information
   * @param {string} clientInfo.clientName - Client/company name
   * @param {string} clientInfo.entity - Company entity (MSB, Vegas Valley, etc.)
   * @param {string} clientInfo.rate - Terms percentage
   * @param {string} clientInfo.signedDate - Date signed (YYYY-MM-DD)
   * @param {string} [clientInfo.contactName] - Contact person name
   * @param {string} [clientInfo.email] - Contact email
   * @param {string} [clientInfo.phone] - Contact phone
   * @param {string} [clientInfo.address] - Client address
   * @param {string} [clientInfo.website] - Client website
   * @param {Object} [fileInfo] - Optional file attachment info
   * @param {string} [fileInfo.fileName] - File name
   * @param {string} [fileInfo.fileUrl] - Slack permalink URL (fallback)
   * @param {Buffer} [fileInfo.fileBuffer] - Actual file content for Notion upload
   */
  async logSignedContract(clientInfo, fileInfo = null) {
    if (!this.client) {
      console.warn('[Notion] Client not initialized, skipping');
      return null;
    }

    if (!clientInfo.clientName) {
      console.warn('[Notion] No client name provided, skipping');
      return null;
    }

    try {
      // Check for duplicate
      const existing = await this.findExistingEntry(clientInfo.clientName);
      if (existing) {
        console.log(`[Notion] Entry already exists for "${clientInfo.clientName}", updating...`);
        return await this.updateExistingEntry(existing.id, clientInfo, fileInfo);
      }

      // Step 1: Upload file to Notion if we have the buffer
      let fileUploadId = null;
      if (fileInfo && fileInfo.fileBuffer) {
        fileUploadId = await this.uploadFileToNotion(fileInfo.fileBuffer, fileInfo.fileName);
      }

      // Step 2: Build properties
      const properties = {
        'Name': {
          title: [{ text: { content: clientInfo.clientName } }]
        },
        'Company': {
          select: { name: this.mapEntityToCompany(clientInfo.entity) }
        },
        'Status': {
          status: { name: 'Active' }
        },
        'Contract Type': {
          select: { name: 'Client' }
        },
        'Type': {
          select: { name: 'Client' }
        }
      };

      // Add rate
      if (clientInfo.rate) {
        properties['Terms Percentage'] = {
          rich_text: [{ text: { content: clientInfo.rate } }]
        };
      }

      // Add signed date
      if (clientInfo.signedDate) {
        properties['Start Date'] = {
          date: { start: clientInfo.signedDate }
        };
      }

      // Add contract file (uploaded to Notion, or external URL fallback)
      const fileProp = this.buildFileProperty(fileInfo, fileUploadId);
      if (fileProp) {
        properties['Contract File'] = fileProp;
        console.log(`[Notion] Attaching file: ${fileInfo.fileName} (${fileUploadId ? 'uploaded' : 'external URL'})`);
      }

      // Build notes from additional info
      const notesParts = [];
      if (clientInfo.contactName) notesParts.push(`Contact: ${clientInfo.contactName}`);
      if (clientInfo.email) notesParts.push(`Email: ${clientInfo.email}`);
      if (clientInfo.phone) notesParts.push(`Phone: ${clientInfo.phone}`);
      if (clientInfo.address) notesParts.push(`Address: ${clientInfo.address}`);
      if (clientInfo.website) notesParts.push(`Website: ${clientInfo.website}`);
      if (clientInfo.parsedFromDoc) notesParts.push('📄 Data extracted from signed contract document');
      notesParts.push(`Logged: ${new Date().toISOString().split('T')[0]}`);

      properties['Notes'] = {
        rich_text: [{ text: { content: notesParts.join('\n') } }]
      };

      // Step 3: Create the entry
      // Use direct API call (not SDK) when file_upload type is used,
      // because the JS SDK doesn't support the 2025-09-03 API version yet
      let response;
      if (fileUploadId) {
        const apiRes = await this.notionApiRequest('POST', '/pages', {
          parent: { database_id: CONTRACT_TRACKER_DB },
          properties
        });
        response = apiRes.data;
      } else {
        response = await this.client.pages.create({
          parent: { database_id: CONTRACT_TRACKER_DB },
          properties
        });
      }

      console.log(`[Notion] ✅ Logged signed contract for "${clientInfo.clientName}" to Contract Tracker`);
      return response;

    } catch (error) {
      console.error(`[Notion] ❌ Error logging contract for "${clientInfo.clientName}":`, error.message);
      if (error.response) {
        console.error(`[Notion]    Status: ${error.response.status}`);
      }
      return null;
    }
  }

  /**
   * Update an existing Contract Tracker entry with new info
   */
  async updateExistingEntry(pageId, clientInfo, fileInfo = null) {
    if (!this.client) return null;

    try {
      // Upload file if buffer is available
      let fileUploadId = null;
      if (fileInfo && fileInfo.fileBuffer) {
        fileUploadId = await this.uploadFileToNotion(fileInfo.fileBuffer, fileInfo.fileName);
      }

      const properties = {
        'Status': {
          status: { name: 'Active' }
        }
      };

      if (clientInfo.rate) {
        properties['Terms Percentage'] = {
          rich_text: [{ text: { content: clientInfo.rate } }]
        };
      }

      if (clientInfo.signedDate) {
        properties['Start Date'] = {
          date: { start: clientInfo.signedDate }
        };
      }

      // Attach file (uploaded to Notion, or external URL fallback)
      const fileProp = this.buildFileProperty(fileInfo, fileUploadId);
      if (fileProp) {
        properties['Contract File'] = fileProp;
      }

      // Use direct API when file_upload type is used
      let response;
      if (fileUploadId) {
        const apiRes = await this.notionApiRequest('PATCH', `/pages/${pageId}`, {
          properties
        });
        response = apiRes.data;
      } else {
        response = await this.client.pages.update({
          page_id: pageId,
          properties
        });
      }

      console.log(`[Notion] ✅ Updated existing entry for "${clientInfo.clientName}"`);
      return response;

    } catch (error) {
      console.error(`[Notion] ❌ Error updating entry for "${clientInfo.clientName}":`, error.message);
      return null;
    }
  }
}

module.exports = {
  NotionIntegration,
  CONTRACT_TRACKER_DB
};
