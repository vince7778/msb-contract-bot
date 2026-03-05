/**
 * Contract Generator - Uses Standard Templates
 * Fills in client info into the official contract templates
 *
 * Templates (4 base templates, legal variants use the same base):
 *   MSB_Medical.docx        - MSB medical (includes HIPAA/BAA)
 *   MSB_NonMedical.docx     - MSB non-medical
 *   VV_Medical.docx         - Vegas Valley medical (includes HIPAA/BAA)
 *   VV_NonMedical.docx      - Vegas Valley non-medical
 *
 * Placeholder patterns in templates:
 *   Medical:     [CLIENT], [Address], [DATE], 30%
 *   Non-Medical: [CLIENT NAME] (split across runs), [Client Address] (split across runs), [DATE], 30%
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { COMPANIES } = require('./companyConfig');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

/**
 * Get the correct template based on company and medical status
 * Legal rate is handled dynamically (no separate legal templates needed)
 */
function getTemplatePath(company, isMedical) {
  const isVegas = company.id === 'vegasvalley';

  if (isVegas) {
    return isMedical
      ? path.join(TEMPLATES_DIR, 'VV_Medical.docx')
      : path.join(TEMPLATES_DIR, 'VV_NonMedical.docx');
  } else {
    return isMedical
      ? path.join(TEMPLATES_DIR, 'MSB_Medical.docx')
      : path.join(TEMPLATES_DIR, 'MSB_NonMedical.docx');
  }
}

/**
 * Generate contract by filling in template
 */
async function generateContract(clientData) {
  const company = clientData.company || clientData.companyConfig || COMPANIES.msb;
  const isMedical = clientData.isMedical || false;
  const hasLegalRate = clientData.hasLegalRate || false;

  // Get template path (legal rate is handled dynamically, not via separate template)
  const templatePath = getTemplatePath(company, isMedical);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  // Create temp directory for unpacking
  const tempDir = `/tmp/contract_${Date.now()}`;
  const unpackedDir = `${tempDir}/unpacked`;
  const outputPath = `${tempDir}/output.docx`;

  try {
    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });

    // Unpack the template
    execSync(`unzip -q "${templatePath}" -d "${unpackedDir}"`);

    // Read document.xml
    const docXmlPath = `${unpackedDir}/word/document.xml`;
    let docXml = fs.readFileSync(docXmlPath, 'utf8');

    // Prepare replacement values
    const today = clientData.contractDate || new Date().toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });

    const clientName = cleanText(clientData.clientName || '[CLIENT NAME]');
    const clientAddress = cleanText(clientData.address || '[Client Address]');
    const rate = clientData.rate || 30;
    const legalRate = clientData.legalRate || (rate + 10);

    // ============================================================
    // STEP 1: Handle split-run placeholders (Non-Medical templates)
    // In non-medical templates, [CLIENT NAME] is split across
    // multiple XML runs: <w:t>[CLIENT</w:t> ... <w:t>NAME]</w:t>
    // Same for [Client Address] split as [Client ... Address]
    // We collapse these into a single run with the replacement value
    // ============================================================
    docXml = replaceMultiRunPlaceholder(docXml, ['[CLIENT', 'NAME]'], clientName);
    docXml = replaceMultiRunPlaceholder(docXml, ['[Client', 'Address]'], clientAddress);

    // ============================================================
    // STEP 2: Handle single-run placeholders (Medical templates)
    // These are clean single-run placeholders
    // ============================================================

    // Date placeholders
    docXml = replaceInXml(docXml, '[DATE]', today);
    docXml = replaceInXml(docXml, 'mm/dd/yyyy', today);
    docXml = replaceInXml(docXml, 'MM/DD/YYYY', today);

    // Client name - single-run variants (medical templates use [CLIENT])
    docXml = replaceInXml(docXml, '[CLIENT]', clientName);
    docXml = replaceInXml(docXml, '(CLIENT)', clientName);
    docXml = replaceInXml(docXml, '[CLIENT NAME]', clientName);
    docXml = replaceInXml(docXml, '[Client Name]', clientName);

    // Address - single-run variants (medical templates use [Address])
    docXml = replaceInXml(docXml, '[Address]', clientAddress);
    docXml = replaceInXml(docXml, '[Client Address]', clientAddress);
    docXml = replaceInXml(docXml, '[ADDRESS]', clientAddress);

    // ============================================================
    // STEP 3: Rate replacement
    // Templates have "30%" as the default rate text
    // We replace the standalone 30% in a <w:t> with the user's rate
    // ============================================================
    docXml = docXml.replace(/<w:t>30%<\/w:t>/g, `<w:t>${rate}%</w:t>`);

    // Also catch any other rate-context patterns (e.g. "30% of all amounts")
    docXml = docXml.replace(/(\d{2})%(?=[^<]*(?:collected|collection|contingency|rate|amounts))/gi, `${rate}%`);

    // ============================================================
    // STEP 4: Legal/Litigation Rate insertion
    // When user specifies a legal rate, insert a new bullet point
    // right after the "Standard Rate" paragraph in the contract.
    // The new line reads: "Litigation Rate: XX% of all amounts
    // successfully collected"
    // ============================================================
    if (hasLegalRate && legalRate) {
      docXml = insertLegalRateParagraph(docXml, legalRate);
    }

    // Save modified document.xml
    fs.writeFileSync(docXmlPath, docXml);

    // Repack the docx
    const currentDir = process.cwd();
    process.chdir(unpackedDir);
    execSync(`zip -q -r "${outputPath}" .`);
    process.chdir(currentDir);

    // Read the output file
    const buffer = fs.readFileSync(outputPath);

    // Determine contract type for response
    let contractType;
    if (isMedical) {
      contractType = hasLegalRate ? 'Medical (with BAA + Legal Rate)' : 'Medical (with BAA)';
    } else {
      contractType = hasLegalRate ? 'Non-Medical (with Legal Rate)' : 'Non-Medical';
    }

    return {
      buffer,
      contractType,
      company: company.shortName,
      rate,
      legalRate: hasLegalRate ? legalRate : null
    };

  } finally {
    // Cleanup temp directory
    try {
      execSync(`rm -rf "${tempDir}"`);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Insert a "Litigation Rate" paragraph after the "Standard Rate" paragraph.
 * Finds the paragraph containing "Standard" and "Rate:" text, then inserts
 * a new paragraph right after it with matching formatting.
 *
 * @param {string} xml - The document XML
 * @param {number} legalRate - The litigation rate percentage
 * @returns {string} - Modified XML with legal rate paragraph inserted
 */
function insertLegalRateParagraph(xml, legalRate) {
  // Find the paragraph that contains "Standard" and "Rate:" (the standard rate line)
  // We look for the text "Standard" followed by "Rate:" within the same paragraph
  const standardIdx = xml.indexOf('>Standard</w:t>');
  if (standardIdx === -1) return xml;

  // Verify "Rate:" appears nearby (within same paragraph)
  const rateIdx = xml.indexOf('>Rate:</w:t>', standardIdx);
  if (rateIdx === -1 || rateIdx - standardIdx > 500) return xml;

  // Find the end of this paragraph
  const paraEnd = xml.indexOf('</w:p>', rateIdx);
  if (paraEnd === -1) return xml;
  const insertPoint = paraEnd + '</w:p>'.length;

  // Find the start of this paragraph to extract its formatting (pPr)
  const paraStart = xml.lastIndexOf('<w:p>', standardIdx);
  if (paraStart === -1) return xml;

  const fullPara = xml.substring(paraStart, insertPoint);

  // Extract the paragraph properties (pPr) to match formatting
  let pPr = '';
  const pPrStart = fullPara.indexOf('<w:pPr>');
  const pPrEnd = fullPara.indexOf('</w:pPr>');
  if (pPrStart !== -1 && pPrEnd !== -1) {
    pPr = fullPara.substring(pPrStart, pPrEnd + '</w:pPr>'.length);
  }

  // Build the litigation rate paragraph with matching bullet/indent formatting
  // Using xml:space="preserve" to keep the spaces in the text
  const legalRatePara = `<w:p>${pPr}<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">Litigation Rate: ${legalRate}% of all amounts successfully collected</w:t></w:r></w:p>`;

  // Insert after the Standard Rate paragraph
  return xml.substring(0, insertPoint) + legalRatePara + xml.substring(insertPoint);
}

/**
 * Replace a placeholder that is split across multiple XML text runs.
 *
 * In DOCX XML, Word often splits text across multiple <w:r> elements.
 * For example, "[CLIENT NAME]" might become:
 *   <w:r><w:rPr>...</w:rPr><w:t>[CLIENT</w:t></w:r>
 *   <w:r><w:rPr>...</w:rPr><w:t> </w:t></w:r>       (space run)
 *   <w:r><w:rPr>...</w:rPr><w:t>NAME]</w:t></w:r>
 *
 * This function finds these split patterns and replaces the entire
 * sequence of runs with a single run containing the replacement value,
 * preserving the formatting (rPr) from the first run.
 *
 * @param {string} xml - The document XML
 * @param {string[]} parts - The text parts to find (e.g., ['[CLIENT', 'NAME]'])
 * @param {string} replacement - The replacement text
 * @returns {string} - Modified XML
 */
function replaceMultiRunPlaceholder(xml, parts, replacement) {
  if (parts.length < 2) return xml;

  const startText = parts[0];  // e.g., "[CLIENT"
  const endText = parts[parts.length - 1];  // e.g., "NAME]"

  // Use iterative string searching instead of regex to avoid backtracking
  // on large XML documents. Find each occurrence of the startText in a <w:t>
  // tag, then look for the endText in a nearby <w:t> tag within the same
  // paragraph, and replace the entire run sequence.
  let result = '';
  let searchFrom = 0;

  while (searchFrom < xml.length) {
    // Find start text in a <w:t> tag
    const startMarker = '>' + startText + '</w:t>';
    const startIdx = xml.indexOf(startMarker, searchFrom);

    if (startIdx === -1) {
      // No more occurrences, append the rest
      result += xml.substring(searchFrom);
      break;
    }

    // Find the end text in a <w:t> tag after the start (within 500 chars to stay in same area)
    const endMarker = '>' + endText + '</w:t>';
    const endIdx = xml.indexOf(endMarker, startIdx);

    if (endIdx === -1 || endIdx - startIdx > 500) {
      // End text not found nearby, skip this occurrence
      result += xml.substring(searchFrom, startIdx + startMarker.length);
      searchFrom = startIdx + startMarker.length;
      continue;
    }

    // Find the beginning of the first <w:r> containing startText
    const runStart = xml.lastIndexOf('<w:r>', startIdx);
    if (runStart === -1) {
      result += xml.substring(searchFrom, startIdx + startMarker.length);
      searchFrom = startIdx + startMarker.length;
      continue;
    }

    // Find the end of the last </w:r> containing endText
    const runEnd = xml.indexOf('</w:r>', endIdx);
    if (runEnd === -1) {
      result += xml.substring(searchFrom, startIdx + startMarker.length);
      searchFrom = startIdx + startMarker.length;
      continue;
    }
    const fullEnd = runEnd + '</w:r>'.length;

    // Extract the matched region to grab formatting from the first run
    const matchedRegion = xml.substring(runStart, fullEnd);

    // Extract rPr from the first run for formatting preservation
    let rPr = '<w:rPr/>';
    const rPrMatch = matchedRegion.match(/<w:rPr\/?>(?:[^<]*<[^/][^>]*>)*[^<]*<\/w:rPr>|<w:rPr\/>/);
    if (rPrMatch) {
      rPr = rPrMatch[0];
    }

    // Build replacement: everything before the matched runs + single replacement run
    result += xml.substring(searchFrom, runStart);
    result += `<w:r>${rPr}<w:t>${replacement}</w:t></w:r>`;
    searchFrom = fullEnd;
  }

  return result;
}

/**
 * Replace text in XML - simple string replacement
 */
function replaceInXml(xml, search, replace) {
  // Simple replacement first
  xml = xml.split(search).join(replace);

  // Also try case-insensitive
  const regex = new RegExp(escapeRegex(search), 'gi');
  xml = xml.replace(regex, replace);

  return xml;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Clean text for XML insertion
 */
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\*/g, '') // Remove asterisks
    .replace(/•/g, '')  // Remove bullets
    .trim();
}

/**
 * Analyze what type of contract should be generated
 */
function analyzeContractType(clientData) {
  const company = clientData.company || clientData.companyConfig || COMPANIES.msb;
  const isMedical = clientData.isMedical || false;
  const hasLegalRate = clientData.hasLegalRate || false;
  const rate = clientData.rate || 30;

  let contractType;
  if (isMedical) {
    contractType = hasLegalRate ? 'Medical (with BAA + Legal Rate)' : 'Medical (with BAA)';
  } else {
    contractType = hasLegalRate ? 'Non-Medical (with Legal Rate)' : 'Non-Medical';
  }

  return {
    company: company.name,
    companyShort: company.shortName,
    type: contractType,
    isMedical,
    hasBAA: isMedical,
    hasLegalRate,
    rate: `${rate}%`,
    legalRate: hasLegalRate ? `${clientData.legalRate || rate + 10}%` : null,
    templateUsed: path.basename(getTemplatePath(company, isMedical))
  };
}

module.exports = {
  generateContract,
  analyzeContractType,
  getTemplatePath
};
