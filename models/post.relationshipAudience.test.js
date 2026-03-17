const Post = require('./Post');

describe('Post relationshipAudience visibility', () => {
  test('treats missing relationshipAudience as social for legacy posts and blocks guests', () => {
    const post = new Post({
      authorId: '507f1f77bcf86cd799439011',
      targetFeedId: '507f1f77bcf86cd799439011',
      visibility: 'public'
    });

    expect(post.canView(null)).toBe(false);
  });

  test('allows guest access to explicit public audience posts', () => {
    const post = new Post({
      authorId: '507f1f77bcf86cd799439011',
      targetFeedId: '507f1f77bcf86cd799439012',
      visibility: 'public',
      relationshipAudience: 'public'
    });

    expect(post.canView(null)).toBe(true);
  });

  test('blocks guest access to secure public posts', () => {
    const post = new Post({
      authorId: '507f1f77bcf86cd799439011',
      targetFeedId: '507f1f77bcf86cd799439012',
      visibility: 'public',
      relationshipAudience: 'secure'
    });

    expect(post.canView(null)).toBe(false);
  });

  test('allows secure audience only for secure friends', () => {
    const post = new Post({
      authorId: '507f1f77bcf86cd799439011',
      targetFeedId: '507f1f77bcf86cd799439011',
      visibility: 'friends',
      relationshipAudience: 'secure'
    });

    expect(post.canView('507f1f77bcf86cd799439099', { isFriend: true, isSecureFriend: false })).toBe(false);
    expect(post.canView('507f1f77bcf86cd799439099', { isFriend: true, isSecureFriend: true })).toBe(true);
  });
});
