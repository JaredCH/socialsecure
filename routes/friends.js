const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const TopFriend = require('../models/TopFriend');
const Presence = require('../models/Presence');
const { logEvent } = require('../utils/logEvent');
const { createNotification } = require('../services/notifications');
const { buildPresencePayload, getPresenceMapForUsers } = require('../services/realtime');
const { RELATIONSHIP_AUDIENCE_VALUES, normalizeRelationshipAudience } = require('../utils/relationshipAudience');

const VALID_FRIEND_CATEGORIES = [...RELATIONSHIP_AUDIENCE_VALUES];
const VALID_PARTNER_ACTIONS = ['request', 'accept', 'deny', 'clear'];
const TOP_FRIENDS_LIMIT = 5;

const logFriendEvent = (payload) => logEvent(payload);

const getViewerRelationshipAudience = (friendship, viewerId) => {
  const normalizedViewerId = String(viewerId || '');
  if (String(friendship?.requester || '') === normalizedViewerId) {
    return normalizeRelationshipAudience(friendship?.requesterRelationshipAudience);
  }
  if (String(friendship?.recipient || '') === normalizedViewerId) {
    return normalizeRelationshipAudience(friendship?.recipientRelationshipAudience);
  }
  return 'social';
};

const friendReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many friend requests, please slow down.' },
  keyGenerator: (req) => String(req?.user?._id || req.ip || req.socket?.remoteAddress || 'unknown')
});

const friendWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many friendship updates, please slow down.' },
  keyGenerator: (req) => String(req?.user?._id || req.ip || req.socket?.remoteAddress || 'unknown')
});

const friendMutationLimiter = friendWriteLimiter;

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', async (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    // Fetch full user from DB
    const dbUser = await User.findById(user.userId);
    if (!dbUser || dbUser.registrationStatus !== 'active') {
      return res.status(403).json({ error: 'User not found or inactive' });
    }
    
    req.user = dbUser;
    next();
  });
};

// Rate limiting for friend requests (prevent spam)
const friendRequestLimiter = (req, res, next) => {
  // Simple in-memory rate limiting (in production, use Redis or similar)
  const now = Date.now();
  if (!req.user._id) return next();
  
  // This is a simplified version - in production, use proper rate limiting
  next();
};

// POST /api/friends/request - Send a friend request
router.post('/request', authenticateToken, async (req, res) => {
  try {
    const { userId, message } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Cannot send friend request to yourself
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }
    
    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser || targetUser.registrationStatus !== 'active') {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if friendship already exists
    const existingFriendship = await Friendship.findFriendship(req.user._id, userId);
    
    if (existingFriendship) {
      // Handle different existing statuses
      if (existingFriendship.status === 'accepted') {
        return res.status(400).json({ error: 'You are already friends with this user' });
      }
      if (existingFriendship.status === 'pending') {
        // Check who sent the original request
        if (existingFriendship.requester.toString() === req.user._id.toString()) {
          return res.status(400).json({ error: 'Friend request already sent' });
        }
        // If recipient is sending request, they can accept instead
        return res.status(400).json({ error: 'You have a pending friend request from this user. Accept or decline it first.' });
      }
      if (existingFriendship.status === 'blocked') {
        return res.status(403).json({ error: 'Cannot send friend request to this user' });
      }
      if (existingFriendship.status === 'declined' || existingFriendship.status === 'removed') {
        // Allow re-sending request after decline/removal
        existingFriendship.status = 'pending';
        existingFriendship.requester = req.user._id;
        existingFriendship.recipient = userId;
        existingFriendship.message = message || null;
        existingFriendship.acceptedAt = null;
        existingFriendship.declinedAt = null;
        existingFriendship.blockedAt = null;
        existingFriendship.removedAt = null;
        existingFriendship.requesterCategory = 'social';
        existingFriendship.recipientCategory = 'social';
        await existingFriendship.save();

        await createNotification({
          recipientId: userId,
          senderId: req.user._id,
          type: 'follow',
          title: 'New follow request',
          body: `${req.user.username || req.user.realName || 'Someone'} sent you a follow request`,
          data: {
            url: '/social'
          }
        });
        
        return res.json({
          success: true,
          message: 'Friend request sent',
          friendship: existingFriendship
        });
      }
    }
    
    // Create new friend request
    const friendship = new Friendship({
      requester: req.user._id,
      recipient: userId,
      status: 'pending',
      message: message || null,
      requesterCategory: 'social',
      recipientCategory: 'social'
    });
    
    await friendship.save();

    await createNotification({
      recipientId: userId,
      senderId: req.user._id,
      type: 'follow',
      title: 'New follow request',
      body: `${req.user.username || req.user.realName || 'Someone'} sent you a follow request`,
      data: {
        url: '/social'
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'Friend request sent',
      friendship: {
        _id: friendship._id,
        status: friendship.status,
        createdAt: friendship.createdAt
      }
    });
  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// POST /api/friends/:id/accept - Accept a friend request
router.post('/:id/accept', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid friendship ID' });
    }
    
    const friendship = await Friendship.findById(id);
    
    if (!friendship) {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    
    // Only recipient can accept
    if (friendship.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to accept this request' });
    }
    
    if (friendship.status !== 'pending') {
      return res.status(400).json({ error: 'This request is no longer pending' });
    }
    
    // Update friendship status
    friendship.status = 'accepted';
    friendship.acceptedAt = new Date();
    if (!VALID_FRIEND_CATEGORIES.includes(friendship.requesterCategory)) {
      friendship.requesterCategory = 'social';
    }
    if (!VALID_FRIEND_CATEGORIES.includes(friendship.recipientCategory)) {
      friendship.recipientCategory = 'social';
    }
    await friendship.save();
    
    // Update friend counts for both users
    await User.updateOne(
      { _id: friendship.requester },
      { $inc: { friendCount: 1 } }
    );
    await User.updateOne(
      { _id: friendship.recipient },
      { $inc: { friendCount: 1 } }
    );

    await createNotification({
      recipientId: friendship.requester,
      senderId: friendship.recipient,
      type: 'system',
      title: 'Friend request accepted',
      body: `${req.user.username || req.user.realName || 'Someone'} accepted your friend request`,
      data: {
        url: '/social'
      }
    });
    
    res.json({
      success: true,
      message: 'Friend request accepted',
      friendship: {
        _id: friendship._id,
        status: friendship.status,
        acceptedAt: friendship.acceptedAt
      }
    });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// POST /api/friends/:id/decline - Decline a friend request
router.post('/:id/decline', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid friendship ID' });
    }
    
    const friendship = await Friendship.findById(id);
    
    if (!friendship) {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    
    // Only recipient can decline
    if (friendship.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to decline this request' });
    }
    
    if (friendship.status !== 'pending') {
      return res.status(400).json({ error: 'This request is no longer pending' });
    }
    
    friendship.status = 'declined';
    friendship.declinedAt = new Date();
    await friendship.save();

    await createNotification({
      recipientId: friendship.requester,
      senderId: friendship.recipient,
      type: 'system',
      title: 'Friend request declined',
      body: `${req.user.username || req.user.realName || 'Someone'} declined your friend request`,
      data: {
        url: '/friends'
      }
    });
    
    res.json({
      success: true,
      message: 'Friend request declined',
      friendship: {
        _id: friendship._id,
        status: friendship.status
      }
    });
  } catch (error) {
    console.error('Error declining friend request:', error);
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
});

// DELETE /api/friends/:id - Remove/unfriend or cancel request
router.delete('/:id', friendMutationLimiter, authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid friendship ID' });
    }
    
    const friendship = await Friendship.findById(id);
    
    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }
    
    const isRequester = friendship.requester.toString() === req.user._id.toString();
    const isRecipient = friendship.recipient.toString() === req.user._id.toString();
    
    if (!isRequester && !isRecipient) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // If pending request, requester can cancel; otherwise both can unfriend
    if (friendship.status === 'pending' && !isRequester) {
      return res.status(400).json({ error: 'Cannot remove a pending request you did not send' });
    }
    
    const wasPendingRequest = friendship.status === 'pending';

    // If accepted, update friend counts
    if (friendship.status === 'accepted') {
      await User.updateOne(
        { _id: friendship.requester },
        { $inc: { friendCount: -1 } }
      );
      await User.updateOne(
        { _id: friendship.recipient },
        { $inc: { friendCount: -1 } }
      );
      
      // Remove from top friends if present
      const requesterTopRemoval = await TopFriend.updateOne(
        { user: friendship.requester },
        { $pull: { friends: friendship.recipient } }
      );
      const recipientTopRemoval = await TopFriend.updateOne(
        { user: friendship.recipient },
        { $pull: { friends: friendship.requester } }
      );
      if ((requesterTopRemoval?.modifiedCount || 0) > 0 || (recipientTopRemoval?.modifiedCount || 0) > 0) {
        logFriendEvent({
          eventType: 'top8_entry_removed',
          userId: req.user._id,
          metadata: {
            friendshipId: friendship._id.toString(),
            reason: 'friend_removed'
          },
          req
        });
      }
    }
    
    friendship.status = 'removed';
    friendship.removedAt = new Date();
    friendship.partnerStatus = 'none';
    friendship.partnerRequestedBy = null;
    friendship.partnerRequestedAt = null;
    await friendship.save();

    if (wasPendingRequest) {
      await createNotification({
        recipientId: friendship.recipient,
        senderId: friendship.requester,
        type: 'system',
        title: 'Friend request canceled',
        body: `${req.user.username || req.user.realName || 'Someone'} canceled a friend request`,
        data: {
          url: '/friends'
        }
      });
    }
    
    res.json({
      success: true,
      message: wasPendingRequest ? 'Friend request canceled' : 'Friend removed'
    });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// POST /api/friends/:id/block - Block a user
router.post('/:id/block', friendMutationLimiter, authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid friendship ID' });
    }
    
    const friendship = await Friendship.findById(id);
    
    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }
    
    const isRequester = friendship.requester.toString() === req.user._id.toString();
    const isRecipient = friendship.recipient.toString() === req.user._id.toString();
    
    if (!isRequester && !isRecipient) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const wasAcceptedFriendship = friendship.status === 'accepted';
    
    // Update or create block
    friendship.status = 'blocked';
    friendship.blockedBy = req.user._id;
    friendship.blockReason = reason || null;
    friendship.blockedAt = new Date();
    friendship.partnerStatus = 'none';
    friendship.partnerRequestedBy = null;
    friendship.partnerRequestedAt = null;
    await friendship.save();
    
    // If was friends, decrease friend counts
    if (wasAcceptedFriendship) {
      await User.updateOne(
        { _id: friendship.requester },
        { $inc: { friendCount: -1 } }
      );
      await User.updateOne(
        { _id: friendship.recipient },
        { $inc: { friendCount: -1 } }
      );

      const requesterTopRemoval = await TopFriend.updateOne(
        { user: friendship.requester },
        { $pull: { friends: friendship.recipient } }
      );
      const recipientTopRemoval = await TopFriend.updateOne(
        { user: friendship.recipient },
        { $pull: { friends: friendship.requester } }
      );
      if ((requesterTopRemoval?.modifiedCount || 0) > 0 || (recipientTopRemoval?.modifiedCount || 0) > 0) {
        logFriendEvent({
          eventType: 'top8_entry_removed',
          userId: req.user._id,
          metadata: {
            friendshipId: friendship._id.toString(),
            reason: 'friend_blocked'
          },
          req
        });
      }
    }
    
    res.json({
      success: true,
      message: 'User blocked'
    });
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// PUT /api/friends/:id/category - Update viewer-owned friend category
router.put('/:id/category', friendMutationLimiter, authenticateToken, async (req, res) => {
  try {
    const { id: friendshipId } = req.params;
    const { category } = req.body;

    if (!mongoose.Types.ObjectId.isValid(friendshipId)) {
      return res.status(400).json({ error: 'Invalid friendship ID' });
    }
    if (!VALID_FRIEND_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Category must be social or secure' });
    }

    const friendship = await Friendship.findById(friendshipId);
    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }
    if (friendship.status !== 'accepted') {
      return res.status(400).json({ error: 'Category can only be updated for accepted friendships' });
    }

    const isRequester = friendship.requester.toString() === req.user._id.toString();
    const isRecipient = friendship.recipient.toString() === req.user._id.toString();
    if (!isRequester && !isRecipient) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (isRequester) {
      friendship.requesterCategory = category;
    } else {
      friendship.recipientCategory = category;
    }
    await friendship.save();

    logFriendEvent({
      eventType: 'friend_category_changed',
      userId: req.user._id,
      metadata: {
        friendshipId: friendship._id.toString(),
        category
      },
      req
    });

    res.json({
      success: true,
      category
    });
  } catch (error) {
    console.error('Error updating friend category:', error);
    res.status(500).json({ error: 'Failed to update friend category' });
  }
});

// PATCH /api/friends/:id/partner - Manage partner/spouse request flow
router.patch('/:id/partner', friendMutationLimiter, authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const action = String(req.body?.action || '').trim().toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid friendship ID' });
    }
    if (!VALID_PARTNER_ACTIONS.includes(action)) {
      return res.status(400).json({ error: 'Action must be request, accept, deny, or clear' });
    }

    const friendship = await Friendship.findById(id);
    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }
    if (friendship.status !== 'accepted') {
      return res.status(400).json({ error: 'Partner listing can only be managed for accepted friendships' });
    }

    const viewerId = String(req.user._id || '');
    const isRequester = String(friendship.requester || '') === viewerId;
    const isRecipient = String(friendship.recipient || '') === viewerId;
    if (!isRequester && !isRecipient) {
      return res.status(403).json({ error: 'Not authorized to update this friendship' });
    }

    const requestedByViewer = String(friendship.partnerRequestedBy || '') === viewerId;
    const currentStatus = ['none', 'pending', 'accepted'].includes(friendship.partnerStatus)
      ? friendship.partnerStatus
      : 'none';

    if (action === 'request') {
      friendship.partnerStatus = 'pending';
      friendship.partnerRequestedBy = req.user._id;
      friendship.partnerRequestedAt = new Date();
    } else if (action === 'accept') {
      if (currentStatus !== 'pending' || requestedByViewer) {
        return res.status(400).json({ error: 'No incoming partner request to accept' });
      }
      friendship.partnerStatus = 'accepted';
    } else if (action === 'deny') {
      if (currentStatus !== 'pending' || requestedByViewer) {
        return res.status(400).json({ error: 'No incoming partner request to deny' });
      }
      friendship.partnerStatus = 'none';
      friendship.partnerRequestedBy = null;
      friendship.partnerRequestedAt = null;
    } else {
      friendship.partnerStatus = 'none';
      friendship.partnerRequestedBy = null;
      friendship.partnerRequestedAt = null;
    }

    await friendship.save();

    return res.json({
      success: true,
      partner: {
        friendshipId: friendship._id,
        status: friendship.partnerStatus,
        requestedByViewer: String(friendship.partnerRequestedBy || '') === viewerId,
        canRespond: friendship.partnerStatus === 'pending' && String(friendship.partnerRequestedBy || '') !== viewerId,
        requestedAt: friendship.partnerRequestedAt || null
      }
    });
  } catch (error) {
    console.error('Error updating partner listing:', error);
    return res.status(500).json({ error: 'Failed to update partner listing' });
  }
});

// GET /api/friends - Get all accepted friends
router.get('/', friendReadLimiter, authenticateToken, async (req, res) => {
  try {
    const friends = await Friendship.getFriends(req.user._id);
    const friendIds = friends.map((friend) => friend._id);
    const acceptedFriendships = await Friendship.find({
      status: 'accepted',
      $or: [
        { requester: req.user._id },
        { recipient: req.user._id }
      ]
    }).select('requester recipient requesterRelationshipAudience recipientRelationshipAudience').lean();
    const audienceByFriendId = new Map();
    for (const friendship of acceptedFriendships) {
      const requester = String(friendship.requester || '');
      const recipient = String(friendship.recipient || '');
      const friendId = requester === String(req.user._id) ? recipient : requester;
      if (!friendId) continue;
      audienceByFriendId.set(friendId, getViewerRelationshipAudience(friendship, req.user._id));
    }

    const [presenceMap, friendUsers] = await Promise.all([
      getPresenceMapForUsers(friendIds),
      User.find({ _id: { $in: friendIds } }).select('_id realtimePreferences').lean()
    ]);

    const friendUserMap = new Map(friendUsers.map((entry) => [String(entry._id), entry]));
    const friendsWithPresence = friends.map((friend) => ({
      ...friend,
      relationshipAudience: audienceByFriendId.get(String(friend._id)) || 'social',
      partnerCanRespond: friend.partnerStatus === 'pending' && !friend.partnerRequestedByViewer,
      presence: buildPresencePayload(friend._id, presenceMap.get(String(friend._id)), friendUserMap.get(String(friend._id))?.realtimePreferences)
    }));
    
    res.json({
      success: true,
      friends: friendsWithPresence,
      count: friendsWithPresence.length
    });
  } catch (error) {
    console.error('Error getting friends:', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
});

// PATCH /api/friends/:id/audience - Set per-friend relationship audience
router.patch('/:id/audience', friendWriteLimiter, authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const requestedAudience = String(req.body?.relationshipAudience || '').trim().toLowerCase();
    if (!RELATIONSHIP_AUDIENCE_VALUES.includes(requestedAudience)) {
      return res.status(400).json({ error: 'Invalid relationship audience' });
    }
    const relationshipAudience = normalizeRelationshipAudience(requestedAudience);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid friendship ID' });
    }

    const friendship = await Friendship.findById(id);
    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    if (friendship.status !== 'accepted') {
      return res.status(400).json({ error: 'Relationship audience can only be set for accepted friendships' });
    }

    const viewerId = String(req.user._id || '');
    if (String(friendship.requester) === viewerId) {
      friendship.requesterRelationshipAudience = relationshipAudience;
    } else if (String(friendship.recipient) === viewerId) {
      friendship.recipientRelationshipAudience = relationshipAudience;
    } else {
      return res.status(403).json({ error: 'Not authorized to update this friendship' });
    }

    await friendship.save();

    return res.json({
      success: true,
      friendship: {
        _id: friendship._id,
        status: friendship.status,
        relationshipAudience
      }
    });
  } catch (error) {
    console.error('Error updating relationship audience:', error);
    return res.status(500).json({ error: 'Failed to update relationship audience' });
  }
});

// GET /api/friends/requests/incoming - Get incoming friend requests
router.get('/requests/incoming', authenticateToken, async (req, res) => {
  try {
    const requests = await Friendship.getIncomingRequests(req.user._id);
    
    const formattedRequests = requests.map(req => ({
      _id: req._id,
      user: {
        _id: req.requester._id,
        username: req.requester.username,
        realName: req.requester.realName,
        avatarUrl: req.requester.avatarUrl,
        city: req.requester.city,
        state: req.requester.state,
        country: req.requester.country
      },
      message: req.message,
      createdAt: req.createdAt
    }));
    
    res.json({
      success: true,
      requests: formattedRequests,
      count: formattedRequests.length
    });
  } catch (error) {
    console.error('Error getting incoming requests:', error);
    res.status(500).json({ error: 'Failed to get incoming requests' });
  }
});

// GET /api/friends/requests/outgoing - Get outgoing friend requests
router.get('/requests/outgoing', authenticateToken, async (req, res) => {
  try {
    const requests = await Friendship.getOutgoingRequests(req.user._id);
    
    const formattedRequests = requests.map(req => ({
      _id: req._id,
      user: {
        _id: req.recipient._id,
        username: req.recipient.username,
        realName: req.recipient.realName,
        avatarUrl: req.recipient.avatarUrl,
        city: req.recipient.city,
        state: req.recipient.state,
        country: req.recipient.country
      },
      message: req.message,
      createdAt: req.createdAt
    }));
    
    res.json({
      success: true,
      requests: formattedRequests,
      count: formattedRequests.length
    });
  } catch (error) {
    console.error('Error getting outgoing requests:', error);
    res.status(500).json({ error: 'Failed to get outgoing requests' });
  }
});

// GET /api/friends/top/:userIdOrUsername - Get top friends for a user
router.get('/top/:userIdOrUsername', authenticateToken, async (req, res) => {
  try {
    const { userIdOrUsername } = req.params;
    
    let targetUser;
    if (mongoose.Types.ObjectId.isValid(userIdOrUsername)) {
      targetUser = await User.findById(userIdOrUsername);
    } else {
      targetUser = await User.findOne({ username: userIdOrUsername.toLowerCase() });
    }
    
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check privacy settings
    const isOwner = targetUser._id.toString() === req.user._id.toString();
    const isFriend = await Friendship.findFriendship(req.user._id, targetUser._id);
    const isFriendStatus = isFriend && isFriend.status === 'accepted';
    
    let canViewTopFriends = false;
    if (targetUser.topFriendsPrivacy === 'public') {
      canViewTopFriends = true;
    } else if (targetUser.topFriendsPrivacy === 'friends' && (isOwner || isFriendStatus)) {
      canViewTopFriends = true;
    } else if (targetUser.topFriendsPrivacy === 'private' && isOwner) {
      canViewTopFriends = true;
    }
    
    if (!canViewTopFriends) {
      return res.status(403).json({ error: 'Top friends are private' });
    }
    
    const topFriend = await TopFriend.findOne({ user: targetUser._id })
      .populate('friends', 'username realName avatarUrl city state country');

    if (topFriend && (topFriend.maxFriends !== TOP_FRIENDS_LIMIT || topFriend.friends.length > TOP_FRIENDS_LIMIT)) {
      topFriend.maxFriends = TOP_FRIENDS_LIMIT;
      topFriend.friends = topFriend.friends.slice(0, TOP_FRIENDS_LIMIT);
      await topFriend.save();
    }
    
    res.json({
      success: true,
      topFriends: topFriend ? topFriend.friends : [],
      isOwner
    });
  } catch (error) {
    console.error('Error getting top friends:', error);
    res.status(500).json({ error: 'Failed to get top friends' });
  }
});

// PUT /api/friends/top - Update top friends order
router.put('/top', friendMutationLimiter, authenticateToken, async (req, res) => {
  try {
    const { friendIds } = req.body;
    
    if (!Array.isArray(friendIds)) {
      return res.status(400).json({ error: 'friendIds must be an array' });
    }
    
    const existingTopFriend = await TopFriend.findOne({ user: req.user._id }).select('friends').lean();
    const previousCount = Array.isArray(existingTopFriend?.friends) ? existingTopFriend.friends.length : 0;
    const topFriend = await TopFriend.updateOrder(req.user._id, friendIds);
    
    await topFriend.populate('friends', 'username realName avatarUrl city state country');

    if (topFriend.friends.length < previousCount) {
      logFriendEvent({
        eventType: 'top8_entry_removed',
        userId: req.user._id,
        metadata: {
          removedCount: previousCount - topFriend.friends.length,
          reason: 'manual_update'
        },
        req
      });
    }

    logFriendEvent({
      eventType: 'top8_updated',
      userId: req.user._id,
      metadata: {
        count: topFriend.friends.length
      },
      req
    });
    
    res.json({
      success: true,
      topFriends: topFriend.friends
    });
  } catch (error) {
    console.error('Error updating top friends:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to update top friends' });
  }
});

// GET /api/friends/privacy - Get privacy settings
router.get('/privacy', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      privacy: {
        friendListPrivacy: req.user.friendListPrivacy,
        topFriendsPrivacy: req.user.topFriendsPrivacy
      }
    });
  } catch (error) {
    console.error('Error getting privacy settings:', error);
    res.status(500).json({ error: 'Failed to get privacy settings' });
  }
});

// PUT /api/friends/privacy - Update privacy settings
router.put('/privacy', authenticateToken, async (req, res) => {
  try {
    const { friendListPrivacy, topFriendsPrivacy } = req.body;
    
    const updates = {};
    if (friendListPrivacy && ['public', 'friends', 'private'].includes(friendListPrivacy)) {
      updates.friendListPrivacy = friendListPrivacy;
    }
    if (topFriendsPrivacy && ['public', 'friends', 'private'].includes(topFriendsPrivacy)) {
      updates.topFriendsPrivacy = topFriendsPrivacy;
    }
    
    await User.findByIdAndUpdate(req.user._id, updates);
    
    res.json({
      success: true,
      message: 'Privacy settings updated',
      privacy: {
        friendListPrivacy: updates.friendListPrivacy || req.user.friendListPrivacy,
        topFriendsPrivacy: updates.topFriendsPrivacy || req.user.topFriendsPrivacy
      }
    });
  } catch (error) {
    console.error('Error updating privacy settings:', error);
    res.status(500).json({ error: 'Failed to update privacy settings' });
  }
});

// GET /api/friends/count - Get friend count
router.get('/count', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      count: req.user.friendCount || 0
    });
  } catch (error) {
    console.error('Error getting friend count:', error);
    res.status(500).json({ error: 'Failed to get friend count' });
  }
});

// GET /api/friends/relationship/:userId - Get relationship status with a user
router.get('/relationship/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const friendship = await Friendship.findFriendship(req.user._id, userId);
    
    let relationship = 'none';
    let category = null;
    if (friendship) {
      relationship = friendship.status;
      if (friendship.requester.toString() === req.user._id.toString()) {
        category = friendship.requesterCategory || 'social';
      } else if (friendship.recipient.toString() === req.user._id.toString()) {
        category = friendship.recipientCategory || 'social';
      }
    }
    
    const isOwner = req.user._id.toString() === userId;
    
    res.json({
      success: true,
      relationship,
      category,
      isOwner,
      friendshipId: friendship ? friendship._id : null,
      relationshipAudience: friendship ? getViewerRelationshipAudience(friendship, req.user._id) : 'social',
      partnerStatus: friendship ? (['none', 'pending', 'accepted'].includes(friendship.partnerStatus) ? friendship.partnerStatus : 'none') : 'none',
      partnerRequestedByViewer: friendship ? String(friendship.partnerRequestedBy || '') === String(req.user._id || '') : false,
      partnerCanRespond: friendship
        ? (
          (['none', 'pending', 'accepted'].includes(friendship.partnerStatus) ? friendship.partnerStatus : 'none') === 'pending'
          && String(friendship.partnerRequestedBy || '') !== String(req.user._id || '')
        )
        : false
    });
  } catch (error) {
    console.error('Error getting relationship:', error);
    res.status(500).json({ error: 'Failed to get relationship status' });
  }
});

// GET /api/friends/presence-summary - Lightweight online/offline counts for nav display
router.get('/presence-summary', friendReadLimiter, authenticateToken, async (req, res) => {
  try {
    const friends = await Friendship.getFriends(req.user._id);
    const friendIds = friends.map((f) => f._id);
    if (friendIds.length === 0) {
      return res.json({ success: true, online: 0, offline: friendIds.length, total: friendIds.length });
    }

    const [presenceMap, friendUsers] = await Promise.all([
      getPresenceMapForUsers(friendIds),
      User.find({ _id: { $in: friendIds } }).select('_id realtimePreferences').lean()
    ]);
    const friendUserMap = new Map(friendUsers.map((u) => [String(u._id), u]));

    let online = 0;
    for (const friendId of friendIds) {
      const payload = buildPresencePayload(
        friendId,
        presenceMap.get(String(friendId)),
        friendUserMap.get(String(friendId))?.realtimePreferences
      );
      if (payload.status === 'online' || payload.status === 'inactive') {
        online++;
      }
    }

    res.json({ success: true, online, offline: friendIds.length - online, total: friendIds.length });
  } catch (error) {
    console.error('Error getting presence summary:', error);
    res.status(500).json({ error: 'Failed to get presence summary' });
  }
});

module.exports = router;
