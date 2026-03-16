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
