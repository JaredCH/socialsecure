'use strict';

const TIER_PRIORITY = { local: 3, state: 2, national: 1 };

function normalizeTitle(title) {
  return String(title || '')
    .replace(/\s*[-–—|]\s*[A-Z][A-Za-z0-9\s.&']+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickPreferredArticle(current, candidate) {
  if (!current) return candidate;
  const currentPriority = TIER_PRIORITY[current.tier] || 0;
  const candidatePriority = TIER_PRIORITY[candidate.tier] || 0;
  if (candidatePriority !== currentPriority) {
    return candidatePriority > currentPriority ? candidate : current;
  }

  const currentPublished = current.publishedAt ? new Date(current.publishedAt).getTime() : 0;
  const candidatePublished = candidate.publishedAt ? new Date(candidate.publishedAt).getTime() : 0;
  return candidatePublished > currentPublished ? candidate : current;
}

function deduplicateArticles(articles = []) {
  const seen = new Map();

  for (const article of articles) {
    const normalizedTitle = normalizeTitle(article?.title);
    const key = normalizedTitle || String(article?.link || article?.title || '').trim().toLowerCase();
    if (!key) continue;

    const candidate = {
      ...article,
      normalizedTitle: normalizedTitle || key
    };

    const preferred = pickPreferredArticle(seen.get(key), candidate);
    seen.set(key, preferred);
  }

  return Array.from(seen.values()).sort((left, right) => {
    const leftPriority = TIER_PRIORITY[left.tier] || 0;
    const rightPriority = TIER_PRIORITY[right.tier] || 0;
    if (rightPriority !== leftPriority) return rightPriority - leftPriority;
    const leftPublished = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
    const rightPublished = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
    return rightPublished - leftPublished;
  });
}

module.exports = {
  normalizeTitle,
  deduplicateArticles,
  TIER_PRIORITY
};
