const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Parser = require('rss-parser');
const NodeGeocoder = require('node-geocoder');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const https = require('https');

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
const {
  NEWS_SOURCE_CATALOG,
  CATALOG_VERSION,
  computeSourceHealth,
  buildMergedSources
} = require('../config/newsSourceCatalog');
const {
  buildLocalSourcePlan,
  buildBatchLocalSourcePlans
} = require('../services/newsLocalSourcePlanner');
const {
  LOCAL_SOURCE_TIERS,
  buildPatchUrl,
  buildRedditRssUrl
} = require('../config/news/localSourceCatalog');
const {
  US_STATES_AND_TERRITORIES,
  canonicalizeNewsLocation,
  canonicalizeStateCode,
  getLocationTaxonomyPayload,
  titleCase
} = require('../utils/newsLocationTaxonomy');
const { inferSportsLocationFromText } = require('../data/news/sportsTeamLocationIndex');

// Initialize RSS parser with timeout
const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'SocialSecure-NewsBot/1.0'
  },
  customFields: {
    feed: [
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['media:content', 'mediaContent', { keepArray: true }],
      ['language', 'feedLanguage']
    ],
    item: [
      ['content:encoded', 'contentEncoded'],
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['dc:creator', 'dcCreator'],
      ['dc:subject', 'dcSubject'],
      ['geo:lat', 'geoLat'],
      ['geo:long', 'geoLong'],
      ['source', 'rssSource']
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
const NEWS_RETENTION_DAYS = 7;
const NEWS_RETENTION_MS = NEWS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const NEWS_LOCATION_TAGGER_V2_ENABLED = String(process.env.NEWS_LOCATION_TAGGER_V2 || 'true').toLowerCase() !== 'false';
const GDELT_ENABLED = String(process.env.GDELT_ENABLED || 'false').toLowerCase() === 'true';
const GDELT_API_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GDELT_DEFAULT_QUERIES = ['local news', 'breaking news', 'community news'];

// ============================================
// LOCAL NEWS INGESTION FEATURE FLAGS
// ============================================
const NEWS_LOCAL_SOURCES_ENABLED = String(process.env.NEWS_LOCAL_SOURCES_ENABLED || 'false').toLowerCase() === 'true';
const NEWS_LOCAL_GOOGLE_ENABLED = String(process.env.NEWS_LOCAL_GOOGLE_ENABLED || 'true').toLowerCase() !== 'false';
const NEWS_LOCAL_TV_ENABLED = String(process.env.NEWS_LOCAL_TV_ENABLED || 'true').toLowerCase() !== 'false';
const NEWS_LOCAL_PATCH_ENABLED = String(process.env.NEWS_LOCAL_PATCH_ENABLED || 'true').toLowerCase() !== 'false';
const NEWS_LOCAL_NEWSPAPER_ENABLED = String(process.env.NEWS_LOCAL_NEWSPAPER_ENABLED || 'true').toLowerCase() !== 'false';
const NEWS_LOCAL_REDDIT_ENABLED = String(process.env.NEWS_LOCAL_REDDIT_ENABLED || 'true').toLowerCase() !== 'false';
const NEWS_LOCAL_NEWSAPI_ENABLED = String(process.env.NEWS_LOCAL_NEWSAPI_ENABLED || 'false').toLowerCase() === 'true';
const NEWS_API_KEY = (process.env.NEWS_API_KEY || '').trim();
const NEWS_LOCAL_MAX_LOCATIONS = Math.max(1, parseInt(process.env.NEWS_LOCAL_MAX_LOCATIONS || '50', 10) || 50);

// ============================================
// WEATHER CACHE
// ============================================
const WEATHER_CACHE_TTL_MS = Math.max(60000, parseInt(process.env.WEATHER_CACHE_TTL_MS || '600000', 10) || 600000); // default 10 min
const weatherCache = new Map();
const weatherCacheMetrics = { hits: 0, misses: 0, errors: 0, totalLatencyMs: 0, fetchCount: 0 };

const newsGeocoder = NodeGeocoder({
  provider: 'openstreetmap',
  httpAdapter: 'https',
  formatter: null
});

// ─── Source health classification ──────────────────────────────────────────
function classifySourceHealth(source) {
  if (!source.lastFetchAt) return { health: 'unknown', healthReason: 'Never fetched' };
  const hoursSinceLastFetch = (Date.now() - new Date(source.lastFetchAt).getTime()) / (1000 * 60 * 60);
  if (source.lastFetchStatus === 'success' && hoursSinceLastFetch < 2) {
    return { health: 'green', healthReason: 'Healthy' };
  }
  if (source.lastFetchStatus === 'success' && hoursSinceLastFetch < 24) {
    return { health: 'yellow', healthReason: 'Stale — last success ' + Math.round(hoursSinceLastFetch) + 'h ago' };
  }
  if (source.lastFetchStatus === 'error') {
    return { health: 'red', healthReason: source.lastError || 'Last fetch failed' };
  }
  return { health: 'yellow', healthReason: 'Last fetched ' + Math.round(hoursSinceLastFetch) + 'h ago' };
}

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
  ai: ['ai', 'artificial intelligence', 'machine learning'],
  world: ['world', 'international'],
  general: ['general', 'top stories', 'headlines']
};

// ============================================
// STANDARDIZED CATEGORY SYSTEM
// ============================================

const STANDARDIZED_CATEGORIES = [
  'technology', 'science', 'health', 'business', 'sports',
  'entertainment', 'politics', 'finance', 'gaming', 'ai',
  'world', 'general'
];

/**
 * Map a raw topic/category string to the closest standardized category.
 */
const normalizeToStandardCategory = (raw = '') => {
  const lower = normalizeTopicToken(raw);
  if (!lower) return 'general';
  if (STANDARDIZED_CATEGORIES.includes(lower)) return lower;
  // Check aliases
  for (const [category, aliases] of Object.entries(TOPIC_FILTER_ALIASES)) {
    if (aliases.includes(lower)) return category;
  }
  // Partial matches
  if (lower.includes('tech') || lower.includes('software') || lower.includes('computing')) return 'technology';
  if (lower.includes('scienc') || lower.includes('environment')) return 'science';
  if (lower.includes('health') || lower.includes('medical') || lower.includes('wellness')) return 'health';
  if (lower.includes('financ') || lower.includes('stock') || lower.includes('invest') || lower.includes('banking')) return 'finance';
  if (lower.includes('business') || lower.includes('econom') || lower.includes('market')) return 'business';
  if (lower.includes('sport') || lower.includes('athletic') || lower.includes('football') || lower.includes('basketball') || lower.includes('soccer')) return 'sports';
  if (lower.includes('entertain') || lower.includes('movie') || lower.includes('music') || lower.includes('arts')) return 'entertainment';
  if (lower.includes('politic') || lower.includes('election') || lower.includes('government') || lower.includes('congress')) return 'politics';
  if (lower.includes('gaming') || lower.includes('video game') || lower.includes('esport')) return 'gaming';
  if (lower.includes('artificial intelligence') || lower.includes('machine learning') || /\bai\b/.test(lower)) return 'ai';
  if (lower.includes('world') || lower.includes('international') || lower.includes('global')) return 'world';
  return 'general';
};

// ============================================
// GOOGLE NEWS TOPIC CONFIGURATION
// ============================================

/**
 * Google News topic map with explicit topic RSS feeds.
 * Includes the default categories subscribed during ingestion.
 */
const GOOGLE_NEWS_TOPIC_MAP = {
  'top stories': { category: 'general', label: 'Top Stories', url: 'https://news.google.com/rss' },
  world: { category: 'world', label: 'World', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREZxYUdjU0FtVnVLQUFQAQ?hl=en-US&gl=US&ceid=US:en' },
  business: { category: 'business', label: 'Business', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRlVnWm9ScQ?hl=en-US&gl=US&ceid=US:en' },
  technology: { category: 'technology', label: 'Technology', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFZxYUdjU0FtVnVLQUFQAQ?hl=en-US&gl=US&ceid=US:en' },
  entertainment: { category: 'entertainment', label: 'Entertainment', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREp3YUdjU0FtVnVLQUFQAQ?hl=en-US&gl=US&ceid=US:en' },
  health: { category: 'health', label: 'Health', url: 'https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtVnVLQUFQAQ?hl=en-US&gl=US&ceid=US:en' },
  science: { category: 'science', label: 'Science', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVLQUFQAQ?hl=en-US&gl=US&ceid=US:en' },
  sports: { category: 'sports', label: 'Sports', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtVnVLQUFQAQ?hl=en-US&gl=US&ceid=US:en' },
  politics: { category: 'politics', label: 'Politics', url: 'https://news.google.com/rss/search?q=politics&hl=en-US&gl=US&ceid=US:en' },
  finance: { category: 'finance', label: 'Finance', url: 'https://news.google.com/rss/search?q=finance+stock+market&hl=en-US&gl=US&ceid=US:en' },
  gaming: { category: 'gaming', label: 'Gaming', url: 'https://news.google.com/rss/search?q=video+games+gaming&hl=en-US&gl=US&ceid=US:en' },
  ai: { category: 'ai', label: 'AI & Machine Learning', url: 'https://news.google.com/rss/search?q=artificial+intelligence+machine+learning&hl=en-US&gl=US&ceid=US:en' }
};

const buildGoogleNewsFeedUrl = (query) => {
  const topicConfig = GOOGLE_NEWS_TOPIC_MAP[String(query || '').toLowerCase()];
  if (topicConfig?.url) {
    return topicConfig.url;
  }
  const encodedQuery = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;
};

// ============================================
// NPR RSS FEED CONFIGURATION
// ============================================

const NPR_ENABLED = String(process.env.NPR_ENABLED || 'true').toLowerCase() !== 'false';

const NPR_FEED_MAP = {
  news: { url: 'https://feeds.npr.org/1001/rss.xml', category: 'general', label: 'NPR News' },
  us: { url: 'https://feeds.npr.org/1003/rss.xml', category: 'general', label: 'NPR U.S. News' },
  world: { url: 'https://feeds.npr.org/1004/rss.xml', category: 'world', label: 'NPR World' },
  politics: { url: 'https://feeds.npr.org/1017/rss.xml', category: 'politics', label: 'NPR Politics' },
  business: { url: 'https://feeds.npr.org/1019/rss.xml', category: 'business', label: 'NPR Business' },
  health: { url: 'https://feeds.npr.org/1128/rss.xml', category: 'health', label: 'NPR Health' }
};

// ============================================
// BBC RSS FEED CONFIGURATION
// ============================================

const BBC_ENABLED = String(process.env.BBC_ENABLED || 'true').toLowerCase() !== 'false';

const BBC_FEED_MAP = {
  top: { url: 'https://feeds.bbci.co.uk/news/rss.xml', category: 'general', label: 'BBC Top Stories' },
  world: { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'world', label: 'BBC World' },
  uk: { url: 'https://feeds.bbci.co.uk/news/uk/rss.xml', category: 'world', label: 'BBC UK' },
  england: { url: 'https://feeds.bbci.co.uk/news/england/rss.xml', category: 'world', label: 'BBC England' },
  northernIreland: { url: 'https://feeds.bbci.co.uk/news/northern_ireland/rss.xml', category: 'world', label: 'BBC Northern Ireland' },
  scotland: { url: 'https://feeds.bbci.co.uk/news/scotland/rss.xml', category: 'world', label: 'BBC Scotland' },
  wales: { url: 'https://feeds.bbci.co.uk/news/wales/rss.xml', category: 'world', label: 'BBC Wales' },
  business: { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', category: 'business', label: 'BBC Business' },
  politics: { url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', category: 'politics', label: 'BBC Politics' },
  entertainment: { url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', category: 'entertainment', label: 'BBC Entertainment' },
  health: { url: 'https://feeds.bbci.co.uk/news/health/rss.xml', category: 'health', label: 'BBC Health' },
  education: { url: 'https://feeds.bbci.co.uk/news/education/rss.xml', category: 'general', label: 'BBC Education' },
  science: { url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', category: 'science', label: 'BBC Science' },
  technology: { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', category: 'technology', label: 'BBC Technology' },
  magazine: { url: 'https://feeds.bbci.co.uk/news/magazine/rss.xml', category: 'general', label: 'BBC Magazine' },
  sport: { url: 'https://feeds.bbci.co.uk/sport/rss.xml', category: 'sports', label: 'BBC Sport' },
  football: { url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', category: 'sports', label: 'BBC Football' },
  formula1: { url: 'https://feeds.bbci.co.uk/sport/formula1/rss.xml', category: 'sports', label: 'BBC Formula 1' },
  olympics: { url: 'https://feeds.bbci.co.uk/sport/olympics/rss.xml', category: 'sports', label: 'BBC Olympics' },
  cricket: { url: 'https://feeds.bbci.co.uk/sport/cricket/rss.xml', category: 'sports', label: 'BBC Cricket' },
  rugbyUnion: { url: 'https://feeds.bbci.co.uk/sport/rugby-union/rss.xml', category: 'sports', label: 'BBC Rugby Union' },
  rugbyLeague: { url: 'https://feeds.bbci.co.uk/sport/rugby-league/rss.xml', category: 'sports', label: 'BBC Rugby League' },
  tennis: { url: 'https://feeds.bbci.co.uk/sport/tennis/rss.xml', category: 'sports', label: 'BBC Tennis' },
  golf: { url: 'https://feeds.bbci.co.uk/sport/golf/rss.xml', category: 'sports', label: 'BBC Golf' }
};

const AP_ENABLED = String(process.env.AP_ENABLED || 'true').toLowerCase() !== 'false';

const AP_FEED_MAP = {
  top: { url: 'https://apnews.com/hub/ap-top-news/rss', category: 'general', label: 'AP Top Headlines' },
  us: { url: 'https://apnews.com/hub/us-news/rss', category: 'general', label: 'AP U.S.' },
  world: { url: 'https://apnews.com/hub/world-news/rss', category: 'world', label: 'AP World' },
  politics: { url: 'https://apnews.com/hub/politics/rss', category: 'politics', label: 'AP Politics' },
  technology: { url: 'https://apnews.com/hub/technology/rss', category: 'technology', label: 'AP Technology' },
  health: { url: 'https://apnews.com/hub/health/rss', category: 'health', label: 'AP Health' }
};

const REUTERS_ENABLED = String(process.env.REUTERS_ENABLED || 'true').toLowerCase() !== 'false';

const REUTERS_FEED_MAP = {
  top: { url: 'https://www.reutersagency.com/feed/?best-topics=topNews', category: 'general', label: 'Reuters Top News' },
  world: { url: 'https://www.reutersagency.com/feed/?best-topics=worldNews', category: 'world', label: 'Reuters World' },
  us: { url: 'https://www.reutersagency.com/feed/?best-topics=usNews', category: 'general', label: 'Reuters U.S.' },
  business: { url: 'https://www.reutersagency.com/feed/?best-topics=businessNews', category: 'business', label: 'Reuters Business' },
  technology: { url: 'https://www.reutersagency.com/feed/?best-topics=technologyNews', category: 'technology', label: 'Reuters Technology' }
};

const PBS_ENABLED = String(process.env.PBS_ENABLED || 'true').toLowerCase() !== 'false';

const PBS_FEED_MAP = {
  newsHour: { url: 'https://www.pbs.org/newshour/rss/', category: 'general', label: 'PBS NewsHour' }
};

// ============================================
// YAHOO RSS FEED CONFIGURATION
// ============================================

const YAHOO_ENABLED = String(process.env.YAHOO_ENABLED || 'true').toLowerCase() !== 'false';

const YAHOO_FEED_MAP = {
  topStories: { url: 'https://news.yahoo.com/rss/', category: 'general', label: 'Yahoo Top Stories' },
  world: { url: 'https://news.yahoo.com/rss/world', category: 'world', label: 'Yahoo World' },
  us: { url: 'https://news.yahoo.com/rss/us', category: 'general', label: 'Yahoo US' },
  politics: { url: 'https://news.yahoo.com/rss/politics', category: 'politics', label: 'Yahoo Politics' },
  business: { url: 'https://news.yahoo.com/rss/business', category: 'business', label: 'Yahoo Business' },
  technology: { url: 'https://news.yahoo.com/rss/tech', category: 'technology', label: 'Yahoo Technology' },
  entertainment: { url: 'https://news.yahoo.com/rss/entertainment', category: 'entertainment', label: 'Yahoo Entertainment' },
  sports: { url: 'https://sports.yahoo.com/rss/', category: 'sports', label: 'Yahoo Sports' },
  health: { url: 'https://news.yahoo.com/rss/health', category: 'health', label: 'Yahoo Health' },
  science: { url: 'https://news.yahoo.com/rss/science', category: 'science', label: 'Yahoo Science' }
};

// ============================================
// CNN RSS FEED CONFIGURATION
// ============================================

const CNN_ENABLED = String(process.env.CNN_ENABLED || 'true').toLowerCase() !== 'false';

const CNN_FEED_MAP = {
  topStories: { url: 'https://rss.cnn.com/rss/cnn_topstories.rss', category: 'general', label: 'CNN Top Stories' },
  world: { url: 'https://rss.cnn.com/rss/cnn_world.rss', category: 'world', label: 'CNN World' },
  politics: { url: 'https://rss.cnn.com/rss/cnn_allpolitics.rss', category: 'politics', label: 'CNN Politics' },
  business: { url: 'https://rss.cnn.com/rss/money_latest.rss', category: 'business', label: 'CNN Business' },
  technology: { url: 'https://rss.cnn.com/rss/cnn_tech.rss', category: 'technology', label: 'CNN Technology' },
  health: { url: 'https://rss.cnn.com/rss/cnn_health.rss', category: 'health', label: 'CNN Health' },
  entertainment: { url: 'https://rss.cnn.com/rss/cnn_showbiz.rss', category: 'entertainment', label: 'CNN Entertainment' }
};

// ============================================
// GUARDIAN RSS FEED CONFIGURATION
// ============================================

const GUARDIAN_ENABLED = String(process.env.GUARDIAN_ENABLED || 'true').toLowerCase() !== 'false';

const GUARDIAN_FEED_MAP = {
  world: { url: 'https://www.theguardian.com/world/rss', category: 'world', label: 'Guardian World' },
  politics: { url: 'https://www.theguardian.com/us-news/us-politics/rss', category: 'politics', label: 'Guardian Politics' },
  business: { url: 'https://www.theguardian.com/uk/business/rss', category: 'business', label: 'Guardian Business' },
  technology: { url: 'https://www.theguardian.com/uk/technology/rss', category: 'technology', label: 'Guardian Technology' },
  science: { url: 'https://www.theguardian.com/science/rss', category: 'science', label: 'Guardian Science' }
};

// ============================================
// NEW YORK TIMES RSS FEED CONFIGURATION
// ============================================

const NYT_ENABLED = String(process.env.NYT_ENABLED || 'true').toLowerCase() !== 'false';

const NYT_FEED_MAP = {
  world: { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', category: 'world', label: 'NYT World' },
  politics: { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml', category: 'politics', label: 'NYT Politics' },
  business: { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', category: 'business', label: 'NYT Business' },
  technology: { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', category: 'technology', label: 'NYT Technology' },
  science: { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml', category: 'science', label: 'NYT Science' }
};

// ============================================
// WALL STREET JOURNAL RSS FEED CONFIGURATION
// ============================================

const WSJ_ENABLED = String(process.env.WSJ_ENABLED || 'true').toLowerCase() !== 'false';

const WSJ_FEED_MAP = {
  business: { url: 'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml', category: 'business', label: 'WSJ Business' },
  finance: { url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml', category: 'finance', label: 'WSJ Finance' },
  technology: { url: 'https://feeds.a.dj.com/rss/RSSWSJD.xml', category: 'technology', label: 'WSJ Technology' }
};

// ============================================
// TECHCRUNCH RSS FEED CONFIGURATION
// ============================================

const TECHCRUNCH_ENABLED = String(process.env.TECHCRUNCH_ENABLED || 'true').toLowerCase() !== 'false';

const TECHCRUNCH_FEED_MAP = {
  latest: { url: 'https://techcrunch.com/feed/', category: 'technology', label: 'TechCrunch Latest' },
  startups: { url: 'https://techcrunch.com/category/startups/feed/', category: 'business', label: 'TechCrunch Startups' }
};

// ============================================
// ESPN RSS FEED CONFIGURATION
// ============================================

const ESPN_ENABLED = String(process.env.ESPN_ENABLED || 'true').toLowerCase() !== 'false';

const ESPN_FEED_MAP = {
  topHeadlines: { url: 'https://www.espn.com/espn/rss/news', category: 'sports', label: 'ESPN Top Headlines' },
  nfl: { url: 'https://www.espn.com/espn/rss/nfl/news', category: 'sports', label: 'ESPN NFL' },
  nba: { url: 'https://www.espn.com/espn/rss/nba/news', category: 'sports', label: 'ESPN NBA' },
  mlb: { url: 'https://www.espn.com/espn/rss/mlb/news', category: 'sports', label: 'ESPN MLB' },
  soccer: { url: 'https://www.espn.com/espn/rss/soccer/news', category: 'sports', label: 'ESPN Soccer' }
};

// ============================================
// LOCATION DICTIONARIES
// ============================================

const US_STATE_NAMES = new Map(
  US_STATES_AND_TERRITORIES.map((entry) => [String(entry.name || '').toLowerCase(), String(entry.code || '').toLowerCase()])
);

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

/**
 * Country variants map: canonical country name → array of 4–6 name variants.
 * Used as a secondary fallback when the primary location detection finds no tokens.
 * Scans article title and description for any variant and assigns the canonical name.
 */
const COUNTRY_VARIANTS_MAP = new Map([
  ['united states', ['united states', 'usa', 'u.s.a.', 'u.s.', 'america', 'american']],
  ['united kingdom', ['united kingdom', 'uk', 'u.k.', 'great britain', 'britain', 'british']],
  ['canada', ['canada', 'canadian', 'canadians', 'canuck', 'canucks']],
  ['australia', ['australia', 'australian', 'australians', 'oz', 'aussie']],
  ['germany', ['germany', 'german', 'deutschland', 'bundesrepublik', 'federal republic of germany']],
  ['france', ['france', 'french', 'republique francaise', 'la france', 'gallic']],
  ['japan', ['japan', 'japanese', 'nippon', 'nihon', 'land of the rising sun']],
  ['china', ['china', 'chinese', 'prc', "people's republic of china", 'mainland china', 'zhongguo']],
  ['india', ['india', 'indian', 'bharat', 'republic of india', 'hindustan']],
  ['brazil', ['brazil', 'brazilian', 'brasil', 'federative republic of brazil', 'brazilians']],
  ['mexico', ['mexico', 'mexican', 'mexicans', 'estados unidos mexicanos', 'united mexican states']],
  ['south korea', ['south korea', 'korean', 'republic of korea', 'rok', 'hanguk']],
  ['russia', ['russia', 'russian', 'russians', 'russian federation', 'rossiya']],
  ['italy', ['italy', 'italian', 'italians', 'italia', 'republic of italy']],
  ['spain', ['spain', 'spanish', 'spaniards', 'espana', 'kingdom of spain']],
  ['netherlands', ['netherlands', 'dutch', 'holland', 'the netherlands', 'kingdom of the netherlands']],
  ['sweden', ['sweden', 'swedish', 'swedes', 'sverige', 'kingdom of sweden']],
  ['norway', ['norway', 'norwegian', 'norwegians', 'norge', 'kingdom of norway']],
  ['switzerland', ['switzerland', 'swiss', 'helvetia', 'swiss confederation', 'confederation helvetique']],
  ['israel', ['israel', 'israeli', 'israelis', 'state of israel', 'zion']],
  ['ireland', ['ireland', 'republic of ireland', 'eire', 'emerald isle']],
  ['new zealand', ['new zealand', 'kiwi', 'kiwis', 'nz', 'aotearoa']],
  ['south africa', ['south africa', 'south african', 'rsa', 'republic of south africa', 'mzansi']],
  ['argentina', ['argentina', 'argentinian', 'argentine', 'argentinean', 'republica argentina']],
  ['colombia', ['colombia', 'colombian', 'colombians', 'republic of colombia', 'republica de colombia']],
  ['saudi arabia', ['saudi arabia', 'saudi', 'saudis', 'ksa', 'kingdom of saudi arabia']],
  ['turkey', ['turkey', 'turkish', 'turks', 'turkiye', 'republic of turkey']],
  ['poland', ['poland', 'polish', 'poles', 'rzeczpospolita', 'republic of poland']],
  ['ukraine', ['ukraine', 'ukrainian', 'ukrainians', 'ukrayina', 'republic of ukraine']],
  ['egypt', ['egypt', 'egyptian', 'egyptians', 'arab republic of egypt', 'misr']],
  ['nigeria', ['nigeria', 'nigerian', 'nigerians', 'federal republic of nigeria', 'naija']],
  ['kenya', ['kenya', 'kenyan', 'kenyans', 'republic of kenya', 'jamhuri ya kenya']],
  ['pakistan', ['pakistan', 'pakistani', 'pakistanis', 'islamic republic of pakistan', 'pak']],
  ['indonesia', ['indonesia', 'indonesian', 'indonesians', 'republic of indonesia', 'nusantara']],
  ['thailand', ['thailand', 'thai', 'thais', 'kingdom of thailand', 'siam']],
  ['vietnam', ['vietnam', 'vietnamese', 'viet nam', 'socialist republic of vietnam', 'vn']],
  ['malaysia', ['malaysia', 'malaysian', 'malaysians', 'federation of malaysia', 'malaya']],
  ['singapore', ['singapore', 'singaporean', 'singaporeans', 'republic of singapore', 'lion city']],
  ['taiwan', ['taiwan', 'taiwanese', 'republic of china', 'roc', 'formosa']],
  ['philippines', ['philippines', 'filipino', 'filipinos', 'philippine', 'republic of the philippines']],
  ['bangladesh', ['bangladesh', 'bangladeshi', 'bangladeshis', "people's republic of bangladesh", 'dhaka']],
  ['chile', ['chile', 'chilean', 'chileans', 'republic of chile', 'republica de chile']],
  ['peru', ['peru', 'peruvian', 'peruvians', 'republic of peru', 'republica del peru']],
  ['venezuela', ['venezuela', 'venezuelan', 'venezuelans', 'bolivarian republic of venezuela', 'vzla']],
  ['belgium', ['belgium', 'belgian', 'belgians', 'kingdom of belgium', 'belgique']],
  ['austria', ['austria', 'austrian', 'austrians', 'republic of austria', 'osterreich']],
  ['portugal', ['portugal', 'portuguese', 'lusitania', 'republica portuguesa', 'lusophone']],
  ['denmark', ['denmark', 'danish', 'danes', 'kingdom of denmark', 'danmark']],
  ['finland', ['finland', 'finnish', 'finns', 'republic of finland', 'suomi']],
  ['czech republic', ['czech republic', 'czech', 'czechia', 'czechs', 'ceska republika']],
  ['greece', ['greece', 'greek', 'greeks', 'hellenic republic', 'hellas']],
  ['romania', ['romania', 'romanian', 'romanians', 'republic of romania', 'rumania']],
  ['hungary', ['hungary', 'hungarian', 'hungarians', 'magyarorszag', 'republic of hungary']]
]);

// Pre-compiled patterns for country variant matching to avoid repeated RegExp construction per article.
const COUNTRY_VARIANT_PATTERNS = new Map(
  Array.from(COUNTRY_VARIANTS_MAP.entries()).map(([canonical, variants]) => [
    canonical,
    variants.map((v) => new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'))
  ])
);

/**
 * Secondary fallback: scan article title and description for country name variants.
 * Called when the primary location detection returns no tokens.
 * Returns an array of canonical country name tokens if any variant is matched.
 * Does not force an assignment — returns an empty array if nothing is detected.
 */
const inferLocationFromCountryVariants = (title = '', description = '') => {
  const text = `${title || ''} ${description || ''}`;
  if (!text.trim()) return [];
  const matched = [];
  for (const [canonical, patterns] of COUNTRY_VARIANT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        matched.push(canonical);
        break;
      }
    }
  }
  return toUniqueNonEmptyLocationTokens(matched);
};

const US_STATE_CAPITALS = [
  ['montgomery', 'alabama', 'al'], ['juneau', 'alaska', 'ak'], ['phoenix', 'arizona', 'az'],
  ['little rock', 'arkansas', 'ar'], ['sacramento', 'california', 'ca'], ['denver', 'colorado', 'co'],
  ['hartford', 'connecticut', 'ct'], ['dover', 'delaware', 'de'], ['tallahassee', 'florida', 'fl'],
  ['atlanta', 'georgia', 'ga'], ['honolulu', 'hawaii', 'hi'], ['boise', 'idaho', 'id'],
  ['springfield', 'illinois', 'il'], ['indianapolis', 'indiana', 'in'], ['des moines', 'iowa', 'ia'],
  ['topeka', 'kansas', 'ks'], ['frankfort', 'kentucky', 'ky'], ['baton rouge', 'louisiana', 'la'],
  ['augusta', 'maine', 'me'], ['annapolis', 'maryland', 'md'], ['boston', 'massachusetts', 'ma'],
  ['lansing', 'michigan', 'mi'], ['saint paul', 'minnesota', 'mn'], ['jackson', 'mississippi', 'ms'],
  ['jefferson city', 'missouri', 'mo'], ['helena', 'montana', 'mt'], ['lincoln', 'nebraska', 'ne'],
  ['carson city', 'nevada', 'nv'], ['concord', 'new hampshire', 'nh'], ['trenton', 'new jersey', 'nj'],
  ['santa fe', 'new mexico', 'nm'], ['albany', 'new york', 'ny'], ['raleigh', 'north carolina', 'nc'],
  ['bismarck', 'north dakota', 'nd'], ['columbus', 'ohio', 'oh'], ['oklahoma city', 'oklahoma', 'ok'],
  ['salem', 'oregon', 'or'], ['harrisburg', 'pennsylvania', 'pa'], ['providence', 'rhode island', 'ri'],
  ['columbia', 'south carolina', 'sc'], ['pierre', 'south dakota', 'sd'], ['nashville', 'tennessee', 'tn'],
  ['austin', 'texas', 'tx'], ['salt lake city', 'utah', 'ut'], ['montpelier', 'vermont', 'vt'],
  ['richmond', 'virginia', 'va'], ['olympia', 'washington', 'wa'], ['charleston', 'west virginia', 'wv'],
  ['madison', 'wisconsin', 'wi'], ['cheyenne', 'wyoming', 'wy'], ['washington', 'district of columbia', 'dc']
];

const LOCAL_STORY_SIGNAL_PATTERNS = [
  /\bcity council\b/, /\bcounty\b/, /\bparish\b/, /\bmayor\b/, /\bgovernor\b/, /\bsheriff\b/,
  /\bpolice\b/, /\bfire department\b/, /\bschool district\b/, /\bresidents?\b/,
  /\bcommunity\b/, /\bdowntown\b/, /\broadwork\b/, /\broad closure\b/, /\btransit\b/,
  /\bmunicipal\b/, /\bplanning commission\b/, /\bzoning\b/, /\bpublic safety\b/
];

const SUPPORTED_RSS_PROVIDERS = [
  { id: 'google-news', label: 'Google News', hostPatterns: ['news.google.com'] },
  { id: 'reuters', label: 'Reuters', hostPatterns: ['reuters.com', 'reutersagency.com'] },
  { id: 'bbc', label: 'BBC', hostPatterns: ['bbc.co.uk', 'bbc.com'] },
  { id: 'cnn', label: 'CNN', hostPatterns: ['cnn.com'] },
  { id: 'npr', label: 'NPR', hostPatterns: ['npr.org'] },
  { id: 'associated-press', label: 'Associated Press', hostPatterns: ['apnews.com'] },
  { id: 'pbs', label: 'PBS', hostPatterns: ['pbs.org'] },
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
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CAPITAL_CITY_MATCHERS = US_STATE_CAPITALS.map(([capitalCity, stateName, stateAbbrev]) => ({
  capitalCity,
  stateName,
  stateAbbrev,
  cityPattern: new RegExp(`\\b${escapeRegex(capitalCity)}\\b`, 'i'),
  stateNamePattern: new RegExp(`\\b${escapeRegex(stateName)}\\b`, 'i'),
  stateAbbrevPattern: new RegExp(`\\b${escapeRegex(stateAbbrev)}\\b`, 'i')
}));

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
  const hasLocalStorySignal = LOCAL_STORY_SIGNAL_PATTERNS.some((pattern) => pattern.test(lower));

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

  for (const {
    capitalCity, stateName, stateAbbrev, cityPattern, stateNamePattern, stateAbbrevPattern
  } of CAPITAL_CITY_MATCHERS) {
    if (!cityPattern.test(text)) continue;
    const hasExplicitStateHint = stateNamePattern.test(text) || stateAbbrevPattern.test(text);
    if (!hasExplicitStateHint) {
      if (!hasLocalStorySignal) continue;
      tokens.push(capitalCity);
      continue;
    }
    tokens.push(capitalCity, stateName, stateAbbrev);
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
    source.city,
    source.county,
    source.state,
    source.country,
    source.countryCode,
    source.zipCode,
    source.postalCode,
    source.location,
    source.address,
    item.geoLat,
    item.geoLong
  ];
  if (isLikelyLocationQuery(query)) {
    baseTokens.push(query);
  }

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

const normalizeLocationTagSet = (locationTags = {}, assignedZipCode = null) => ({
  zipCodes: extractZipTokens([...(Array.isArray(locationTags.zipCodes) ? locationTags.zipCodes : []), assignedZipCode]),
  cities: toUniqueNonEmptyLocationTokens(locationTags.cities || []),
  counties: toUniqueNonEmptyLocationTokens(locationTags.counties || []),
  states: toUniqueNonEmptyLocationTokens(locationTags.states || []),
  countries: toUniqueNonEmptyLocationTokens(locationTags.countries || [])
});

const isLikelyUsCountryToken = (token = '') => {
  const normalized = normalizeLocationToken(token);
  return normalized === 'us'
    || normalized === 'usa'
    || normalized === 'united states'
    || normalized === 'united states of america';
};

const extractLocationZipCode = (location = {}) => normalizeZipCode(
  location?.zipCode || location?.zipcode || location?.postalCode || location?.postalcode || ''
);

const enrichLocationTagsWithCorrelations = async ({ locationTags = {}, assignedZipCode = null }) => {
  const enriched = normalizeLocationTagSet(locationTags, assignedZipCode);
  const countryHints = new Set(enriched.countries);
  const isUsContext = countryHints.size === 0 || [...countryHints].some((token) => isLikelyUsCountryToken(token));

  for (const zipCode of [...enriched.zipCodes]) {
    let zipLocation = null;
    try {
      zipLocation = await findZipLocation(zipCode);
    } catch (error) {
      console.warn('News zip correlation lookup failed:', zipCode, error.message);
    }

    if (!zipLocation) {
      try {
        const geocoded = await geocodeLocationQuery(zipCode);
        zipLocation = geocoded?.result || null;
      } catch (error) {
        console.warn('News zip geocode correlation failed:', zipCode, error.message);
      }
    }

    if (zipLocation?.city) enriched.cities.push(normalizeLocationToken(zipLocation.city));
    if (zipLocation?.county) enriched.counties.push(normalizeLocationToken(zipLocation.county));
    if (zipLocation?.state) enriched.states.push(normalizeLocationToken(zipLocation.state));
    if (zipLocation?.stateCode) enriched.states.push(normalizeLocationToken(zipLocation.stateCode));
    if (zipLocation?.country) enriched.countries.push(normalizeLocationToken(zipLocation.country));
    if (zipLocation?.countryCode) enriched.countries.push(normalizeLocationToken(zipLocation.countryCode));
    const resolvedZip = extractLocationZipCode(zipLocation);
    if (resolvedZip && isZipLikeToken(resolvedZip)) enriched.zipCodes.push(resolvedZip);
  }

  if (isUsContext) {
    for (const city of [...enriched.cities]) {
      let matched = null;
      const stateHints = enriched.states.length > 0 ? [...enriched.states] : [];
      if (stateHints.length > 0) {
        for (const stateHint of stateHints) {
          try {
            matched = await findZipLocationByCityState({ city, state: stateHint, countryCode: 'US' });
          } catch (error) {
            console.warn('News city correlation lookup failed:', `${city}, ${stateHint}`, error.message);
          }
          if (matched?.zipCode) break;
        }
      }

      if (!matched?.zipCode) {
        try {
          const primaryStateHint = stateHints[0];
          const query = primaryStateHint ? `${city}, ${primaryStateHint}, US` : `${city}, US`;
          const geocoded = await geocodeLocationQuery(query);
          matched = geocoded?.result || null;
        } catch (error) {
          console.warn('News city geocode correlation failed:', city, error.message);
        }
      }

      const resolvedZip = extractLocationZipCode(matched);
      if (resolvedZip && isZipLikeToken(resolvedZip)) {
        enriched.zipCodes.push(resolvedZip);
      }
      if (matched?.state) enriched.states.push(normalizeLocationToken(matched.state));
      if (matched?.stateCode) enriched.states.push(normalizeLocationToken(matched.stateCode));
      if (matched?.country) enriched.countries.push(normalizeLocationToken(matched.country));
      if (matched?.countryCode) enriched.countries.push(normalizeLocationToken(matched.countryCode));
    }
  }

  const normalized = normalizeLocationTagSet(enriched);
  // Enforce deterministic city-level locality assignment: keep city/zip tags only when both are present.
  if (normalized.zipCodes.length === 0) {
    normalized.cities = [];
  } else if (normalized.cities.length === 0) {
    normalized.zipCodes = [];
  }
  return normalized;
};

const inferLocalityLevelFromTags = (locationTags = {}) => {
  const tags = normalizeLocationTagSet(locationTags);
  if (tags.zipCodes.length > 0 && tags.cities.length > 0) return 'city';
  if (tags.counties.length > 0) return 'county';
  if (tags.states.length > 0) return 'state';
  if (tags.countries.length > 0) return 'country';
  return 'global';
};

const isSportsContext = ({ source = {}, query = null, item = {} }) => {
  const directCategory = normalizeToStandardCategory(source.category || query || '');
  if (directCategory === 'sports') return true;
  const text = `${item.title || ''} ${item.contentSnippet || item.content || item.summary || ''}`.toLowerCase();
  return /\b(nfl|nba|wnba|mls|nwsl|nhl|mlb|ncaa|college football|march madness)\b/.test(text);
};

const inferSportsLocationContext = ({ source = {}, query = null, item = {} }) => {
  if (!isSportsContext({ source, query, item })) return null;
  const text = `${item.title || ''} ${item.contentSnippet || item.content || item.summary || ''}`;
  const matchedTeam = inferSportsLocationFromText(text);
  if (!matchedTeam) return null;

  const canonical = canonicalizeNewsLocation({
    city: matchedTeam.city,
    state: matchedTeam.state,
    country: 'US'
  });

  if (!canonical.city || !canonical.stateCode) return null;

  const cityToken = canonical.city.toLowerCase();
  const stateCodeToken = canonical.stateCode.toLowerCase();
  const stateNameToken = String(canonical.state || '').toLowerCase();

  return {
    locationTokens: toUniqueNonEmptyLocationTokens([cityToken, stateCodeToken, stateNameToken, 'united states', 'us']),
    locationTags: {
      zipCodes: [],
      cities: [cityToken],
      counties: [],
      states: toUniqueNonEmptyStrings([stateCodeToken, stateNameToken]),
      countries: ['united states', 'us']
    },
    localityLevel: 'city',
    scopeMetadata: { scopeReason: 'city_match', scopeConfidence: 0.92 }
  };
};

const resolveArticleLocationContext = async ({ source = {}, item = {}, query = null }) => {
  let locationTokens = buildArticleLocationTokens({ source, item, query });

  // Secondary fallback: if primary detection found nothing, scan title + description
  // for country name variants to improve location coverage.
  if (locationTokens.length === 0) {
    const fallbackTokens = inferLocationFromCountryVariants(
      item.title || '',
      item.contentSnippet || item.content || item.summary || ''
    );
    if (fallbackTokens.length > 0) {
      locationTokens = fallbackTokens;
    }
  }

  const assignedZipCode = await resolveAssignedZipCode({ locationTokens, source, item, query });
  const rawLocationTags = buildLocationTags({ locationTokens, assignedZipCode });
  let locationTags = await enrichLocationTagsWithCorrelations({ locationTags: rawLocationTags, assignedZipCode });
  let localityLevel = inferLocalityLevelFromTags(locationTags);
  let scopeMetadata = deriveScopeMetadata({ locationTags, localityLevel, locationTokens });

  // For sports coverage with no explicit location, infer city/state from team references.
  if (localityLevel === 'global') {
    const sportsContext = inferSportsLocationContext({ source, query, item });
    if (sportsContext) {
      locationTokens = toUniqueNonEmptyLocationTokens([...locationTokens, ...sportsContext.locationTokens]);
      locationTags = normalizeLocationTagSet(mergeLocationTags(locationTags, sportsContext.locationTags, assignedZipCode), assignedZipCode);
      localityLevel = sportsContext.localityLevel;
      scopeMetadata = sportsContext.scopeMetadata;
    }
  }

  return {
    locationTokens,
    assignedZipCode,
    locationTags,
    localityLevel,
    scopeMetadata
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

const canonicalizePreferenceLocation = (location = {}) => {
  const canonical = canonicalizeNewsLocation(location || {});
  return {
    city: canonical.city,
    county: canonical.county,
    zipCode: canonical.zipCode,
    state: canonical.state,
    stateCode: canonical.stateCode,
    country: canonical.country,
    countryCode: canonical.countryCode,
    cityKey: canonical.cityKey,
    isPrimary: Boolean(location?.isPrimary)
  };
};

const getPrimaryPreferenceLocation = (preferences = {}) => {
  const locations = Array.isArray(preferences?.locations) ? preferences.locations : [];
  return locations.find((location) => location?.isPrimary) || locations[0] || null;
};

const buildRegistrationAlignment = ({ user, preferences }) => {
  const registrationLocation = canonicalizeNewsLocation({
    city: user?.city,
    state: user?.state,
    country: user?.country,
    zipCode: user?.zipCode
  });
  const primaryPreferenceRaw = getPrimaryPreferenceLocation(preferences);
  const primaryPreference = primaryPreferenceRaw ? canonicalizeNewsLocation(primaryPreferenceRaw) : null;

  if (!primaryPreference || !registrationLocation.cityKey) {
    return {
      needsConfirmation: false,
      isAligned: true,
      registrationLocation,
      preferenceLocation: primaryPreference,
      message: ''
    };
  }

  const sameCity = registrationLocation.cityKey && primaryPreference.cityKey
    ? registrationLocation.cityKey === primaryPreference.cityKey
    : false;
  const sameState = registrationLocation.stateCode && primaryPreference.stateCode
    ? registrationLocation.stateCode === primaryPreference.stateCode
    : false;
  const isAligned = sameCity || (sameState && !registrationLocation.cityKey && !primaryPreference.cityKey);

  return {
    needsConfirmation: !isAligned,
    isAligned,
    registrationLocation,
    preferenceLocation: primaryPreference,
    message: !isAligned
      ? 'Your news location differs from your registration location. Confirm or update to keep local content accurate.'
      : ''
  };
};

const firstNonEmpty = (values = []) => values.find((value) => String(value || '').trim().length > 0) || null;

const formatArticleLocationMetadata = (article = {}) => {
  const tags = article.locationTags || {};
  const canonicalCountry = canonicalizeNewsLocation({ country: firstNonEmpty(tags.countries) }).country;
  const canonicalStateCode = canonicalizeStateCode(firstNonEmpty(tags.states) || article.state);
  const canonicalStateName = canonicalStateCode
    ? US_STATES_AND_TERRITORIES.find((entry) => entry.code === canonicalStateCode)?.name || null
    : null;
  const canonicalCity = firstNonEmpty(tags.cities) ? titleCase(firstNonEmpty(tags.cities)) : null;

  if (canonicalCity && canonicalStateCode) {
    return { kind: 'local', label: `${canonicalCity}, ${canonicalStateCode}`, city: canonicalCity, state: canonicalStateName, stateCode: canonicalStateCode };
  }
  if (canonicalStateName) {
    return { kind: 'state', label: canonicalStateName, state: canonicalStateName, stateCode: canonicalStateCode };
  }
  if (canonicalCountry && canonicalCountry !== 'US') {
    return { kind: 'country', label: canonicalCountry, country: canonicalCountry };
  }
  if (canonicalCountry === 'US' || article.localityLevel === 'country') {
    return { kind: 'national', label: 'United States', country: 'United States' };
  }
  return { kind: 'global', label: 'Global' };
};

const maybePopulatePreferences = async (queryOrDoc) => {
  if (!queryOrDoc) return queryOrDoc;
  if (typeof queryOrDoc.populate === 'function') {
    return queryOrDoc.populate('rssSources.sourceId');
  }
  return queryOrDoc;
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
  // Combine stored locations, structured locationTags, and runtime inference from title/description
  const storedLocations = Array.isArray(article.locations) ? article.locations : [];
  const tagTokens = [];
  if (article.locationTags) {
    const tags = article.locationTags;
    if (Array.isArray(tags.cities)) tagTokens.push(...tags.cities);
    if (Array.isArray(tags.counties)) tagTokens.push(...tags.counties);
    if (Array.isArray(tags.states)) tagTokens.push(...tags.states);
    if (Array.isArray(tags.countries)) tagTokens.push(...tags.countries);
    if (Array.isArray(tags.zipCodes)) tagTokens.push(...tags.zipCodes);
  }
  const textContent = `${article.title || ''} ${article.description || ''}`;
  const inferredTokens = inferLocationTokensFromText(textContent);
  const allLocationTokens = toUniqueNonEmptyLocationTokens([...storedLocations, ...tagTokens, ...inferredTokens]);

  const matchesAnyLocationValue = (values = []) => values
    .map(normalizeLocationToken)
    .filter(Boolean)
    .some((value) => allLocationTokens.some((token) => articleMentionsLocationToken(token, value)));

  const articleZipValues = extractZipTokens([...storedLocations, ...tagTokens, ...inferredTokens, article.assignedZipCode]);
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
      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({ source, item });
      const rawCategories = item.categories || [];
      const primaryCategory = normalizeToStandardCategory(
        source.category || rawCategories[0] || ''
      );
      
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: source.name,
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: primaryCategory,
        topics: toUniqueNonEmptyStrings([primaryCategory, ...rawCategories.map(c => normalizeTopicToken(c))]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'rss',
        localityLevel,
        language: item.isoLanguage || feed.language || 'en',
        providerId,
        feedSource: providerId,
        feedCategory: rawCategories[0] || source.category || null,
        feedLanguage: feed.language || feed.feedLanguage || null,
        feedMetadata: {
          author: item.dcCreator || item.creator || null,
          categories: rawCategories,
          feedTitle: feed.title || null,
          subject: item.dcSubject || null
        },
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
 * Handles Google News RSS feeds based on queries.
 * Uses locale-aware feed URLs and captures Google News categories,
 * source attribution, and maps to standardized categories.
 */
async function fetchGoogleNewsSource(query, sourceType = 'googleNews') {
  try {
    const feedUrl = buildGoogleNewsFeedUrl(query);
    const topicConfig = GOOGLE_NEWS_TOPIC_MAP[query.toLowerCase()] || null;
    const standardCategory = topicConfig
      ? topicConfig.category
      : normalizeToStandardCategory(query);
    
    const feed = await parser.parseURL(feedUrl);
    
    const items = Array.isArray(feed.items) ? feed.items : [];
    return await Promise.all(items.map(async (item) => {
      // Extract source name from title format: "Title - Source Name"
      let sourceName = 'Google News';
      const dashIndex = item.title?.lastIndexOf(' - ');
      if (dashIndex > 0) {
        sourceName = item.title.substring(dashIndex + 3);
      }

      // Capture categories from the RSS item (Google News provides these)
      const rawCategories = Array.isArray(item.categories) ? item.categories : [];
      // Google News items may include a <source> element with the original publisher
      const rssSourceUrl = typeof item.rssSource === 'string'
        ? item.rssSource
        : (item.rssSource?.url || item.rssSource?._ || null);

      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: sourceName, category: query },
        item,
        query
      });
      
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: sourceName,
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: standardCategory,
        topics: toUniqueNonEmptyStrings([
          standardCategory,
          query.toLowerCase(),
          ...rawCategories.map((category) => normalizeTopicToken(category))
        ]),
        locations: locationTokens,
        assignedZipCode,
        sourceType,
        localityLevel,
        language: feed.language || feed.feedLanguage || 'en',
        feedSource: 'google-news',
        feedCategory: topicConfig ? topicConfig.label : query,
        feedLanguage: feed.language || feed.feedLanguage || 'en',
        feedMetadata: {
          googleNewsQuery: query,
          googleNewsCategories: rawCategories,
          originalSource: sourceName,
          originalSourceUrl: rssSourceUrl,
          feedTitle: feed.title || null
        },
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
 * NPR RSS Adapter
 * Fetches articles from NPR's free RSS feeds with category and location metadata.
 * NPR items include dc:creator, categories, and frequently mention city/state in titles.
 */
async function fetchNprSource(section, feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = Array.isArray(feed.items) ? feed.items : [];

    return await Promise.all(items.map(async (item) => {
      const rawCategories = Array.isArray(item.categories) ? item.categories : [];
      const standardCategory = feedConfig.category || normalizeToStandardCategory(rawCategories[0] || section);

      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: 'NPR', category: section },
        item
      });

      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: 'NPR',
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: standardCategory,
        topics: toUniqueNonEmptyStrings([
          standardCategory,
          section,
          ...rawCategories.map(c => normalizeTopicToken(c))
        ]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'npr',
        localityLevel,
        language: feed.language || feed.feedLanguage || 'en',
        feedSource: 'npr',
        feedCategory: feedConfig.label || section,
        feedLanguage: feed.language || feed.feedLanguage || 'en',
        feedMetadata: {
          nprSection: section,
          author: item.dcCreator || item.creator || null,
          categories: rawCategories,
          feedTitle: feed.title || null,
          subject: item.dcSubject || null
        },
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
    console.error(`Error fetching NPR source "${section}":`, error.message);
    return [];
  }
}

/**
 * BBC RSS Adapter
 * Fetches articles from BBC News' free RSS feeds with category and location metadata.
 * BBC items often include geo-tagged content and regional section identifiers.
 */
async function fetchBbcSource(section, feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = Array.isArray(feed.items) ? feed.items : [];

    return await Promise.all(items.map(async (item) => {
      const rawCategories = Array.isArray(item.categories) ? item.categories : [];
      const standardCategory = feedConfig.category || normalizeToStandardCategory(rawCategories[0] || section);

      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: 'BBC News', category: section },
        item
      });

      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: 'BBC News',
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: standardCategory,
        topics: toUniqueNonEmptyStrings([
          standardCategory,
          section,
          ...rawCategories.map(c => normalizeTopicToken(c))
        ]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'bbc',
        localityLevel,
        language: feed.language || feed.feedLanguage || 'en',
        feedSource: 'bbc',
        feedCategory: feedConfig.label || section,
        feedLanguage: feed.language || feed.feedLanguage || 'en',
        feedMetadata: {
          bbcSection: section,
          author: item.dcCreator || item.creator || null,
          categories: rawCategories,
          feedTitle: feed.title || null,
          subject: item.dcSubject || null
        },
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
    console.error(`Error fetching BBC source "${section}":`, error.message);
    return [];
  }
}

async function fetchApSource(section, feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = Array.isArray(feed.items) ? feed.items : [];

    return await Promise.all(items.map(async (item) => {
      const rawCategories = Array.isArray(item.categories) ? item.categories : [];
      const standardCategory = feedConfig.category || normalizeToStandardCategory(rawCategories[0] || section);
      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: 'Associated Press', category: section },
        item
      });
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: 'Associated Press',
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: standardCategory,
        topics: toUniqueNonEmptyStrings([
          standardCategory,
          section,
          ...rawCategories.map(c => normalizeTopicToken(c))
        ]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'rss',
        localityLevel,
        language: feed.language || feed.feedLanguage || 'en',
        feedSource: 'associated-press',
        feedCategory: feedConfig.label || section,
        feedLanguage: feed.language || feed.feedLanguage || 'en',
        feedMetadata: {
          apSection: section,
          author: item.dcCreator || item.creator || null,
          categories: rawCategories,
          feedTitle: feed.title || null,
          subject: item.dcSubject || null
        },
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
    console.error(`Error fetching AP source "${section}":`, error.message);
    return [];
  }
}

async function fetchReutersSource(section, feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = Array.isArray(feed.items) ? feed.items : [];

    return await Promise.all(items.map(async (item) => {
      const rawCategories = Array.isArray(item.categories) ? item.categories : [];
      const standardCategory = feedConfig.category || normalizeToStandardCategory(rawCategories[0] || section);
      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: 'Reuters', category: section },
        item
      });
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: 'Reuters',
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: standardCategory,
        topics: toUniqueNonEmptyStrings([
          standardCategory,
          section,
          ...rawCategories.map(c => normalizeTopicToken(c))
        ]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'rss',
        localityLevel,
        language: feed.language || feed.feedLanguage || 'en',
        feedSource: 'reuters',
        feedCategory: feedConfig.label || section,
        feedLanguage: feed.language || feed.feedLanguage || 'en',
        feedMetadata: {
          reutersSection: section,
          author: item.dcCreator || item.creator || null,
          categories: rawCategories,
          feedTitle: feed.title || null,
          subject: item.dcSubject || null
        },
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
    console.error(`Error fetching Reuters source "${section}":`, error.message);
    return [];
  }
}

async function fetchPbsSource(section, feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = Array.isArray(feed.items) ? feed.items : [];

    return await Promise.all(items.map(async (item) => {
      const rawCategories = Array.isArray(item.categories) ? item.categories : [];
      const standardCategory = feedConfig.category || normalizeToStandardCategory(rawCategories[0] || section);
      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: 'PBS NewsHour', category: section },
        item
      });
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: 'PBS NewsHour',
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: standardCategory,
        topics: toUniqueNonEmptyStrings([
          standardCategory,
          section,
          ...rawCategories.map(c => normalizeTopicToken(c))
        ]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'rss',
        localityLevel,
        language: feed.language || feed.feedLanguage || 'en',
        feedSource: 'pbs',
        feedCategory: feedConfig.label || section,
        feedLanguage: feed.language || feed.feedLanguage || 'en',
        feedMetadata: {
          pbsSection: section,
          author: item.dcCreator || item.creator || null,
          categories: rawCategories,
          feedTitle: feed.title || null,
          subject: item.dcSubject || null
        },
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
    console.error(`Error fetching PBS source "${section}":`, error.message);
    return [];
  }
}

async function fetchCnnSource(section, feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = Array.isArray(feed.items) ? feed.items : [];

    return await Promise.all(items.map(async (item) => {
      const rawCategories = Array.isArray(item.categories) ? item.categories : [];
      const standardCategory = feedConfig.category || normalizeToStandardCategory(rawCategories[0] || section);
      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: 'CNN', category: section },
        item
      });
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: 'CNN',
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: standardCategory,
        topics: toUniqueNonEmptyStrings([
          standardCategory,
          section,
          ...rawCategories.map(c => normalizeTopicToken(c))
        ]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'rss',
        localityLevel,
        language: feed.language || feed.feedLanguage || 'en',
        feedSource: 'cnn',
        feedCategory: feedConfig.label || section,
        feedLanguage: feed.language || feed.feedLanguage || 'en',
        feedMetadata: {
          cnnSection: section,
          author: item.dcCreator || item.creator || null,
          categories: rawCategories,
          feedTitle: feed.title || null,
          subject: item.dcSubject || null
        },
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
    console.error(`Error fetching CNN source "${section}":`, error.message);
    return [];
  }
}

async function fetchGuardianSource(section, feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = Array.isArray(feed.items) ? feed.items : [];

    return await Promise.all(items.map(async (item) => {
      const rawCategories = Array.isArray(item.categories) ? item.categories : [];
      const standardCategory = feedConfig.category || normalizeToStandardCategory(rawCategories[0] || section);
      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: 'The Guardian', category: section },
        item
      });
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: 'The Guardian',
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: standardCategory,
        topics: toUniqueNonEmptyStrings([
          standardCategory,
          section,
          ...rawCategories.map(c => normalizeTopicToken(c))
        ]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'rss',
        localityLevel,
        language: feed.language || feed.feedLanguage || 'en',
        feedSource: 'guardian',
        feedCategory: feedConfig.label || section,
        feedLanguage: feed.language || feed.feedLanguage || 'en',
        feedMetadata: {
          guardianSection: section,
          author: item.dcCreator || item.creator || null,
          categories: rawCategories,
          feedTitle: feed.title || null,
          subject: item.dcSubject || null
        },
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
    console.error(`Error fetching Guardian source "${section}":`, error.message);
    return [];
  }
}

async function fetchNytSource(section, feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = Array.isArray(feed.items) ? feed.items : [];

    return await Promise.all(items.map(async (item) => {
      const rawCategories = Array.isArray(item.categories) ? item.categories : [];
      const standardCategory = feedConfig.category || normalizeToStandardCategory(rawCategories[0] || section);
      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: 'New York Times', category: section },
        item
      });
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: 'New York Times',
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: standardCategory,
        topics: toUniqueNonEmptyStrings([
          standardCategory,
          section,
          ...rawCategories.map(c => normalizeTopicToken(c))
        ]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'rss',
        localityLevel,
        language: feed.language || feed.feedLanguage || 'en',
        feedSource: 'nyt',
        feedCategory: feedConfig.label || section,
        feedLanguage: feed.language || feed.feedLanguage || 'en',
        feedMetadata: {
          nytSection: section,
          author: item.dcCreator || item.creator || null,
          categories: rawCategories,
          feedTitle: feed.title || null,
          subject: item.dcSubject || null
        },
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
    console.error(`Error fetching NYT source "${section}":`, error.message);
    return [];
  }
}

async function fetchWsjSource(section, feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = Array.isArray(feed.items) ? feed.items : [];

    return await Promise.all(items.map(async (item) => {
      const rawCategories = Array.isArray(item.categories) ? item.categories : [];
      const standardCategory = feedConfig.category || normalizeToStandardCategory(rawCategories[0] || section);
      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: 'Wall Street Journal', category: section },
        item
      });
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: 'Wall Street Journal',
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: standardCategory,
        topics: toUniqueNonEmptyStrings([
          standardCategory,
          section,
          ...rawCategories.map(c => normalizeTopicToken(c))
        ]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'rss',
        localityLevel,
        language: feed.language || feed.feedLanguage || 'en',
        feedSource: 'wsj',
        feedCategory: feedConfig.label || section,
        feedLanguage: feed.language || feed.feedLanguage || 'en',
        feedMetadata: {
          wsjSection: section,
          author: item.dcCreator || item.creator || null,
          categories: rawCategories,
          feedTitle: feed.title || null,
          subject: item.dcSubject || null
        },
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
    console.error(`Error fetching WSJ source "${section}":`, error.message);
    return [];
  }
}

async function fetchTechcrunchSource(section, feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = Array.isArray(feed.items) ? feed.items : [];

    return await Promise.all(items.map(async (item) => {
      const rawCategories = Array.isArray(item.categories) ? item.categories : [];
      const standardCategory = feedConfig.category || normalizeToStandardCategory(rawCategories[0] || section);
      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: 'TechCrunch', category: section },
        item
      });
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: 'TechCrunch',
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: standardCategory,
        topics: toUniqueNonEmptyStrings([
          standardCategory,
          section,
          ...rawCategories.map(c => normalizeTopicToken(c))
        ]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'rss',
        localityLevel,
        language: feed.language || feed.feedLanguage || 'en',
        feedSource: 'techcrunch',
        feedCategory: feedConfig.label || section,
        feedLanguage: feed.language || feed.feedLanguage || 'en',
        feedMetadata: {
          techcrunchSection: section,
          author: item.dcCreator || item.creator || null,
          categories: rawCategories,
          feedTitle: feed.title || null,
          subject: item.dcSubject || null
        },
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
    console.error(`Error fetching TechCrunch source "${section}":`, error.message);
    return [];
  }
}

async function fetchYahooSource(section, feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = Array.isArray(feed.items) ? feed.items : [];

    return await Promise.all(items.map(async (item) => {
      const rawCategories = Array.isArray(item.categories) ? item.categories : [];
      const standardCategory = feedConfig.category || normalizeToStandardCategory(rawCategories[0] || section);
      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: 'Yahoo News', category: section },
        item
      });
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: 'Yahoo News',
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: standardCategory,
        topics: toUniqueNonEmptyStrings([
          standardCategory,
          section,
          ...rawCategories.map(c => normalizeTopicToken(c))
        ]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'rss',
        localityLevel,
        language: feed.language || feed.feedLanguage || 'en',
        feedSource: 'yahoo-news',
        feedCategory: feedConfig.label || section,
        feedLanguage: feed.language || feed.feedLanguage || 'en',
        feedMetadata: {
          yahooSection: section,
          author: item.dcCreator || item.creator || null,
          categories: rawCategories,
          feedTitle: feed.title || null,
          subject: item.dcSubject || null
        },
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
    console.error(`Error fetching Yahoo source "${section}":`, error.message);
    return [];
  }
}

async function fetchEspnSource(section, feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = Array.isArray(feed.items) ? feed.items : [];

    return await Promise.all(items.map(async (item) => {
      const rawCategories = Array.isArray(item.categories) ? item.categories : [];
      const standardCategory = feedConfig.category || normalizeToStandardCategory(rawCategories[0] || section);
      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: 'ESPN', category: section },
        item
      });
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: 'ESPN',
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: standardCategory,
        topics: toUniqueNonEmptyStrings([
          standardCategory,
          section,
          ...rawCategories.map(c => normalizeTopicToken(c))
        ]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'rss',
        localityLevel,
        language: feed.language || feed.feedLanguage || 'en',
        feedSource: 'espn',
        feedCategory: feedConfig.label || section,
        feedLanguage: feed.language || feed.feedLanguage || 'en',
        feedMetadata: {
          espnSection: section,
          author: item.dcCreator || item.creator || null,
          categories: rawCategories,
          feedTitle: feed.title || null,
          subject: item.dcSubject || null
        },
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
    console.error(`Error fetching ESPN source "${section}":`, error.message);
    return [];
  }
}

/**
 * GDELT 2.0 DOC API Adapter
 * Fetches geolocated articles from GDELT's free document API.
 * Returns articles with location tags derived from GDELT's geolocation metadata.
 */
const parseGdeltDate = (seendate) => {
  if (!seendate) return new Date();
  const iso = seendate.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z');
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

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
      const {
        locationTokens,
        localityLevel,
        assignedZipCode,
        locationTags,
        scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: sourceDomain, category: query },
        item: {
          title: item.title || '',
          categories: item.domain ? [item.domain] : [],
          contentSnippet: item.seendate || ''
        },
        query
      });

      return {
        title: item.title || 'Untitled',
        description: item.title || '',
        source: sourceDomain,
        sourceId: item.url || item.title,
        url: item.url,
        imageUrl: item.socialimage || null,
        publishedAt: parseGdeltDate(item.seendate),
        category: normalizeToStandardCategory(query),
        topics: toUniqueNonEmptyStrings([query.toLowerCase(), ...(item.domain ? [item.domain] : [])]),
        locations: locationTokens,
        assignedZipCode,
        sourceType: 'gdlet',
        localityLevel,
        language: item.language || 'en',
        feedSource: 'gdelt',
        feedCategory: query,
        feedLanguage: item.language || 'en',
        feedMetadata: {
          gdeltDomain: item.domain || null,
          gdeltSeenDate: item.seendate || null,
          gdeltLanguage: item.language || null
        },
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

// ============================================
// LOCAL SOURCE ADAPTERS
// ============================================

/**
 * Patch.com RSS Adapter
 * Fetches hyperlocal articles from Patch.com for a city/state.
 */
async function fetchPatchSource(location) {
  const city = (location.city || '').trim();
  const stateAbbrev = (location.stateAbbrev || location.state || '').trim().toLowerCase();
  if (!city || !stateAbbrev) return [];
  const feedUrl = buildPatchUrl(city, stateAbbrev);
  try {
    const feed = await parser.parseURL(feedUrl);
    const items = Array.isArray(feed.items) ? feed.items : [];
    return await Promise.all(items.map(async (item) => {
      const {
        locationTokens, localityLevel, assignedZipCode, locationTags, scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: `Patch: ${city}`, category: 'general' },
        item
      });
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: `Patch: ${city}, ${stateAbbrev.toUpperCase()}`,
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: normalizeToStandardCategory(item.categories?.[0] || 'general'),
        topics: toUniqueNonEmptyStrings(['local', city.toLowerCase(), stateAbbrev]),
        locations: locationTokens.length ? locationTokens : [city.toLowerCase(), stateAbbrev],
        assignedZipCode,
        sourceType: 'patch',
        sourceTier: 3,
        sourceProviderId: 'patch',
        localityLevel: localityLevel || 'city',
        language: feed.language || 'en',
        feedSource: 'patch',
        feedCategory: 'local',
        feedLanguage: feed.language || 'en',
        feedMetadata: {
          patchCity: city,
          patchState: stateAbbrev,
          feedTitle: feed.title || null,
          categories: item.categories || []
        },
        scrapeTimestamp: new Date(),
        ...(NEWS_LOCATION_TAGGER_V2_ENABLED ? {
          locationTags: locationTags.cities?.length ? locationTags : {
            ...locationTags,
            cities: [...(locationTags.cities || []), city.toLowerCase()],
            states: [...(locationTags.states || []), stateAbbrev]
          },
          scopeReason: scopeMetadata.scopeReason || 'city_match',
          scopeConfidence: scopeMetadata.scopeConfidence || 0.8
        } : {})
      };
    }));
  } catch (error) {
    console.error(`Error fetching Patch source for "${city}, ${stateAbbrev}":`, error.message);
    return [];
  }
}

/**
 * Reddit Local Subreddit RSS Adapter
 * Fetches local news/discussion from a city subreddit's RSS feed.
 */
async function fetchRedditLocalSource(subreddit, location = {}) {
  if (!subreddit) return [];
  const feedUrl = buildRedditRssUrl(subreddit);
  try {
    const feed = await parser.parseURL(feedUrl);
    const items = Array.isArray(feed.items) ? feed.items : [];
    const city = (location.city || '').toLowerCase();
    const stateAbbrev = (location.stateAbbrev || '').toLowerCase();
    return items.map((item) => ({
      title: item.title || 'Untitled',
      description: getItemDescription(item),
      source: `Reddit: r/${subreddit}`,
      sourceId: item.guid || item.link || item.id,
      url: item.link,
      imageUrl: getItemImageUrl(item),
      publishedAt: getItemPublishedAt(item),
      category: 'general',
      topics: toUniqueNonEmptyStrings(['local', 'reddit', city, stateAbbrev].filter(Boolean)),
      locations: [city, stateAbbrev].filter(Boolean),
      assignedZipCode: null,
      sourceType: 'redditLocal',
      sourceTier: 6,
      sourceProviderId: 'reddit-local',
      localityLevel: 'city',
      language: 'en',
      feedSource: 'reddit',
      feedCategory: 'local',
      feedLanguage: 'en',
      feedMetadata: {
        subreddit,
        redditCity: city || null,
        redditState: stateAbbrev || null,
        feedTitle: feed.title || null
      },
      scrapeTimestamp: new Date(),
      ...(NEWS_LOCATION_TAGGER_V2_ENABLED ? {
        locationTags: {
          zipCodes: [],
          cities: city ? [city] : [],
          counties: [],
          states: stateAbbrev ? [stateAbbrev] : [],
          countries: ['us']
        },
        scopeReason: 'city_match',
        scopeConfidence: 0.6
      } : {})
    }));
  } catch (error) {
    console.error(`Error fetching Reddit source r/${subreddit}:`, error.message);
    return [];
  }
}

/**
 * Generic Local Catalog RSS Source Adapter
 * Fetches articles from a local source definition (TV affiliates, newspapers, etc).
 *
 * @param {Object} sourceDef – { url, label, tier, providerId, locationKey, ...meta }
 * @param {Object} [locationHint] – { city, stateAbbrev } for location tagging fallback
 */
async function fetchLocalCatalogRssSource(sourceDef, locationHint = {}) {
  if (!sourceDef?.url) return [];
  try {
    const feed = await parser.parseURL(sourceDef.url);
    const items = Array.isArray(feed.items) ? feed.items : [];
    const city = (locationHint.city || '').toLowerCase();
    const stateAbbrev = (locationHint.stateAbbrev || '').toLowerCase();
    const tier = sourceDef.tier || 2;
    const providerId = sourceDef.providerId || 'local-catalog';
    const sourceTypeMap = {
      2: 'tvAffiliate',
      4: 'localNewspaper'
    };
    const resolvedSourceType = sourceTypeMap[tier] || 'rss';

    return await Promise.all(items.map(async (item) => {
      const {
        locationTokens, localityLevel, assignedZipCode, locationTags, scopeMetadata
      } = await resolveArticleLocationContext({
        source: { name: sourceDef.label || 'Local Source', category: 'general' },
        item
      });
      return {
        title: item.title || 'Untitled',
        description: getItemDescription(item),
        source: sourceDef.label || feed.title || 'Local Source',
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: getItemImageUrl(item),
        publishedAt: getItemPublishedAt(item),
        category: normalizeToStandardCategory(item.categories?.[0] || 'general'),
        topics: toUniqueNonEmptyStrings(['local', city, stateAbbrev].filter(Boolean)),
        locations: locationTokens.length ? locationTokens : [city, stateAbbrev].filter(Boolean),
        assignedZipCode,
        sourceType: resolvedSourceType,
        sourceTier: tier,
        sourceProviderId: providerId,
        localityLevel: localityLevel || 'city',
        language: feed.language || 'en',
        feedSource: providerId,
        feedCategory: 'local',
        feedLanguage: feed.language || 'en',
        feedMetadata: {
          localSourceLabel: sourceDef.label,
          localSourceTier: tier,
          localSourceProviderId: providerId,
          localSourceLocationKey: sourceDef.locationKey || null,
          categories: item.categories || [],
          feedTitle: feed.title || null,
          author: item.dcCreator || item.creator || null,
          ...(sourceDef.station ? { station: sourceDef.station } : {}),
          ...(sourceDef.network ? { network: sourceDef.network } : {})
        },
        scrapeTimestamp: new Date(),
        ...(NEWS_LOCATION_TAGGER_V2_ENABLED ? {
          locationTags: locationTags.cities?.length ? locationTags : {
            ...locationTags,
            cities: [...(locationTags.cities || []), ...(city ? [city] : [])],
            states: [...(locationTags.states || []), ...(stateAbbrev ? [stateAbbrev] : [])]
          },
          scopeReason: scopeMetadata.scopeReason || 'city_match',
          scopeConfidence: scopeMetadata.scopeConfidence || 0.7
        } : {})
      };
    }));
  } catch (error) {
    console.error(`Error fetching local catalog source "${sourceDef.label}":`, error.message);
    return [];
  }
}

/**
 * Tier-5 NewsAPI Local Adapter
 * Fetches local news from NewsAPI.org's /v2/everything endpoint.
 * Requires NEWS_API_KEY env variable and NEWS_LOCAL_NEWSAPI_ENABLED=true.
 *
 * @param {string} query – search query (e.g. "Austin TX local news")
 * @param {Object} [locationHint] – { city, stateAbbrev } for location tagging
 * @returns {Promise<Array>}
 */
async function fetchNewsApiSource(query, locationHint = {}) {
  if (!NEWS_API_KEY || !query) return [];
  const city = (locationHint.city || '').toLowerCase();
  const stateAbbrev = (locationHint.stateAbbrev || '').toLowerCase();
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${NEWS_API_KEY}`;
  try {
    const data = await fetchJsonWithTimeout(url, 8000);
    if (data?.status !== 'ok' || !Array.isArray(data.articles)) return [];
    return data.articles.map((item) => ({
      title: item.title || 'Untitled',
      description: item.description || '',
      source: item.source?.name || 'NewsAPI',
      sourceId: item.url,
      url: item.url,
      imageUrl: item.urlToImage || null,
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
      category: 'general',
      topics: toUniqueNonEmptyStrings(['local', city, stateAbbrev].filter(Boolean)),
      locations: [city, stateAbbrev].filter(Boolean),
      assignedZipCode: null,
      sourceType: 'newsApi',
      sourceTier: 5,
      sourceProviderId: 'newsapi',
      localityLevel: 'city',
      language: 'en',
      feedSource: 'newsapi',
      feedCategory: 'local',
      feedLanguage: 'en',
      feedMetadata: {
        newsApiSource: item.source?.name || null,
        newsApiAuthor: item.author || null,
        newsApiCity: city || null,
        newsApiState: stateAbbrev || null,
        query
      },
      scrapeTimestamp: new Date(),
      ...(NEWS_LOCATION_TAGGER_V2_ENABLED ? {
        locationTags: {
          zipCodes: [],
          cities: city ? [city] : [],
          counties: [],
          states: stateAbbrev ? [stateAbbrev] : [],
          countries: ['us']
        },
        scopeReason: 'city_match',
        scopeConfidence: 0.5
      } : {})
    }));
  } catch (error) {
    console.error(`Error fetching NewsAPI source for "${query}":`, error.message);
    return [];
  }
}

/**
 * Ingest local sources for a set of locations using the planner.
 * Returns articles and telemetry metrics.
 *
 * @param {Array<Object>} locations – array of { city, state, stateAbbrev, zipCode }
 * @returns {{ articles: Array, metrics: Object }}
 */
async function ingestLocalSources(locations = []) {
  const enabledTiers = {
    googleNews: NEWS_LOCAL_GOOGLE_ENABLED,
    tvAffiliate: NEWS_LOCAL_TV_ENABLED,
    patch: NEWS_LOCAL_PATCH_ENABLED,
    newspaper: NEWS_LOCAL_NEWSPAPER_ENABLED,
    reddit: NEWS_LOCAL_REDDIT_ENABLED,
    newsApi: NEWS_LOCAL_NEWSAPI_ENABLED && !!NEWS_API_KEY
  };

  const { allSources, stats } = buildBatchLocalSourcePlans(locations, { enabledTiers });

  const articles = [];
  const metrics = {
    totalSources: allSources.length,
    fetched: 0,
    errors: 0,
    articlesByTier: {},
    errorsByTier: {},
    ...stats
  };

  /**
   * Parse a locationKey string (format: "zip|city,state" or "city,state") into
   * its city and stateAbbrev components.
   */
  const parseLocationKey = (locationKey) => {
    if (!locationKey) return { city: '', stateAbbrev: '' };
    // Strip leading zip portion ("zip|city,state" → "city,state")
    const withoutZip = locationKey.includes('|') ? locationKey.split('|')[1] : locationKey;
    const parts = (withoutZip || '').split(',');
    return {
      city: (parts[0] || '').trim(),
      stateAbbrev: (parts[1] || '').trim()
    };
  };

  for (const src of allSources) {
    const tierKey = `tier_${src.tier}`;
    const locFromKey = parseLocationKey(src.locationKey);
    try {
      let fetched = [];
      if (src.providerId === 'google-news-local') {
        // Use existing Google News adapter with local query
        const queryMatch = src.url.match(/[?&]q=([^&]+)/);
        const query = queryMatch ? decodeURIComponent(queryMatch[1]) : '';
        if (query) {
          fetched = await fetchGoogleNewsSource(query, 'googleNews');
          // Tag articles with local tier metadata
          fetched = fetched.map(a => ({
            ...a,
            sourceTier: src.tier,
            sourceProviderId: src.providerId
          }));
        }
      } else if (src.providerId === 'patch') {
        fetched = await fetchPatchSource({
          city: src.patchCity || locFromKey.city,
          stateAbbrev: src.patchState || locFromKey.stateAbbrev
        });
      } else if (src.providerId === 'reddit-local') {
        fetched = await fetchRedditLocalSource(src.subreddit || '', {
          city: locFromKey.city,
          stateAbbrev: locFromKey.stateAbbrev
        });
      } else if (src.providerId === 'tv-affiliate' || src.providerId === 'local-newspaper') {
        fetched = await fetchLocalCatalogRssSource(src, {
          city: src.market || src.newspaperCity || locFromKey.city,
          stateAbbrev: locFromKey.stateAbbrev
        });
      } else if (src.providerId === 'newsapi') {
        const queryMatch = src.url?.match(/[?&]q=([^&]+)/);
        const query = queryMatch
          ? decodeURIComponent(queryMatch[1])
          : [locFromKey.city, locFromKey.stateAbbrev, 'local news'].filter(Boolean).join(' ');
        fetched = await fetchNewsApiSource(query, {
          city: locFromKey.city,
          stateAbbrev: locFromKey.stateAbbrev
        });
      }

      articles.push(...fetched);
      metrics.fetched++;
      metrics.articlesByTier[tierKey] = (metrics.articlesByTier[tierKey] || 0) + fetched.length;
    } catch (error) {
      metrics.errors++;
      metrics.errorsByTier[tierKey] = (metrics.errorsByTier[tierKey] || 0) + 1;
      console.error(`[local-ingest] Error fetching ${src.providerId} (${src.label}):`, error.message);
    }
  }

  return { articles, metrics };
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
const EMPTY_LOCATION_TAGS = Object.freeze({
  zipCodes: [],
  cities: [],
  counties: [],
  states: [],
  countries: []
});

const ensureCityAssociationSpecificity = (article = {}) => {
  const normalizedTags = normalizeLocationTagSet(article.locationTags || {}, article.assignedZipCode);
  const normalizedLocality = normalizeLocationToken(article.localityLevel || 'global');
  if (normalizedLocality !== 'city' || normalizedTags.cities.length > 0) {
    return {
      ...article,
      localityLevel: normalizedLocality || 'global',
      locationTags: normalizedTags
    };
  }

  let fallbackLocality = 'global';
  if (normalizedTags.counties.length > 0) {
    fallbackLocality = 'county';
  } else if (normalizedTags.states.length > 0) {
    fallbackLocality = 'state';
  } else if (normalizedTags.countries.length > 0) {
    fallbackLocality = 'country';
  }
  return {
    ...article,
    localityLevel: fallbackLocality,
    locationTags: normalizedTags
  };
};

const buildIngestionNormalizedPayload = (article = {}, options = {}) => {
  const safeArticle = options.alreadyNormalized ? article : ensureCityAssociationSpecificity(article);
  return {
    title: safeArticle.title || '',
    description: safeArticle.description || '',
    url: safeArticle.url || '',
    imageUrl: safeArticle.imageUrl || null,
    publishedAt: safeArticle.publishedAt || null,
    category: safeArticle.category || null,
    topics: safeArticle.topics || [],
    locations: safeArticle.locations || [],
    assignedZipCode: safeArticle.assignedZipCode || null,
    localityLevel: safeArticle.localityLevel || 'global',
    language: safeArticle.language || 'en',
    normalizedUrlHash: safeArticle.normalizedUrlHash || null,
    locationTags: safeArticle.locationTags || EMPTY_LOCATION_TAGS
  };
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

const cleanupStaleNewsData = async () => {
  if (mongoose.connection?.readyState !== 1) {
    return null;
  }
  const cutoff = new Date(Date.now() - NEWS_RETENTION_MS);
  const [articleCleanup, recordCleanup] = await Promise.all([
    Article.deleteMany({
      $or: [
        { publishedAt: { $lt: cutoff } },
        { ingestTimestamp: { $lt: cutoff } }
      ]
    }),
    NewsIngestionRecord.deleteMany({
      $or: [
        { scrapedAt: { $lt: cutoff } },
        { 'dedupe.outcome': 'duplicate' }
      ]
    })
  ]);
  return {
    cutoff,
    articlesDeleted: articleCleanup?.deletedCount || 0,
    ingestionRecordsDeleted: recordCleanup?.deletedCount || 0
  };
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
      const scopedArticle = ensureCityAssociationSpecificity(scoredArticle);
      const ingestionTimestamp = new Date();

      // Check for duplicate by URL hash
      const existing = await findExistingArticle(
        scopedArticle.url,
        scopedArticle.sourceId,
        scopedArticle.normalizedUrlHash
      );
      
      if (existing) {
        // Update if newer
        const incomingPublishedAt = scopedArticle.publishedAt ? new Date(scopedArticle.publishedAt) : null;
        const existingPublishedAt = existing.publishedAt ? new Date(existing.publishedAt) : null;
        if (incomingPublishedAt && (!existingPublishedAt || incomingPublishedAt > existingPublishedAt)) {
          const mergedLocations = [...new Set([...(existing.locations || []), ...(scopedArticle.locations || [])])];
          await Article.findByIdAndUpdate(existing._id, {
            $set: {
              title: scopedArticle.title,
              description: scopedArticle.description,
              imageUrl: scopedArticle.imageUrl,
              publishedAt: scopedArticle.publishedAt,
              category: scopedArticle.category || existing.category || 'general',
              topics: [...new Set([...(existing.topics || []), ...(scopedArticle.topics || [])])],
              locations: mergedLocations,
              assignedZipCode: scopedArticle.assignedZipCode || existing.assignedZipCode || null,
              feedSource: scopedArticle.feedSource || existing.feedSource || null,
              feedCategory: scopedArticle.feedCategory || existing.feedCategory || null,
              feedLanguage: scopedArticle.feedLanguage || existing.feedLanguage || null,
              feedMetadata: scopedArticle.feedMetadata || existing.feedMetadata || {},
              locationTags: NEWS_LOCATION_TAGGER_V2_ENABLED
                ? mergeLocationTags(existing.locationTags, scopedArticle.locationTags, scopedArticle.assignedZipCode)
                : existing.locationTags,
              scopeReason: NEWS_LOCATION_TAGGER_V2_ENABLED
                ? (scopedArticle.scopeReason || existing.scopeReason || 'source_default')
                : existing.scopeReason,
              scopeConfidence: NEWS_LOCATION_TAGGER_V2_ENABLED
                ? Math.max(
                  Number.isFinite(existing.scopeConfidence) ? existing.scopeConfidence : 0,
                  Number.isFinite(scopedArticle.scopeConfidence) ? scopedArticle.scopeConfidence : 0
                )
                : existing.scopeConfidence,
              viralScore: scopedArticle.viralScore,
              viralScoreVersion: scopedArticle.viralScoreVersion,
              viralSignals: scopedArticle.viralSignals,
              isPromoted: scopedArticle.isPromoted,
              lastScoredAt: scopedArticle.lastScoredAt,
              localityLevel: scopedArticle.localityLevel || existing.localityLevel || 'global'
            }
          });
          results.updated++;
          scoredArticles.push(scopedArticle);
          await persistNewsIngestionRecord({
            ingestionRunId,
            source: {
              name: scopedArticle.source || '',
              sourceType: scopedArticle.sourceType || '',
              sourceId: scopedArticle.sourceId || '',
              providerId: scopedArticle.providerId || '',
              url: scopedArticle.url || ''
            },
            scrapedAt: article.scrapeTimestamp || new Date(),
            normalized: buildIngestionNormalizedPayload(scopedArticle, { alreadyNormalized: true }),
            resolvedScope: mapLocalityLevelToScope(scopedArticle.localityLevel),
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
            ingestedAt: ingestionTimestamp,
            processingStatus: 'processed',
            tags: scopedArticle.topics || [],
            events: buildIngestionEvents({ outcome: 'updated', duplicateReason: 'incoming_newer_than_existing' })
          });
        } else {
          results.duplicates++;
          await persistNewsIngestionRecord({
            ingestionRunId,
            source: {
              name: scopedArticle.source || '',
              sourceType: scopedArticle.sourceType || '',
              sourceId: scopedArticle.sourceId || '',
              providerId: scopedArticle.providerId || '',
              url: scopedArticle.url || ''
            },
            scrapedAt: article.scrapeTimestamp || new Date(),
            normalized: buildIngestionNormalizedPayload(scopedArticle, { alreadyNormalized: true }),
            resolvedScope: mapLocalityLevelToScope(scopedArticle.localityLevel),
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
            ingestedAt: ingestionTimestamp,
            processingStatus: 'processed',
            tags: scopedArticle.topics || [],
            events: buildIngestionEvents({ outcome: 'duplicate', duplicateReason: 'incoming_not_newer' })
          });
        }
        continue;
      }
      
      // Create new article
      const newArticle = new Article(scopedArticle);
      await newArticle.save();
      results.inserted++;
      scoredArticles.push(scopedArticle);
      await persistNewsIngestionRecord({
        ingestionRunId,
        source: {
          name: scopedArticle.source || '',
          sourceType: scopedArticle.sourceType || '',
          sourceId: scopedArticle.sourceId || '',
          providerId: scopedArticle.providerId || '',
          url: scopedArticle.url || ''
        },
        scrapedAt: article.scrapeTimestamp || new Date(),
        normalized: buildIngestionNormalizedPayload(scopedArticle, { alreadyNormalized: true }),
        resolvedScope: mapLocalityLevelToScope(scopedArticle.localityLevel),
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
        ingestedAt: ingestionTimestamp,
        processingStatus: 'processed',
        tags: scopedArticle.topics || [],
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
        normalized: buildIngestionNormalizedPayload({
          ...(article || {}),
          normalizedUrlHash: article?.url
            ? buildNormalizedUrlHash(article.url)
            : null
        }),
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
        ingestedAt: new Date(),
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
  const cleanupResult = await cleanupStaleNewsData();
  if (cleanupResult) {
    console.log('[news-retention-cleanup]', JSON.stringify({
      cutoff: cleanupResult.cutoff,
      articlesDeleted: cleanupResult.articlesDeleted,
      ingestionRecordsDeleted: cleanupResult.ingestionRecordsDeleted
    }));
  }
  
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
  
  // Helper to upsert RssSource tracking for built-in adapters
  const trackBuiltInFetch = async (catalogId, articleCount) => {
    const catalogEntry = NEWS_SOURCE_CATALOG.find(e => e.id === catalogId);
    if (!catalogEntry) return;
    try {
      await RssSource.findOneAndUpdate(
        { url: catalogEntry.url },
        {
          $set: {
            name: catalogEntry.name,
            type: catalogEntry.sourceType || 'rss',
            lastFetchAt: new Date(),
            lastFetchStatus: 'success',
            isActive: true,
            priority: catalogEntry.priority || 5
          },
          $inc: { fetchCount: 1 }
        },
        { upsert: true }
      );
    } catch (err) {
      console.error(`[track-fetch] Failed to track ${catalogId}:`, err.message);
    }
  };

  // 2. Fetch default Google News topics - include ALL 10 categories
  const defaultTopics = Object.keys(GOOGLE_NEWS_TOPIC_MAP);
  let googleNewsArticleCount = 0;
  for (const topic of defaultTopics) {
    const articles = await fetchGoogleNewsSource(topic, 'googleNews');
    allArticles = [...allArticles, ...articles];
    googleNewsArticleCount += articles.length;
  }
  await trackBuiltInFetch('google-news', googleNewsArticleCount);
  
  // 3. Fetch NPR sources (gated by NPR_ENABLED)
  if (NPR_ENABLED) {
    let nprCount = 0;
    for (const [section, feedConfig] of Object.entries(NPR_FEED_MAP)) {
      const articles = await fetchNprSource(section, feedConfig);
      allArticles = [...allArticles, ...articles];
      nprCount += articles.length;
    }
    await trackBuiltInFetch('npr', nprCount);
  }

  // 4. Fetch BBC sources (gated by BBC_ENABLED)
  if (BBC_ENABLED) {
    let bbcCount = 0;
    for (const [section, feedConfig] of Object.entries(BBC_FEED_MAP)) {
      const articles = await fetchBbcSource(section, feedConfig);
      allArticles = [...allArticles, ...articles];
      bbcCount += articles.length;
    }
    await trackBuiltInFetch('bbc', bbcCount);
  }

  // 5. Fetch AP sources (gated by AP_ENABLED)
  if (AP_ENABLED) {
    let apCount = 0;
    for (const [section, feedConfig] of Object.entries(AP_FEED_MAP)) {
      const articles = await fetchApSource(section, feedConfig);
      allArticles = [...allArticles, ...articles];
      apCount += articles.length;
    }
    await trackBuiltInFetch('associated-press', apCount);
  }

  // 6. Fetch Reuters sources (gated by REUTERS_ENABLED)
  if (REUTERS_ENABLED) {
    let reutersCount = 0;
    for (const [section, feedConfig] of Object.entries(REUTERS_FEED_MAP)) {
      const articles = await fetchReutersSource(section, feedConfig);
      allArticles = [...allArticles, ...articles];
      reutersCount += articles.length;
    }
    await trackBuiltInFetch('reuters', reutersCount);
  }

  // 7. Fetch PBS sources (gated by PBS_ENABLED)
  if (PBS_ENABLED) {
    let pbsCount = 0;
    for (const [section, feedConfig] of Object.entries(PBS_FEED_MAP)) {
      const articles = await fetchPbsSource(section, feedConfig);
      allArticles = [...allArticles, ...articles];
      pbsCount += articles.length;
    }
    await trackBuiltInFetch('pbs', pbsCount);
  }

  // 8. Fetch CNN sources (gated by CNN_ENABLED)
  if (CNN_ENABLED) {
    let cnnCount = 0;
    for (const [section, feedConfig] of Object.entries(CNN_FEED_MAP)) {
      const articles = await fetchCnnSource(section, feedConfig);
      allArticles = [...allArticles, ...articles];
      cnnCount += articles.length;
    }
    await trackBuiltInFetch('cnn', cnnCount);
  }

  // 9. Fetch Guardian sources (gated by GUARDIAN_ENABLED)
  if (GUARDIAN_ENABLED) {
    let guardianCount = 0;
    for (const [section, feedConfig] of Object.entries(GUARDIAN_FEED_MAP)) {
      const articles = await fetchGuardianSource(section, feedConfig);
      allArticles = [...allArticles, ...articles];
      guardianCount += articles.length;
    }
    await trackBuiltInFetch('guardian', guardianCount);
  }

  // 10. Fetch NYT sources (gated by NYT_ENABLED)
  if (NYT_ENABLED) {
    let nytCount = 0;
    for (const [section, feedConfig] of Object.entries(NYT_FEED_MAP)) {
      const articles = await fetchNytSource(section, feedConfig);
      allArticles = [...allArticles, ...articles];
      nytCount += articles.length;
    }
    await trackBuiltInFetch('new-york-times', nytCount);
  }

  // 11. Fetch WSJ sources (gated by WSJ_ENABLED)
  if (WSJ_ENABLED) {
    let wsjCount = 0;
    for (const [section, feedConfig] of Object.entries(WSJ_FEED_MAP)) {
      const articles = await fetchWsjSource(section, feedConfig);
      allArticles = [...allArticles, ...articles];
      wsjCount += articles.length;
    }
    await trackBuiltInFetch('wall-street-journal', wsjCount);
  }

  // 12. Fetch TechCrunch sources (gated by TECHCRUNCH_ENABLED)
  if (TECHCRUNCH_ENABLED) {
    let tcCount = 0;
    for (const [section, feedConfig] of Object.entries(TECHCRUNCH_FEED_MAP)) {
      const articles = await fetchTechcrunchSource(section, feedConfig);
      allArticles = [...allArticles, ...articles];
      tcCount += articles.length;
    }
    await trackBuiltInFetch('techcrunch', tcCount);
  }

  // 13. Fetch Yahoo News sources (gated by YAHOO_ENABLED)
  if (YAHOO_ENABLED) {
    let yahooCount = 0;
    for (const [section, feedConfig] of Object.entries(YAHOO_FEED_MAP)) {
      const articles = await fetchYahooSource(section, feedConfig);
      allArticles = [...allArticles, ...articles];
      yahooCount += articles.length;
    }
    await trackBuiltInFetch('yahoo-news', yahooCount);
  }

  // 14. Fetch ESPN sources (gated by ESPN_ENABLED)
  if (ESPN_ENABLED) {
    let espnCount = 0;
    for (const [section, feedConfig] of Object.entries(ESPN_FEED_MAP)) {
      const articles = await fetchEspnSource(section, feedConfig);
      allArticles = [...allArticles, ...articles];
      espnCount += articles.length;
    }
    await trackBuiltInFetch('espn', espnCount);
  }

  // 15. Fetch GDELT sources (optional, gated by GDELT_ENABLED)
  if (GDELT_ENABLED) {
    const gdeltQueries = GDELT_DEFAULT_QUERIES;
    let gdeltCount = 0;
    for (const query of gdeltQueries) {
      const articles = await fetchGdeltSource(query);
      allArticles = [...allArticles, ...articles];
      gdeltCount += articles.length;
    }
    await trackBuiltInFetch('gdelt', gdeltCount);
  }

  // 16. Fetch local sources (gated by NEWS_LOCAL_SOURCES_ENABLED)
  let localMetrics = null;
  if (NEWS_LOCAL_SOURCES_ENABLED) {
    try {
      // Gather unique user locations from active news preferences
      const userPrefs = await NewsPreferences.find({
        'locations.0': { $exists: true }
      }).select('locations').limit(NEWS_LOCAL_MAX_LOCATIONS).lean();

      const locationSet = new Map();
      for (const pref of userPrefs) {
        for (const loc of (pref.locations || [])) {
          const city = (loc.city || '').trim();
          const state = (loc.state || '').trim();
          const zipCode = (loc.zipCode || '').trim();
          const key = `${city.toLowerCase()}|${(state || zipCode).toLowerCase()}`;
          if (key !== '|' && !locationSet.has(key)) {
            locationSet.set(key, {
              city,
              state,
              stateAbbrev: state, // normalizeLocationInput in planner resolves full names
              zipCode,
              country: loc.country || 'US'
            });
          }
        }
      }

      if (locationSet.size > 0) {
        const locations = Array.from(locationSet.values()).slice(0, NEWS_LOCAL_MAX_LOCATIONS);
        const { articles: localArticles, metrics } = await ingestLocalSources(locations);
        allArticles = [...allArticles, ...localArticles];
        localMetrics = metrics;
        console.log('[news-local-ingest]', JSON.stringify({
          locations: locations.length,
          sources: metrics.totalSources,
          fetched: metrics.fetched,
          errors: metrics.errors,
          articles: localArticles.length,
          byTier: metrics.articlesByTier
        }));
      }
    } catch (error) {
      console.error('[news-local-ingest] Pipeline error:', error.message);
    }
  }
  
  // 17. Process all articles (deduplication)
  const results = await processArticles(allArticles, { ingestionRunId });
  
  // 18. Log scope quality metrics
  const scopeQuality = computeScopeQualityMetrics(allArticles, startTime);
  if (localMetrics) {
    scopeQuality.localPipeline = localMetrics;
  }
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
    if (preferences?.googleNewsEnabled === false) {
      articles = articles.filter((article) => article.sourceType !== 'googleNews');
    }
    if (preferences?.gdletEnabled === false) {
      articles = articles.filter((article) => article.sourceType !== 'gdlet');
    }
    
    const topicAliases = getTopicAliases(topic);
    const hiddenCategorySet = new Set((preferences?.hiddenCategories || []).map((category) => normalizeTopicToken(category)));

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
            const articleCategory = normalizeTopicToken(article.category);
            const categoryMatch = topicAliases.some((alias) => articleCategory === alias);
            const topicsMatch = article._topicTokens.some((token) => topicAliases.includes(token));
            if (!categoryMatch && !topicsMatch) {
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
    articles = articles.map((article) => ({
      ...article,
      resolvedLocation: formatArticleLocationMetadata(article)
    }));

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
 * Get available RSS sources merged with catalog for control panel.
 * Returns all intended sources (including unwired) with health status.
 */
router.get('/sources', authenticateToken, async (req, res) => {
  try {
    // Load both active and inactive DB sources for full control panel context
    const dbSources = await RssSource.find({})
      .sort({ priority: -1, name: 1 });

    // Build merged source list from catalog + DB
    const mergedSources = buildMergedSources(NEWS_SOURCE_CATALOG, dbSources);

    // Build topUsedSources from active DB sources only (backward compat)
    const activeSources = dbSources.filter(s => s.isActive);
    const topUsedSources = [...activeSources]
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
      sources: mergedSources,
      topUsedSources,
      supportedRssProviders: SUPPORTED_RSS_PROVIDERS,
      catalogVersion: CATALOG_VERSION
    });
  } catch (error) {
    console.error('Error fetching sources:', error);
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

/**
 * POST /api/news/sources/health-check
 * Refresh health status for all wired sources by checking DB state.
 * Lightweight – does not re-fetch feeds, just recomputes health from DB records.
 */
router.post('/sources/health-check', authenticateToken, async (req, res) => {
  try {
    const dbSources = await RssSource.find({}).sort({ priority: -1, name: 1 });
    const mergedSources = buildMergedSources(NEWS_SOURCE_CATALOG, dbSources);
    res.json({
      sources: mergedSources,
      catalogVersion: CATALOG_VERSION,
      refreshedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error during health check:', error);
    res.status(500).json({ error: 'Health check failed' });
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
    let preferences = await maybePopulatePreferences(
      NewsPreferences.findOne({ user: req.user.userId })
    );
    
    // Create default preferences if none exist
    if (!preferences) {
      const seededLocations = userFallbackLocation
        ? [{
            ...canonicalizePreferenceLocation({
              city: userFallbackLocation.city,
              zipCode: userFallbackLocation.zipCode,
              state: userFallbackLocation.state,
              country: userFallbackLocation.country,
              isPrimary: true
            })
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
          ...canonicalizePreferenceLocation({
            city: userFallbackLocation.city,
            zipCode: userFallbackLocation.zipCode,
            state: userFallbackLocation.state,
            country: userFallbackLocation.country,
            isPrimary: true
          })
        }];
      }
      if (!NEWS_SCOPE_VALUES.includes(preferences.defaultScope)) {
        updatePayload.defaultScope = hasLocationContext(userFallbackLocation) ? 'local' : 'global';
      }
      if (Object.keys(updatePayload).length > 0) {
        preferences = await maybePopulatePreferences(NewsPreferences.findOneAndUpdate(
          { user: req.user.userId },
          { $set: updatePayload },
          { new: true }
        ));
      }
    } else if (!NEWS_SCOPE_VALUES.includes(preferences.defaultScope)) {
      preferences = await maybePopulatePreferences(NewsPreferences.findOneAndUpdate(
        { user: req.user.userId },
        { $set: { defaultScope: preferences.locations?.length ? 'local' : 'global' } },
        { new: true }
      ));
    }

    const normalizedLocations = Array.isArray(preferences.locations)
      ? preferences.locations.map((location, index) => canonicalizePreferenceLocation({
          ...(location?.toObject?.() || location),
          isPrimary: Boolean(location?.isPrimary || index === 0)
        }))
      : [];
    if (normalizedLocations.length > 0 && !normalizedLocations.some((location) => location.isPrimary)) {
      normalizedLocations[0].isPrimary = true;
    }

    if (JSON.stringify(normalizedLocations) !== JSON.stringify((preferences.locations || []).map((location) => (location?.toObject?.() || location)))) {
      preferences = await maybePopulatePreferences(NewsPreferences.findOneAndUpdate(
        { user: req.user.userId },
        { $set: { locations: normalizedLocations } },
        { new: true }
      ));
    }

    const registrationAlignment = buildRegistrationAlignment({ user, preferences });
    
    res.json({ preferences, registrationAlignment });
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
    if (locations !== undefined) {
      const normalizedLocations = Array.isArray(locations)
        ? locations.map((location, index) => canonicalizePreferenceLocation({
            ...(location || {}),
            isPrimary: Boolean(location?.isPrimary || index === 0)
          }))
        : [];
      if (normalizedLocations.length > 0 && !normalizedLocations.some((location) => location.isPrimary)) {
        normalizedLocations[0].isPrimary = true;
      }
      updateData.locations = normalizedLocations;
    }
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
    const user = await User.findById(req.user.userId).select('city state country zipCode');
    const registrationAlignment = buildRegistrationAlignment({ user, preferences });

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
    
    res.json({ preferences, registrationAlignment });
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
 * PUT /api/news/preferences/keywords/:keyword
 * Rename/edit an existing followed keyword
 */
router.put('/preferences/keywords/:keyword', authenticateToken, async (req, res) => {
  try {
    const oldKeyword = req.params.keyword.toLowerCase();
    const { keyword: newKeyword } = req.body;

    if (!newKeyword || !newKeyword.trim()) {
      return res.status(400).json({ error: 'New keyword is required' });
    }

    const normalizedNew = newKeyword.toLowerCase().trim();
    if (normalizedNew === oldKeyword) {
      return res.status(400).json({ error: 'New keyword must be different from the old keyword' });
    }

    const preferences = await NewsPreferences.findOne({ user: req.user.userId });
    if (!preferences) {
      return res.status(404).json({ error: 'Preferences not found' });
    }

    const existingIndex = preferences.followedKeywords.findIndex(k => k.keyword === oldKeyword);
    if (existingIndex === -1) {
      return res.status(404).json({ error: 'Keyword not found' });
    }

    // Check if new keyword already exists
    if (preferences.followedKeywords.some(k => k.keyword === normalizedNew)) {
      return res.status(409).json({ error: 'New keyword already exists' });
    }

    preferences.followedKeywords[existingIndex].keyword = normalizedNew;
    await preferences.save();

    res.json({ preferences });
  } catch (error) {
    console.error('Error renaming keyword:', error);
    res.status(500).json({ error: 'Failed to rename keyword' });
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
    
    const locationData = canonicalizePreferenceLocation({ city, zipCode, county, state, country, isPrimary });
    
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
    const user = await User.findById(req.user.userId).select('city state country zipCode');
    const registrationAlignment = buildRegistrationAlignment({ user, preferences });
    
    res.json({ preferences, registrationAlignment });
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
    const user = await User.findById(req.user.userId).select('city state country zipCode');
    const registrationAlignment = buildRegistrationAlignment({ user, preferences });
    
    res.json({ preferences, registrationAlignment });
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
 * PUT /api/news/preferences/source-categories
 * Toggle a category for a specific source on/off
 */
router.put('/preferences/source-categories', authenticateToken, async (req, res) => {
  try {
    const { sourceId, category } = req.body;

    if (!sourceId || typeof sourceId !== 'string') {
      return res.status(400).json({ error: 'sourceId is required' });
    }
    if (!category || typeof category !== 'string') {
      return res.status(400).json({ error: 'category is required' });
    }

    const preferences = await NewsPreferences.getOrCreate(req.user.userId);
    await preferences.toggleSourceCategory(sourceId, category);

    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    console.error('Error toggling source category:', error);
    res.status(500).json({ error: 'Failed to toggle source category' });
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

    if (type === 'rss' || type === 'googleNews' || type === 'government' || type === 'podcast' || type === 'npr' || type === 'bbc') {
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
 * POST /api/news/sources/local/sync
 * Sync/validate local source catalog and run local ingestion for specified locations (admin).
 */
router.post('/sources/local/sync', authenticateToken, async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId).select('_id isAdmin');
    if (!requester?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const locations = req.body.locations || [];
    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({ error: 'Provide an array of locations (city/state/zipCode)' });
    }

    const capped = locations.slice(0, NEWS_LOCAL_MAX_LOCATIONS);
    const { articles, metrics } = await ingestLocalSources(capped);

    // Process articles through dedup pipeline
    const ingestionRunId = uuidv4();
    const results = await processArticles(articles, { ingestionRunId });

    res.json({
      message: 'Local source sync completed',
      locationsProcessed: capped.length,
      metrics,
      ingestion: results
    });
  } catch (error) {
    console.error('[local-sync] Error:', error.message);
    res.status(500).json({ error: 'Local source sync failed' });
  }
});

/**
 * GET /api/news/sources/local/health
 * Diagnostics endpoint for local pipeline readiness (admin/mod).
 */
router.get('/sources/local/health', authenticateToken, async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId).select('_id isAdmin');
    if (!requester?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Count user locations configured
    const userPrefs = await NewsPreferences.find({
      'locations.0': { $exists: true }
    }).select('locations').lean();

    const locationSet = new Set();
    const stateCoverage = {};
    for (const pref of userPrefs) {
      for (const loc of (pref.locations || [])) {
        const key = `${(loc.city || '').toLowerCase()}|${(loc.state || '').toLowerCase()}`;
        locationSet.add(key);
        const st = (loc.state || '').toLowerCase();
        if (st) stateCoverage[st] = (stateCoverage[st] || 0) + 1;
      }
    }

    // Build sample plan to show coverage
    const sampleLocations = Array.from(locationSet).slice(0, 5).map(k => {
      const [city, state] = k.split('|');
      return { city, state, stateAbbrev: state, country: 'US' };
    });
    const samplePlans = sampleLocations.map(loc => buildLocalSourcePlan(loc));

    // Count recent local articles
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const localArticleCounts = await Article.aggregate([
      {
        $match: {
          sourceType: { $in: ['patch', 'redditLocal', 'tvAffiliate', 'localNewspaper'] },
          createdAt: { $gte: oneDayAgo }
        }
      },
      { $group: { _id: '$sourceType', count: { $sum: 1 } } }
    ]).catch(() => []);

    const articlesByType = {};
    for (const entry of localArticleCounts) {
      articlesByType[entry._id] = entry.count;
    }

    res.json({
      enabled: NEWS_LOCAL_SOURCES_ENABLED,
      flags: {
        NEWS_LOCAL_SOURCES_ENABLED,
        NEWS_LOCAL_GOOGLE_ENABLED,
        NEWS_LOCAL_TV_ENABLED,
        NEWS_LOCAL_PATCH_ENABLED,
        NEWS_LOCAL_NEWSPAPER_ENABLED,
        NEWS_LOCAL_REDDIT_ENABLED,
        NEWS_LOCAL_MAX_LOCATIONS
      },
      userLocations: {
        total: locationSet.size,
        stateCoverage
      },
      recentLocalArticles: articlesByType,
      samplePlans: samplePlans.map(p => ({
        locationKey: p.locationKey,
        sourceCount: p.sources.length,
        tiers: [...new Set(p.sources.map(s => s.tier))]
      })),
      catalogStats: {
        tvAffiliates: require('../data/news/us-tv-affiliates.json').length,
        newspapers: require('../data/news/us-newspapers.json').length,
        subreddits: require('../data/news/us-city-subreddits.json').length
      }
    });
  } catch (error) {
    console.error('[local-health] Error:', error.message);
    res.status(500).json({ error: 'Health check failed' });
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
    { id: 'ai', name: 'AI & Machine Learning', icon: '🤖' },
    { id: 'world', name: 'World', icon: '🌍' },
    { id: 'general', name: 'General', icon: '📰' }
  ];
  
  res.json({ topics });
});

router.get('/location-taxonomy', authenticateToken, (req, res) => {
  res.json({ taxonomy: getLocationTaxonomyPayload() });
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
// WEATHER ENDPOINTS
// ============================================

const US_ZIP_REGEX = /^\d{5}(-\d{4})?$/;

function normalizeUSState(input) {
  if (!input) return null;
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  // Check if it's already a valid state abbreviation (set stores lowercase)
  if (US_STATE_ABBREVS.has(lower)) return lower.toUpperCase();
  // Try matching full state name using the existing US_STATE_NAMES map
  const fromName = US_STATE_NAMES.get(lower);
  if (fromName) return fromName.toUpperCase();
  return null;
}

/**
 * Build a cache key for a weather location based on lat/lon.
 */
function buildWeatherCacheKey(lat, lon) {
  // Round to 2 decimal places (~1.1 km precision at equator) to coalesce nearby coordinates
  return `weather:${Number(lat).toFixed(2)}:${Number(lon).toFixed(2)}`;
}

/**
 * Fetch weather for a single location from NWS, using cache if available.
 * @param {Object} locObj – { lat, lon, ... }
 * @returns {{ weather, error, cacheHit }}
 */
async function fetchWeatherForLocation(locObj) {
  if (!locObj.lat || !locObj.lon) {
    return { weather: null, error: 'Unable to resolve weather data for this location', cacheHit: false };
  }

  const cacheKey = buildWeatherCacheKey(locObj.lat, locObj.lon);
  const cached = weatherCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < WEATHER_CACHE_TTL_MS) {
    weatherCacheMetrics.hits++;
    return { weather: cached.weather, error: null, cacheHit: true };
  }

  weatherCacheMetrics.misses++;
  const startMs = Date.now();
  try {
    const pointUrl = `https://api.weather.gov/points/${locObj.lat},${locObj.lon}`;
    const pointData = await fetchJsonWithTimeout(pointUrl);

    if (pointData?.properties?.forecast) {
      const forecastData = await fetchJsonWithTimeout(pointData.properties.forecast);
      const hourlyData = pointData.properties.forecastHourly
        ? await fetchJsonWithTimeout(pointData.properties.forecastHourly).catch((err) => {
            console.error('Hourly forecast fetch failed:', err.message);
            return null;
          })
        : null;

      const periods = forecastData?.properties?.periods || [];
      const currentPeriod = periods[0] || {};
      const todayDay = periods.find(p => p.isDaytime === true) || currentPeriod;
      const todayNight = periods.find(p => p.isDaytime === false);

      const weather = {
        current: {
          temperature: currentPeriod.temperature,
          temperatureUnit: currentPeriod.temperatureUnit || 'F',
          shortForecast: currentPeriod.shortForecast,
          icon: currentPeriod.icon,
          windSpeed: currentPeriod.windSpeed,
          windDirection: currentPeriod.windDirection
        },
        high: todayDay?.temperature || null,
        low: todayNight?.temperature || null,
        hourly: (hourlyData?.properties?.periods || []).slice(0, 12).map(p => ({
          time: p.startTime,
          temperature: p.temperature,
          shortForecast: p.shortForecast,
          icon: p.icon
        })),
        weekly: periods.filter(p => p.isDaytime).slice(0, 7).map(p => ({
          name: p.name,
          temperature: p.temperature,
          shortForecast: p.shortForecast,
          icon: p.icon
        })),
        updatedAt: new Date().toISOString()
      };

      const elapsedMs = Date.now() - startMs;
      weatherCacheMetrics.totalLatencyMs += elapsedMs;
      weatherCacheMetrics.fetchCount++;
      weatherCache.set(cacheKey, { weather, timestamp: Date.now() });
      return { weather, error: null, cacheHit: false };
    }

    return { weather: null, error: 'Unable to resolve weather data for this location', cacheHit: false };
  } catch (fetchErr) {
    weatherCacheMetrics.errors++;
    return { weather: null, error: 'Weather service temporarily unavailable', cacheHit: false };
  }
}

/**
 * GET /api/news/weather
 * Fetch weather for user's weather locations using api.weather.gov (NWS).
 * Uses in-memory cache with TTL and supports location fallback chain:
 *   saved weather locations → news primary location → profile location.
 */
router.get('/weather', authenticateToken, async (req, res) => {
  try {
    const preferences = await NewsPreferences.findOne({ user: req.user.userId });
    let weatherLocations = preferences?.weatherLocations || [];

    // Fallback chain: if no saved weather locations, try news primary location or profile
    let fallbackSource = null;
    if (weatherLocations.length === 0) {
      // Try news primary location
      const newsLocations = preferences?.locations || [];
      const primary = newsLocations.find(l => l.isPrimary) || newsLocations[0];
      if (primary && (primary.lat || primary.city)) {
        weatherLocations = [primary];
        fallbackSource = 'newsLocation';
      } else {
        // Try profile location (user model)
        const user = await User.findById(req.user.userId).lean();
        if (user?.location?.lat && user?.location?.lon) {
          weatherLocations = [{ lat: user.location.lat, lon: user.location.lon, label: 'Profile Location', isPrimary: true }];
          fallbackSource = 'profileLocation';
        } else if (user?.location?.city || user?.location?.state) {
          weatherLocations = [{ city: user.location.city, state: user.location.state, label: 'Profile Location', isPrimary: true }];
          fallbackSource = 'profileLocation';
        }
      }
    }

    if (weatherLocations.length === 0) {
      return res.json({ locations: [], fallbackSource: null, _cache: { ttlMs: WEATHER_CACHE_TTL_MS, ...weatherCacheMetrics } });
    }

    const results = await Promise.allSettled(
      weatherLocations.map(async (loc) => {
        const locObj = loc.toObject ? loc.toObject() : loc;
        const result = await fetchWeatherForLocation(locObj);
        return { ...locObj, weather: result.weather, error: result.error, cacheHit: result.cacheHit };
      })
    );

    const locations = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      const loc = weatherLocations[i];
      const locObj = loc?.toObject ? loc.toObject() : loc;
      return { ...locObj, weather: null, error: 'Weather fetch failed', cacheHit: false };
    });
    res.json({
      locations,
      fallbackSource,
      _cache: { ttlMs: WEATHER_CACHE_TTL_MS, ...weatherCacheMetrics }
    });
  } catch (error) {
    console.error('Error fetching weather:', error);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

// Helper to fetch JSON with timeout from external APIs
async function fetchJsonWithTimeout(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { 
      headers: { 'User-Agent': 'SocialSecure-Weather/1.0', 'Accept': 'application/geo+json' },
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } 
        catch (e) { reject(new Error('Invalid JSON response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

/**
 * POST /api/news/preferences/weather-locations
 * Add a weather location (max 3)
 */
router.post('/preferences/weather-locations', authenticateToken, async (req, res) => {
  try {
    const { label, city, state, zipCode, lat, lon, isPrimary } = req.body;

    if (!city && !zipCode) {
      return res.status(400).json({ error: 'City or ZIP code is required' });
    }

    // US-only validation
    if (zipCode && !US_ZIP_REGEX.test(zipCode)) {
      return res.status(400).json({ error: 'Invalid US ZIP code format' });
    }

    const normalizedState = normalizeUSState(state);
    if (state && !normalizedState) {
      return res.status(400).json({ error: 'Invalid US state' });
    }

    let preferences = await NewsPreferences.findOne({ user: req.user.userId });
    if (!preferences) {
      preferences = await NewsPreferences.create({ user: req.user.userId });
    }

    if ((preferences.weatherLocations || []).length >= 3) {
      return res.status(400).json({ error: 'Maximum 3 weather locations allowed' });
    }

    const locationData = {
      label: label || [city, normalizedState].filter(Boolean).join(', '),
      city: city || null,
      state: normalizedState || null,
      zipCode: zipCode || null,
      lat: lat || null,
      lon: lon || null,
      isPrimary: false
    };

    // Set as primary if explicitly requested or if it's the first location
    if (isPrimary || (preferences.weatherLocations || []).length === 0) {
      locationData.isPrimary = true;
      if (isPrimary && preferences.weatherLocations.length > 0) {
        preferences.weatherLocations.forEach(loc => { loc.isPrimary = false; });
      }
    }

    preferences.weatherLocations.push(locationData);
    await preferences.save();

    res.json({ preferences });
  } catch (error) {
    console.error('Error adding weather location:', error);
    res.status(500).json({ error: 'Failed to add weather location' });
  }
});

/**
 * PUT /api/news/preferences/weather-locations
 * Replace all weather locations
 */
router.put('/preferences/weather-locations', authenticateToken, async (req, res) => {
  try {
    const { locations } = req.body;

    if (!Array.isArray(locations)) {
      return res.status(400).json({ error: 'Locations array is required' });
    }

    if (locations.length > 3) {
      return res.status(400).json({ error: 'Maximum 3 weather locations allowed' });
    }

    // Validate and normalize each location without mutating input
    const normalizedLocations = locations.map(loc => {
      const normalized = { ...loc };
      if (normalized.zipCode && !US_ZIP_REGEX.test(normalized.zipCode)) {
        return { error: `Invalid US ZIP code: ${normalized.zipCode}` };
      }
      if (normalized.state) {
        const normalizedState = normalizeUSState(normalized.state);
        if (!normalizedState) return { error: `Invalid US state: ${normalized.state}` };
        normalized.state = normalizedState;
      }
      return normalized;
    });

    const validationError = normalizedLocations.find(loc => loc.error);
    if (validationError) {
      return res.status(400).json({ error: validationError.error });
    }

    const preferences = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { weatherLocations: normalizedLocations },
      { new: true, upsert: true }
    );

    res.json({ preferences });
  } catch (error) {
    console.error('Error updating weather locations:', error);
    res.status(500).json({ error: 'Failed to update weather locations' });
  }
});

/**
 * DELETE /api/news/preferences/weather-locations/:locationId
 * Remove a weather location
 */
router.delete('/preferences/weather-locations/:locationId', authenticateToken, async (req, res) => {
  try {
    const { locationId } = req.params;

    const preferences = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { $pull: { weatherLocations: { _id: locationId } } },
      { new: true }
    );

    if (!preferences) {
      return res.status(404).json({ error: 'Preferences not found' });
    }

    // If primary was removed, make first remaining primary
    if (preferences.weatherLocations.length > 0 && !preferences.weatherLocations.some(l => l.isPrimary)) {
      preferences.weatherLocations[0].isPrimary = true;
      await preferences.save();
    }

    res.json({ preferences });
  } catch (error) {
    console.error('Error removing weather location:', error);
    res.status(500).json({ error: 'Failed to remove weather location' });
  }
});

/**
 * PUT /api/news/preferences/weather-locations/:locationId/primary
 * Set a weather location as primary
 */
router.put('/preferences/weather-locations/:locationId/primary', authenticateToken, async (req, res) => {
  try {
    const { locationId } = req.params;

    const preferences = await NewsPreferences.findOne({ user: req.user.userId });
    if (!preferences) {
      return res.status(404).json({ error: 'Preferences not found' });
    }

    const targetLocation = preferences.weatherLocations.id(locationId);
    if (!targetLocation) {
      return res.status(404).json({ error: 'Weather location not found' });
    }

    preferences.weatherLocations.forEach(loc => { loc.isPrimary = false; });
    targetLocation.isPrimary = true;
    await preferences.save();

    res.json({ preferences });
  } catch (error) {
    console.error('Error setting primary weather location:', error);
    res.status(500).json({ error: 'Failed to set primary weather location' });
  }
});

/**
 * GET /api/news/schedule-info
 * Returns scheduler status, last/next run times, and recent ingestion result (admin)
 */
router.get('/schedule-info', authenticateToken, async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId).select('_id isAdmin');
    if (!requester?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const now = new Date();
    let nextRunAt = null;
    if (lastIngestionRunAt && ingestionInterval) {
      nextRunAt = new Date(lastIngestionRunAt.getTime() + INGESTION_INTERVAL_MS);
    } else if (schedulerStartedAt && ingestionInterval) {
      nextRunAt = new Date(schedulerStartedAt.getTime() + INGESTION_INTERVAL_MS);
    }

    res.json({
      schedulerRunning: !!ingestionInterval,
      intervalMs: INGESTION_INTERVAL_MS,
      schedulerStartedAt,
      lastIngestionRunAt,
      nextRunAt,
      msUntilNextRun: nextRunAt ? Math.max(0, nextRunAt.getTime() - now.getTime()) : null,
      lastResult: lastIngestionResult || null
    });
  } catch (error) {
    console.error('Error fetching schedule info:', error);
    res.status(500).json({ error: 'Failed to fetch schedule info' });
  }
});

/**
 * GET /api/news/ingestion-stats
 * Returns aggregated ingestion statistics per source, per scope, per status (admin)
 */
router.get('/ingestion-stats', authenticateToken, async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId).select('_id isAdmin');
    if (!requester?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [bySource, byScope, byStatus, totalToday, totalWeek, totalAll] = await Promise.all([
      NewsIngestionRecord.aggregate([
        { $match: { createdAt: { $gte: oneDayAgo } } },
        { $group: { _id: '$source.name', count: { $sum: 1 }, processed: { $sum: { $cond: [{ $eq: ['$processingStatus', 'processed'] }, 1, 0] } }, failed: { $sum: { $cond: [{ $eq: ['$processingStatus', 'failed'] }, 1, 0] } } } },
        { $sort: { count: -1 } }
      ]).catch(() => []),
      NewsIngestionRecord.aggregate([
        { $match: { createdAt: { $gte: oneDayAgo } } },
        { $group: { _id: '$resolvedScope', count: { $sum: 1 } } }
      ]).catch(() => []),
      NewsIngestionRecord.aggregate([
        { $match: { createdAt: { $gte: oneDayAgo } } },
        { $group: { _id: '$dedupe.outcome', count: { $sum: 1 } } }
      ]).catch(() => []),
      NewsIngestionRecord.countDocuments({ createdAt: { $gte: oneDayAgo } }).catch(() => 0),
      NewsIngestionRecord.countDocuments({ createdAt: { $gte: sevenDaysAgo } }).catch(() => 0),
      Article.countDocuments({ isActive: true }).catch(() => 0)
    ]);

    // Build source display name → adapter key mapping from catalog
    const sourceAdapterKeys = {
      'google-news': true, 'npr': true, 'bbc': true, 'associated-press': true,
      'reuters': true, 'pbs': true, 'cnn': true, 'guardian': true,
      'new-york-times': true, 'wall-street-journal': true, 'techcrunch': true,
      'yahoo-news': true, 'espn': true, 'gdelt': true
    };
    const nameToAdapterKey = {};
    for (const entry of NEWS_SOURCE_CATALOG) {
      if (sourceAdapterKeys[entry.id]) {
        nameToAdapterKey[entry.name] = entry.id;
      }
    }

    res.json({
      bySource: bySource.map(s => ({ source: s._id || 'Unknown', total: s.count, processed: s.processed, failed: s.failed })),
      byScope: byScope.reduce((acc, s) => { acc[s._id || 'unknown'] = s.count; return acc; }, {}),
      byStatus: byStatus.reduce((acc, s) => { acc[s._id || 'unknown'] = s.count; return acc; }, {}),
      totals: {
        today: totalToday,
        week: totalWeek,
        activeArticles: totalAll
      },
      availableAdapterKeys: Object.keys(sourceAdapterKeys),
      nameToAdapterKey
    });
  } catch (error) {
    console.error('Error fetching ingestion stats:', error);
    res.status(500).json({ error: 'Failed to fetch ingestion stats' });
  }
});

/**
 * POST /api/news/ingest/:sourceKey
 * Trigger ingestion for a single source (admin)
 */
router.post('/ingest/:sourceKey', authenticateToken, async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId).select('_id isAdmin');
    if (!requester?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { sourceKey } = req.params;
    const sourceAdapters = {
      'google-news': async () => {
        let articles = [];
        for (const topic of Object.keys(GOOGLE_NEWS_TOPIC_MAP)) {
          articles = [...articles, ...await fetchGoogleNewsSource(topic, 'googleNews')];
        }
        return articles;
      },
      'npr': async () => {
        let articles = [];
        for (const [s, fc] of Object.entries(NPR_FEED_MAP)) articles = [...articles, ...await fetchNprSource(s, fc)];
        return articles;
      },
      'bbc': async () => {
        let articles = [];
        for (const [s, fc] of Object.entries(BBC_FEED_MAP)) articles = [...articles, ...await fetchBbcSource(s, fc)];
        return articles;
      },
      'associated-press': async () => {
        let articles = [];
        for (const [s, fc] of Object.entries(AP_FEED_MAP)) articles = [...articles, ...await fetchApSource(s, fc)];
        return articles;
      },
      'reuters': async () => {
        let articles = [];
        for (const [s, fc] of Object.entries(REUTERS_FEED_MAP)) articles = [...articles, ...await fetchReutersSource(s, fc)];
        return articles;
      },
      'pbs': async () => {
        let articles = [];
        for (const [s, fc] of Object.entries(PBS_FEED_MAP)) articles = [...articles, ...await fetchPbsSource(s, fc)];
        return articles;
      },
      'cnn': async () => {
        let articles = [];
        for (const [s, fc] of Object.entries(CNN_FEED_MAP)) articles = [...articles, ...await fetchCnnSource(s, fc)];
        return articles;
      },
      'guardian': async () => {
        let articles = [];
        for (const [s, fc] of Object.entries(GUARDIAN_FEED_MAP)) articles = [...articles, ...await fetchGuardianSource(s, fc)];
        return articles;
      },
      'new-york-times': async () => {
        let articles = [];
        for (const [s, fc] of Object.entries(NYT_FEED_MAP)) articles = [...articles, ...await fetchNytSource(s, fc)];
        return articles;
      },
      'wall-street-journal': async () => {
        let articles = [];
        for (const [s, fc] of Object.entries(WSJ_FEED_MAP)) articles = [...articles, ...await fetchWsjSource(s, fc)];
        return articles;
      },
      'techcrunch': async () => {
        let articles = [];
        for (const [s, fc] of Object.entries(TECHCRUNCH_FEED_MAP)) articles = [...articles, ...await fetchTechcrunchSource(s, fc)];
        return articles;
      },
      'yahoo-news': async () => {
        let articles = [];
        for (const [s, fc] of Object.entries(YAHOO_FEED_MAP)) articles = [...articles, ...await fetchYahooSource(s, fc)];
        return articles;
      },
      'espn': async () => {
        let articles = [];
        for (const [s, fc] of Object.entries(ESPN_FEED_MAP)) articles = [...articles, ...await fetchEspnSource(s, fc)];
        return articles;
      },
      'gdelt': async () => {
        let articles = [];
        for (const query of GDELT_DEFAULT_QUERIES) articles = [...articles, ...await fetchGdeltSource(query)];
        return articles;
      }
    };

    const adapter = sourceAdapters[sourceKey];
    if (!adapter) {
      return res.status(400).json({ error: `Unknown source key: ${sourceKey}`, availableSources: Object.keys(sourceAdapters) });
    }

    const articles = await adapter();
    const ingestionRunId = uuidv4();
    const results = await processArticles(articles, { ingestionRunId });

    res.json({
      message: `Ingestion for ${sourceKey} completed`,
      sourceKey,
      articlesScraped: articles.length,
      results
    });
  } catch (error) {
    console.error(`Error during source-specific ingestion (${req.params.sourceKey}):`, error);
    res.status(500).json({ error: 'Source-specific ingestion failed' });
  }
});

// ============================================
// INGESTION SCHEDULER
// ============================================

const INGESTION_INTERVAL_MS = 10 * 60 * 1000;
let ingestionInterval = null;
let lastIngestionRunAt = null;
let lastIngestionResult = null;
let schedulerStartedAt = null;

function startIngestionScheduler() {
  if (ingestionInterval) {
    clearInterval(ingestionInterval);
  }
  
  schedulerStartedAt = new Date();

  // Initial ingestion
  ingestAllSources()
    .then((result) => {
      lastIngestionRunAt = new Date();
      lastIngestionResult = result;
    })
    .catch(console.error);
  
  // Schedule every 10 minutes
  ingestionInterval = setInterval(() => {
    ingestAllSources()
      .then((result) => {
        lastIngestionRunAt = new Date();
        lastIngestionResult = result;
      })
      .catch(console.error);
  }, INGESTION_INTERVAL_MS);
  
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
    fetchGdeltSource,
    fetchNprSource,
    fetchBbcSource,
    fetchApSource,
    fetchReutersSource,
    fetchPbsSource,
    fetchCnnSource,
    fetchGuardianSource,
    fetchNytSource,
    fetchWsjSource,
    fetchTechcrunchSource,
    fetchYahooSource,
    fetchEspnSource,
    fetchPatchSource,
    fetchRedditLocalSource,
    fetchLocalCatalogRssSource,
    fetchNewsApiSource,
    ingestLocalSources
  },
  internals: {
    processArticles,
    cleanupStaleNewsData,
    ensureCityAssociationSpecificity,
    getItemPublishedAt,
    articleMatchesLocation,
    resolveAssignedZipCode,
    resolveArticleLocationContext,
    inferLocationTokensFromText,
    inferLocationFromCountryVariants,
    resolveLocationContext,
    geocodeContextCache,
    computeScopeQualityMetrics,
    normalizeToStandardCategory,
    buildGoogleNewsFeedUrl,
    classifySourceHealth,
    fetchJsonWithTimeout,
    fetchWeatherForLocation,
    buildWeatherCacheKey,
    weatherCache,
    weatherCacheMetrics,
    WEATHER_CACHE_TTL_MS,
    normalizeUSState,
    US_ZIP_REGEX,
    GOOGLE_NEWS_TOPIC_MAP,
    NPR_FEED_MAP,
    BBC_FEED_MAP,
    YAHOO_FEED_MAP,
    AP_FEED_MAP,
    REUTERS_FEED_MAP,
    PBS_FEED_MAP,
    CNN_FEED_MAP,
    GUARDIAN_FEED_MAP,
    NYT_FEED_MAP,
    WSJ_FEED_MAP,
    TECHCRUNCH_FEED_MAP,
    ESPN_FEED_MAP,
    COUNTRY_VARIANTS_MAP,
    STANDARDIZED_CATEGORIES,
    SUPPORTED_RSS_PROVIDERS,
    detectProviderIdFromUrl,
    NEWS_LOCAL_SOURCES_ENABLED,
    NEWS_LOCAL_NEWSAPI_ENABLED,
    NEWS_API_KEY,
    LOCAL_SOURCE_TIERS
  }
};
