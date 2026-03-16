const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const Post = require('../models/Post');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const BlockList = require('../models/BlockList');
const MuteList = require('../models/MuteList');
const SiteContentFilter = require('../models/SiteContentFilter');
const { createNotification } = require('../services/notifications');
const { emitFeedInteraction, emitFeedPost } = require('../services/realtime');
const {
  RELATIONSHIP_AUDIENCE_VALUES,
  normalizeRelationshipAudience,
  getViewerRelationshipContext,
  logRelationshipAudienceEvent
} = require('../utils/relationshipAudience');
const {
  findExactFilterWord,
  censorMaturityText,
  normalizeFilterWords
} = require('../utils/contentFilter');

const MEDIA_URL_MAX_ITEMS = 8;
const MEDIA_URL_MAX_LENGTH = 2048;
const HTTP_URL_REGEX = /^https?:\/\/\S+$/i;
const VALID_VISIBILITY = ['public', 'friends', 'circles', 'specific_users', 'private'];
const VALID_INTERACTION_TYPES = ['poll', 'quiz', 'countdown'];
const VALID_INTERACTION_STATUS = ['active', 'closed', 'expired'];
const INTERACTION_MAX_OPTIONS = 6;
const INTERACTION_MAX_OPTION_LENGTH = 120;
const INTERACTION_MAX_QUESTION_LENGTH = 280;
const INTERACTION_MAX_EXPLANATION_LENGTH = 1000;
const INTERACTION_MAX_COUNTDOWN_LABEL_LENGTH = 180;
const INTERACTION_MAX_TIMEZONE_LENGTH = 80;
const interactionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many interaction requests, please slow down.' },
  keyGenerator: (req) => String(req?.user?.userId || req.ip || req.socket?.remoteAddress || 'unknown')
});

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

const buildRealtimeAudience = async (...seedUserIds) => {
  const normalizedSeedIds = [...new Set(seedUserIds.map((value) => String(value || '').trim()).filter(Boolean))];
  const audience = new Set(normalizedSeedIds);

  await Promise.all(normalizedSeedIds.map(async (seedUserId) => {
    const { friendIds } = await getViewerRelationshipContext(seedUserId);
    for (const friendId of friendIds) {
      audience.add(String(friendId));
    }
  }));

  return [...audience];
};

const getContentFilterConfig = async () => {
  const config = await SiteContentFilter.findOne({ key: 'global' }).lean();
  return {
    zeroToleranceWords: normalizeFilterWords(config?.zeroToleranceWords || []),
    maturityCensoredWords: normalizeFilterWords(config?.maturityCensoredWords || [])
  };
};

const getViewerContentFilterPreference = async (viewerId, defaultValue = true) => {
  if (!viewerId) return defaultValue;
  const viewerQuery = User.findById(viewerId).select('enableMaturityWordCensor');
  const viewer = typeof viewerQuery?.lean === 'function'
    ? await viewerQuery.lean()
    : await viewerQuery;
  if (!viewer) return defaultValue;
  return viewer.enableMaturityWordCensor !== false;
};

const decoratePostContent = (post, maturityWords = [], censorEnabled = true) => {
  if (!post || typeof post !== 'object') return post;
  const rawContent = typeof post.content === 'string' ? post.content : '';
  const contentCensored = censorMaturityText(rawContent, maturityWords);
  return {
    ...post,
    content: censorEnabled ? contentCensored : rawContent,
    contentCensored
  };
};

const canViewerSeePost = (post, viewerId, relationshipContext, viewerCoordinates = null) => {
  const authorId = String(post.authorId?._id || post.authorId || '');
  return post.canView(viewerId, {
    isFriend: relationshipContext.friendIds.has(authorId),
    isSecureFriend: relationshipContext.secureAudienceOwnerIds.has(authorId),
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

const sanitizeInteractionOptions = (optionsInput) => {
  if (!Array.isArray(optionsInput)) {
    return { ok: false, error: 'options must be an array' };
  }

  const options = [];
  for (let i = 0; i < optionsInput.length; i += 1) {
    const value = String(optionsInput[i] ?? '').trim();
    if (!value) {
      return { ok: false, error: `options[${i}] is required` };
    }
    if (value.length > INTERACTION_MAX_OPTION_LENGTH) {
      return { ok: false, error: `options[${i}] exceeds ${INTERACTION_MAX_OPTION_LENGTH} characters` };
    }
    options.push(value);
  }

  if (options.length < 2) {
    return { ok: false, error: 'at least two options are required' };
  }
  if (options.length > INTERACTION_MAX_OPTIONS) {
    return { ok: false, error: `no more than ${INTERACTION_MAX_OPTIONS} options are allowed` };
  }

  return { ok: true, options };
};

const parseFutureDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const sanitizeInteractionPayload = (interactionInput) => {
  if (interactionInput === undefined || interactionInput === null) {
    return { ok: true, interaction: null };
  }
  if (typeof interactionInput !== 'object' || Array.isArray(interactionInput)) {
    return { ok: false, error: 'interaction must be an object' };
  }

  const type = String(interactionInput.type || '').trim().toLowerCase();
  if (!VALID_INTERACTION_TYPES.includes(type)) {
    return { ok: false, error: 'interaction type must be poll, quiz, or countdown' };
  }

  const statusInput = interactionInput.status ? String(interactionInput.status).trim().toLowerCase() : 'active';
  if (!VALID_INTERACTION_STATUS.includes(statusInput)) {
    return { ok: false, error: 'interaction status must be active, closed, or expired' };
  }

  if (type === 'poll') {
    const question = String(interactionInput.question || '').trim();
    if (!question) {
      return { ok: false, error: 'poll question is required' };
    }
    if (question.length > INTERACTION_MAX_QUESTION_LENGTH) {
      return { ok: false, error: `poll question exceeds ${INTERACTION_MAX_QUESTION_LENGTH} characters` };
    }
    const optionsResult = sanitizeInteractionOptions(interactionInput.options);
    if (!optionsResult.ok) {
      return { ok: false, error: `poll ${optionsResult.error}` };
    }

    const expiresAt = parseFutureDate(interactionInput.expiresAt);
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      return { ok: false, error: 'poll expiresAt must be a future timestamp' };
    }

    return {
      ok: true,
      interaction: {
        type: 'poll',
        status: statusInput,
        expiresAt,
        poll: {
          question,
          options: optionsResult.options,
          allowMultiple: Boolean(interactionInput.allowMultiple)
        }
      }
    };
  }

  if (type === 'quiz') {
    const question = String(interactionInput.question || '').trim();
    if (!question) {
      return { ok: false, error: 'quiz question is required' };
    }
    if (question.length > INTERACTION_MAX_QUESTION_LENGTH) {
      return { ok: false, error: `quiz question exceeds ${INTERACTION_MAX_QUESTION_LENGTH} characters` };
    }

    const optionsResult = sanitizeInteractionOptions(interactionInput.options);
    if (!optionsResult.ok) {
      return { ok: false, error: `quiz ${optionsResult.error}` };
    }

    const correctOptionIndex = Number.parseInt(interactionInput.correctOptionIndex, 10);
    if (!Number.isInteger(correctOptionIndex) || correctOptionIndex < 0 || correctOptionIndex >= optionsResult.options.length) {
      return { ok: false, error: 'quiz correctOptionIndex is out of bounds' };
    }

    const explanation = String(interactionInput.explanation || '').trim();
    if (explanation.length > INTERACTION_MAX_EXPLANATION_LENGTH) {
      return { ok: false, error: `quiz explanation exceeds ${INTERACTION_MAX_EXPLANATION_LENGTH} characters` };
    }

    const expiresAt = parseFutureDate(interactionInput.expiresAt);
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      return { ok: false, error: 'quiz expiresAt must be a future timestamp' };
    }

    return {
      ok: true,
      interaction: {
        type: 'quiz',
        status: statusInput,
        expiresAt,
        quiz: {
          question,
          options: optionsResult.options,
          correctOptionIndex,
          explanation
        }
      }
    };
  }

  const label = String(interactionInput.label || '').trim();
  if (!label) {
    return { ok: false, error: 'countdown label is required' };
  }
  if (label.length > INTERACTION_MAX_COUNTDOWN_LABEL_LENGTH) {
    return { ok: false, error: `countdown label exceeds ${INTERACTION_MAX_COUNTDOWN_LABEL_LENGTH} characters` };
  }

  const timezone = String(interactionInput.timezone || '').trim();
  if (!timezone) {
    return { ok: false, error: 'countdown timezone is required' };
  }
  if (timezone.length > INTERACTION_MAX_TIMEZONE_LENGTH) {
    return { ok: false, error: `countdown timezone exceeds ${INTERACTION_MAX_TIMEZONE_LENGTH} characters` };
  }

  const targetAt = parseFutureDate(interactionInput.targetAt);
  if (!targetAt || targetAt.getTime() <= Date.now()) {
    return { ok: false, error: 'countdown targetAt must be a future timestamp' };
  }

  const linkUrl = String(interactionInput.linkUrl || '').trim();
  if (linkUrl && !HTTP_URL_REGEX.test(linkUrl)) {
    return { ok: false, error: 'countdown linkUrl must begin with http:// or https://' };
  }

  return {
    ok: true,
    interaction: {
      type: 'countdown',
      status: statusInput,
      countdown: {
        label,
        targetAt,
        timezone,
        linkUrl
      }
    }
  };
};

const getInteractionEffectiveStatus = (interaction) => {
  if (!interaction?.type) return null;
  if (interaction.status === 'closed') {
    return 'closed';
  }

  const now = Date.now();
  if (
    (interaction.expiresAt && new Date(interaction.expiresAt).getTime() <= now)
    || (interaction.type === 'countdown' && interaction.countdown?.targetAt && new Date(interaction.countdown.targetAt).getTime() <= now)
  ) {
    return 'expired';
  }

  return interaction.status || 'active';
};

const buildInteractionState = (post, userId = null) => {
  if (!post?.interaction?.type) return null;

  const interaction = post.interaction.toObject ? post.interaction.toObject() : { ...post.interaction };
  const responses = post.interactionResponses || {};
  const viewerId = userId ? String(userId) : '';
  const status = getInteractionEffectiveStatus(interaction);

  if (interaction.type === 'poll') {
    const options = Array.isArray(interaction.poll?.options) ? interaction.poll.options : [];
    const votes = Array.isArray(responses.pollVotes) ? responses.pollVotes : [];
    const optionVoteCounts = Array.from({ length: options.length }, () => 0);
    let viewerSelection = [];

    votes.forEach((vote) => {
      const indexes = Array.isArray(vote.optionIndexes) ? vote.optionIndexes : [];
      indexes.forEach((index) => {
        if (Number.isInteger(index) && index >= 0 && index < optionVoteCounts.length) {
          optionVoteCounts[index] += 1;
        }
      });
      if (viewerId && String(vote.userId) === viewerId) {
        viewerSelection = indexes.filter((index) => Number.isInteger(index));
      }
    });

    return {
      type: 'poll',
      status,
      expiresAt: interaction.expiresAt || null,
      poll: {
        question: interaction.poll?.question || '',
        allowMultiple: Boolean(interaction.poll?.allowMultiple),
        options: options.map((label, index) => ({
          index,
          label,
          votes: optionVoteCounts[index]
        }))
      },
      totals: {
        submissions: votes.length
      },
      viewer: {
        hasSubmitted: viewerSelection.length > 0,
        selection: viewerSelection
      }
    };
  }

  if (interaction.type === 'quiz') {
    const options = Array.isArray(interaction.quiz?.options) ? interaction.quiz.options : [];
    const answers = Array.isArray(responses.quizAnswers) ? responses.quizAnswers : [];
    const answerCounts = Array.from({ length: options.length }, () => 0);
    let viewerAnswer = null;

    answers.forEach((answer) => {
      const index = Number(answer.optionIndex);
      if (Number.isInteger(index) && index >= 0 && index < answerCounts.length) {
        answerCounts[index] += 1;
      }
      if (viewerId && String(answer.userId) === viewerId) {
        viewerAnswer = {
          optionIndex: index,
          isCorrect: Boolean(answer.isCorrect)
        };
      }
    });

    return {
      type: 'quiz',
      status,
      expiresAt: interaction.expiresAt || null,
      quiz: {
        question: interaction.quiz?.question || '',
        options: options.map((label, index) => ({
          index,
          label,
          answers: answerCounts[index]
        })),
        correctOptionIndex: interaction.quiz?.correctOptionIndex,
        explanation: interaction.quiz?.explanation || ''
      },
      totals: {
        submissions: answers.length
      },
      viewer: {
        hasSubmitted: viewerAnswer !== null,
        answer: viewerAnswer
      }
    };
  }

  const followers = Array.isArray(responses.countdownFollowers) ? responses.countdownFollowers : [];
  const isFollowing = viewerId
    ? followers.some((entry) => String(entry.userId) === viewerId)
    : false;

  return {
    type: 'countdown',
    status,
    countdown: {
      label: interaction.countdown?.label || '',
      targetAt: interaction.countdown?.targetAt || null,
      timezone: interaction.countdown?.timezone || '',
      linkUrl: interaction.countdown?.linkUrl || ''
    },
    totals: {
      followers: followers.length
    },
    viewer: {
      isFollowing
    }
  };
};

const interactionSubmissionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many interaction submissions, please try again shortly.' }
});

const interactionReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many interaction requests, please try again shortly.' }
});

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
    const [relationshipContext, contentFilter, censorEnabled] = await Promise.all([
      getViewerRelationshipContext(viewerId),
      getContentFilterConfig(),
      getViewerContentFilterPreference(viewerId, true)
    ]);
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
      .filter((post) => canViewerSeePost(post, viewerId, relationshipContext, viewerCoordinates));

    const secureVisibleCount = visiblePosts.filter((post) => normalizeRelationshipAudience(post.relationshipAudience) === 'secure').length;
    if (secureVisibleCount > 0) {
      logRelationshipAudienceEvent({
        eventType: 'secure_content_viewed',
        viewerId,
        ownerId: userId,
        req,
        metadata: {
          route: 'feed_user',
          secureVisibleCount
        }
      });
    }

    const start = (page - 1) * limit;
    const posts = visiblePosts
      .slice(start, start + limit)
      .map((post) => decoratePostContent(post.toObject ? post.toObject() : post, contentFilter.maturityCensoredWords, censorEnabled));

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
  body('relationshipAudience').optional().isIn(RELATIONSHIP_AUDIENCE_VALUES).withMessage('Invalid relationship audience'),
  body('mediaUrls').optional(),
  body('visibleToCircles').optional().isArray({ max: 25 }).withMessage('visibleToCircles must be an array'),
  body('visibleToUsers').optional().isArray({ max: 200 }).withMessage('visibleToUsers must be an array'),
  body('excludeUsers').optional().isArray({ max: 200 }).withMessage('excludeUsers must be an array'),
  body('locationRadius').optional({ nullable: true }).isFloat({ min: 1, max: 1000 }),
  body('expiresAt').optional({ nullable: true }).isISO8601(),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('interaction').optional()
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
      relationshipAudience,
      visibleToCircles,
      visibleToUsers,
      excludeUsers,
      locationRadius,
      expiresAt,
      latitude,
      longitude,
      mediaUrls: mediaUrlsInput,
      interaction: interactionInput
    } = req.body;
    const authorId = String(req.user.userId || '');
    const normalizedTargetFeedId = String(targetFeedId || '');
    const contentFilter = await getContentFilterConfig();

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

    const bannedWord = findExactFilterWord(content, contentFilter.zeroToleranceWords);
    if (bannedWord) {
      return res.status(400).json({
        error: `You are attempting to use a word that is banned on this site "${bannedWord}".`
      });
    }

    const interactionValidation = sanitizeInteractionPayload(interactionInput);
    if (!interactionValidation.ok) {
      return res.status(400).json({
        error: interactionValidation.error,
        field: 'interaction'
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
    const normalizedRelationshipAudience = normalizeRelationshipAudience(relationshipAudience);

    if (
      normalizedRelationshipAudience === 'secure'
      && visibility !== 'friends'
    ) {
      return res.status(400).json({
        error: 'Secure audience currently supports only friends visibility'
      });
    }

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
      mediaUrls: mediaUrlsValidation.mediaUrls,
      interaction: interactionValidation.interaction,
      relationshipAudience: normalizedRelationshipAudience
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

    logRelationshipAudienceEvent({
      eventType: 'content_audience_selected',
      viewerId: authorId,
      ownerId: authorId,
      req,
      metadata: {
        contentType: 'post',
        contentId: String(post._id),
        visibility,
        relationshipAudience: normalizedRelationshipAudience
      }
    });
    
    // Populate author and target user info
    await post.populate('authorId', 'username realName');
    await post.populate('targetFeedId', 'username realName');

    const postObject = post.toObject ? post.toObject() : post;
    const authorCensorEnabled = await getViewerContentFilterPreference(authorId, true);
    const responsePost = decoratePostContent(postObject, contentFilter.maturityCensoredWords, authorCensorEnabled);
    const realtimePost = decoratePostContent(postObject, contentFilter.maturityCensoredWords, false);

    const audienceUserIds = await buildRealtimeAudience(authorId, normalizedTargetFeedId);
    emitFeedPost({
      userIds: audienceUserIds,
      post: realtimePost
    });
    
    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post: responsePost
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
router.post('/post/:postId/like', interactionRateLimiter, authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Check if user can view post before liking
    const relationshipContext = await getViewerRelationshipContext(String(userId));
    const canView = canViewerSeePost(post, String(userId), relationshipContext, null);
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

    const audienceUserIds = await buildRealtimeAudience(post.authorId, post.targetFeedId, userId);
    emitFeedInteraction({
      userIds: audienceUserIds,
      interaction: {
        type: 'like',
        postId: String(post._id),
        actorId: String(userId),
        likesCount: post.likes.length,
        commentsCount: post.comments.length
      }
    });
    
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
router.delete('/post/:postId/like', interactionRateLimiter, authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    await post.removeLike(userId);

    const audienceUserIds = await buildRealtimeAudience(post.authorId, post.targetFeedId, userId);
    emitFeedInteraction({
      userIds: audienceUserIds,
      interaction: {
        type: 'unlike',
        postId: String(post._id),
        actorId: String(userId),
        likesCount: post.likes.length,
        commentsCount: post.comments.length
      }
    });
    
    res.json({
      success: true,
      message: 'Post unliked',
      likesCount
    });
  } catch (error) {
    console.error('Error unliking post:', error);
    res.status(500).json({ error: 'Failed to unlike post', details: error.message });
  }
});

// Add comment to post
router.post('/post/:postId/comment', [
  interactionRateLimiter,
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
    const relationshipContext = await getViewerRelationshipContext(String(userId));
    const canView = canViewerSeePost(post, String(userId), relationshipContext, null);
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

    const audienceUserIds = await buildRealtimeAudience(post.authorId, post.targetFeedId, userId);
    emitFeedInteraction({
      userIds: audienceUserIds,
      interaction: {
        type: 'comment',
        postId: String(post._id),
        actorId: String(userId),
        likesCount: post.likes.length,
        commentsCount: post.comments.length,
        comment: {
          _id: newComment?._id,
          userId: String(newComment?.userId || userId),
          username: actor?.username || actor?.realName || 'user',
          content: newComment?.content || content,
          createdAt: newComment?.createdAt || new Date().toISOString()
        }
      }
    });
    
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

router.post('/post/:postId/vote', interactionSubmissionLimiter, authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = String(req.user.userId);
    const post = await Post.findById(postId).select('+interactionResponses');
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const relationshipContext = await getViewerRelationshipContext(userId);
    if (!canViewerSeePost(post, userId, relationshipContext, null)) {
      return res.status(403).json({ error: 'Cannot vote on this post' });
    }

    if (post.interaction?.type !== 'poll') {
      return res.status(400).json({ error: 'This post does not contain a poll interaction' });
    }

    const effectiveStatus = getInteractionEffectiveStatus(post.interaction);
    if (effectiveStatus !== 'active') {
      post.interaction.status = effectiveStatus;
      await post.save();
      return res.status(409).json({ error: 'Poll interaction is no longer accepting votes' });
    }

    const pollOptions = Array.isArray(post.interaction.poll?.options) ? post.interaction.poll.options : [];
    const rawOptionIndexes = Array.isArray(req.body.optionIndexes)
      ? req.body.optionIndexes
      : [req.body.optionIndex];
    const optionIndexes = [...new Set(
      rawOptionIndexes
        .map((value) => Number.parseInt(value, 10))
        .filter((index) => Number.isInteger(index))
    )];

    if (optionIndexes.length === 0) {
      return res.status(400).json({ error: 'At least one option index is required' });
    }

    if (!post.interaction.poll?.allowMultiple && optionIndexes.length > 1) {
      return res.status(400).json({ error: 'Poll does not allow selecting multiple options' });
    }

    if (optionIndexes.some((index) => index < 0 || index >= pollOptions.length)) {
      return res.status(400).json({ error: 'One or more option indexes are invalid' });
    }

    post.interactionResponses = post.interactionResponses || { pollVotes: [], quizAnswers: [], countdownFollowers: [] };
    const pollVotes = Array.isArray(post.interactionResponses.pollVotes) ? post.interactionResponses.pollVotes : [];
    if (pollVotes.some((entry) => String(entry.userId) === userId)) {
      return res.status(409).json({ error: 'You have already voted on this poll' });
    }

    pollVotes.push({
      userId,
      optionIndexes,
      createdAt: new Date()
    });
    post.interactionResponses.pollVotes = pollVotes;
    await post.save();

    return res.json({
      success: true,
      interaction: buildInteractionState(post, userId)
    });
  } catch (error) {
    console.error('Error submitting poll vote:', error);
    return res.status(500).json({ error: 'Failed to submit poll vote', details: error.message });
  }
});

router.post('/post/:postId/quiz-answer', interactionSubmissionLimiter, authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = String(req.user.userId);
    const post = await Post.findById(postId).select('+interactionResponses');
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const relationshipContext = await getViewerRelationshipContext(userId);
    if (!canViewerSeePost(post, userId, relationshipContext, null)) {
      return res.status(403).json({ error: 'Cannot answer this quiz' });
    }

    if (post.interaction?.type !== 'quiz') {
      return res.status(400).json({ error: 'This post does not contain a quiz interaction' });
    }

    const effectiveStatus = getInteractionEffectiveStatus(post.interaction);
    if (effectiveStatus !== 'active') {
      post.interaction.status = effectiveStatus;
      await post.save();
      return res.status(409).json({ error: 'Quiz interaction is no longer accepting answers' });
    }

    const quizOptions = Array.isArray(post.interaction.quiz?.options) ? post.interaction.quiz.options : [];
    const optionIndex = Number.parseInt(req.body.optionIndex, 10);
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= quizOptions.length) {
      return res.status(400).json({ error: 'Invalid quiz option index' });
    }

    post.interactionResponses = post.interactionResponses || { pollVotes: [], quizAnswers: [], countdownFollowers: [] };
    const quizAnswers = Array.isArray(post.interactionResponses.quizAnswers) ? post.interactionResponses.quizAnswers : [];
    if (quizAnswers.some((entry) => String(entry.userId) === userId)) {
      return res.status(409).json({ error: 'Quiz answer already submitted and locked' });
    }

    const isCorrect = optionIndex === Number(post.interaction.quiz?.correctOptionIndex);
    quizAnswers.push({
      userId,
      optionIndex,
      isCorrect,
      createdAt: new Date()
    });
    post.interactionResponses.quizAnswers = quizAnswers;
    await post.save();

    return res.json({
      success: true,
      interaction: buildInteractionState(post, userId),
      result: {
        isCorrect,
        explanation: post.interaction.quiz?.explanation || ''
      }
    });
  } catch (error) {
    console.error('Error submitting quiz answer:', error);
    return res.status(500).json({ error: 'Failed to submit quiz answer', details: error.message });
  }
});

router.post('/post/:postId/countdown-follow', interactionSubmissionLimiter, authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = String(req.user.userId);
    const post = await Post.findById(postId).select('+interactionResponses');
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const relationshipContext = await getViewerRelationshipContext(userId);
    if (!canViewerSeePost(post, userId, relationshipContext, null)) {
      return res.status(403).json({ error: 'Cannot follow this countdown' });
    }

    if (post.interaction?.type !== 'countdown') {
      return res.status(400).json({ error: 'This post does not contain a countdown interaction' });
    }

    const effectiveStatus = getInteractionEffectiveStatus(post.interaction);
    if (effectiveStatus !== 'active') {
      post.interaction.status = effectiveStatus;
      await post.save();
      return res.status(409).json({ error: 'Countdown interaction is no longer active' });
    }

    post.interactionResponses = post.interactionResponses || { pollVotes: [], quizAnswers: [], countdownFollowers: [] };
    const followers = Array.isArray(post.interactionResponses.countdownFollowers)
      ? post.interactionResponses.countdownFollowers
      : [];

    if (!followers.some((entry) => String(entry.userId) === userId)) {
      followers.push({
        userId,
        createdAt: new Date()
      });
      post.interactionResponses.countdownFollowers = followers;
      await post.save();
    }

    return res.json({
      success: true,
      interaction: buildInteractionState(post, userId)
    });
  } catch (error) {
    console.error('Error following countdown:', error);
    return res.status(500).json({ error: 'Failed to follow countdown', details: error.message });
  }
});

router.get('/post/:postId/interaction', interactionReadLimiter, authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = String(req.user.userId);
    const post = await Post.findById(postId).select('+interactionResponses');
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const relationshipContext = await getViewerRelationshipContext(userId);
    if (!canViewerSeePost(post, userId, relationshipContext, null)) {
      return res.status(403).json({ error: 'Cannot view this interaction' });
    }

    if (!post.interaction?.type) {
      return res.status(404).json({ error: 'No interaction found for this post' });
    }

    const effectiveStatus = getInteractionEffectiveStatus(post.interaction);
    if (effectiveStatus !== post.interaction.status) {
      post.interaction.status = effectiveStatus;
      await post.save();
    }

    return res.json({
      success: true,
      interaction: buildInteractionState(post, userId)
    });
  } catch (error) {
    console.error('Error fetching interaction state:', error);
    return res.status(500).json({ error: 'Failed to fetch interaction state', details: error.message });
  }
});

// Get personalized timeline (posts from user and friends)
router.get('/timeline', authenticateToken, async (req, res) => {
  try {
    const userId = String(req.user.userId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const viewerCoordinates = parseViewerCoordinates(req);
    const [relationshipContext, contentFilter, censorEnabled] = await Promise.all([
      getViewerRelationshipContext(userId),
      getContentFilterConfig(),
      getViewerContentFilterPreference(userId, true)
    ]);
    const blockedOrMuted = await getBlockedOrMutedIds(userId);
    const authorIds = [userId, ...relationshipContext.friendIds];

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
      .filter((post) => canViewerSeePost(post, userId, relationshipContext, viewerCoordinates));

    const secureVisibleCount = visiblePosts.filter((post) => normalizeRelationshipAudience(post.relationshipAudience) === 'secure').length;
    if (secureVisibleCount > 0) {
      logRelationshipAudienceEvent({
        eventType: 'secure_content_viewed',
        viewerId: userId,
        req,
        metadata: {
          route: 'feed_timeline',
          secureVisibleCount
        }
      });
    }

    const start = (page - 1) * limit;
    const posts = visiblePosts
      .slice(start, start + limit)
      .map((post) => decoratePostContent(post.toObject ? post.toObject() : post, contentFilter.maturityCensoredWords, censorEnabled));
    
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
    const relationshipContext = await getViewerRelationshipContext(String(userId));
    const canView = canViewerSeePost(post, String(userId), relationshipContext, null);
    if (!canView) {
      if (normalizeRelationshipAudience(post.relationshipAudience) === 'secure') {
        logRelationshipAudienceEvent({
          eventType: 'secure_content_access_denied',
          viewerId: String(userId),
          ownerId: String(post.authorId?._id || post.authorId || ''),
          req,
          metadata: {
            route: 'feed_post',
            postId: String(post._id)
          }
        });
      }
      return res.status(403).json({ error: 'Cannot view this post' });
    }

    if (normalizeRelationshipAudience(post.relationshipAudience) === 'secure') {
      logRelationshipAudienceEvent({
        eventType: 'secure_content_viewed',
        viewerId: String(userId),
        ownerId: String(post.authorId?._id || post.authorId || ''),
        req,
        metadata: {
          route: 'feed_post',
          postId: String(post._id)
        }
      });
    }
    
    const [contentFilter, censorEnabled] = await Promise.all([
      getContentFilterConfig(),
      getViewerContentFilterPreference(String(userId), true)
    ]);

    res.json({
      success: true,
      post: decoratePostContent(post.toObject ? post.toObject() : post, contentFilter.maturityCensoredWords, censorEnabled)
    });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ error: 'Failed to fetch post', details: error.message });
  }
});

module.exports = router;
