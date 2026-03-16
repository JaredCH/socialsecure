const mongoose = require('mongoose');
const Article = require('../models/Article');
const NewsIngestionRecord = require('../models/NewsIngestionRecord');

jest.mock('mongoose', () => ({
  connection: { readyState: 0 }
}));

jest.mock('../models/Article', () => ({
  deleteMany: jest.fn(),
  countDocuments: jest.fn(),
  find: jest.fn()
}));

jest.mock('../models/NewsIngestionRecord', () => ({
  deleteMany: jest.fn()
}));

process.env.NEWS_RETENTION_DAYS = '7';
process.env.NEWS_MAX_ARTICLES = '1000';
process.env.NEWS_MAX_ARTICLES_PRUNE_BATCH = '100';

const { purgeOldArticles } = require('./newsArticleCleanup');

describe('newsArticleCleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mongoose.connection.readyState = 1;
    Article.deleteMany.mockResolvedValue({ deletedCount: 0 });
    Article.countDocuments.mockResolvedValue(1000);
    NewsIngestionRecord.deleteMany.mockResolvedValue({ deletedCount: 0 });
  });

  it('skips cleanup when mongo is not connected', async () => {
    mongoose.connection.readyState = 0;

    const result = await purgeOldArticles();
    expect(result).toEqual({ skipped: true });
    expect(Article.deleteMany).not.toHaveBeenCalled();
  });

  it('prunes oldest articles in fixed-size batches when over hard cap', async () => {
    Article.countDocuments.mockResolvedValue(1105);
    const oldestRows = Array.from({ length: 100 }, (_, index) => ({ _id: `article-${index}` }));
    const lean = jest.fn().mockResolvedValue(oldestRows);
    const select = jest.fn().mockReturnValue({ lean });
    const limit = jest.fn().mockReturnValue({ select });
    const sort = jest.fn().mockReturnValue({ limit });
    Article.find.mockReturnValue({ sort });
    Article.deleteMany
      .mockResolvedValueOnce({ deletedCount: 1 })
      .mockResolvedValueOnce({ deletedCount: 100 });

    const result = await purgeOldArticles();

    expect(limit).toHaveBeenCalledWith(100);
    expect(Article.deleteMany).toHaveBeenLastCalledWith({
      _id: { $in: oldestRows.map((row) => row._id) }
    });
    expect(result.maxArticles).toBe(1000);
    expect(result.articlesPrunedForCap).toBe(100);
  });

  it('does not prune for cap when current total is below limit', async () => {
    Article.countDocuments.mockResolvedValue(999);

    const result = await purgeOldArticles();

    expect(Article.find).not.toHaveBeenCalled();
    expect(result.articlesPrunedForCap).toBe(0);
  });
});
