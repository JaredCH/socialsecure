'use strict';

/**
 * newsIngestion.categories.js
 *
 * Pipeline 2 — Category News
 *
 * Ingests the 20 editorial news categories (Technology, Science, Health, etc.)
 * using Google News topic/search RSS feeds plus free category-specific RSS supplements.
 * Rate-limited to 1 request/sec with jitter to avoid temporary IP bans.
 *
 * Schedule: every 1 hour via server.js
 */

const Parser = require('rss-parser');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const { CATEGORY_FEEDS, CATEGORY_ORDER } = require('../config/newsCategoryFeeds');
const { calculateViralScore, createMomentumMap } = require('./newsViralScore');
const { extractRssImageUrl } = require('./newsRssImage');
const { extractLocationContext } = require('../utils/newsLocationExtractor');

const parser = new Parser({ timeout: 14000, headers: { 'User-Agent': 'SocialSecure-NewsBot/1.0' } });

const MIN_DELAY_MS = 900;   // min ms between requests
const MAX_JITTER_MS = 300;  // additional random jitter

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MARIJUANA_TOPIC = 'marijuana';
const MARIJUANA_TEXT_PATTERNS = [
  /\bmarijuana\b/i,
  /\bcannabis\b/i,
  /\bhemp\b/i,
  /\bthc\b/i,
  /\bthca\b/i,
  /\bdelta[\s-]*8\b/i,
  /\bdelta[\s-]*9\b/i,
];
const MARIJUANA_TOPIC_QUERY = {
  $or: [
    { category: MARIJUANA_TOPIC },
    ...MARIJUANA_TEXT_PATTERNS.flatMap((pattern) => ([
      { title: pattern },
      { description: pattern },
    ])),
  ],
};

function normalizeTopics(topics = []) {
  return Array.from(new Set(
    topics
      .map((topic) => String(topic ?? '').trim().toLowerCase())
      .filter(Boolean)
  ));
}

function shouldTagAsMarijuana(item, category) {
  if (category === MARIJUANA_TOPIC) return true;
  const searchableText = [
    item?.title,
    item?.contentSnippet || item?.summary,
  ]
    .filter(Boolean)
    .join(' ');

  return MARIJUANA_TEXT_PATTERNS.some((pattern) => pattern.test(searchableText));
}

function deriveTopics(item, category, existingTopics = []) {
  const topics = normalizeTopics(existingTopics);
  if (shouldTagAsMarijuana(item, category) && !topics.includes(MARIJUANA_TOPIC)) {
    topics.push(MARIJUANA_TOPIC);
  }
  return topics;
}

async function retagExistingMarijuanaArticles() {
  const result = await Article.updateMany(
    {
      ...MARIJUANA_TOPIC_QUERY,
      topics: { $ne: MARIJUANA_TOPIC },
    },
    {
      $addToSet: { topics: MARIJUANA_TOPIC },
    }
  );

  return result?.modifiedCount || result?.nModified || 0;
}

async function persistItem(item, category, feedSource) {
  const url = item.link || item.guid;
  if (!url) return 'skipped';

  const urlHash = crypto
    .createHash('sha256')
    .update(url.toLowerCase().trim())
    .digest('hex')
    .substring(0, 16);

  // Content fingerprint: hash of title — helps dedup Google News URL variants
  const contentFingerprint = item.title
    ? crypto.createHash('sha256').update(item.title.trim().toLowerCase()).digest('hex').substring(0, 16)
    : null;

  const existing = await Article.findOne({
    $or: [
      { normalizedUrlHash: urlHash },
      ...(contentFingerprint ? [{ contentFingerprint }] : []),
    ]
  }).lean();
  if (existing) {
    const existingTopics = normalizeTopics(existing.topics);
    const topics = deriveTopics(item, category, existingTopics);
    if (!existingTopics.includes(MARIJUANA_TOPIC) && topics.includes(MARIJUANA_TOPIC)) {
      await Article.updateOne(
        { _id: existing._id },
        { $addToSet: { topics: MARIJUANA_TOPIC } }
      );
    }
    return 'duplicate';
  }

  const articleData = {
    title: (item.title || '').trim(),
    description: (item.contentSnippet || item.summary || '').trim().substring(0, 1000),
    source: item.creator || item.author || feedSource,
    url,
    imageUrl: extractRssImageUrl(item),
    publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
    category,
    pipeline: 'category',
    sourceType: feedSource.toLowerCase().includes('google') ? 'googleNews' : 'rss',
    feedSource,
    normalizedUrlHash: urlHash,
    contentFingerprint,
    ingestTimestamp: new Date(),
    localityLevel: 'global',
    scopeReason: 'source_default',
    scopeConfidence: 0.1,
    topics: deriveTopics(item, category),
  };

  // --- Location context extraction ---
  // Scan the title and description for US state/city mentions so that
  // state-specific articles (e.g. "Florida Man …", "Austin, TX …") receive
  // proper locationTags instead of being treated as global/national content.
  const locationCtx = extractLocationContext(articleData.title, articleData.description);
  if (locationCtx) {
    articleData.locationTags = locationCtx.locationTags;
    articleData.localityLevel = locationCtx.localityLevel;
    articleData.scopeReason = locationCtx.scopeReason;
    articleData.scopeConfidence = locationCtx.scopeConfidence;
  }

  const scored = calculateViralScore(articleData, {});
  articleData.viralScore = scored.score;
  articleData.viralSignals = scored.signals;
  articleData.isPromoted = scored.isPromoted;
  articleData.lastScoredAt = new Date();

  try {
    await Article.create(articleData);
    return 'inserted';
  } catch (err) {
    if (err.code === 11000) return 'duplicate';
    throw err;
  }
}

/**
 * Ingest a single category by cycling through all of its configured feeds.
 */
async function ingestCategory(categoryKey) {
  const def = CATEGORY_FEEDS[categoryKey];
  if (!def) {
    console.warn(`[cat-ingest] Unknown category: ${categoryKey}`);
    return { categoryKey, error: 'unknown_category' };
  }

  const counts = { inserted: 0, duplicates: 0, errors: 0, fetched: 0, retagged: 0 };

  if (categoryKey === MARIJUANA_TOPIC) {
    try {
      counts.retagged = await retagExistingMarijuanaArticles();
    } catch (err) {
      counts.errors++;
      console.warn('[cat-ingest] Marijuana article retag failed:', err.message);
    }
  }

  for (const feed of def.feeds) {
    try {
      await sleep(MIN_DELAY_MS + Math.random() * MAX_JITTER_MS);
      const parsed = await parser.parseURL(feed.url);
      const items = parsed.items || [];
      counts.fetched += items.length;

      const momentumMap = createMomentumMap(
        items.map(i => ({ title: i.title || '', topics: [categoryKey] })),
        new Date()
      );

      for (const item of items) {
        try {
          // Add momentum map reference so viral score can use it
          const result = await persistItem(item, categoryKey, feed.name);
          if (result === 'inserted') counts.inserted++;
          else if (result === 'duplicate') counts.duplicates++;
        } catch (err) {
          counts.errors++;
        }
      }
    } catch (err) {
      counts.errors++;
      console.warn(`[cat-ingest] Feed fetch failed ${feed.name}:`, err.message);
    }
  }

  return { categoryKey, ...counts };
}

/**
 * Ingest all categories in the defined order.
 * Uses CATEGORY_ORDER to ensure consistent processing sequence.
 */
async function ingestAllCategories() {
  if (mongoose.connection?.readyState !== 1) {
    console.warn('[cat-ingest] DB not ready — skipping run');
    return;
  }

  const results = [];

  for (const key of CATEGORY_ORDER) {
    if (!CATEGORY_FEEDS[key]) continue;
    try {
      const result = await ingestCategory(key);
      results.push(result);
    } catch (err) {
      results.push({ categoryKey: key, error: err.message });
    }
  }

  return results;
}

module.exports = { ingestCategory, ingestAllCategories };
