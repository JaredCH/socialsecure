const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const Report = require('../models/Report');
const BlockList = require('../models/BlockList');
const MuteList = require('../models/MuteList');
const User = require('../models/User');
const Post = require('../models/Post');

const REPORT_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const REPORT_LIMIT_MAX = 5;

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
