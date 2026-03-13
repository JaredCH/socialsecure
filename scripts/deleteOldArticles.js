#!/usr/bin/env node
/**
 * One-time cleanup script: delete all news articles with a publish date older
 * than 7 days (and ingestion records older than the same threshold).
 *
 * Usage:
 *   node scripts/deleteOldArticles.js
 *
 * The script reads MONGODB_URI (or MONGO_URL / MONGO_PUBLIC_URL) from the
 * environment or a local .env file, performs the deletion, then exits.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const Article = require('../models/Article');
const NewsIngestionRecord = require('../models/NewsIngestionRecord');

const CUTOFF_DAYS = 7;

async function main() {
  const mongoUri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URL ||
    process.env.MONGO_PUBLIC_URL ||
    'mongodb://localhost:27017/socialmedia';

  console.log('[deleteOldArticles] Connecting to MongoDB…');
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('[deleteOldArticles] Connected');

  const cutoff = new Date(Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000);
  console.log(`[deleteOldArticles] Cutoff date: ${cutoff.toISOString()} (${CUTOFF_DAYS} days ago)`);

  // Delete articles whose publishedAt is before the cutoff, or where
  // publishedAt is absent but ingestTimestamp is before the cutoff.
  const articleResult = await Article.deleteMany({
    $or: [
      { publishedAt: { $lt: cutoff } },
      { publishedAt: null, ingestTimestamp: { $lt: cutoff } },
      { publishedAt: { $exists: false }, ingestTimestamp: { $lt: cutoff } },
    ],
  });

  console.log(`[deleteOldArticles] Articles deleted: ${articleResult.deletedCount}`);

  // Also purge stale ingestion records to keep the observability table lean.
  const recordResult = await NewsIngestionRecord.deleteMany({
    $or: [
      { scrapedAt: { $lt: cutoff } },
      { ingestedAt: { $lt: cutoff } },
      { 'dedupe.outcome': 'duplicate' },
    ],
  });

  console.log(`[deleteOldArticles] Ingestion records deleted: ${recordResult.deletedCount}`);

  await mongoose.disconnect();
  console.log('[deleteOldArticles] Done.');
}

main().catch((err) => {
  console.error('[deleteOldArticles] Fatal error:', err);
  process.exit(1);
});
