const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const BlockList = require('../models/BlockList');
const Friendship = require('../models/Friendship');
const Resume = require('../models/Resume');

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildContainsRegex = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return new RegExp(escapeRegex(normalized), 'i');
};

const hasBlockRelationship = async (viewerId, targetId) => {
  const record = await BlockList.findOne({
    $or: [
      { userId: viewerId, blockedUserId: targetId },
      { userId: targetId, blockedUserId: viewerId }
    ]
  }).select('_id').lean();

  return !!record;
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

// Search users (returns public profiles)
router.get('/search', async (req, res) => {
  try {
    const criteria = {
      q: String(req.query.q || '').trim(),
      firstName: String(req.query.firstName || '').trim(),
      lastName: String(req.query.lastName || '').trim(),
      city: String(req.query.city || '').trim(),
      state: String(req.query.state || '').trim(),
      zip: String(req.query.zip || '').trim(),
      county: String(req.query.county || '').trim(),
      phone: String(req.query.phone || '').trim(),
      streetAddress: String(req.query.streetAddress || '').trim(),
      friendsOfUser: String(req.query.friendsOfUser || '').trim(),
      worksAt: String(req.query.worksAt || '').trim(),
      hobbies: String(req.query.hobbies || '').trim(),
      ageFilters: String(req.query.ageFilters || '').trim(),
      sex: String(req.query.sex || '').trim(),
      race: String(req.query.race || '').trim()
    };

    const hasAnyCriteria = Object.values(criteria).some((value) => value.length > 0);
    if (!hasAnyCriteria) {
      return res.status(400).json({ error: 'At least one search criteria value is required' });
    }

    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 20;

    const userFilter = {
      registrationStatus: 'active'
    };

    const qRegex = criteria.q.length >= 2 ? buildContainsRegex(criteria.q) : null;
    if (qRegex) {
      userFilter.$or = [{ username: qRegex }, { realName: qRegex }];
    }
    if (criteria.city) userFilter.city = buildContainsRegex(criteria.city);
    if (criteria.state) userFilter.state = buildContainsRegex(criteria.state);
    if (criteria.zip) userFilter.zipCode = buildContainsRegex(criteria.zip);
    if (criteria.county) userFilter.county = buildContainsRegex(criteria.county);
    if (criteria.phone) userFilter.phone = buildContainsRegex(criteria.phone);

    const users = await User.find(userFilter)
      .select('username realName city state country county zipCode phone bio friendCount createdAt pgpPublicKey')
      .sort({ friendCount: -1, createdAt: -1 })
      .limit(Math.max(limit * 5, 40))
      .lean();

    let friendSet = null;
    if (criteria.friendsOfUser) {
      const sourceUser = await User.findOne({ username: criteria.friendsOfUser.toLowerCase() }).select('_id').lean();
      if (sourceUser?._id) {
        const friendLinks = await Friendship.find({
          status: 'accepted',
          $or: [{ requester: sourceUser._id }, { recipient: sourceUser._id }]
        }).select('requester recipient').lean();
        friendSet = new Set(
          friendLinks.map((row) => (
            String(row.requester) === String(sourceUser._id)
              ? String(row.recipient)
              : String(row.requester)
          ))
        );
      } else {
        friendSet = new Set();
      }
    }

    const resumeOwnerIds = users.map((user) => user._id);
    const resumes = await Resume.find({
      ownerId: { $in: resumeOwnerIds },
      isDeleted: { $ne: true }
    })
      .select('ownerId basics experience skills summary')
      .lean();
    const resumeByOwnerId = new Map(resumes.map((resume) => [String(resume.ownerId), resume]));

    const buildNameMatchers = (realName = '') => {
      const parts = String(realName || '').trim().split(/\s+/).filter(Boolean);
      return {
        first: parts[0] || '',
        last: parts.length > 1 ? parts.slice(1).join(' ') : ''
      };
    };

    const scoredUsers = users
      .map((user) => {
        const resume = resumeByOwnerId.get(String(user._id));
        const names = buildNameMatchers(user.realName);
        const searchableProfileText = [
          user.bio || '',
          resume?.summary || '',
          resume?.skills?.join(' ') || ''
        ].join(' ');
        const workHistory = Array.isArray(resume?.experience) ? resume.experience : [];

        let score = 0;
        let maxScore = 0;

        const scoreRule = (condition, points) => {
          maxScore += points;
          if (condition) score += points;
        };

        if (criteria.q.length >= 2) {
          scoreRule(
            buildContainsRegex(criteria.q)?.test(user.username || '')
            || buildContainsRegex(criteria.q)?.test(user.realName || ''),
            2.2
          );
        }

        if (criteria.firstName) scoreRule(buildContainsRegex(criteria.firstName)?.test(names.first), 2);
        if (criteria.lastName) scoreRule(buildContainsRegex(criteria.lastName)?.test(names.last), 2);
        if (criteria.city) scoreRule(buildContainsRegex(criteria.city)?.test(user.city || ''), 1.5);
        if (criteria.state) scoreRule(buildContainsRegex(criteria.state)?.test(user.state || ''), 1.5);
        if (criteria.zip) scoreRule(buildContainsRegex(criteria.zip)?.test(user.zipCode || ''), 1.5);
        if (criteria.county) scoreRule(buildContainsRegex(criteria.county)?.test(user.county || ''), 1.5);
        if (criteria.phone) scoreRule(buildContainsRegex(criteria.phone)?.test(user.phone || ''), 1);
        if (criteria.friendsOfUser) scoreRule(friendSet ? friendSet.has(String(user._id)) : false, 2);

        if (criteria.worksAt) {
          const worksAtMatcher = buildContainsRegex(criteria.worksAt);
          scoreRule(workHistory.some((entry) => worksAtMatcher?.test(entry?.employer || '')), 2);
        }

        if (criteria.hobbies) scoreRule(buildContainsRegex(criteria.hobbies)?.test(searchableProfileText), 1);
        if (criteria.streetAddress) scoreRule(buildContainsRegex(criteria.streetAddress)?.test(searchableProfileText), 0.7);
        if (criteria.ageFilters) scoreRule(buildContainsRegex(criteria.ageFilters)?.test(searchableProfileText), 0.6);
        if (criteria.sex) scoreRule(buildContainsRegex(criteria.sex)?.test(searchableProfileText), 0.6);
        if (criteria.race) scoreRule(buildContainsRegex(criteria.race)?.test(searchableProfileText), 0.6);

        const normalizedScore = maxScore > 0 ? score / maxScore : 0;

        return {
          _id: user._id,
          username: user.username,
          realName: user.realName,
          city: user.city,
          state: user.state,
          country: user.country,
          county: user.county,
          zipCode: user.zipCode,
          hasPGP: !!user.pgpPublicKey,
          rankingScore: Number(normalizedScore.toFixed(4))
        };
      })
      .filter((user) => user.rankingScore > 0)
      .sort((a, b) => b.rankingScore - a.rankingScore)
      .slice(0, limit);

    res.json({
      success: true,
      users: scoredUsers
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users', details: error.message });
  }
});

// Get user by username
router.get('/username/:username', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    
    const user = await User.findOne({ username: username.toLowerCase() })
      .select('-passwordHash -encryptionPasswordHash -pgpPublicKey');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const blocked = await hasBlockRelationship(req.user.userId, user._id);
    if (blocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    const publicUser = user.toPublicProfile();
    delete publicUser.hasEncryptionPassword;
    
    res.json({
      success: true,
      user: publicUser
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user', details: error.message });
  }
});

// Get user by ID
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select('-passwordHash -encryptionPasswordHash -pgpPublicKey');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const blocked = await hasBlockRelationship(req.user.userId, user._id);
    if (blocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    const publicUser = user.toPublicProfile();
    delete publicUser.hasEncryptionPassword;
    
    res.json({
      success: true,
      user: publicUser
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user', details: error.message });
  }
});

module.exports = router;
