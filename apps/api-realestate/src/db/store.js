import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS listings (
  listing_id TEXT PRIMARY KEY,
  snapshot_date TEXT,
  county TEXT,
  municipality TEXT,
  neighborhood_cluster TEXT,
  coarse_geo_cell TEXT,
  property_type TEXT,
  ownership_form TEXT,
  sale_type TEXT,
  seller_type TEXT,
  bedrooms INTEGER,
  bathrooms INTEGER,
  floor INTEGER,
  total_floors INTEGER,
  size_m2 REAL,
  plot_m2 REAL,
  build_year INTEGER,
  condition TEXT,
  energy_rating TEXT,
  has_balcony INTEGER,
  has_terrace INTEGER,
  has_parking INTEGER,
  has_elevator INTEGER,
  has_garden INTEGER,
  has_view INTEGER,
  asking_price INTEGER,
  total_price INTEGER,
  common_costs_monthly INTEGER,
  price_per_m2 INTEGER,
  days_on_market INTEGER,
  listing_status TEXT,
  title TEXT,
  text TEXT,
  description_synthetic TEXT,
  amenity_tags TEXT,
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

CREATE VIRTUAL TABLE IF NOT EXISTS listings_fts USING fts5(
  listing_id UNINDEXED,
  county UNINDEXED,
  text_content,
  content='',
  tokenize='unicode61'
);

CREATE INDEX IF NOT EXISTS idx_runs_config_hash ON runs(config_hash);
CREATE INDEX IF NOT EXISTS idx_listings_run_id ON listings(run_id);
CREATE INDEX IF NOT EXISTS idx_listings_county ON listings(county);
CREATE INDEX IF NOT EXISTS idx_sessions_run_id ON sessions(run_id);
CREATE INDEX IF NOT EXISTS idx_queries_run_id ON queries(run_id);
CREATE INDEX IF NOT EXISTS idx_ranking_labels_run_id ON ranking_labels(run_id);
CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
`;

/**
 * @typedef {Object} RunRecord
 * @property {string} run_id
 * @property {string} config_hash
 * @property {number} seed
 * @property {string} generated_at
 * @property {number} listing_count
 * @property {string|null} summary_json
 * @property {string|null} evaluation_json
 * @property {string|null} privacy_json
 */

/**
 * Opens (or creates) the SQLite database, applies schema and migrations, and returns the store API.
 * @param {string} [dbPath] - File path; defaults to ':memory:' if omitted.
 * @returns {Object} Store object with all persistence methods.
 */
export function openStore(dbPath) {
  const db = new DatabaseSync(dbPath || ':memory:');
  db.exec(SCHEMA);
  db.exec('PRAGMA journal_mode=WAL');

  // Rebuild FTS5 table if county column is missing (schema upgrade)
  try {
    db.prepare('SELECT county FROM listings_fts LIMIT 0').all();
  } catch (_) {
    db.exec('DROP TABLE IF EXISTS listings_fts');
    db.exec("CREATE VIRTUAL TABLE listings_fts USING fts5(listing_id UNINDEXED, county UNINDEXED, text_content, content='', tokenize='unicode61')");
  }

  // Migrations for existing databases
  for (const col of ['latitude REAL', 'longitude REAL', 'embedding TEXT', 'title TEXT', 'text TEXT']) {
    try { db.exec(`ALTER TABLE listings ADD COLUMN ${col}`); } catch (_) {}
  }
  for (const col of ['summary_json TEXT', 'evaluation_json TEXT', 'privacy_json TEXT']) {
    try { db.exec(`ALTER TABLE runs ADD COLUMN ${col}`); } catch (_) {}
  }

  const insertListing = db.prepare(`
    INSERT OR REPLACE INTO listings (
      listing_id, snapshot_date, county, municipality, neighborhood_cluster,
      coarse_geo_cell, property_type, ownership_form, sale_type, seller_type,
      bedrooms, bathrooms, floor, total_floors, size_m2, plot_m2,
      build_year, condition, energy_rating, has_balcony, has_terrace, has_parking,
      has_elevator, has_garden, has_view, asking_price, total_price,
      common_costs_monthly, price_per_m2, days_on_market, listing_status,
      title, text, description_synthetic, amenity_tags, image_stub_ids,
      latitude, longitude, run_id
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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

    /** @param {import('../schema/listing.js').Listing[]} listings @param {string} runId */
    saveListings(listings, runId) {
      db.exec('BEGIN');
      let committed = false;
      try {
        for (const l of listings) {
          insertListing.run(
            l.listing_id, l.snapshot_date, l.county, l.municipality, l.neighborhood_cluster,
            l.coarse_geo_cell, l.property_type, l.ownership_form, l.sale_type, l.seller_type,
            l.bedrooms, l.bathrooms, l.floor ?? null, l.total_floors ?? null, l.size_m2, l.plot_m2 ?? null,
            l.build_year, l.condition, l.energy_rating, l.has_balcony ? 1 : 0, l.has_terrace ? 1 : 0,
            l.has_parking ? 1 : 0, l.has_elevator ? 1 : 0, l.has_garden ? 1 : 0, l.has_view ? 1 : 0,
            l.asking_price, l.total_price, l.common_costs_monthly, l.price_per_m2, l.days_on_market,
            l.listing_status, l.title, l.text, l.description_synthetic,
            JSON.stringify(l.amenity_tags), JSON.stringify(l.image_stub_ids),
            l.latitude ?? null, l.longitude ?? null, runId
          );
        }
        db.exec('COMMIT');
        committed = true;
      } finally {
        if (!committed) db.exec('ROLLBACK');
      }
    },

    /** @param {{ sessions: any[], queries: any[], ranking_labels: any[], events: any[] }} behavior @param {string} runId */
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

    /** @param {string} runId @returns {import('../schema/listing.js').Listing[]} */
    getListingsByRunId(runId) {
      return db.prepare('SELECT * FROM listings WHERE run_id = ?').all(runId).map(row => ({
        ...row,
        amenity_tags: JSON.parse(row.amenity_tags),
        image_stub_ids: JSON.parse(row.image_stub_ids),
        has_balcony: Boolean(row.has_balcony),
        has_terrace: Boolean(row.has_terrace),
        has_parking: Boolean(row.has_parking),
        has_elevator: Boolean(row.has_elevator),
        has_garden: Boolean(row.has_garden),
        has_view: Boolean(row.has_view),
      }));
    },

    /** @param {string} runId @returns {boolean} */
    hasBehavior(runId) {
      return stmtHasBehavior.get(runId).n > 0;
    },

    /** @param {string} runId @returns {{ sessions: any[], queries: any[], ranking_labels: any[], events: any[] }} */
    getBehaviorByRunId(runId) {
      const sessions = db.prepare('SELECT * FROM sessions WHERE run_id = ?').all(runId)
        .map(r => ({ ...r, query_ids: JSON.parse(r.query_ids) }));
      const queries = db.prepare('SELECT * FROM queries WHERE run_id = ?').all(runId)
        .map(r => ({ ...r, filters: JSON.parse(r.filters) }));
      const ranking_labels = db.prepare('SELECT * FROM ranking_labels WHERE run_id = ?').all(runId);
      const events = db.prepare('SELECT * FROM events WHERE run_id = ?').all(runId);
      return { sessions, queries, ranking_labels, events };
    },

    /** @param {string} runId @returns {import('../search/adapters.js').BehaviorSignalMap} */
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

    /** @param {string} runId @param {import('../evaluation/runner.js').EvaluationSummary} evaluationSummary */
    saveEvaluation(runId, evaluationSummary) {
      db.prepare('UPDATE runs SET evaluation_json = ? WHERE run_id = ?').run(JSON.stringify(evaluationSummary), runId);
    },

    /** @param {string} runId @param {Object} privacyReport */
    savePrivacy(runId, privacyReport) {
      db.prepare('UPDATE runs SET privacy_json = ? WHERE run_id = ?').run(JSON.stringify(privacyReport), runId);
    },

    /** @param {Map<string, number[]>} embeddingMap @param {string} runId */
    saveEmbeddings(embeddingMap, runId) {
      const stmt = db.prepare('UPDATE listings SET embedding = ? WHERE listing_id = ? AND run_id = ?');
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

    /** @param {string} runId @returns {Map<string, number[]>} */
    getEmbeddingsByRunId(runId) {
      const rows = db.prepare('SELECT listing_id, embedding FROM listings WHERE run_id = ? AND embedding IS NOT NULL').all(runId);
      return new Map(rows.map(r => [r.listing_id, JSON.parse(r.embedding)]));
    },

    /** @param {{ listing_id: string, county: string, text_content: string }[]} entries */
    saveFTS(entries) {
      const stmt = db.prepare('INSERT INTO listings_fts(listing_id, county, text_content) VALUES (?, ?, ?)');
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

    /** @returns {boolean} */
    hasFTS() {
      return db.prepare('SELECT COUNT(*) as n FROM listings_fts').get().n > 0;
    },

    /** @param {string} configHash @returns {RunRecord|null} */
    findRunByConfigHash(configHash) {
      return db.prepare('SELECT * FROM runs WHERE config_hash = ? ORDER BY generated_at DESC LIMIT 1').get(configHash) || null;
    },

    close() { db.close(); },
  };
}
