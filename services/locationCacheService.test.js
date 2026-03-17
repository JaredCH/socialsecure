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
const { getArticlesForLocation, searchCachedArticles } = require('./locationCacheService');

describe('locationCacheService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
