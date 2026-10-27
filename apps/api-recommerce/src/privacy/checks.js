import { createHash } from 'node:crypto';
import { isWithinMunicipalityAreas } from '../generation/geo.js';

const PHONE_RE = /\b(?:\+47\s?)?\d{8}\b/;
const EMAIL_RE = /\b\S+@\S+\.\S+\b/;
const ADDRESS_RE = /\b\d{1,4}\s+[A-Za-zÆØÅæøå]+(?:\s+[A-Za-zÆØÅæøå]+){0,3}\s+(?:gate|gata|vei|veien|road|street)\b/i;

/**
 * Returns a set of unique lowercase tokens from text for Jaccard fingerprinting.
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenFingerprint(text) {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter(t => t));
}

/**
 * Scans a text field for phone, email, and address patterns.
 * @param {{ listing_id: string }} item
 * @param {string} fieldName
 * @param {string} text
 * @returns {Object[]}
 */
function scanTextPatterns(item, fieldName, text) {
  const warnings = [];
  if (PHONE_RE.test(text)) warnings.push({ warning_type: 'phone_number', severity: 'high', listing_id: item.listing_id, field_name: fieldName, message: 'Contains phone-like sequence' });
  if (EMAIL_RE.test(text)) warnings.push({ warning_type: 'email', severity: 'high', listing_id: item.listing_id, field_name: fieldName, message: 'Contains email-like string' });
  if (ADDRESS_RE.test(text)) warnings.push({ warning_type: 'address_pattern', severity: 'high', listing_id: item.listing_id, field_name: fieldName, message: 'Contains exact-address-like pattern' });
  return warnings;
}

/**
 * Runs all privacy checks over an item corpus and returns a structured report.
 * @param {import('../schema/item.js').Item[]} items
 * @param {string} configHash
 * @param {number} seed
 * @returns {Object}
 */
export function buildPrivacyReport(items, configHash, seed) {
  const warnings = [];
  const seenTextHashes = new Map();
  let nearDuplicateCount = 0;
  let schemaValidationErrors = 0;

  for (const item of items) {
    if (item.latitude != null && !isWithinMunicipalityAreas(item.municipality, item.latitude, item.longitude)) {
      warnings.push({ warning_type: 'geo_outside_area', severity: 'medium', listing_id: item.listing_id, field_name: 'latitude/longitude', message: `Position is outside the populated areas of ${item.municipality}` });
    }
    for (const fieldName of ['title', 'text', 'description_synthetic']) {
      const text = item[fieldName];
      warnings.push(...scanTextPatterns(item, fieldName, text));
      const digest = createHash('sha256').update(text, 'utf-8').digest('hex');
      if (seenTextHashes.has(digest)) {
        const [prevId, prevField] = seenTextHashes.get(digest);
        if (prevId !== item.listing_id) {
          warnings.push({ warning_type: 'exact_duplicate_text', severity: 'medium', listing_id: item.listing_id, field_name: fieldName, message: `Matches ${prevId}:${prevField}` });
        }
      } else {
        seenTextHashes.set(digest, [item.listing_id, fieldName]);
      }
    }
  }

  const fingerprinted = items.map(it => ({ id: it.listing_id, tokens: tokenFingerprint(it.description_synthetic) }));
  const buckets = new Map();
  for (const { id, tokens } of fingerprinted) {
    const sorted = [...tokens].sort();
    const key = `${tokens.size}:${sorted.slice(0, 3).join(',')}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ id, tokens });
  }

  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i++) {
      const { id: leftId, tokens: left } = bucket[i];
      for (let j = i + 1; j < bucket.length; j++) {
        const { id: rightId, tokens: right } = bucket[j];
        if (leftId === rightId || !left.size || !right.size) continue;
        const intersect = [...left].filter(t => right.has(t)).length;
        const union = new Set([...left, ...right]).size;
        const jaccard = intersect / union;
        if (jaccard >= 0.96) {
          nearDuplicateCount++;
          warnings.push({ warning_type: 'near_duplicate_text', severity: 'medium', listing_id: leftId, field_name: 'description_synthetic', message: `Near duplicate of ${rightId} with token Jaccard ${jaccard.toFixed(2)}` });
        }
      }
    }
  }

  // Price buckets are logarithmic because recommerce prices span from tens to tens of thousands of NOK.
  const quasiKey = it => `${it.county}|${it.municipality}|${it.category}|${it.subcategory}|${it.brand ?? '-'}|${Math.round(it.age_years / 10) * 10}|${Math.floor(Math.log10(Math.max(it.total_price, 1)) * 4)}`;
  const quasiCounts = new Map();
  for (const it of items) {
    const key = quasiKey(it);
    quasiCounts.set(key, (quasiCounts.get(key) || 0) + 1);
  }
  let highRiskCount = 0;
  for (const it of items) {
    if (quasiCounts.get(quasiKey(it)) === 1 && it.total_price > 50_000) {
      highRiskCount++;
      warnings.push({ warning_type: 'quasi_identifier_uniqueness', severity: 'low', listing_id: it.listing_id, field_name: 'listing', message: 'Rare high-price combination across county, municipality, category, subcategory, brand, age bucket, and price bucket' });
    }
  }

  const exactDuplicateCount = warnings.filter(w => w.warning_type === 'exact_duplicate_text').length;
  return {
    generated_at: new Date().toISOString(),
    config_hash: configHash,
    seed,
    listing_count: items.length,
    exact_duplicate_text_count: exactDuplicateCount,
    near_duplicate_text_count: nearDuplicateCount,
    high_risk_quasi_identifier_count: highRiskCount,
    schema_validation_errors: schemaValidationErrors,
    warnings,
  };
}
