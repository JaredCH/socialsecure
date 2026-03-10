/**
 * Local Source Catalog
 *
 * Canonical provider definitions for US local news ingestion, organized by tier.
 * Each provider includes base URL template, location input requirements,
 * rate-limit hints, and legal/attribution notes.
 *
 * Tier ordering (lower = higher priority):
 *   1 – Google News (city/state/ZIP queries)
 *   2 – TV affiliates (ABC/CBS/NBC/FOX)
 *   3 – Patch.com hyperlocal RSS
 *   4 – Local newspapers
 *   5 – NewsAPI (optional, free-tier constrained)
 *   6 – Reddit city subreddits (supplemental)
 */

const LOCAL_SOURCE_TIERS = {
  googleNews: {
    providerId: 'google-news-local',
    tier: 1,
    label: 'Google News Local',
    baseUrlTemplate: 'https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en',
    locationInputs: ['city', 'state', 'zipCode'],
    enabledByDefault: true,
    rateLimitHints: { maxRequestsPerMinute: 30, delayMs: 2000 },
    legalNotes: 'Public RSS feed. Respect Google News ToS and rate limits.',
    attribution: 'Google News'
  },
  tvAffiliate: {
    providerId: 'tv-affiliate',
    tier: 2,
    label: 'Local TV Affiliates',
    baseUrlTemplate: null, // URLs come from lookup table
    locationInputs: ['city', 'state', 'dma'],
    enabledByDefault: true,
    rateLimitHints: { maxRequestsPerMinute: 20, delayMs: 3000 },
    legalNotes: 'Public RSS feeds from local TV stations. Attribution required.',
    attribution: 'Local TV Station'
  },
  patch: {
    providerId: 'patch',
    tier: 3,
    label: 'Patch.com',
    baseUrlTemplate: 'https://patch.com/${state}/${city}/rss',
    locationInputs: ['city', 'state'],
    enabledByDefault: true,
    rateLimitHints: { maxRequestsPerMinute: 15, delayMs: 4000 },
    legalNotes: 'Patch.com public RSS. Respect robots.txt and rate limits.',
    attribution: 'Patch.com'
  },
  newspaper: {
    providerId: 'local-newspaper',
    tier: 4,
    label: 'Local Newspapers',
    baseUrlTemplate: null, // URLs come from lookup table
    locationInputs: ['city', 'state'],
    enabledByDefault: true,
    rateLimitHints: { maxRequestsPerMinute: 15, delayMs: 4000 },
    legalNotes: 'Public RSS feeds from local newspapers. Metadata-only ingestion.',
    attribution: 'Local Newspaper'
  },
  newsApi: {
    providerId: 'newsapi',
    tier: 5,
    label: 'NewsAPI',
    baseUrlTemplate: 'https://newsapi.org/v2/everything?q=${query}&apiKey=${apiKey}',
    locationInputs: ['city', 'state'],
    enabledByDefault: false,
    rateLimitHints: { maxRequestsPerMinute: 5, delayMs: 12000 },
    legalNotes: 'Free tier limited to 100 requests/day. Requires API key.',
    attribution: 'NewsAPI.org'
  },
  reddit: {
    providerId: 'reddit-local',
    tier: 6,
    label: 'Reddit Local',
    baseUrlTemplate: 'https://www.reddit.com/r/${subreddit}/new/.rss',
    locationInputs: ['city', 'state'],
    enabledByDefault: true,
    rateLimitHints: { maxRequestsPerMinute: 10, delayMs: 6000 },
    legalNotes: 'Reddit public RSS. Respect API ToS and rate limits. Supplemental only.',
    attribution: 'Reddit'
  }
};

/**
 * Build a Google News search URL for a specific location query.
 */
function buildLocalGoogleNewsUrl(query) {
  return LOCAL_SOURCE_TIERS.googleNews.baseUrlTemplate.replace('${query}', encodeURIComponent(query));
}

/**
 * Build a Patch.com RSS URL for a city/state.
 * Patch uses lowercase slugified city and state abbreviation.
 */
function buildPatchUrl(city, stateAbbrev) {
  const slug = String(city || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const st = String(stateAbbrev || '').toLowerCase();
  return LOCAL_SOURCE_TIERS.patch.baseUrlTemplate
    .replace('${state}', st)
    .replace('${city}', slug);
}

/**
 * Build a Reddit subreddit RSS URL.
 */
function buildRedditRssUrl(subreddit) {
  return LOCAL_SOURCE_TIERS.reddit.baseUrlTemplate
    .replace('${subreddit}', encodeURIComponent(subreddit));
}

/**
 * Get all tiers sorted by priority (lower tier number = higher priority).
 */
function getSortedTiers() {
  return Object.values(LOCAL_SOURCE_TIERS)
    .sort((a, b) => a.tier - b.tier);
}

/**
 * Get a tier definition by providerId.
 */
function getTierByProviderId(providerId) {
  return Object.values(LOCAL_SOURCE_TIERS).find(t => t.providerId === providerId) || null;
}

module.exports = {
  LOCAL_SOURCE_TIERS,
  buildLocalGoogleNewsUrl,
  buildPatchUrl,
  buildRedditRssUrl,
  getSortedTiers,
  getTierByProviderId
};
