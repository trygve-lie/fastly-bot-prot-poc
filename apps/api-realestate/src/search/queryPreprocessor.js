const TOKEN_PATTERN = /[a-zA-Z0-9æøåÆØÅ]+/g;

const SYNTHETIC_HOUSING_SYNONYMS = {
  apartment: ['flat', 'leilighet'],
  flat: ['apartment', 'leilighet'],
  leilighet: ['apartment', 'flat'],
  house: ['hus', 'detached'],
  hus: ['house', 'detached'],
  detached: ['house', 'hus'],
  townhouse: ['rekkehus'],
  rekkehus: ['townhouse'],
  semi: ['semi detached'],
  cabin: ['hytte'],
  hytte: ['cabin'],
  balcony: ['balkong'],
  balkong: ['balcony'],
  parking: ['parkering'],
  parkering: ['parking'],
  garden: ['hage'],
  hage: ['garden'],
  view: ['utsikt'],
  utsikt: ['view'],
  transit: ['kollektiv'],
  kollektiv: ['transit'],
  oslo: ['oslo sentrum'],
  bergen: ['vestland'],
  stavanger: ['rogaland'],
  trondheim: ['trondelag'],
};

/**
 * @typedef {Object} PreparedQuery
 * @property {string} normalizedText - Lowercased, tokenised, re-joined query text.
 * @property {string[]} tokens - Individual lowercase tokens.
 * @property {string[]} expandedQueries - Synonym-rewritten query strings.
 * @property {string|null} languageHint
 */

/**
 * @typedef {Object} QueryPreprocessor
 * @property {function(string, string=): PreparedQuery} prepare - Tokenises and optionally expands a query.
 * @property {function(string): string[]} tokenize - Extracts lowercase tokens from text.
 */

/**
 * Creates a query preprocessor with Norwegian/English synonym expansion.
 * @param {{ expansion_enabled: boolean, short_query_token_threshold: number, max_rewrites: number }} searchConfig
 * @returns {QueryPreprocessor}
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
   * Returns true if the token list is short enough to warrant synonym expansion.
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
      for (const synonym of (SYNTHETIC_HOUSING_SYNONYMS[token] || [])) {
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
