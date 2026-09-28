import { createHash } from 'node:crypto';

const PHONE_RE = /\b(?:\+47\s?)?\d{8}\b/;
const EMAIL_RE = /\b\S+@\S+\.\S+\b/;
const ADDRESS_RE = /\b\d{1,4}\s+[A-Za-zÆØÅæøå]+(?:\s+[A-Za-zÆØÅæøå]+){0,3}\s+(?:gate|gata|vei|veien|road|street)\b/i;

/**
 * Returns a set of unique lowercase tokens from text, for Jaccard fingerprinting.
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenFingerprint(text) {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter(t => t));
}

/**
 * Scans a single text field for phone numbers, email addresses, and address patterns.
 * @param {{ listing_id: string }} listing
 * @param {string} fieldName
 * @param {string} text
 * @returns {Object[]} Array of warning objects.
 */
function scanTextPatterns(listing, fieldName, text) {
  const warnings = [];
  if (PHONE_RE.test(text)) warnings.push({ warning_type: 'phone_number', severity: 'high', listing_id: listing.listing_id, field_name: fieldName, message: 'Contains phone-like sequence' });
  if (EMAIL_RE.test(text)) warnings.push({ warning_type: 'email', severity: 'high', listing_id: listing.listing_id, field_name: fieldName, message: 'Contains email-like string' });
  if (ADDRESS_RE.test(text)) warnings.push({ warning_type: 'address_pattern', severity: 'high', listing_id: listing.listing_id, field_name: fieldName, message: 'Contains exact-address-like pattern' });
  return warnings;
}

/**
 * Runs all privacy checks over a listing corpus and returns a structured report.
 * @param {import('../schema/listing.js').Listing[]} listings
 * @param {string} configHash
 * @param {number} seed
 * @returns {Object} Privacy report with warnings and summary counts.
 */
export function buildPrivacyReport(listings, configHash, seed) {
  const warnings = [];
  const seenTextHashes = new Map();
  let nearDuplicateCount = 0;
  let schemaValidationErrors = 0;

  for (const listing of listings) {
    for (const fieldName of ['title', 'text', 'description_synthetic']) {
      const text = listing[fieldName];
      warnings.push(...scanTextPatterns(listing, fieldName, text));
      const digest = createHash('sha256').update(text, 'utf-8').digest('hex');
      if (seenTextHashes.has(digest)) {
        const [prevId, prevField] = seenTextHashes.get(digest);
        if (prevId !== listing.listing_id) {
          warnings.push({ warning_type: 'exact_duplicate_text', severity: 'medium', listing_id: listing.listing_id, field_name: fieldName, message: `Matches ${prevId}:${prevField}` });
        }
      } else {
        seenTextHashes.set(digest, [listing.listing_id, fieldName]);
      }
    }
  }

  // Near-duplicate detection via token fingerprint bucketing
  const fingerprinted = listings.map(l => ({ id: l.listing_id, tokens: tokenFingerprint(l.description_synthetic) }));
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

  // Quasi-identifier uniqueness check
  const quasiCounts = new Map();
  for (const l of listings) {
    const key = `${l.county}|${l.municipality}|${l.property_type}|${l.bedrooms}|${Math.round(l.size_m2 / 10) * 10}|${Math.round(l.total_price / 500_000) * 500_000}`;
    quasiCounts.set(key, (quasiCounts.get(key) || 0) + 1);
  }
  let highRiskCount = 0;
  for (const l of listings) {
    const key = `${l.county}|${l.municipality}|${l.property_type}|${l.bedrooms}|${Math.round(l.size_m2 / 10) * 10}|${Math.round(l.total_price / 500_000) * 500_000}`;
    if (quasiCounts.get(key) === 1 && l.total_price > 15_000_000) {
      highRiskCount++;
      warnings.push({ warning_type: 'quasi_identifier_uniqueness', severity: 'low', listing_id: l.listing_id, field_name: 'listing', message: 'Rare high-price combination across county, municipality, property type, size, bedrooms, and price bucket' });
    }
  }

  const exactDuplicateCount = warnings.filter(w => w.warning_type === 'exact_duplicate_text').length;
  return {
    generated_at: new Date().toISOString(),
    config_hash: configHash,
    seed,
    listing_count: listings.length,
    exact_duplicate_text_count: exactDuplicateCount,
    near_duplicate_text_count: nearDuplicateCount,
    high_risk_quasi_identifier_count: highRiskCount,
    schema_validation_errors: schemaValidationErrors,
    warnings,
  };
}
