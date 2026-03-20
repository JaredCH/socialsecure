const { CATEGORY_FEEDS } = require('./newsCategoryFeeds');

describe('newsCategoryFeeds production URL sanity', () => {
  it('uses AP and Reuters endpoints that avoid retired feeds domains', () => {
    const allFeeds = Object.values(CATEGORY_FEEDS).flatMap((entry) => entry.feeds || []);
    const feedUrls = allFeeds.map((feed) => feed.url);

    for (const url of feedUrls) {
      expect(url).not.toContain('feeds.apnews.com');
      expect(url).not.toContain('feeds.reuters.com');
    }
  });

  it('verifies critical feed URLs match expected working endpoints', () => {
    expect(CATEGORY_FEEDS.general.feeds).toContainEqual(
      expect.objectContaining({
        name: 'AP Top News',
        url: 'https://apnews.com/hub/ap-top-news/rss'
      })
    );

    expect(CATEGORY_FEEDS.breaking.feeds).toContainEqual(
      expect.objectContaining({
        name: 'Reuters Top News',
        url: 'https://www.reutersagency.com/feed/?best-topics=topNews'
      })
    );

    expect(CATEGORY_FEEDS.politics.feeds).toContainEqual(
      expect.objectContaining({
        name: 'Politico',
        url: 'https://rss.politico.com/politics-news.xml'
      })
    );
  });
});
