const {
  NEWS_SOURCE_CATALOG,
  CATALOG_VERSION,
  HEALTH_FRESHNESS_WINDOW_MS,
  computeSourceHealth,
  buildMergedSources
} = require('../config/newsSourceCatalog');

describe('newsSourceCatalog', () => {
  describe('computeSourceHealth', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    const recentDate = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2h ago
    const staleDate = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48h ago

    it('returns green for wired, enabled, recently successful source', () => {
      const result = computeSourceHealth({
        wired: true,
        enabled: true,
        lastFetchStatus: 'success',
        lastFetchAt: recentDate,
        fetchCount: 10,
        errorCount: 0,
        wiringState: 'wired',
        now
      });
      expect(result.health).toBe('green');
      expect(result.healthReason).toBe('last_fetch_success_recent');
    });

    it('returns yellow for catalog_only source', () => {
      const result = computeSourceHealth({
        wired: false,
        enabled: false,
        lastFetchStatus: null,
        lastFetchAt: null,
        fetchCount: 0,
        errorCount: 0,
        wiringState: 'catalog_only',
        now
      });
      expect(result.health).toBe('yellow');
      expect(result.healthReason).toBe('not_wired');
    });

    it('returns yellow for disabled_by_env source', () => {
      const result = computeSourceHealth({
        wired: false,
        enabled: false,
        lastFetchStatus: null,
        lastFetchAt: null,
        fetchCount: 0,
        errorCount: 0,
        wiringState: 'disabled_by_env',
        now
      });
      expect(result.health).toBe('yellow');
      expect(result.healthReason).toBe('disabled_by_env');
    });

    it('returns yellow for intentionally disabled source', () => {
      const result = computeSourceHealth({
        wired: true,
        enabled: false,
        lastFetchStatus: 'success',
        lastFetchAt: recentDate,
        fetchCount: 5,
        errorCount: 0,
        wiringState: 'wired',
        now
      });
      expect(result.health).toBe('yellow');
      expect(result.healthReason).toBe('disabled');
    });

    it('returns red for last fetch error', () => {
      const result = computeSourceHealth({
        wired: true,
        enabled: true,
        lastFetchStatus: 'error',
        lastFetchAt: recentDate,
        fetchCount: 5,
        errorCount: 1,
        wiringState: 'wired',
        now
      });
      expect(result.health).toBe('red');
      expect(result.healthReason).toBe('last_fetch_error');
    });

    it('returns red for error threshold exceeded', () => {
      const result = computeSourceHealth({
        wired: true,
        enabled: true,
        lastFetchStatus: 'error',
        lastFetchAt: recentDate,
        fetchCount: 10,
        errorCount: 5,
        wiringState: 'wired',
        now
      });
      expect(result.health).toBe('red');
      expect(result.healthReason).toBe('error_threshold_exceeded');
    });

    it('returns yellow for never fetched source', () => {
      const result = computeSourceHealth({
        wired: true,
        enabled: true,
        lastFetchStatus: 'pending',
        lastFetchAt: null,
        fetchCount: 0,
        errorCount: 0,
        wiringState: 'wired',
        now
      });
      expect(result.health).toBe('yellow');
      expect(result.healthReason).toBe('never_fetched');
    });

    it('returns yellow for stale success', () => {
      const result = computeSourceHealth({
        wired: true,
        enabled: true,
        lastFetchStatus: 'success',
        lastFetchAt: staleDate,
        fetchCount: 10,
        errorCount: 0,
        wiringState: 'wired',
        now
      });
      expect(result.health).toBe('yellow');
      expect(result.healthReason).toBe('stale');
    });
  });

  describe('buildMergedSources', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    const recentDate = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    it('returns catalog entries even without DB rows', () => {
      const result = buildMergedSources(NEWS_SOURCE_CATALOG, [], { now });
      expect(result.length).toBeGreaterThanOrEqual(NEWS_SOURCE_CATALOG.length);
      const googleNews = result.find(s => s.id === 'google-news');
      expect(googleNews).toBeDefined();
      expect(googleNews.name).toBe('Google News');
      expect(googleNews.health).toBe('yellow');
    });

    it('merges DB source with catalog entry', () => {
      const dbSources = [{
        _id: 'db-bbc-1',
        name: 'BBC News',
        url: 'https://feeds.bbci.co.uk/news/rss.xml',
        type: 'bbc',
        category: 'world',
        isActive: true,
        lastFetchStatus: 'success',
        lastFetchAt: recentDate,
        fetchCount: 50,
        errorCount: 2,
        priority: 9
      }];
      const result = buildMergedSources(NEWS_SOURCE_CATALOG, dbSources, { now });
      const bbc = result.find(s => s.id === 'bbc');
      expect(bbc).toBeDefined();
      expect(bbc.wired).toBe(true);
      expect(bbc.health).toBe('green');
      expect(bbc._id).toBe('db-bbc-1');
    });

    it('correctly classifies environment-gated providers', () => {
      // GDELT_ENABLED is false by default
      const result = buildMergedSources(NEWS_SOURCE_CATALOG, [], { now });
      const gdelt = result.find(s => s.id === 'gdelt');
      expect(gdelt).toBeDefined();
      expect(gdelt.wiringState).toBe('disabled_by_env');
      expect(gdelt.health).toBe('yellow');
    });

    it('includes DB sources not in catalog as custom-rss', () => {
      const dbSources = [{
        _id: 'custom-1',
        name: 'My Custom Feed',
        url: 'https://example.com/feed.xml',
        type: 'rss',
        category: 'technology',
        isActive: true,
        lastFetchStatus: 'success',
        lastFetchAt: recentDate,
        fetchCount: 5,
        errorCount: 0,
        priority: 3
      }];
      const result = buildMergedSources(NEWS_SOURCE_CATALOG, dbSources, { now });
      const custom = result.find(s => s.id === 'custom-1');
      expect(custom).toBeDefined();
      expect(custom.providerId).toBe('custom-rss');
      expect(custom.health).toBe('green');
    });

    it('sorts by priority descending', () => {
      const result = buildMergedSources(NEWS_SOURCE_CATALOG, [], { now });
      for (let i = 1; i < result.length; i++) {
        if (result[i].priority !== result[i - 1].priority) {
          expect(result[i - 1].priority).toBeGreaterThanOrEqual(result[i].priority);
        }
      }
    });
  });

  describe('catalog structure', () => {
    it('has catalog version', () => {
      expect(CATALOG_VERSION).toBe(2);
    });

    it('all catalog entries have required fields', () => {
      for (const entry of NEWS_SOURCE_CATALOG) {
        expect(entry.id).toBeDefined();
        expect(entry.name).toBeDefined();
        expect(entry.url).toBeDefined();
        expect(entry.hostPatterns).toBeDefined();
        expect(Array.isArray(entry.hostPatterns)).toBe(true);
        expect(entry.categories).toBeDefined();
        expect(Array.isArray(entry.categories)).toBe(true);
        expect(typeof entry.hasAdapter).toBe('boolean');
        expect(typeof entry.priority).toBe('number');
      }
    });

    it('all non-env-gated sources have adapters wired', () => {
      const nonGated = NEWS_SOURCE_CATALOG.filter(s => !s.envGated);
      const wired = nonGated.filter(s => s.hasAdapter);
      expect(wired.length).toBe(nonGated.length);
    });
  });
});
