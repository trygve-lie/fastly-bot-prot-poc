import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// images/manifest.json is written by an external image generator. It is the only contract
// between the generator and this service: the service never imports generator code.
const SUPPORTED_VERSION = 1;
const CONTENT_TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Reads images/manifest.json and flattens it into one row per item image.
 * Images whose file is missing on disk are skipped. Returns null when there is no manifest.
 * @param {string} imagesDir
 * @returns {{ listing_id: string, position: number, file: string, content_type: string, alt: string, width: number|null, height: number|null }[]|null}
 */
export function readImageManifest(imagesDir) {
  const path = join(imagesDir, 'manifest.json');
  if (!existsSync(path)) return null;

  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.version !== SUPPORTED_VERSION) {
    throw new Error(`Unsupported image manifest version ${manifest.version} in ${path}`);
  }

  const rows = [];
  for (const [listingId, keys] of Object.entries(manifest.listings ?? {})) {
    keys.forEach((key, position) => {
      const image = manifest.images?.[key];
      if (!image || !CONTENT_TYPES[image.format] || !existsSync(join(imagesDir, image.file))) return;
      rows.push({
        listing_id: listingId,
        position,
        file: basename(image.file),
        content_type: CONTENT_TYPES[image.format],
        alt: image.alt,
        width: image.width ?? null,
        height: image.height ?? null,
      });
    });
  }
  return rows;
}
