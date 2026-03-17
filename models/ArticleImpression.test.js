const ArticleImpression = require('./ArticleImpression');

describe('ArticleImpression model', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores article reference for link-based impressions', async () => {
    const updateSpy = jest.spyOn(ArticleImpression, 'findOneAndUpdate').mockResolvedValue({ _id: 'imp-1' });

    await ArticleImpression.upsertImpression(
      '69ab25567f15f53c907561c1',
      'https://example.com/story',
      'click',
      { articleLink: 'https://example.com/story' }
    );

    expect(updateSpy).toHaveBeenCalledWith(
      { user: '69ab25567f15f53c907561c1', articleKey: 'https://example.com/story' },
      expect.objectContaining({
        $set: expect.objectContaining({
          article: 'https://example.com/story',
          articleKey: 'https://example.com/story',
          articleLink: 'https://example.com/story'
        })
      }),
      { upsert: true, new: true }
    );
  });
});
