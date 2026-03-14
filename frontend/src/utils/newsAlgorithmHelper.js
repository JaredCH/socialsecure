/**
 * newsAlgorithmHelper.js
 *
 * Deterministic feed ordering algorithm for the algorithmic news feed.
 *
 * Slots 1–10:
 *   • 5 slots for LOCAL articles (city-level, _tier === 'local')
 *   • 5 slots spread across 5 randomly chosen categories (1 each)
 *   • Result is interleaved so articles are never grouped by tier
 *
 * Slots 11–30 (all-categories coverage):
 *   • Every active category appears at least twice
 *   • No two adjacent articles share the same category
 *   • Within a category, sorted by viralScore desc
 *
 * Slots 31+ (groups of 5):
 *   • Pick next category from a shuffled exhaustion queue
 *   • Show up to 5 articles for that category
 *   • After all categories are exhausted, re-shuffle and repeat
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
  const categoryKeys = categories.map((c) => c.key).filter(Boolean);
  const seen = new Set();

  const addSeen = (a) => { seen.add(String(a._id)); return a; };
  const notSeen = (a) => !seen.has(String(a._id));

  // ── 0. Keyword-promoted articles (always first) ───────────────────────────
  const keywordArticles = (sections.keyword || [])
    .filter(notSeen)
    .map((a) => addSeen({ ...a, _displayTier: 'keyword' }));

  // ── 1. Build pool maps by category ───────────────────────────────────────
  // All feed articles organised by category (for coverage algo)
  const byCategory = {};
  for (const cat of categoryKeys) byCategory[cat] = [];

  const allFeed = [
    ...(sections.local || []),
    ...(sections.state || []),
    ...(sections.national || []),
    ...(sections.trending || []),
    ...feed,
  ];

  for (const art of allFeed) {
    if (seen.has(String(art._id))) continue;
    const cat = art.category || 'general';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(art);
  }
  // Sort each category pool by viralScore desc
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
  }

  // ── 2. Slots 1–10: 5 local + 5 from 5 random categories ─────────────────
  const localPool = (sections.local || []).filter(notSeen);
  const localSlots = localPool.slice(0, 5).map(addSeen).map((a) => ({ ...a, _displayTier: 'local' }));

  // Pick 5 random non-exhausted categories for the other 5 slots
  const shuffledCats = shuffle(categoryKeys).filter((k) => (byCategory[k] || []).length > 0);
  const pickedCats = shuffledCats.slice(0, 5);
  const categorySlots = pickedCats.map((cat) => {
    const art = byCategory[cat].find(notSeen);
    if (!art) return null;
    addSeen(art);
    return { ...art, _displayTier: 'category' };
  }).filter(Boolean);

  // Interleave: local[0], cat[0], local[1], cat[1], ...
  const first10 = [];
  const maxFirst = Math.max(localSlots.length, categorySlots.length);
  for (let i = 0; i < maxFirst; i++) {
    if (localSlots[i]) first10.push(localSlots[i]);
    if (categorySlots[i]) first10.push(categorySlots[i]);
  }

  // ── 3. Slots 11–30: every category ≥2×, no adjacent same-category ────────
  const coverage = [];
  // Two passes ensure ≥2× per category
  for (let pass = 0; pass < 2; pass++) {
    for (const cat of shuffle(categoryKeys)) {
      const art = (byCategory[cat] || []).find(notSeen);
      if (!art) continue;
      addSeen(art);
      coverage.push({ ...art, _displayTier: 'coverage' });
    }
  }

  // Reorder coverage: no two adjacent with same category
  const noDupeAdjacentCoverage = [];
  const coverageQueue = [...coverage];
  while (coverageQueue.length > 0) {
    const lastCat = noDupeAdjacentCoverage.length > 0
      ? noDupeAdjacentCoverage[noDupeAdjacentCoverage.length - 1].category
      : null;
    // Find first article with different category
    const idx = coverageQueue.findIndex((a) => a.category !== lastCat);
    if (idx === -1) {
      // All remaining are same category — just append
      noDupeAdjacentCoverage.push(...coverageQueue.splice(0));
    } else {
      noDupeAdjacentCoverage.push(...coverageQueue.splice(idx, 1));
    }
  }

  // ── 4. Slots 31+: groups of 5 by exhaustion-queue ────────────────────────
  const exhaustQueue = buildCategoryExhaustQueue(categoryKeys);
  const groupsOf5 = [];
  // We'll generate up to 10 groups from the remaining pool for initial render
  for (let g = 0; g < 10; g++) {
    let cat = exhaustQueue.next();
    // Skip if pool is empty; find next non-empty
    let attempts = 0;
    while ((byCategory[cat] || []).filter(notSeen).length === 0 && attempts < categoryKeys.length) {
      cat = exhaustQueue.next();
      attempts++;
    }
    const pool = (byCategory[cat] || []).filter(notSeen);
    if (pool.length === 0) break;
    const group = pool.slice(0, 5).map(addSeen).map((a) => ({ ...a, _displayTier: 'group' }));
    groupsOf5.push(...group);
  }

  return [
    ...keywordArticles,
    ...first10,
    ...noDupeAdjacentCoverage,
    ...groupsOf5,
  ];
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
  const categoryKeys = categories.map((c) => c.key).filter(Boolean);
  const seen = new Set(alreadySeen);
  const notSeen = (a) => !seen.has(String(a._id));

  const byCategory = {};
  for (const cat of categoryKeys) byCategory[cat] = [];
  for (const art of newFeedArticles) {
    if (seen.has(String(art._id))) continue;
    const cat = art.category || 'general';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(art);
  }
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
  }

  const exhaustQueue = buildCategoryExhaustQueue(categoryKeys);
  const result = [];
  let attempts = 0;

  while (attempts < categoryKeys.length * 2) {
    const cat = exhaustQueue.next();
    const pool = (byCategory[cat] || []).filter(notSeen);
    if (pool.length === 0) { attempts++; continue; }
    pool.slice(0, 5).forEach((a) => {
      seen.add(String(a._id));
      result.push({ ...a, _displayTier: 'group' });
    });
    if (result.length >= newFeedArticles.length) break;
    attempts = 0;
  }

  // Fallback: anything not yet shown
  for (const art of newFeedArticles) {
    if (!seen.has(String(art._id))) result.push({ ...art, _displayTier: 'feed' });
  }

  return result;
}
