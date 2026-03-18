const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');

const { normalizeRelationshipAudience, RELATIONSHIP_AUDIENCE_VALUES } = require('../utils/relationshipAudience');

const User = require('../models/User');
const Friendship = require('../models/Friendship');

const router = express.Router();

const COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const MAX_CIRCLES_PER_USER = 10;
const MAX_MEMBERS_PER_CIRCLE = 25;

const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    req.user = decoded;
    return next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const normalizeCircleName = (value = '') => value.trim().slice(0, 50);
const normalizeCircleImageUrl = (value = '') => (typeof value === 'string' ? value.trim().slice(0, 2048) : '');
const isValidHttpUrl = (value = '') => {
  if (!value) return false;
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const findCircleIndex = (circles = [], name = '') => {
  const normalized = normalizeCircleName(name).toLowerCase();
  return circles.findIndex((circle) => String(circle.name || '').trim().toLowerCase() === normalized);
};

router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('circles');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const circles = Array.isArray(user.circles) ? user.circles : [];
    const allMemberIds = [...new Set(circles.flatMap((circle) => (circle.members || []).map((member) => String(member))))];
    const memberUsers = await User.find({ _id: { $in: allMemberIds } }).select('username realName avatarUrl').lean();
    const memberMap = new Map(memberUsers.map((member) => [String(member._id), member]));

    return res.json({
      circles: circles.map((circle) => ({
        name: circle.name,
        color: circle.color,
        relationshipAudience: normalizeRelationshipAudience(circle.relationshipAudience),
        profileImageUrl: normalizeCircleImageUrl(circle.profileImageUrl),
        memberCount: Array.isArray(circle.members) ? circle.members.length : 0,
        members: (circle.members || [])
          .map((memberId) => memberMap.get(String(memberId)))
          .filter(Boolean)
      }))
    });
  } catch (error) {
    console.error('Get circles error:', error);
    return res.status(500).json({ error: 'Failed to load circles' });
  }
});

router.post('/', [
  authenticateToken,
  body('name').isString().trim().isLength({ min: 1, max: 50 }),
  body('color').optional().isString().trim().matches(COLOR_REGEX),
  body('relationshipAudience').optional().isIn(RELATIONSHIP_AUDIENCE_VALUES),
  body('profileImageUrl').optional({ nullable: true }).isString().trim().isLength({ max: 2048 }).custom((value) => (
    value === ''
    || isValidHttpUrl(value)
  ))
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const name = normalizeCircleName(req.body.name);
    if (findCircleIndex(user.circles, name) >= 0) {
      return res.status(409).json({ error: 'Circle name already exists' });
    }
    if (Array.isArray(user.circles) && user.circles.length >= MAX_CIRCLES_PER_USER) {
      return res.status(400).json({ error: `You can create up to ${MAX_CIRCLES_PER_USER} circles` });
    }

    user.circles.push({
      name,
      color: req.body.color || '#3B82F6',
      relationshipAudience: normalizeRelationshipAudience(req.body.relationshipAudience),
      profileImageUrl: normalizeCircleImageUrl(req.body.profileImageUrl),
      members: []
    });

    await user.save();
    return res.status(201).json({ success: true, message: 'Circle created' });
  } catch (error) {
    console.error('Create circle error:', error);
    return res.status(500).json({ error: 'Failed to create circle' });
  }
});

router.put('/:circleName', [
  authenticateToken,
  body('name').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('color').optional().isString().trim().matches(COLOR_REGEX),
  body('relationshipAudience').optional().isIn(RELATIONSHIP_AUDIENCE_VALUES),
  body('profileImageUrl').optional({ nullable: true }).isString().trim().isLength({ max: 2048 }).custom((value) => (
    value === ''
    || isValidHttpUrl(value)
  ))
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const index = findCircleIndex(user.circles, req.params.circleName);
    if (index < 0) {
      return res.status(404).json({ error: 'Circle not found' });
    }

    if (req.body.name) {
      const nextName = normalizeCircleName(req.body.name);
      const duplicateIndex = findCircleIndex(user.circles, nextName);
      if (duplicateIndex >= 0 && duplicateIndex !== index) {
        return res.status(409).json({ error: 'Circle name already exists' });
      }
      user.circles[index].name = nextName;
    }

    if (req.body.color) {
      user.circles[index].color = req.body.color;
    }
    if (req.body.relationshipAudience) {
      user.circles[index].relationshipAudience = normalizeRelationshipAudience(req.body.relationshipAudience);
    }
    if (req.body.profileImageUrl !== undefined) {
      user.circles[index].profileImageUrl = normalizeCircleImageUrl(req.body.profileImageUrl);
    }

    await user.save();
    return res.json({ success: true, message: 'Circle updated' });
  } catch (error) {
    console.error('Update circle error:', error);
    return res.status(500).json({ error: 'Failed to update circle' });
  }
});

router.delete('/:circleName', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const index = findCircleIndex(user.circles, req.params.circleName);
    if (index < 0) {
      return res.status(404).json({ error: 'Circle not found' });
    }

    user.circles.splice(index, 1);
    await user.save();
    return res.json({ success: true, message: 'Circle deleted' });
  } catch (error) {
    console.error('Delete circle error:', error);
    return res.status(500).json({ error: 'Failed to delete circle' });
  }
});

router.post('/:circleName/members', [
  authenticateToken,
  body('userId').isMongoId().withMessage('Valid userId required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const ownerId = String(req.user.userId);
    const memberId = String(req.body.userId);

    const friendship = await Friendship.findOne({
      $or: [
        { requester: ownerId, recipient: memberId, status: 'accepted' },
        { requester: memberId, recipient: ownerId, status: 'accepted' }
      ]
    }).lean();

    if (!friendship) {
      return res.status(403).json({ error: 'Only accepted friends can be added to circles' });
    }

    const user = await User.findById(ownerId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const index = findCircleIndex(user.circles, req.params.circleName);
    if (index < 0) {
      return res.status(404).json({ error: 'Circle not found' });
    }

    const alreadyExists = (user.circles[index].members || []).some((id) => String(id) === memberId);
    if (!alreadyExists) {
      if ((user.circles[index].members || []).length >= MAX_MEMBERS_PER_CIRCLE) {
        return res.status(400).json({ error: `Circle member limit is ${MAX_MEMBERS_PER_CIRCLE}` });
      }
      user.circles[index].members.push(memberId);
      await user.save();
    }

    return res.json({ success: true, message: 'Member added to circle' });
  } catch (error) {
    console.error('Add circle member error:', error);
    return res.status(500).json({ error: 'Failed to add member to circle' });
  }
});

router.delete('/:circleName/members/:userId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const index = findCircleIndex(user.circles, req.params.circleName);
    if (index < 0) {
      return res.status(404).json({ error: 'Circle not found' });
    }

    user.circles[index].members = (user.circles[index].members || []).filter(
      (memberId) => String(memberId) !== String(req.params.userId)
    );

    await user.save();
    return res.json({ success: true, message: 'Member removed from circle' });
  } catch (error) {
    console.error('Remove circle member error:', error);
    return res.status(500).json({ error: 'Failed to remove member from circle' });
  }
});

module.exports = router;
