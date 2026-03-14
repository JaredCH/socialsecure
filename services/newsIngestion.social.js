'use strict';

/**
 * newsIngestion.social.js
 *
 * Pipeline 4 — Reddit Social Monitoring
 *
 * Polls Reddit's public JSON API for hot posts in user-configured subreddits.
 * Filters posts by the user-set minimum upvote threshold.
 * No API key required — uses the public unauthenticated JSON endpoint.
 *
 * Schedule: every 30 minutes via server.js
 */

const https = require('https');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const NewsPreferences = require('../models/NewsPreferences');
const { calculateViralScore } = require('./newsViralScore');

const REDDIT_USER_AGENT = 'SocialSecure-NewsBot/1.0 (aggregator; no auth)';
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Fetch hot posts from a subreddit using Reddit's public JSON API.
 * Returns an array of Reddit post objects or throws on error.
 */
function fetchRedditHot(subreddit, limit = 100) {
  return new Promise((resolve, reject) => {
    const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=${limit}&t=day`;
    const options = {
      headers: {
        'User-Agent': REDDIT_USER_AGENT,
        'Accept': 'application/json',
      },
    };

    const req = https.get(url, options, (res) => {
      if (res.statusCode === 429) {
        reject(new Error('Reddit rate limited (429)'));
        return;
      }
      if (res.statusCode === 403 || res.statusCode === 404) {
        reject(new Error(`Subreddit unavailable: ${res.statusCode}`));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Reddit API returned ${res.statusCode}`));
        return;
      }

      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const posts = (data?.data?.children || []).map(c => c.data);
          resolve(posts);
        } catch (parseErr) {
          reject(new Error('Reddit JSON parse error: ' + parseErr.message));
        }
      });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error('Reddit request timed out'));
    });

    req.on('error', reject);
  });
}

/**
 * Persist a Reddit post as an Article.
 * Returns 'inserted', 'skipped', or 'duplicate'.
 */
async function persistRedditPost(post, subreddit) {
  // Only persist link posts with an external URL, or text posts
  const url = post.url || `https://www.reddit.com${post.permalink}`;

  const urlHash = crypto
    .createHash('sha256')
    .update(url.toLowerCase().trim())
    .digest('hex')
    .substring(0, 16);

  const existing = await Article.findOne({ normalizedUrlHash: urlHash }).lean();
  if (existing) return 'duplicate';

  // Use post thumbnail as image if it's a real URL
  const imageUrl =
    (post.thumbnail && post.thumbnail.startsWith('http')) ? post.thumbnail :
    (post.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&')) || null;

  const title = (post.title || '').trim();
  const description = (post.selftext || '').trim().substring(0, 800);
  const publishedAt = post.created_utc ? new Date(post.created_utc * 1000) : new Date();

  const articleData = {
    title,
    description,
    source: `r/${post.subreddit || subreddit}`,
    url,
    imageUrl,
    publishedAt,
    category: 'general',
    pipeline: 'social',
    sourceType: 'reddit',
    subreddit: (post.subreddit || subreddit).toLowerCase(),
    redditScore: post.score || 0,
    feedSource: `reddit-${subreddit.toLowerCase()}`,
    normalizedUrlHash: urlHash,
    ingestTimestamp: new Date(),
    localityLevel: 'global',
    scopeReason: 'source_default',
    scopeConfidence: 0.1,
  };

  const scored = calculateViralScore(articleData, {});
  articleData.viralScore = scored.score;
  articleData.viralSignals = scored.signals;
  articleData.isPromoted = scored.isPromoted;

  try {
    await Article.create(articleData);
    return 'inserted';
  } catch (err) {
    if (err.code === 11000) return 'duplicate';
    throw err;
  }
}

/**
 * Ingest a single subreddit — fetch hot posts, filter by minUpvotes, persist.
 */
async function ingestSubreddit(subreddit, minUpvotes = 100) {
  let posts = [];
  try {
    posts = await fetchRedditHot(subreddit, 100);
  } catch (err) {
    console.warn(`[social-ingest] r/${subreddit} fetch error:`, err.message);
    return { subreddit, error: err.message, inserted: 0 };
  }

  const filtered = posts.filter(p => (p.score || 0) >= minUpvotes && !p.stickied);
  let inserted = 0;
  let duplicates = 0;

  for (const post of filtered) {
    try {
      const result = await persistRedditPost(post, subreddit);
      if (result === 'inserted') inserted++;
      else duplicates++;
    } catch (err) {
      console.error(`[social-ingest] r/${subreddit} post persist error:`, err.message);
    }
  }

  console.log(
    `[social-ingest] r/${subreddit}: ${inserted} inserted, ${duplicates} dups ` +
    `(${filtered.length} passed threshold of ${minUpvotes} upvotes from ${posts.length} fetched)`
  );

  return { subreddit, inserted, duplicates, fetched: posts.length, passed: filtered.length };
}

/**
 * Ingest all subreddits that any user is currently monitoring.
 * Deduplicates so the same subreddit (even across users) is only fetched once,
 * using the LOWEST minUpvotes threshold among all users monitoring it.
 */
async function ingestAllMonitoredSubreddits() {
  if (mongoose.connection?.readyState !== 1) {
    console.warn('[social-ingest] DB not ready — skipping run');
    return;
  }

  const prefDocs = await NewsPreferences.find(
    { 'redditMonitors.0': { $exists: true } },
    { redditMonitors: 1 }
  ).lean();

  // Build deduplicated map: subreddit → min(minUpvotes)
  const monitorMap = new Map();
  for (const doc of prefDocs) {
    for (const monitor of (doc.redditMonitors || [])) {
      if (!monitor.enabled || !monitor.subreddit) continue;
      const sub = monitor.subreddit.toLowerCase();
      const current = monitorMap.get(sub);
      const threshold = typeof monitor.minUpvotes === 'number' ? monitor.minUpvotes : 100;
      if (current === undefined || threshold < current) {
        monitorMap.set(sub, threshold);
      }
    }
  }

  if (!monitorMap.size) {
    console.log('[social-ingest] No monitored subreddits — skipping');
    return [];
  }

  console.log(`[social-ingest] Ingesting ${monitorMap.size} subreddit(s)`);
  const results = [];

  for (const [subreddit, minUpvotes] of monitorMap.entries()) {
    try {
      const result = await ingestSubreddit(subreddit, minUpvotes);
      results.push(result);
      // Respectful delay between requests (Reddit is rate-limit sensitive)
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
    } catch (err) {
      console.error(`[social-ingest] Error for r/${subreddit}:`, err.message);
      results.push({ subreddit, error: err.message });
    }
  }

  const totalInserted = results.reduce((s, r) => s + (r.inserted || 0), 0);
  console.log(`[social-ingest] Complete: ${totalInserted} inserted across ${monitorMap.size} subreddits`);

  return results;
}

module.exports = {
  ingestSubreddit,
  ingestAllMonitoredSubreddits,
};
