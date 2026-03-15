import { buildAlgorithmicSequence, buildInfiniteScrollBatch } from './newsAlgorithmHelper';

describe('newsAlgorithmHelper', () => {
  const categoryObjects = [
    { key: 'general', label: 'General' },
    { key: 'technology', label: 'Technology' },
    { key: 'breaking', label: 'Breaking' },
  ];

  const categoryStrings = ['general', 'technology'];

  it('keeps feed articles visible when categories are provided as objects', () => {
    const feed = [
      { _id: 'a1', category: 'general', viralScore: 10, title: 'General item' },
      { _id: 'a2', category: 'technology', viralScore: 20, title: 'Tech item' },
    ];

    const ordered = buildAlgorithmicSequence({}, feed, categoryObjects);

    expect(ordered.map((article) => article._id)).toEqual(expect.arrayContaining(['a1', 'a2']));
    expect(ordered.length).toBeGreaterThan(0);
  });

  it('accepts category key arrays for infinite scroll batches', () => {
    const feed = [
      { _id: 'b1', category: 'general', viralScore: 12, title: 'General item' },
      { _id: 'b2', category: 'technology', viralScore: 18, title: 'Tech item' },
    ];

    const batch = buildInfiniteScrollBatch(feed, categoryStrings, new Set());

    expect(batch.map((article) => article._id)).toEqual(expect.arrayContaining(['b1', 'b2']));
    expect(batch.length).toBe(2);
  });

  it('keeps the feed mostly date-ordered while boosting local and breaking items', () => {
    const ordered = buildAlgorithmicSequence(
      {
        local: [
          {
            _id: 'local-1',
            category: 'general',
            title: 'Local update',
            publishedAt: '2026-03-14T18:00:00.000Z',
            viralScore: 10,
            _tier: 'local',
          },
        ],
      },
      [
        {
          _id: 'recent-1',
          category: 'technology',
          title: 'Newest tech update',
          publishedAt: '2026-03-14T19:00:00.000Z',
          viralScore: 5,
        },
        {
          _id: 'breaking-1',
          category: 'breaking',
          title: 'Breaking bulletin',
          publishedAt: '2026-03-14T18:30:00.000Z',
          viralScore: 15,
          viralSignals: { urgencyTerms: 1 },
        },
      ],
      categoryObjects
    );

    expect(ordered[2]._id).toBe('recent-1');
    expect(ordered.slice(0, 2).map((article) => article._id)).toEqual(expect.arrayContaining(['breaking-1', 'local-1']));
  });
});