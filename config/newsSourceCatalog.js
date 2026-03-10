/**
 * News Source Catalog
 *
 * Canonical list of all intended news sources for the control panel.
 * Includes sources that are wired (have adapters) and planned/unwired sources.
 * Each entry carries enough metadata for the control panel UI and health computation.
 */

const NEWS_SOURCE_CATALOG = [
  {
    id: 'google-news',
    name: 'Google News',
    url: 'https://news.google.com/rss',
    hostPatterns: ['news.google.com'],
    categories: ['Top Stories', 'World', 'Business', 'Technology', 'Science', 'Health', 'Entertainment', 'Sports'],
    sourceType: 'googleNews',
    hasAdapter: true,
    priority: 10
  },
  {
    id: 'reuters',
    name: 'Reuters',
    url: 'https://www.reuters.com',
    hostPatterns: ['reuters.com', 'reutersagency.com'],
    categories: ['World', 'Business', 'Technology'],
    sourceType: 'rss',
    hasAdapter: true,
    priority: 9
  },
  {
    id: 'bbc',
    name: 'BBC News',
    url: 'https://feeds.bbci.co.uk/news/rss.xml',
    hostPatterns: ['bbc.co.uk', 'bbc.com', 'bbci.co.uk'],
    categories: ['World', 'Business', 'Technology', 'Science', 'Health', 'Entertainment'],
    sourceType: 'bbc',
    hasAdapter: true,
    priority: 9
  },
  {
    id: 'npr',
    name: 'NPR',
    url: 'https://feeds.npr.org/1001/rss.xml',
    hostPatterns: ['npr.org'],
    categories: ['US', 'World', 'Business', 'Science', 'Health'],
    sourceType: 'npr',
    hasAdapter: true,
    priority: 8
  },
  {
    id: 'associated-press',
    name: 'Associated Press',
    url: 'https://apnews.com',
    hostPatterns: ['apnews.com'],
    categories: ['Top Stories', 'World', 'Politics', 'Business'],
    sourceType: 'rss',
    hasAdapter: true,
    priority: 8
  },
  {
    id: 'pbs',
    name: 'PBS NewsHour',
    url: 'https://www.pbs.org/newshour',
    hostPatterns: ['pbs.org'],
    categories: ['Politics', 'World', 'Science', 'Health'],
    sourceType: 'rss',
    hasAdapter: true,
    priority: 7
  },
  {
    id: 'cnn',
    name: 'CNN',
    url: 'https://www.cnn.com',
    hostPatterns: ['cnn.com'],
    categories: ['Top Stories', 'World', 'Politics', 'Business', 'Technology', 'Health', 'Entertainment'],
    sourceType: 'rss',
    hasAdapter: true,
    priority: 7
  },
  {
    id: 'guardian',
    name: 'The Guardian',
    url: 'https://www.theguardian.com',
    hostPatterns: ['theguardian.com'],
    categories: ['World', 'Politics', 'Business', 'Technology', 'Science'],
    sourceType: 'rss',
    hasAdapter: true,
    priority: 6
  },
  {
    id: 'new-york-times',
    name: 'New York Times',
    url: 'https://www.nytimes.com',
    hostPatterns: ['nytimes.com'],
    categories: ['World', 'Politics', 'Business', 'Technology', 'Science'],
    sourceType: 'rss',
    hasAdapter: true,
    priority: 6
  },
  {
    id: 'wall-street-journal',
    name: 'Wall Street Journal',
    url: 'https://www.wsj.com',
    hostPatterns: ['wsj.com'],
    categories: ['Business', 'Finance', 'Technology'],
    sourceType: 'rss',
    hasAdapter: true,
    priority: 6
  },
  {
    id: 'techcrunch',
    name: 'TechCrunch',
    url: 'https://techcrunch.com',
    hostPatterns: ['techcrunch.com'],
    categories: ['Technology', 'Business'],
    sourceType: 'rss',
    hasAdapter: true,
    priority: 5
  },
  {
    id: 'yahoo-news',
    name: 'Yahoo News',
    url: 'https://news.yahoo.com',
    hostPatterns: ['news.yahoo.com', 'sports.yahoo.com'],
    categories: ['Top Stories', 'World', 'Politics', 'Business', 'Technology', 'Entertainment', 'Sports', 'Health', 'Science'],
    sourceType: 'rss',
    hasAdapter: true,
    priority: 7
  },
  {
    id: 'espn',
    name: 'ESPN',
    url: 'https://www.espn.com',
    hostPatterns: ['espn.com'],
    categories: ['Sports'],
    sourceType: 'rss',
    hasAdapter: true,
    priority: 6
  },
  {
    id: 'gdelt',
    name: 'GDELT Project',
    url: 'https://api.gdeltproject.org',
    hostPatterns: ['gdeltproject.org'],
    categories: ['World', 'Politics'],
    sourceType: 'gdelt',
    hasAdapter: true,
    envGated: 'GDELT_ENABLED',
    priority: 5
  }
];

const CATALOG_VERSION = 2;

/**
 * Freshness window for health classification (24 hours in ms).
 */
const HEALTH_FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Error count threshold for red health status.
 */
const HEALTH_ERROR_THRESHOLD = 3;

/**
 * Compute deterministic health classification for a source.
 *
 * @param {Object} params
 * @param {boolean} params.wired - Whether the source is wired (has adapter + DB row)
 * @param {boolean} params.enabled - Whether the source is enabled
 * @param {string|null} params.lastFetchStatus - 'success' | 'error' | 'pending' | null
 * @param {Date|string|null} params.lastFetchAt - Timestamp of last fetch
 * @param {number} params.fetchCount - Total fetch count
 * @param {number} params.errorCount - Total error count
 * @param {string} params.wiringState - 'wired' | 'catalog_only' | 'disabled_by_env'
 * @param {Date} [params.now] - Current time (for testing)
 * @returns {{ health: string, healthReason: string }}
 */
function computeSourceHealth({
  wired,
  enabled,
  lastFetchStatus,
  lastFetchAt,
  fetchCount = 0,
  errorCount = 0,
  wiringState,
  now = new Date()
} = {}) {
  // Disabled by environment variable → yellow
  if (wiringState === 'disabled_by_env') {
    return { health: 'yellow', healthReason: 'disabled_by_env' };
  }

  // Not wired or catalog-only → yellow
  if (!wired || wiringState === 'catalog_only') {
    return { health: 'yellow', healthReason: 'not_wired' };
  }

  // Source intentionally disabled → yellow
  if (!enabled) {
    return { health: 'yellow', healthReason: 'disabled' };
  }

  // Red: last fetch failed and recent failures are significant
  if (lastFetchStatus === 'error') {
    if (errorCount >= HEALTH_ERROR_THRESHOLD) {
      return { health: 'red', healthReason: 'error_threshold_exceeded' };
    }
    return { health: 'red', healthReason: 'last_fetch_error' };
  }

  // Never fetched or pending → yellow
  if (!lastFetchStatus || lastFetchStatus === 'pending' || fetchCount === 0) {
    return { health: 'yellow', healthReason: 'never_fetched' };
  }

  // Check freshness
  const lastFetchTime = lastFetchAt ? new Date(lastFetchAt).getTime() : 0;
  const elapsed = now.getTime() - lastFetchTime;

  if (lastFetchStatus === 'success') {
    if (elapsed <= HEALTH_FRESHNESS_WINDOW_MS) {
      return { health: 'green', healthReason: 'last_fetch_success_recent' };
    }
    return { health: 'yellow', healthReason: 'stale' };
  }

  // Fallback
  return { health: 'yellow', healthReason: 'unknown' };
}

/**
 * Match a DB source to a catalog entry by providerId or host pattern.
 */
function matchCatalogEntry(catalogEntries, dbSource) {
  const url = String(dbSource.url || '');
  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch (_) {
    // ignore invalid URLs
  }

  for (const entry of catalogEntries) {
    if (entry.hostPatterns.some((pattern) => hostname.includes(pattern))) {
      return entry;
    }
  }
  return null;
}

/**
 * Build merged source list from catalog + DB sources.
 */
function buildMergedSources(catalogEntries, dbSources, { now = new Date() } = {}) {
  const matched = new Set();
  const result = [];

  // First pass: walk catalog entries and match to DB sources
  for (const catalogEntry of catalogEntries) {
    const dbMatch = dbSources.find((dbSource) => {
      let hostname = '';
      try {
        hostname = new URL(String(dbSource.url || '')).hostname.toLowerCase();
      } catch (_) { /* ignore */ }
      return catalogEntry.hostPatterns.some((p) => hostname.includes(p));
    });

    // Determine wiring state
    let wired = false;
    let wiringState = 'catalog_only';
    const envGated = catalogEntry.envGated;

    if (envGated) {
      const envVal = String(process.env[envGated] || 'false').toLowerCase();
      if (envVal !== 'true') {
        wiringState = 'disabled_by_env';
      } else if (catalogEntry.hasAdapter) {
        wired = true;
        wiringState = 'wired';
      }
    } else if (catalogEntry.hasAdapter) {
      // First-class adapter is implemented in code, so source is wired even without a DB row
      wired = true;
      wiringState = 'wired';
    }

    const enabled = dbMatch ? dbMatch.isActive !== false : wired;
    const fetchStatus = dbMatch?.lastFetchStatus || null;
    const fetchAt = dbMatch?.lastFetchAt || null;
    const fetchCnt = dbMatch?.fetchCount || 0;
    const errCnt = dbMatch?.errorCount || 0;

    const { health, healthReason } = computeSourceHealth({
      wired,
      enabled,
      lastFetchStatus: fetchStatus,
      lastFetchAt: fetchAt,
      fetchCount: fetchCnt,
      errorCount: errCnt,
      wiringState,
      now
    });

    if (dbMatch) {
      matched.add(String(dbMatch._id));
    }

    result.push({
      id: catalogEntry.id,
      _id: dbMatch ? dbMatch._id : null,
      name: catalogEntry.name,
      url: dbMatch?.url || catalogEntry.url,
      providerId: catalogEntry.id,
      type: dbMatch?.type || catalogEntry.sourceType,
      category: dbMatch?.category || 'general',
      categories: catalogEntry.categories,
      wired,
      wiringState,
      enabled,
      health,
      healthReason,
      lastFetchAt: fetchAt,
      lastFetchStatus: fetchStatus,
      fetchCount: fetchCnt,
      errorCount: errCnt,
      priority: catalogEntry.priority
    });
  }

  // Second pass: add DB sources not in catalog
  for (const dbSource of dbSources) {
    if (matched.has(String(dbSource._id))) continue;

    const { health, healthReason } = computeSourceHealth({
      wired: true,
      enabled: dbSource.isActive !== false,
      lastFetchStatus: dbSource.lastFetchStatus,
      lastFetchAt: dbSource.lastFetchAt,
      fetchCount: dbSource.fetchCount || 0,
      errorCount: dbSource.errorCount || 0,
      wiringState: 'wired',
      now
    });

    result.push({
      id: String(dbSource._id),
      _id: dbSource._id,
      name: dbSource.name,
      url: dbSource.url,
      providerId: 'custom-rss',
      type: dbSource.type,
      category: dbSource.category || 'general',
      categories: [dbSource.category || 'general'],
      wired: true,
      wiringState: 'wired',
      enabled: dbSource.isActive !== false,
      health,
      healthReason,
      lastFetchAt: dbSource.lastFetchAt,
      lastFetchStatus: dbSource.lastFetchStatus,
      fetchCount: dbSource.fetchCount || 0,
      errorCount: dbSource.errorCount || 0,
      priority: dbSource.priority || 1
    });
  }

  // Sort by priority descending, then name ascending
  result.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (a.name || '').localeCompare(b.name || '');
  });

  return result;
}

module.exports = {
  NEWS_SOURCE_CATALOG,
  CATALOG_VERSION,
  HEALTH_FRESHNESS_WINDOW_MS,
  HEALTH_ERROR_THRESHOLD,
  computeSourceHealth,
  matchCatalogEntry,
  buildMergedSources
};
