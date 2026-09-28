const TOKEN_PATTERN = /[a-zA-Z0-9æøåÆØÅ]+/g;

const SYNTHETIC_VEHICLE_SYNONYMS = {
  car: ['bil'],
  bil: ['car'],
  suv: ['crossover', 'jeep'],
  crossover: ['suv'],
  electric: ['elbil', 'ev', 'elektrisk'],
  elbil: ['electric', 'ev'],
  ev: ['electric', 'elbil'],
  hybrid: ['ladbar'],
  petrol: ['bensin'],
  bensin: ['petrol'],
  diesel: ['diesel'],
  automatic: ['automat', 'automatgir'],
  automat: ['automatic'],
  manual: ['manuell', 'manuelt'],
  manuell: ['manual'],
  hatchback: ['kombi'],
  estate: ['stasjonsvogn'],
  stasjonsvogn: ['estate'],
  sedan: ['sedan'],
  van: ['minivan', 'varebil'],
  coupe: ['sportsbil'],
  sportsbil: ['coupe'],
  awd: ['firehjulsdrift', '4x4'],
  firehjulsdrift: ['awd', '4x4'],
  oslo: ['oslo sentrum'],
  bergen: ['vestland'],
  stavanger: ['rogaland'],
  trondheim: ['trondelag'],
};

/**
 * @typedef {Object} PreparedQuery
 * @property {string} normalizedText
 * @property {string[]} tokens
 * @property {string[]} expandedQueries
 * @property {string|null} languageHint
 */

/**
 * Creates a query preprocessor with Norwegian/English vehicle synonym expansion.
 * @param {{ expansion_enabled: boolean, short_query_token_threshold: number, max_rewrites: number }} searchConfig
 * @returns {{ prepare: function(string, string=): PreparedQuery, tokenize: function(string): string[] }}
 */
export function createQueryPreprocessor(searchConfig) {
  const cache = new Map();

  /**
   * Extracts lowercase alphanumeric tokens from text.
   * @param {string} text
   * @returns {string[]}
   */
  function tokenize(text) {
    return [...(text.matchAll(TOKEN_PATTERN))].map(m => m[0].toLowerCase());
  }

  /**
   * Returns true if the token list is short enough to warrant expansion.
   * @param {string[]} tokens
   * @returns {boolean}
   */
  function shouldExpand(tokens) {
    return searchConfig.expansion_enabled && tokens.length > 0 && tokens.length <= searchConfig.short_query_token_threshold;
  }

  /**
   * Generates synonym-rewritten query variants for a token list.
   * @param {string[]} tokens
   * @returns {string[]}
   */
  function expandTokens(tokens) {
    const rewrites = [];
    const seen = new Set();
    for (const token of tokens) {
      for (const synonym of (SYNTHETIC_VEHICLE_SYNONYMS[token] || [])) {
        const candidate = [...tokens, synonym].join(' ');
        if (!seen.has(candidate)) {
          seen.add(candidate);
          rewrites.push(candidate);
          if (rewrites.length >= searchConfig.max_rewrites) return rewrites;
        }
      }
    }
    return rewrites;
  }

  /**
   * Tokenises a query and optionally generates synonym expansions.
   * @param {string} queryText
   * @param {string=} languageHint
   * @returns {PreparedQuery}
   */
  function prepare(queryText, languageHint) {
    const tokens = tokenize(queryText || '');
    const normalizedText = tokens.join(' ');
    let expansions = cache.get(normalizedText) || [];
    if (!expansions.length && shouldExpand(tokens)) {
      expansions = expandTokens(tokens);
      cache.set(normalizedText, expansions);
    }
    return { normalizedText, tokens, expandedQueries: expansions, languageHint: languageHint ?? null };
  }

  return { prepare, tokenize };
}
