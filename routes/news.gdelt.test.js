const mockGeocode = jest.fn();

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

jest.mock('../models/Article', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  findDuplicate: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));

jest.mock('../models/RssSource', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndDelete: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  updateMany: jest.fn()
}));

jest.mock('../models/NewsPreferences', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn()
}));

jest.mock('../models/User', () => ({
  findById: jest.fn()
}));
jest.mock('node-geocoder', () => jest.fn(() => ({ geocode: mockGeocode })));

const newsRoutes = require('./news');

describe('GDELT adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeocode.mockReset();
    mockGeocode.mockResolvedValue([]);
    newsRoutes.internals.geocodeContextCache.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('is exported as an adapter', () => {
    expect(newsRoutes.adapters.fetchGdeltSource).toBeDefined();
    expect(typeof newsRoutes.adapters.fetchGdeltSource).toBe('function');
  });

  it('returns articles from GDELT API response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        articles: [
          {
            url: 'https://example.com/article-1',
            title: 'Local Event in Austin, TX',
            domain: 'example.com',
            seendate: '20260306T120000Z',
            socialimage: 'https://example.com/img.jpg',
            language: 'English'
          },
          {
            url: 'https://example.com/article-2',
            title: 'National News Story',
            domain: 'news.com',
            seendate: '20260306T130000Z',
            socialimage: null,
            language: 'English'
          }
        ]
      })
    });

    const articles = await newsRoutes.adapters.fetchGdeltSource('local news');

    expect(articles).toHaveLength(2);
    expect(articles[0].title).toBe('Local Event in Austin, TX');
    expect(articles[0].sourceType).toBe('gdlet');
    expect(articles[0].url).toBe('https://example.com/article-1');
    expect(articles[0].source).toBe('example.com');
    expect(articles[0].imageUrl).toBe('https://example.com/img.jpg');
    expect(articles[1].title).toBe('National News Story');
    expect(articles[1].sourceType).toBe('gdlet');
  });

  it('returns empty array on API error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500
    });

    const articles = await newsRoutes.adapters.fetchGdeltSource('test query');
    expect(articles).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const articles = await newsRoutes.adapters.fetchGdeltSource('test query');
    expect(articles).toEqual([]);
  });

  it('returns empty array when response has no articles', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    const articles = await newsRoutes.adapters.fetchGdeltSource('test query');
    expect(articles).toEqual([]);
  });

  it('parses GDELT seendate format into valid Date', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        articles: [
          {
            url: 'https://example.com/article-1',
            title: 'Test Article',
            domain: 'example.com',
            seendate: '20260306T143000Z'
          }
        ]
      })
    });

    const articles = await newsRoutes.adapters.fetchGdeltSource('test');
    expect(articles[0].publishedAt).toBeInstanceOf(Date);
    expect(articles[0].publishedAt.toISOString()).toBe('2026-03-06T14:30:00.000Z');
  });

  it('includes location tags when NEWS_LOCATION_TAGGER_V2 is enabled', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        articles: [
          {
            url: 'https://example.com/article-tx',
            title: 'Texas Local News',
            domain: 'texasnews.com',
            seendate: '20260306T120000Z'
          }
        ]
      })
    });

    const articles = await newsRoutes.adapters.fetchGdeltSource('texas news');
    expect(articles[0]).toHaveProperty('locationTags');
    expect(articles[0]).toHaveProperty('scopeReason');
    expect(articles[0]).toHaveProperty('scopeConfidence');
  });
});

describe('computeScopeQualityMetrics', () => {
  it('returns zero metrics for empty array', () => {
    const metrics = newsRoutes.internals.computeScopeQualityMetrics([], Date.now());
    expect(metrics.total).toBe(0);
    expect(metrics.deterministicTagRate).toBe(0);
  });

  it('computes correct scope reason breakdown', () => {
    const articles = [
      { scopeReason: 'zip_match', locationTags: { zipCodes: ['78666'], states: [], countries: [] } },
      { scopeReason: 'zip_match', locationTags: { zipCodes: ['70726'], states: [], countries: [] } },
      { scopeReason: 'state_match', locationTags: { zipCodes: [], states: ['texas'], countries: [] } },
      { scopeReason: 'source_default', locationTags: { zipCodes: [], states: [], countries: [] } }
    ];
    const metrics = newsRoutes.internals.computeScopeQualityMetrics(articles, Date.now());

    expect(metrics.total).toBe(4);
    expect(metrics.scopeReasonBreakdown.zip_match.count).toBe(2);
    expect(metrics.scopeReasonBreakdown.zip_match.pct).toBe(50);
    expect(metrics.scopeReasonBreakdown.state_match.count).toBe(1);
    expect(metrics.scopeReasonBreakdown.state_match.pct).toBe(25);
    expect(metrics.scopeReasonBreakdown.source_default.count).toBe(1);
  });

  it('computes deterministic tag rate', () => {
    const articles = [
      { scopeReason: 'zip_match', locationTags: { zipCodes: ['78666'], states: [], countries: [] } },
      { scopeReason: 'state_match', locationTags: { zipCodes: [], states: ['texas'], countries: [] } },
      { scopeReason: 'country_match', locationTags: { zipCodes: [], states: [], countries: ['united states'] } },
      { scopeReason: 'source_default', locationTags: {} }
    ];
    const metrics = newsRoutes.internals.computeScopeQualityMetrics(articles, Date.now());

    expect(metrics.deterministicTagRate).toBe(75);
    expect(metrics.withZipTags).toBe(1);
    expect(metrics.withStateTags).toBe(1);
    expect(metrics.withCountryTags).toBe(1);
  });

  it('computes median ingest-to-publish latency', () => {
    const now = Date.now();
    const articles = [
      {
        scopeReason: 'zip_match',
        locationTags: { zipCodes: ['78666'] },
        publishedAt: new Date(now - 60000),
        scrapeTimestamp: new Date(now)
      },
      {
        scopeReason: 'state_match',
        locationTags: { states: ['texas'] },
        publishedAt: new Date(now - 30000),
        scrapeTimestamp: new Date(now)
      },
      {
        scopeReason: 'source_default',
        locationTags: {},
        publishedAt: new Date(now - 90000),
        scrapeTimestamp: new Date(now)
      }
    ];
    const metrics = newsRoutes.internals.computeScopeQualityMetrics(articles, now);

    expect(metrics.medianIngestLatencyMs).toBe(60000);
  });

  it('handles articles without publishedAt gracefully', () => {
    const articles = [
      { scopeReason: 'zip_match', locationTags: { zipCodes: ['78666'] } },
      { scopeReason: 'source_default', locationTags: {} }
    ];
    const metrics = newsRoutes.internals.computeScopeQualityMetrics(articles, Date.now());

    expect(metrics.medianIngestLatencyMs).toBeNull();
  });

  it('includes ingestion duration', () => {
    const startTime = Date.now() - 5000;
    const articles = [
      { scopeReason: 'zip_match', locationTags: { zipCodes: ['78666'] } }
    ];
    const metrics = newsRoutes.internals.computeScopeQualityMetrics(articles, startTime);

    expect(metrics.ingestionDurationMs).toBeGreaterThanOrEqual(4900);
  });
});
