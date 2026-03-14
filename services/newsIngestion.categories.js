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

const parser = new Parser({ timeout: 14000, headers: { 'User-Agent': 'SocialSecure-NewsBot/1.0' } });

const MIN_DELAY_MS = 900;   // min ms between requests
const MAX_JITTER_MS = 300;  // additional random jitter

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractImageUrl(item) {
  if (item['media:content']?.$.url) return item['media:content'].$.url;
  if (item.enclosure?.url) return item.enclosure.url;
  if (item['media:thumbnail']?.$.url) return item['media:thumbnail'].$.url;
  const html = item['content:encoded'] || item.content || '';
  const match = html.match(/<img[^>]+src="([^"]+)"/i);
  return match ? match[1] : null;
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
  if (existing) return 'duplicate';

  const articleData = {
    title: (item.title || '').trim(),
    description: (item.contentSnippet || item.summary || '').trim().substring(0, 1000),
    source: item.creator || item.author || feedSource,
    url,
    imageUrl: extractImageUrl(item),
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
  };

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

  const counts = { inserted: 0, duplicates: 0, errors: 0, fetched: 0 };

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
          console.error(`[cat-ingest] ${categoryKey}/${feed.name} item error:`, err.message);
        }
      }
    } catch (err) {
      counts.errors++;
      console.warn(`[cat-ingest] Feed fetch failed ${feed.name}:`, err.message);
    }
  }

  console.log(
    `[cat-ingest] ${categoryKey}: ${counts.inserted} inserted, ` +
    `${counts.duplicates} dups, ${counts.errors} errors (${counts.fetched} fetched)`
  );
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
  const started = Date.now();

  for (const key of CATEGORY_ORDER) {
    if (!CATEGORY_FEEDS[key]) continue;
    try {
      const result = await ingestCategory(key);
      results.push(result);
    } catch (err) {
      console.error(`[cat-ingest] Unhandled error for ${key}:`, err.message);
      results.push({ categoryKey: key, error: err.message });
    }
  }

  const totalInserted = results.reduce((s, r) => s + (r.inserted || 0), 0);
  const totalDupes = results.reduce((s, r) => s + (r.duplicates || 0), 0);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(
    `[cat-ingest] Complete: ${totalInserted} inserted, ${totalDupes} dupex across ` +
    `${results.length} categories in ${elapsed}s`
  );

  return results;
}

module.exports = { ingestCategory, ingestAllCategories };
