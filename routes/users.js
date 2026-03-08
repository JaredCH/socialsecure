const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
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

const SCORE_WEIGHTS = {
  QUERY_TEXT: 2.2,
  FIRST_NAME: 2,
  LAST_NAME: 2,
  CITY: 1.5,
  STATE: 1.5,
  ZIP: 1.5,
  COUNTY: 1.5,
  PHONE: 1,
  FRIEND_OF_USER: 2,
  WORKS_AT: 2,
  HOBBIES: 1
};

const userSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many user search requests. Please try again shortly.' }
});

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

// Search users by query (legacy GET endpoint)
router.get('/search', userSearchLimiter, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const searchRegex = buildContainsRegex(q);
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { realName: searchRegex }
      ],
      registrationStatus: 'active'
    })
      .select('username realName city state country pgpPublicKey')
      .limit(20)
      .lean();

    return res.json({
      success: true,
      users: users.map((user) => ({
        _id: user._id,
        username: user.username,
        realName: user.realName,
        city: user.city,
        state: user.state,
        country: user.country,
        hasPGP: !!user.pgpPublicKey
      }))
    });
  } catch (error) {
    console.error('Error searching users:', error);
    return res.status(500).json({ error: 'Failed to search users', details: error.message });
  }
});

// Search users with optional multi-criteria ranking
router.post('/search', userSearchLimiter, async (req, res) => {
  try {
    const criteria = {
      q: String(req.body.q || '').trim(),
      firstName: String(req.body.firstName || '').trim(),
      lastName: String(req.body.lastName || '').trim(),
      city: String(req.body.city || '').trim(),
      state: String(req.body.state || '').trim(),
      zip: String(req.body.zip || '').trim(),
      county: String(req.body.county || '').trim(),
      phone: String(req.body.phone || '').trim(),
      streetAddress: String(req.body.streetAddress || '').trim(),
      friendsOfUser: String(req.body.friendsOfUser || '').trim(),
      worksAt: String(req.body.worksAt || '').trim(),
      hobbies: String(req.body.hobbies || '').trim(),
      ageFilters: String(req.body.ageFilters || '').trim(),
      sex: String(req.body.sex || '').trim(),
      race: String(req.body.race || '').trim()
    };

    const hasAnyCriteria = Object.values(criteria).some((value) => value.length > 0);
    if (!hasAnyCriteria) {
      return res.status(400).json({ error: 'At least one search criteria value is required' });
    }
    const unsupportedCriteria = ['streetAddress', 'ageFilters', 'sex', 'race']
      .filter((key) => criteria[key]);

    const requestedLimit = Number.parseInt(req.body.limit, 10);
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
        const matchers = {
          q: criteria.q.length >= 2 ? buildContainsRegex(criteria.q) : null,
          firstName: buildContainsRegex(criteria.firstName),
          lastName: buildContainsRegex(criteria.lastName),
          city: buildContainsRegex(criteria.city),
          state: buildContainsRegex(criteria.state),
          zip: buildContainsRegex(criteria.zip),
          county: buildContainsRegex(criteria.county),
          phone: buildContainsRegex(criteria.phone),
          worksAt: buildContainsRegex(criteria.worksAt),
          hobbies: buildContainsRegex(criteria.hobbies)
        };
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
            matchers.q?.test(user.username || '')
            || matchers.q?.test(user.realName || ''),
            SCORE_WEIGHTS.QUERY_TEXT
          );
        }

        if (criteria.firstName) scoreRule(matchers.firstName?.test(names.first), SCORE_WEIGHTS.FIRST_NAME);
        if (criteria.lastName) scoreRule(matchers.lastName?.test(names.last), SCORE_WEIGHTS.LAST_NAME);
        if (criteria.city) scoreRule(matchers.city?.test(user.city || ''), SCORE_WEIGHTS.CITY);
        if (criteria.state) scoreRule(matchers.state?.test(user.state || ''), SCORE_WEIGHTS.STATE);
        if (criteria.zip) scoreRule(matchers.zip?.test(user.zipCode || ''), SCORE_WEIGHTS.ZIP);
        if (criteria.county) scoreRule(matchers.county?.test(user.county || ''), SCORE_WEIGHTS.COUNTY);
        if (criteria.phone) scoreRule(matchers.phone?.test(user.phone || ''), SCORE_WEIGHTS.PHONE);
        if (criteria.friendsOfUser) scoreRule(friendSet ? friendSet.has(String(user._id)) : false, SCORE_WEIGHTS.FRIEND_OF_USER);

        if (criteria.worksAt) {
          scoreRule(workHistory.some((entry) => matchers.worksAt?.test(entry?.employer || '')), SCORE_WEIGHTS.WORKS_AT);
        }

        if (criteria.hobbies) scoreRule(matchers.hobbies?.test(searchableProfileText), SCORE_WEIGHTS.HOBBIES);

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
      users: scoredUsers,
      unsupportedCriteria
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
