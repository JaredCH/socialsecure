'use strict';

/**
 * scripts/newsWordFrequency.js
 *
 * Analyses all news articles stored in MongoDB and prints a report of the top
 * word/phrase combinations by occurrence count.
 *
 * Usage:
 *   MONGODB_URI=mongodb://… node scripts/newsWordFrequency.js
 *
 * The script produces a table of the top 400 entries.  It first tries to find
 * as many 2-word (bigram) combinations as possible, then fills remaining slots
 * with single-word (unigram) counts.
 *
 * Common English stopwords are excluded from the analysis.
 */

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/socialsecure';
const TARGET_COUNT = 400;

// ── Stopwords ────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'also', 'am',
  'an', 'and', 'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before',
  'being', 'between', 'both', 'but', 'by', 'can', 'could', 'did', 'do',
  'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further',
  'get', 'gets', 'got', 'had', 'has', 'have', 'having', 'he', 'her', 'here',
  'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'itself', 'just', 'know', 'let', 'like', 'make', 'me',
  'might', 'more', 'most', 'my', 'myself', 'new', 'no', 'nor', 'not', 'now',
  'of', 'off', 'on', 'once', 'one', 'only', 'or', 'other', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'per', 'really', 's', 'same', 'say',
  'says', 'shall', 'she', 'should', 'so', 'some', 'still', 'such', 't',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under',
  'until', 'up', 'us', 'very', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would', 'you',
  'your', 'yours', 'yourself', 'yourselves', '--', '-', '—', '|', '/', '·',
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9' -]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function countBigrams(tokens, map) {
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]} ${tokens[i + 1]}`;
    map.set(bigram, (map.get(bigram) || 0) + 1);
  }
}

function countUnigrams(tokens, map) {
  for (const token of tokens) {
    map.set(token, (map.get(token) || 0) + 1);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`Connecting to ${MONGODB_URI.replace(/\/\/[^@]+@/, '//<hidden>@')} …`);
  await mongoose.connect(MONGODB_URI);
  const Article = require('../models/Article');

  const cursor = Article.find({}, { title: 1, description: 1 }).lean().cursor();

  const bigramMap = new Map();
  const unigramMap = new Map();
  let articleCount = 0;

  for await (const doc of cursor) {
    articleCount++;
    const text = `${doc.title || ''} ${doc.description || ''}`;
    const tokens = tokenize(text);
    countBigrams(tokens, bigramMap);
    countUnigrams(tokens, unigramMap);
    if (articleCount % 5000 === 0) process.stdout.write(`\r  Processed ${articleCount} articles…`);
  }

  console.log(`\n  Total articles analysed: ${articleCount}\n`);

  // Sort bigrams descending by count
  const sortedBigrams = [...bigramMap.entries()]
    .sort((a, b) => b[1] - a[1]);

  // Sort unigrams descending by count (exclude any that appear in bigrams)
  const bigramWordsUsed = new Set();
  const sortedUnigrams = [...unigramMap.entries()]
    .sort((a, b) => b[1] - a[1]);

  // Fill the report: prefer bigrams, then pad with unigrams
  const report = [];
  const usedPhrases = new Set();

  for (const [phrase, count] of sortedBigrams) {
    if (report.length >= TARGET_COUNT) break;
    report.push({ phrase, count, type: 'bigram' });
    usedPhrases.add(phrase);
    phrase.split(' ').forEach((w) => bigramWordsUsed.add(w));
  }

  if (report.length < TARGET_COUNT) {
    for (const [word, count] of sortedUnigrams) {
      if (report.length >= TARGET_COUNT) break;
      if (usedPhrases.has(word)) continue;
      report.push({ phrase: word, count, type: 'unigram' });
    }
  }

  // Print the table
  const pad = (s, n) => String(s).padEnd(n);
  const padN = (s, n) => String(s).padStart(n);
  console.log(`${'#'.padStart(4)}  ${pad('Phrase', 40)} ${padN('Count', 8)}  Type`);
  console.log('-'.repeat(64));
  report.forEach((r, i) => {
    console.log(`${String(i + 1).padStart(4)}  ${pad(r.phrase, 40)} ${padN(r.count, 8)}  ${r.type}`);
  });

  console.log(`\nTotal entries: ${report.length}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
