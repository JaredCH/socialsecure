/**
 * Tests for local news source adapters (Patch, Reddit, Local Catalog).
 *
 * Validates:
 * - Adapter parse success with mock RSS data
 * - Error handling (returns [] on failure)
 * - Provider metadata mapping (sourceTier, sourceProviderId, sourceType)
 * - Location context tagging
 */

const mockGeocode = jest.fn();

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

jest.mock('../models/Article', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  findDuplicate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  deleteMany: jest.fn(),
  aggregate: jest.fn()
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
  find: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn()
}));

jest.mock('../models/User', () => ({
  findById: jest.fn()
}));
jest.mock('../models/NewsIngestionRecord', () => ({
  create: jest.fn(),
  deleteMany: jest.fn()
}));
jest.mock('node-geocoder', () => jest.fn(() => ({ geocode: mockGeocode })));

// Mock rss-parser
const mockParseURL = jest.fn();
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: mockParseURL
  }));
});

const newsModule = require('./news');
const { adapters } = newsModule;

// Mock RSS feed data
const mockPatchFeed = {
  title: 'Patch - Austin, TX',
  language: 'en',
  items: [
    {
      title: 'Austin City Council votes on new transit plan',
      contentSnippet: 'The Austin City Council approved a new transit plan for downtown Austin, TX.',
      link: 'https://patch.com/texas/austin/austin-council-transit-plan',
      guid: 'patch-austin-1',
      pubDate: new Date().toISOString(),
      categories: ['local news']
    },
    {
      title: 'New restaurant opens on South Congress',
      contentSnippet: 'A new restaurant opened on South Congress Avenue in Austin.',
      link: 'https://patch.com/texas/austin/new-restaurant-south-congress',
      guid: 'patch-austin-2',
      pubDate: new Date().toISOString(),
      categories: ['food']
    }
  ]
};

const mockRedditFeed = {
  title: 'r/Austin',
  language: 'en',
  items: [
    {
      title: 'Anyone know what happened on I-35 this morning?',
      contentSnippet: 'Saw a lot of emergency vehicles near downtown Austin.',
      link: 'https://www.reddit.com/r/Austin/comments/abc123',
      guid: 'reddit-austin-1',
      pubDate: new Date().toISOString()
    }
  ]
};

const mockTvAffiliateFeed = {
  title: 'KVUE Austin News',
  language: 'en',
  items: [
    {
      title: 'Breaking: Major storm system heading toward Central Texas',
      contentSnippet: 'A major storm system is expected to bring severe weather to the Austin area.',
      link: 'https://www.kvue.com/storm-central-texas',
      guid: 'kvue-1',
      pubDate: new Date().toISOString(),
      categories: ['weather', 'breaking news']
    }
  ]
};

describe('Local News Source Adapters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeocode.mockResolvedValue([]);
  });

  describe('fetchPatchSource', () => {
    it('returns articles from Patch RSS feed', async () => {
      mockParseURL.mockResolvedValueOnce(mockPatchFeed);

      const articles = await adapters.fetchPatchSource({
        city: 'Austin',
        stateAbbrev: 'tx'
      });

      expect(articles.length).toBe(2);
      expect(articles[0].sourceType).toBe('patch');
      expect(articles[0].sourceTier).toBe(3);
      expect(articles[0].sourceProviderId).toBe('patch');
      expect(articles[0].feedSource).toBe('patch');
      expect(articles[0].source).toContain('Austin');
    });

    it('returns empty array on missing city', async () => {
      const articles = await adapters.fetchPatchSource({
        stateAbbrev: 'tx'
      });
      expect(articles).toEqual([]);
    });

    it('returns empty array on parse error', async () => {
      mockParseURL.mockRejectedValueOnce(new Error('Network error'));

      const articles = await adapters.fetchPatchSource({
        city: 'Austin',
        stateAbbrev: 'tx'
      });
      expect(articles).toEqual([]);
    });

    it('includes location tags when v2 tagging is enabled', async () => {
      mockParseURL.mockResolvedValueOnce(mockPatchFeed);

      const articles = await adapters.fetchPatchSource({
        city: 'Austin',
        stateAbbrev: 'tx'
      });

      // Should have locationTags populated
      expect(articles[0].locationTags).toBeDefined();
      expect(articles[0].feedMetadata.patchCity).toBe('Austin');
      expect(articles[0].feedMetadata.patchState).toBe('tx');
    });
  });

  describe('fetchRedditLocalSource', () => {
    it('returns articles from Reddit subreddit RSS', async () => {
      mockParseURL.mockResolvedValueOnce(mockRedditFeed);

      const articles = await adapters.fetchRedditLocalSource('Austin', {
        city: 'Austin',
        stateAbbrev: 'tx'
      });

      expect(articles.length).toBe(1);
      expect(articles[0].sourceType).toBe('redditLocal');
      expect(articles[0].sourceTier).toBe(6);
      expect(articles[0].sourceProviderId).toBe('reddit-local');
      expect(articles[0].feedSource).toBe('reddit');
      expect(articles[0].source).toContain('r/Austin');
    });

    it('returns empty array on missing subreddit', async () => {
      const articles = await adapters.fetchRedditLocalSource('');
      expect(articles).toEqual([]);
    });

    it('returns empty array on parse error', async () => {
      mockParseURL.mockRejectedValueOnce(new Error('Network error'));

      const articles = await adapters.fetchRedditLocalSource('Austin', {});
      expect(articles).toEqual([]);
    });

    it('tags articles with city/state location', async () => {
      mockParseURL.mockResolvedValueOnce(mockRedditFeed);

      const articles = await adapters.fetchRedditLocalSource('Austin', {
        city: 'Austin',
        stateAbbrev: 'tx'
      });

      expect(articles[0].locations).toContain('austin');
      expect(articles[0].locations).toContain('tx');
      expect(articles[0].locationTags.cities).toContain('austin');
    });
  });

  describe('fetchLocalCatalogRssSource', () => {
    it('returns articles from TV affiliate feed', async () => {
      mockParseURL.mockResolvedValueOnce(mockTvAffiliateFeed);

      const articles = await adapters.fetchLocalCatalogRssSource(
        {
          url: 'https://www.kvue.com/feeds/syndication/rss/news',
          label: 'KVUE (ABC)',
          tier: 2,
          providerId: 'tv-affiliate',
          station: 'KVUE',
          network: 'ABC'
        },
        { city: 'Austin', stateAbbrev: 'tx' }
      );

      expect(articles.length).toBe(1);
      expect(articles[0].sourceType).toBe('tvAffiliate');
      expect(articles[0].sourceTier).toBe(2);
      expect(articles[0].sourceProviderId).toBe('tv-affiliate');
      expect(articles[0].feedMetadata.station).toBe('KVUE');
      expect(articles[0].feedMetadata.network).toBe('ABC');
    });

    it('returns articles from newspaper feed', async () => {
      mockParseURL.mockResolvedValueOnce({
        title: 'Austin American-Statesman',
        language: 'en',
        items: [{
          title: 'Downtown development project breaks ground',
          link: 'https://statesman.com/downtown-dev',
          guid: 'statesman-1',
          pubDate: new Date().toISOString()
        }]
      });

      const articles = await adapters.fetchLocalCatalogRssSource(
        {
          url: 'https://www.statesman.com/arcio/rss/',
          label: 'Austin American-Statesman',
          tier: 4,
          providerId: 'local-newspaper'
        },
        { city: 'Austin', stateAbbrev: 'tx' }
      );

      expect(articles.length).toBe(1);
      expect(articles[0].sourceType).toBe('localNewspaper');
      expect(articles[0].sourceTier).toBe(4);
      expect(articles[0].sourceProviderId).toBe('local-newspaper');
    });

    it('returns empty array on missing URL', async () => {
      const articles = await adapters.fetchLocalCatalogRssSource({});
      expect(articles).toEqual([]);
    });

    it('returns empty array on parse error', async () => {
      mockParseURL.mockRejectedValueOnce(new Error('404'));

      const articles = await adapters.fetchLocalCatalogRssSource(
        { url: 'https://bad-url.com/rss', label: 'Bad Source', tier: 2, providerId: 'tv-affiliate' },
        { city: 'Austin', stateAbbrev: 'tx' }
      );
      expect(articles).toEqual([]);
    });
  });

  describe('ingestLocalSources', () => {
    it('returns articles and metrics from enabled tiers', async () => {
      // Mock Google News adapter (Tier 1) and local sources
      mockParseURL.mockResolvedValue({
        title: 'Test Feed',
        language: 'en',
        items: [{
          title: 'Test Article',
          link: 'https://example.com/test',
          guid: 'test-1',
          pubDate: new Date().toISOString()
        }]
      });

      const result = await adapters.ingestLocalSources([
        { city: 'Las Vegas', stateAbbrev: 'nv', zipCode: '89101' }
      ]);

      expect(result.articles).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalSources).toBeGreaterThan(0);
    });

    it('returns empty results for empty locations', async () => {
      const result = await adapters.ingestLocalSources([]);
      expect(result.articles).toEqual([]);
      expect(result.metrics.totalSources).toBe(0);
    });
  });
});
