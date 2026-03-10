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
    expect(map['top stories']).toBeDefined();
    expect(map['top stories'].url).toBe('https://news.google.com/rss');
    expect(map.world.url).toBe('https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREZxYUdjU0FtVnVLQUFQAQ?hl=en-US&gl=US&ceid=US:en');
    expect(map.business.url).toBe('https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRlVnWm9ScQ?hl=en-US&gl=US&ceid=US:en');
    expect(map.technology.category).toBe('technology');
    expect(map.science.category).toBe('science');
    expect(map.health.category).toBe('health');
    expect(map.entertainment.category).toBe('entertainment');
    expect(map.sports.category).toBe('sports');
  });

  it('buildGoogleNewsFeedUrl uses configured feed URLs and search fallback', () => {
    const buildUrl = newsRoutes.internals.buildGoogleNewsFeedUrl;
    const topicUrl = buildUrl('technology');
    expect(topicUrl).toBe('https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFZxYUdjU0FtVnVLQUFQAQ?hl=en-US&gl=US&ceid=US:en');

    const fallbackUrl = buildUrl('football');
    expect(fallbackUrl).toContain('news.google.com/rss/search');
    expect(fallbackUrl).toContain('hl=en-US');
    expect(fallbackUrl).toContain('gl=US');
    expect(fallbackUrl).toContain('ceid=US:en');
    expect(fallbackUrl).toContain('q=football');
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
    expect(map.us).toBeDefined();
    expect(map.us.url).toBe('https://feeds.npr.org/1003/rss.xml');
    expect(map.us.category).toBe('general');
    expect(map.business).toBeDefined();
    expect(map.business.url).toBe('https://feeds.npr.org/1019/rss.xml');
    expect(map.business.category).toBe('business');
    expect(map.politics).toBeDefined();
    expect(map.politics.url).toBe('https://feeds.npr.org/1017/rss.xml');
    expect(map.politics.category).toBe('politics');
    expect(map.world).toBeDefined();
    expect(map.world.category).toBe('world');
    expect(map.nprPolitics).toBeUndefined();
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

    // News sections
    expect(map.top).toBeDefined();
    expect(map.top.url).toBe('https://feeds.bbci.co.uk/news/rss.xml');
    expect(map.top.category).toBe('general');

    expect(map.world).toBeDefined();
    expect(map.world.url).toBe('https://feeds.bbci.co.uk/news/world/rss.xml');
    expect(map.world.category).toBe('world');

    expect(map.uk).toBeDefined();
    expect(map.uk.url).toBe('https://feeds.bbci.co.uk/news/uk/rss.xml');
    expect(map.uk.category).toBe('world');

    expect(map.england).toBeDefined();
    expect(map.england.url).toBe('https://feeds.bbci.co.uk/news/england/rss.xml');
    expect(map.england.category).toBe('world');

    expect(map.northernIreland).toBeDefined();
    expect(map.northernIreland.url).toBe('https://feeds.bbci.co.uk/news/northern_ireland/rss.xml');
    expect(map.northernIreland.category).toBe('world');

    expect(map.scotland).toBeDefined();
    expect(map.scotland.url).toBe('https://feeds.bbci.co.uk/news/scotland/rss.xml');
    expect(map.scotland.category).toBe('world');

    expect(map.wales).toBeDefined();
    expect(map.wales.url).toBe('https://feeds.bbci.co.uk/news/wales/rss.xml');
    expect(map.wales.category).toBe('world');

    expect(map.business).toBeDefined();
    expect(map.business.url).toBe('https://feeds.bbci.co.uk/news/business/rss.xml');
    expect(map.business.category).toBe('business');

    expect(map.politics).toBeDefined();
    expect(map.politics.url).toBe('https://feeds.bbci.co.uk/news/politics/rss.xml');
    expect(map.politics.category).toBe('politics');

    expect(map.entertainment).toBeDefined();
    expect(map.entertainment.url).toBe('https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml');
    expect(map.entertainment.category).toBe('entertainment');

    expect(map.health).toBeDefined();
    expect(map.health.url).toBe('https://feeds.bbci.co.uk/news/health/rss.xml');
    expect(map.health.category).toBe('health');

    expect(map.education).toBeDefined();
    expect(map.education.url).toBe('https://feeds.bbci.co.uk/news/education/rss.xml');
    expect(map.education.category).toBe('general');

    expect(map.science).toBeDefined();
    expect(map.science.url).toBe('https://feeds.bbci.co.uk/news/science_and_environment/rss.xml');
    expect(map.science.category).toBe('science');

    expect(map.technology).toBeDefined();
    expect(map.technology.url).toBe('https://feeds.bbci.co.uk/news/technology/rss.xml');
    expect(map.technology.category).toBe('technology');

    expect(map.magazine).toBeDefined();
    expect(map.magazine.url).toBe('https://feeds.bbci.co.uk/news/magazine/rss.xml');
    expect(map.magazine.category).toBe('general');

    // Sport sections
    expect(map.sport).toBeDefined();
    expect(map.sport.url).toBe('https://feeds.bbci.co.uk/sport/rss.xml');
    expect(map.sport.category).toBe('sports');

    expect(map.football).toBeDefined();
    expect(map.football.url).toBe('https://feeds.bbci.co.uk/sport/football/rss.xml');
    expect(map.football.category).toBe('sports');

    expect(map.formula1).toBeDefined();
    expect(map.formula1.url).toBe('https://feeds.bbci.co.uk/sport/formula1/rss.xml');
    expect(map.formula1.category).toBe('sports');

    expect(map.olympics).toBeDefined();
    expect(map.olympics.url).toBe('https://feeds.bbci.co.uk/sport/olympics/rss.xml');
    expect(map.olympics.category).toBe('sports');

    expect(map.cricket).toBeDefined();
    expect(map.cricket.url).toBe('https://feeds.bbci.co.uk/sport/cricket/rss.xml');
    expect(map.cricket.category).toBe('sports');

    expect(map.rugbyUnion).toBeDefined();
    expect(map.rugbyUnion.url).toBe('https://feeds.bbci.co.uk/sport/rugby-union/rss.xml');
    expect(map.rugbyUnion.category).toBe('sports');

    expect(map.rugbyLeague).toBeDefined();
    expect(map.rugbyLeague.url).toBe('https://feeds.bbci.co.uk/sport/rugby-league/rss.xml');
    expect(map.rugbyLeague.category).toBe('sports');

    expect(map.tennis).toBeDefined();
    expect(map.tennis.url).toBe('https://feeds.bbci.co.uk/sport/tennis/rss.xml');
    expect(map.tennis.category).toBe('sports');

    expect(map.golf).toBeDefined();
    expect(map.golf.url).toBe('https://feeds.bbci.co.uk/sport/golf/rss.xml');
    expect(map.golf.category).toBe('sports');
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

describe('Yahoo RSS feeds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeocode.mockReset();
    mockGeocode.mockResolvedValue([]);
    mockParseUrl.mockReset();
    mockParseUrl.mockRejectedValue(new Error('parse error'));
    newsRoutes.internals.geocodeContextCache.clear();
  });

  it('exports YAHOO_FEED_MAP with all required Yahoo sections', () => {
    const map = newsRoutes.internals.YAHOO_FEED_MAP;
    expect(map).toBeDefined();
    expect(map.topStories).toBeDefined();
    expect(map.topStories.url).toBe('https://news.yahoo.com/rss/');
    expect(map.world.url).toBe('https://news.yahoo.com/rss/world');
    expect(map.us.url).toBe('https://news.yahoo.com/rss/us');
    expect(map.politics.url).toBe('https://news.yahoo.com/rss/politics');
    expect(map.business.url).toBe('https://news.yahoo.com/rss/business');
    expect(map.technology.url).toBe('https://news.yahoo.com/rss/tech');
    expect(map.entertainment.url).toBe('https://news.yahoo.com/rss/entertainment');
    expect(map.sports.url).toBe('https://sports.yahoo.com/rss/');
    expect(map.health.url).toBe('https://news.yahoo.com/rss/health');
    expect(map.science.url).toBe('https://news.yahoo.com/rss/science');
  });

  it('stores category, publishedAt, and applies country fallback location inference for Yahoo RSS items', async () => {
    mockParseUrl.mockResolvedValueOnce({
      language: 'en',
      items: [
        {
          title: 'New technology policy update',
          contentSnippet: 'American lawmakers debated changes affecting device manufacturers.',
          link: 'https://news.yahoo.com/technology-policy-123456789.html',
          guid: 'https://news.yahoo.com/technology-policy-123456789.html#1',
          categories: [],
          isoDate: '2026-03-06T12:00:00.000Z'
        }
      ]
    });

    const articles = await newsRoutes.adapters.fetchRssSource({
      name: 'Yahoo Technology',
      url: 'https://news.yahoo.com/rss/tech',
      category: 'technology'
    });

    expect(articles).toHaveLength(1);
    expect(articles[0].category).toBe('technology');
    expect(articles[0].publishedAt).toEqual(new Date('2026-03-06T12:00:00.000Z'));
    expect(articles[0].locations).toContain('united states');
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

  it('stores category, publication date, and location fallback tokens from Google feed content', async () => {
    mockParseUrl.mockResolvedValueOnce({
      title: 'Google News Technology',
      language: 'en',
      items: [
        {
          title: 'Major launch expands service in Canada - Example Source',
          contentSnippet: 'Analysts in Ottawa expect broader adoption across Canada this year.',
          link: 'https://example.com/google-news-tech-1',
          guid: 'https://example.com/google-news-tech-1#1',
          categories: ['Technology'],
          isoDate: '2026-03-07T15:30:00.000Z',
          source: { _url: 'https://example.com' }
        }
      ]
    });

    const articles = await newsRoutes.adapters.fetchGoogleNewsSource('technology');

    expect(mockParseUrl).toHaveBeenCalledWith(
      'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFZxYUdjU0FtVnVLQUFQAQ?hl=en-US&gl=US&ceid=US:en'
    );
    expect(articles).toHaveLength(1);
    expect(articles[0].category).toBe('technology');
    expect(articles[0].feedCategory).toBe('Technology');
    expect(articles[0].publishedAt).toBeInstanceOf(Date);
    expect(articles[0].publishedAt.toISOString()).toBe('2026-03-07T15:30:00.000Z');
    expect(articles[0].locations).toContain('canada');
    expect(articles[0].localityLevel).toBe('country');
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

describe('AP, Reuters, and PBS adapters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeocode.mockReset();
    mockGeocode.mockResolvedValue([]);
    mockParseUrl.mockReset();
    mockParseUrl.mockRejectedValue(new Error('parse error'));
    newsRoutes.internals.geocodeContextCache.clear();
  });

  it('exports AP, Reuters, and PBS feed maps and adapters', () => {
    expect(newsRoutes.adapters.fetchApSource).toBeDefined();
    expect(newsRoutes.adapters.fetchReutersSource).toBeDefined();
    expect(newsRoutes.adapters.fetchPbsSource).toBeDefined();

    const apMap = newsRoutes.internals.AP_FEED_MAP;
    expect(apMap.top.url).toBe('https://apnews.com/hub/ap-top-news/rss');
    expect(apMap.world.category).toBe('world');
    expect(apMap.technology.category).toBe('technology');

    const reutersMap = newsRoutes.internals.REUTERS_FEED_MAP;
    expect(reutersMap.top.url).toBe('https://www.reutersagency.com/feed/?best-topics=topNews');
    expect(reutersMap.business.category).toBe('business');
    expect(reutersMap.technology.category).toBe('technology');

    const pbsMap = newsRoutes.internals.PBS_FEED_MAP;
    expect(pbsMap.newsHour.url).toBe('https://www.pbs.org/newshour/rss/');
    expect(pbsMap.newsHour.category).toBe('general');
  });

  it('stores category, metadata, publication date, and fallback location for AP article', async () => {
    mockParseUrl.mockResolvedValueOnce({
      language: 'en',
      title: 'AP News Feed',
      items: [
        {
          title: 'America announces new policy',
          contentSnippet: 'Officials shared additional details.',
          link: 'https://apnews.com/article/abc123',
          guid: 'ap-abc123',
          categories: ['politics'],
          isoDate: '2026-03-08T12:00:00.000Z'
        }
      ]
    });

    const articles = await newsRoutes.adapters.fetchApSource('politics', {
      url: 'https://apnews.com/hub/politics/rss',
      category: 'politics',
      label: 'AP Politics'
    });

    expect(articles).toHaveLength(1);
    expect(articles[0].category).toBe('politics');
    expect(articles[0].feedSource).toBe('associated-press');
    expect(articles[0].feedCategory).toBe('AP Politics');
    expect(articles[0].publishedAt.toISOString()).toBe('2026-03-08T12:00:00.000Z');
    expect(articles[0].locations).toContain('united states');
  });

  it('stores category and publication date for Reuters article', async () => {
    mockParseUrl.mockResolvedValueOnce({
      language: 'en',
      title: 'Reuters Feed',
      items: [
        {
          title: 'Markets rally worldwide',
          contentSnippet: 'Investors reacted positively in Tokyo and London.',
          link: 'https://www.reuters.com/world/xyz',
          guid: 'reuters-xyz',
          categories: ['business'],
          isoDate: '2026-03-09T07:30:00.000Z'
        }
      ]
    });

    const articles = await newsRoutes.adapters.fetchReutersSource('business', {
      url: 'https://www.reutersagency.com/feed/?best-topics=businessNews',
      category: 'business',
      label: 'Reuters Business'
    });

    expect(articles).toHaveLength(1);
    expect(articles[0].category).toBe('business');
    expect(articles[0].feedSource).toBe('reuters');
    expect(articles[0].feedCategory).toBe('Reuters Business');
    expect(articles[0].publishedAt.toISOString()).toBe('2026-03-09T07:30:00.000Z');
  });

  it('stores category and publication date for PBS article', async () => {
    mockParseUrl.mockResolvedValueOnce({
      language: 'en',
      title: 'PBS NewsHour',
      items: [
        {
          title: 'PBS evening update',
          contentSnippet: 'Top stories from the day.',
          link: 'https://www.pbs.org/newshour/show/sample',
          guid: 'pbs-sample',
          categories: ['news'],
          isoDate: '2026-03-09T22:15:00.000Z'
        }
      ]
    });

    const articles = await newsRoutes.adapters.fetchPbsSource('newsHour', {
      url: 'https://www.pbs.org/newshour/rss/',
      category: 'general',
      label: 'PBS NewsHour'
    });

    expect(articles).toHaveLength(1);
    expect(articles[0].category).toBe('general');
    expect(articles[0].feedSource).toBe('pbs');
    expect(articles[0].feedCategory).toBe('PBS NewsHour');
    expect(articles[0].publishedAt.toISOString()).toBe('2026-03-09T22:15:00.000Z');
  });
});

describe('Country variants fallback (inferLocationFromCountryVariants)', () => {
  it('is exported as an internal', () => {
    expect(newsRoutes.internals.inferLocationFromCountryVariants).toBeDefined();
    expect(typeof newsRoutes.internals.inferLocationFromCountryVariants).toBe('function');
  });

  it('exports COUNTRY_VARIANTS_MAP with major countries', () => {
    const map = newsRoutes.internals.COUNTRY_VARIANTS_MAP;
    expect(map).toBeDefined();
    expect(map instanceof Map).toBe(true);
    expect(map.has('united states')).toBe(true);
    expect(map.has('united kingdom')).toBe(true);
    expect(map.has('australia')).toBe(true);
    expect(map.has('germany')).toBe(true);
    expect(map.has('france')).toBe(true);
    expect(map.get('united states').length).toBeGreaterThanOrEqual(4);
    expect(map.get('united kingdom').length).toBeGreaterThanOrEqual(4);
  });

  it('detects country by canonical name in title', () => {
    const fn = newsRoutes.internals.inferLocationFromCountryVariants;
    expect(fn('Crisis in Germany', '')).toContain('germany');
  });

  it('detects country by short alias (usa → united states)', () => {
    const fn = newsRoutes.internals.inferLocationFromCountryVariants;
    const tokens = fn('USA trade deal announced', '');
    expect(tokens).toContain('united states');
  });

  it('detects country by alternate name (america → united states)', () => {
    const fn = newsRoutes.internals.inferLocationFromCountryVariants;
    const tokens = fn('President of America signs bill', '');
    expect(tokens).toContain('united states');
  });

  it('detects country mentioned in description', () => {
    const fn = newsRoutes.internals.inferLocationFromCountryVariants;
    const tokens = fn('Breaking news', 'The British government responded to the crisis.');
    expect(tokens).toContain('united kingdom');
  });

  it('detects multiple countries in title and description', () => {
    const fn = newsRoutes.internals.inferLocationFromCountryVariants;
    const tokens = fn('Trade talks between France and Japan', 'Negotiations continue in Tokyo.');
    expect(tokens).toContain('france');
    expect(tokens).toContain('japan');
  });

  it('returns empty array when no country variant is found', () => {
    const fn = newsRoutes.internals.inferLocationFromCountryVariants;
    const tokens = fn('Local weather update', 'Clouds expected throughout the day.');
    expect(tokens).toEqual([]);
  });

  it('does not produce duplicates for a single country', () => {
    const fn = newsRoutes.internals.inferLocationFromCountryVariants;
    const tokens = fn('Australia and the aussie economy', 'Australian officials commented.');
    const count = tokens.filter(t => t === 'australia').length;
    expect(count).toBe(1);
  });
});

describe('BBC fallback location detection (integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeocode.mockReset();
    mockGeocode.mockResolvedValue([]);
    mockParseUrl.mockReset();
    mockParseUrl.mockRejectedValue(new Error('parse error'));
    newsRoutes.internals.geocodeContextCache.clear();
  });

  it('assigns country-level location when title mentions a country variant', async () => {
    mockParseUrl.mockResolvedValueOnce({
      language: 'en-gb',
      items: [
        {
          title: 'Chancellor unveils economic plans',
          contentSnippet: 'The British Prime Minister announced sweeping reforms.',
          link: 'https://www.bbc.co.uk/news/uk-politics-123',
          guid: 'https://www.bbc.co.uk/news/uk-politics-123#1',
          categories: ['politics'],
          isoDate: '2026-03-03T10:00:00.000Z'
        }
      ]
    });

    const articles = await newsRoutes.adapters.fetchBbcSource('politics', {
      url: 'https://feeds.bbci.co.uk/news/politics/rss.xml',
      category: 'politics',
      label: 'BBC Politics'
    });

    expect(articles).toHaveLength(1);
    expect(articles[0].locations).toContain('united kingdom');
    expect(articles[0].localityLevel).toBe('country');
  });

  it('assigns country-level location when description mentions a country variant', async () => {
    mockParseUrl.mockResolvedValueOnce({
      language: 'en-gb',
      items: [
        {
          title: 'Scientists make new discovery',
          contentSnippet: 'Researchers in Australia have announced a breakthrough.',
          link: 'https://www.bbc.co.uk/news/science-456',
          guid: 'https://www.bbc.co.uk/news/science-456#1',
          categories: ['science'],
          isoDate: '2026-03-04T08:30:00.000Z'
        }
      ]
    });

    const articles = await newsRoutes.adapters.fetchBbcSource('science', {
      url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
      category: 'science',
      label: 'BBC Science'
    });

    expect(articles).toHaveLength(1);
    expect(articles[0].locations).toContain('australia');
    expect(articles[0].localityLevel).toBe('country');
  });

  it('stores the correct category for each BBC section', async () => {
    const testCases = [
      { section: 'sport', feedConfig: { url: 'https://feeds.bbci.co.uk/sport/rss.xml', category: 'sports', label: 'BBC Sport' }, expectedCategory: 'sports' },
      { section: 'football', feedConfig: { url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', category: 'sports', label: 'BBC Football' }, expectedCategory: 'sports' },
      { section: 'education', feedConfig: { url: 'https://feeds.bbci.co.uk/news/education/rss.xml', category: 'general', label: 'BBC Education' }, expectedCategory: 'general' },
      { section: 'magazine', feedConfig: { url: 'https://feeds.bbci.co.uk/news/magazine/rss.xml', category: 'general', label: 'BBC Magazine' }, expectedCategory: 'general' }
    ];

    for (const { section, feedConfig, expectedCategory } of testCases) {
      mockParseUrl.mockResolvedValueOnce({
        language: 'en',
        items: [
          {
            title: `Sample ${section} article`,
            contentSnippet: 'No location signals here.',
            link: `https://www.bbc.co.uk/${section}/article-1`,
            guid: `https://www.bbc.co.uk/${section}/article-1#1`,
            categories: [section],
            isoDate: '2026-03-05T12:00:00.000Z'
          }
        ]
      });

      const articles = await newsRoutes.adapters.fetchBbcSource(section, feedConfig);
      expect(articles).toHaveLength(1);
      expect(articles[0].category).toBe(expectedCategory);
    }
  });

  it('stores publication date correctly from isoDate', async () => {
    mockParseUrl.mockResolvedValueOnce({
      language: 'en',
      items: [
        {
          title: 'Test article',
          contentSnippet: 'Test description.',
          link: 'https://www.bbc.co.uk/news/test-789',
          guid: 'https://www.bbc.co.uk/news/test-789#1',
          categories: ['general'],
          isoDate: '2026-03-07T15:30:00.000Z'
        }
      ]
    });

    const articles = await newsRoutes.adapters.fetchBbcSource('top', {
      url: 'https://feeds.bbci.co.uk/news/rss.xml',
      category: 'general',
      label: 'BBC Top Stories'
    });

    expect(articles).toHaveLength(1);
    expect(articles[0].publishedAt).toBeInstanceOf(Date);
    expect(articles[0].publishedAt.toISOString()).toBe('2026-03-07T15:30:00.000Z');
  });
});
