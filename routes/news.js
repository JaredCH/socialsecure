const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Parser = require('rss-parser');
const NodeGeocoder = require('node-geocoder');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Import models
const Article = require('../models/Article');
const RssSource = require('../models/RssSource');
const NewsPreferences = require('../models/NewsPreferences');
const NewsIngestionRecord = require('../models/NewsIngestionRecord');
const User = require('../models/User');
const {
  calculateViralScore,
  createMomentumMap,
  getArticleMomentumSignal,
  summarizeSignals
} = require('../services/newsViralScore');
const {
  findZipLocation,
  findZipLocationByCityState
} = require('../services/zipLocationIndex');

// Initialize RSS parser with timeout
const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'SocialSecure-NewsBot/1.0'
  },
  customFields: {
    feed: [
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['media:content', 'mediaContent', { keepArray: true }]
    ],
    item: [
      ['content:encoded', 'contentEncoded'],
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['dc:creator', 'dcCreator'],
      ['geo:lat', 'geoLat'],
      ['geo:long', 'geoLong']
    ]
  }
});

const DEFAULT_PROMOTED_ITEMS = Math.max(1, parseInt(process.env.NEWS_PROMOTED_MAX_ITEMS || '10', 10) || 10);
const FEED_PROMOTED_MAX_ITEMS = 20;
const PROMOTED_ENDPOINT_MAX_ITEMS = 50;
const NEWS_SCOPE_VALUES = ['local', 'regional', 'national', 'global'];
const KEYWORD_MATCH_WEIGHT = 100;
const SCOPE_TIER_WEIGHT = 10;
const MAX_SCOPE_TIERS = 4;
const MAX_FEED_CANDIDATES = 400;
const DETERMINISTIC_SCOPE_WEIGHT = 2;
const LOCATION_GEOCODE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_LOCATION_QUERY_HINTS = 30;
const NEWS_LOCATION_TAGGER_V2_ENABLED = String(process.env.NEWS_LOCATION_TAGGER_V2 || 'true').toLowerCase() !== 'false';
const GDELT_ENABLED = String(process.env.GDELT_ENABLED || 'false').toLowerCase() === 'true';
const GDELT_API_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GDELT_DEFAULT_QUERIES = ['local news', 'breaking news', 'community news'];
const newsGeocoder = NodeGeocoder({
  provider: 'openstreetmap',
  httpAdapter: 'https',
  formatter: null
});

const TOPIC_FILTER_ALIASES = {
  technology: ['technology', 'tech'],
  science: ['science'],
  health: ['health'],
  business: ['business'],
  sports: ['sports', 'sport'],
  entertainment: ['entertainment'],
  politics: ['politics', 'political'],
  finance: ['finance', 'financial'],
  gaming: ['gaming', 'games', 'game'],
  ai: ['ai', 'artificial intelligence', 'machine learning']
};

// ============================================
// LOCATION DICTIONARIES
// ============================================

const US_STATE_NAMES = new Map([
  ['alabama','al'],['alaska','ak'],['arizona','az'],['arkansas','ar'],['california','ca'],
  ['colorado','co'],['connecticut','ct'],['delaware','de'],['florida','fl'],['georgia','ga'],
  ['hawaii','hi'],['idaho','id'],['illinois','il'],['indiana','in'],['iowa','ia'],
  ['kansas','ks'],['kentucky','ky'],['louisiana','la'],['maine','me'],['maryland','md'],
  ['massachusetts','ma'],['michigan','mi'],['minnesota','mn'],['mississippi','ms'],['missouri','mo'],
  ['montana','mt'],['nebraska','ne'],['nevada','nv'],['new hampshire','nh'],['new jersey','nj'],
  ['new mexico','nm'],['new york','ny'],['north carolina','nc'],['north dakota','nd'],['ohio','oh'],
  ['oklahoma','ok'],['oregon','or'],['pennsylvania','pa'],['rhode island','ri'],['south carolina','sc'],
  ['south dakota','sd'],['tennessee','tn'],['texas','tx'],['utah','ut'],['vermont','vt'],
  ['virginia','va'],['washington','wa'],['west virginia','wv'],['wisconsin','wi'],['wyoming','wy'],
  ['district of columbia','dc']
]);

const US_STATE_ABBREVS = new Set([...US_STATE_NAMES.values()]);

const COUNTRY_NAMES = new Set([
  'united states','usa','us','canada','united kingdom','uk','australia','germany','france',
  'japan','china','india','brazil','mexico','south korea','russia','italy','spain',
  'netherlands','sweden','norway','switzerland','israel','ireland','new zealand','south africa',
  'argentina','colombia','saudi arabia','turkey','poland','belgium','austria','portugal',
  'denmark','finland','czech republic','greece','romania','hungary','egypt','nigeria',
  'kenya','philippines','indonesia','thailand','vietnam','malaysia','singapore','taiwan',
  'pakistan','bangladesh','ukraine','chile','peru','venezuela'
]);

const SUPPORTED_RSS_PROVIDERS = [
  { id: 'google-news', label: 'Google News', hostPatterns: ['news.google.com'] },
  { id: 'reuters', label: 'Reuters', hostPatterns: ['reuters.com'] },
  { id: 'bbc', label: 'BBC', hostPatterns: ['bbc.co.uk', 'bbc.com'] },
  { id: 'cnn', label: 'CNN', hostPatterns: ['cnn.com'] },
  { id: 'npr', label: 'NPR', hostPatterns: ['npr.org'] },
  { id: 'associated-press', label: 'Associated Press', hostPatterns: ['apnews.com'] },
  { id: 'guardian', label: 'The Guardian', hostPatterns: ['theguardian.com'] },
  { id: 'new-york-times', label: 'New York Times', hostPatterns: ['nytimes.com'] },
  { id: 'wall-street-journal', label: 'Wall Street Journal', hostPatterns: ['wsj.com'] },
  { id: 'techcrunch', label: 'TechCrunch', hostPatterns: ['techcrunch.com'] }
];

const normalizeLocationToken = (value) => String(value || '').trim().toLowerCase();
const normalizeTopicToken = (value) => String(value || '').trim().toLowerCase();
const normalizeZipCode = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
const normalizeUsZipCode = (value) => normalizeZipCode(value).split('-')[0];
const geocodeContextCache = new Map();

const toUniqueNonEmptyStrings = (values = []) => [...new Set(values
  .map((value) => String(value || '').trim())
  .filter(Boolean))];

const toUniqueNonEmptyLocationTokens = (values = []) => [...new Set(values
  .map((value) => normalizeLocationToken(value))
  .filter(Boolean))];

const getTopicAliases = (topic) => {
  const normalized = normalizeTopicToken(topic);
  if (!normalized) return [];
  return TOPIC_FILTER_ALIASES[normalized] || [normalized];
};

const detectProviderIdFromUrl = (url) => {
  try {
    const hostname = new URL(String(url || '')).hostname.toLowerCase();
    const provider = SUPPORTED_RSS_PROVIDERS.find((candidate) =>
      candidate.hostPatterns.some((pattern) => hostname.includes(pattern))
    );
    return provider?.id || 'generic-rss';
  } catch (error) {
    return 'generic-rss';
  }
};

const getTextContent = (item = {}) => {
  return [
    item.title,
    item.contentSnippet,
    item.content,
    item.contentEncoded,
    item.summary,
    item.isoDate,
    item.dcCreator,
    ...(Array.isArray(item.categories) ? item.categories : [])
  ]
    .filter(Boolean)
    .map((value) => String(value))
    .join(' ');
};

const inferLocationTokensFromText = (input = '') => {
  const text = String(input || '');
  const lower = text.toLowerCase();
  const tokens = [];

  // Match US and Canadian zip codes
  const usZipMatches = text.match(/\b\d{5}(?:-\d{4})?\b/g) || [];
  const canadaZipMatches = text.match(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/gi) || [];
  tokens.push(
    ...usZipMatches.map((zip) => normalizeZipCode(zip)),
    ...canadaZipMatches.map((zip) => normalizeZipCode(zip))
  );

  // Match "in/at/from/near <Place>" phrases
  const locationPhrases = lower.match(/\b(?:in|at|from|near)\s+([a-z][a-z\s\-]{1,40})\b/g) || [];
  for (const phrase of locationPhrases) {
    const normalized = phrase
      .replace(/\b(?:in|at|from|near)\s+/i, '')
      .replace(/[^a-z\s\-]/g, '')
      .trim();
    if (normalized.length >= 3) {
      tokens.push(normalized);
    }
  }

  // Match US state full names
  for (const [stateName, abbrev] of US_STATE_NAMES) {
    if (lower.includes(stateName)) {
      tokens.push(stateName, abbrev);
    }
  }

  // Match "City, ST" pattern (e.g. "Austin, TX" or "San Marcos, TX")
  const cityStateMatches = text.match(/\b([A-Z][a-zA-Z\s]{1,25}),\s*([A-Z]{2})\b/g) || [];
  for (const match of cityStateMatches) {
    const parts = match.split(',').map(s => s.trim());
    if (parts.length === 2) {
      const city = parts[0].toLowerCase();
      const stateAbbrev = parts[1].toLowerCase();
      if (US_STATE_ABBREVS.has(stateAbbrev)) {
        tokens.push(city, stateAbbrev);
        // Also add the full state name
        for (const [name, abbr] of US_STATE_NAMES) {
          if (abbr === stateAbbrev) { tokens.push(name); break; }
        }
      }
    }
  }

  // Match country names mentioned in text
  for (const country of COUNTRY_NAMES) {
    // Use word-boundary-style check to avoid partial matches
    const pattern = new RegExp(`\\b${country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (pattern.test(lower)) {
      tokens.push(country);
    }
  }

  return toUniqueNonEmptyLocationTokens(tokens);
};

const buildArticleLocationTokens = ({ source = {}, item = {}, query = null }) => {
  const baseTokens = [
    source.name,
    source.category,
    query,
    ...(Array.isArray(item.categories) ? item.categories : [])
  ];

  const textTokens = inferLocationTokensFromText(getTextContent(item));
  return toUniqueNonEmptyLocationTokens([...baseTokens, ...textTokens]);
};

const getItemDescription = (item = {}) => {
  return item.contentSnippet
    || item.contentEncoded
    || item.content
    || item.summary
    || '';
};

const ZIP_CODE_REGEX = /^\d{5}(?:-\d{4})?$/;
const CANADA_POSTAL_REGEX = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;

const isZipLikeToken = (token) => ZIP_CODE_REGEX.test(token) || CANADA_POSTAL_REGEX.test(token);

const normalizeLocationFieldValue = (field, value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (field === 'zipCode') {
    const normalizedZip = normalizeZipCode(trimmed);
    return isZipLikeToken(normalizedZip) ? normalizedZip : null;
  }
  return trimmed;
};

const extractZipTokens = (values = []) => toUniqueNonEmptyStrings(values
  .map((value) => normalizeZipCode(value))
  .filter((token) => token && isZipLikeToken(token)));

const extractCityStateQueryFromTitle = (title = '') => {
  const matches = String(title || '').match(/\b([A-Z][a-zA-Z\s]{1,25}),\s*([A-Z]{2})\b/g) || [];
  if (matches.length === 0) return null;
  return matches[0];
};

const parseCityStateFromTitle = (title = '') => {
  const cityStateQuery = extractCityStateQueryFromTitle(title);
  if (!cityStateQuery) return null;
  const parts = cityStateQuery.split(',').map((value) => String(value || '').trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const [cityPart, statePart] = parts;
  if (!cityPart || !statePart) return null;
  return {
    city: cityPart,
    state: statePart
  };
};

const isLikelyLocationQuery = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (extractCityStateQueryFromTitle(normalized)) return true;
  if (extractZipTokens([normalized]).length > 0) return true;
  return false;
};

const resolveAssignedZipCode = async ({ locationTokens = [], source = {}, item = {}, query = null }) => {
  const sourceZip = normalizeZipCode(source.zipCode || source.postalCode || '');
  if (sourceZip && isZipLikeToken(sourceZip)) {
    return sourceZip;
  }

  const directZip = extractZipTokens(locationTokens)[0];
  if (directZip) {
    return directZip;
  }

  const titleCityState = parseCityStateFromTitle(item.title);
  if (titleCityState) {
    try {
      const matchedZipIndexEntry = await findZipLocationByCityState({
        city: titleCityState.city,
        state: titleCityState.state,
        countryCode: source.country || source.countryCode
      });
      if (matchedZipIndexEntry?.zipCode && isZipLikeToken(normalizeZipCode(matchedZipIndexEntry.zipCode))) {
        return normalizeZipCode(matchedZipIndexEntry.zipCode);
      }
    } catch (error) {
      console.warn('News article zip index lookup failed:', titleCityState, error.message);
    }
  }

  const titleQuery = extractCityStateQueryFromTitle(item.title);
  const sourceQuery = source.location || source.address || '';
  // Intentionally omit source.name to avoid noisy per-article geocode lookups
  // against generic publisher names (for example, "BBC News").
  const queryHint = isLikelyLocationQuery(query) ? query : '';
  const geocodeQuery = titleQuery || sourceQuery || queryHint || '';
  if (!geocodeQuery) return null;

  try {
    const results = await newsGeocoder.geocode(geocodeQuery);
    const first = Array.isArray(results) ? results[0] : null;
    const geocodedZip = normalizeZipCode(first?.zipcode || first?.postalcode || first?.postalCode || '');
    if (geocodedZip && isZipLikeToken(geocodedZip)) {
      return geocodedZip;
    }
  } catch (error) {
    console.warn('News article zip assignment geocode failed:', geocodeQuery, error.message);
  }

  return null;
};

/**
 * Infer localityLevel from the detected location tokens of an article.
 * Returns 'city', 'county', 'state', 'country', or 'global'.
 */
const inferLocalityLevel = (locationTokens = []) => {
  if (!locationTokens.length) return 'global';

  const tokenSet = new Set(locationTokens.map(normalizeLocationToken));

  // Check for zip codes (US 5-digit or CA postal) → city-level
  for (const token of tokenSet) {
    if (/^\d{5}(-\d{4})?$/.test(token)) return 'city';
    if (/^[a-z]\d[a-z]\d[a-z]\d$/i.test(token)) return 'city';
  }

  // Check for US state names or abbreviations → state-level
  for (const token of tokenSet) {
    if (US_STATE_NAMES.has(token) || US_STATE_ABBREVS.has(token)) return 'state';
  }

  // Check for country names → country-level
  for (const token of tokenSet) {
    if (COUNTRY_NAMES.has(token)) return 'country';
  }

  // If we have tokens but couldn't classify, assume city-level (local place mention)
  return tokenSet.size > 0 ? 'city' : 'global';
};

const buildLocationTags = ({ locationTokens = [], assignedZipCode = null }) => {
  const normalizedTokens = toUniqueNonEmptyLocationTokens(locationTokens);
  const zipCodes = extractZipTokens([...normalizedTokens, assignedZipCode]);
  const cities = [];
  const counties = [];
  const states = [];
  const countries = [];

  for (const token of normalizedTokens) {
    if (!token || isZipLikeToken(token)) continue;
    if (token.includes(' county') || token.includes(' parish')) {
      counties.push(token);
      continue;
    }
    if (US_STATE_NAMES.has(token) || US_STATE_ABBREVS.has(token)) {
      states.push(token);
      continue;
    }
    if (COUNTRY_NAMES.has(token)) {
      countries.push(token);
      continue;
    }
    cities.push(token);
  }

  return {
    zipCodes,
    cities: toUniqueNonEmptyStrings(cities),
    counties: toUniqueNonEmptyStrings(counties),
    states: toUniqueNonEmptyStrings(states),
    countries: toUniqueNonEmptyStrings(countries)
  };
};

const deriveScopeMetadata = ({ locationTags = {}, localityLevel = 'global', locationTokens = [] }) => {
  if (Array.isArray(locationTags.zipCodes) && locationTags.zipCodes.length > 0) {
    return { scopeReason: 'zip_match', scopeConfidence: 1 };
  }
  if ((Array.isArray(locationTags.cities) && locationTags.cities.length > 0)
    || (Array.isArray(locationTags.counties) && locationTags.counties.length > 0)
    || localityLevel === 'city') {
    return { scopeReason: 'city_match', scopeConfidence: 0.85 };
  }
  if ((Array.isArray(locationTags.states) && locationTags.states.length > 0) || localityLevel === 'state') {
    return { scopeReason: 'state_match', scopeConfidence: 0.7 };
  }
  if ((Array.isArray(locationTags.countries) && locationTags.countries.length > 0) || localityLevel === 'country') {
    return { scopeReason: 'country_match', scopeConfidence: 0.55 };
  }
  if (Array.isArray(locationTokens) && locationTokens.length > 0) {
    return { scopeReason: 'nlp_only', scopeConfidence: 0.35 };
  }
  return { scopeReason: 'source_default', scopeConfidence: 0.1 };
};

const mergeLocationTagValues = (existing = {}, incoming = {}, key) => {
  const existingValues = Array.isArray(existing[key]) ? existing[key] : [];
  const incomingValues = Array.isArray(incoming[key]) ? incoming[key] : [];
  return toUniqueNonEmptyStrings([...existingValues, ...incomingValues]);
};

const mergeLocationTags = (existing = {}, incoming = {}, assignedZipCode = null) => {
  return {
    zipCodes: toUniqueNonEmptyStrings([
      ...mergeLocationTagValues(existing, incoming, 'zipCodes'),
      assignedZipCode
    ]),
    cities: mergeLocationTagValues(existing, incoming, 'cities'),
    counties: mergeLocationTagValues(existing, incoming, 'counties'),
    states: mergeLocationTagValues(existing, incoming, 'states'),
    countries: mergeLocationTagValues(existing, incoming, 'countries')
  };
};

/**
 * Compute scope quality metrics from a batch of articles.
 * Returns structured metrics for observability (Phase 4 of NEWS_LOCAL_INGESTION_PLAN).
 */
const computeScopeQualityMetrics = (articles = [], ingestionStartTime) => {
  const total = articles.length;
  if (total === 0) {
    return { total: 0, scopeReasonBreakdown: {}, deterministicTagRate: 0, latencyMs: 0 };
  }

  const scopeReasonCounts = {};
  let withZipTags = 0;
  let withStateTags = 0;
  let withCountryTags = 0;
  let deterministicCount = 0;
  const latencies = [];

  for (const article of articles) {
    const reason = article.scopeReason || 'source_default';
    scopeReasonCounts[reason] = (scopeReasonCounts[reason] || 0) + 1;

    const tags = article.locationTags || {};
    if (Array.isArray(tags.zipCodes) && tags.zipCodes.length > 0) { withZipTags++; deterministicCount++; }
    else if (Array.isArray(tags.states) && tags.states.length > 0) { withStateTags++; deterministicCount++; }
    else if (Array.isArray(tags.countries) && tags.countries.length > 0) { withCountryTags++; deterministicCount++; }

    if (article.publishedAt && article.scrapeTimestamp) {
      const published = new Date(article.publishedAt).getTime();
      const scraped = new Date(article.scrapeTimestamp).getTime();
      if (Number.isFinite(published) && Number.isFinite(scraped) && scraped >= published) {
        latencies.push(scraped - published);
      }
    }
  }

  latencies.sort((a, b) => a - b);
  const medianLatencyMs = latencies.length > 0
    ? latencies[Math.floor(latencies.length / 2)]
    : null;

  const scopeReasonBreakdown = {};
  for (const [reason, count] of Object.entries(scopeReasonCounts)) {
    scopeReasonBreakdown[reason] = {
      count,
      pct: Number(((count / total) * 100).toFixed(1))
    };
  }

  return {
    total,
    scopeReasonBreakdown,
    deterministicTagRate: Number(((deterministicCount / total) * 100).toFixed(1)),
    withZipTags,
    withStateTags,
    withCountryTags,
    medianIngestLatencyMs: medianLatencyMs,
    ingestionDurationMs: ingestionStartTime ? Date.now() - ingestionStartTime : null
  };
};

const getItemPublishedAt = (item = {}) => {
  const candidates = [item.isoDate, item.pubDate, item.published, item.updated];
  for (const candidate of candidates) {
    const parsed = candidate ? new Date(candidate) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
};

const getItemImageUrl = (item = {}) => {
  const mediaContent = Array.isArray(item.mediaContent) ? item.mediaContent[0] : item.mediaContent;
  const mediaThumbnail = Array.isArray(item.mediaThumbnail) ? item.mediaThumbnail[0] : item.mediaThumbnail;
  return item.enclosure?.url
    || mediaContent?.url
    || mediaThumbnail?.url
    || extractImageFromContent(item.contentEncoded || item.content)
    || null;
};

const hasLocationContext = (location = {}) => Boolean(
  location?.city
  || location?.county
  || location?.state
  || location?.country
  || location?.zipCode
);

const getPrimaryLocation = (preferences) => {
  if (!preferences?.locations?.length) return null;
  return preferences.locations.find((loc) => loc.isPrimary) || preferences.locations[0] || null;
};

const collectLocationValues = ({ preferences, user, field }) => {
  const preferenceValues = Array.isArray(preferences?.locations)
    ? preferences.locations.map((location) => location?.[field])
    : [];
  return toUniqueNonEmptyStrings(
    [...preferenceValues, user?.[field]]
      .map((value) => normalizeLocationFieldValue(field, value))
      .filter(Boolean)
  );
};

const getUserLocationFallback = (user) => {
  if (!user) return null;
  const fallback = {
    city: normalizeLocationFieldValue('city', user.city),
    county: normalizeLocationFieldValue('county', user.county),
    state: normalizeLocationFieldValue('state', user.state),
    country: normalizeLocationFieldValue('country', user.country),
    zipCode: normalizeLocationFieldValue('zipCode', user.zipCode)
  };
  return hasLocationContext(fallback) ? fallback : null;
};

const geocodeLocationQuery = async (query) => {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) return null;

  const now = Date.now();
  const cached = geocodeContextCache.get(normalizedQuery);
  if (cached && (now - cached.timestamp) < LOCATION_GEOCODE_CACHE_TTL_MS) {
    return { result: cached.result, cacheStatus: 'fresh' };
  }

  try {
    const results = await newsGeocoder.geocode(normalizedQuery);
    const first = Array.isArray(results) && results.length > 0 ? results[0] : null;
    geocodeContextCache.set(normalizedQuery, { result: first, timestamp: now });
    return { result: first, cacheStatus: cached ? 'refresh' : 'miss' };
  } catch (error) {
    if (cached?.result) {
      return { result: cached.result, cacheStatus: 'stale_error_reuse', error };
    }
    throw error;
  }
};

const geocodeFromLocationContext = async ({ zipCodeValues = [], cityValues = [], countyValues = [], stateValues = [], countryValues = [] }) => {
  const zipCandidates = extractZipTokens(zipCodeValues);
  const cityCandidates = toUniqueNonEmptyStrings(cityValues);
  const countyCandidates = toUniqueNonEmptyStrings(countyValues);
  const stateCandidates = toUniqueNonEmptyStrings(stateValues);
  const countryCandidates = toUniqueNonEmptyStrings(countryValues);

  for (const zipCode of zipCandidates) {
    try {
      const zipLocation = await findZipLocation(zipCode);
      if (zipLocation) {
        return {
          ...zipLocation,
          zipcode: zipLocation.zipCode || zipCode,
          postalCode: zipLocation.zipCode || zipCode,
          _newsGeocodeMeta: {
            query: zipCode,
            cacheStatus: 'zip_index'
          }
        };
      }
    } catch (error) {
      console.warn('News zip index lookup failed:', zipCode, error.message);
    }
  }

  if (cityCandidates.length > 0 && stateCandidates.length > 0) {
    for (const city of cityCandidates) {
      for (const state of stateCandidates) {
        try {
          const cityStateMatch = await findZipLocationByCityState({
            city,
            state,
            countryCode: countryCandidates[0]
          });
          if (cityStateMatch) {
            return {
              ...cityStateMatch,
              zipcode: cityStateMatch.zipCode || null,
              postalCode: cityStateMatch.zipCode || null,
              _newsGeocodeMeta: {
                query: `${city}, ${state}`,
                cacheStatus: 'zip_index'
              }
            };
          }
        } catch (error) {
          console.warn('News city/state zip index lookup failed:', `${city}, ${state}`, error.message);
        }
      }
    }
  }

  const queryHints = [];
  for (const zipCode of zipCandidates) {
    if (countryCandidates.length > 0) {
      for (const country of countryCandidates) {
        queryHints.push(`${zipCode}, ${country}`);
      }
    }
    queryHints.push(zipCode);
  }
  for (const city of cityCandidates) {
    for (const state of stateCandidates) {
      queryHints.push(`${city}, ${state}`);
    }
    for (const country of countryCandidates) {
      queryHints.push(`${city}, ${country}`);
    }
    queryHints.push(city);
  }
  for (const county of countyCandidates) {
    for (const state of stateCandidates) {
      queryHints.push(`${county}, ${state}`);
    }
    for (const country of countryCandidates) {
      queryHints.push(`${county}, ${country}`);
    }
    queryHints.push(county);
  }

  if (!queryHints.length) return null;
  const boundedQueryHints = queryHints.slice(0, MAX_LOCATION_QUERY_HINTS);

  const attemptedQueries = new Set();
  for (const query of boundedQueryHints) {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery || attemptedQueries.has(normalizedQuery)) continue;
    attemptedQueries.add(normalizedQuery);
    try {
      const geocodeResult = await geocodeLocationQuery(normalizedQuery);
      if (geocodeResult?.result) {
        return {
          ...geocodeResult.result,
          _newsGeocodeMeta: {
            query: normalizedQuery,
            cacheStatus: geocodeResult.cacheStatus
          }
        };
      }
    } catch (error) {
      console.warn('News zip geocode lookup failed:', normalizedQuery, error.message);
      continue;
    }
  }

  return null;
};

const shouldEnrichLocationContext = (context) => (
  (context.zipCodeValues.length > 0 || context.cityValues.length > 0 || context.countyValues.length > 0)
  && (!context.stateValues.length || !context.countryValues.length || !context.cityValues.length)
);

const applyZipGeocodeToLocationContext = (context, zipGeocode) => {
  const derivedCity = zipGeocode.city || zipGeocode.town || zipGeocode.village || null;
  const derivedCounty = zipGeocode.county || null;
  const derivedState = zipGeocode.state || zipGeocode.stateCode || null;
  const derivedCountry = zipGeocode.countryCode || zipGeocode.country || null;
  return {
    ...context,
    city: context.city || derivedCity,
    county: context.county || derivedCounty,
    state: context.state || derivedState,
    country: context.country || derivedCountry,
    cityValues: toUniqueNonEmptyStrings([...context.cityValues, derivedCity]),
    countyValues: toUniqueNonEmptyStrings([...context.countyValues, derivedCounty]),
    stateValues: toUniqueNonEmptyStrings([...context.stateValues, zipGeocode.state, zipGeocode.stateCode]),
    countryValues: toUniqueNonEmptyStrings([...context.countryValues, zipGeocode.country, zipGeocode.countryCode]),
    source: `${context.source}+zipLookup`
  };
};

const resolveLocationContext = async ({ preferences, user }) => {
  const primary = getPrimaryLocation(preferences);
  const fallback = getUserLocationFallback(user);
  const cityValues = collectLocationValues({ preferences, user, field: 'city' });
  const countyValues = collectLocationValues({ preferences, user, field: 'county' });
  const stateValues = collectLocationValues({ preferences, user, field: 'state' });
  const countryValues = collectLocationValues({ preferences, user, field: 'country' });
  const zipCodeValues = collectLocationValues({ preferences, user, field: 'zipCode' });

  if (hasLocationContext(primary)) {
    const primaryLocation = primary.toObject?.() || primary;
    const context = {
      city: normalizeLocationFieldValue('city', primaryLocation.city) || fallback?.city || null,
      county: normalizeLocationFieldValue('county', primaryLocation.county) || fallback?.county || null,
      state: normalizeLocationFieldValue('state', primaryLocation.state) || fallback?.state || null,
      country: normalizeLocationFieldValue('country', primaryLocation.country) || fallback?.country || null,
      zipCode: normalizeLocationFieldValue('zipCode', primaryLocation.zipCode) || fallback?.zipCode || null,
      cityValues,
      countyValues,
      stateValues,
      countryValues,
      zipCodeValues,
      source: 'preferences'
    };
    if (shouldEnrichLocationContext(context)) {
      const zipGeocode = await geocodeFromLocationContext({
        zipCodeValues: context.zipCodeValues,
        cityValues: context.cityValues,
        countyValues: context.countyValues,
        stateValues: context.stateValues,
        countryValues: context.countryValues
      });
      if (zipGeocode) {
        const nextContext = applyZipGeocodeToLocationContext(context, zipGeocode);
        if (zipGeocode?._newsGeocodeMeta?.cacheStatus === 'stale_error_reuse') {
          nextContext.source = `${nextContext.source}+cached`;
        }
        return nextContext;
      }
    }
    return context;
  }
  if (fallback) {
    const context = {
      ...fallback,
      cityValues,
      countyValues,
      stateValues,
      countryValues,
      zipCodeValues,
      source: 'profile'
    };
    if (shouldEnrichLocationContext(context)) {
      const zipGeocode = await geocodeFromLocationContext({
        zipCodeValues: context.zipCodeValues,
        cityValues: context.cityValues,
        countyValues: context.countyValues,
        stateValues: context.stateValues,
        countryValues: context.countryValues
      });
      if (zipGeocode) {
        const nextContext = applyZipGeocodeToLocationContext(context, zipGeocode);
        if (zipGeocode?._newsGeocodeMeta?.cacheStatus === 'stale_error_reuse') {
          nextContext.source = `${nextContext.source}+cached`;
        }
        return nextContext;
      }
    }
    return context;
  }

  return {
    city: null,
    county: null,
    state: null,
    country: null,
    zipCode: null,
    cityValues,
    countyValues,
    stateValues,
    countryValues,
    zipCodeValues,
    source: 'none'
  };
};

const resolveDefaultScope = ({ preferences, locationContext }) => {
  if (NEWS_SCOPE_VALUES.includes(preferences?.defaultScope)) {
    return preferences.defaultScope;
  }
  return hasLocationContext(locationContext) ? 'local' : 'global';
};

const getFallbackScopeOrder = (scope) => {
  switch (scope) {
    case 'local':
      return ['local', 'regional', 'national', 'global'];
    case 'regional':
      return ['regional', 'national', 'global'];
    case 'national':
      return ['national', 'global'];
    default:
      return ['global'];
  }
};

const scopeCanUseContext = (scope, locationContext) => {
  if (scope === 'local') return Boolean(locationContext?.cityValues?.length || locationContext?.countyValues?.length || locationContext?.zipCodeValues?.length);
  if (scope === 'regional') return Boolean(locationContext?.stateValues?.length);
  if (scope === 'national') return Boolean(locationContext?.countryValues?.length);
  return true;
};

const resolveActiveScope = ({ requestedScope, locationContext }) => {
  const chain = getFallbackScopeOrder(requestedScope);
  const activeScope = chain.find((scope) => scopeCanUseContext(scope, locationContext)) || 'global';
  return {
    activeScope,
    fallbackApplied: activeScope !== requestedScope
  };
};

const summarizeLocationContextForTelemetry = (locationContext = {}) => {
  const zipValues = extractZipTokens(locationContext.zipCodeValues || [locationContext.zipCode]);
  return {
    source: locationContext.source || 'none',
    cityCount: Array.isArray(locationContext.cityValues) ? locationContext.cityValues.length : 0,
    countyCount: Array.isArray(locationContext.countyValues) ? locationContext.countyValues.length : 0,
    stateCount: Array.isArray(locationContext.stateValues) ? locationContext.stateValues.length : 0,
    countryCount: Array.isArray(locationContext.countryValues) ? locationContext.countryValues.length : 0,
    zipCount: zipValues.length,
    hasAnyLocation: hasLocationContext(locationContext)
  };
};

const scoreRecency = (publishedAt, freshnessScore = 0) => {
  const publishedTimestamp = new Date(publishedAt || 0).getTime();
  const hoursSincePublished = publishedTimestamp ? Math.max(0, (Date.now() - publishedTimestamp) / (1000 * 60 * 60)) : 9999;
  const recencyScore = 1 / (1 + (hoursSincePublished / 12));
  const freshness = Number.isFinite(freshnessScore) ? freshnessScore : 0;
  return recencyScore + freshness;
};

const articleMentionsLocationToken = (articleLocationToken, userToken) => {
  if (!articleLocationToken || !userToken) return false;
  return articleLocationToken.includes(userToken) || userToken.includes(articleLocationToken);
};

const articleMatchesLocation = (article, locationContext) => {
  // Combine stored locations with runtime inference from title/description
  const storedLocations = Array.isArray(article.locations) ? article.locations : [];
  const textContent = `${article.title || ''} ${article.description || ''}`;
  const inferredTokens = inferLocationTokensFromText(textContent);
  const allLocationTokens = toUniqueNonEmptyLocationTokens([...storedLocations, ...inferredTokens]);

  const matchesAnyLocationValue = (values = []) => values
    .map(normalizeLocationToken)
    .filter(Boolean)
    .some((value) => allLocationTokens.some((token) => articleMentionsLocationToken(token, value)));

  const articleZipValues = extractZipTokens([...storedLocations, ...inferredTokens, article.assignedZipCode]);
  const userZipValues = extractZipTokens(locationContext?.zipCodeValues || [locationContext?.zipCode]);
  const hasZipCode = userZipValues.some((userZip) => articleZipValues.some((articleZip) => {
    if (normalizeZipCode(userZip) === normalizeZipCode(articleZip)) return true;
    if (ZIP_CODE_REGEX.test(userZip) && ZIP_CODE_REGEX.test(articleZip)) {
      return normalizeUsZipCode(userZip).slice(0, 3) === normalizeUsZipCode(articleZip).slice(0, 3);
    }
    if (CANADA_POSTAL_REGEX.test(userZip) && CANADA_POSTAL_REGEX.test(articleZip)) {
      return normalizeZipCode(userZip).slice(0, 3) === normalizeZipCode(articleZip).slice(0, 3);
    }
    return false;
  }));
  const hasCity = matchesAnyLocationValue(locationContext?.cityValues || [locationContext?.city]);
  const hasCounty = matchesAnyLocationValue(locationContext?.countyValues || [locationContext?.county]);
  const hasState = matchesAnyLocationValue(locationContext?.stateValues || [locationContext?.state]);
  const hasCountry = matchesAnyLocationValue(locationContext?.countryValues || [locationContext?.country]);

  return {
    zipCode: Boolean(hasZipCode),
    city: Boolean(hasCity),
    county: Boolean(hasCounty),
    state: Boolean(hasState),
    country: Boolean(hasCountry)
  };
};

const getScopeTier = (scope, locationMatches) => {
  if (scope === 'local') {
    if (locationMatches.zipCode || locationMatches.city) return 0;
    if (locationMatches.county) return 1;
    if (locationMatches.state) return 2;
    if (locationMatches.country) return 3;
    return 4;
  }
  if (scope === 'regional') {
    if (locationMatches.state) return 0;
    if (locationMatches.country) return 1;
    return 2;
  }
  if (scope === 'national') {
    if (locationMatches.country) return 0;
    return 1;
  }
  return 0;
};

const scoreLocalityLevel = (scope, localityLevel) => {
  const level = normalizeLocationToken(localityLevel);
  if (scope === 'local') {
    if (level === 'city') return 0.3;
    if (level === 'state') return 0.2;
    if (level === 'country') return 0.1;
    return 0;
  }
  if (scope === 'regional') {
    if (level === 'state') return 0.25;
    if (level === 'country') return 0.1;
    return 0;
  }
  if (scope === 'national') {
    return level === 'country' ? 0.2 : 0;
  }
  return 0;
};

const articlePassesScope = (scope, scopeTier) => {
  if (scope === 'local') return scopeTier <= 2;
  if (scope === 'regional') return scopeTier <= 1;
  if (scope === 'national') return scopeTier <= 1;
  return true;
};

const sortScopedArticles = (articles) => {
  articles.sort((a, b) => {
    if (a._scopeTier !== b._scopeTier) return a._scopeTier - b._scopeTier;
    if (a._boostScore !== b._boostScore) return b._boostScore - a._boostScore;
    if (a._rankingScore !== b._rankingScore) return b._rankingScore - a._rankingScore;
    const publishedDiff = new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
    if (publishedDiff !== 0) return publishedDiff;
    return String(a._id).localeCompare(String(b._id));
  });
};

const logNewsScopeEvent = ({ userId, eventType, metadata = {}, req }) => {
  const payload = {
    eventType,
    userId,
    metadata,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null,
    createdAt: new Date().toISOString()
  };
  console.log('[news-event]', JSON.stringify(payload));
};

// ============================================
// SOURCE ADAPTERS
// ============================================

/**
 * RSS Source Adapter
 * Handles standard RSS/Atom feeds
 */
async function fetchRssSource(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const items = Array.isArray(feed.items) ? feed.items : [];

    return await Promise.all(items.map(async (item) => {
      const providerId = detectProviderIdFromUrl(source.url);
      const locationTokens = buildArticleLocationTokens({ source, item });
      const localityLevel = inferLocalityLevel(locationTokens);
      const assignedZipCode = await resolveAssignedZipCode({ locationTokens, source, item });
      const locationTags = buildLocationTags({ locationTokens, assignedZipCode });
      const scopeMetadata = deriveScopeMetadata({ locationTags, localityLevel, locationTokens });
      
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: source.name,
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        topics: toUniqueNonEmptyStrings(item.categories?.map(c => normalizeTopicToken(c)) || []),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'rss',
        localityLevel,
        language: item.isoLanguage || feed.language || 'en',
        providerId,
        scrapeTimestamp: new Date(),
        ...(NEWS_LOCATION_TAGGER_V2_ENABLED
          ? {
              locationTags,
              scopeReason: scopeMetadata.scopeReason,
              scopeConfidence: scopeMetadata.scopeConfidence
            }
          : {})
      };
    }));
  } catch (error) {
    console.error(`Error fetching RSS source ${source.name}:`, error.message);
    // Mark source as unhealthy - using correct field names from RssSource model
    await RssSource.findByIdAndUpdate(source._id, {
      $inc: { errorCount: 1 },
      lastFetchStatus: 'error',
      lastError: error.message
    });
    return [];
  }
}

/**
 * Google News Source Adapter
 * Handles Google News RSS feeds based on queries
 */
async function fetchGoogleNewsSource(query, sourceType = 'googleNews') {
  try {
    const encodedQuery = encodeURIComponent(query);
    const feedUrl = `https://news.google.com/rss/search?q=${encodedQuery}`;
    
    const feed = await parser.parseURL(feedUrl);
    
    const items = Array.isArray(feed.items) ? feed.items : [];
    return await Promise.all(items.map(async (item) => {
      // Extract source name from title format: "Title - Source Name"
      let sourceName = 'Google News';
      const dashIndex = item.title?.lastIndexOf(' - ');
      if (dashIndex > 0) {
        sourceName = item.title.substring(dashIndex + 3);
      }

      const locationTokens = buildArticleLocationTokens({ source: { name: sourceName, category: query }, item, query });
      const localityLevel = inferLocalityLevel(locationTokens);
      const assignedZipCode = await resolveAssignedZipCode({
        locationTokens,
        source: { name: sourceName, category: query },
        item,
        query
      });
      const locationTags = buildLocationTags({ locationTokens, assignedZipCode });
      const scopeMetadata = deriveScopeMetadata({ locationTags, localityLevel, locationTokens });
      
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: sourceName,
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        topics: toUniqueNonEmptyStrings([query.toLowerCase(), ...(item.categories || []).map((category) => normalizeTopicToken(category))]),
        locations: locationTokens,
        assignedZipCode,
        sourceType,
        localityLevel,
        language: 'en',
        scrapeTimestamp: new Date(),
        ...(NEWS_LOCATION_TAGGER_V2_ENABLED
          ? {
              locationTags,
              scopeReason: scopeMetadata.scopeReason,
              scopeConfidence: scopeMetadata.scopeConfidence
            }
          : {})
      };
    }));
  } catch (error) {
    console.error(`Error fetching Google News for "${query}":`, error.message);
    return [];
  }
}

/**
 * YouTube RSS Adapter
 * Handles YouTube channel RSS feeds
 */
async function fetchYoutubeSource(channelUrl) {
  try {
    // Convert YouTube channel URL to RSS format if needed
    let rssUrl = channelUrl;
    if (channelUrl.includes('youtube.com/channel/')) {
      const channelId = channelUrl.split('youtube.com/channel/')[1]?.split('?')[0];
      rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    }
    
    const feed = await parser.parseURL(rssUrl);
    
    const items = Array.isArray(feed.items) ? feed.items : [];
    return items.map(item => {
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: 'YouTube',
        sourceId: item.id,
        url: item.links?.[0]?.href || item.link,
        imageUrl: item.mediaGroup?.mediaContents?.[0]?.url || null,
        publishedAt: getItemPublishedAt(item),
        topics: ['youtube', 'video'],
        locations: buildArticleLocationTokens({ source: { name: 'YouTube' }, item }),
        assignedZipCode: null,
        sourceType: 'youtube',
        localityLevel: 'global',
        language: 'en',
        scrapeTimestamp: new Date()
      };
    });
  } catch (error) {
    console.error(`Error fetching YouTube source:`, error.message);
    return [];
  }
}

/**
 * Podcast RSS Adapter
 * Handles podcast RSS feeds
 */
async function fetchPodcastSource(feedUrl) {
  try {
    const feed = await parser.parseURL(feedUrl);
    
    const items = Array.isArray(feed.items) ? feed.items : [];
    return items.map(item => {
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: feed.title || 'Podcast',
        sourceId: item.guid || item.enclosure?.url,
        url: item.enclosure?.url || item.link,
        imageUrl: feed.image?.url || null,
        publishedAt: getItemPublishedAt(item),
        topics: ['podcast', 'audio'],
        locations: buildArticleLocationTokens({ source: { name: feed.title || 'Podcast' }, item }),
        assignedZipCode: null,
        sourceType: 'podcast',
        localityLevel: 'global',
        language: feed.language || 'en',
        scrapeTimestamp: new Date()
      };
    });
  } catch (error) {
    console.error(`Error fetching Podcast source:`, error.message);
    return [];
  }
}

/**
 * Government Source Adapter
 * Handles government/official feeds
 */
async function fetchGovernmentSource(source) {
  // Government feeds are essentially RSS with specific handling
  return fetchRssSource(source);
}

/**
 * GDELT 2.0 DOC API Adapter
 * Fetches geolocated articles from GDELT's free document API.
 * Returns articles with location tags derived from GDELT's geolocation metadata.
 */
async function fetchGdeltSource(query, options = {}) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const maxRecords = options.maxRecords || 25;
    const url = `${GDELT_API_BASE}?query=${encodedQuery}&mode=artlist&maxrecords=${maxRecords}&format=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      console.warn(`GDELT API returned ${response.status} for query "${query}"`);
      return [];
    }
    const data = await response.json();
    const articles = Array.isArray(data.articles) ? data.articles : [];
    return await Promise.all(articles.map(async (item) => {
      const sourceDomain = item.domain || item.source || 'GDELT';
      const locationTokens = buildArticleLocationTokens({
        source: { name: sourceDomain, category: query },
        item: {
          title: item.title || '',
          categories: item.domain ? [item.domain] : [],
          contentSnippet: item.seendate || ''
        },
        query
      });
      const localityLevel = inferLocalityLevel(locationTokens);
      const assignedZipCode = await resolveAssignedZipCode({
        locationTokens,
        source: { name: sourceDomain, category: query },
        item: { title: item.title || '' },
        query
      });
      const locationTags = buildLocationTags({ locationTokens, assignedZipCode });
      const scopeMetadata = deriveScopeMetadata({ locationTags, localityLevel, locationTokens });

      return {
        title: item.title || 'Untitled',
        description: item.title || '',
        source: sourceDomain,
        sourceId: item.url || item.title,
        url: item.url,
        imageUrl: item.socialimage || null,
        publishedAt: item.seendate ? new Date(item.seendate.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')) : new Date(),
        topics: toUniqueNonEmptyStrings([query.toLowerCase(), ...(item.domain ? [item.domain] : [])]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'gdlet',
        localityLevel,
        language: item.language || 'en',
        scrapeTimestamp: new Date(),
        ...(NEWS_LOCATION_TAGGER_V2_ENABLED
          ? {
              locationTags,
              scopeReason: scopeMetadata.scopeReason,
              scopeConfidence: scopeMetadata.scopeConfidence
            }
          : {})
      };
    }));
  } catch (error) {
    console.error(`Error fetching GDELT source for "${query}":`, error.message);
    return [];
  }
}

// Helper: Extract image from HTML content
function extractImageFromContent(content) {
  if (!content) return null;
  const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
  return imgMatch ? imgMatch[1] : null;
}

// ============================================
// INGESTION LOGIC
// ============================================

/**
 * Process and deduplicate articles
 */
const mapLocalityLevelToScope = (localityLevel) => {
  const normalized = normalizeLocationToken(localityLevel);
  if (normalized === 'city' || normalized === 'county') return 'local';
  if (normalized === 'state') return 'regional';
  if (normalized === 'country') return 'national';
  return 'global';
};

const buildIngestionEvents = ({ outcome, duplicateReason = '', errorMessage = '' }) => {
  const baseEvents = [{
    severity: 'info',
    eventType: 'record_received',
    message: 'Record received for processing',
    metadata: {}
  }];
  if (outcome === 'updated') {
    baseEvents.push({
      severity: 'info',
      eventType: 'dedupe_update',
      message: duplicateReason || 'Existing article updated with fresher payload',
      metadata: {}
    });
  } else if (outcome === 'duplicate') {
    baseEvents.push({
      severity: 'warn',
      eventType: 'dedupe_skip',
      message: duplicateReason || 'Duplicate article skipped',
      metadata: {}
    });
  } else if (outcome === 'inserted') {
    baseEvents.push({
      severity: 'info',
      eventType: 'insert',
      message: 'Article inserted',
      metadata: {}
    });
  } else if (outcome === 'error') {
    baseEvents.push({
      severity: 'error',
      eventType: 'error',
      message: errorMessage || 'Article processing failed',
      metadata: {}
    });
  }
  return baseEvents.map((event) => ({ ...event, timestamp: new Date() }));
};

const buildNormalizedUrlHash = (url) => {
  if (!url) return null;
  return crypto.createHash('sha256').update(String(url).toLowerCase().trim()).digest('hex').substring(0, 16);
};

const persistNewsIngestionRecord = async (payload) => {
  if (mongoose.connection?.readyState !== 1) {
    return null;
  }
  try {
    return await NewsIngestionRecord.create(payload);
  } catch (error) {
    console.warn('Unable to persist NewsIngestionRecord:', error.message);
    return null;
  }
};

async function processArticles(articles, options = {}) {
  const ingestionRunId = options.ingestionRunId || uuidv4();
  const results = {
    inserted: 0,
    updated: 0,
    duplicates: 0,
    ingestionRunId
  };
  
  const scoredArticles = [];
  const momentumMap = createMomentumMap(articles, new Date());
  const findExistingArticle = Article.findDuplicate
    ? (url, sourceId, normalizedUrlHash) => Article.findDuplicate(url, sourceId)
    : (url, sourceId, normalizedUrlHash) => Article.findOne({ normalizedUrlHash });

  for (const article of articles) {
    try {
      const normalizedUrlHash = article.url
        ? buildNormalizedUrlHash(article.url)
        : null;
      const sourceMomentum = getArticleMomentumSignal(article, momentumMap);
      const scoring = calculateViralScore(article, { sourceMomentum });
      const scoredArticle = {
        ...article,
        normalizedUrlHash,
        viralScore: scoring.score,
        viralScoreVersion: scoring.scoreVersion,
        viralSignals: scoring.signals,
        isPromoted: scoring.isPromoted,
        lastScoredAt: scoring.lastScoredAt
      };

      // Check for duplicate by URL hash
      const existing = await findExistingArticle(
        scoredArticle.url,
        scoredArticle.sourceId,
        scoredArticle.normalizedUrlHash
      );
      
      if (existing) {
        // Update if newer
        const incomingPublishedAt = scoredArticle.publishedAt ? new Date(scoredArticle.publishedAt) : null;
        const existingPublishedAt = existing.publishedAt ? new Date(existing.publishedAt) : null;
        if (incomingPublishedAt && (!existingPublishedAt || incomingPublishedAt > existingPublishedAt)) {
          const mergedLocations = [...new Set([...(existing.locations || []), ...(scoredArticle.locations || [])])];
          await Article.findByIdAndUpdate(existing._id, {
            $set: {
              title: scoredArticle.title,
              description: scoredArticle.description,
              imageUrl: scoredArticle.imageUrl,
              publishedAt: scoredArticle.publishedAt,
              topics: [...new Set([...(existing.topics || []), ...(scoredArticle.topics || [])])],
              locations: mergedLocations,
              assignedZipCode: scoredArticle.assignedZipCode || existing.assignedZipCode || null,
              locationTags: NEWS_LOCATION_TAGGER_V2_ENABLED
                ? mergeLocationTags(existing.locationTags, scoredArticle.locationTags, scoredArticle.assignedZipCode)
                : existing.locationTags,
              scopeReason: NEWS_LOCATION_TAGGER_V2_ENABLED
                ? (scoredArticle.scopeReason || existing.scopeReason || 'source_default')
                : existing.scopeReason,
              scopeConfidence: NEWS_LOCATION_TAGGER_V2_ENABLED
                ? Math.max(
                  Number.isFinite(existing.scopeConfidence) ? existing.scopeConfidence : 0,
                  Number.isFinite(scoredArticle.scopeConfidence) ? scoredArticle.scopeConfidence : 0
                )
                : existing.scopeConfidence,
              viralScore: scoredArticle.viralScore,
              viralScoreVersion: scoredArticle.viralScoreVersion,
              viralSignals: scoredArticle.viralSignals,
              isPromoted: scoredArticle.isPromoted,
              lastScoredAt: scoredArticle.lastScoredAt
            }
          });
          results.updated++;
          scoredArticles.push(scoredArticle);
          await persistNewsIngestionRecord({
            ingestionRunId,
            source: {
              name: scoredArticle.source || '',
              sourceType: scoredArticle.sourceType || '',
              sourceId: scoredArticle.sourceId || '',
              providerId: scoredArticle.providerId || '',
              url: scoredArticle.url || ''
            },
            scrapedAt: article.scrapeTimestamp || new Date(),
            normalized: {
              title: scoredArticle.title || '',
              description: scoredArticle.description || '',
              url: scoredArticle.url || '',
              imageUrl: scoredArticle.imageUrl || null,
              publishedAt: scoredArticle.publishedAt || null,
              topics: scoredArticle.topics || [],
              locations: scoredArticle.locations || [],
              assignedZipCode: scoredArticle.assignedZipCode || null,
              localityLevel: scoredArticle.localityLevel || 'global',
              language: scoredArticle.language || 'en',
              normalizedUrlHash: scoredArticle.normalizedUrlHash || null
            },
            resolvedScope: mapLocalityLevelToScope(scoredArticle.localityLevel),
            dedupe: {
              outcome: 'updated',
              existingArticleId: existing._id,
              reason: 'incoming_newer_than_existing'
            },
            persistence: {
              articleId: existing._id,
              operation: 'update',
              persistedAt: new Date()
            },
            processingStatus: 'processed',
            tags: scoredArticle.topics || [],
            events: buildIngestionEvents({ outcome: 'updated', duplicateReason: 'incoming_newer_than_existing' })
          });
        } else {
          results.duplicates++;
          await persistNewsIngestionRecord({
            ingestionRunId,
            source: {
              name: scoredArticle.source || '',
              sourceType: scoredArticle.sourceType || '',
              sourceId: scoredArticle.sourceId || '',
              providerId: scoredArticle.providerId || '',
              url: scoredArticle.url || ''
            },
            scrapedAt: article.scrapeTimestamp || new Date(),
            normalized: {
              title: scoredArticle.title || '',
              description: scoredArticle.description || '',
              url: scoredArticle.url || '',
              imageUrl: scoredArticle.imageUrl || null,
              publishedAt: scoredArticle.publishedAt || null,
              topics: scoredArticle.topics || [],
              locations: scoredArticle.locations || [],
              assignedZipCode: scoredArticle.assignedZipCode || null,
              localityLevel: scoredArticle.localityLevel || 'global',
              language: scoredArticle.language || 'en',
              normalizedUrlHash: scoredArticle.normalizedUrlHash || null
            },
            resolvedScope: mapLocalityLevelToScope(scoredArticle.localityLevel),
            dedupe: {
              outcome: 'duplicate',
              existingArticleId: existing._id,
              reason: 'incoming_not_newer'
            },
            persistence: {
              articleId: existing._id,
              operation: 'skip',
              persistedAt: new Date()
            },
            processingStatus: 'processed',
            tags: scoredArticle.topics || [],
            events: buildIngestionEvents({ outcome: 'duplicate', duplicateReason: 'incoming_not_newer' })
          });
        }
        continue;
      }
      
      // Create new article
      const newArticle = new Article(scoredArticle);
      await newArticle.save();
      results.inserted++;
      scoredArticles.push(scoredArticle);
      await persistNewsIngestionRecord({
        ingestionRunId,
        source: {
          name: scoredArticle.source || '',
          sourceType: scoredArticle.sourceType || '',
          sourceId: scoredArticle.sourceId || '',
          providerId: scoredArticle.providerId || '',
          url: scoredArticle.url || ''
        },
        scrapedAt: article.scrapeTimestamp || new Date(),
        normalized: {
          title: scoredArticle.title || '',
          description: scoredArticle.description || '',
          url: scoredArticle.url || '',
          imageUrl: scoredArticle.imageUrl || null,
          publishedAt: scoredArticle.publishedAt || null,
          topics: scoredArticle.topics || [],
          locations: scoredArticle.locations || [],
          assignedZipCode: scoredArticle.assignedZipCode || null,
          localityLevel: scoredArticle.localityLevel || 'global',
          language: scoredArticle.language || 'en',
          normalizedUrlHash: scoredArticle.normalizedUrlHash || null
        },
        resolvedScope: mapLocalityLevelToScope(scoredArticle.localityLevel),
        dedupe: {
          outcome: 'inserted',
          existingArticleId: null,
          reason: 'new_article'
        },
        persistence: {
          articleId: newArticle._id,
          operation: 'insert',
          persistedAt: new Date()
        },
        processingStatus: 'processed',
        tags: scoredArticle.topics || [],
        events: buildIngestionEvents({ outcome: 'inserted' })
      });
    } catch (error) {
      if (error.code === 11000) {
        results.duplicates++;
      } else {
        console.error('Error processing article:', error.message);
      }
      await persistNewsIngestionRecord({
        ingestionRunId,
        source: {
          name: article?.source || '',
          sourceType: article?.sourceType || '',
          sourceId: article?.sourceId || '',
          providerId: article?.providerId || '',
          url: article?.url || ''
        },
        scrapedAt: article?.scrapeTimestamp || new Date(),
        normalized: {
          title: article?.title || '',
          description: article?.description || '',
          url: article?.url || '',
          imageUrl: article?.imageUrl || null,
          publishedAt: article?.publishedAt || null,
          topics: article?.topics || [],
          locations: article?.locations || [],
          assignedZipCode: article?.assignedZipCode || null,
          localityLevel: article?.localityLevel || 'global',
          language: article?.language || 'en',
          normalizedUrlHash: article?.url
            ? buildNormalizedUrlHash(article.url)
            : null
        },
        resolvedScope: mapLocalityLevelToScope(article?.localityLevel),
        dedupe: {
          outcome: 'error',
          existingArticleId: null,
          reason: error?.code === 11000 ? 'duplicate_key' : 'processing_error'
        },
        persistence: {
          articleId: null,
          operation: 'error',
          persistedAt: new Date(),
          errorCode: error?.code ? String(error.code) : null,
          errorMessage: error?.message || 'Unknown processing error'
        },
        processingStatus: 'failed',
        tags: article?.topics || [],
        events: buildIngestionEvents({ outcome: 'error', errorMessage: error?.message || 'Unknown processing error' })
      });
    }
  }
  
  const scoreValues = scoredArticles.map(a => Number(a.viralScore) || 0);
  if (scoreValues.length > 0) {
    const scoreDistribution = {
      count: scoreValues.length,
      min: Math.min(...scoreValues),
      max: Math.max(...scoreValues),
      avg: Number((scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length).toFixed(2)),
      promotedCount: scoredArticles.filter(a => a.isPromoted).length
    };
    console.log('[news-viral-score-distribution]', JSON.stringify(scoreDistribution));
  }

  return results;
}

/**
 * Main ingestion function - fetches all sources
 */
async function ingestAllSources() {
  console.log('Starting news ingestion...');
  const startTime = Date.now();
  const ingestionRunId = uuidv4();
  
  let allArticles = [];
  
  // 1. Fetch configured RSS sources
  const rssSources = await RssSource.find({ isActive: true });
  for (const source of rssSources) {
    const articles = await fetchRssSource(source);
    allArticles = [...allArticles, ...articles];
    
    // Update source status - using correct field names from RssSource model
    await RssSource.findByIdAndUpdate(source._id, {
      lastFetchAt: new Date(),
      lastFetchStatus: 'success',
      fetchCount: articles.length
    });
  }
  
  // 2. Fetch default Google News topics - include ALL 10 categories
  const defaultTopics = [
    'technology',
    'science',
    'health',
    'business',
    'sports',
    'entertainment',
    'politics',
    'finance',
    'gaming',
    'artificial intelligence'
  ];
  for (const topic of defaultTopics) {
    const articles = await fetchGoogleNewsSource(topic, 'googleNews');
    allArticles = [...allArticles, ...articles];
  }
  
  // 3. Fetch GDELT sources (optional, gated by GDELT_ENABLED)
  if (GDELT_ENABLED) {
    const gdeltQueries = GDELT_DEFAULT_QUERIES;
    for (const query of gdeltQueries) {
      const articles = await fetchGdeltSource(query);
      allArticles = [...allArticles, ...articles];
    }
  }
  
  // 4. Process all articles (deduplication)
  const results = await processArticles(allArticles, { ingestionRunId });
  
  // 5. Log scope quality metrics
  const scopeQuality = computeScopeQualityMetrics(allArticles, startTime);
  console.log('[news-scope-quality]', JSON.stringify(scopeQuality));
  
  console.log(`Ingestion complete: ${results.inserted} inserted, ${results.updated} updated, ${results.duplicates} duplicates in ${Date.now() - startTime}ms`);
  return results;
}

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const jwt = require('jsonwebtoken');
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// ============================================
// API ROUTES
// ============================================

/**
 * GET /api/news/feed
 * Get personalized news feed for user with followed keywords prioritization
 */
router.get('/feed', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sourceType,
      topic,
      location,
      scope
    } = req.query;

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.max(parseInt(limit, 10) || 20, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const [preferences, user] = await Promise.all([
      NewsPreferences.findOne({ user: req.user.userId }),
      User.findById(req.user.userId).select('city county state country zipCode')
    ]);

    const locationContext = await resolveLocationContext({ preferences, user });
    const defaultScope = resolveDefaultScope({ preferences, locationContext });
    const requestedScope = NEWS_SCOPE_VALUES.includes(scope) ? scope : defaultScope;
    const { activeScope: contextResolvedScope, fallbackApplied: contextFallbackApplied } = resolveActiveScope({ requestedScope, locationContext });
    let activeScope = contextResolvedScope;
    let fallbackApplied = contextFallbackApplied;
    let fallbackReason = contextFallbackApplied ? 'context_unavailable' : null;
    const locationTelemetry = summarizeLocationContextForTelemetry(locationContext);

    if (NEWS_SCOPE_VALUES.includes(scope)) {
      logNewsScopeEvent({
        userId: req.user.userId,
        eventType: 'news_scope_changed',
        metadata: {
          requestedScope,
          activeScope,
          fallbackApplied,
          fallbackReason
        },
        req
      });
    }
    logNewsScopeEvent({
      userId: req.user.userId,
      eventType: 'news_scope_resolution',
      metadata: {
        requestedScope,
        activeScope,
        defaultScope,
        fallbackApplied,
        fallbackReason,
        locationContext: locationTelemetry
      },
      req
    });

    // Extract followed keywords for personalization
    const followedKeywords = preferences?.followedKeywords?.map(k => k.keyword) || [];
    
    // Build base query
    const query = { isActive: true };
    
    // Filter by source type
    if (sourceType) {
      query.sourceType = sourceType;
    }
    
    // Filter by location
    if (location) {
      query.locations = location.toLowerCase();
    }

    // Fetch scope-aware candidate set (larger for location scopes to support deterministic fallback fill)
    const candidateMultiplier = activeScope === 'global' ? 2 : 4;
    const candidateLimit = Math.min(MAX_FEED_CANDIDATES, parsedPage * parsedLimit * candidateMultiplier);
    let articles = await Article.find(query)
      .sort({ publishedAt: -1, freshnessScore: -1 })
      .limit(candidateLimit)
      .lean();
    
    // Apply source filtering based on preferences
    if (preferences?.rssSources?.length > 0) {
      const enabledSources = new Set(
        preferences.rssSources
          .filter(s => s.enabled)
          .map(s => normalizeLocationToken(s.sourceId))
      );
      articles = articles.filter((article) => {
        if (article.sourceType !== 'rss') return true;
        const sourceIdMatch = normalizeLocationToken(article.sourceId);
        const sourceNameMatch = normalizeLocationToken(article.source);
        return enabledSources.has(sourceIdMatch) || enabledSources.has(sourceNameMatch);
      });
    }
    
    const topicAliases = getTopicAliases(topic);
    const hiddenCategorySet = new Set((preferences?.hiddenCategories || []).map((category) => normalizeTopicToken(category)));
    const preferredTopicAliases = !topic && (preferences?.googleNewsTopics?.length > 0 || preferences?.gdletCategories?.length > 0)
      ? [...new Set([
          ...(preferences.googleNewsTopics || []),
          ...(preferences.gdletCategories || [])
        ].flatMap((value) => getTopicAliases(value)))]
      : [];

    const scopedCandidates = articles.map((article) => {
      const articleText = `${article.title || ''} ${article.description || ''} ${(article.topics || []).join(' ')}`.toLowerCase();
      const matchedKeywords = followedKeywords.filter((keyword) => articleText.includes(keyword.toLowerCase()));
      const locationMatches = articleMatchesLocation(article, locationContext);

      return {
        ...article,
        _searchText: articleText,
        _locationMatches: locationMatches,
        _topicTokens: (article.topics || []).map((item) => normalizeTopicToken(item)),
        matchedKeywords,
        isFollowingMatch: matchedKeywords.length > 0, // kept for existing frontend badge logic
        _boostScore: matchedKeywords.length
      };
    });

    const buildScopedArticles = (scopeValue) => {
      const scoped = scopedCandidates
        .map((article) => {
          const scopeTier = getScopeTier(scopeValue, article._locationMatches);
          const recencyScore = scoreRecency(article.publishedAt, article.freshnessScore);
          const localityLevelScore = scoreLocalityLevel(scopeValue, article.localityLevel);
          const deterministicScopeScore = NEWS_LOCATION_TAGGER_V2_ENABLED
            ? ((Number(article.scopeConfidence) || 0) * DETERMINISTIC_SCOPE_WEIGHT)
            : 0;

          return {
            ...article,
            _scopeTier: scopeTier,
            _rankingScore:
              (article._boostScore * KEYWORD_MATCH_WEIGHT) +
              ((MAX_SCOPE_TIERS - scopeTier) * SCOPE_TIER_WEIGHT) +
              recencyScore +
              localityLevelScore +
              deterministicScopeScore
          };
        })
        .filter((article) => {
          if (topicAliases.length > 0) {
            if (!topicAliases.some((alias) => article._searchText.includes(alias.toLowerCase()))) {
              return false;
            }
          } else if (preferredTopicAliases.length > 0) {
            if (!preferredTopicAliases.some((alias) => article._searchText.includes(alias.toLowerCase()))) {
              return false;
            }
          }

          if (hiddenCategorySet.size > 0 && article._topicTokens.some((item) => hiddenCategorySet.has(item))) {
            return false;
          }

          return articlePassesScope(scopeValue, article._scopeTier);
        });

      sortScopedArticles(scoped);
      return scoped;
    };

    let scopeFilteredArticles = buildScopedArticles(activeScope);
    if (scopeFilteredArticles.length === 0) {
      const fallbackChain = getFallbackScopeOrder(activeScope).slice(1);
      for (const fallbackScope of fallbackChain) {
        const fallbackArticles = buildScopedArticles(fallbackScope);
        if (fallbackArticles.length > 0) {
          activeScope = fallbackScope;
          scopeFilteredArticles = fallbackArticles;
          fallbackApplied = true;
          fallbackReason = 'no_scope_matches';
          break;
        }
      }
    }

    // Mix in national/global articles when viewing local or regional scope
    // so users see their local news first, plus top broader stories
    if ((activeScope === 'local' || activeScope === 'regional') && scopeFilteredArticles.length > 0) {
      const seenIds = new Set(scopeFilteredArticles.map((a) => String(a._id)));
      const globalCandidates = buildScopedArticles('global')
        .filter((a) => !seenIds.has(String(a._id)));
      // Append up to ~30% broader articles (minimum 3 if available)
      const mixCount = Math.max(3, Math.ceil(scopeFilteredArticles.length * 0.3));
      const mixArticles = globalCandidates.slice(0, mixCount);
      // Mark mixed articles with a higher scope tier so they sort after local
      for (const mixed of mixArticles) {
        mixed._scopeTier = MAX_SCOPE_TIERS;
      }
      scopeFilteredArticles = [...scopeFilteredArticles, ...mixArticles];
    }

    articles = scopeFilteredArticles;
    logNewsScopeEvent({
      userId: req.user.userId,
      eventType: 'news_scope_finalized',
      metadata: {
        requestedScope,
        activeScope,
        defaultScope,
        fallbackApplied,
        fallbackReason,
        candidateCount: scopedCandidates.length
      },
      req
    });
    
    const total = articles.length;
    const startIndex = Math.max(0, skip);
    articles = articles.slice(startIndex, startIndex + parsedLimit);

    const promotedLimit = Math.min(DEFAULT_PROMOTED_ITEMS, FEED_PROMOTED_MAX_ITEMS);
    const promotedArticles = await Article.find({ isActive: true, isPromoted: true })
      .sort({ viralScore: -1, publishedAt: -1 })
      .limit(promotedLimit)
      .lean();
    
    res.json({
      articles,
      promoted: promotedArticles.map((article) => ({
        article,
        viralScore: article.viralScore || 0,
        viralSignalsSummary: summarizeSignals(article.viralSignals)
      })),
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit)
      },
      personalization: {
        followedKeywords,
        hasKeywordMatches: articles.some(a => a.isFollowingMatch),
        requestedScope,
        activeScope,
        fallbackApplied,
        fallbackReason,
        scopeDecision: {
          reason: fallbackReason || 'direct_match',
          locationContext: locationTelemetry
        },
        locationContext: {
          source: locationContext.source,
          hasZipCode: Boolean(locationContext.zipCode),
          hasCity: Boolean(locationContext.city),
          hasCounty: Boolean(locationContext.county),
          hasState: Boolean(locationContext.state),
          hasCountry: Boolean(locationContext.country),
          levelsUsed: activeScope === 'local'
            ? ['zipCode', 'city', 'county', 'state', 'country']
            : activeScope === 'regional'
              ? ['state', 'country']
              : activeScope === 'national'
                ? ['country']
                : []
        }
      }
    });

    if (fallbackApplied) {
      logNewsScopeEvent({
        userId: req.user.userId,
        eventType: 'news_scope_fallback_applied',
        metadata: {
          requestedScope,
          activeScope,
          fallbackReason,
          articleCount: articles.length
        },
        req
      });
    }
  } catch (error) {
    console.error('Error fetching news feed:', error);
    res.status(500).json({ error: 'Failed to fetch news feed' });
  }
});

/**
 * GET /api/news/promoted
 * Get promoted news ranked by viral score
 */
router.get('/promoted', authenticateToken, async (req, res) => {
  try {
    const requestedLimit = parseInt(req.query.limit || String(DEFAULT_PROMOTED_ITEMS), 10);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_PROMOTED_ITEMS, PROMOTED_ENDPOINT_MAX_ITEMS));
    const topic = req.query.topic ? String(req.query.topic).toLowerCase() : null;

    const query = {
      isActive: true,
      isPromoted: true
    };

    if (topic) {
      query.topics = topic;
    }

    const promotedArticles = await Article.find(query)
      .sort({ viralScore: -1, publishedAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      items: promotedArticles.map((article) => ({
        article,
        viralScore: article.viralScore || 0,
        viralSignalsSummary: summarizeSignals(article.viralSignals)
      }))
    });
  } catch (error) {
    console.error('Error fetching promoted news:', error);
    return res.status(500).json({ error: 'Failed to fetch promoted news' });
  }
});

/**
 * GET /api/news/sources
 * Get available RSS sources
 */
router.get('/sources', authenticateToken, async (req, res) => {
  try {
    const sources = await RssSource.find({ isActive: true })
      .sort({ priority: -1, name: 1 });

    const topUsedSources = [...sources]
      .sort((a, b) => {
        if ((b.fetchCount || 0) !== (a.fetchCount || 0)) {
          return (b.fetchCount || 0) - (a.fetchCount || 0);
        }
        return new Date(b.lastFetchAt || 0).getTime() - new Date(a.lastFetchAt || 0).getTime();
      })
      .slice(0, 10)
      .map((source) => ({
        _id: source._id,
        name: source.name,
        url: source.url,
        type: source.type,
        category: source.category,
        fetchCount: source.fetchCount || 0,
        lastFetchAt: source.lastFetchAt,
        lastFetchStatus: source.lastFetchStatus,
        providerId: detectProviderIdFromUrl(source.url)
      }));
    
    res.json({
      sources,
      topUsedSources,
      supportedRssProviders: SUPPORTED_RSS_PROVIDERS
    });
  } catch (error) {
    console.error('Error fetching sources:', error);
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

/**
 * GET /api/news/preferences
 * Get user's news preferences
 */
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('city county state country zipCode');
    const userFallbackLocation = getUserLocationFallback(user);
    let preferences = await NewsPreferences.findOne({ user: req.user.userId })
      .populate('rssSources.sourceId');
    
    // Create default preferences if none exist
    if (!preferences) {
      const seededLocations = userFallbackLocation
        ? [{
            city: userFallbackLocation.city,
            zipCode: userFallbackLocation.zipCode,
            state: userFallbackLocation.state,
            country: userFallbackLocation.country,
            isPrimary: true
          }]
        : [];
      preferences = await NewsPreferences.create({
        user: req.user.userId,
        rssSources: [],
        googleNewsTopics: ['technology', 'science'],
        googleNewsEnabled: true,
        gdletEnabled: true,
        locations: seededLocations,
        followedKeywords: [],
        hiddenCategories: [],
        localPriorityEnabled: true,
        defaultScope: seededLocations.length > 0 ? 'local' : 'global'
      });
    } else if ((!NEWS_SCOPE_VALUES.includes(preferences.defaultScope) || !preferences.locations?.length) && userFallbackLocation) {
      const updatePayload = {};
      if (!preferences.locations?.length) {
        updatePayload.locations = [{
          city: userFallbackLocation.city,
          zipCode: userFallbackLocation.zipCode,
          state: userFallbackLocation.state,
          country: userFallbackLocation.country,
          isPrimary: true
        }];
      }
      if (!NEWS_SCOPE_VALUES.includes(preferences.defaultScope)) {
        updatePayload.defaultScope = hasLocationContext(userFallbackLocation) ? 'local' : 'global';
      }
      if (Object.keys(updatePayload).length > 0) {
        preferences = await NewsPreferences.findOneAndUpdate(
          { user: req.user.userId },
          { $set: updatePayload },
          { new: true }
        ).populate('rssSources.sourceId');
      }
    } else if (!NEWS_SCOPE_VALUES.includes(preferences.defaultScope)) {
      preferences = await NewsPreferences.findOneAndUpdate(
        { user: req.user.userId },
        { $set: { defaultScope: preferences.locations?.length ? 'local' : 'global' } },
        { new: true }
      ).populate('rssSources.sourceId');
    }
    
    res.json({ preferences });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/news/preferences
 * Update user's news preferences
 */
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const {
      rssSources,
      googleNewsTopics,
      googleNewsEnabled,
      gdletCategories,
      gdletEnabled,
      locations,
      followedKeywords,
      localPriorityEnabled,
      defaultScope
    } = req.body;
    
    const updateData = {};
    
    if (rssSources !== undefined) updateData.rssSources = rssSources;
    if (googleNewsTopics !== undefined) updateData.googleNewsTopics = googleNewsTopics;
    if (googleNewsEnabled !== undefined) updateData.googleNewsEnabled = googleNewsEnabled;
    if (gdletCategories !== undefined) updateData.gdletCategories = gdletCategories;
    if (gdletEnabled !== undefined) updateData.gdletEnabled = gdletEnabled;
    if (locations !== undefined) updateData.locations = locations;
    if (followedKeywords !== undefined) updateData.followedKeywords = followedKeywords;
    if (defaultScope !== undefined && NEWS_SCOPE_VALUES.includes(defaultScope)) {
      updateData.defaultScope = defaultScope;
    } else if (localPriorityEnabled !== undefined && defaultScope === undefined) {
      // Backwards compatible mapping from legacy toggle to scope preference.
      // Remove this mapping after Q2 2026 once all clients send defaultScope explicitly.
      updateData.defaultScope = localPriorityEnabled ? 'local' : 'global';
    }
    if (localPriorityEnabled !== undefined) updateData.localPriorityEnabled = localPriorityEnabled;
    
    const preferences = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { $set: updateData },
      { new: true, upsert: true }
    );

    if (updateData.defaultScope) {
      logNewsScopeEvent({
        userId: req.user.userId,
        eventType: 'news_default_scope_updated',
        metadata: {
          requestedScope: defaultScope || null,
          activeScope: updateData.defaultScope
        },
        req
      });
    }
    
    res.json({ preferences });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * POST /api/news/preferences/keywords
 * Add a followed keyword
 */
router.post('/preferences/keywords', authenticateToken, async (req, res) => {
  try {
    const { keyword } = req.body;
    
    if (!keyword) {
      return res.status(400).json({ error: 'Keyword is required' });
    }
    
    const preferences = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { 
        $addToSet: { 
          followedKeywords: { 
            keyword: keyword.toLowerCase(),
            createdAt: new Date()
          } 
        }
      },
      { new: true, upsert: true }
    );
    
    res.json({ preferences });
  } catch (error) {
    console.error('Error adding keyword:', error);
    res.status(500).json({ error: 'Failed to add keyword' });
  }
});

/**
 * DELETE /api/news/preferences/keywords/:keyword
 * Remove a followed keyword
 */
router.delete('/preferences/keywords/:keyword', authenticateToken, async (req, res) => {
  try {
    const { keyword } = req.params;
    
    const preferences = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { 
        $pull: { 
          followedKeywords: { keyword: keyword.toLowerCase() } 
        }
      },
      { new: true }
    );
    
    res.json({ preferences });
  } catch (error) {
    console.error('Error removing keyword:', error);
    res.status(500).json({ error: 'Failed to remove keyword' });
  }
});

/**
 * POST /api/news/preferences/locations
 * Add a location preference
 */
router.post('/preferences/locations', authenticateToken, async (req, res) => {
  try {
    const { city, zipCode, county, state, country, isPrimary = false } = req.body;
    
    if (!city && !zipCode && !county && !state && !country) {
      return res.status(400).json({ error: 'At least one location field is required' });
    }
    
    const locationData = {
      city: city || null,
      zipCode: zipCode || null,
      county: county || null,
      state: state || null,
      country: country || null,
      isPrimary
    };
    
    // If setting as primary, unset other primaries
    if (isPrimary) {
      await NewsPreferences.updateMany(
        { user: req.user.userId, 'locations.isPrimary': true },
        { $set: { 'locations.$[].isPrimary': false } }
      );
    }
    
    const preferences = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { 
        $addToSet: { locations: locationData }
      },
      { new: true, upsert: true }
    );
    
    res.json({ preferences });
  } catch (error) {
    console.error('Error adding location:', error);
    res.status(500).json({ error: 'Failed to add location' });
  }
});

/**
 * DELETE /api/news/preferences/locations/:locationId
 * Remove a location preference
 */
router.delete('/preferences/locations/:locationId', authenticateToken, async (req, res) => {
  try {
    const { locationId } = req.params;
    
    const preferences = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { 
        $pull: { 
          locations: { _id: locationId } 
        }
      },
      { new: true }
    );
    
    res.json({ preferences });
  } catch (error) {
    console.error('Error removing location:', error);
    res.status(500).json({ error: 'Failed to remove location' });
  }
});

/**
 * PUT /api/news/preferences/hidden-categories
 * Update hidden categories - saves hidden categories to user's NewsPreferences
 */
router.put('/preferences/hidden-categories', authenticateToken, async (req, res) => {
  try {
    const { hiddenCategories } = req.body;
    
    if (!Array.isArray(hiddenCategories)) {
      return res.status(400).json({ error: 'hiddenCategories must be an array' });
    }
    
    // Ensure preferences exist first
    let preferences = await NewsPreferences.findOne({ user: req.user.userId });
    
    if (!preferences) {
      // Create new preferences with hidden categories
      preferences = await NewsPreferences.create({
        user: req.user.userId,
        hiddenCategories: hiddenCategories.map(c => c.toLowerCase())
      });
    } else {
      // Update existing preferences
      preferences = await NewsPreferences.findOneAndUpdate(
        { user: req.user.userId },
        {
          $set: {
            hiddenCategories: hiddenCategories.map(c => c.toLowerCase()),
            updatedAt: new Date()
          }
        },
        { new: true }
      );
    }
    
    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    console.error('Error updating hidden categories:', error);
    res.status(500).json({ error: 'Failed to update hidden categories' });
  }
});

/**
 * POST /api/news/sources
 * Add a new RSS source (admin or user-defined)
 */
router.post('/sources', authenticateToken, async (req, res) => {
  try {
    const { name, url, type = 'rss', category, priority = 1 } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }
    
    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    
    // Check if source already exists
    const existing = await RssSource.findOne({ url });
    if (existing) {
      return res.status(400).json({ error: 'Source already exists' });
    }

    if (type === 'rss' || type === 'googleNews' || type === 'government' || type === 'podcast') {
      try {
        const previewFeed = await parser.parseURL(url);
        const itemCount = Array.isArray(previewFeed?.items) ? previewFeed.items.length : 0;
        if (itemCount === 0) {
          return res.status(400).json({ error: 'Feed is reachable but returned no parseable items' });
        }
      } catch (parseError) {
        return res.status(400).json({ error: `Unable to parse this feed URL: ${parseError.message}` });
      }
    }
    
    const source = await RssSource.create({
      name,
      url,
      type,
      category,
      priority,
      addedBy: req.user.userId,
      isActive: true
    });
    
    res.status(201).json({ source });
  } catch (error) {
    console.error('Error adding source:', error);
    res.status(500).json({ error: 'Failed to add source' });
  }
});

/**
 * DELETE /api/news/sources/:sourceId
 * Remove an RSS source
 */
router.delete('/sources/:sourceId', authenticateToken, async (req, res) => {
  try {
    const { sourceId } = req.params;
    
    await RssSource.findByIdAndDelete(sourceId);
    
    res.json({ message: 'Source deleted successfully' });
  } catch (error) {
    console.error('Error deleting source:', error);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});

/**
 * POST /api/news/ingest
 * Trigger manual ingestion (for testing/admin)
 */
router.post('/ingest', authenticateToken, async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId).select('_id isAdmin');
    if (!requester?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const results = await ingestAllSources();
    
    res.json({ 
      message: 'Ingestion completed',
      results
    });
  } catch (error) {
    console.error('Error during ingestion:', error);
    res.status(500).json({ error: 'Ingestion failed' });
  }
});

/**
 * POST /api/news/promoted/rescore
 * Re-score recent articles (admin only)
 */
router.post('/promoted/rescore', authenticateToken, async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId).select('_id isAdmin');
    if (!requester?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const hours = Math.max(1, Math.min(parseInt(req.body.hours || '48', 10), 168));
    const limit = Math.max(1, Math.min(parseInt(req.body.limit || '200', 10), 1000));
    const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));

    const recentArticles = await Article.find({
      isActive: true,
      publishedAt: { $gte: cutoff }
    })
      .sort({ publishedAt: -1 })
      .limit(limit)
      .lean();

    const momentumMap = createMomentumMap(recentArticles, new Date());
    const bulkOps = [];
    const rescoredValues = [];
    let promotedCount = 0;

    for (const article of recentArticles) {
      const sourceMomentum = getArticleMomentumSignal(article, momentumMap);
      const scoring = calculateViralScore(article, { sourceMomentum });
      rescoredValues.push(scoring.score);
      if (scoring.isPromoted) {
        promotedCount += 1;
      }
      bulkOps.push({
        updateOne: {
          filter: { _id: article._id },
          update: {
            $set: {
              viralScore: scoring.score,
              viralScoreVersion: scoring.scoreVersion,
              viralSignals: scoring.signals,
              isPromoted: scoring.isPromoted,
              lastScoredAt: scoring.lastScoredAt
            }
          }
        }
      });
    }

    if (bulkOps.length > 0) {
      await Article.bulkWrite(bulkOps);
      const scoreDistribution = {
        count: rescoredValues.length,
        min: Math.min(...rescoredValues),
        max: Math.max(...rescoredValues),
        avg: Number((rescoredValues.reduce((sum, score) => sum + score, 0) / rescoredValues.length).toFixed(2)),
        promotedCount
      };
      console.log('[news-viral-rescore-distribution]', JSON.stringify(scoreDistribution));
    }

    return res.json({
      rescored: bulkOps.length,
      hours,
      limit
    });
  } catch (error) {
    console.error('Error rescoring promoted news:', error);
    return res.status(500).json({ error: 'Failed to rescore promoted news' });
  }
});

/**
 * GET /api/news/topics
 * Get available news topics
 */
router.get('/topics', (req, res) => {
  const topics = [
    { id: 'technology', name: 'Technology', icon: '💻' },
    { id: 'science', name: 'Science', icon: '🔬' },
    { id: 'health', name: 'Health', icon: '🏥' },
    { id: 'business', name: 'Business', icon: '💼' },
    { id: 'sports', name: 'Sports', icon: '⚽' },
    { id: 'entertainment', name: 'Entertainment', icon: '🎬' },
    { id: 'politics', name: 'Politics', icon: '🏛️' },
    { id: 'finance', name: 'Finance', icon: '📈' },
    { id: 'gaming', name: 'Gaming', icon: '🎮' },
    { id: 'ai', name: 'AI & Machine Learning', icon: '🤖' }
  ];
  
  res.json({ topics });
});

/**
 * GET /api/news/article/:id
 * Get single article by ID
 */
router.get('/article/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const article = await Article.findById(id);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    res.json({ article });
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({ error: 'Failed to fetch article' });
  }
});

// ============================================
// INGESTION SCHEDULER
// ============================================

// Start ingestion scheduler (every 10 minutes)
let ingestionInterval = null;

function startIngestionScheduler() {
  if (ingestionInterval) {
    clearInterval(ingestionInterval);
  }
  
  // Initial ingestion
  ingestAllSources().catch(console.error);
  
  // Schedule every 10 minutes
  ingestionInterval = setInterval(() => {
    ingestAllSources().catch(console.error);
  }, 10 * 60 * 1000);
  
  console.log('News ingestion scheduler started (10-minute cadence)');
}

function stopIngestionScheduler() {
  if (ingestionInterval) {
    clearInterval(ingestionInterval);
    ingestionInterval = null;
    console.log('News ingestion scheduler stopped');
  }
}

// Export for manual control
module.exports = {
  router,
  ingestAllSources,
  startIngestionScheduler,
  stopIngestionScheduler,
  // Export adapters for testing
  adapters: {
    fetchRssSource,
    fetchGoogleNewsSource,
    fetchYoutubeSource,
    fetchPodcastSource,
    fetchGovernmentSource,
    fetchGdeltSource
  },
  internals: {
    processArticles,
    getItemPublishedAt,
    articleMatchesLocation,
    resolveAssignedZipCode,
    inferLocationTokensFromText,
    resolveLocationContext,
    geocodeContextCache,
    computeScopeQualityMetrics
  }
};
