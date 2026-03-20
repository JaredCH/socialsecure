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

  test('author can always view own social posts even with populated authorId', () => {
    const authorId = '507f1f77bcf86cd799439011';
    const post = new Post({
      authorId,
      targetFeedId: authorId,
      visibility: 'friends',
      relationshipAudience: 'social'
    });

    // Simulate populated authorId (as Mongoose .populate() would produce)
    post.authorId = { _id: authorId, username: 'alice', realName: 'Alice' };
    post.targetFeedId = { _id: authorId, username: 'alice', realName: 'Alice' };

    expect(post.canView(authorId, { isFriend: false, isSecureFriend: false })).toBe(true);
  });

  test('author can always view own secure posts even with populated authorId', () => {
    const authorId = '507f1f77bcf86cd799439011';
    const post = new Post({
      authorId,
      targetFeedId: authorId,
      visibility: 'friends',
      relationshipAudience: 'secure'
    });

    // Simulate populated authorId
    post.authorId = { _id: authorId, username: 'alice', realName: 'Alice' };
    post.targetFeedId = { _id: authorId, username: 'alice', realName: 'Alice' };

    expect(post.canView(authorId, { isFriend: false, isSecureFriend: false })).toBe(true);
  });

  test('target feed owner can view posts on their feed with populated targetFeedId', () => {
    const authorId = '507f1f77bcf86cd799439011';
    const targetId = '507f1f77bcf86cd799439012';
    const post = new Post({
      authorId,
      targetFeedId: targetId,
      visibility: 'friends',
      relationshipAudience: 'social'
    });

    // Simulate populated fields
    post.authorId = { _id: authorId, username: 'alice', realName: 'Alice' };
    post.targetFeedId = { _id: targetId, username: 'bob', realName: 'Bob' };

    expect(post.canView(targetId, { isFriend: false, isSecureFriend: false })).toBe(true);
  });

  test('non-friend cannot view social posts even with populated fields', () => {
    const authorId = '507f1f77bcf86cd799439011';
    const viewerId = '507f1f77bcf86cd799439099';
    const post = new Post({
      authorId,
      targetFeedId: authorId,
      visibility: 'friends',
      relationshipAudience: 'social'
    });

    // Simulate populated fields
    post.authorId = { _id: authorId, username: 'alice', realName: 'Alice' };
    post.targetFeedId = { _id: authorId, username: 'alice', realName: 'Alice' };

    expect(post.canView(viewerId, { isFriend: false, isSecureFriend: false })).toBe(false);
  });

  test('friend can view social posts with populated fields', () => {
    const authorId = '507f1f77bcf86cd799439011';
    const viewerId = '507f1f77bcf86cd799439099';
    const post = new Post({
      authorId,
      targetFeedId: authorId,
      visibility: 'friends',
      relationshipAudience: 'social'
    });

    // Simulate populated fields
    post.authorId = { _id: authorId, username: 'alice', realName: 'Alice' };
    post.targetFeedId = { _id: authorId, username: 'alice', realName: 'Alice' };

    expect(post.canView(viewerId, { isFriend: true, isSecureFriend: false })).toBe(true);
  });
});
