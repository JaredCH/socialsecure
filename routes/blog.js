const express = require('express');
const { body, param, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const BlogPost = require('../models/BlogPost');
const User = require('../models/User');

const router = express.Router();

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  const jwtSecret = process.env.JWT_SECRET;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!jwtSecret) {
    return res.status(500).json({ error: 'JWT configuration is missing' });
  }

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded;
    return next();
  });
};

const blogLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many blog requests, please try again later' }
});

const blogWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many blog write requests, please try again later' }
});

// GET /blog/my - Get current user's blog posts
router.get('/my', blogLimiter, authenticateToken, async (req, res) => {
  try {
    const posts = await BlogPost.find({
      author: req.user._id,
      isDeleted: false
    }).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, posts });
  } catch (error) {
    console.error('Error fetching user blog posts:', error);
    return res.status(500).json({ error: 'Failed to fetch blog posts' });
  }
});

// GET /blog/user/:username - Get a user's published blog posts (public)
router.get('/user/:username', blogLimiter, async (req, res) => {
  try {
    const user = await User.findOne({
      username: { $regex: new RegExp(`^${req.params.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    }).select('_id username socialPagePreferences').lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const blogEnabled = user.socialPagePreferences?.enabledSections?.blog === true;
    if (!blogEnabled) {
      return res.json({ success: true, posts: [], indexStyle: 'date' });
    }
    const blogConfig = user.socialPagePreferences?.blogConfig || {};
    const posts = await BlogPost.find({
      author: user._id,
      status: 'published',
      isDeleted: false
    }).sort({ publishedAt: -1 }).select('-content').lean();
    return res.json({
      success: true,
      posts,
      indexStyle: blogConfig.indexStyle || 'date',
      categories: blogConfig.categories || []
    });
  } catch (error) {
    console.error('Error fetching user blog:', error);
    return res.status(500).json({ error: 'Failed to fetch blog posts' });
  }
});

// GET /blog/user/:username/:slug - Get a single published blog post
router.get('/user/:username/:slug', blogLimiter, async (req, res) => {
  try {
    const user = await User.findOne({
      username: { $regex: new RegExp(`^${req.params.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    }).select('_id username socialPagePreferences').lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const post = await BlogPost.findOne({
      author: user._id,
      slug: req.params.slug,
      status: 'published',
      isDeleted: false
    }).lean();
    if (!post) {
      return res.status(404).json({ error: 'Blog post not found' });
    }
    return res.json({ success: true, post });
  } catch (error) {
    console.error('Error fetching blog post:', error);
    return res.status(500).json({ error: 'Failed to fetch blog post' });
  }
});

// POST /blog - Create a blog post
router.post(
  '/',
  blogWriteLimiter,
  authenticateToken,
  body('title').isString().trim().isLength({ min: 1, max: 200 }),
  body('content').isString().trim().isLength({ min: 1, max: 50000 }),
  body('excerpt').optional().isString().trim().isLength({ max: 500 }),
  body('category').optional().isString().trim().isLength({ max: 100 }),
  body('tags').optional().isArray({ max: 10 }),
  body('audience').optional().isIn(['social', 'secure']),
  body('status').optional().isIn(['draft', 'published']),
  body('backgroundImage').optional().isString().trim().isLength({ max: 2048 }),
  body('backgroundColor').optional().isString().trim().isLength({ max: 20 }),
  body('fontFamily').optional().isString().trim().isLength({ max: 60 }),
  body('fontSize').optional().isInt({ min: 12, max: 32 }),
  body('fontColor').optional().isString().trim().isLength({ max: 20 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { title, content, excerpt, category, tags, audience, status, backgroundImage, backgroundColor, fontFamily, fontSize, fontColor } = req.body;
      const post = await BlogPost.create({
        author: req.user._id,
        title,
        content,
        excerpt: excerpt || content.substring(0, 200).replace(/[#*_`~\[\]]/g, ''),
        category: category || 'General',
        tags: Array.isArray(tags) ? tags.slice(0, 10).map(t => String(t).trim().substring(0, 50)) : [],
        audience: audience || 'social',
        status: status || 'draft',
        backgroundImage: backgroundImage || '',
        backgroundColor: backgroundColor || '',
        fontFamily: fontFamily || '',
        fontSize: fontSize || 16,
        fontColor: fontColor || ''
      });
      return res.status(201).json({ success: true, post });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ error: 'A blog post with a similar title already exists. Please choose a different title.' });
      }
      console.error('Error creating blog post:', error);
      return res.status(500).json({ error: 'Failed to create blog post' });
    }
  }
);

// PUT /blog/:id - Update a blog post
router.put(
  '/:id',
  blogWriteLimiter,
  authenticateToken,
  param('id').isMongoId(),
  body('title').optional().isString().trim().isLength({ min: 1, max: 200 }),
  body('content').optional().isString().trim().isLength({ min: 1, max: 50000 }),
  body('excerpt').optional().isString().trim().isLength({ max: 500 }),
  body('category').optional().isString().trim().isLength({ max: 100 }),
  body('tags').optional().isArray({ max: 10 }),
  body('audience').optional().isIn(['social', 'secure']),
  body('status').optional().isIn(['draft', 'published']),
  body('backgroundImage').optional().isString().trim().isLength({ max: 2048 }),
  body('backgroundColor').optional().isString().trim().isLength({ max: 20 }),
  body('fontFamily').optional().isString().trim().isLength({ max: 60 }),
  body('fontSize').optional().isInt({ min: 12, max: 32 }),
  body('fontColor').optional().isString().trim().isLength({ max: 20 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const post = await BlogPost.findOne({ _id: req.params.id, author: req.user._id, isDeleted: false });
      if (!post) {
        return res.status(404).json({ error: 'Blog post not found' });
      }
      const fields = ['title', 'content', 'excerpt', 'category', 'tags', 'audience', 'status', 'backgroundImage', 'backgroundColor', 'fontFamily', 'fontSize', 'fontColor'];
      fields.forEach(field => {
        if (req.body[field] !== undefined) {
          if (field === 'tags') {
            post[field] = Array.isArray(req.body[field]) ? req.body[field].slice(0, 10).map(t => String(t).trim().substring(0, 50)) : post[field];
          } else {
            post[field] = req.body[field];
          }
        }
      });
      if (post.status === 'published' && !post.publishedAt) {
        post.publishedAt = new Date();
      }
      await post.save();
      return res.json({ success: true, post });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ error: 'A blog post with a similar title already exists.' });
      }
      console.error('Error updating blog post:', error);
      return res.status(500).json({ error: 'Failed to update blog post' });
    }
  }
);

// DELETE /blog/:id - Soft delete a blog post
router.delete(
  '/:id',
  blogWriteLimiter,
  authenticateToken,
  param('id').isMongoId(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const post = await BlogPost.findOne({ _id: req.params.id, author: req.user._id, isDeleted: false });
      if (!post) {
        return res.status(404).json({ error: 'Blog post not found' });
      }
      post.isDeleted = true;
      await post.save();
      return res.json({ success: true });
    } catch (error) {
      console.error('Error deleting blog post:', error);
      return res.status(500).json({ error: 'Failed to delete blog post' });
    }
  }
);

// POST /blog/:id/react - React to a blog post
router.post(
  '/:id/react',
  blogLimiter,
  authenticateToken,
  param('id').isMongoId(),
  body('reaction').isIn(['like', 'love', 'insightful']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const post = await BlogPost.findOne({ _id: req.params.id, status: 'published', isDeleted: false });
      if (!post) {
        return res.status(404).json({ error: 'Blog post not found' });
      }
      const userId = req.user._id;
      const reaction = req.body.reaction;
      const alreadyReacted = post.reactions[reaction]?.some(id => String(id) === String(userId));
      if (alreadyReacted) {
        post.reactions[reaction] = post.reactions[reaction].filter(id => String(id) !== String(userId));
      } else {
        post.reactions[reaction].push(userId);
      }
      await post.save();
      const reactionCounts = {
        like: post.reactions.like?.length || 0,
        love: post.reactions.love?.length || 0,
        insightful: post.reactions.insightful?.length || 0
      };
      return res.json({ success: true, reactions: reactionCounts, toggled: !alreadyReacted });
    } catch (error) {
      console.error('Error reacting to blog post:', error);
      return res.status(500).json({ error: 'Failed to react to blog post' });
    }
  }
);

module.exports = router;
