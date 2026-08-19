/**
 * Processes the raw product photography in Photos/ into web-ready assets and
 * writes a manifest that scripts/seed-catalogue.mjs consumes.
 *
 * The sources are WhatsApp exports: mixed orientation (1080x1186 up to
 * 3840x5120), EXIF rotation on the phone shots, and softened by recompression.
 *
 * Per source image it emits
 *   - a 1600x2000 (4:5) WebP master for the PDP gallery
 *   - a 1200x1200 (1:1) WebP for grid and thumbnail use
 *   - a ~24px base64 LQIP for blur placeholders
 *
 * Files land in the upload dir with crypto.randomUUID() names, matching what
 * app/api/upload/route.ts writes, and are referenced as /api/media/<name>.
 *
 * Idempotent: re-running reuses the existing manifest entry for a source
 * unless --force is passed, so seeding can be repeated without churning
 * filenames (which would orphan the previous files).
 *
 * Usage:  node scripts/import-photos.mjs
 *         node scripts/import-photos.mjs --dry-run
 *         node scripts/import-photos.mjs --force
 */

import { readdir, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

const SOURCE_DIR = 'Photos';
const MANIFEST_PATH = 'scripts/backups/photo-manifest.json';

const MASTER = { w: 1600, h: 2000 }; // 4:5
const SQUARE = { w: 1200, h: 1200 };
const QUALITY = 82;

/**
 * Mirrors getUploadDir() in app/api/upload/route.ts. Uploads live outside
 * public/ so a redeploy cannot wipe them; production mounts a Docker volume.
 */
function getUploadDir() {
  if (process.env.UPLOAD_DIR) return process.env.UPLOAD_DIR;
  if (process.env.NODE_ENV === 'production') return '/app/uploads';
  return path.join(process.cwd(), 'uploads');
}

/**
 * Photo #03 is a single frame holding two different bracelets — a multicolour
 * CZ strand on the left and a silver heart-link strand on the right. They are
 * separate products, so the frame is split before anything else runs.
 *
 * Fractions verified visually against the 1080x1920 source; neither crop
 * bleeds into the other strand.
 */
const SPLITS = {
  3: [
    { suffix: 'left', left: 0, width: 0.48 },
    { suffix: 'right', left: 0.46, width: 0.54 },
  ],
};

/**
 * Extreme aspect ratios cannot be centre-cropped to 4:5 without losing the
 * subject — the split bracelets are 0.27 and the ring trays are 1.87. Those
 * get letterboxed onto a blurred enlargement of themselves instead, which
 * keeps the whole piece visible and still fills the card.
 */
function needsBlurredFill(width, height) {
  const ar = width / height;
  return ar > 1.05 || ar < 0.6;
}

async function renderTo(input, target) {
  const meta = await sharp(input).rotate().metadata();
  const fill = needsBlurredFill(meta.width, meta.height);

  if (!fill) {
    return sharp(input)
      .rotate()
      .resize(target.w, target.h, {
        fit: 'cover',
        // Entropy-weighted: several shots place the piece off-centre on a
        // wide marble background, where a blind centre crop loses it.
        position: sharp.strategy.attention,
      })
      .sharpen()
      .webp({ quality: QUALITY })
      .toBuffer();
  }

  const background = await sharp(input)
    .rotate()
    .resize(target.w, target.h, { fit: 'cover' })
    .blur(40)
    .modulate({ brightness: 0.8 })
    .toBuffer();

  const foreground = await sharp(input)
    .rotate()
    .resize(target.w, target.h, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .sharpen()
    .png()
    .toBuffer();

  return sharp(background)
    .composite([{ input: foreground }])
    .webp({ quality: QUALITY })
    .toBuffer();
}

async function makeLqip(input) {
  const buf = await sharp(input)
    .rotate()
    .resize(24, 30, { fit: 'cover', position: sharp.strategy.attention })
    .webp({ quality: 40 })
    .toBuffer();
  return `data:image/webp;base64,${buf.toString('base64')}`;
}

async function main() {
  const uploadDir = getUploadDir();
  console.log(`\nPhoto import → ${uploadDir}${DRY_RUN ? '  (dry run)' : ''}\n`);

  if (!DRY_RUN) {
    await mkdir(uploadDir, { recursive: true });
    await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  }

  const files = (await readdir(SOURCE_DIR))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort();

  if (files.length === 0) {
    console.error(`No images found in ${SOURCE_DIR}/`);
    process.exit(1);
  }

  let manifest = {};
  if (existsSync(MANIFEST_PATH) && !FORCE) {
    manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  }

  // Expand the source list into work items, splitting where required. The key
  // is what seed-catalogue.mjs references: "03-left", "07", and so on.
  const items = [];
  for (const [index, file] of files.entries()) {
    const src = path.join(SOURCE_DIR, file);
    const splits = SPLITS[index];
    if (!splits) {
      items.push({ key: String(index).padStart(2, '0'), src, crop: null, file });
      continue;
    }
    for (const split of splits) {
      items.push({
        key: `${String(index).padStart(2, '0')}-${split.suffix}`,
        src,
        crop: split,
        file,
      });
    }
  }

  let processed = 0;
  let skipped = 0;

  for (const item of items) {
    if (manifest[item.key] && !FORCE) {
      skipped++;
      continue;
    }
    if (DRY_RUN) {
      console.log(`  would process ${item.key}  ←  ${item.file}${item.crop ? ' (split)' : ''}`);
      processed++;
      continue;
    }

    // Apply the split first so every later step sees a single product.
    let input = item.src;
    if (item.crop) {
      const meta = await sharp(item.src).rotate().metadata();
      input = await sharp(item.src)
        .rotate()
        .extract({
          left: Math.round(meta.width * item.crop.left),
          top: 0,
          width: Math.round(meta.width * item.crop.width),
          height: meta.height,
        })
        .toBuffer();
    }

    const masterBuf = await renderTo(input, MASTER);
    const squareBuf = await renderTo(input, SQUARE);
    const lqip = await makeLqip(input);

    const masterName = `${crypto.randomUUID()}.webp`;
    const squareName = `${crypto.randomUUID()}.webp`;
    await writeFile(path.join(uploadDir, masterName), masterBuf);
    await writeFile(path.join(uploadDir, squareName), squareBuf);

    manifest[item.key] = {
      source: item.file,
      split: item.crop ? item.crop.suffix : null,
      master: `/api/media/${masterName}`,
      square: `/api/media/${squareName}`,
      w: MASTER.w,
      h: MASTER.h,
      lqip,
    };

    processed++;
    console.log(`  ok   ${item.key}  →  ${masterName}`);
  }

  if (!DRY_RUN) {
    await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  }

  console.log(
    `\n${processed} processed, ${skipped} already in the manifest.` +
      (DRY_RUN ? '\nDry run complete. Nothing was written.\n' : `\nManifest: ${MANIFEST_PATH}\n`)
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
