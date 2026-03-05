const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const Post = require('../models/Post');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const BlockList = require('../models/BlockList');
const MuteList = require('../models/MuteList');
const { createNotification } = require('../services/notifications');

const MEDIA_URL_MAX_ITEMS = 8;
const MEDIA_URL_MAX_LENGTH = 2048;
const HTTP_URL_REGEX = /^https?:\/\/\S+$/i;
const VALID_VISIBILITY = ['public', 'friends', 'circles', 'specific_users', 'private'];

const parseViewerCoordinates = (req) => {
  const latitude = Number.parseFloat(req.query.latitude);
  const longitude = Number.parseFloat(req.query.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  return [longitude, latitude];
};

const getFriendIds = async (userId) => {
  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [
      { requester: userId },
      { recipient: userId }
    ]
  }).select('requester recipient').lean();

  const ids = new Set();
  for (const friendship of friendships) {
    const requester = String(friendship.requester);
    const recipient = String(friendship.recipient);
    ids.add(requester === String(userId) ? recipient : requester);
  }
  return ids;
};

const getBlockedOrMutedIds = async (viewerId) => {
  const [blocks, blockedByOthers, mutes] = await Promise.all([
    BlockList.find({ userId: viewerId }).select('blockedUserId').lean(),
    BlockList.find({ blockedUserId: viewerId }).select('userId').lean(),
    MuteList.find({ userId: viewerId }).select('mutedUserId').lean()
  ]);

  const blockedOrMuted = new Set();
  for (const row of blocks) blockedOrMuted.add(String(row.blockedUserId));
  for (const row of blockedByOthers) blockedOrMuted.add(String(row.userId));
  for (const row of mutes) blockedOrMuted.add(String(row.mutedUserId));
  return blockedOrMuted;
};

const normalizeObjectIdArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
};

const extractMentions = (content = '') => {
  const matches = String(content || '').match(/@([a-zA-Z0-9_.]{3,30})/g) || [];
  const usernames = new Set();
  for (const mention of matches) {
    usernames.add(mention.slice(1).toLowerCase());
  }
  return [...usernames];
};

const canViewerSeePost = (post, viewerId, friendIds, viewerCoordinates = null) => {
  return post.canView(viewerId, {
    isFriend: friendIds.has(String(post.authorId)),
    viewerCoordinates
  });
};

const sanitizeAndValidateMediaUrls = (mediaUrlsInput) => {
  if (mediaUrlsInput === undefined || mediaUrlsInput === null) {
    return { ok: true, mediaUrls: [] };
  }

  const candidateUrls = typeof mediaUrlsInput === 'string'
    ? [mediaUrlsInput]
    : mediaUrlsInput;

  if (!Array.isArray(candidateUrls)) {
    return {
      ok: false,
      error: 'Invalid "mediaUrls": expected an array of URL strings'
    };
  }

  const seen = new Set();
  const sanitized = [];

  for (let i = 0; i < candidateUrls.length; i += 1) {
    const rawUrl = candidateUrls[i];

    if (typeof rawUrl !== 'string') {
      return {
        ok: false,
        error: `Invalid "mediaUrls[${i}]": each media URL must be a string`
      };
    }

    const normalizedUrl = rawUrl.trim();
    if (!normalizedUrl) {
      continue;
    }

    if (normalizedUrl.length > MEDIA_URL_MAX_LENGTH) {
      return {
        ok: false,
        error: `Invalid "mediaUrls[${i}]": URL exceeds max length of ${MEDIA_URL_MAX_LENGTH} characters`
      };
    }

    if (!HTTP_URL_REGEX.test(normalizedUrl)) {
      return {
        ok: false,
        error: `Invalid "mediaUrls[${i}]": URL must begin with http:// or https://`
      };
    }

    const dedupeKey = normalizedUrl.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    sanitized.push(normalizedUrl);

    if (sanitized.length > MEDIA_URL_MAX_ITEMS) {
      return {
        ok: false,
        error: `Too many media URLs: maximum allowed is ${MEDIA_URL_MAX_ITEMS}`
      };
    }
  }

  return {
    ok: true,
    mediaUrls: sanitized
  };
};

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    try {
      const user = await User.findById(decoded.userId).select('onboardingStatus');
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      if (user.onboardingStatus !== 'completed') {
        return res.status(403).json({
          error: 'Complete onboarding before using feed features',
          code: 'ONBOARDING_REQUIRED'
        });
      }

      req.user = decoded;
      next();
    } catch (lookupError) {
      return res.status(500).json({ error: 'Authentication failed' });
    }
  });
};

// Get user's feed (posts where user is targetFeedId)
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const viewerId = String(req.user.userId || '');
    const viewerCoordinates = parseViewerCoordinates(req);
    const friendIds = await getFriendIds(viewerId);
    const blockedOrMuted = await getBlockedOrMutedIds(viewerId);

    const candidatePosts = await Post.find({
      targetFeedId: userId,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(Math.max(limit * 5, 100))
      .populate('authorId', 'username realName')
      .populate('targetFeedId', 'username realName');

    const visiblePosts = candidatePosts
      .filter((post) => !blockedOrMuted.has(String(post.authorId?._id || post.authorId)))
      .filter((post) => !blockedOrMuted.has(String(post.targetFeedId?._id || post.targetFeedId)))
      .filter((post) => canViewerSeePost(post, viewerId, friendIds, viewerCoordinates));

    const start = (page - 1) * limit;
    const posts = visiblePosts.slice(start, start + limit);

    res.json({
      success: true,
      posts,
      page,
      limit,
      total: visiblePosts.length
    });
  } catch (error) {
    console.error('Error fetching user feed:', error);
    res.status(500).json({ error: 'Failed to fetch feed', details: error.message });
  }
});

// Create a new post
router.post('/post', [
  authenticateToken,
  body('content').optional().trim().isLength({ max: 5000 }).withMessage('Content too long'),
  body('encryptedContent').optional().trim(),
  body('targetFeedId').isMongoId().withMessage('Valid target feed ID required'),
  body('visibility').optional().isIn(VALID_VISIBILITY).withMessage('Invalid visibility'),
  body('mediaUrls').optional(),
  body('visibleToCircles').optional().isArray({ max: 25 }).withMessage('visibleToCircles must be an array'),
  body('visibleToUsers').optional().isArray({ max: 200 }).withMessage('visibleToUsers must be an array'),
  body('excludeUsers').optional().isArray({ max: 200 }).withMessage('excludeUsers must be an array'),
  body('locationRadius').optional({ nullable: true }).isFloat({ min: 1, max: 1000 }),
  body('expiresAt').optional({ nullable: true }).isISO8601(),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const {
      content,
      encryptedContent,
      targetFeedId,
      visibility = 'public',
      visibleToCircles,
      visibleToUsers,
      excludeUsers,
      locationRadius,
      expiresAt,
      latitude,
      longitude,
      mediaUrls: mediaUrlsInput
    } = req.body;
    const authorId = String(req.user.userId || '');
    const normalizedTargetFeedId = String(targetFeedId || '');

    const blockRelation = await BlockList.findOne({
      $or: [
        { userId: authorId, blockedUserId: normalizedTargetFeedId },
        { userId: normalizedTargetFeedId, blockedUserId: authorId }
      ]
    }).select('_id').lean();

    if (blockRelation) {
      return res.status(403).json({ error: 'Cannot interact with this user due to block settings' });
    }

    const mediaUrlsValidation = sanitizeAndValidateMediaUrls(mediaUrlsInput);
    if (!mediaUrlsValidation.ok) {
      return res.status(400).json({
        error: mediaUrlsValidation.error,
        field: 'mediaUrls'
      });
    }
    
    // Check if target feed exists
    const targetUser = await User.findById(targetFeedId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }
    
    // Check permissions (users can post to their own feed or friends' feeds)
    if (normalizedTargetFeedId !== authorId) {
      const friendship = await Friendship.findOne({
        status: 'accepted',
        $or: [
          { requester: authorId, recipient: normalizedTargetFeedId },
          { requester: normalizedTargetFeedId, recipient: authorId }
        ]
      }).lean();

      if (!friendship) {
        return res.status(403).json({ error: 'Cannot post to this user\'s feed' });
      }
    }

    const normalizedVisibleToCircles = Array.isArray(visibleToCircles)
      ? [...new Set(visibleToCircles.map((circleName) => String(circleName || '').trim()).filter(Boolean).slice(0, 25))]
      : [];
    const normalizedVisibleToUsers = normalizeObjectIdArray(visibleToUsers).slice(0, 200);
    const normalizedExcludeUsers = normalizeObjectIdArray(excludeUsers).slice(0, 200);

    let effectiveVisibleToUsers = normalizedVisibleToUsers;

    if (visibility === 'circles') {
      if (normalizedVisibleToCircles.length === 0) {
        return res.status(400).json({ error: 'visibleToCircles is required for circles visibility' });
      }

      const authorUser = await User.findById(authorId).select('circles').lean();
      const allowedSet = new Set(normalizedVisibleToUsers);
      for (const circleName of normalizedVisibleToCircles) {
        const circle = (authorUser?.circles || []).find(
          (entry) => String(entry?.name || '').trim().toLowerCase() === circleName.toLowerCase()
        );
        if (circle && Array.isArray(circle.members)) {
          for (const member of circle.members) {
            allowedSet.add(String(member));
          }
        }
      }
      effectiveVisibleToUsers = [...allowedSet];
    }

    if (visibility === 'specific_users' && effectiveVisibleToUsers.length === 0) {
      return res.status(400).json({ error: 'visibleToUsers is required for specific_users visibility' });
    }

    if (effectiveVisibleToUsers.length > 0 && normalizedExcludeUsers.length > 0) {
      const excluded = new Set(normalizedExcludeUsers);
      effectiveVisibleToUsers = effectiveVisibleToUsers.filter((entry) => !excluded.has(entry));
    }

    let normalizedExpiresAt = null;
    if (expiresAt) {
      const parsed = new Date(expiresAt);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'expiresAt must be a future timestamp' });
      }
      normalizedExpiresAt = parsed;
    }
    
    const postData = {
      authorId,
      targetFeedId,
      content,
      encryptedContent,
      isEncrypted: !!encryptedContent,
      visibility,
      visibleToCircles: normalizedVisibleToCircles,
      visibleToUsers: effectiveVisibleToUsers,
      excludeUsers: normalizedExcludeUsers,
      locationRadius: Number.isFinite(Number(locationRadius)) ? Number(locationRadius) : null,
      expiresAt: normalizedExpiresAt,
      mediaUrls: mediaUrlsValidation.mediaUrls
    };
    
    // Add location if provided
    if (latitude && longitude) {
      postData.location = {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      };
    }
    
    const post = new Post(postData);
    await post.save();
    
    // Populate author and target user info
    await post.populate('authorId', 'username realName');
    await post.populate('targetFeedId', 'username realName');
    
    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Failed to create post', details: error.message });
  }
});

// Delete a post
router.delete('/post/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Check if user is author or owns the feed
    if (post.authorId.toString() !== userId && post.targetFeedId.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }
    
    await post.deleteOne();
    
    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: 'Failed to delete post', details: error.message });
  }
});

// Like a post
router.post('/post/:postId/like', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Check if user can view post before liking
    const friendIds = await getFriendIds(String(userId));
    const canView = canViewerSeePost(post, String(userId), friendIds, null);
    if (!canView) {
      return res.status(403).json({ error: 'Cannot like this post' });
    }
    
    const wasAlreadyLiked = post.likes.some((likeId) => String(likeId) === String(userId));
    await post.addLike(userId);

    if (!wasAlreadyLiked && String(post.authorId) !== String(userId)) {
      const actor = await User.findById(userId).select('username realName').lean();
      await createNotification({
        recipientId: post.authorId,
        senderId: userId,
        type: 'like',
        title: 'New like',
        body: `${actor?.username || actor?.realName || 'Someone'} liked your post`,
        data: {
          postId: post._id,
          url: '/social'
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Post liked',
      likesCount: post.likes.length
    });
  } catch (error) {
    console.error('Error liking post:', error);
    res.status(500).json({ error: 'Failed to like post', details: error.message });
  }
});

// Unlike a post
router.delete('/post/:postId/like', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    await post.removeLike(userId);
    
    res.json({
      success: true,
      message: 'Post unliked',
      likesCount: post.likes.length
    });
  } catch (error) {
    console.error('Error unliking post:', error);
    res.status(500).json({ error: 'Failed to unlike post', details: error.message });
  }
});

// Add comment to post
router.post('/post/:postId/comment', [
  authenticateToken,
  body('content').trim().notEmpty().withMessage('Comment content is required').isLength({ max: 1000 }).withMessage('Comment too long')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const { postId } = req.params;
    const { content } = req.body;
    const userId = req.user.userId;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Check if user can view post before commenting
    const friendIds = await getFriendIds(String(userId));
    const canView = canViewerSeePost(post, String(userId), friendIds, null);
    if (!canView) {
      return res.status(403).json({ error: 'Cannot comment on this post' });
    }
    
    await post.addComment(userId, content);
    
    // Get the newly added comment
    const newComment = post.comments[post.comments.length - 1];

    const actor = await User.findById(userId).select('username realName').lean();
    if (String(post.authorId) !== String(userId)) {
      await createNotification({
        recipientId: post.authorId,
        senderId: userId,
        type: 'comment',
        title: 'New comment',
        body: `${actor?.username || actor?.realName || 'Someone'} commented on your post`,
        data: {
          postId: post._id,
          commentId: newComment?._id,
          url: '/social'
        }
      });
    }

    const mentionedUsernames = extractMentions(content);
    if (mentionedUsernames.length > 0) {
      const mentionedUsers = await User.find({ username: { $in: mentionedUsernames } })
        .select('_id username')
        .lean();

      for (const mentionedUser of mentionedUsers) {
        if (String(mentionedUser._id) === String(userId)) continue;
        await createNotification({
          recipientId: mentionedUser._id,
          senderId: userId,
          type: 'mention',
          title: 'You were mentioned',
          body: `${actor?.username || actor?.realName || 'Someone'} mentioned you in a comment`,
          data: {
            postId: post._id,
            commentId: newComment?._id,
            url: '/social'
          }
        });
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'Comment added',
      comment: newComment,
      commentsCount: post.comments.length
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment', details: error.message });
  }
});

// Get personalized timeline (posts from user and friends)
router.get('/timeline', authenticateToken, async (req, res) => {
  try {
    const userId = String(req.user.userId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const viewerCoordinates = parseViewerCoordinates(req);
    const friendIds = await getFriendIds(userId);
    const blockedOrMuted = await getBlockedOrMutedIds(userId);
    const authorIds = [userId, ...friendIds];

    const candidatePosts = await Post.find({
      $and: [
        {
          $or: [
            { authorId: { $in: authorIds } },
            { targetFeedId: userId },
            { visibility: 'public' },
            { visibleToUsers: userId }
          ]
        },
        {
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
          ]
        }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(Math.max(limit * 5, 100))
      .populate('authorId', 'username realName')
      .populate('targetFeedId', 'username realName');

    const visiblePosts = candidatePosts
      .filter((post) => !blockedOrMuted.has(String(post.authorId?._id || post.authorId)))
      .filter((post) => !blockedOrMuted.has(String(post.targetFeedId?._id || post.targetFeedId)))
      .filter((post) => canViewerSeePost(post, userId, friendIds, viewerCoordinates));

    const start = (page - 1) * limit;
    const posts = visiblePosts.slice(start, start + limit);
    
    res.json({
      success: true,
      posts,
      page,
      limit,
      total: visiblePosts.length
    });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline', details: error.message });
  }
});

// Get post by ID
router.get('/post/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;
    
    const post = await Post.findById(postId)
      .populate('authorId', 'username realName')
      .populate('targetFeedId', 'username realName')
      .populate('likes', 'username')
      .populate('comments.userId', 'username');
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Check if user can view post
    const friendIds = await getFriendIds(String(userId));
    const canView = canViewerSeePost(post, String(userId), friendIds, null);
    if (!canView) {
      return res.status(403).json({ error: 'Cannot view this post' });
    }
    
    res.json({
      success: true,
      post
    });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ error: 'Failed to fetch post', details: error.message });
  }
});

module.exports = router;
