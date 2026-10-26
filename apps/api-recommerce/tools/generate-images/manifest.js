import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const MANIFEST_VERSION = 1;

/**
 * Loads the manifest from the output folder, or returns an empty one.
 * @param {string} outDir
 * @returns {Object}
 */
export function loadManifest(outDir) {
  const path = join(outDir, 'manifest.json');
  if (!existsSync(path)) {
    return { version: MANIFEST_VERSION, service: 'api-recommerce', generator: null, images: {}, listings: {} };
  }
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.version !== MANIFEST_VERSION) throw new Error(`Unsupported manifest version ${manifest.version} in ${path}`);
  return manifest;
}

/**
 * Writes the manifest atomically (temp file + rename), so an interrupted run never leaves a broken file.
 * @param {string} outDir
 * @param {Object} manifest
 */
export function saveManifest(outDir, manifest) {
  const path = join(outDir, 'manifest.json');
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...manifest, updated_at: new Date().toISOString() }, null, 2));
  renameSync(tmp, path);
}

/**
 * Stores image bytes under files/<content-hash>.<ext> and returns file metadata.
 * @param {string} outDir
 * @param {Buffer} bytes
 * @returns {{ file: string, format: string, width: number|null, height: number|null, bytes: number }}
 */
export function storeImage(outDir, bytes) {
  const { format, ext } = detectFormat(bytes);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 20);
  const dir = join(outDir, 'files');
  mkdirSync(dir, { recursive: true });
  const file = `files/${hash}.${ext}`;
  writeFileSync(join(outDir, file), bytes);
  const { width, height } = readDimensions(bytes, format);
  return { file, format, width, height, bytes: bytes.length };
}

function detectFormat(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { format: 'jpeg', ext: 'jpg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { format: 'png', ext: 'png' };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { format: 'webp', ext: 'webp' };
  throw new Error('Unrecognised image format returned by the model');
}

function readDimensions(b, format) {
  if (format === 'png') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (format === 'jpeg') {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return { width: null, height: null };
}
