/**
 * One-shot script: reads a source logo and writes all the icon sizes the
 * hub needs (favicon.ico, logo192.png, logo512.png) into public/.
 *
 * Usage:  node scripts/build-branding.js <path-to-source.png>
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error(`Source image not found: ${src}`);
  process.exit(1);
}

const publicDir = path.join(__dirname, '..', 'public');

async function main() {
  const buf = fs.readFileSync(src);

  // 1. Master copy in public/ so the React code can import it if needed
  fs.copyFileSync(src, path.join(publicDir, 'logo-source.png'));
  console.log('✓ wrote logo-source.png');

  // 2. PWA / Electron icons (square, opaque)
  await sharp(buf).resize(192, 192, { fit: 'contain', background: '#ffffff' })
    .png().toFile(path.join(publicDir, 'logo192.png'));
  console.log('✓ wrote logo192.png');

  await sharp(buf).resize(512, 512, { fit: 'contain', background: '#ffffff' })
    .png().toFile(path.join(publicDir, 'logo512.png'));
  console.log('✓ wrote logo512.png');

  // 3. Transparent-background variant for use inside the dark UI
  // (White background gets dropped via flatten/extract trick: convert near-white
  // pixels to transparent.)
  const transparent = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = transparent;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // If pixel is near-white (>240 on all channels), make fully transparent
    if (r > 240 && g > 240 && b > 240) data[i + 3] = 0;
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toFile(path.join(publicDir, 'logo-transparent.png'));
  console.log('✓ wrote logo-transparent.png');

  // 4. Multi-size favicon.ico
  // Generate 16/32/48 PNGs first, then bundle into ICO
  const sizes = [16, 32, 48];
  const pngBuffers = await Promise.all(
    sizes.map((s) =>
      sharp(buf).resize(s, s, { fit: 'contain', background: '#ffffff' })
        .png().toBuffer()
    )
  );
  const icoBuf = await pngToIco(pngBuffers);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuf);
  console.log('✓ wrote favicon.ico (16, 32, 48)');

  console.log('\nBranding installed. Reload the dev server / wait for Vercel rebuild.');
}

main().catch((e) => { console.error(e); process.exit(1); });
