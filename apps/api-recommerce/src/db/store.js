import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  listing_id TEXT PRIMARY KEY,
  snapshot_date TEXT,
  county TEXT,
  municipality TEXT,
  location_cluster TEXT,
  coarse_geo_cell TEXT,
  category TEXT,
  category_label TEXT,
  subcategory TEXT,
  subcategory_label TEXT,
  brand TEXT,
  model TEXT,
  condition TEXT,
  condition_label TEXT,
  sale_type TEXT,
  seller_type TEXT,
  age_years INTEGER,
  color TEXT,
  material TEXT,
  size TEXT,
  shipping_available INTEGER,
  shipping_cost INTEGER,
  has_original_box INTEGER,
  has_receipt INTEGER,
  has_warranty INTEGER,
  asking_price INTEGER,
  total_price INTEGER,
  days_on_market INTEGER,
  listing_status TEXT,
  title TEXT,
  text TEXT,
  description_synthetic TEXT,
  feature_tags TEXT,
  image_stub_ids TEXT,
  latitude REAL,
  longitude REAL,
  embedding TEXT,
  run_id TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  user_segment TEXT,
  started_at TEXT,
  query_ids TEXT,
  run_id TEXT
);

CREATE TABLE IF NOT EXISTS queries (
  query_id TEXT PRIMARY KEY,
  session_id TEXT,
  user_segment TEXT,
  raw_query TEXT,
  filters TEXT,
  sort_choice TEXT,
  created_at TEXT,
  run_id TEXT
);

CREATE TABLE IF NOT EXISTS ranking_labels (
  query_id TEXT,
  listing_id TEXT,
  rank INTEGER,
  utility_score REAL,
  relevance_label INTEGER,
  run_id TEXT,
  PRIMARY KEY (query_id, listing_id)
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT,
  listing_id TEXT,
  event_type TEXT,
  occurred_at TEXT,
  dwell_seconds INTEGER,
  rank_position INTEGER,
  utility_score REAL,
  run_id TEXT
);

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  config_hash TEXT,
  seed INTEGER,
  generated_at TEXT,
  listing_count INTEGER,
  summary_json TEXT,
  evaluation_json TEXT,
  privacy_json TEXT
);

CREATE TABLE IF NOT EXISTS item_images (
  listing_id TEXT,
  position INTEGER,
  file TEXT,
  content_type TEXT,
  alt TEXT,
  width INTEGER,
  height INTEGER,
  PRIMARY KEY (listing_id, position)
);

CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  listing_id UNINDEXED,
  county UNINDEXED,
  text_content,
  tokenize='unicode61'
);

CREATE INDEX IF NOT EXISTS idx_runs_config_hash ON runs(config_hash);
CREATE INDEX IF NOT EXISTS idx_items_run_id ON items(run_id);
CREATE INDEX IF NOT EXISTS idx_items_county ON items(county);
CREATE INDEX IF NOT EXISTS idx_sessions_run_id ON sessions(run_id);
CREATE INDEX IF NOT EXISTS idx_queries_run_id ON queries(run_id);
CREATE INDEX IF NOT EXISTS idx_ranking_labels_run_id ON ranking_labels(run_id);
CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
`;

/**
 * Opens (or creates) the SQLite database, applies schema and migrations, and returns the store API.
 * @param {string} [dbPath]
 * @returns {Object}
 */
export function openStore(dbPath) {
  const db = new DatabaseSync(dbPath || ':memory:');
  db.exec(SCHEMA);
  db.exec('PRAGMA journal_mode=WAL');

  // Rebuild the FTS5 table if it is missing columns or was created contentless
  // (a contentless table returns NULL for listing_id, which breaks the lexical join).
  try {
    const sample = db.prepare('SELECT listing_id, county FROM items_fts LIMIT 1').get();
    if (sample && sample.listing_id == null) throw new Error('contentless FTS table');
  } catch (_) {
    db.exec('DROP TABLE IF EXISTS items_fts');
    db.exec("CREATE VIRTUAL TABLE items_fts USING fts5(listing_id UNINDEXED, county UNINDEXED, text_content, tokenize='unicode61')");
  }

  // Migrations for existing databases
  for (const col of ['latitude REAL', 'longitude REAL', 'embedding TEXT', 'title TEXT', 'text TEXT']) {
    try { db.exec(`ALTER TABLE items ADD COLUMN ${col}`); } catch (_) {}
  }
  for (const col of ['summary_json TEXT', 'evaluation_json TEXT', 'privacy_json TEXT']) {
    try { db.exec(`ALTER TABLE runs ADD COLUMN ${col}`); } catch (_) {}
  }

  const insertItem = db.prepare(`
    INSERT OR REPLACE INTO items (
      listing_id, snapshot_date, county, municipality, location_cluster, coarse_geo_cell,
      category, category_label, subcategory, subcategory_label, brand, model,
      condition, condition_label, sale_type, seller_type, age_years, color, material, size,
      shipping_available, shipping_cost, has_original_box, has_receipt, has_warranty,
      asking_price, total_price, days_on_market, listing_status,
      title, text, description_synthetic, feature_tags, image_stub_ids,
      latitude, longitude, run_id
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  const insertSession = db.prepare(`
    INSERT OR REPLACE INTO sessions (session_id, user_segment, started_at, query_ids, run_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertQuery = db.prepare(`
    INSERT OR REPLACE INTO queries (query_id, session_id, user_segment, raw_query, filters, sort_choice, created_at, run_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRankingLabel = db.prepare(`
    INSERT OR REPLACE INTO ranking_labels (query_id, listing_id, rank, utility_score, relevance_label, run_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertEvent = db.prepare(`
    INSERT OR REPLACE INTO events (event_id, session_id, listing_id, event_type, occurred_at, dwell_seconds, rank_position, utility_score, run_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRun = db.prepare(`
    INSERT OR REPLACE INTO runs (run_id, config_hash, seed, generated_at, listing_count, summary_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const stmtHasBehavior = db.prepare('SELECT COUNT(*) as n FROM sessions WHERE run_id = ?');

  return {
    db,

    /** @param {{ run_id: string, config_hash: string, seed: number, generated_at: string, listing_count: number, summary_json?: string|null }} params */
    saveRun({ run_id, config_hash, seed, generated_at, listing_count, summary_json = null }) {
      insertRun.run(run_id, config_hash, seed, generated_at, listing_count, summary_json);
    },

    /**
     * Persists an item batch inside a transaction.
     * @param {import('../schema/item.js').Item[]} items
     * @param {string} runId
     */
    saveListings(items, runId) {
      db.exec('BEGIN');
      let committed = false;
      try {
        for (const it of items) {
          insertItem.run(
            it.listing_id, it.snapshot_date, it.county, it.municipality, it.location_cluster, it.coarse_geo_cell,
            it.category, it.category_label, it.subcategory, it.subcategory_label, it.brand ?? null, it.model,
            it.condition, it.condition_label, it.sale_type, it.seller_type, it.age_years,
            it.color ?? null, it.material ?? null, it.size ?? null,
            it.shipping_available ? 1 : 0, it.shipping_cost,
            it.has_original_box ? 1 : 0, it.has_receipt ? 1 : 0, it.has_warranty ? 1 : 0,
            it.asking_price, it.total_price, it.days_on_market, it.listing_status,
            it.title, it.text, it.description_synthetic,
            JSON.stringify(it.feature_tags), JSON.stringify(it.image_stub_ids),
            it.latitude ?? null, it.longitude ?? null, runId
          );
        }
        db.exec('COMMIT');
        committed = true;
      } finally {
        if (!committed) db.exec('ROLLBACK');
      }
    },

    /**
     * Persists all behavior tables (sessions, queries, labels, events) inside a single transaction.
     * @param {{ sessions: any[], queries: any[], ranking_labels: any[], events: any[] }} behavior
     * @param {string} runId
     */
    saveBehavior(behavior, runId) {
      db.exec('BEGIN');
      let committed = false;
      try {
        for (const s of behavior.sessions) {
          insertSession.run(s.session_id, s.user_segment, s.started_at, JSON.stringify(s.query_ids), runId);
        }
        for (const q of behavior.queries) {
          insertQuery.run(q.query_id, q.session_id, q.user_segment, q.raw_query, JSON.stringify(q.filters), q.sort_choice, q.created_at, runId);
        }
        for (const l of behavior.ranking_labels) {
          insertRankingLabel.run(l.query_id, l.listing_id, l.rank, l.utility_score, l.relevance_label, runId);
        }
        for (const e of behavior.events) {
          insertEvent.run(e.event_id, e.session_id, e.listing_id ?? null, e.event_type, e.occurred_at, e.dwell_seconds ?? null, e.rank_position ?? null, e.utility_score ?? null, runId);
        }
        db.exec('COMMIT');
        committed = true;
      } finally {
        if (!committed) db.exec('ROLLBACK');
      }
    },

    /**
     * Loads all items for a run from SQLite, deserialising JSON columns and boolean flags.
     * @param {string} runId
     * @returns {import('../schema/item.js').Item[]}
     */
    getListingsByRunId(runId) {
      return db.prepare('SELECT * FROM items WHERE run_id = ?').all(runId).map(row => ({
        ...row,
        feature_tags: JSON.parse(row.feature_tags),
        image_stub_ids: JSON.parse(row.image_stub_ids),
        shipping_available: Boolean(row.shipping_available),
        has_original_box: Boolean(row.has_original_box),
        has_receipt: Boolean(row.has_receipt),
        has_warranty: Boolean(row.has_warranty),
      }));
    },

    /**
     * Returns true if the sessions table contains rows for the given run.
     * @param {string} runId
     * @returns {boolean}
     */
    hasBehavior(runId) {
      return stmtHasBehavior.get(runId).n > 0;
    },

    /**
     * Loads all four behavior tables for a run from SQLite, deserialising JSON columns.
     * @param {string} runId
     * @returns {{ sessions: any[], queries: any[], ranking_labels: any[], events: any[] }}
     */
    getBehaviorByRunId(runId) {
      const sessions = db.prepare('SELECT * FROM sessions WHERE run_id = ?').all(runId)
        .map(r => ({ ...r, query_ids: JSON.parse(r.query_ids) }));
      const queries = db.prepare('SELECT * FROM queries WHERE run_id = ?').all(runId)
        .map(r => ({ ...r, filters: JSON.parse(r.filters) }));
      const ranking_labels = db.prepare('SELECT * FROM ranking_labels WHERE run_id = ?').all(runId);
      const events = db.prepare('SELECT * FROM events WHERE run_id = ?').all(runId);
      return { sessions, queries, ranking_labels, events };
    },

    /**
     * Computes per-listing behavior signal scores directly in SQL for a given run.
     * @param {string} runId
     * @returns {import('../search/adapters.js').BehaviorSignalMap}
     */
    getBehaviorSignals(runId) {
      const totals = {};
      const counts = {};
      const labels = db.prepare('SELECT listing_id, utility_score, relevance_label FROM ranking_labels WHERE run_id = ?').all(runId);
      for (const r of labels) {
        totals[r.listing_id] = (totals[r.listing_id] || 0) + r.utility_score + r.relevance_label * 0.08;
        counts[r.listing_id] = (counts[r.listing_id] || 0) + 1;
      }
      const events = db.prepare("SELECT listing_id, event_type FROM events WHERE run_id = ? AND listing_id IS NOT NULL AND event_type IN ('click','save','contact')").all(runId);
      const BONUS = { click: 0.12, save: 0.22, contact: 0.35 };
      for (const e of events) {
        totals[e.listing_id] = (totals[e.listing_id] || 0) + BONUS[e.event_type];
        counts[e.listing_id] = (counts[e.listing_id] || 0) + 1;
      }
      const result = {};
      for (const id of Object.keys(totals)) result[id] = Math.round((totals[id] / counts[id]) * 10000) / 10000;
      return result;
    },

    /**
     * Persists the evaluation summary JSON to the run record.
     * @param {string} runId
     * @param {Object} evaluationSummary
     */
    saveEvaluation(runId, evaluationSummary) {
      db.prepare('UPDATE runs SET evaluation_json = ? WHERE run_id = ?').run(JSON.stringify(evaluationSummary), runId);
    },

    /**
     * Persists the privacy report JSON to the run record.
     * @param {string} runId
     * @param {Object} privacyReport
     */
    savePrivacy(runId, privacyReport) {
      db.prepare('UPDATE runs SET privacy_json = ? WHERE run_id = ?').run(JSON.stringify(privacyReport), runId);
    },

    /**
     * Persists document embeddings (JSON-encoded float arrays) into the items table.
     * @param {Map<string, number[]>} embeddingMap
     * @param {string} runId
     */
    saveEmbeddings(embeddingMap, runId) {
      const stmt = db.prepare('UPDATE items SET embedding = ? WHERE listing_id = ? AND run_id = ?');
      db.exec('BEGIN');
      let committed = false;
      try {
        for (const [id, emb] of embeddingMap) stmt.run(JSON.stringify(emb), id, runId);
        db.exec('COMMIT');
        committed = true;
      } finally {
        if (!committed) db.exec('ROLLBACK');
      }
    },

    /**
     * Loads all non-null embeddings for a run as a Map keyed by listing_id.
     * @param {string} runId
     * @returns {Map<string, number[]>}
     */
    getEmbeddingsByRunId(runId) {
      const rows = db.prepare('SELECT listing_id, embedding FROM items WHERE run_id = ? AND embedding IS NOT NULL').all(runId);
      return new Map(rows.map(r => [r.listing_id, JSON.parse(r.embedding)]));
    },

    /**
     * Populates the FTS5 virtual table with text content entries.
     * @param {{ listing_id: string, text_content: string }[]} entries
     */
    saveFTS(entries) {
      const stmt = db.prepare('INSERT INTO items_fts(listing_id, county, text_content) VALUES (?, ?, ?)');
      db.exec('BEGIN');
      let committed = false;
      try {
        for (const { listing_id, county, text_content } of entries) stmt.run(listing_id, county, text_content);
        db.exec('COMMIT');
        committed = true;
      } finally {
        if (!committed) db.exec('ROLLBACK');
      }
    },

    /**
     * Returns true if the FTS5 table has been populated.
     * @returns {boolean}
     */
    hasFTS() {
      return db.prepare('SELECT COUNT(*) as n FROM items_fts').get().n > 0;
    },

    /**
     * Replaces all image references with the given rows (one row per image of an item).
     * @param {{ listing_id: string, position: number, file: string, content_type: string, alt: string, width: number|null, height: number|null }[]} rows
     */
    replaceImages(rows) {
      const stmt = db.prepare('INSERT INTO item_images (listing_id, position, file, content_type, alt, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)');
      db.exec('BEGIN');
      let committed = false;
      try {
        db.exec('DELETE FROM item_images');
        for (const r of rows) stmt.run(r.listing_id, r.position, r.file, r.content_type, r.alt, r.width, r.height);
        db.exec('COMMIT');
        committed = true;
      } finally {
        if (!committed) db.exec('ROLLBACK');
      }
    },

    /**
     * Loads all image references as a Map keyed by listing_id, each list ordered by position.
     * @returns {Map<string, { file: string, content_type: string, alt: string, width: number|null, height: number|null }[]>}
     */
    getImages() {
      const images = new Map();
      for (const r of db.prepare('SELECT * FROM item_images ORDER BY listing_id, position').all()) {
        if (!images.has(r.listing_id)) images.set(r.listing_id, []);
        images.get(r.listing_id).push({ file: r.file, content_type: r.content_type, alt: r.alt, width: r.width, height: r.height });
      }
      return images;
    },

    /**
     * Finds the most recent run matching a config hash, or null if none exists.
     * @param {string} configHash
     * @returns {Object|null}
     */
    findRunByConfigHash(configHash) {
      return db.prepare('SELECT * FROM runs WHERE config_hash = ? ORDER BY generated_at DESC LIMIT 1').get(configHash) || null;
    },

    /** Closes the database connection. */
    close() { db.close(); },
  };
}
