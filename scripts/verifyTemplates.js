/**
 * Template safety check.
 *
 * Added after a Vegas Valley commercial contract went out carrying MSB's
 * NMLS ID (2671949 instead of 2364012). The VV_Commercial template had been
 * built by copying the MSB one, and nothing caught it.
 *
 * Run before deploying:  node scripts/verifyTemplates.js
 * Exits non-zero if any template carries the wrong company's identifiers.
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { COMPANIES } = require('../src/companyConfig');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

const MSB_NMLS = COMPANIES.msb.nmls;
const VV_NMLS = COMPANIES.vegasvalley.nmls;

function docText(file) {
  const zip = new AdmZip(file);
  return zip.getEntries()
    .filter((e) => e.entryName.startsWith('word/') && e.entryName.endsWith('.xml'))
    .map((e) => zip.readAsText(e.entryName).replace(/<[^>]+>/g, ''))
    .join('\n');
}

function main() {
  const files = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.docx')).sort();
  if (!files.length) {
    console.error('No templates found in', TEMPLATES_DIR);
    process.exit(1);
  }

  const problems = [];
  console.log('Checking NMLS ID, governing law and address in each template\n');

  for (const f of files) {
    const isVV = /^VV[_-]/i.test(f);
    const expected = isVV ? VV_NMLS : MSB_NMLS;
    const forbidden = isVV ? MSB_NMLS : VV_NMLS;
    const text = docText(path.join(TEMPLATES_DIR, f));

    const hasExpected = text.includes(expected);
    const hasForbidden = text.includes(forbidden);

    const issues = [];
    if (hasForbidden) {
      issues.push(`carries ${isVV ? 'MSB' : 'Vegas Valley'}'s NMLS (${forbidden})`);
    } else if (!hasExpected) {
      issues.push(`no NMLS ID found (expected ${expected})`);
    }

    // Governing law and the Collector address must match the licensed state:
    // Vegas Valley is Nevada-only (NRS 649); MSB is Kansas.
    const flat = text.replace(/\s+/g, ' ');
    if (isVV) {
      if (/\bKansas\b/.test(flat)) issues.push('mentions Kansas');
      if (/Wichita|67213/.test(flat)) issues.push('carries the Wichita address');
      if (!/State of Nevada/.test(flat)) issues.push('governing law is not Nevada');
      if (!/Jones Blvd/.test(flat)) issues.push('missing the Las Vegas address');
    } else {
      if (/\bNevada\b/.test(flat)) issues.push('mentions Nevada');
      if (/Jones Blvd/.test(flat)) issues.push('carries the Las Vegas address');
      if (!/State of Kansas/.test(flat)) issues.push('governing law is not Kansas');
    }

    const ok = issues.length === 0;
    if (!ok) problems.push(`${f}: ${issues.join('; ')}`);
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${f.padEnd(28)} ${ok ? `OK  (NMLS ${expected}, ${isVV ? 'Nevada' : 'Kansas'})` : issues.join('; ')}`);
  }

  console.log();
  if (problems.length) {
    console.error(`${problems.length} template problem(s) found:`);
    problems.forEach((p) => console.error('  - ' + p));
    console.error('\nFix the template before deploying. A wrong NMLS ID on a signed contract is a compliance issue.');
    process.exit(1);
  }

  console.log(`All ${files.length} templates carry the correct NMLS ID, governing law and address.`);
}

main();
