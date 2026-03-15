/**
 * newsAlgorithmHelper.js
 *
 * Feed ordering favors recency first, then adds modest boosts for articles
 * that should surface near the top: followed-keyword matches, local items,
 * and breaking coverage. The result stays deterministic and keeps category
 * filtered feeds populated instead of over-optimizing for cross-category mix.
 */

// ─── Fisher-Yates shuffle ────────────────────────────────────────────────────
function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeCategoryKeys(categories = []) {
  return categories
    .map((category) => {
      if (!category) return null;
      return typeof category === 'string' ? category : category.key;
    })
    .filter(Boolean);
}

function getPublishedTimestamp(article) {
  const timestamp = article?.publishedAt ? new Date(article.publishedAt).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getUrgencyBoost(article) {
  const urgency = Number(article?.viralSignals?.urgencyTerms || 0);
  return Number.isFinite(urgency) ? urgency : 0;
}

function getPriorityBoost(article) {
  let boost = 0;

  if (article?._tier === 'keyword') boost += 6 * 60 * 60 * 1000;
  if (article?._tier === 'local' || article?.pipeline === 'local') boost += 3 * 60 * 60 * 1000;
  if (article?._tier === 'state') boost += 90 * 60 * 1000;
  if (article?._tier === 'national') boost += 60 * 60 * 1000;
  if (article?._tier === 'trending') boost += 45 * 60 * 1000;

  if (article?.category === 'breaking') boost += 2 * 60 * 60 * 1000;
  if ((article?.localityLevel === 'city' || article?.localityLevel === 'county') && article?._tier !== 'local') {
    boost += 75 * 60 * 1000;
  }

  boost += Math.min(getUrgencyBoost(article), 100) * 90 * 1000;
  boost += Math.min(Number(article?.viralScore || 0), 100) * 60 * 1000;

  return boost;
}

function rankArticles(left, right) {
  const leftScore = getPublishedTimestamp(left) + getPriorityBoost(left);
  const rightScore = getPublishedTimestamp(right) + getPriorityBoost(right);

  if (rightScore !== leftScore) return rightScore - leftScore;

  const publishedDiff = getPublishedTimestamp(right) - getPublishedTimestamp(left);
  if (publishedDiff !== 0) return publishedDiff;

  const viralDiff = Number(right?.viralScore || 0) - Number(left?.viralScore || 0);
  if (viralDiff !== 0) return viralDiff;

  return String(right?._id || '').localeCompare(String(left?._id || ''));
}

function dedupeArticles(articles = []) {
  const seen = new Set();

  return articles.filter((article) => {
    const key = String(article?._id || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function annotateArticles(articles = [], fallbackTier = 'feed') {
  return articles.map((article) => ({
    ...article,
    _displayTier: article?._tier || fallbackTier,
  }));
}

// ─── Exhaust-before-repeat queue ─────────────────────────────────────────────
export function buildCategoryExhaustQueue(categoryKeys) {
  let queue = shuffle([...categoryKeys]);
  let pos = 0;

  return {
    next() {
      if (pos >= queue.length) {
        queue = shuffle([...categoryKeys]);
        pos = 0;
      }
      return queue[pos++];
    },
    reset() {
      queue = shuffle([...categoryKeys]);
      pos = 0;
    },
  };
}

// ─── Dedup helper ────────────────────────────────────────────────────────────
function makeSeenSet(articles) {
  const ids = new Set();
  articles.forEach((a) => ids.add(String(a._id)));
  return ids;
}

/**
 * Build the full ordered sequence for the initial load.
 *
 * @param {object} sections   — API response sections: { keyword, local, state, national, trending }
 * @param {Array}  feed       — API response feed array (remaining non-tiered articles)
 * @param {Array}  categories — full list of category objects [{ key, label }]
 * @returns {Array} ordered articles with a `_displayTier` field
 */
export function buildAlgorithmicSequence(sections = {}, feed = [], categories = []) {
  const categoryKeys = new Set(normalizeCategoryKeys(categories));
  const combined = dedupeArticles([
    ...(sections.keyword || []),
    ...(sections.local || []),
    ...(sections.state || []),
    ...(sections.national || []),
    ...(sections.trending || []),
    ...feed,
  ]);

  const filtered = combined.filter((article) => {
    if (!categoryKeys.size) return true;
    return !article?.category || categoryKeys.has(article.category) || article.category === 'general';
  });

  return annotateArticles(filtered).sort(rankArticles);
}

/**
 * Build a groups-of-5 extension for infinite scroll pages.
 * Called for page 2+ when we receive more feed articles from the API.
 *
 * @param {Array}  newFeedArticles  — new articles from API (page N)
 * @param {Array}  categories       — full category list
 * @param {Set}    [alreadySeen]    — Set of article ID strings already rendered
 * @returns {Array} ordered articles
 */
export function buildInfiniteScrollBatch(newFeedArticles = [], categories = [], alreadySeen = new Set()) {
  const categoryKeys = new Set(normalizeCategoryKeys(categories));

  return annotateArticles(
    dedupeArticles(newFeedArticles).filter((article) => {
      const articleId = String(article?._id || '');
      if (!articleId || alreadySeen.has(articleId)) return false;
      if (!categoryKeys.size) return true;
      return !article?.category || categoryKeys.has(article.category) || article.category === 'general';
    })
  ).sort(rankArticles);
}
