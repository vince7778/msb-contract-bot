/**
 * DOCX -> PDF Converter
 * Uses LibreOffice (headless) to convert generated .docx buffers to PDF.
 * LibreOffice is installed in the Railway image via the Dockerfile.
 *
 * If LibreOffice is missing or conversion fails, callers should fall
 * back to sending the original .docx (see usage in index.js).
 */

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONVERT_TIMEOUT_MS = 60_000;

/**
 * Convert a .docx buffer to a PDF buffer.
 * @param {Buffer} docxBuffer
 * @returns {Promise<Buffer>} PDF buffer
 * @throws if LibreOffice is unavailable or conversion fails/times out
 */
async function convertDocxToPdf(docxBuffer) {
  // Unique temp workspace per conversion (avoids clashes between
  // concurrent contract requests)
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'onepager-'));
  const docxPath = path.join(workDir, 'document.docx');
  const pdfPath = path.join(workDir, 'document.pdf');

  try {
    await fs.promises.writeFile(docxPath, docxBuffer);

    await new Promise((resolve, reject) => {
      execFile(
        'soffice',
        ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', workDir, docxPath],
        {
          timeout: CONVERT_TIMEOUT_MS,
          // LibreOffice needs a writable HOME for its profile
          env: { ...process.env, HOME: workDir }
        },
        (err, stdout, stderr) => {
          if (err) return reject(new Error(`LibreOffice failed: ${err.message} ${stderr || ''}`));
          resolve();
        }
      );
    });

    if (!fs.existsSync(pdfPath)) {
      throw new Error('LibreOffice reported success but no PDF was produced');
    }
    return await fs.promises.readFile(pdfPath);
  } finally {
    // Clean up temp files
    fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { convertDocxToPdf };
