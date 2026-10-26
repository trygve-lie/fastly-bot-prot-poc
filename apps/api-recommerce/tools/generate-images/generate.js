#!/usr/bin/env node
// Generates images for api-recommerce ads with Cloudflare Workers AI and stores them in ../../images.
// Standalone: reads items through the service's HTTP API, never imports service code.
// Usage: npm run images:generate -w apps/api-recommerce -- --help

import { parseArgs } from 'node:util';
import { existsSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { fetchCatalog } from './catalog.js';
import { GRANULARITIES, visualKey, seedFor, describe } from './prompts.js';
import { createCloudflareClient } from './cloudflare.js';
import { loadManifest, saveManifest, storeImage } from './manifest.js';
import { writeContactSheet } from './contact-sheet.js';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const SERVICE_DIR = resolve(TOOL_DIR, '../..');
const REPO_ROOT = resolve(SERVICE_DIR, '../..');
const DEFAULT_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const NEURON_PRICE_USD = 0.011 / 1000;
const KLEIN_4B_NEURONS_PER_OUTPUT_TILE = 26.05; // per 512x512 output tile, from Workers AI pricing
const FLAGGED_OUTPUT = 3030; // Workers AI: the generated image was flagged by the safety filter
const FLAGGED_SEED_RETRIES = 2; // extra random seeds with the same prompt before going generic

const HELP = `
Generate images for api-recommerce ads with Cloudflare Workers AI.

Usage: npm run images:generate -w apps/api-recommerce -- [options]

Options:
  --api <url>            Service base URL (default http://localhost:3003)
  --granularity <A-D>    A: subcategory+brand+model, B: +colour, C: +material, D: one per ad (default A)
  --model <id>           Workers AI FLUX.2 model (default ${DEFAULT_MODEL})
  --width <px>           Image width, 256-1920 (default 1024)
  --height <px>          Image height, 256-1920 (default 768)
  --out <dir>            Output folder (default apps/api-recommerce/images)
  --credentials <path>   Credentials file (default .env.cloudflare in the repo root)
  --dry-run              Count keys and estimate cost; no Cloudflare calls, no files written
  --limit <n>            Generate at most n new images
  --only <field=value>   Only items matching, e.g. category=furniture (repeatable)
  --regenerate <keys>    Re-create these visual keys (comma-separated, or @file with one key per line)
  --new-seed             With --regenerate: use a fresh random seed
  --concurrency <n>      Parallel Cloudflare requests (default 8)
  --force                Allow switching granularity in an existing manifest
  --help                 Show this help
`;

async function main() {
  const { values: opts } = parseArgs({
    options: {
      api: { type: 'string', default: 'http://localhost:3003' },
      granularity: { type: 'string', default: 'A' },
      model: { type: 'string', default: DEFAULT_MODEL },
      width: { type: 'string', default: '1024' },
      height: { type: 'string', default: '768' },
      out: { type: 'string', default: join(SERVICE_DIR, 'images') },
      credentials: { type: 'string', default: join(REPO_ROOT, '.env.cloudflare') },
      'dry-run': { type: 'boolean', default: false },
      limit: { type: 'string' },
      only: { type: 'string', multiple: true, default: [] },
      regenerate: { type: 'string' },
      'new-seed': { type: 'boolean', default: false },
      concurrency: { type: 'string', default: '8' },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (opts.help) return console.log(HELP);

  const granularity = opts.granularity.toUpperCase();
  if (!GRANULARITIES[granularity]) throw new Error(`--granularity must be one of ${Object.keys(GRANULARITIES).join(', ')}`);
  const width = parseDimension(opts.width, '--width');
  const height = parseDimension(opts.height, '--height');
  const limit = opts.limit != null ? parsePositive(opts.limit, '--limit') : Infinity;
  const concurrency = parsePositive(opts.concurrency, '--concurrency');
  const outDir = resolve(opts.out);
  const apiBase = opts.api.replace(/\/$/, '');
  const filters = opts.only.map(parseFilter);
  const regenerate = parseKeyList(opts.regenerate);

  // ── 1. Read the catalogue through the service API ──────────────────────────
  console.log(`Reading items from ${apiBase} …`);
  const items = await fetchCatalog(apiBase, {
    onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total} items`),
  });
  process.stdout.write('\n');

  // ── 2. Group ads by visual key ─────────────────────────────────────────────
  const groups = new Map(); // key -> { representative item, listing ids }
  for (const item of items) {
    const key = visualKey(item, granularity);
    if (!groups.has(key)) groups.set(key, { item, listingIds: [] });
    groups.get(key).listingIds.push(item.listing_id);
  }

  const manifest = loadManifest(outDir);
  if (manifest.generator && manifest.generator.granularity !== granularity && !opts.force) {
    throw new Error(`Manifest in ${outDir} uses granularity ${manifest.generator.granularity}; use --force to switch to ${granularity} (old images stay on disk but become unmapped).`);
  }

  for (const key of regenerate) {
    if (!groups.has(key)) throw new Error(`--regenerate: unknown visual key "${key}" at granularity ${granularity}`);
  }

  const matchesFilters = ({ item }) => filters.every(([field, value]) => String(item[field]) === value);
  const pending = [...groups.entries()]
    .filter(([key, group]) => regenerate.size ? regenerate.has(key) : !manifest.images[key] && matchesFilters(group))
    .slice(0, limit);

  const neuronsPerImage = Math.ceil(width / 512) * Math.ceil(height / 512) * KLEIN_4B_NEURONS_PER_OUTPUT_TILE;
  console.log(`${items.length} ads → ${groups.size} visual keys at granularity ${granularity}; ${Object.keys(manifest.images).length} already generated.`);
  console.log(`To generate: ${pending.length} image(s) at ${width}x${height} with ${opts.model}` +
    (opts.model === DEFAULT_MODEL ? ` (≈${Math.round(neuronsPerImage * pending.length)} neurons ≈ $${(neuronsPerImage * pending.length * NEURON_PRICE_USD).toFixed(2)})` : ''));

  if (opts['dry-run']) {
    for (const [key] of pending.slice(0, 15)) console.log(`  + ${key}`);
    if (pending.length > 15) console.log(`  … and ${pending.length - 15} more`);
    return;
  }

  // ── 3. Generate ────────────────────────────────────────────────────────────
  mkdirSync(outDir, { recursive: true });
  manifest.generator = { model: opts.model, granularity, width, height };

  let generated = 0;
  let failed = 0;
  let fallbacks = 0;
  if (pending.length) {
    const { accountId, apiToken } = loadCredentials(opts.credentials);
    const client = createCloudflareClient({ accountId, apiToken, model: opts.model });

    let interrupted = false;
    process.on('SIGINT', () => { interrupted = true; console.log('\nStopping after in-flight requests …'); });

    let next = 0;
    const worker = async () => {
      while (next < pending.length && !interrupted) {
        const [key, group] = pending[next++];
        const previous = manifest.images[key];
        const seed = previous && !opts['new-seed'] ? previous.seed : (previous ? randomInt(2_147_483_647) : seedFor(key));
        try {
          const result = await generateWithFallback(client, group.item, { granularity, width, height, seed });
          const stored = storeImage(outDir, result.bytes);
          manifest.images[key] = {
            ...stored, prompt: result.prompt, alt: result.alt, seed: result.seed, attributes: result.attributes,
            ...(result.variant !== 'branded' ? { prompt_variant: result.variant } : {}),
            generated_at: new Date().toISOString(),
          };
          if (previous && previous.file !== stored.file) removeIfUnused(outDir, manifest, previous.file);
          generated++;
          if (result.variant !== 'branded') fallbacks++;
          const note = result.attempts > 1 ? ` (flagged, used ${result.variant} prompt, seed ${result.seed})` : '';
          console.log(`  [${generated + failed}/${pending.length}] ${key}${note}`);
          if (generated % 10 === 0) saveManifest(outDir, manifest);
        } catch (err) {
          failed++;
          console.error(`  [${generated + failed}/${pending.length}] FAILED ${key}: ${err.message}`);
          if (err.status === 401 || err.status === 403) { interrupted = true; console.error('Authentication failed – check .env.cloudflare.'); }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
  }

  // ── 4. Map ads to images and write outputs ─────────────────────────────────
  manifest.listings = {};
  let unmapped = 0;
  for (const [key, group] of groups) {
    if (!manifest.images[key]) { unmapped += group.listingIds.length; continue; }
    for (const id of group.listingIds) manifest.listings[id] = [key];
  }
  saveManifest(outDir, manifest);
  writeContactSheet(outDir, manifest);

  console.log(`\nDone: ${generated} generated (${fallbacks} after being flagged), ${failed} failed. ${Object.keys(manifest.listings).length} ads mapped, ${unmapped} without an image.`);
  console.log(`Manifest: ${join(outDir, 'manifest.json')}`);
  console.log(`Contact sheet: ${join(outDir, 'index.html')}`);
  if (failed) process.exitCode = 1;
}

/**
 * Generates one image. When the safety filter flags the output (often logos, cover art or characters
 * of strongly branded products), retries with new random seeds, then with the brand-free generic prompt.
 */
async function generateWithFallback(client, item, { granularity, width, height, seed }) {
  const attempts = [
    { variant: 'branded', seed },
    ...Array.from({ length: FLAGGED_SEED_RETRIES }, () => ({ variant: 'branded-reseed', seed: randomInt(2_147_483_647) })),
    { variant: 'generic', seed },
  ];
  let lastError;
  for (const [index, attempt] of attempts.entries()) {
    const { prompt, alt, attributes } = describe(item, granularity, { generic: attempt.variant === 'generic' });
    try {
      const bytes = await client.generate({ prompt, width, height, seed: attempt.seed });
      return { bytes, prompt, alt, attributes, seed: attempt.seed, variant: attempt.variant, attempts: index + 1 };
    } catch (err) {
      if (err.code !== FLAGGED_OUTPUT) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

function loadCredentials(envFile) {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error(`CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set (in ${envFile} or the environment).`);
  }
  return { accountId, apiToken };
}

function removeIfUnused(outDir, manifest, file) {
  const stillUsed = Object.values(manifest.images).some(img => img.file === file);
  const path = join(outDir, file);
  if (!stillUsed && existsSync(path)) unlinkSync(path);
}

function parseKeyList(value) {
  if (!value) return new Set();
  const raw = value.startsWith('@') ? readFileSync(value.slice(1), 'utf8').split('\n') : value.split(',');
  return new Set(raw.map(s => s.trim()).filter(Boolean));
}

function parseFilter(value) {
  const index = value.indexOf('=');
  if (index < 1) throw new Error(`--only expects field=value, got "${value}"`);
  return [value.slice(0, index), value.slice(index + 1)];
}

function parseDimension(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 256 || n > 1920) throw new Error(`${name} must be an integer between 256 and 1920`);
  return n;
}

function parsePositive(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
  return n;
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
