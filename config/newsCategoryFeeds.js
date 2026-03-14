'use strict';

/**
 * newsCategoryFeeds.js
 *
 * Maps the 21 news categories to their free RSS feed sources.
 * Primary source is Google News topic/search RSS where available,
 * supplemented by category-specific free RSS feeds.
 *
 * Google News RSS format:
 *   Topic feeds: https://news.google.com/rss/headlines/section/topic/{TOPIC}?hl=en-US&gl=US&ceid=US:en
 *   Search feeds: https://news.google.com/rss/search?q={QUERY}&hl=en-US&gl=US&ceid=US:en
 */

const GN_BASE = 'https://news.google.com/rss';
const GN_TOPIC = (slug) => `${GN_BASE}/headlines/section/topic/${slug}?hl=en-US&gl=US&ceid=US:en`;
const GN_SEARCH = (q) => `${GN_BASE}/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

// All 21 categories with their RSS feed definitions.
// Each feed entry: { name, url, sourceType }
const CATEGORY_FEEDS = {
  technology: {
    label: 'Technology',
    icon: '💻',
    color: '#3B82F6',
    feeds: [
      { name: 'Google News Technology', url: GN_TOPIC('TECHNOLOGY'), sourceType: 'googleNews' },
      { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', sourceType: 'rss' },
      { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', sourceType: 'rss' },
      { name: 'Wired', url: 'https://www.wired.com/feed/rss', sourceType: 'rss' },
    ]
  },

  science: {
    label: 'Science',
    icon: '🔬',
    color: '#8B5CF6',
    feeds: [
      { name: 'Google News Science', url: GN_TOPIC('SCIENCE'), sourceType: 'googleNews' },
      { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', sourceType: 'rss' },
      { name: 'New Scientist', url: 'https://www.newscientist.com/feed/home/', sourceType: 'rss' },
    ]
  },

  health: {
    label: 'Health',
    icon: '🏥',
    color: '#10B981',
    feeds: [
      { name: 'Google News Health', url: GN_TOPIC('HEALTH'), sourceType: 'googleNews' },
      { name: 'NPR Health', url: 'https://feeds.npr.org/1128/rss.xml', sourceType: 'rss' },
      { name: 'WebMD', url: 'https://rssfeeds.webmd.com/rss/rss.aspx?RSSSource=RSS_PUBLIC', sourceType: 'rss' },
    ]
  },

  business: {
    label: 'Business',
    icon: '💼',
    color: '#F59E0B',
    feeds: [
      { name: 'Google News Business', url: GN_TOPIC('BUSINESS'), sourceType: 'googleNews' },
      { name: 'Reuters Business', url: 'https://feeds.reuters.com/reuters/businessNews', sourceType: 'rss' },
      { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', sourceType: 'rss' },
    ]
  },

  sports: {
    label: 'Sports',
    icon: '🏆',
    color: '#EF4444',
    feeds: [
      { name: 'Google News Sports', url: GN_TOPIC('SPORTS'), sourceType: 'googleNews' },
      { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', sourceType: 'rss' },
      { name: 'AP Sports', url: 'https://feeds.apnews.com/rss/apf-sports', sourceType: 'rss' },
    ]
  },

  entertainment: {
    label: 'Entertainment',
    icon: '🎬',
    color: '#EC4899',
    feeds: [
      { name: 'Google News Entertainment', url: GN_TOPIC('ENTERTAINMENT'), sourceType: 'googleNews' },
      { name: 'Entertainment Weekly', url: 'https://ew.com/feed/', sourceType: 'rss' },
      { name: 'Hollywood Reporter', url: 'https://www.hollywoodreporter.com/feed/', sourceType: 'rss' },
    ]
  },

  politics: {
    label: 'Politics',
    icon: '🏛️',
    color: '#6366F1',
    feeds: [
      { name: 'Google News Nation', url: GN_TOPIC('NATION'), sourceType: 'googleNews' },
      { name: 'Google News World', url: GN_TOPIC('WORLD'), sourceType: 'googleNews' },
      { name: 'NPR Politics', url: 'https://feeds.npr.org/1014/rss.xml', sourceType: 'rss' },
      { name: 'Politico', url: 'https://www.politico.com/rss/politics08.xml', sourceType: 'rss' },
      { name: 'The Hill', url: 'https://thehill.com/news/feed/', sourceType: 'rss' },
    ]
  },

  finance: {
    label: 'Finance',
    icon: '📈',
    color: '#059669',
    feeds: [
      { name: 'Google News Finance', url: GN_SEARCH('finance stock market economy when:1d'), sourceType: 'googleNews' },
      { name: 'Reuters Money', url: 'https://feeds.reuters.com/reuters/businessNews', sourceType: 'rss' },
      { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', sourceType: 'rss' },
      { name: 'Investopedia News', url: 'https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=rss_headline', sourceType: 'rss' },
    ]
  },

  gaming: {
    label: 'Gaming',
    icon: '🎮',
    color: '#7C3AED',
    feeds: [
      { name: 'Google News Gaming', url: GN_SEARCH('video games gaming esports'), sourceType: 'googleNews' },
      { name: 'IGN', url: 'https://feeds.feedburner.com/ign/games-all', sourceType: 'rss' },
      { name: 'Kotaku', url: 'https://kotaku.com/rss', sourceType: 'rss' },
      { name: 'PC Gamer', url: 'https://www.pcgamer.com/rss/', sourceType: 'rss' },
    ]
  },

  ai: {
    label: 'AI & Machine Learning',
    icon: '🤖',
    color: '#0EA5E9',
    feeds: [
      { name: 'Google News AI', url: GN_SEARCH('artificial intelligence machine learning AI when:1d'), sourceType: 'googleNews' },
      { name: 'MIT Technology Review AI', url: 'https://www.technologyreview.com/feed/', sourceType: 'rss' },
      { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', sourceType: 'rss' },
      { name: 'The Gradient', url: 'https://thegradient.pub/rss/', sourceType: 'rss' },
    ]
  },

  world: {
    label: 'World',
    icon: '🌍',
    color: '#0891B2',
    feeds: [
      { name: 'Google News World', url: GN_TOPIC('WORLD'), sourceType: 'googleNews' },
      { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', sourceType: 'rss' },
      { name: 'Reuters World', url: 'https://feeds.reuters.com/Reuters/worldNews', sourceType: 'rss' },
      { name: 'AP World', url: 'https://feeds.apnews.com/rss/apf-intlnews', sourceType: 'rss' },
    ]
  },

  general: {
    label: 'General',
    icon: '📰',
    color: '#64748B',
    feeds: [
      { name: 'Google News Headlines', url: GN_BASE + '?hl=en-US&gl=US&ceid=US:en', sourceType: 'googleNews' },
      { name: 'AP Top News', url: 'https://feeds.apnews.com/rss/apf-topnews', sourceType: 'rss' },
      { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', sourceType: 'rss' },
    ]
  },

  war: {
    label: 'War / Conflict',
    icon: '⚔️',
    color: '#DC2626',
    feeds: [
      { name: 'Google News War', url: GN_SEARCH('war conflict military battle when:1d'), sourceType: 'googleNews' },
      { name: 'Reuters World', url: 'https://feeds.reuters.com/Reuters/worldNews', sourceType: 'rss' },
      { name: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml', sourceType: 'rss' },
    ]
  },

  marijuana: {
    label: 'Marijuana',
    icon: '🌿',
    color: '#16A34A',
    feeds: [
      { name: 'Google News Cannabis', url: GN_SEARCH('marijuana cannabis weed legalization'), sourceType: 'googleNews' },
      { name: 'Marijuana Moment', url: 'https://www.marijuanamoment.net/feed/', sourceType: 'rss' },
      { name: 'High Times', url: 'https://hightimes.com/feed/', sourceType: 'rss' },
    ]
  },

  conspiracy: {
    label: 'Conspiracy',
    icon: '🕵️',
    color: '#78716C',
    feeds: [
      { name: 'Google News Conspiracy', url: GN_SEARCH('conspiracy theory misinformation fact check'), sourceType: 'googleNews' },
    ]
  },

  space: {
    label: 'Space',
    icon: '🚀',
    color: '#1D4ED8',
    feeds: [
      { name: 'Google News Space', url: GN_SEARCH('space NASA SpaceX astronomy when:2d'), sourceType: 'googleNews' },
      { name: 'Space.com', url: 'https://www.space.com/feeds/all', sourceType: 'rss' },
      { name: 'NASA News', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', sourceType: 'rss' },
      { name: 'Spaceflight Now', url: 'https://spaceflightnow.com/feed/', sourceType: 'rss' },
    ]
  },

  ocean: {
    label: 'Ocean',
    icon: '🌊',
    color: '#0369A1',
    feeds: [
      { name: 'Google News Ocean', url: GN_SEARCH('ocean marine sea coral reef climate when:3d'), sourceType: 'googleNews' },
      { name: 'NOAA News', url: 'https://www.noaa.gov/rss.xml', sourceType: 'rss' },
    ]
  },

  nature: {
    label: 'Nature',
    icon: '🌿',
    color: '#15803D',
    feeds: [
      { name: 'Google News Nature', url: GN_SEARCH('nature environment wildlife climate conservation'), sourceType: 'googleNews' },
      { name: 'National Geographic', url: 'https://www.nationalgeographic.com/nature/rss/', sourceType: 'rss' },
      { name: 'BBC Nature', url: 'https://feeds.bbci.co.uk/earth/rss.xml', sourceType: 'rss' },
    ]
  },

  programming: {
    label: 'Programming',
    icon: '👨‍💻',
    color: '#475569',
    feeds: [
      { name: 'Google News Programming', url: GN_SEARCH('programming software development open source when:2d'), sourceType: 'googleNews' },
      { name: 'Hacker News Top', url: 'https://hnrss.org/frontpage', sourceType: 'rss' },
      { name: 'dev.to', url: 'https://dev.to/feed', sourceType: 'rss' },
      { name: 'GitHub Blog', url: 'https://github.blog/feed/', sourceType: 'rss' },
      { name: 'CSS-Tricks', url: 'https://css-tricks.com/feed/', sourceType: 'rss' },
    ]
  },

  breaking: {
    label: 'Breaking',
    icon: '🔴',
    color: '#EF4444',
    feeds: [
      { name: 'AP Top News', url: 'https://feeds.apnews.com/rss/apf-topnews', sourceType: 'rss' },
      { name: 'BBC Top Stories', url: 'https://feeds.bbci.co.uk/news/rss.xml', sourceType: 'rss' },
      { name: 'Reuters Top News', url: 'https://feeds.reuters.com/reuters/topNews', sourceType: 'rss' },
      { name: 'NPR News Now', url: 'https://feeds.npr.org/500005/podcast.xml', sourceType: 'rss' },
    ]
  },

  // ── Sports sub-categories (for sports team news research) ────────────────
  // These are NOT shown as top-level categories in the UI. They are used by
  // the sports ingestion pipeline to build per-team Google News queries.
};

// Sports league sub-categories for team-specific ingestion
const SPORTS_LEAGUES = {
  nfl: { label: 'NFL', searchSuffix: 'NFL football' },
  nba: { label: 'NBA', searchSuffix: 'NBA basketball' },
  mlb: { label: 'MLB', searchSuffix: 'MLB baseball' },
  nhl: { label: 'NHL', searchSuffix: 'NHL hockey' },
  ncaaf: { label: 'NCAA Football', searchSuffix: 'college football' },
  ncaab: { label: 'NCAA Basketball', searchSuffix: 'college basketball' },
  mls: { label: 'MLS', searchSuffix: 'MLS soccer' },
  ufc: { label: 'UFC', searchSuffix: 'UFC MMA' },
  pga: { label: 'PGA Golf', searchSuffix: 'PGA Tour golf' },
  atp: { label: 'Tennis', searchSuffix: 'ATP WTA tennis' },
  f1: { label: 'Formula 1', searchSuffix: 'Formula 1 F1 racing' },
  nascar: { label: 'NASCAR', searchSuffix: 'NASCAR racing' },
  wnba: { label: 'WNBA', searchSuffix: 'WNBA basketball' },
  premier: { label: 'Premier League', searchSuffix: 'Premier League soccer' },
  laliga: { label: 'La Liga', searchSuffix: 'La Liga soccer' },
};

// Build a Google News search URL for a specific sports team
const buildSportsTeamFeedUrl = (teamName, leagueKey) => {
  const league = SPORTS_LEAGUES[leagueKey];
  const suffix = league ? league.searchSuffix : leagueKey;
  return GN_SEARCH(`"${teamName}" ${suffix} when:1d`);
};

// Ordered list of categories for UI display
const CATEGORY_ORDER = [
  'general', 'breaking', 'technology', 'science', 'health', 'business',
  'sports', 'entertainment', 'politics', 'finance', 'gaming', 'ai',
  'world', 'war', 'space', 'nature', 'ocean', 'programming',
  'marijuana', 'conspiracy'
];

module.exports = {
  CATEGORY_FEEDS,
  SPORTS_LEAGUES,
  CATEGORY_ORDER,
  buildSportsTeamFeedUrl,
  GN_SEARCH,
  GN_TOPIC,
};
