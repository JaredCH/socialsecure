/**
 * News Local Source Planner
 *
 * Given a normalized location context (city/state/ZIP/country), produces an
 * ordered local ingestion plan with source URLs from each enabled tier.
 *
 * Tiers (lower = higher priority):
 *   1 – Google News local queries
 *   2 – TV affiliates
 *   3 – Patch.com
 *   4 – Local newspapers
 *   5 – NewsAPI (optional)
 *   6 – Reddit subreddits
 */

const {
  LOCAL_SOURCE_TIERS,
  buildLocalGoogleNewsUrl,
  buildPatchUrl,
  buildRedditRssUrl
} = require('../config/news/localSourceCatalog');

// Static lookup tables (loaded once)
let tvAffiliates, newspapers, subreddits;
try {
  tvAffiliates = require('../data/news/us-tv-affiliates.json');
} catch (_) {
  tvAffiliates = [];
}
try {
  newspapers = require('../data/news/us-newspapers.json');
} catch (_) {
  newspapers = [];
}
try {
  subreddits = require('../data/news/us-city-subreddits.json');
} catch (_) {
  subreddits = [];
}

// Build in-memory indexes keyed by lowercase "city|stateAbbrev"
const affiliateIndex = new Map();
for (const a of tvAffiliates) {
  const key = `${(a.market || '').toLowerCase()}|${(a.stateAbbrev || '').toLowerCase()}`;
  if (!affiliateIndex.has(key)) affiliateIndex.set(key, []);
  affiliateIndex.get(key).push(a);
}

const newspaperIndex = new Map();
for (const n of newspapers) {
  const key = `${(n.city || '').toLowerCase()}|${(n.stateAbbrev || '').toLowerCase()}`;
  if (!newspaperIndex.has(key)) newspaperIndex.set(key, []);
  newspaperIndex.get(key).push(n);
}

// Also index newspapers by state for state-level fallback
const newspaperByStateIndex = new Map();
for (const n of newspapers) {
  const stKey = (n.stateAbbrev || '').toLowerCase();
  if (!newspaperByStateIndex.has(stKey)) newspaperByStateIndex.set(stKey, []);
  newspaperByStateIndex.get(stKey).push(n);
}

const subredditIndex = new Map();
for (const s of subreddits) {
  const key = `${(s.city || '').toLowerCase()}|${(s.stateAbbrev || '').toLowerCase()}`;
  subredditIndex.set(key, s);
}

/**
 * US state name → abbreviation map for normalizing full state names.
 */
const STATE_NAME_TO_ABBREV = new Map([
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

/**
 * Resolve a state value (full name or abbreviation) to a 2-letter abbreviation.
 */
function resolveStateAbbrev(value) {
  const trimmed = (value || '').trim().toLowerCase();
  if (!trimmed) return '';
  // Already a 2-letter abbreviation
  if (trimmed.length === 2 && /^[a-z]{2}$/.test(trimmed)) return trimmed;
  // Look up full name
  return STATE_NAME_TO_ABBREV.get(trimmed) || trimmed.slice(0, 2);
}

/**
 * Normalize a location context object into a consistent form.
 * Accepts any combination of { city, state, stateAbbrev, zipCode, country }.
 * Full state names (e.g. "Texas") are resolved to 2-letter abbreviations.
 */
function normalizeLocationInput(loc = {}) {
  const rawState = (loc.stateAbbrev || loc.state || '').trim();
  return {
    city: (loc.city || '').trim(),
    state: (loc.state || '').trim(),
    stateAbbrev: resolveStateAbbrev(rawState),
    zipCode: (loc.zipCode || '').trim(),
    country: (loc.country || 'US').trim().toUpperCase()
  };
}

/**
 * Generate a local ingestion plan for a single location.
 *
 * @param {Object} location – { city, state, stateAbbrev, zipCode, country }
 * @param {Object} [options]
 * @param {Object} [options.enabledTiers] – override which tiers are enabled
 * @returns {{ locationKey: string, sources: Array<{ tier, providerId, label, url, locationKey, meta }> }}
 */
function buildLocalSourcePlan(location, options = {}) {
  const loc = normalizeLocationInput(location);
  const locationKey = loc.zipCode
    ? `${loc.zipCode}|${loc.city},${loc.stateAbbrev}`
    : `${loc.city},${loc.stateAbbrev}`;

  // Only target US locations
  if (loc.country && loc.country !== 'US' && loc.country !== 'USA') {
    return { locationKey, sources: [] };
  }

  const enabledTiers = options.enabledTiers || {};
  const isTierEnabled = (tierKey) => {
    if (enabledTiers[tierKey] !== undefined) return enabledTiers[tierKey];
    return LOCAL_SOURCE_TIERS[tierKey]?.enabledByDefault ?? false;
  };

  const sources = [];
  const seenUrls = new Set();

  const addSource = (tier, providerId, label, url, meta = {}) => {
    if (!url) return;
    const normalizedUrl = url.toLowerCase().trim();
    if (seenUrls.has(normalizedUrl)) return;
    seenUrls.add(normalizedUrl);
    sources.push({ tier, providerId, label, url, locationKey, ...meta });
  };

  // --- Tier 1: Google News local queries ---
  if (isTierEnabled('googleNews') && (loc.city || loc.stateAbbrev || loc.zipCode)) {
    if (loc.city && loc.stateAbbrev) {
      addSource(1, 'google-news-local', `Google News: ${loc.city}, ${loc.stateAbbrev.toUpperCase()}`,
        buildLocalGoogleNewsUrl(`${loc.city} ${loc.stateAbbrev} local news`),
        { queryType: 'city_state' });
    }
    if (loc.zipCode) {
      addSource(1, 'google-news-local', `Google News: ${loc.zipCode}`,
        buildLocalGoogleNewsUrl(`${loc.zipCode} local news`),
        { queryType: 'zip' });
    }
    if (loc.stateAbbrev && !loc.city) {
      addSource(1, 'google-news-local', `Google News: ${loc.stateAbbrev.toUpperCase()}`,
        buildLocalGoogleNewsUrl(`${loc.stateAbbrev} state news`),
        { queryType: 'state' });
    }
  }

  // --- Tier 2: TV affiliates ---
  if (isTierEnabled('tvAffiliate') && loc.city && loc.stateAbbrev) {
    const key = `${loc.city.toLowerCase()}|${loc.stateAbbrev}`;
    const affiliates = affiliateIndex.get(key) || [];
    for (const a of affiliates) {
      addSource(2, 'tv-affiliate', `${a.station} (${a.network})`, a.rssUrl,
        { station: a.station, network: a.network, market: a.market });
    }
  }

  // --- Tier 3: Patch.com ---
  if (isTierEnabled('patch') && loc.city && loc.stateAbbrev) {
    addSource(3, 'patch', `Patch: ${loc.city}, ${loc.stateAbbrev.toUpperCase()}`,
      buildPatchUrl(loc.city, loc.stateAbbrev),
      { patchCity: loc.city, patchState: loc.stateAbbrev });
  }

  // --- Tier 4: Local newspapers ---
  if (isTierEnabled('newspaper') && loc.stateAbbrev) {
    const key = `${(loc.city || '').toLowerCase()}|${loc.stateAbbrev}`;
    // Prefer city-level match, fall back to state-level
    let papers = newspaperIndex.get(key) || [];
    if (papers.length === 0 && loc.stateAbbrev) {
      papers = (newspaperByStateIndex.get(loc.stateAbbrev) || []).slice(0, 3);
    }
    for (const p of papers) {
      addSource(4, 'local-newspaper', p.name, p.rssUrl,
        { newspaperCity: p.city, newspaperState: p.stateAbbrev });
    }
  }

  // --- Tier 5: NewsAPI (optional) ---
  if (isTierEnabled('newsApi') && (loc.city || loc.stateAbbrev)) {
    const query = [loc.city, loc.stateAbbrev ? loc.stateAbbrev.toUpperCase() : '', 'local news'].filter(Boolean).join(' ');
    addSource(5, 'newsapi', `NewsAPI: ${query}`,
      LOCAL_SOURCE_TIERS.newsApi.baseUrlTemplate
        .replace('${query}', encodeURIComponent(query))
        .replace('${apiKey}', ''),
      { queryType: 'city_state' });
  }

  // --- Tier 6: Reddit subreddits ---
  if (isTierEnabled('reddit') && loc.city && loc.stateAbbrev) {
    const key = `${loc.city.toLowerCase()}|${loc.stateAbbrev}`;
    const sub = subredditIndex.get(key);
    if (sub) {
      addSource(6, 'reddit-local', `r/${sub.subreddit}`,
        buildRedditRssUrl(sub.subreddit),
        { subreddit: sub.subreddit });
    }
  }

  return { locationKey, sources };
}

/**
 * Generate local source plans for multiple locations (batch).
 * Deduplicates across all locations to avoid fetching the same URL twice.
 *
 * @param {Array<Object>} locations – array of location objects
 * @param {Object} [options]
 * @returns {{ plans: Array, allSources: Array, stats: Object }}
 */
function buildBatchLocalSourcePlans(locations = [], options = {}) {
  const plans = [];
  const allSources = [];
  const seenUrls = new Set();
  const statsByTier = {};

  for (const loc of locations) {
    const plan = buildLocalSourcePlan(loc, options);
    const dedupedSources = [];
    for (const src of plan.sources) {
      const normalizedUrl = src.url.toLowerCase().trim();
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        dedupedSources.push(src);
        allSources.push(src);

        const tierKey = `tier_${src.tier}`;
        statsByTier[tierKey] = (statsByTier[tierKey] || 0) + 1;
      }
    }
    plans.push({ ...plan, sources: dedupedSources });
  }

  return {
    plans,
    allSources,
    stats: {
      totalLocations: locations.length,
      totalSources: allSources.length,
      byTier: statsByTier
    }
  };
}

module.exports = {
  buildLocalSourcePlan,
  buildBatchLocalSourcePlans,
  normalizeLocationInput,
  // Expose indexes for testing
  _indexes: { affiliateIndex, newspaperIndex, subredditIndex }
};
