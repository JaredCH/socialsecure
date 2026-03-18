jest.mock('../models/NewsPreferences', () => ({
  findOne: jest.fn()
}));

jest.mock('../models/User', () => ({
  findById: jest.fn()
}));

jest.mock('./locationCacheService', () => ({
  getArticlesForLocation: jest.fn()
}));

jest.mock('./locationNormalizer', () => ({
  resolvePrimaryLocation: jest.fn()
}));

const NewsPreferences = require('../models/NewsPreferences');
const User = require('../models/User');
const { getArticlesForLocation } = require('./locationCacheService');
const { resolvePrimaryLocation } = require('./locationNormalizer');
const { buildFeed } = require('./newsFeedBuilder');

describe('newsFeedBuilder marijuana category filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    NewsPreferences.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        locations: [{ city: 'Austin', state: 'TX', country: 'US', isPrimary: true }]
      })
    });
    resolvePrimaryLocation.mockResolvedValue({
      city: 'Austin',
      stateCode: 'TX',
      countryCode: 'US',
      locationKey: 'austin-tx-us'
    });
  });

  it('includes marijuana-category articles when filtering the marijuana feed', async () => {
    getArticlesForLocation.mockResolvedValue({
      cacheHit: true,
      locationKey: 'austin-tx-us',
      articles: [
        { _id: 'm-1', category: 'marijuana', tier: 'local' },
        { _id: 'g-1', category: 'general', tier: 'local' }
      ]
    });

    const result = await buildFeed('user-1', { category: 'marijuana', limit: 5 });

    expect(result.articles).toEqual([
      expect.objectContaining({ _id: 'm-1', category: 'marijuana' })
    ]);
    expect(getArticlesForLocation).toHaveBeenCalledWith('austin-tx-us', expect.any(Object));
  });
});

describe('newsFeedBuilder location resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves a TX user profile location and requests location-scoped articles', async () => {
    NewsPreferences.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });
    const profile = {
      city: 'San Marcos',
      state: 'TX',
      country: 'US',
      zipCode: '78666'
    };
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(profile)
      })
    });
    resolvePrimaryLocation.mockResolvedValue({
      city: 'San Marcos',
      stateCode: 'TX',
      countryCode: 'US',
      locationKey: 'san-marcos-tx-us'
    });
    getArticlesForLocation.mockResolvedValue({
      cacheHit: false,
      locationKey: 'san-marcos-tx-us',
      articles: []
    });

    await buildFeed('user-tx', { category: 'all', limit: 5 });

    expect(resolvePrimaryLocation).toHaveBeenCalledWith(null, profile);
    expect(getArticlesForLocation).toHaveBeenCalledWith('san-marcos-tx-us', expect.any(Object));
  });

  it('returns an empty feed when location cannot be resolved', async () => {
    NewsPreferences.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      })
    });
    resolvePrimaryLocation.mockResolvedValue(null);

    const result = await buildFeed('user-unknown', { category: 'all', limit: 5 });

    expect(getArticlesForLocation).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      articles: [],
      location: null,
      feed: []
    }));
  });
});
