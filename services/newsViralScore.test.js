const {
  calculateViralScore,
  createMomentumMap,
  getArticleMomentumSignal
} = require('./newsViralScore');

describe('newsViralScore', () => {
  const baseNow = new Date('2026-01-01T12:00:00.000Z');

  afterEach(() => {
    delete process.env.NEWS_VIRAL_PROMOTED_THRESHOLD;
  });

  test('is deterministic for same article and options', () => {
    const article = {
      title: 'Breaking Major Win as markets rally',
      description: 'Unprecedented move sparks reactions',
      publishedAt: '2026-01-01T11:00:00.000Z',
      topics: ['finance'],
      source: 'Daily Ledger'
    };

    const first = calculateViralScore(article, { now: baseNow, sourceMomentum: 50 });
    const second = calculateViralScore(article, { now: baseNow, sourceMomentum: 50 });

    expect(first).toEqual(second);
    expect(first.score).toBeGreaterThan(0);
  });

  test('applies freshness decay for older articles', () => {
    const fresh = calculateViralScore({
      title: 'New technology launch',
      description: '',
      publishedAt: '2026-01-01T11:30:00.000Z'
    }, { now: baseNow, sourceMomentum: 0 });

    const stale = calculateViralScore({
      title: 'New technology launch',
      description: '',
      publishedAt: '2025-12-25T11:30:00.000Z'
    }, { now: baseNow, sourceMomentum: 0 });

    expect(fresh.signals.freshness).toBeGreaterThan(stale.signals.freshness);
    expect(fresh.score).toBeGreaterThan(stale.score);
  });

  test('thresholding sets isPromoted based on configured threshold', () => {
    process.env.NEWS_VIRAL_PROMOTED_THRESHOLD = '40';
    const result = calculateViralScore({
      title: 'Breaking record wins',
      description: 'Watch the unbelievable reactions!',
      publishedAt: '2026-01-01T11:50:00.000Z'
    }, { now: baseNow, sourceMomentum: 50 });

    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.isPromoted).toBe(true);
  });

  test('applies spam penalty and clamps score', () => {
    const clean = calculateViralScore({
      title: 'Major update announced',
      description: 'Read the details',
      publishedAt: '2026-01-01T11:30:00.000Z'
    }, { now: baseNow, sourceMomentum: 0 });

    const spammy = calculateViralScore({
      title: 'MAJOR UPDATE!!! CLICK HERE FREE MONEY',
      description: 'buy now',
      publishedAt: '2026-01-01T11:30:00.000Z'
    }, { now: baseNow, sourceMomentum: 0 });

    expect(spammy.score).toBeLessThan(clean.score);
    expect(spammy.score).toBeGreaterThanOrEqual(0);
  });

  test('computes source momentum from independent source coverage', () => {
    const articles = [
      { title: 'Alpha event', topics: ['tech'], source: 'Source A', publishedAt: '2026-01-01T11:30:00.000Z' },
      { title: 'Alpha event update', topics: ['tech'], source: 'Source B', publishedAt: '2026-01-01T11:35:00.000Z' },
      { title: 'Alpha event analysis', topics: ['tech'], source: 'Source C', publishedAt: '2026-01-01T11:40:00.000Z' }
    ];
    const momentumMap = createMomentumMap(articles, baseNow);
    const momentum = getArticleMomentumSignal({ topics: ['tech'] }, momentumMap);

    expect(momentum).toBe(50);
  });
});
