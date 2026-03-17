const mockParseURL = jest.fn();

jest.mock('rss-parser', () => jest.fn().mockImplementation(() => ({ parseURL: mockParseURL })));
jest.mock('../models/LocationNewsCache', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  find: jest.fn()
}));
jest.mock('../models/NewsIngestionRecord', () => ({
  create: jest.fn()
}));
jest.mock('./newsRssImage', () => ({
  extractRssImageUrl: jest.fn(() => 'https://images.example/rss.jpg')
}));

const LocationNewsCache = require('../models/LocationNewsCache');
const { getArticlesForLocation, searchCachedArticles, memoryCache } = require('./locationCacheService');

describe('locationCacheService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    memoryCache.reset();
  });

  it('returns cached articles without refetching when the cache is fresh', async () => {
    LocationNewsCache.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        locationKey: 'san_marcos_tx_us',
        lastFetchedAt: new Date(),
        articles: [{ title: 'Cached', link: 'https://example.com/a', source: 'Cache', tier: 'local' }]
      })
    });

    const result = await getArticlesForLocation('san_marcos_tx_us');

    expect(result.cacheHit).toBe(true);
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]).toMatchObject({ title: 'Cached', url: 'https://example.com/a', locationKey: 'san_marcos_tx_us' });
    expect(mockParseURL).not.toHaveBeenCalled();
  });

  it('fetches, deduplicates, and stores tiered RSS results when cache is stale', async () => {
    LocationNewsCache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    LocationNewsCache.findOneAndUpdate.mockResolvedValue({});
    mockParseURL
      .mockResolvedValueOnce({ items: [{ title: 'Fire in San Marcos - KXAN', link: 'https://example.com/local', pubDate: '2026-03-17T10:00:00.000Z' }] })
      .mockResolvedValueOnce({ items: [{ title: 'Fire in San Marcos - KVUE', link: 'https://example.com/state', pubDate: '2026-03-17T09:00:00.000Z' }] })
      .mockResolvedValueOnce({ items: [{ title: 'National update', link: 'https://example.com/national', pubDate: '2026-03-17T08:00:00.000Z' }] });

    const result = await getArticlesForLocation('san_marcos_tx_us');

    expect(result.cacheHit).toBe(false);
    expect(result.articles).toHaveLength(2);
    expect(LocationNewsCache.findOneAndUpdate).toHaveBeenCalled();
    expect(result.articles.map((article) => article.title)).toEqual([
      'Fire in San Marcos - KXAN',
      'National update'
    ]);
  });

  it('searches across hydrated cached articles', async () => {
    LocationNewsCache.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          locationKey: 'san_marcos_tx_us',
          articles: [{ title: 'Council approves downtown plan', link: 'https://example.com/council', source: 'Local Wire', tier: 'local' }]
        }
      ])
    });

    const results = await searchCachedArticles('downtown');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ title: 'Council approves downtown plan', locationKey: 'san_marcos_tx_us' });
  });

  it('returns stale cache immediately and triggers background refresh for expired entries', async () => {
    const staleDate = new Date(Date.now() - 20 * 60 * 1000); // 20 min ago (beyond 15-min TTL)
    LocationNewsCache.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        locationKey: 'austin_tx_us',
        lastFetchedAt: staleDate,
        articles: [{ title: 'Stale headline', link: 'https://example.com/stale', source: 'Old', tier: 'local' }]
      })
    });
    LocationNewsCache.findOneAndUpdate.mockResolvedValue({});
    mockParseURL
      .mockResolvedValueOnce({ items: [{ title: 'Fresh local', link: 'https://example.com/fresh-local', pubDate: '2026-03-17T12:00:00.000Z' }] })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] });

    const result = await getArticlesForLocation('austin_tx_us');

    // Should get stale data immediately
    expect(result.cacheHit).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].title).toBe('Stale headline');

    // Background refresh should have been kicked off (non-blocking)
    // Give it a tick to settle
    await new Promise((r) => setTimeout(r, 50));
    expect(mockParseURL).toHaveBeenCalled();
  });

  it('serves from in-memory LRU cache on subsequent requests without hitting DB', async () => {
    // First call: populate from DB
    LocationNewsCache.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        locationKey: 'dallas_tx_us',
        lastFetchedAt: new Date(),
        articles: [{ title: 'Dallas headline', link: 'https://example.com/dallas', source: 'Wire', tier: 'local' }]
      })
    });

    const first = await getArticlesForLocation('dallas_tx_us');
    expect(first.cacheHit).toBe(true);
    expect(LocationNewsCache.findOne).toHaveBeenCalledTimes(1);

    // Second call: should come from LRU memory cache, no DB hit
    jest.clearAllMocks();
    const second = await getArticlesForLocation('dallas_tx_us');
    expect(second.articles).toHaveLength(1);
    expect(second.articles[0].title).toBe('Dallas headline');
    expect(LocationNewsCache.findOne).not.toHaveBeenCalled();
  });

  it('bypasses both memory and DB caches when forceRefresh is true', async () => {
    // Seed the memory cache
    memoryCache.set('houston_tx_us', { articles: [{ title: 'Old memory' }], cacheHit: true, locationKey: 'houston_tx_us' });

    LocationNewsCache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    LocationNewsCache.findOneAndUpdate.mockResolvedValue({});
    mockParseURL
      .mockResolvedValueOnce({ items: [{ title: 'Fresh RSS', link: 'https://example.com/fresh', pubDate: '2026-03-17T12:00:00.000Z' }] })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] });

    const result = await getArticlesForLocation('houston_tx_us', { forceRefresh: true });

    expect(result.cacheHit).toBe(false);
    expect(result.articles[0].title).toBe('Fresh RSS');
    expect(mockParseURL).toHaveBeenCalledTimes(3);
  });
});
