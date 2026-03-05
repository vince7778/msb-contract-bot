const { generateContract } = require('./src/contractGenerator');
const { COMPANIES } = require('./src/companyConfig');
const { execSync } = require('child_process');
const fs = require('fs');

async function test() {
  // Test: MSB Non-Medical with legal rate
  console.log('=== Test: MSB Non-Medical + Legal Rate ===');
  const r = await generateContract({
    company: COMPANIES.msb,
    companyConfig: COMPANIES.msb,
    clientName: "O'Brien & Associates LLC",
    address: '100 E. Douglas Ave, Suite 200, Wichita, KS 67202',
    isMedical: false,
    hasLegalRate: true,
    rate: 35,
    legalRate: 45
  });
  console.log('  Contract type:', r.contractType);
  console.log('  Rate:', r.rate + '%');
  console.log('  Legal rate:', r.legalRate + '%');

  const tmp = '/tmp/test_edge_' + Date.now();
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(tmp + '/test.docx', r.buffer);
  const text = execSync('pandoc "' + tmp + '/test.docx" -t plain --wrap=none 2>/dev/null').toString();

  console.log("  CLIENT NAME:", text.includes("O'Brien") || text.includes("O\u2019Brien") ? 'OK' : 'MISSING');
  console.log('  ADDRESS:', text.includes('100 E. Douglas') ? 'OK' : 'MISSING');
  console.log('  Has 35%:', text.includes('35%') ? 'OK' : 'MISSING');

  execSync('rm -rf ' + tmp);

  // Test: Default rate (no rate specified)
  console.log('\n=== Test: Default Rate (30%) ===');
  const r2 = await generateContract({
    company: COMPANIES.msb,
    companyConfig: COMPANIES.msb,
    clientName: 'Simple Corp',
    address: '1 Main St',
    isMedical: false,
    hasLegalRate: false,
    rate: 30
  });
  const tmp2 = '/tmp/test_edge2_' + Date.now();
  fs.mkdirSync(tmp2, { recursive: true });
  fs.writeFileSync(tmp2 + '/test.docx', r2.buffer);
  const text2 = execSync('pandoc "' + tmp2 + '/test.docx" -t plain --wrap=none 2>/dev/null').toString();
  console.log('  CLIENT:', text2.includes('Simple Corp') ? 'OK' : 'MISSING');
  console.log('  Has 30%:', text2.includes('30%') ? 'OK' : 'MISSING');
  execSync('rm -rf ' + tmp2);

  // Test: No client name (should keep placeholder)
  console.log('\n=== Test: Missing client name ===');
  const r3 = await generateContract({
    company: COMPANIES.msb,
    companyConfig: COMPANIES.msb,
    isMedical: true,
    hasLegalRate: false,
    rate: 30
  });
  const tmp3 = '/tmp/test_edge3_' + Date.now();
  fs.mkdirSync(tmp3, { recursive: true });
  fs.writeFileSync(tmp3 + '/test.docx', r3.buffer);
  const text3 = execSync('pandoc "' + tmp3 + '/test.docx" -t plain --wrap=none 2>/dev/null').toString();
  console.log('  Placeholder kept:', text3.includes('[CLIENT NAME]') ? 'OK' : 'DIFFERENT');
  execSync('rm -rf ' + tmp3);

  console.log('\n=== All edge case tests complete ===');
}

test().catch(e => console.error('Test failed:', e));
