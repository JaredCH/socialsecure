const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const Post = require('../models/Post');
const User = require('../models/User');

const MEDIA_URL_MAX_ITEMS = 8;
const MEDIA_URL_MAX_LENGTH = 2048;
const HTTP_URL_REGEX = /^https?:\/\/\S+$/i;

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
  
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Get user's feed (posts where user is targetFeedId)
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    // Check if requesting user has permission to view this feed
    if (req.user.userId !== userId) {
      // In a real implementation, check friendship status
      const isFriend = false; // Placeholder - implement friendship check
      if (!isFriend) {
        return res.status(403).json({ error: 'Cannot view this user\'s feed' });
      }
    }
    
    const posts = await Post.getUserFeed(userId, page, limit);
    res.json({
      success: true,
      posts,
      page,
      limit,
      total: posts.length
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
  body('visibility').optional().isIn(['public', 'friends', 'private']).withMessage('Invalid visibility'),
  body('mediaUrls').optional(),
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
      latitude,
      longitude,
      mediaUrls: mediaUrlsInput
    } = req.body;
    const authorId = req.user.userId;

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
    if (targetFeedId !== authorId) {
      // In a real implementation, check if users are friends
      const areFriends = false; // Placeholder - implement friendship check
      if (!areFriends) {
        return res.status(403).json({ error: 'Cannot post to this user\'s feed' });
      }
    }
    
    const postData = {
      authorId,
      targetFeedId,
      content,
      encryptedContent,
      isEncrypted: !!encryptedContent,
      visibility,
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
    const canView = post.canView(userId, false); // Pass false for isFriend placeholder
    if (!canView) {
      return res.status(403).json({ error: 'Cannot like this post' });
    }
    
    await post.addLike(userId);
    
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
    const canView = post.canView(userId, false); // Pass false for isFriend placeholder
    if (!canView) {
      return res.status(403).json({ error: 'Cannot comment on this post' });
    }
    
    await post.addComment(userId, content);
    
    // Get the newly added comment
    const newComment = post.comments[post.comments.length - 1];
    
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
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    // In a real implementation, you would:
    // 1. Get user's friends list
    // 2. Query posts where authorId is in friends list OR authorId is user
    // 3. Apply visibility filters
    
    // For now, return posts where user is author or target
    const posts = await Post.find({
      $or: [
        { authorId: userId },
        { targetFeedId: userId }
      ],
      visibility: { $in: ['public', 'friends'] }
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('authorId', 'username realName')
    .populate('targetFeedId', 'username realName')
    .lean();
    
    res.json({
      success: true,
      posts,
      page,
      limit,
      total: posts.length
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
    const canView = post.canView(userId, false); // Pass false for isFriend placeholder
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
