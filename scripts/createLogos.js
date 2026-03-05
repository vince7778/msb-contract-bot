/**
 * Logo Generator Script
 * Creates MSB and Vegas Valley logos for the ContractBot
 */

const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

// Ensure assets directory exists
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

async function createMSBLogo() {
  // MSB: Purple background with white/yellow text
  const width = 400;
  const height = 100;

  const image = new Jimp(width, height, 0x6B2D8BFF); // Purple background

  // Load font
  const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

  // Add text
  image.print(font, 20, 20, 'M$B');
  image.print(fontSmall, 20, 60, 'Midwest Service Bureau, LLC');

  // Save
  const outputPath = path.join(ASSETS_DIR, 'msb-logo.png');
  await image.writeAsync(outputPath);
  console.log('✅ Created MSB logo:', outputPath);
}

async function createVegasLogo() {
  // Vegas Valley: Dark navy/black background with white text
  const width = 400;
  const height = 100;

  const image = new Jimp(width, height, 0x1A1A2EFF); // Dark navy background

  // Load fonts
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

  // Add text
  image.print(font, 20, 25, 'VEGAS VALLEY');
  image.print(font, 20, 50, 'COLLECTION SERVICE');

  // Save
  const outputPath = path.join(ASSETS_DIR, 'vegas-logo.png');
  await image.writeAsync(outputPath);
  console.log('✅ Created Vegas Valley logo:', outputPath);
}

async function main() {
  console.log('🎨 Generating company logos...\n');

  try {
    await createMSBLogo();
    await createVegasLogo();
    console.log('\n✅ All logos created successfully!');
    console.log('📁 Location:', ASSETS_DIR);
  } catch (error) {
    console.error('❌ Error creating logos:', error);
    process.exit(1);
  }
}

main();
