const mockParseURL = jest.fn();

jest.mock('rss-parser', () => jest.fn().mockImplementation(() => ({
  parseURL: mockParseURL
})));

jest.mock('../models/Article', () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  create: jest.fn()
}));

jest.mock('../config/newsCategoryFeeds', () => ({
  CATEGORY_FEEDS: {
    technology: {
      feeds: [{ name: 'Tech Feed', url: 'https://example.com/tech.xml' }]
    },
    marijuana: {
      feeds: [{ name: 'Marijuana Feed', url: 'https://example.com/marijuana.xml' }]
    }
  },
  CATEGORY_ORDER: ['technology', 'marijuana']
}));

jest.mock('./newsViralScore', () => ({
  calculateViralScore: jest.fn(() => ({ score: 0, signals: {}, isPromoted: false })),
  createMomentumMap: jest.fn(() => ({}))
}));

jest.mock('./newsRssImage', () => ({
  extractRssImageUrl: jest.fn(() => null)
}));

const Article = require('../models/Article');
const { ingestCategory } = require('./newsIngestion.categories');

describe('newsIngestion.categories marijuana tagging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParseURL.mockResolvedValue({ items: [] });
    Article.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });
    Article.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Article.updateMany.mockResolvedValue({ modifiedCount: 0 });
    Article.create.mockResolvedValue({ _id: 'created-1' });
  });

  it('adds the marijuana topic to newly ingested non-marijuana articles that match safe terms', async () => {
    mockParseURL.mockResolvedValue({
      items: [
        {
          title: 'THCA regulation update',
          link: 'https://example.com/article-1',
          contentSnippet: 'State lawmakers review labelling rules.'
        }
      ]
    });

    const result = await ingestCategory('technology');

    expect(result.inserted).toBe(1);
    expect(Article.create).toHaveBeenCalledWith(expect.objectContaining({
      category: 'technology',
      topics: ['marijuana']
    }));
    expect(Article.updateMany).not.toHaveBeenCalled();
  });

  it('retags existing database articles and duplicate matches for the marijuana category', async () => {
    mockParseURL.mockResolvedValue({
      items: [
        {
          title: 'Policy update',
          link: 'https://example.com/article-2',
          contentSnippet: 'Fresh coverage from the cannabis market.'
        }
      ]
    });
    Article.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'existing-article',
        topics: []
      })
    });
    Article.updateMany.mockResolvedValue({ modifiedCount: 3 });

    const result = await ingestCategory('marijuana');

    expect(result).toEqual(expect.objectContaining({
      categoryKey: 'marijuana',
      duplicates: 1,
      retagged: 3
    }));
    expect(Article.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        topics: { $ne: 'marijuana' }
      }),
      { $addToSet: { topics: 'marijuana' } }
    );
    expect(Article.updateOne).toHaveBeenCalledWith(
      { _id: 'existing-article' },
      { $addToSet: { topics: 'marijuana' } }
    );
  });
});

describe('newsIngestion.categories location tagging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParseURL.mockResolvedValue({ items: [] });
    Article.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });
    Article.updateOne.mockResolvedValue({ modifiedCount: 0 });
    Article.updateMany.mockResolvedValue({ modifiedCount: 0 });
    Article.create.mockResolvedValue({ _id: 'created-loc-1' });
  });

  it('extracts Florida location tags from title mentioning Florida', async () => {
    mockParseURL.mockResolvedValue({
      items: [
        {
          title: 'Florida Man arrested after bizarre incident',
          link: 'https://example.com/florida-man',
          contentSnippet: 'Local authorities responded quickly.'
        }
      ]
    });

    await ingestCategory('technology');

    expect(Article.create).toHaveBeenCalledWith(expect.objectContaining({
      locationTags: expect.objectContaining({
        states: expect.arrayContaining(['fl', 'florida']),
        countries: ['us']
      }),
      localityLevel: 'state',
      scopeReason: 'state_mention'
    }));
  });

  it('extracts city-level location tags from "Tampa, FL" pattern', async () => {
    mockParseURL.mockResolvedValue({
      items: [
        {
          title: 'New tech hub announced in Tampa, FL',
          link: 'https://example.com/tampa-tech',
          contentSnippet: 'The development will create 500 jobs.'
        }
      ]
    });

    await ingestCategory('technology');

    expect(Article.create).toHaveBeenCalledWith(expect.objectContaining({
      locationTags: expect.objectContaining({
        cities: expect.arrayContaining(['tampa']),
        states: expect.arrayContaining(['fl', 'florida'])
      }),
      localityLevel: 'city',
      scopeReason: 'city_mention'
    }));
  });

  it('keeps global locality for articles with no location signals', async () => {
    mockParseURL.mockResolvedValue({
      items: [
        {
          title: 'AI research breakthrough stuns experts',
          link: 'https://example.com/ai-research',
          contentSnippet: 'The new model outperforms all benchmarks.'
        }
      ]
    });

    await ingestCategory('technology');

    expect(Article.create).toHaveBeenCalledWith(expect.objectContaining({
      localityLevel: 'global',
      scopeReason: 'source_default'
    }));
  });
});
