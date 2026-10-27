import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Scalar } from '@scalar/hono-api-reference';
import { serve } from '@hono/node-server';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { generateItems, buildSummary } from './generation/items.js';
import { derivedFields, DERIVED_FIELDS_VERSION } from './generation/derived.js';
import { generateSessions } from './generation/behavior.js';
import { createSearchApplication } from './search/application.js';
import { buildPrivacyReport } from './privacy/checks.js';
import { runEvaluation } from './evaluation/runner.js';
import { openStore } from './db/store.js';
import { readImageManifest } from './images/manifest.js';
import { createApiRouter } from './routes/api.js';
import { createFrontendRouter } from './routes/frontend.js';
import { createImageRouter } from './routes/images.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = resolve(__dirname, '../configs/items.base.json');
const DEFAULT_DB = resolve(__dirname, '../data.db');
const DEFAULT_IMAGES = resolve(__dirname, '../images');
const DEFAULT_PORT = process.env.PORT ? Number(process.env.PORT) : 3003;
const DEFAULT_HOST = process.env.HOST ?? '0.0.0.0';

/**
 * Loads or generates all application state (items, behavior, search index, images) and opens the store.
 * @param {Object} config
 * @param {string} dbPath
 * @param {string} imagesDir
 * @returns {Object}
 */
function buildDemoState(config, dbPath, imagesDir) {
  const store = openStore(dbPath);
  const configHash = config.configHash();

  let items;
  let itemsSummary;
  let runId;
  let existingRun = store.findRunByConfigHash(configHash);

  if (existingRun) {
    runId = existingRun.run_id;
    console.log(`Loading ${existingRun.listing_count} items from SQLite (run ${runId})`);
    items = store.getListingsByRunId(runId);
    itemsSummary = existingRun.summary_json ? JSON.parse(existingRun.summary_json) : buildSummary(config, items);
  } else {
    console.log(`Generating ${config.listing_count} items with seed ${config.seed}…`);
    items = generateItems(config);
    itemsSummary = buildSummary(config, items);
    runId = `run-${config.seed}-${configHash.slice(0, 8)}`;
    store.saveRun({ run_id: runId, config_hash: configHash, seed: config.seed, generated_at: new Date().toISOString(), listing_count: items.length, summary_json: JSON.stringify(itemsSummary) });
    store.saveListings(items, runId);
    console.log(`Persisted ${items.length} items to SQLite`);
    existingRun = { run_id: runId };
  }

  // Position, area and publish minute are derived from listing_id + municipality only. Recompute them
  // in place when the stored version is outdated (also fills them on databases created before they existed).
  let derivedUpdated = false;
  if (existingRun.derived_version !== DERIVED_FIELDS_VERSION) {
    console.log(`Updating geo positions and publish times (derived fields v${DERIVED_FIELDS_VERSION})…`);
    for (const item of items) Object.assign(item, derivedFields(item.listing_id, item.municipality));
    store.updateDerivedFields(items, runId, DERIVED_FIELDS_VERSION);
    derivedUpdated = true;
  }

  // Behavior is only generated on a cold start. Search reads its behavior signals from SQLite
  // (store.getBehaviorSignals), so a warm start doesn't load the raw sessions/queries/events.
  let behavior = null;
  if (!store.hasBehavior(runId)) {
    console.log('Generating behavior…');
    behavior = generateSessions(config, items);
    store.saveBehavior(behavior, runId);
  }

  // Load or compute privacy report
  let privacySummary;
  if (existingRun.privacy_json && !derivedUpdated) {
    privacySummary = JSON.parse(existingRun.privacy_json);
  } else {
    privacySummary = buildPrivacyReport(items, configHash, config.seed);
    store.savePrivacy(runId, privacySummary);
  }

  // Load evaluation summary if already persisted
  const evaluationSummary = existingRun.evaluation_json ? JSON.parse(existingRun.evaluation_json) : null;

  // Load pre-computed embeddings (empty Map on first cold start)
  const preloadedEmbeddings = store.getEmbeddingsByRunId(runId);
  const isFirstRun = preloadedEmbeddings.size === 0;

  console.log('Building search index…');
  const app = createSearchApplication(config, items, behavior, { store, runId, preloadedEmbeddings });

  // On cold start (no pre-computed embeddings), save them for future warm starts
  if (isFirstRun) {
    console.log('Saving embeddings to SQLite…');
    const embeddingMap = new Map(app.documentRepository.list().map(d => [d.listing_id, d.embedding]));
    store.saveEmbeddings(embeddingMap, runId);
  }

  // Populate FTS5 index if not already present
  if (!store.hasFTS()) {
    console.log('Building FTS5 index…');
    const ftsEntries = app.documentRepository.list().map(doc => ({
      listing_id: doc.listing_id,
      county: doc.county,
      text_content: [doc.title, doc.body, doc.county, doc.municipality].join(' '),
    }));
    store.saveFTS(ftsEntries);
  }

  // Sync image references from the image manifest (written by an external generator) on every start.
  // Without a manifest the table is cleared, so the API never references files that are not served.
  const imageRows = readImageManifest(imagesDir);
  store.replaceImages(imageRows ?? []);
  const images = store.getImages();
  console.log(imageRows
    ? `Loaded ${imageRows.length} image references for ${images.size} items from ${imagesDir}`
    : `No image manifest in ${imagesDir}; items have no images`);

  // Per-listing fields the API adds to items and hits (kept out of the search documents).
  const listingMeta = new Map(items.map(it => [it.listing_id, {
    latitude: it.latitude, longitude: it.longitude, location_area: it.location_area,
    publish_minute: it.publish_minute, days_on_market: it.days_on_market,
  }]));

  return { config, app, store, runId, items, behavior, itemsSummary, privacySummary, evaluationSummary, images, imagesDir, listingMeta };
}

/**
 * Entry point: binds the HTTP port immediately, then builds demo state asynchronously.
 * Returns 503 on all non-health routes until state is ready, so the port is always
 * reachable (no TCP connect timeouts) even during a cold-start generation run.
 * @returns {Promise<void>}
 */
async function main() {
  const args = process.argv.slice(2);
  let configPath = DEFAULT_CONFIG;
  let host = DEFAULT_HOST;
  let port = DEFAULT_PORT;
  let dbPath = DEFAULT_DB;
  let imagesDir = DEFAULT_IMAGES;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) configPath = resolve(args[++i]);
    else if (args[i] === '--host' && args[i + 1]) host = args[++i];
    else if (args[i] === '--port' && args[i + 1]) port = parseInt(args[++i]);
    else if (args[i] === '--db' && args[i + 1]) dbPath = resolve(args[++i]);
    else if (args[i] === '--images' && args[i + 1]) imagesDir = resolve(args[++i]);
  }

  const config = loadConfig(configPath);
  console.log(`Config loaded: seed=${config.seed}, items=${config.listing_count}`);

  let state = null;

  const shutdown = () => { try { state?.store.close(); } catch (_) {} process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  const app = new Hono();
  // Public, read-only API: any origin may call it from the browser (no cookies or credentials).
  // Registered first so preflights and 503 responses during startup also carry CORS headers.
  app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type'], maxAge: 86400 }));
  app.get('/health', c => c.json({ status: state ? 'ok' : 'starting' }, state ? 200 : 503));
  app.use('*', (c, next) => {
    if (!state) return c.json({ error: 'Service is starting, please retry shortly' }, 503);
    return next();
  });

  serve({ fetch: app.fetch, port, hostname: host }, info => {
    console.log(`Listening on http://${host}:${info.port} — building demo state…`);

    setImmediate(() => {
      state = buildDemoState(config, dbPath, imagesDir);
      console.log('Demo state ready.');

      app.route('/', createApiRouter(state));
      app.route('/', createImageRouter(state));
      app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'api-recommerce API reference' }));
      app.route('/', createFrontendRouter(state));

      if (!state.evaluationSummary) {
        setImmediate(() => {
          console.log('Running evaluation…');
          try {
            const behavior = state.behavior ?? state.store.getBehaviorByRunId(state.runId);
            const result = runEvaluation(config, state.items, behavior, state.privacySummary.warnings.length);
            state.evaluationSummary = result.summary;
            state.store.saveEvaluation(state.runId, result.summary);
            console.log('Evaluation complete.');
          } catch (err) {
            console.error('Evaluation failed:', err);
          }
        });
      }
    });
  });
}

main().catch(err => { console.error(err); process.exit(1); });
