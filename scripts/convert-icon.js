const fs = require('fs');
const path = require('path');

async function convert() {
  const sharp = require('sharp');
  const svgPath = path.join(__dirname, '..', 'images', 'icon.svg');
  const outPath = path.join(__dirname, '..', 'images', 'icon-128.png');

  if (!fs.existsSync(svgPath)) {
    console.error('SVG not found:', svgPath);
    process.exit(2);
  }

  const svg = fs.readFileSync(svgPath);

  await sharp(svg)
    .resize(128, 128, { fit: 'contain' })
    .png({ force: true })
    .toFile(outPath);

  console.log('Wrote PNG:', outPath);
}

convert().catch((err) => {
  console.error(err);
  process.exit(1);
});
