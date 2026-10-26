const TOKEN_PATTERN = /[a-zA-Z0-9æøåÆØÅäöüÄÖÜé]+/g;

const SYNTHETIC_RECOMMERCE_SYNONYMS = {
  phone: ['mobil', 'mobiltelefon', 'smartphone'],
  mobil: ['phone', 'mobiltelefon'],
  mobiltelefon: ['phone', 'mobil'],
  laptop: ['bærbar', 'notebook'],
  'bærbar': ['laptop'],
  tv: ['tv', 'fjernsyn'],
  fjernsyn: ['tv'],
  headphones: ['hodetelefoner', 'headset'],
  hodetelefoner: ['headphones'],
  speaker: ['høyttaler'],
  'høyttaler': ['speaker'],
  console: ['spillkonsoll', 'konsoll'],
  spillkonsoll: ['console', 'game console'],
  sofa: ['couch', 'sofa'],
  couch: ['sofa'],
  chair: ['stol'],
  stol: ['chair'],
  table: ['bord'],
  bord: ['table'],
  bed: ['seng'],
  seng: ['bed'],
  lamp: ['lampe'],
  lampe: ['lamp'],
  rug: ['teppe'],
  teppe: ['rug'],
  jacket: ['jakke'],
  jakke: ['jacket'],
  coat: ['kåpe', 'frakk'],
  sweater: ['genser'],
  genser: ['sweater'],
  shoes: ['sko'],
  sko: ['shoes'],
  sneakers: ['joggesko'],
  joggesko: ['sneakers', 'running shoes'],
  boots: ['støvler'],
  'støvler': ['boots'],
  bag: ['veske'],
  veske: ['bag', 'handbag'],
  watch: ['klokke', 'armbåndsur'],
  klokke: ['watch', 'clock'],
  stroller: ['barnevogn'],
  barnevogn: ['stroller'],
  bicycle: ['sykkel', 'bike'],
  bike: ['sykkel', 'bicycle'],
  sykkel: ['bicycle', 'bike'],
  skis: ['ski'],
  ski: ['skis'],
  tent: ['telt'],
  telt: ['tent'],
  guitar: ['gitar'],
  gitar: ['guitar'],
  book: ['bok'],
  bok: ['book'],
  vinyl: ['lp', 'plate'],
  lp: ['vinyl'],
  antique: ['antikk', 'vintage'],
  antikk: ['antique', 'vintage'],
  vintage: ['retro', 'antikk'],
  retro: ['vintage'],
  used: ['brukt'],
  brukt: ['used'],
  new: ['ny', 'ubrukt'],
  ny: ['new'],
  ubrukt: ['unused', 'new'],
  mower: ['gressklipper'],
  gressklipper: ['lawn mower'],
  drill: ['drill', 'bormaskin'],
  bormaskin: ['drill'],
  grill: ['grill'],
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
 * Creates a query preprocessor with Norwegian/English recommerce synonym expansion.
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
      for (const synonym of (SYNTHETIC_RECOMMERCE_SYNONYMS[token] || [])) {
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
