/**
 * SignWell E-Signature Integration
 * Uploads a generated contract to SignWell and sends it to the
 * prospect's email for e-signature in a single API call.
 *
 * Docs: https://developers.signwell.com/reference
 * Auth: X-Api-Key header (SIGNWELL_API_KEY env var)
 */

const axios = require('axios');

const SIGNWELL_API_URL = 'https://www.signwell.com/api/v1';

/**
 * Create a SignWell document and send it for signature.
 *
 * @param {Object}  opts
 * @param {Buffer}  opts.contractBuffer  The generated .docx file buffer
 * @param {String}  opts.fileName        e.g. 'MSB_Contract_ClientName.docx'
 * @param {String}  opts.recipientName   Contact/signer name
 * @param {String}  opts.recipientEmail  Contact email (signing link goes here)
 * @param {Object}  opts.companyConfig   MSB or VV company config
 * @param {String} [opts.subject]        Signing email subject (optional)
 * @param {String} [opts.message]        Signing email body (optional)
 * @returns {Promise<Object>} SignWell response: { id, status, recipients[], ... }
 */
async function sendForSignature({
  contractBuffer,
  fileName,
  recipientName,
  recipientEmail,
  companyConfig,
  subject,
  message
}) {
  const apiKey = process.env.SIGNWELL_API_KEY;
  if (!apiKey) {
    throw new Error('SIGNWELL_API_KEY not set');
  }
  if (!recipientEmail) {
    throw new Error('Recipient email is required to send for signature');
  }

  const fileBase64 = contractBuffer.toString('base64');

  const response = await axios.post(
    `${SIGNWELL_API_URL}/documents`,
    {
      name: fileName,
      subject: subject || `Collection Service Agreement - ${companyConfig.shortName}`,
      message: message || 'Please review and sign the attached agreement.',
      draft: false,                // send immediately
      with_signature_page: false,  // client signs IN the document via text-tag fields below
      text_tags: true,             // process {{...}} tags: client signature/name/title/date fields + verified-date
      reminders: true,             // auto-reminders on day 3, 6, 10
      expires_in: 30,
      custom_requester_name: companyConfig.shortName,
      custom_requester_email: companyConfig.email,
      files: [
        {
          name: fileName,
          file_base64: fileBase64
        }
      ],
      recipients: [
        {
          id: 'signer_1',
          name: recipientName || 'Client',
          email: recipientEmail
        }
      ]
    },
    {
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

/**
 * Check the status of a SignWell document.
 * @param {String} documentId
 */
async function getDocumentStatus(documentId) {
  const apiKey = process.env.SIGNWELL_API_KEY;
  if (!apiKey) throw new Error('SIGNWELL_API_KEY not set');

  const response = await axios.get(`${SIGNWELL_API_URL}/documents/${documentId}`, {
    headers: { 'X-Api-Key': apiKey }
  });
  return response.data;
}

module.exports = { sendForSignature, getDocumentStatus };
