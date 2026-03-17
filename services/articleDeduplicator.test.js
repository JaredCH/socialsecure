const { normalizeTitle, deduplicateArticles } = require('./articleDeduplicator');

describe('articleDeduplicator', () => {
  it('normalizes publisher suffixes out of titles', () => {
    expect(normalizeTitle('Fire in San Marcos - KXAN')).toBe('fire in san marcos');
    expect(normalizeTitle('Fire in San Marcos — KVUE')).toBe('fire in san marcos');
  });

  it('prefers higher-tier articles when deduplicating', () => {
    const articles = deduplicateArticles([
      { title: 'Fire in San Marcos - KXAN', link: 'https://example.com/state', tier: 'state', publishedAt: '2026-03-17T10:00:00.000Z' },
      { title: 'Fire in San Marcos - Local Paper', link: 'https://example.com/local', tier: 'local', publishedAt: '2026-03-17T09:00:00.000Z' },
      { title: 'National update', link: 'https://example.com/national', tier: 'national', publishedAt: '2026-03-17T08:00:00.000Z' }
    ]);

    expect(articles).toHaveLength(2);
    expect(articles[0]).toMatchObject({
      title: 'Fire in San Marcos - Local Paper',
      tier: 'local',
      normalizedTitle: 'fire in san marcos'
    });
  });
});
