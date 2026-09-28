import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * Loads a config from a JSON file and returns a typed Config object.
 * @param {string} configPath
 * @returns {Object}
 */
export function loadConfig(configPath) {
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  return buildConfig(raw);
}

/**
 * Parses a raw config object, attaches helper methods, and returns a Config.
 * @param {Object} raw
 * @returns {Object}
 */
export function buildConfig(raw) {
  const counties = (raw.counties || []).map(c => ({
    name: String(c.name),
    municipalities: Array.from(c.municipalities),
    weight: parseFloat(c.weight),
    price_anchor: parseInt(c.price_anchor),
    urban_share: parseFloat(c.urban_share ?? 0.6),
  }));

  const calibration = {
    feature_bonus_per_tag: parseFloat(raw.calibration.feature_bonus_per_tag),
    price_noise_min: parseFloat(raw.calibration.price_noise_min),
    price_noise_max: parseFloat(raw.calibration.price_noise_max),
    new_vehicle_probability: parseFloat(raw.calibration.new_vehicle_probability),
    dealer_share: parseFloat(raw.calibration.dealer_share),
    vehicle_types: raw.calibration.vehicle_types.map(vt => ({
      name: String(vt.name),
      weight: parseFloat(vt.weight),
      price_multiplier: parseFloat(vt.price_multiplier),
      engine_kw_min: parseInt(vt.engine_kw_min),
      engine_kw_max: parseInt(vt.engine_kw_max),
      mileage_min: parseInt(vt.mileage_min),
      mileage_max: parseInt(vt.mileage_max),
      seats_typical: parseInt(vt.seats_typical),
    })),
    conditions: raw.calibration.conditions.map(c => ({
      name: String(c.name),
      weight: parseFloat(c.weight),
      model_year_min: parseInt(c.model_year_min),
      model_year_max: parseInt(c.model_year_max),
    })),
    vehicleType(name) {
      const vt = this.vehicle_types.find(v => v.name === name);
      if (!vt) throw new Error(`Unknown vehicle type: ${name}`);
      return vt;
    },
  };

  const churn = {
    timeline_days: parseInt(raw.churn.timeline_days),
    daily_new_rate: parseFloat(raw.churn.daily_new_rate),
    daily_update_rate: parseFloat(raw.churn.daily_update_rate),
    daily_removed_rate: parseFloat(raw.churn.daily_removed_rate),
    daily_sold_rate: parseFloat(raw.churn.daily_sold_rate),
    daily_relist_rate: parseFloat(raw.churn.daily_relist_rate),
    price_change_probability: parseFloat(raw.churn.price_change_probability),
    price_change_max_fraction: parseFloat(raw.churn.price_change_max_fraction),
  };

  const behavior = {
    session_count: parseInt(raw.behavior.session_count),
    min_queries_per_session: parseInt(raw.behavior.min_queries_per_session),
    max_queries_per_session: parseInt(raw.behavior.max_queries_per_session),
    max_results_per_query: parseInt(raw.behavior.max_results_per_query),
    candidate_pool_size: parseInt(raw.behavior.candidate_pool_size),
    click_threshold: parseFloat(raw.behavior.click_threshold),
    save_threshold: parseFloat(raw.behavior.save_threshold),
    contact_threshold: parseFloat(raw.behavior.contact_threshold),
    abandonment_threshold: parseFloat(raw.behavior.abandonment_threshold),
    user_segments: raw.behavior.user_segments.map(s => ({
      name: String(s.name),
      weight: parseFloat(s.weight),
      preferred_vehicle_types: Array.from(s.preferred_vehicle_types),
      preferred_features: Array.from(s.preferred_features),
      preferred_regions: Array.from(s.preferred_regions),
      budget_min_ratio: parseFloat(s.budget_min_ratio),
      budget_max_ratio: parseFloat(s.budget_max_ratio),
      exploratory_share: parseFloat(s.exploratory_share),
    })),
    segment(name) {
      const seg = this.user_segments.find(s => s.name === name);
      if (!seg) throw new Error(`Unknown segment: ${name}`);
      return seg;
    },
  };

  const search = {
    embedding_dimensions: parseInt(raw.search.embedding_dimensions),
    lexical_weight: parseFloat(raw.search.lexical_weight),
    vector_weight: parseFloat(raw.search.vector_weight),
    business_weight: parseFloat(raw.search.business_weight),
    candidate_pool_size: parseInt(raw.search.candidate_pool_size),
    rerank_depth: parseInt(raw.search.rerank_depth),
    expansion_enabled: Boolean(raw.search.expansion_enabled),
    max_rewrites: parseInt(raw.search.max_rewrites),
    short_query_token_threshold: parseInt(raw.search.short_query_token_threshold),
    default_page_size: parseInt(raw.search.default_page_size),
  };

  const discovery = {
    similar_results: parseInt(raw.discovery.similar_results),
    recommendation_results: parseInt(raw.discovery.recommendation_results),
    browse_results: parseInt(raw.discovery.browse_results),
    diversity_lambda: parseFloat(raw.discovery.diversity_lambda),
    behavior_boost_weight: parseFloat(raw.discovery.behavior_boost_weight),
  };

  const config = {
    seed: parseInt(raw.seed),
    snapshot_date: String(raw.snapshot_date),
    listing_count: parseInt(raw.listing_count),
    text_mode: String(raw.text_mode),
    max_images_per_listing: parseInt(raw.max_images_per_listing),
    counties,
    calibration,
    churn,
    behavior,
    search,
    discovery,
  };

  config.configHash = function () {
    const payload = {
      seed: this.seed,
      snapshot_date: this.snapshot_date,
      listing_count: this.listing_count,
      text_mode: this.text_mode,
      max_images_per_listing: this.max_images_per_listing,
      counties: this.counties.map(c => ({
        name: c.name,
        municipalities: c.municipalities,
        weight: c.weight,
        price_anchor: c.price_anchor,
      })),
      calibration: {
        feature_bonus_per_tag: this.calibration.feature_bonus_per_tag,
        price_noise_min: this.calibration.price_noise_min,
        price_noise_max: this.calibration.price_noise_max,
        new_vehicle_probability: this.calibration.new_vehicle_probability,
        dealer_share: this.calibration.dealer_share,
        vehicle_types: this.calibration.vehicle_types,
        conditions: this.calibration.conditions,
      },
      churn: this.churn,
      behavior: {
        session_count: this.behavior.session_count,
        min_queries_per_session: this.behavior.min_queries_per_session,
        max_queries_per_session: this.behavior.max_queries_per_session,
        max_results_per_query: this.behavior.max_results_per_query,
        candidate_pool_size: this.behavior.candidate_pool_size,
        click_threshold: this.behavior.click_threshold,
        save_threshold: this.behavior.save_threshold,
        contact_threshold: this.behavior.contact_threshold,
        abandonment_threshold: this.behavior.abandonment_threshold,
        user_segments: this.behavior.user_segments.map(s => ({
          name: s.name,
          weight: s.weight,
          preferred_vehicle_types: s.preferred_vehicle_types,
          preferred_features: s.preferred_features,
          preferred_regions: s.preferred_regions,
          budget_min_ratio: s.budget_min_ratio,
          budget_max_ratio: s.budget_max_ratio,
          exploratory_share: s.exploratory_share,
        })),
      },
      search: this.search,
      discovery: this.discovery,
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  };

  return config;
}

/**
 * Produces a new Config with selected fields overridden, re-binding helper methods.
 * @param {Object} config
 * @param {{ listing_count?: number, session_count?: number, timeline_days?: number, search?: Object }} [overrides={}]
 * @returns {Object}
 */
export function overrideConfig(config, overrides = {}) {
  const rawCalibration = {
    feature_bonus_per_tag: config.calibration.feature_bonus_per_tag,
    price_noise_min: config.calibration.price_noise_min,
    price_noise_max: config.calibration.price_noise_max,
    new_vehicle_probability: config.calibration.new_vehicle_probability,
    dealer_share: config.calibration.dealer_share,
    vehicle_types: config.calibration.vehicle_types,
    conditions: config.calibration.conditions,
  };

  const rawBehavior = {
    session_count: overrides.session_count ?? config.behavior.session_count,
    min_queries_per_session: config.behavior.min_queries_per_session,
    max_queries_per_session: config.behavior.max_queries_per_session,
    max_results_per_query: config.behavior.max_results_per_query,
    candidate_pool_size: config.behavior.candidate_pool_size,
    click_threshold: config.behavior.click_threshold,
    save_threshold: config.behavior.save_threshold,
    contact_threshold: config.behavior.contact_threshold,
    abandonment_threshold: config.behavior.abandonment_threshold,
    user_segments: config.behavior.user_segments,
  };

  return buildConfig({
    seed: config.seed,
    snapshot_date: config.snapshot_date,
    listing_count: overrides.listing_count ?? config.listing_count,
    text_mode: config.text_mode,
    max_images_per_listing: config.max_images_per_listing,
    counties: config.counties,
    calibration: rawCalibration,
    churn: {
      ...config.churn,
      ...(overrides.timeline_days != null ? { timeline_days: overrides.timeline_days } : {}),
    },
    behavior: rawBehavior,
    search: overrides.search ?? config.search,
    discovery: config.discovery,
  });
}
