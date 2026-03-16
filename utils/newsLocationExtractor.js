'use strict';

/**
 * utils/newsLocationExtractor.js
 *
 * Lightweight location context extractor for news articles.
 *
 * Scans article title and description text for US state names, "City, ST"
 * patterns, and known US city names.  Returns structured locationTags and a
 * localityLevel that downstream pipelines can persist alongside the article.
 *
 * Designed to be used by ingestion pipelines (category, sports, social) that
 * previously persisted articles with no location tags at all.
 */

const { US_STATES_AND_TERRITORIES, canonicalizeStateCode } = require('./newsLocationTaxonomy');
const { inferCityLocationFromText } = require('../data/news/cityLocationIndex');

// ---------------------------------------------------------------------------
// Build lookup structures once at module load
// ---------------------------------------------------------------------------

/** Map<lowercaseName, lowercaseCode>  e.g. "florida" → "fl" */
const STATE_NAME_TO_CODE = new Map(
  US_STATES_AND_TERRITORIES
    .filter((s) => s.code.length === 2)
    .map((s) => [s.name.toLowerCase(), s.code.toLowerCase()])
);

/** Set<lowercaseCode>  e.g. "fl", "tx" */
const STATE_CODES = new Set([...STATE_NAME_TO_CODE.values()]);

/** Map<lowercaseCode, lowercaseName>  e.g. "fl" → "florida" */
const STATE_CODE_TO_NAME = new Map(
  [...STATE_NAME_TO_CODE.entries()].map(([name, code]) => [code, name])
);

// Pre-build word-boundary regex for each state name, sorted longest-first so
// "West Virginia" matches before "Virginia", "New York" before "York", etc.
const STATE_NAME_PATTERNS = [...STATE_NAME_TO_CODE.entries()]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([name, code]) => ({
    name,
    code,
    pattern: new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  }));

/**
 * Extract location context from a title + description text pair.
 *
 * Returns `null` when no US location signal is found, otherwise:
 * ```
 * {
 *   locationTags: { zipCodes, cities, counties, states, countries },
 *   localityLevel: 'city' | 'state' | 'global',
 *   scopeReason: string,
 *   scopeConfidence: number
 * }
 * ```
 */
function extractLocationContext(title = '', description = '') {
  const fullText = `${title} ${description}`;
  const lower = fullText.toLowerCase();

  const detectedStates = new Set();   // lowercase codes, e.g. "fl"
  const detectedCities = new Set();   // lowercase city names

  // -----------------------------------------------------------------------
  // 1. "City, ST" pattern  (e.g. "Tampa, FL" or "San Marcos, TX")
  //    High-confidence: the author explicitly paired a city and state code.
  // -----------------------------------------------------------------------
  const cityStateMatches = fullText.match(/\b([A-Z][a-zA-Z.'\s]{1,25}),\s*([A-Z]{2})\b/g) || [];
  for (const m of cityStateMatches) {
    const parts = m.split(',').map((s) => s.trim());
    if (parts.length !== 2) continue;
    const abbrev = parts[1].toLowerCase();
    if (!STATE_CODES.has(abbrev)) continue;
    detectedStates.add(abbrev);
    detectedCities.add(parts[0].toLowerCase().trim());
  }

  // -----------------------------------------------------------------------
  // 2. Full state name with word-boundary matching
  //    Matches "Florida" but not "florida" inside "floridation".
  //    Longest-first ordering prevents "Virginia" eating "West Virginia".
  // -----------------------------------------------------------------------
  const alreadyMatchedRanges = [];
  for (const { name, code, pattern } of STATE_NAME_PATTERNS) {
    const match = pattern.exec(lower);
    if (!match) continue;

    // Guard against substring overlaps: if this match range is already
    // covered by a longer state name, skip it.
    const start = match.index;
    const end = start + match[0].length;
    const overlaps = alreadyMatchedRanges.some(
      ([s, e]) => start >= s && end <= e
    );
    if (overlaps) continue;
    alreadyMatchedRanges.push([start, end]);

    detectedStates.add(code);
  }

  // -----------------------------------------------------------------------
  // 3. Known US city names from the city location index
  //    Uses case-sensitive matching (capital-first) to avoid false positives
  //    with common words (e.g. "reading" vs "Reading, PA").
  // -----------------------------------------------------------------------
  if (detectedStates.size === 0 && detectedCities.size === 0) {
    const cityMatch = inferCityLocationFromText(fullText);
    if (cityMatch && cityMatch.stateAbbrev) {
      detectedCities.add(cityMatch.city.toLowerCase());
      detectedStates.add(cityMatch.stateAbbrev.toLowerCase());
    }
  }

  // -----------------------------------------------------------------------
  // Build result
  // -----------------------------------------------------------------------
  if (detectedStates.size === 0) return null;

  const states = [];
  for (const code of detectedStates) {
    states.push(code);
    const name = STATE_CODE_TO_NAME.get(code);
    if (name) states.push(name);
  }

  const localityLevel = detectedCities.size > 0 ? 'city' : 'state';
  const scopeConfidence = detectedCities.size > 0 ? 0.75 : 0.6;

  return {
    locationTags: {
      zipCodes: [],
      cities: [...detectedCities],
      counties: [],
      states: [...new Set(states)],
      countries: ['us'],
    },
    localityLevel,
    scopeReason: detectedCities.size > 0 ? 'city_mention' : 'state_mention',
    scopeConfidence,
  };
}

module.exports = { extractLocationContext };
