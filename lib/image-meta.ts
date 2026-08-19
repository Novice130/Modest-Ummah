/**
 * Intrinsic size + LQIP for product images.
 *
 * scripts/import-photos.mjs writes this for the imported catalogue, so those
 * listings paint a blur placeholder and reserve the right layout box. Images
 * uploaded through the admin had neither: lib/api/v1/serializers.ts fell back
 * to a 4:5 guess and an empty lqip, which is wrong for anything square or
 * landscape and gives the app nothing to paint underneath the streaming image.
 *
 * Resolution happens on the product save path rather than at upload time, so
 * an image that was uploaded and then discarded costs nothing, and images that
 * predate this file get backfilled the next time their product is saved.
 */
import sharp from 'sharp';
import { readFile } from 'fs/promises';
import { resolveUploadPath } from './uploads';

export interface ImageMetaEntry {
  w: number;
  h: number;
  /** base64 data URI, ~24px wide. */
  lqip: string;
}

/** Width of the blur placeholder. Matches scripts/import-photos.mjs. */
const LQIP_WIDTH = 24;

/**
 * Reads dimensions and renders the placeholder. Returns null rather than
 * throwing: a file that sharp cannot decode must not fail a product save, and
 * the serializer already has a fallback for a missing entry.
 */
export async function computeImageMeta(buffer: Buffer): Promise<ImageMetaEntry | null> {
  try {
    const image = sharp(buffer);
    const { width, height } = await image.metadata();
    if (!width || !height) return null;

    const lqip = await sharp(buffer)
      .resize({ width: LQIP_WIDTH })
      .webp({ quality: 40 })
      .toBuffer();

    return {
      w: width,
      h: height,
      lqip: `data:image/webp;base64,${lqip.toString('base64')}`,
    };
  } catch (error) {
    console.error('computeImageMeta failed', error);
    return null;
  }
}

/**
 * Returns `existing` plus an entry for every uploaded image URL that lacks one.
 *
 * Existing entries are never recomputed — that is what keeps the builder's
 * 1.5s autosave from re-encoding the whole gallery on every keystroke — and
 * never dropped, so an entry for an image that is no longer in the gallery
 * survives a reorder or a temporary removal.
 */
export async function resolveImageMeta(
  urls: (string | null | undefined)[],
  existing: Record<string, ImageMetaEntry> = {}
): Promise<Record<string, ImageMetaEntry>> {
  const missing = [
    ...new Set(
      urls.filter((u): u is string => typeof u === 'string' && u.length > 0 && !existing[u])
    ),
  ];
  if (missing.length === 0) return existing;

  const resolved: Record<string, ImageMetaEntry> = { ...existing };

  await Promise.all(
    missing.map(async (url) => {
      const filePath = resolveUploadPath(url);
      // Legacy /images/… paths and remote URLs have no local file to read.
      if (!filePath) return;

      let buffer: Buffer;
      try {
        buffer = await readFile(filePath);
      } catch {
        return;
      }

      const meta = await computeImageMeta(buffer);
      if (meta) resolved[url] = meta;
    })
  );

  return resolved;
}
