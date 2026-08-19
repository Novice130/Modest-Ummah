/**
 * Generates the iOS app icon set and launch image for mobile/.
 *
 * Both were still the Flutter template's: the default blue-and-white icon, and
 * a 1x1 white pixel for the launch screen. An App Store submission with the
 * template icon is rejected, and the 1024 marketing icon must have no alpha
 * channel at all.
 *
 * The mark is the crescent from scripts/generate-brand-assets.mjs — same
 * geometry, so the app, the favicon and the OG image are recognisably one
 * brand — in the app's own palette (lib/core/theme/palette.dart): gold on ink
 * for the icon, gold on cream for the launch screen.
 *
 * Usage:  node scripts/generate-ios-icons.mjs
 */
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const MOBILE = new URL('../mobile/', import.meta.url);
const ICON_DIR = new URL('ios/Runner/Assets.xcassets/AppIcon.appiconset/', MOBILE);
const LAUNCH_DIR = new URL('ios/Runner/Assets.xcassets/LaunchImage.imageset/', MOBILE);
const SHOT_DIR = new URL('screenshots/', MOBILE);

const GOLD = '#C9A227';
const INK = '#141414';
const CREAM = '#FAF8F5';

/**
 * Crescent as an SVG: a filled circle with a second, offset circle knocked out
 * of it via a mask. The ratios match render() in generate-brand-assets.mjs.
 */
function crescentSvg({ size, background, mark }) {
  const c = size / 2;
  const rOuter = size * 0.28;
  const rInner = rOuter * 0.78;
  const offX = rOuter * 0.42;
  const offY = -rOuter * 0.12;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <mask id="crescent">
      <rect width="${size}" height="${size}" fill="black"/>
      <circle cx="${c}" cy="${c}" r="${rOuter}" fill="white"/>
      <circle cx="${c + offX}" cy="${c + offY}" r="${rInner}" fill="black"/>
    </mask>
  </defs>
  ${background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ''}
  <rect width="${size}" height="${size}" fill="${mark}" mask="url(#crescent)"/>
</svg>`;
}

/** Every filename AppIcon.appiconset/Contents.json already references. */
const ICONS = [
  ['Icon-App-20x20@1x.png', 20],
  ['Icon-App-20x20@2x.png', 40],
  ['Icon-App-20x20@3x.png', 60],
  ['Icon-App-29x29@1x.png', 29],
  ['Icon-App-29x29@2x.png', 58],
  ['Icon-App-29x29@3x.png', 87],
  ['Icon-App-40x40@1x.png', 40],
  ['Icon-App-40x40@2x.png', 80],
  ['Icon-App-40x40@3x.png', 120],
  ['Icon-App-60x60@2x.png', 120],
  ['Icon-App-60x60@3x.png', 180],
  ['Icon-App-76x76@1x.png', 76],
  ['Icon-App-76x76@2x.png', 152],
  ['Icon-App-83.5x83.5@2x.png', 167],
  ['Icon-App-1024x1024@1x.png', 1024],
];

/** 1x/2x/3x of the centred launch mark. The storyboard declares 200x200. */
const LAUNCH = [
  ['LaunchImage.png', 200],
  ['LaunchImage@2x.png', 400],
  ['LaunchImage@3x.png', 600],
];

async function render({ size, background, mark, flatten }) {
  // Rendered once at 1024 and downscaled, so the small sizes stay smooth
  // instead of being re-rasterised from a tiny viewBox.
  const master = Buffer.from(crescentSvg({ size: 1024, background, mark }));
  let pipeline = sharp(master, { density: 384 }).resize(size, size);

  // ios-marketing rejects an alpha channel; the launch mark needs one so it
  // sits on the storyboard's own background.
  if (flatten) pipeline = pipeline.flatten({ background });

  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  for (const dir of [ICON_DIR, LAUNCH_DIR, SHOT_DIR]) {
    await mkdir(dir, { recursive: true });
  }

  for (const [name, size] of ICONS) {
    const png = await render({ size, background: INK, mark: GOLD, flatten: true });
    await writeFile(new URL(name, ICON_DIR), png);
    console.log(`  icon    ${name.padEnd(30)} ${size}x${size}`);
  }

  for (const [name, size] of LAUNCH) {
    const png = await render({ size, background: null, mark: GOLD, flatten: false });
    await writeFile(new URL(name, LAUNCH_DIR), png);
    console.log(`  launch  ${name.padEnd(30)} ${size}x${size}`);
  }

  // App Store Connect wants the 1024 uploaded separately from the bundle.
  const marketing = await render({ size: 1024, background: INK, mark: GOLD, flatten: true });
  await writeFile(new URL('icon-1024.png', SHOT_DIR), marketing);
  console.log(`  store   icon-1024.png                  1024x1024`);

  const meta = await sharp(marketing).metadata();
  console.log(
    `\n1024 marketing icon: ${meta.width}x${meta.height}, alpha ${meta.hasAlpha ? 'PRESENT — will be rejected' : 'absent'}\n`
  );
  console.log(`Launch screen background is set in ios/Runner/Base.lproj/LaunchScreen.storyboard (${CREAM}).`);
  console.log(`Wrote into ${path.relative(process.cwd(), new URL('.', MOBILE).pathname)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
