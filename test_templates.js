const { generateContract } = require('./src/contractGenerator');
const { COMPANIES } = require('./src/companyConfig');
const { execSync } = require('child_process');
const fs = require('fs');

async function test() {
  // Test MSB Non-Medical
  console.log('=== Test: MSB Non-Medical ===');
  const r = await generateContract({
    company: COMPANIES.msb,
    companyConfig: COMPANIES.msb,
    clientName: 'Premier Auto Parts',
    address: '456 Oak Ave, Topeka, KS 66603',
    isMedical: false,
    hasLegalRate: false,
    rate: 25
  });

  const tmp = '/tmp/test_verify_' + Date.now();
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(tmp + '/test.docx', r.buffer);
  const text = execSync('pandoc "' + tmp + '/test.docx" -t plain --wrap=none 2>/dev/null').toString();

  console.log('  CLIENT NAME:', text.includes('Premier Auto Parts') ? 'OK' : 'MISSING');
  console.log('  No [CLIENT leftover:', !text.includes('[CLIENT') ? 'OK' : 'FAIL');
  console.log('  No NAME] leftover:', !text.includes('NAME]') ? 'OK' : 'FAIL');
  console.log('  ADDRESS:', text.includes('456 Oak Ave') ? 'OK' : 'MISSING');
  console.log('  No Address] leftover:', !text.includes('Address]') ? 'OK' : 'FAIL');
  console.log('  No [DATE] leftover:', !text.includes('[DATE]') ? 'OK' : 'FAIL');
  console.log('  Has 25%:', text.includes('25%') ? 'OK' : 'MISSING');
  console.log('  No 30%:', !text.includes('30%') ? 'OK' : 'FAIL - still has 30%');

  execSync('rm -rf ' + tmp);

  // Test VV Non-Medical
  console.log('\n=== Test: VV Non-Medical ===');
  const r2 = await generateContract({
    company: COMPANIES.vegasvalley,
    companyConfig: COMPANIES.vegasvalley,
    clientName: 'Silver State Plumbing',
    address: '321 Desert Rd, Henderson, NV 89002',
    isMedical: false,
    hasLegalRate: false,
    rate: 40
  });

  const tmp2 = '/tmp/test_verify_' + Date.now();
  fs.mkdirSync(tmp2, { recursive: true });
  fs.writeFileSync(tmp2 + '/test.docx', r2.buffer);
  const text2 = execSync('pandoc "' + tmp2 + '/test.docx" -t plain --wrap=none 2>/dev/null').toString();

  console.log('  CLIENT NAME:', text2.includes('Silver State Plumbing') ? 'OK' : 'MISSING');
  console.log('  ADDRESS:', text2.includes('321 Desert Rd') ? 'OK' : 'MISSING');
  console.log('  Has 40%:', text2.includes('40%') ? 'OK' : 'MISSING');
  console.log('  No 30%:', !text2.includes('30%') ? 'OK' : 'FAIL');
  console.log('  Vegas Valley name:', text2.includes('Vegas Valley') ? 'OK' : 'MISSING');

  execSync('rm -rf ' + tmp2);

  // Test MSB Medical
  console.log('\n=== Test: MSB Medical ===');
  const r3 = await generateContract({
    company: COMPANIES.msb,
    companyConfig: COMPANIES.msb,
    clientName: 'ABC Medical Center',
    address: '123 Main St, Wichita, KS 67201',
    isMedical: true,
    hasLegalRate: false,
    rate: 35
  });

  const tmp3 = '/tmp/test_verify_' + Date.now();
  fs.mkdirSync(tmp3, { recursive: true });
  fs.writeFileSync(tmp3 + '/test.docx', r3.buffer);
  const text3 = execSync('pandoc "' + tmp3 + '/test.docx" -t plain --wrap=none 2>/dev/null').toString();

  console.log('  CLIENT:', text3.includes('ABC Medical Center') ? 'OK' : 'MISSING');
  console.log('  ADDRESS:', text3.includes('123 Main St') ? 'OK' : 'MISSING');
  console.log('  Has 35%:', text3.includes('35%') ? 'OK' : 'MISSING');
  console.log('  HIPAA section:', text3.includes('HIPAA') ? 'YES' : 'NO');

  execSync('rm -rf ' + tmp3);

  // Test VV Medical
  console.log('\n=== Test: VV Medical ===');
  const r4 = await generateContract({
    company: COMPANIES.vegasvalley,
    companyConfig: COMPANIES.vegasvalley,
    clientName: 'Desert Medical Center',
    address: '789 Strip Blvd, Las Vegas, NV 89101',
    isMedical: true,
    hasLegalRate: false,
    rate: 30
  });

  const tmp4 = '/tmp/test_verify_' + Date.now();
  fs.mkdirSync(tmp4, { recursive: true });
  fs.writeFileSync(tmp4 + '/test.docx', r4.buffer);
  const text4 = execSync('pandoc "' + tmp4 + '/test.docx" -t plain --wrap=none 2>/dev/null').toString();

  console.log('  CLIENT:', text4.includes('Desert Medical Center') ? 'OK' : 'MISSING');
  console.log('  ADDRESS:', text4.includes('789 Strip Blvd') ? 'OK' : 'MISSING');
  console.log('  Has 30%:', text4.includes('30%') ? 'OK' : 'MISSING');
  console.log('  HIPAA section:', text4.includes('HIPAA') ? 'YES' : 'NO');
  console.log('  Vegas Valley name:', text4.includes('Vegas Valley') ? 'OK' : 'MISSING');

  execSync('rm -rf ' + tmp4);

  console.log('\n=== All tests complete ===');
}

test().catch(e => console.error('Test failed:', e));
