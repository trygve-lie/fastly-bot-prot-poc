import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { generateListings, buildSummary } from './generation/listings.js';
import { generateSessions, buildBehaviorSummary } from './generation/behavior.js';
import { createSearchApplication } from './search/application.js';
import { buildPrivacyReport } from './privacy/checks.js';
import { runEvaluation } from './evaluation/runner.js';
import { openStore } from './db/store.js';
import { createApiRouter } from './routes/api.js';
import { createFrontendRouter } from './routes/frontend.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = resolve(__dirname, '../configs/listings.base.json');
const DEFAULT_DB = resolve(__dirname, '../data.db');
const DEFAULT_PORT = process.env.PORT ? Number(process.env.PORT) : 3002;
const DEFAULT_HOST = process.env.HOST ?? '0.0.0.0';

/**
 * Loads or generates all application state (listings, behavior, search index) and opens the store.
 * @param {import('./config.js').Config} config
 * @param {string} dbPath
 * @returns {{ config: import('./config.js').Config, app: Object, store: Object, runId: string, listings: import('./schema/listing.js').Listing[], behavior: Object, listingsSummary: Object, privacySummary: Object, evaluationSummary: import('./evaluation/runner.js').EvaluationSummary|null }}
 */
function buildDemoState(config, dbPath) {
  const store = openStore(dbPath);
  const configHash = config.configHash();

  let listings;
  let listingsSummary;
  let runId;
  let existingRun = store.findRunByConfigHash(configHash);

  if (existingRun) {
    runId = existingRun.run_id;
    console.log(`Loading ${existingRun.listing_count} listings from SQLite (run ${runId})`);
    listings = store.getListingsByRunId(runId);
    listingsSummary = existingRun.summary_json ? JSON.parse(existingRun.summary_json) : buildSummary(config, listings);
  } else {
    console.log(`Generating ${config.listing_count} listings with seed ${config.seed}…`);
    listings = generateListings(config);
    listingsSummary = buildSummary(config, listings);
    runId = `run-${config.seed}-${configHash.slice(0, 8)}`;
    store.saveRun({ run_id: runId, config_hash: configHash, seed: config.seed, generated_at: new Date().toISOString(), listing_count: listings.length, summary_json: JSON.stringify(listingsSummary) });
    store.saveListings(listings, runId);
    console.log(`Persisted ${listings.length} listings to SQLite`);
    existingRun = { run_id: runId };
  }

  let behavior;
  if (store.hasBehavior(runId)) {
    console.log('Loading behavior from SQLite…');
    const { sessions, queries, ranking_labels, events } = store.getBehaviorByRunId(runId);
    const summary = buildBehaviorSummary(config, sessions, queries, ranking_labels, events);
    behavior = { sessions, queries, ranking_labels, events, summary };
  } else {
    console.log('Generating behavior…');
    behavior = generateSessions(config, listings);
    store.saveBehavior(behavior, runId);
  }

  // Load or compute privacy report
  let privacySummary;
  if (existingRun.privacy_json) {
    privacySummary = JSON.parse(existingRun.privacy_json);
  } else {
    privacySummary = buildPrivacyReport(listings, configHash, config.seed);
    store.savePrivacy(runId, privacySummary);
  }

  // Load evaluation summary if already persisted
  const evaluationSummary = existingRun.evaluation_json ? JSON.parse(existingRun.evaluation_json) : null;

  // Load pre-computed embeddings (empty Map on first cold start)
  const preloadedEmbeddings = store.getEmbeddingsByRunId(runId);
  const isFirstRun = preloadedEmbeddings.size === 0;

  console.log('Building search index…');
  const app = createSearchApplication(config, listings, behavior, { store, runId, preloadedEmbeddings });

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

  return { config, app, store, runId, listings, behavior, listingsSummary, privacySummary, evaluationSummary };
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

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) configPath = resolve(args[++i]);
    else if (args[i] === '--host' && args[i + 1]) host = args[++i];
    else if (args[i] === '--port' && args[i + 1]) port = parseInt(args[++i]);
    else if (args[i] === '--db' && args[i + 1]) dbPath = resolve(args[++i]);
  }

  const config = loadConfig(configPath);
  console.log(`Config loaded: seed=${config.seed}, listings=${config.listing_count}`);

  let state = null;

  const shutdown = () => { try { state?.store.close(); } catch (_) {} process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  const app = new Hono();
  app.get('/health', c => c.json({ status: state ? 'ok' : 'starting' }, state ? 200 : 503));
  app.use('*', (c, next) => {
    if (!state) return c.json({ error: 'Service is starting, please retry shortly' }, 503);
    return next();
  });

  serve({ fetch: app.fetch, port, hostname: host }, info => {
    console.log(`Listening on http://${host}:${info.port} — building demo state…`);

    setImmediate(() => {
      state = buildDemoState(config, dbPath);
      console.log('Demo state ready.');

      app.route('/', createApiRouter(state));
      app.route('/', createFrontendRouter(state));

      if (!state.evaluationSummary) {
        setImmediate(() => {
          console.log('Running evaluation…');
          try {
            const result = runEvaluation(config, state.listings, state.behavior, state.privacySummary.warnings.length);
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
