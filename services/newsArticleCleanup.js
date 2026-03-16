'use strict';

/**
 * newsArticleCleanup.js
 *
 * Permanent background service that purges news articles (and related
 * ingestion records) older than RETENTION_DAYS on a daily schedule.
 *
 * The cleanup runs once immediately on startup to clear any backlog, then
 * repeats every 24 hours.  All operations are fire-and-forget from the
 * scheduler's perspective; errors are logged but never crash the process.
 */

const mongoose = require('mongoose');
const Article = require('../models/Article');
const NewsIngestionRecord = require('../models/NewsIngestionRecord');

const RETENTION_DAYS = parseInt(process.env.NEWS_RETENTION_DAYS || '7', 10);
const MIN_ALLOWED_ARTICLES = 1000;
const MAX_ARTICLES = Math.max(MIN_ALLOWED_ARTICLES, parseInt(process.env.NEWS_MAX_ARTICLES || '100000', 10));
const PRUNE_BATCH_SIZE = (() => {
  const configured = parseInt(process.env.NEWS_MAX_ARTICLES_PRUNE_BATCH || '100', 10);
  // Guardrail policy intentionally constrains pruning cadence to 50 or 100.
  if (configured === 50) return 50;
  return 100;
})();
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 h

/**
 * Delete articles and ingestion records older than RETENTION_DAYS.
 * Returns a summary object; never throws.
 */
async function purgeOldArticles() {
  if (mongoose.connection?.readyState !== 1) {
    console.warn('[newsCleanup] MongoDB not ready — skipping purge cycle');
    return { skipped: true };
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    const articleResult = await Article.deleteMany({
      $or: [
        { publishedAt: { $lt: cutoff } },
        { publishedAt: null, ingestTimestamp: { $lt: cutoff } },
        { publishedAt: { $exists: false }, ingestTimestamp: { $lt: cutoff } },
      ],
    });

    const recordResult = await NewsIngestionRecord.deleteMany({
      $or: [
        { scrapedAt: { $lt: cutoff } },
        { ingestedAt: { $lt: cutoff } },
        { 'dedupe.outcome': 'duplicate' },
      ],
    });

    const totalArticles = await Article.countDocuments({});
    let prunedForCap = 0;
    if (totalArticles > MAX_ARTICLES) {
      const overflow = totalArticles - MAX_ARTICLES;
      const pruneCount = Math.min(overflow, PRUNE_BATCH_SIZE);
      const oldest = await Article.find({})
        .sort({ publishedAt: 1, ingestTimestamp: 1, createdAt: 1, _id: 1 })
        .limit(pruneCount)
        .select('_id')
        .lean();

      if (oldest.length > 0) {
        const idsToDelete = oldest.map((doc) => doc._id);
        const pruneResult = await Article.deleteMany({ _id: { $in: idsToDelete } });
        prunedForCap = pruneResult.deletedCount || 0;
      }
    }

    const summary = {
      retentionDays: RETENTION_DAYS,
      cutoff: cutoff.toISOString(),
      maxArticles: MAX_ARTICLES,
      pruneBatchSize: PRUNE_BATCH_SIZE,
      articlesDeleted: articleResult.deletedCount || 0,
      articlesPrunedForCap: prunedForCap,
      ingestionRecordsDeleted: recordResult.deletedCount || 0,
      ranAt: new Date().toISOString(),
    };

    console.log(
      `[newsCleanup] Purged ${summary.articlesDeleted} articles, pruned ${summary.articlesPrunedForCap} for cap, and ` +
        `${summary.ingestionRecordsDeleted} ingestion records ` +
        `(cutoff: ${summary.cutoff})`
    );

    return summary;
  } catch (err) {
    console.error('[newsCleanup] Error during purge:', err.message);
    return { error: err.message, cutoff: cutoff.toISOString(), ranAt: new Date().toISOString() };
  }
}

/**
 * Start the recurring cleanup scheduler.
 * Safe to call multiple times — only registers once due to module cache.
 */
let _started = false;

function startArticleCleanupScheduler() {
  if (_started) return;
  _started = true;

  console.log(
    `[newsCleanup] Scheduler started — retention: ${RETENTION_DAYS} days, ` +
      `interval: every 24 h`
  );

  // Run an initial pass after a short delay so the DB connection is fully up.
  setTimeout(() => {
    purgeOldArticles().catch((err) =>
      console.error('[newsCleanup] Initial purge failed:', err.message)
    );
  }, 30 * 1000); // 30 s after startup

  setInterval(() => {
    purgeOldArticles().catch((err) =>
      console.error('[newsCleanup] Scheduled purge failed:', err.message)
    );
  }, CLEANUP_INTERVAL_MS);
}

module.exports = { purgeOldArticles, startArticleCleanupScheduler };
