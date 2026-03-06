const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const Report = require('../models/Report');
const BlockList = require('../models/BlockList');
const MuteList = require('../models/MuteList');
const User = require('../models/User');
const Post = require('../models/Post');
const ChatMessage = require('../models/ChatMessage');
const ConversationMessage = require('../models/ConversationMessage');
const ChatRoom = require('../models/ChatRoom');
const ChatConversation = require('../models/ChatConversation');
const Article = require('../models/Article');
const NewsIngestionRecord = require('../models/NewsIngestionRecord');

const REPORT_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const REPORT_LIMIT_MAX = 5;
const CONTROL_PANEL_MUTE_DURATIONS = {
  '24h': 24,
  '48h': 48,
  '72h': 72,
  '5d': 120,
  '7d': 168,
  '1m': 720,
  forever: null
};
const moderationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many moderation requests. Please try again later.' }
});

router.use(moderationRateLimiter);

const toUserSummary = (user) => ({
  _id: user?._id,
  username: user?.username || '',
  realName: user?.realName || '',
  isAdmin: !!user?.isAdmin,
  registrationStatus: user?.registrationStatus || 'pending',
  moderationStatus: user?.moderationStatus || 'active',
  mutedUntil: user?.mutedUntil || null,
  muteReason: user?.muteReason || '',
  mustResetPassword: !!user?.mustResetPassword,
  createdAt: user?.createdAt || null
});

const authenticateToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    const user = await User.findById(decoded.userId).select('_id isAdmin moderationStatus');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    req.user = user;
    return next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
};

const normalizeSortDirection = (value) => (String(value || '').toLowerCase() === 'asc' ? 1 : -1);
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.post('/report', [
  authenticateToken,
  body('targetType').isIn(['post', 'comment', 'user', 'message']),
  body('targetId').isMongoId(),
  body('targetUserId').isMongoId(),
  body('category').isIn(['spam', 'harassment', 'hate_speech', 'misinformation', 'illegal_content', 'self_harm', 'other']),
  body('description').optional().isString().isLength({ max: 1000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const since = new Date(Date.now() - REPORT_LIMIT_WINDOW_MS);
    const recentCount = await Report.countDocuments({
      reporterId: req.user._id,
      createdAt: { $gte: since }
    });

    if (recentCount >= REPORT_LIMIT_MAX) {
      return res.status(429).json({ error: 'Report rate limit exceeded (5 per hour)' });
    }

    const report = await Report.create({
      reporterId: req.user._id,
      targetType: req.body.targetType,
      targetId: req.body.targetId,
      targetUserId: req.body.targetUserId,
      category: req.body.category,
      description: req.body.description || ''
    });

    const reportCountForTarget = await Report.countDocuments({
      targetType: report.targetType,
      targetId: report.targetId,
      status: { $in: ['pending', 'under_review'] }
    });

    if (report.targetType === 'post' && reportCountForTarget >= 3) {
      await Post.findByIdAndUpdate(report.targetId, {
        $set: {
          visibility: 'private',
          updatedAt: new Date()
        }
      });

      report.isAutoHidden = true;
      report.priority = 'high';
      await report.save();
    }

    return res.status(201).json({ success: true, reportId: report._id, status: report.status, isAutoHidden: report.isAutoHidden });
  } catch (error) {
    console.error('Report creation error:', error);
    return res.status(500).json({ error: 'Failed to submit report' });
  }
});

router.get('/my-reports', authenticateToken, async (req, res) => {
  try {
    const reports = await Report.find({ reporterId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      reports: reports.map((report) => ({
        id: report._id,
        targetType: report.targetType,
        targetId: report.targetId,
        category: report.category,
        status: report.status,
        resolution: report.resolution,
        appeal: report.appeal,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt
      }))
    });
  } catch (error) {
    console.error('Get my reports error:', error);
    return res.status(500).json({ error: 'Failed to load reports' });
  }
});

router.get('/account-actions', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('moderationStatus moderationHistory').lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      moderationStatus: user.moderationStatus || 'active',
      moderationHistory: Array.isArray(user.moderationHistory) ? user.moderationHistory : []
    });
  } catch (error) {
    console.error('Account actions error:', error);
    return res.status(500).json({ error: 'Failed to load account moderation actions' });
  }
});

router.get('/blocks', authenticateToken, async (req, res) => {
  try {
    const blocked = await BlockList.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('blockedUserId', 'username realName avatarUrl')
      .lean();

    return res.json({
      blockedUsers: blocked.map((entry) => ({
        _id: entry.blockedUserId?._id,
        username: entry.blockedUserId?.username,
        realName: entry.blockedUserId?.realName,
        avatarUrl: entry.blockedUserId?.avatarUrl,
        blockedAt: entry.createdAt,
        reason: entry.reason || ''
      }))
    });
  } catch (error) {
    console.error('Get blocks error:', error);
    return res.status(500).json({ error: 'Failed to load block list' });
  }
});

router.post('/block', [
  authenticateToken,
  body('userId').isMongoId(),
  body('reason').optional().isString().isLength({ max: 200 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const blockedUserId = String(req.body.userId);
    if (String(req.user._id) === blockedUserId) {
      return res.status(400).json({ error: 'You cannot block yourself' });
    }

    await BlockList.findOneAndUpdate(
      { userId: req.user._id, blockedUserId },
      { $set: { reason: req.body.reason || '', updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({ success: true, message: 'User blocked' });
  } catch (error) {
    console.error('Block user error:', error);
    return res.status(500).json({ error: 'Failed to block user' });
  }
});

router.delete('/block/:userId', authenticateToken, async (req, res) => {
  try {
    await BlockList.findOneAndDelete({ userId: req.user._id, blockedUserId: req.params.userId });
    return res.json({ success: true, message: 'User unblocked' });
  } catch (error) {
    console.error('Unblock user error:', error);
    return res.status(500).json({ error: 'Failed to unblock user' });
  }
});

router.get('/mutes', authenticateToken, async (req, res) => {
  try {
    const muted = await MuteList.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('mutedUserId', 'username realName avatarUrl')
      .lean();

    return res.json({
      mutedUsers: muted.map((entry) => ({
        _id: entry.mutedUserId?._id,
        username: entry.mutedUserId?.username,
        realName: entry.mutedUserId?.realName,
        avatarUrl: entry.mutedUserId?.avatarUrl,
        mutedAt: entry.createdAt
      }))
    });
  } catch (error) {
    console.error('Get mutes error:', error);
    return res.status(500).json({ error: 'Failed to load mute list' });
  }
});

router.post('/mute', [
  authenticateToken,
  body('userId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const mutedUserId = String(req.body.userId);
    if (String(req.user._id) === mutedUserId) {
      return res.status(400).json({ error: 'You cannot mute yourself' });
    }

    await MuteList.findOneAndUpdate(
      { userId: req.user._id, mutedUserId },
      { $set: { updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({ success: true, message: 'User muted' });
  } catch (error) {
    console.error('Mute user error:', error);
    return res.status(500).json({ error: 'Failed to mute user' });
  }
});

router.delete('/mute/:userId', authenticateToken, async (req, res) => {
  try {
    await MuteList.findOneAndDelete({ userId: req.user._id, mutedUserId: req.params.userId });
    return res.json({ success: true, message: 'User unmuted' });
  } catch (error) {
    console.error('Unmute user error:', error);
    return res.status(500).json({ error: 'Failed to unmute user' });
  }
});

router.get('/control-panel/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [
      userCount,
      postCount,
      chatMessageCount,
      directMessageCount,
      reportCount,
      blockCount,
      muteCount,
      roomCount,
      conversationCount,
      recentUsers,
      recentPosts,
      recentRoomMessages,
      recentDirectMessages
    ] = await Promise.all([
      User.countDocuments({}),
      Post.countDocuments({}),
      ChatMessage.countDocuments({}),
      ConversationMessage.countDocuments({}),
      Report.countDocuments({}),
      BlockList.countDocuments({}),
      MuteList.countDocuments({}),
      ChatRoom.countDocuments({}),
      ChatConversation.countDocuments({}),
      User.find({}).sort({ createdAt: -1 }).limit(12).select('_id username realName isAdmin registrationStatus moderationStatus mutedUntil muteReason mustResetPassword createdAt').lean(),
      Post.find({})
        .sort({ createdAt: -1 })
        .limit(12)
        .populate('authorId', 'username realName')
        .populate('targetFeedId', 'username realName')
        .lean(),
      ChatMessage.find({})
        .sort({ createdAt: -1 })
        .limit(12)
        .populate('userId', 'username realName')
        .populate('roomId', 'name')
        .lean(),
      ConversationMessage.find({})
        .sort({ createdAt: -1 })
        .limit(12)
        .populate('userId', 'username realName')
        .populate('conversationId', 'type title')
        .lean()
    ]);

    return res.json({
      totals: {
        users: userCount,
        posts: postCount,
        chatRoomMessages: chatMessageCount,
        directMessages: directMessageCount,
        allMessages: chatMessageCount + directMessageCount,
        reports: reportCount,
        blocks: blockCount,
        mutes: muteCount,
        rooms: roomCount,
        conversations: conversationCount
      },
      recents: {
        users: recentUsers.map(toUserSummary),
        posts: recentPosts.map((post) => ({
          _id: post._id,
          content: post.content || '',
          createdAt: post.createdAt,
          author: post.authorId ? { _id: post.authorId._id, username: post.authorId.username, realName: post.authorId.realName } : null,
          targetFeed: post.targetFeedId ? { _id: post.targetFeedId._id, username: post.targetFeedId.username, realName: post.targetFeedId.realName } : null
        })),
        messages: [
          ...recentRoomMessages.map((message) => ({
            _id: message._id,
            type: 'room',
            content: message.content || '',
            createdAt: message.createdAt,
            user: message.userId ? { _id: message.userId._id, username: message.userId.username, realName: message.userId.realName } : null,
            room: message.roomId ? { _id: message.roomId._id, name: message.roomId.name || '' } : null
          })),
          ...recentDirectMessages.map((message) => ({
            _id: message._id,
            type: 'conversation',
            content: message.content || '',
            createdAt: message.createdAt,
            user: message.userId ? { _id: message.userId._id, username: message.userId.username, realName: message.userId.realName } : null,
            conversation: message.conversationId ? { _id: message.conversationId._id, type: message.conversationId.type, title: message.conversationId.title || '' } : null
          }))
        ]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 20)
      },
      muteDurations: Object.keys(CONTROL_PANEL_MUTE_DURATIONS)
    });
  } catch (error) {
    console.error('Control panel overview error:', error);
    return res.status(500).json({ error: 'Failed to load control panel overview' });
  }
});

router.get('/control-panel/details', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const section = String(req.query.section || 'users');
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const skip = (page - 1) * limit;

    if (section === 'users') {
      const [users, total] = await Promise.all([
        User.find({})
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('_id username realName isAdmin registrationStatus moderationStatus mutedUntil muteReason mustResetPassword moderationHistory createdAt')
          .lean(),
        User.countDocuments({})
      ]);
      return res.json({
        section,
        rows: users.map((user) => ({ ...toUserSummary(user), moderationHistory: Array.isArray(user.moderationHistory) ? user.moderationHistory : [] })),
        pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
      });
    }

    if (section === 'posts') {
      const [posts, total] = await Promise.all([
        Post.find({})
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('authorId', 'username realName')
          .populate('targetFeedId', 'username realName')
          .lean(),
        Post.countDocuments({})
      ]);
      return res.json({
        section,
        rows: posts.map((post) => ({
          _id: post._id,
          content: post.content || '',
          createdAt: post.createdAt,
          visibility: post.visibility,
          author: post.authorId ? { _id: post.authorId._id, username: post.authorId.username, realName: post.authorId.realName } : null,
          targetFeed: post.targetFeedId ? { _id: post.targetFeedId._id, username: post.targetFeedId.username, realName: post.targetFeedId.realName } : null
        })),
        pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
      });
    }

    if (section === 'messages') {
      const [roomMessages, directMessages] = await Promise.all([
        ChatMessage.find({})
          .sort({ createdAt: -1 })
          .limit(limit * 2)
          .populate('userId', 'username realName')
          .populate('roomId', 'name')
          .lean(),
        ConversationMessage.find({})
          .sort({ createdAt: -1 })
          .limit(limit * 2)
          .populate('userId', 'username realName')
          .populate('conversationId', 'title type')
          .lean()
      ]);

      const merged = [
        ...roomMessages.map((message) => ({
          _id: message._id,
          type: 'room',
          content: message.content || '',
          createdAt: message.createdAt,
          user: message.userId ? { _id: message.userId._id, username: message.userId.username, realName: message.userId.realName } : null,
          room: message.roomId ? { _id: message.roomId._id, name: message.roomId.name || '' } : null
        })),
        ...directMessages.map((message) => ({
          _id: message._id,
          type: 'conversation',
          content: message.content || '',
          createdAt: message.createdAt,
          user: message.userId ? { _id: message.userId._id, username: message.userId.username, realName: message.userId.realName } : null,
          conversation: message.conversationId
            ? { _id: message.conversationId._id, title: message.conversationId.title || '', type: message.conversationId.type || '' }
            : null
        }))
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const total = await Promise.all([ChatMessage.countDocuments({}), ConversationMessage.countDocuments({})])
        .then(([roomTotal, directTotal]) => roomTotal + directTotal);
      return res.json({
        section,
        rows: merged.slice(skip, skip + limit),
        pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
      });
    }

    if (section === 'infractions') {
      const users = await User.find({ 'moderationHistory.0': { $exists: true } })
        .select('_id username realName moderationHistory')
        .sort({ updatedAt: -1 })
        .lean();

      const infractions = users.flatMap((user) => (user.moderationHistory || []).map((entry, index) => ({
        userId: user._id,
        username: user.username || '',
        realName: user.realName || '',
        index,
        ...entry
      })));

      return res.json({
        section,
        rows: infractions.slice(skip, skip + limit),
        pagination: { page, limit, total: infractions.length, totalPages: Math.max(Math.ceil(infractions.length / limit), 1) }
      });
    }

    if (section === 'reports') {
      const [reports, total] = await Promise.all([
        Report.find({})
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('reporterId', 'username realName')
          .populate('targetUserId', 'username realName')
          .lean(),
        Report.countDocuments({})
      ]);
      return res.json({
        section,
        rows: reports.map((r) => ({
          _id: r._id,
          reporter: r.reporterId ? { _id: r.reporterId._id, username: r.reporterId.username, realName: r.reporterId.realName } : null,
          targetUser: r.targetUserId ? { _id: r.targetUserId._id, username: r.targetUserId.username, realName: r.targetUserId.realName } : null,
          targetType: r.targetType,
          category: r.category,
          description: r.description || '',
          status: r.status,
          priority: r.priority,
          createdAt: r.createdAt
        })),
        pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
      });
    }

    if (section === 'blocks') {
      const [blocks, total] = await Promise.all([
        BlockList.find({})
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('userId', 'username realName')
          .populate('blockedUserId', 'username realName')
          .lean(),
        BlockList.countDocuments({})
      ]);
      return res.json({
        section,
        rows: blocks.map((b) => ({
          _id: b._id,
          user: b.userId ? { _id: b.userId._id, username: b.userId.username, realName: b.userId.realName } : null,
          blockedUser: b.blockedUserId ? { _id: b.blockedUserId._id, username: b.blockedUserId.username, realName: b.blockedUserId.realName } : null,
          reason: b.reason || '',
          createdAt: b.createdAt
        })),
        pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
      });
    }

    if (section === 'mutes') {
      const [mutes, total] = await Promise.all([
        MuteList.find({})
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('userId', 'username realName')
          .populate('mutedUserId', 'username realName')
          .lean(),
        MuteList.countDocuments({})
      ]);
      return res.json({
        section,
        rows: mutes.map((m) => ({
          _id: m._id,
          user: m.userId ? { _id: m.userId._id, username: m.userId.username, realName: m.userId.realName } : null,
          mutedUser: m.mutedUserId ? { _id: m.mutedUserId._id, username: m.mutedUserId.username, realName: m.mutedUserId.realName } : null,
          expiresAt: m.expiresAt,
          createdAt: m.createdAt
        })),
        pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
      });
    }

    if (section === 'rooms') {
      const [rooms, total] = await Promise.all([
        ChatRoom.find({})
          .sort({ lastActivity: -1 })
          .skip(skip)
          .limit(limit)
          .select('_id name type city state zipCode messageCount lastActivity createdAt')
          .lean(),
        ChatRoom.countDocuments({})
      ]);
      return res.json({
        section,
        rows: rooms.map((r) => ({
          _id: r._id,
          name: r.name || '',
          type: r.type,
          city: r.city || '',
          state: r.state || '',
          zipCode: r.zipCode || '',
          messageCount: r.messageCount || 0,
          lastActivity: r.lastActivity,
          createdAt: r.createdAt
        })),
        pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
      });
    }

    if (section === 'conversations') {
      const [conversations, total] = await Promise.all([
        ChatConversation.find({})
          .sort({ lastMessageAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('_id type title zipCode messageCount lastMessageAt createdAt')
          .lean(),
        ChatConversation.countDocuments({})
      ]);
      return res.json({
        section,
        rows: conversations.map((c) => ({
          _id: c._id,
          type: c.type,
          title: c.title || '',
          zipCode: c.zipCode || '',
          messageCount: c.messageCount || 0,
          lastMessageAt: c.lastMessageAt,
          createdAt: c.createdAt
        })),
        pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
      });
    }

    return res.status(400).json({ error: 'Unsupported control panel section' });
  } catch (error) {
    console.error('Control panel details error:', error);
    return res.status(500).json({ error: 'Failed to load control panel details' });
  }
});

router.get('/control-panel/news-ingestion', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const skip = (page - 1) * limit;
    const source = String(req.query.source || '').trim();
    const tag = String(req.query.tag || '').trim().toLowerCase();
    const zipCode = String(req.query.zipCode || '').trim().toUpperCase();
    const region = String(req.query.region || '').trim().toLowerCase();
    const processingStatus = String(req.query.processingStatus || '').trim().toLowerCase();
    const search = String(req.query.search || '').trim();
    const fromDate = req.query.from ? new Date(req.query.from) : null;
    const toDate = req.query.to ? new Date(req.query.to) : null;
    const sortBy = ['createdAt', 'scrapedAt', 'resolvedScope', 'processingStatus'].includes(req.query.sortBy)
      ? req.query.sortBy
      : 'createdAt';
    const sortDir = normalizeSortDirection(req.query.sortDir);

    const query = {};
    if (source) {
      query['source.name'] = new RegExp(escapeRegex(source), 'i');
    }
    if (tag) {
      query.tags = tag;
    }
    if (zipCode) {
      query['normalized.assignedZipCode'] = zipCode;
    }
    if (region) {
      query.resolvedScope = region;
    }
    if (processingStatus) {
      query.processingStatus = processingStatus;
    }
    if (fromDate || toDate) {
      query.scrapedAt = {};
      if (fromDate && !Number.isNaN(fromDate.getTime())) query.scrapedAt.$gte = fromDate;
      if (toDate && !Number.isNaN(toDate.getTime())) query.scrapedAt.$lte = toDate;
      if (Object.keys(query.scrapedAt).length === 0) delete query.scrapedAt;
    }
    if (search) {
      query.$or = [
        { 'normalized.title': new RegExp(escapeRegex(search), 'i') },
        { 'normalized.url': new RegExp(escapeRegex(search), 'i') },
        { 'source.sourceId': new RegExp(escapeRegex(search), 'i') }
      ];
    }

    const [records, total] = await Promise.all([
      NewsIngestionRecord.find(query)
        .sort({ [sortBy]: sortDir, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      NewsIngestionRecord.countDocuments(query)
    ]);

    return res.json({
      records: records.map((record) => ({
        _id: record._id,
        ingestionRunId: record.ingestionRunId,
        source: record.source,
        scrapedAt: record.scrapedAt,
        normalized: {
          title: record.normalized?.title || '',
          description: record.normalized?.description || '',
          url: record.normalized?.url || '',
          publishedAt: record.normalized?.publishedAt || null,
          topics: record.normalized?.topics || [],
          assignedZipCode: record.normalized?.assignedZipCode || null,
          locations: record.normalized?.locations || [],
          localityLevel: record.normalized?.localityLevel || 'global'
        },
        resolvedScope: record.resolvedScope || 'global',
        dedupe: record.dedupe,
        persistence: record.persistence,
        processingStatus: record.processingStatus,
        tags: record.tags || [],
        eventCount: Array.isArray(record.events) ? record.events.length : 0,
        createdAt: record.createdAt
      })),
      pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
    });
  } catch (error) {
    console.error('Control panel news ingestion list error:', error);
    return res.status(500).json({ error: 'Failed to load news ingestion records' });
  }
});

router.get('/control-panel/news-ingestion/:recordId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const record = await NewsIngestionRecord.findById(req.params.recordId).lean();
    if (!record) {
      return res.status(404).json({ error: 'News ingestion record not found' });
    }
    const persistedArticle = record.persistence?.articleId
      ? await Article.findById(record.persistence.articleId).select('_id title source publishedAt').lean()
      : null;
    return res.json({
      record: {
        ...record,
        persistedArticle
      }
    });
  } catch (error) {
    console.error('Control panel news ingestion detail error:', error);
    return res.status(500).json({ error: 'Failed to load news ingestion record details' });
  }
});

router.get('/control-panel/news-ingestion/:recordId/timeline', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const record = await NewsIngestionRecord.findById(req.params.recordId)
      .select('_id ingestionRunId dedupe persistence processingStatus events createdAt updatedAt')
      .lean();
    if (!record) {
      return res.status(404).json({ error: 'News ingestion record not found' });
    }
    const timeline = (record.events || [])
      .map((event) => ({
        timestamp: event.timestamp,
        severity: event.severity,
        eventType: event.eventType,
        message: event.message,
        metadata: event.metadata || {}
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return res.json({
      recordId: record._id,
      ingestionRunId: record.ingestionRunId,
      processingStatus: record.processingStatus,
      dedupe: record.dedupe,
      persistence: record.persistence,
      timeline
    });
  } catch (error) {
    console.error('Control panel news ingestion timeline error:', error);
    return res.status(500).json({ error: 'Failed to load news ingestion timeline' });
  }
});

router.get('/control-panel/news-ingestion/:recordId/logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const severity = String(req.query.severity || '').trim().toLowerCase();
    const record = await NewsIngestionRecord.findById(req.params.recordId)
      .select('_id events')
      .lean();
    if (!record) {
      return res.status(404).json({ error: 'News ingestion record not found' });
    }
    const logs = (record.events || [])
      .filter((event) => (!severity ? true : event.severity === severity))
      .map((event) => ({
        timestamp: event.timestamp,
        severity: event.severity,
        eventType: event.eventType,
        message: event.message,
        metadata: event.metadata || {}
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return res.json({
      recordId: record._id,
      logs
    });
  } catch (error) {
    console.error('Control panel news ingestion logs error:', error);
    return res.status(500).json({ error: 'Failed to load news ingestion logs' });
  }
});

router.post('/control-panel/users/:userId/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const temporaryPassword = Array.from({ length: 8 }, () => String(crypto.randomInt(0, 10))).join('');
    user.passwordHash = await bcrypt.hash(temporaryPassword, 12);
    user.mustResetPassword = true;
    user.moderationHistory.push({
      action: 'password_reset',
      reason: 'Admin initiated one-time login password reset',
      duration: null,
      appliedBy: req.user._id,
      expiresAt: null
    });
    await user.save();

    return res.json({
      success: true,
      temporaryPassword,
      message: 'Temporary password generated. User must change password after login.'
    });
  } catch (error) {
    console.error('Control panel reset password error:', error);
    return res.status(500).json({ error: 'Failed to reset user password' });
  }
});

router.post('/control-panel/users/:userId/mute', [
  authenticateToken,
  requireAdmin,
  body('durationKey').isIn(Object.keys(CONTROL_PANEL_MUTE_DURATIONS)),
  body('reason').optional().isString().isLength({ max: 1000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const durationHours = CONTROL_PANEL_MUTE_DURATIONS[req.body.durationKey];
    const mutedUntil = durationHours === null ? null : new Date(Date.now() + durationHours * 60 * 60 * 1000);

    user.mutedUntil = mutedUntil;
    user.muteReason = req.body.reason || '';
    user.moderationStatus = 'suspended';
    user.moderationHistory.push({
      action: 'mute',
      reason: req.body.reason || `Muted (${req.body.durationKey})`,
      duration: durationHours === null ? null : durationHours / 24,
      appliedBy: req.user._id,
      expiresAt: mutedUntil
    });
    await user.save();

    return res.json({
      success: true,
      mutedUntil,
      durationKey: req.body.durationKey
    });
  } catch (error) {
    console.error('Control panel mute user error:', error);
    return res.status(500).json({ error: 'Failed to mute user' });
  }
});

router.delete('/control-panel/users/:userId/mute', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.mutedUntil = null;
    user.muteReason = '';
    if (user.moderationStatus === 'suspended') {
      user.moderationStatus = 'active';
    }
    user.moderationHistory.push({
      action: 'unmute',
      reason: 'Mute removed by admin',
      duration: null,
      appliedBy: req.user._id,
      expiresAt: null
    });
    await user.save();

    return res.json({ success: true, message: 'User unmuted' });
  } catch (error) {
    console.error('Control panel unmute user error:', error);
    return res.status(500).json({ error: 'Failed to unmute user' });
  }
});

router.post('/control-panel/users/:userId/infractions', [
  authenticateToken,
  requireAdmin,
  body('action').isIn(['warning', 'suspension', 'ban']),
  body('reason').optional().isString().isLength({ max: 1000 }),
  body('durationDays').optional().isInt({ min: 1, max: 3650 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const durationDays = req.body.durationDays ? Number(req.body.durationDays) : null;
    user.moderationStatus = req.body.action === 'warning' ? 'warned' : req.body.action === 'suspension' ? 'suspended' : 'banned';
    user.registrationStatus = req.body.action === 'warning' ? 'active' : 'suspended';
    user.moderationHistory.push({
      action: req.body.action,
      reason: req.body.reason || '',
      duration: durationDays,
      appliedBy: req.user._id,
      expiresAt: durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null
    });
    await user.save();

    return res.json({ success: true, moderationStatus: user.moderationStatus });
  } catch (error) {
    console.error('Control panel add infraction error:', error);
    return res.status(500).json({ error: 'Failed to add infraction' });
  }
});

router.delete('/control-panel/users/:userId/infractions/:infractionIndex', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const index = Number.parseInt(req.params.infractionIndex, 10);
    if (!Number.isInteger(index) || index < 0 || index >= user.moderationHistory.length) {
      return res.status(400).json({ error: 'Invalid infraction index' });
    }

    user.moderationHistory.splice(index, 1);
    user.moderationHistory.push({
      action: 'infraction_removed',
      reason: 'Admin removed infraction record',
      duration: null,
      appliedBy: req.user._id,
      expiresAt: null
    });
    await user.save();

    return res.json({ success: true });
  } catch (error) {
    console.error('Control panel remove infraction error:', error);
    return res.status(500).json({ error: 'Failed to remove infraction' });
  }
});

router.delete('/control-panel/posts/:postId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const deleted = await Post.findByIdAndDelete(req.params.postId);
    if (!deleted) {
      return res.status(404).json({ error: 'Post not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Control panel delete post error:', error);
    return res.status(500).json({ error: 'Failed to delete post' });
  }
});

router.delete('/control-panel/messages/:messageId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const messageType = String(req.query.type || 'room');
    const deleted = messageType === 'conversation'
      ? await ConversationMessage.findByIdAndDelete(req.params.messageId)
      : await ChatMessage.findByIdAndDelete(req.params.messageId);

    if (!deleted) {
      return res.status(404).json({ error: 'Message not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Control panel delete message error:', error);
    return res.status(500).json({ error: 'Failed to delete message' });
  }
});

router.delete('/control-panel/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (String(req.user._id) === String(req.params.userId)) {
      return res.status(400).json({ error: 'Admin cannot delete their own account' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await Promise.all([
      Post.deleteMany({ $or: [{ authorId: user._id }, { targetFeedId: user._id }] }),
      ChatMessage.deleteMany({ userId: user._id }),
      ConversationMessage.deleteMany({ userId: user._id }),
      Report.deleteMany({ $or: [{ reporterId: user._id }, { targetUserId: user._id }] }),
      BlockList.deleteMany({ $or: [{ userId: user._id }, { blockedUserId: user._id }] }),
      MuteList.deleteMany({ $or: [{ userId: user._id }, { mutedUserId: user._id }] }),
      User.findByIdAndDelete(user._id)
    ]);

    return res.json({ success: true });
  } catch (error) {
    console.error('Control panel delete user error:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.get('/reports', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const query = {};

    if (req.query.status) query.status = req.query.status;
    if (req.query.category) query.category = req.query.category;
    if (req.query.priority) query.priority = req.query.priority;

    const [reports, total] = await Promise.all([
      Report.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('reporterId', 'username realName')
        .populate('targetUserId', 'username realName')
        .lean(),
      Report.countDocuments(query)
    ]);

    return res.json({
      reports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1)
      }
    });
  } catch (error) {
    console.error('Admin reports error:', error);
    return res.status(500).json({ error: 'Failed to load reports' });
  }
});

router.put('/reports/:reportId', [
  authenticateToken,
  requireAdmin,
  body('status').optional().isIn(['pending', 'under_review', 'resolved', 'dismissed']),
  body('resolution.action').optional().isIn(['none', 'warning', 'content_removed', 'suspension', 'ban']),
  body('resolution.reason').optional().isString().isLength({ max: 1000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const report = await Report.findById(req.params.reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (req.body.status) {
      report.status = req.body.status;
    }

    if (req.body.resolution) {
      report.resolution = {
        ...report.resolution,
        ...req.body.resolution,
        resolvedBy: req.user._id,
        resolvedAt: new Date()
      };
    }

    await report.save();
    return res.json({ success: true, report });
  } catch (error) {
    console.error('Update report error:', error);
    return res.status(500).json({ error: 'Failed to update report' });
  }
});

router.post('/actions', [
  authenticateToken,
  requireAdmin,
  body('targetUserId').isMongoId(),
  body('action').isIn(['warning', 'suspension', 'ban']),
  body('reason').optional().isString().isLength({ max: 1000 }),
  body('duration').optional().isInt({ min: 1, max: 3650 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const user = await User.findById(req.body.targetUserId);
    if (!user) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    const action = req.body.action;
    const duration = req.body.duration ? Number(req.body.duration) : null;

    user.moderationStatus = action === 'warning' ? 'warned' : action === 'suspension' ? 'suspended' : 'banned';
    user.registrationStatus = action === 'warning' ? 'active' : 'suspended';
    user.moderationHistory.push({
      action,
      reason: req.body.reason || '',
      duration,
      appliedBy: req.user._id,
      expiresAt: duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null
    });

    await user.save();
    return res.json({ success: true, moderationStatus: user.moderationStatus });
  } catch (error) {
    console.error('Moderation action error:', error);
    return res.status(500).json({ error: 'Failed to apply moderation action' });
  }
});

router.post('/appeals', [
  authenticateToken,
  body('reportId').isMongoId(),
  body('justification').isString().trim().isLength({ min: 10, max: 1500 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const report = await Report.findById(req.body.reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (String(report.targetUserId) !== String(req.user._id) && String(report.reporterId) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Not authorized to appeal this report' });
    }

    report.appeal = {
      status: 'pending',
      justification: req.body.justification,
      reviewedBy: null,
      reviewedAt: null,
      decision: ''
    };
    await report.save();

    return res.status(201).json({ success: true, message: 'Appeal submitted' });
  } catch (error) {
    console.error('Submit appeal error:', error);
    return res.status(500).json({ error: 'Failed to submit appeal' });
  }
});

router.get('/appeals', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const appeals = await Report.find({ 'appeal.status': 'pending' })
      .sort({ updatedAt: -1 })
      .limit(100)
      .populate('targetUserId', 'username realName')
      .populate('reporterId', 'username realName')
      .lean();

    return res.json({ appeals });
  } catch (error) {
    console.error('Get appeals error:', error);
    return res.status(500).json({ error: 'Failed to load appeals' });
  }
});

router.put('/appeals/:reportId', [
  authenticateToken,
  requireAdmin,
  body('status').isIn(['approved', 'rejected']),
  body('decision').optional().isString().isLength({ max: 1000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const report = await Report.findById(req.params.reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    report.appeal.status = req.body.status;
    report.appeal.decision = req.body.decision || '';
    report.appeal.reviewedBy = req.user._id;
    report.appeal.reviewedAt = new Date();

    if (req.body.status === 'approved') {
      report.status = 'dismissed';
      report.resolution = {
        ...report.resolution,
        action: 'none',
        reason: 'Appeal approved',
        resolvedBy: req.user._id,
        resolvedAt: new Date()
      };
    }

    await report.save();
    return res.json({ success: true, report });
  } catch (error) {
    console.error('Process appeal error:', error);
    return res.status(500).json({ error: 'Failed to process appeal' });
  }
});

module.exports = router;
