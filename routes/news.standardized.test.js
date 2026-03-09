const mockGeocode = jest.fn();
const mockParseUrl = jest.fn();

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
jest.mock('rss-parser', () => jest.fn().mockImplementation(() => ({ parseURL: mockParseUrl })));

const newsRoutes = require('./news');

describe('Standardized category system', () => {
  it('exports normalizeToStandardCategory', () => {
    expect(newsRoutes.internals.normalizeToStandardCategory).toBeDefined();
    expect(typeof newsRoutes.internals.normalizeToStandardCategory).toBe('function');
  });

  it('maps known category names directly', () => {
    const normalize = newsRoutes.internals.normalizeToStandardCategory;
    expect(normalize('technology')).toBe('technology');
    expect(normalize('science')).toBe('science');
    expect(normalize('health')).toBe('health');
    expect(normalize('business')).toBe('business');
    expect(normalize('sports')).toBe('sports');
    expect(normalize('entertainment')).toBe('entertainment');
    expect(normalize('politics')).toBe('politics');
    expect(normalize('finance')).toBe('finance');
    expect(normalize('gaming')).toBe('gaming');
    expect(normalize('ai')).toBe('ai');
    expect(normalize('world')).toBe('world');
    expect(normalize('general')).toBe('general');
  });

  it('maps aliases to standard categories', () => {
    const normalize = newsRoutes.internals.normalizeToStandardCategory;
    expect(normalize('tech')).toBe('technology');
    expect(normalize('sport')).toBe('sports');
    expect(normalize('political')).toBe('politics');
    expect(normalize('financial')).toBe('finance');
    expect(normalize('artificial intelligence')).toBe('ai');
    expect(normalize('international')).toBe('world');
  });

  it('maps partial matches to categories', () => {
    const normalize = newsRoutes.internals.normalizeToStandardCategory;
    expect(normalize('software development')).toBe('technology');
    expect(normalize('medical research')).toBe('health');
    expect(normalize('stock market')).toBe('finance');
    expect(normalize('election results')).toBe('politics');
    expect(normalize('movie reviews')).toBe('entertainment');
    expect(normalize('basketball scores')).toBe('sports');
    expect(normalize('video games')).toBe('gaming');
  });

  it('returns general for unknown categories', () => {
    const normalize = newsRoutes.internals.normalizeToStandardCategory;
    expect(normalize('')).toBe('general');
    expect(normalize(null)).toBe('general');
    expect(normalize(undefined)).toBe('general');
    expect(normalize('xyzzy random')).toBe('general');
  });

  it('exports STANDARDIZED_CATEGORIES list', () => {
    const categories = newsRoutes.internals.STANDARDIZED_CATEGORIES;
    expect(Array.isArray(categories)).toBe(true);
    expect(categories).toContain('technology');
    expect(categories).toContain('world');
    expect(categories).toContain('general');
    expect(categories.length).toBeGreaterThanOrEqual(12);
  });
});

describe('Google News topic configuration', () => {
  it('exports GOOGLE_NEWS_TOPIC_MAP', () => {
    const map = newsRoutes.internals.GOOGLE_NEWS_TOPIC_MAP;
    expect(map).toBeDefined();
    expect(map.technology.category).toBe('technology');
    expect(map.science.category).toBe('science');
    expect(map['artificial intelligence'].category).toBe('ai');
  });

  it('buildGoogleNewsFeedUrl includes locale params', () => {
    const buildUrl = newsRoutes.internals.buildGoogleNewsFeedUrl;
    const url = buildUrl('technology');
    expect(url).toContain('news.google.com/rss/search');
    expect(url).toContain('hl=en-US');
    expect(url).toContain('gl=US');
    expect(url).toContain('ceid=US:en');
    expect(url).toContain('q=technology');
  });
});

describe('NPR adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeocode.mockReset();
    mockGeocode.mockResolvedValue([]);
    mockParseUrl.mockReset();
    mockParseUrl.mockRejectedValue(new Error('parse error'));
    newsRoutes.internals.geocodeContextCache.clear();
  });

  it('is exported as an adapter', () => {
    expect(newsRoutes.adapters.fetchNprSource).toBeDefined();
    expect(typeof newsRoutes.adapters.fetchNprSource).toBe('function');
  });

  it('exports NPR_FEED_MAP with all sections', () => {
    const map = newsRoutes.internals.NPR_FEED_MAP;
    expect(map).toBeDefined();
    expect(map.news).toBeDefined();
    expect(map.news.url).toContain('feeds.npr.org');
    expect(map.news.category).toBe('general');
    expect(map.technology).toBeDefined();
    expect(map.technology.category).toBe('technology');
    expect(map.politics).toBeDefined();
    expect(map.politics.category).toBe('politics');
    expect(map.world).toBeDefined();
    expect(map.world.category).toBe('world');
  });

  it('returns empty array on fetch error', async () => {
    // fetchNprSource calls parser.parseURL which will throw when no mock is available
    const articles = await newsRoutes.adapters.fetchNprSource('news', {
      url: 'https://feeds.npr.org/invalid/rss.xml',
      category: 'general',
      label: 'NPR News'
    });
    expect(articles).toEqual([]);
  });
});

describe('BBC adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeocode.mockReset();
    mockGeocode.mockResolvedValue([]);
    mockParseUrl.mockReset();
    mockParseUrl.mockRejectedValue(new Error('parse error'));
    newsRoutes.internals.geocodeContextCache.clear();
  });

  it('is exported as an adapter', () => {
    expect(newsRoutes.adapters.fetchBbcSource).toBeDefined();
    expect(typeof newsRoutes.adapters.fetchBbcSource).toBe('function');
  });

  it('exports BBC_FEED_MAP with all sections', () => {
    const map = newsRoutes.internals.BBC_FEED_MAP;
    expect(map).toBeDefined();
    expect(map.top).toBeDefined();
    expect(map.top.url).toContain('feeds.bbci.co.uk');
    expect(map.top.category).toBe('general');
    expect(map.technology).toBeDefined();
    expect(map.technology.category).toBe('technology');
    expect(map.science).toBeDefined();
    expect(map.science.category).toBe('science');
    expect(map.entertainment).toBeDefined();
    expect(map.entertainment.category).toBe('entertainment');
  });

  it('returns empty array on fetch error', async () => {
    const articles = await newsRoutes.adapters.fetchBbcSource('top', {
      url: 'https://feeds.bbci.co.uk/news/invalid.xml',
      category: 'general',
      label: 'BBC Top Stories'
    });
    expect(articles).toEqual([]);
  });

  it('does not infer local scope from BBC source/category labels alone', async () => {
    mockParseUrl.mockResolvedValueOnce({
      language: 'en-gb',
      items: [
        {
          title: 'What is BookTok and how did it start?',
          contentSnippet: 'The TikTok trend that can get thousands of people reading the same novel',
          link: 'https://www.bbc.co.uk/bitesize/articles/z9cgnk7?at_medium=RSS&at_campaign=rss',
          guid: 'https://www.bbc.co.uk/bitesize/articles/z9cgnk7#2',
          categories: ['entertainment'],
          isoDate: '2026-03-03T10:07:14.000Z'
        }
      ]
    });

    const articles = await newsRoutes.adapters.fetchBbcSource('entertainment', {
      url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
      category: 'entertainment',
      label: 'BBC Entertainment'
    });

    expect(articles).toHaveLength(1);
    expect(articles[0].localityLevel).toBe('global');
    expect(articles[0].locations).toEqual([]);
  });
});

describe('Google News adapter standardized fields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeocode.mockReset();
    mockGeocode.mockResolvedValue([]);
    mockParseUrl.mockReset();
    mockParseUrl.mockRejectedValue(new Error('parse error'));
    newsRoutes.internals.geocodeContextCache.clear();
  });

  it('returns empty array on network error', async () => {
    // The adapter calls parser.parseURL which will fail on invalid URLs
    const articles = await newsRoutes.adapters.fetchGoogleNewsSource('nonexistent_query_test');
    expect(articles).toEqual([]);
  });
});

describe('GDELT adapter standardized fields', () => {
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

  it('includes category, feedSource, feedCategory in returned articles', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        articles: [
          {
            url: 'https://example.com/article-1',
            title: 'Tech Breakthrough in Austin, TX',
            domain: 'technews.com',
            seendate: '20260306T120000Z',
            socialimage: 'https://example.com/img.jpg',
            language: 'English'
          }
        ]
      })
    });

    const articles = await newsRoutes.adapters.fetchGdeltSource('technology');
    expect(articles).toHaveLength(1);
    expect(articles[0].category).toBe('technology');
    expect(articles[0].feedSource).toBe('gdelt');
    expect(articles[0].feedCategory).toBe('technology');
    expect(articles[0].feedLanguage).toBe('English');
    expect(articles[0].feedMetadata).toBeDefined();
    expect(articles[0].feedMetadata.gdeltDomain).toBe('technews.com');
  });
});
