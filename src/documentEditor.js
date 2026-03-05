/**
 * Document Editor - Read and edit uploaded DOCX files
 * Actually modifies the document content!
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Read content from a DOCX file
 */
async function readDocxContent(buffer) {
  const tempDir = `/tmp/docread_${Date.now()}`;
  const docxPath = `${tempDir}/input.docx`;

  try {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(docxPath, buffer);
    execSync(`unzip -q "${docxPath}" -d "${tempDir}/unpacked"`);

    const docXmlPath = `${tempDir}/unpacked/word/document.xml`;
    const docXml = fs.readFileSync(docXmlPath, 'utf8');
    const plainText = extractTextFromXml(docXml);

    return {
      xml: docXml,
      text: plainText,
      tempDir,
      unpackedDir: `${tempDir}/unpacked`
    };
  } catch (error) {
    try { execSync(`rm -rf "${tempDir}"`); } catch (e) {}
    throw error;
  }
}

/**
 * Extract plain text from Word XML
 */
function extractTextFromXml(xml) {
  let fullText = '';
  const parts = xml.split(/<w:p[^>]*>/);

  for (const part of parts) {
    const texts = part.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    if (texts.length > 0) {
      const paragraphText = texts
        .map(t => t.replace(/<w:t[^>]*>([^<]*)<\/w:t>/, '$1'))
        .join('');
      if (paragraphText.trim()) {
        fullText += paragraphText + '\n';
      }
    }
  }
  return fullText.trim();
}

/**
 * Apply edits to a document using AI
 */
async function editDocument(anthropic, buffer, editRequest, originalFilename) {
  const docContent = await readDocxContent(buffer);

  try {
    // Step 1: Ask AI what specific text changes to make
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `You are editing a Word document. Analyze the document and provide EXACT text replacements.

DOCUMENT TEXT:
---
${docContent.text}
---

USER REQUEST: ${editRequest}

IMPORTANT: You must provide EXACT text that exists in the document to find, and the EXACT new text to replace it with.

For adding new content (like "add 15% fee for pre-collections"):
- Find a relevant existing line (like a fee or rate line)
- Replace it with that line PLUS the new content

Return JSON with this format:
{
  "changes": [
    {
      "find": "EXACT text from document to find (copy exactly, including punctuation)",
      "replace": "New text to put in its place (include original if adding to it)"
    }
  ],
  "summary": "What was changed"
}

EXAMPLE - If document has "Contingency Fee: 30%" and user wants to add 15% pre-collection fee:
{
  "changes": [
    {
      "find": "Contingency Fee: 30%",
      "replace": "Pre-Collection Fee: 15%\\nContingency Fee: 30%"
    }
  ],
  "summary": "Added 15% pre-collection fee before the 30% contingency fee"
}

Return ONLY valid JSON, nothing else.`
      }]
    });

    const jsonStr = response.content[0].text.trim();
    const match = jsonStr.match(/\{[\s\S]*\}/);
    const edits = JSON.parse(match ? match[0] : jsonStr);

    if (!edits.changes || edits.changes.length === 0) {
      try { execSync(`rm -rf "${docContent.tempDir}"`); } catch (e) {}
      return {
        success: false,
        message: edits.summary || 'Could not determine what changes to make.',
        buffer: null
      };
    }

    // Step 2: Read and modify the document XML
    const docXmlPath = `${docContent.unpackedDir}/word/document.xml`;
    let docXml = fs.readFileSync(docXmlPath, 'utf8');
    let changesMade = 0;

    for (const change of edits.changes) {
      if (!change.find || !change.replace) continue;

      const findText = change.find.trim();
      const replaceText = change.replace.trim();

      console.log(`[DocEdit] Looking for: "${findText.substring(0, 50)}..."`);

      // Method 1: Direct text replacement in <w:t> tags
      // Build a regex that matches the text even if split across tags
      const escapedFind = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Try to find and replace in the plain text portions
      if (docXml.includes(findText)) {
        docXml = docXml.split(findText).join(replaceText);
        console.log(`[DocEdit] Direct replacement successful`);
        changesMade++;
        continue;
      }

      // Method 2: Find the text across w:t tags and rebuild
      // Extract the text content, find position, and insert
      const textPattern = findText.split('').map(c => {
        const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escaped;
      }).join('[^<]*(?:<[^>]+>[^<]*)*');

      const flexRegex = new RegExp(textPattern, 'i');
      if (flexRegex.test(docXml)) {
        // Found it with flexible matching - do a simpler replacement
        // Find the paragraph containing this text and modify it
        const paragraphs = docXml.split('</w:p>');

        for (let i = 0; i < paragraphs.length; i++) {
          const paraText = extractTextFromXml(paragraphs[i] + '</w:p>');
          if (paraText.toLowerCase().includes(findText.toLowerCase())) {
            // Found the paragraph - now we need to modify it
            // Create new paragraph with the replacement text
            const newParagraph = createParagraphXml(replaceText);

            // Replace the old paragraph with new content
            const oldPara = paragraphs[i] + '</w:p>';
            const newContent = newParagraph;
            docXml = docXml.replace(oldPara, newContent);
            console.log(`[DocEdit] Paragraph replacement successful`);
            changesMade++;
            break;
          }
        }
        continue;
      }

      // Method 3: If we can't find exact text, try to add after a section header
      const sectionKeywords = ['fee', 'rate', 'compensation', 'payment', 'collection'];
      for (const keyword of sectionKeywords) {
        if (editRequest.toLowerCase().includes(keyword)) {
          // Find a paragraph containing this keyword
          const paragraphs = docXml.split('</w:p>');
          for (let i = 0; i < paragraphs.length; i++) {
            const paraText = extractTextFromXml(paragraphs[i] + '</w:p>');
            if (paraText.toLowerCase().includes(keyword) && paraText.includes('%')) {
              // Insert new paragraph after this one
              const newParagraph = createParagraphXml(replaceText);
              paragraphs[i] = paragraphs[i] + '</w:p>' + newParagraph;
              docXml = paragraphs.join('</w:p>');
              console.log(`[DocEdit] Added after "${keyword}" section`);
              changesMade++;
              break;
            }
          }
          if (changesMade > 0) break;
        }
      }
    }

    if (changesMade === 0) {
      // Last resort: Just add the new content at the end of the document
      console.log(`[DocEdit] No exact match found, adding content near fee section...`);

      // Find where fees/rates are mentioned and add there
      const paragraphs = docXml.split('</w:p>');
      let insertIndex = -1;

      for (let i = 0; i < paragraphs.length; i++) {
        const paraText = extractTextFromXml(paragraphs[i] + '</w:p>');
        if (paraText.includes('%') && (paraText.toLowerCase().includes('fee') || paraText.toLowerCase().includes('rate'))) {
          insertIndex = i;
          break;
        }
      }

      if (insertIndex >= 0) {
        // Create the new content paragraph
        const newContent = edits.changes[0]?.replace || `Pre-Collection Fee: 15% of amounts collected during pre-collection period`;
        const newParagraph = createParagraphXml(newContent);
        paragraphs.splice(insertIndex + 1, 0, newParagraph.replace('</w:p>', ''));
        docXml = paragraphs.join('</w:p>');
        changesMade++;
        console.log(`[DocEdit] Inserted new paragraph after fee section`);
      }
    }

    // Save modified document
    fs.writeFileSync(docXmlPath, docXml);

    // Repack the docx
    const outputPath = `${docContent.tempDir}/output.docx`;
    const currentDir = process.cwd();
    process.chdir(docContent.unpackedDir);
    execSync(`zip -q -r "${outputPath}" .`);
    process.chdir(currentDir);

    const outputBuffer = fs.readFileSync(outputPath);

    try { execSync(`rm -rf "${docContent.tempDir}"`); } catch (e) {}

    return {
      success: changesMade > 0,
      message: changesMade > 0 ? edits.summary : 'Could not find where to make changes.',
      buffer: outputBuffer,
      changes: edits.changes
    };

  } catch (error) {
    console.error('[DocEdit] Error:', error);
    try { execSync(`rm -rf "${docContent.tempDir}"`); } catch (e) {}
    throw error;
  }
}

/**
 * Create a new paragraph XML element with the given text
 */
function createParagraphXml(text) {
  // Handle newlines by creating multiple paragraphs
  const lines = text.split(/\\n|\n/);
  let result = '';

  for (const line of lines) {
    if (line.trim()) {
      const escapedText = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      result += `<w:p><w:pPr><w:spacing w:after="100"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${escapedText}</w:t></w:r></w:p>`;
    }
  }

  return result;
}

/**
 * Check if a file is a Word document
 */
function isWordDocument(filename) {
  if (!filename) return false;
  const ext = path.extname(filename).toLowerCase();
  return ext === '.docx' || ext === '.doc';
}

module.exports = {
  readDocxContent,
  editDocument,
  extractTextFromXml,
  isWordDocument
};
