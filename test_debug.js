const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Manually simulate what generateContract does for non-medical
const templatePath = path.join(__dirname, 'templates', 'MSB_NonMedical.docx');
const tmpDir = '/tmp/debug_gen_' + Date.now();
const unpackedDir = tmpDir + '/unpacked';
fs.mkdirSync(tmpDir, { recursive: true });
execSync('unzip -q "' + templatePath + '" -d "' + unpackedDir + '"');

let xml = fs.readFileSync(unpackedDir + '/word/document.xml', 'utf8');

// Show the [Client Address area before replacement
const addrIdx = xml.indexOf('[Client');
console.log('=== BEFORE [Client area ===');
console.log(xml.substring(Math.max(0, addrIdx - 50), addrIdx + 300));

// Do the multi-run replacement
const RPR = '(?:<w:rPr/>|<w:rPr>[\\s\\S]*?</w:rPr>)';

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const pattern = new RegExp(
  '<w:r>' +
  '(' + RPR + ')' +
  '<w:t[^>]*>' + escapeRegex('[Client') + '</w:t>' +
  '</w:r>' +
  '(?:<w:r>' + RPR + '<w:t[^>]*>[\\s ]*</w:t></w:r>)*' +
  '<w:r>' + RPR +
  '<w:t[^>]*>' + escapeRegex('Address]') + '</w:t>' +
  '</w:r>',
  'g'
);

console.log('\n=== Regex pattern ===');
console.log(pattern.source.substring(0, 200) + '...');

const matches = xml.match(pattern);
console.log('\n=== Matches found:', matches ? matches.length : 0);
if (matches) {
  console.log('Match:', matches[0].substring(0, 300));
}

// Now do the replacement
xml = xml.replace(pattern, (match, rPr) => {
  console.log('\n=== Captured rPr:', rPr);
  const result = '<w:r>' + rPr + '<w:t>456 Oak Ave, Topeka, KS 66603</w:t></w:r>';
  console.log('=== Replacement:', result);
  return result;
});

// Check if the address appears in the output
console.log('\n=== Has address in XML:', xml.includes('456 Oak Ave'));

// Check rate
console.log('=== Has 30% before:', xml.includes('<w:t>30%</w:t>'));
xml = xml.replace(/<w:t>30%<\/w:t>/g, '<w:t>25%</w:t>');
console.log('=== Has 25% after:', xml.includes('<w:t>25%</w:t>'));

// Write and check with pandoc
fs.writeFileSync(unpackedDir + '/word/document.xml', xml);
const cwd = process.cwd();
process.chdir(unpackedDir);
execSync('zip -q -r "' + tmpDir + '/out.docx" .');
process.chdir(cwd);

const text = execSync('pandoc "' + tmpDir + '/out.docx" -t plain --wrap=none 2>/dev/null').toString();
console.log('\n=== Output has address:', text.includes('456 Oak Ave'));
console.log('=== Output has 25%:', text.includes('25%'));

// Find area around where address should be
const partIdx = text.indexOf('Parties');
if (partIdx > -1) {
  console.log('\nParties area:', text.substring(Math.max(0, partIdx - 200), partIdx + 50));
}

execSync('rm -rf ' + tmpDir);
