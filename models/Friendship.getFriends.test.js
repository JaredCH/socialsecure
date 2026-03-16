const Friendship = require('./Friendship');

describe('Friendship.getFriends', () => {
  it('returns an empty list when userId is missing', async () => {
    const find = jest.fn();
    const friends = await Friendship.getFriends.call({ find }, null);
    expect(friends).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('skips malformed populated friendships instead of throwing', async () => {
    const populate = jest.fn().mockResolvedValue([
      {
        _id: 'friendship-1',
        requester: null,
        recipient: { _id: 'friend-1', username: 'alice' },
        requesterCategory: 'social',
        recipientCategory: 'secure',
        partnerStatus: 'none'
      },
      {
        _id: 'friendship-1b',
        requester: { _id: 'viewer-1', username: 'viewer' },
        recipient: null,
        requesterCategory: 'secure',
        recipientCategory: 'social',
        partnerStatus: 'none'
      },
      {
        _id: 'friendship-1c',
        requester: null,
        recipient: null,
        requesterCategory: 'secure',
        recipientCategory: 'social',
        partnerStatus: 'none'
      },
      {
        _id: 'friendship-2',
        requester: { _id: 'viewer-1', username: 'viewer' },
        recipient: { _id: 'friend-2', username: 'bob' },
        requesterCategory: 'secure',
        recipientCategory: 'social',
        partnerStatus: 'pending',
        partnerRequestedBy: 'viewer-1'
      },
      {
        _id: 'friendship-3',
        requester: { _id: 'viewer-1', username: 'viewer' },
        recipient: { username: 'no-id-user' },
        requesterCategory: 'secure',
        recipientCategory: 'social',
        partnerStatus: 'none'
      }
    ]);
    const find = jest.fn().mockReturnValue({ populate });

    const friends = await Friendship.getFriends.call({ find }, 'viewer-1');

    expect(find).toHaveBeenCalled();
    expect(friends).toEqual([
      expect.objectContaining({
        _id: 'friend-2',
        username: 'bob',
        category: 'secure',
        partnerStatus: 'pending',
        partnerRequestedByViewer: true
      })
    ]);
  });
});
