const Friendship = require('./Friendship');

describe('Friendship.getFriends', () => {
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
        _id: 'friendship-2',
        requester: { _id: 'viewer-1', username: 'viewer' },
        recipient: { _id: 'friend-2', username: 'bob' },
        requesterCategory: 'secure',
        recipientCategory: 'social',
        partnerStatus: 'pending',
        partnerRequestedBy: 'viewer-1'
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
