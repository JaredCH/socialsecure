jest.mock('../models/Article', () => ({
  find: jest.fn(),
  countDocuments: jest.fn()
}));

jest.mock('../models/NewsPreferences', () => ({
  findOne: jest.fn()
}));

jest.mock('../models/ArticleImpression', () => ({
  getDeprioritisedArticleIds: jest.fn()
}));

jest.mock('../models/User', () => ({
  findById: jest.fn()
}));

const Article = require('../models/Article');
const NewsPreferences = require('../models/NewsPreferences');
const ArticleImpression = require('../models/ArticleImpression');
const User = require('../models/User');
const { buildFeed } = require('./newsFeedBuilder');

function createFindChain(result) {
  const chain = {
    sort: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    lean: jest.fn().mockResolvedValue(result)
  };
  return chain;
}

describe('newsFeedBuilder marijuana category filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    NewsPreferences.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      })
    });
    ArticleImpression.getDeprioritisedArticleIds.mockResolvedValue([]);
    Article.countDocuments.mockResolvedValue(0);
  });

  it('includes marijuana topic-tagged articles when filtering the marijuana feed', async () => {
    const queries = [];
    Article.find.mockImplementation((query) => {
      queries.push(query);
      return createFindChain([]);
    });

    await buildFeed('user-1', { category: 'marijuana', limit: 5 });

    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) {
      expect(query.$and?.[1]).toEqual({
        $or: [
          { category: 'marijuana' },
          { topics: 'marijuana' }
        ]
      });
    }
    expect(Article.countDocuments).toHaveBeenCalledWith(expect.objectContaining({
      $and: expect.arrayContaining([
        expect.any(Object),
        {
          $or: [
            { category: 'marijuana' },
            { topics: 'marijuana' }
          ]
        }
      ])
    }));
  });
});

describe('newsFeedBuilder trending tier location scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ArticleImpression.getDeprioritisedArticleIds.mockResolvedValue([]);
    Article.countDocuments.mockResolvedValue(0);
  });

  it('excludes out-of-state local articles from the trending tier for a TX user', async () => {
    // User in Texas (78666 = San Marcos, TX)
    NewsPreferences.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          city: 'San Marcos',
          state: 'TX',
          country: 'US',
          zipCode: '78666'
        })
      })
    });

    const queries = [];
    Article.find.mockImplementation((query) => {
      queries.push(JSON.parse(JSON.stringify(query)));
      return createFindChain([]);
    });

    await buildFeed('user-tx', { category: 'all', limit: 5 });

    // The trending tier query (tier 4) should contain a location scope filter.
    // We look for a query with the viralScore threshold and the $or clause that
    // excludes out-of-state local articles.
    const trendingQuery = queries.find(
      (q) => q.viralScore && q.$or && q.$or.some((clause) => clause.pipeline && clause.pipeline.$ne === 'local')
    );

    expect(trendingQuery).toBeDefined();
    // Must include a clause allowing the user's state through
    const stateClause = trendingQuery.$or.find((c) => c['locationTags.states'] === 'tx');
    expect(stateClause).toBeDefined();
  });

  it('does not add location filter to trending tier when user has no state', async () => {
    NewsPreferences.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      })
    });

    const queries = [];
    Article.find.mockImplementation((query) => {
      queries.push(JSON.parse(JSON.stringify(query)));
      return createFindChain([]);
    });

    await buildFeed('user-unknown', { category: 'all', limit: 5 });

    // No trending query should have the pipeline-exclusion $or clause
    const trendingQueries = queries.filter(
      (q) => q.viralScore && q.$or && q.$or.some((clause) => clause.pipeline && clause.pipeline.$ne === 'local')
    );
    expect(trendingQueries).toHaveLength(0);
  });
});
