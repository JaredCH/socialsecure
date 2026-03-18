const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const BlockList = require('../models/BlockList');
const Resume = require('../models/Resume');
const Friendship = require('../models/Friendship');
const SiteContentFilter = require('../models/SiteContentFilter');
const { toPublicSocialPagePreferences } = require('../utils/socialPagePreferences');
const {
  normalizeRelationshipAudience,
  socialOrUnsetAudienceQuery,
  ownerCategorizedViewerAsSecure
} = require('../utils/relationshipAudience');
const { censorMaturityText, normalizeFilterWords } = require('../utils/contentFilter');
const { decodeAuthToken } = require('../middleware/parseAuthToken');
const { logEvent } = require('../utils/logEvent');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MEDIA_URL_MAX_ITEMS = 8;
const MEDIA_URL_MAX_LENGTH = 2048;
const HTTP_URL_REGEX = /^(https?:\/\/\S+|\/uploads\/\S+)$/i;
const sanitizeSourceParam = (value) => {
  if (typeof value !== 'string') return 'unknown';
  const trimmed = value.trim().slice(0, 120);
  return trimmed || 'unknown';
};
const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many public requests, please try again shortly.' }
});

const parsePagination = (query) => {
  const page = Number.parseInt(query.page, 10);
  const limit = Number.parseInt(query.limit, 10);

  if (query.page !== undefined && (!Number.isInteger(page) || page <= 0)) {
    return { error: 'Query parameter "page" must be a positive integer' };
  }

  if (query.limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    return { error: 'Query parameter "limit" must be a positive integer' };
  }

  const normalizedPage = Number.isInteger(page) && page > 0 ? page : DEFAULT_PAGE;
  const normalizedLimit = Number.isInteger(limit) && limit > 0
    ? Math.min(limit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    skip: (normalizedPage - 1) * normalizedLimit
  };
};

const PROFILE_VISIBILITY_ORDER = {
  public: 0,
  social: 1,
  secure: 2
};
const PERSONAL_INFO_FIELD_LABELS = {
  phone: 'Phone',
  worksAt: 'Works At',
  hobbies: 'Hobbies',
  ageGroup: 'Age Group',
  sex: 'Sex',
  race: 'Race',
  streetAddress: 'Street Address'
};
const DEFAULT_PROFILE_FIELD_VISIBILITY = 'social';
const publicUserProjection = '_id username realName city state country registrationStatus pgpPublicKey createdAt profileTheme socialPagePreferences friendListPrivacy topFriendsPrivacy phone worksAt hobbies ageGroup sex race streetAddress profileFieldVisibility';

const isPrivateProfile = (userDoc) => (
  userDoc?.friendListPrivacy === 'private'
  && userDoc?.topFriendsPrivacy === 'private'
);

const resolveViewerProfileAccessLevel = ({ isOwner, isFriend, isSecureFriend }) => {
  if (isOwner) return 'secure';
  if (isSecureFriend) return 'secure';
  if (isFriend) return 'social';
  return 'public';
};

const canViewerAccessVisibility = (fieldVisibility, maxAccessLevel) => {
  const visibility = PROFILE_VISIBILITY_ORDER[fieldVisibility] !== undefined ? fieldVisibility : DEFAULT_PROFILE_FIELD_VISIBILITY;
  const maxOrder = PROFILE_VISIBILITY_ORDER[maxAccessLevel] ?? PROFILE_VISIBILITY_ORDER.public;
  return PROFILE_VISIBILITY_ORDER[visibility] <= maxOrder;
};

const normalizePersonalInfoValue = (value, fieldId) => {
  if (fieldId === 'hobbies') {
    if (!Array.isArray(value) || value.length === 0) return '';
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .join(', ');
  }
  return String(value || '').trim();
};

const buildPublicPersonalInfo = (userDoc, relationshipContext = {}) => {
  if (!userDoc) return [];
  const maxAccessLevel = resolveViewerProfileAccessLevel(relationshipContext);
  return Object.entries(PERSONAL_INFO_FIELD_LABELS).reduce((entries, [fieldId, label]) => {
    const value = normalizePersonalInfoValue(userDoc[fieldId], fieldId);
    if (!value) return entries;
    const visibility = userDoc?.profileFieldVisibility?.[fieldId] || DEFAULT_PROFILE_FIELD_VISIBILITY;
    if (!canViewerAccessVisibility(visibility, maxAccessLevel)) return entries;
    entries.push({
      id: fieldId,
      label,
      value,
      visibility
    });
    return entries;
  }, []);
};

const toPublicUserProfile = (userDoc, relationshipContext = {}) => {
  if (!userDoc) return null;
  const personalInfo = buildPublicPersonalInfo(userDoc, relationshipContext);

  return {
    _id: userDoc._id,
    username: userDoc.username,
    realName: userDoc.realName,
    city: userDoc.city || null,
    state: userDoc.state || null,
    country: userDoc.country || null,
    registrationStatus: userDoc.registrationStatus,
    hasPGP: !!userDoc.pgpPublicKey,
    isPrivateProfile: isPrivateProfile(userDoc),
    socialPagePreferences: toPublicSocialPagePreferences(userDoc.socialPagePreferences, {
      profileTheme: userDoc.profileTheme || 'default'
    }),
    personalInfo,
    createdAt: userDoc.createdAt
  };
};

const buildResumeUrl = (username) => `/resume/${encodeURIComponent(String(username || '').trim().toLowerCase())}`;

const toDiscoverableResumeMeta = (userDoc, resumeDoc) => {
  if (!userDoc || !resumeDoc) return null;
  if (resumeDoc.visibility !== 'public') return null;

  return {
    hasPublicResume: true,
    resumeUrl: buildResumeUrl(userDoc.username),
    resumeHeadline: resumeDoc?.basics?.headline || null,
    resumeUpdatedAt: resumeDoc.updatedAt || null
  };
};

const toPublicResumePayload = (resumeDoc) => ({
  visibility: resumeDoc.visibility,
  basics: {
    headline: resumeDoc?.basics?.headline || '',
    summary: resumeDoc?.basics?.summary || ''
  },
  sections: Array.isArray(resumeDoc.sections) ? resumeDoc.sections : [],
  updatedAt: resumeDoc.updatedAt || null,
  createdAt: resumeDoc.createdAt || null
});

const logResumeEvent = (payload) => logEvent(payload);

const getViewerIdFromAuthHeader = (req) => {
  const decoded = decodeAuthToken(req);
  return decoded?.userId ? String(decoded.userId) : null;
};

const getContentFilterConfig = async () => {
  if (process.env.NODE_ENV === 'test') {
    return {
      maturityCensoredWords: []
    };
  }
  const config = await SiteContentFilter.findOne({ key: 'global' }).lean();
  return {
    maturityCensoredWords: normalizeFilterWords(config?.maturityCensoredWords || [])
  };
};

const getViewerContentFilterPreference = async (viewerId) => {
  if (process.env.NODE_ENV === 'test') return false;
  if (!viewerId) return false;
  const viewerQuery = User.findById(viewerId).select('enableMaturityWordCensor');
  const viewer = typeof viewerQuery?.lean === 'function'
    ? await viewerQuery.lean()
    : await viewerQuery;
  return viewer?.enableMaturityWordCensor !== false;
};

const hasBlockRelationship = async (viewerId, targetId) => {
  if (!viewerId || !targetId) return false;
  const record = await BlockList.findOne({
    $or: [
      { userId: viewerId, blockedUserId: targetId },
      { userId: targetId, blockedUserId: viewerId }
    ]
  }).select('_id').lean();
  return !!record;
};

const findUserByIdOrUsername = async (identifier, projection = publicUserProjection) => {
  const normalizedIdentifier = String(identifier || '').trim().toLowerCase();

  if (!normalizedIdentifier) return null;

  const lookupQuery = [{ username: normalizedIdentifier }];
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    lookupQuery.push({ _id: identifier });
  }

  return User.findOne({ $or: lookupQuery }).select(projection).lean();
};

const getViewerFriendIds = async (viewerId) => {
  const normalizedViewerId = String(viewerId || '').trim();
  if (!normalizedViewerId) return new Set();

  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [
      { requester: normalizedViewerId },
      { recipient: normalizedViewerId }
    ]
  }).select('requester recipient').lean();

  return friendships.reduce((acc, friendship) => {
    const requesterId = String(friendship.requester || '');
    const recipientId = String(friendship.recipient || '');
    const friendId = requesterId === normalizedViewerId ? recipientId : requesterId;
    if (friendId) acc.add(friendId);
    return acc;
  }, new Set());
};

const getViewerFriendContext = async (viewerId, targetId) => {
  const normalizedViewerId = String(viewerId || '').trim();
  const normalizedTargetId = String(targetId || '').trim();
  if (!normalizedViewerId || !normalizedTargetId || normalizedViewerId === normalizedTargetId) {
    return { isFriend: false, isSecureFriend: false };
  }

  const friendship = await Friendship.findOne({
    status: 'accepted',
    $or: [
      { requester: normalizedViewerId, recipient: normalizedTargetId },
      { requester: normalizedTargetId, recipient: normalizedViewerId }
    ]
  }).select(
    'status requester recipient requesterRelationshipAudience recipientRelationshipAudience requesterAudience recipientAudience requesterCategory recipientCategory'
  ).lean();

  if (!friendship) {
    return { isFriend: false, isSecureFriend: false };
  }

  return {
    isFriend: true,
    isSecureFriend: ownerCategorizedViewerAsSecure(friendship, normalizedTargetId, normalizedViewerId)
  };
};

const publicPostQuery = (userId) => ({
  targetFeedId: userId,
  visibility: 'public',
  $and: [
    socialOrUnsetAudienceQuery('relationshipAudience'),
    {
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    }
  ]
});

const publicPostPopulate = [
  { path: 'authorId', select: 'username realName' },
  { path: 'targetFeedId', select: 'username realName' }
];

const normalizeMediaUrls = (mediaUrlsInput) => {
  if (!Array.isArray(mediaUrlsInput)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const rawUrl of mediaUrlsInput) {
    if (typeof rawUrl !== 'string') continue;

    const trimmed = rawUrl.trim();
    if (!trimmed) continue;
    if (trimmed.length > MEDIA_URL_MAX_LENGTH) continue;
    if (!HTTP_URL_REGEX.test(trimmed)) continue;

    const dedupeKey = trimmed.toLowerCase();
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    normalized.push(trimmed);

    if (normalized.length >= MEDIA_URL_MAX_ITEMS) {
      break;
    }
  }

  return normalized;
};

const toPublicPost = (post, options = {}) => {
  const rawContent = post.content || null;
  const contentCensored = typeof rawContent === 'string'
    ? censorMaturityText(rawContent, options.maturityWords || [])
    : rawContent;

  return {
    _id: post._id,
    authorId: post.authorId,
    targetFeedId: post.targetFeedId,
    content: options.censorEnabled ? contentCensored : rawContent,
    contentCensored,
    mediaUrls: normalizeMediaUrls(post.mediaUrls),
    visibility: post.visibility,
    relationshipAudience: normalizeRelationshipAudience(post.relationshipAudience),
    visibleToCircles: Array.isArray(post.visibleToCircles) ? post.visibleToCircles : [],
    locationRadius: Number.isFinite(Number(post.locationRadius)) ? Number(post.locationRadius) : null,
    expiresAt: post.expiresAt || null,
    likesCount: Array.isArray(post.likes) ? post.likes.length : 0,
    commentsCount: Array.isArray(post.comments) ? post.comments.length : 0,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt
  };
};

// GET /api/public/users/:username
router.get('/users/:username', publicReadLimiter, async (req, res) => {
  try {
    const user = await findUserByIdOrUsername(req.params.username);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const viewerId = getViewerIdFromAuthHeader(req);
    const blocked = await hasBlockRelationship(viewerId, user._id);
    const isOwner = viewerId && String(viewerId) === String(user._id);
    const privateProfile = isPrivateProfile(user) && !isOwner;
    const relationshipContext = isOwner
      ? { isOwner: true, isFriend: true, isSecureFriend: true }
      : await getViewerFriendContext(viewerId, user._id);
    if (blocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resume = await Resume.findOne({ userId: user._id })
      .select('visibility basics.headline updatedAt')
      .lean();
    const resumeMeta = toDiscoverableResumeMeta(user, resume);

    return res.json({
      success: true,
      user: {
        ...toPublicUserProfile(user, relationshipContext),
        ...(!privateProfile ? (resumeMeta || { hasPublicResume: false }) : { hasPublicResume: false })
      }
    });
  } catch (error) {
    console.error('Error fetching public user profile:', error);
    return res.status(500).json({ error: 'Failed to fetch public profile' });
  }
});

// GET /api/public/users/:username/resume
router.get('/users/:username/resume', publicReadLimiter, async (req, res) => {
  try {
    const user = await findUserByIdOrUsername(req.params.username);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const viewerId = getViewerIdFromAuthHeader(req);
    const blocked = await hasBlockRelationship(viewerId, user._id);
    if (blocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resume = await Resume.findOne({ userId: user._id })
      .select('visibility basics sections createdAt updatedAt')
      .lean();
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const isOwner = Boolean(viewerId && String(viewerId) === String(user._id));
    const visibility = resume.visibility || 'private';
    const canView = isOwner || visibility === 'public' || visibility === 'unlisted';

    if (!canView) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    logResumeEvent({
      eventType: 'resume_public_viewed',
      userId: String(user._id),
      req,
      metadata: {
        viewerId: viewerId || null,
        visibility,
        isOwner
      }
    });

    return res.json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        realName: user.realName,
        city: user.city || null,
        state: user.state || null,
        country: user.country || null
      },
      canManage: isOwner,
      resumeUrl: buildResumeUrl(user.username),
      resume: toPublicResumePayload(resume)
    });
  } catch (error) {
    console.error('Error fetching public resume:', error);
    return res.status(500).json({ error: 'Failed to fetch resume' });
  }
});

// POST /api/public/users/:username/resume/link-click
router.post('/users/:username/resume/link-click', publicReadLimiter, async (req, res) => {
  try {
    const user = await findUserByIdOrUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const viewerId = getViewerIdFromAuthHeader(req);
    const blocked = await hasBlockRelationship(viewerId, user._id);
    if (blocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resume = await Resume.findOne({ userId: user._id })
      .select('visibility')
      .lean();
    if (!resume || resume.visibility !== 'public') {
      return res.status(404).json({ error: 'Resume not found' });
    }

    logResumeEvent({
      eventType: 'resume_profile_link_clicked',
      userId: String(user._id),
      req,
      metadata: {
        source: sanitizeSourceParam(req.body?.source),
        resumeUrl: buildResumeUrl(user.username)
      }
    });

    return res.status(202).json({ success: true });
  } catch (error) {
    console.error('Error logging resume profile link click:', error);
    return res.status(500).json({ error: 'Failed to record event' });
  }
});

// GET /api/public/users/:userId/feed?page=&limit=
router.get('/users/:userId/feed', publicReadLimiter, async (req, res) => {
  try {
    const user = await findUserByIdOrUsername(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const viewerId = getViewerIdFromAuthHeader(req);
    const [contentFilter, censorEnabled] = await Promise.all([
      getContentFilterConfig(),
      getViewerContentFilterPreference(viewerId)
    ]);
    const blocked = await hasBlockRelationship(viewerId, user._id);
    const isOwner = viewerId && String(viewerId) === String(user._id);
    const privateProfile = isPrivateProfile(user) && !isOwner;
    const relationshipContext = isOwner
      ? { isOwner: true, isFriend: true, isSecureFriend: true }
      : await getViewerFriendContext(viewerId, user._id);
    if (blocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    const pagination = parsePagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }
    const { page, limit, skip } = pagination;

    const resume = await Resume.findOne({ userId: user._id })
      .select('visibility basics.headline updatedAt')
      .lean();
    const resumeMeta = toDiscoverableResumeMeta(user, resume);

    if (privateProfile) {
      return res.json({
        success: true,
        user: {
          ...toPublicUserProfile(user, relationshipContext),
          hasPublicResume: false,
          restrictedContent: true
        },
        posts: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0
        }
      });
    }

    const candidatePosts = await Post.find({
      targetFeedId: user._id,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    })
      .sort({ createdAt: -1 })
      .select('_id authorId targetFeedId content visibility relationshipAudience visibleToCircles visibleToUsers excludeUsers locationRadius expiresAt mediaUrls likes comments createdAt updatedAt')
      .populate(publicPostPopulate);

    const visiblePosts = candidatePosts.filter((post) => post.canView(viewerId, {
      isFriend: relationshipContext.isFriend,
      isSecureFriend: relationshipContext.isSecureFriend
    }));
    const pagedPosts = visiblePosts.slice(skip, skip + limit);
    const total = visiblePosts.length;

    return res.json({
      success: true,
      user: {
        ...toPublicUserProfile(user, relationshipContext),
        ...(resumeMeta || { hasPublicResume: false })
      },
      posts: pagedPosts.map((post) => toPublicPost(post.toObject ? post.toObject() : post, {
        maturityWords: contentFilter.maturityCensoredWords,
        censorEnabled
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching public user feed:', error);
    return res.status(500).json({ error: 'Failed to fetch public feed' });
  }
});

// GET /api/public/users/:username/friends/circles
router.get('/users/:username/friends/circles', publicReadLimiter, async (req, res) => {
  try {
    const user = await findUserByIdOrUsername(req.params.username, `${publicUserProjection} circles`);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const viewerId = getViewerIdFromAuthHeader(req);
    const [contentFilter, censorEnabled] = await Promise.all([
      getContentFilterConfig(),
      getViewerContentFilterPreference(viewerId)
    ]);
    const blocked = await hasBlockRelationship(viewerId, user._id);
    const isOwner = viewerId && String(viewerId) === String(user._id);
    const privateProfile = isPrivateProfile(user) && !isOwner;
    if (blocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (privateProfile) {
      return res.json({
        success: true,
        restrictedContent: true,
        circles: [],
        mutualFriendCount: 0
      });
    }

    const circles = Array.isArray(user.circles) ? user.circles : [];
    const allMemberIds = [...new Set(circles.flatMap((circle) => (circle.members || []).map((member) => String(member))))];
    const [memberUsers, viewerFriendIds] = await Promise.all([
      allMemberIds.length > 0
        ? User.find({ _id: { $in: allMemberIds } }).select('_id username realName avatarUrl').lean()
        : [],
      getViewerFriendIds(viewerId)
    ]);
    const memberMap = new Map(memberUsers.map((member) => [String(member._id), member]));
    const mutualIds = new Set();

    const normalizedCircles = circles.map((circle) => {
      const members = (circle.members || [])
        .map((memberId) => memberMap.get(String(memberId)))
        .filter(Boolean)
        .map((member) => {
          const normalizedMemberId = String(member._id);
          const isMutual = viewerFriendIds.has(normalizedMemberId);
          if (isMutual) {
            mutualIds.add(normalizedMemberId);
          }
          return {
            _id: member._id,
            username: member.username,
            realName: member.realName,
            avatarUrl: member.avatarUrl || '',
            isMutual
          };
        });

      return {
        name: circle.name,
        color: circle.color || '#3B82F6',
        relationshipAudience: normalizeRelationshipAudience(circle.relationshipAudience),
        profileImageUrl: typeof circle.profileImageUrl === 'string' ? circle.profileImageUrl.trim() : '',
        memberCount: members.length,
        members
      };
    });

    return res.json({
      success: true,
      circles: normalizedCircles,
      mutualFriendCount: mutualIds.size
    });
  } catch (error) {
    console.error('Error fetching public circles:', error);
    return res.status(500).json({ error: 'Failed to fetch circles' });
  }
});

// GET /api/public/users/:userId/gallery?page=&limit=
router.get('/users/:userId/gallery', async (req, res) => {
  try {
    const user = await findUserByIdOrUsername(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const pagination = parsePagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }
    const { page, limit, skip } = pagination;
    const viewerId = getViewerIdFromAuthHeader(req);
    const blocked = await hasBlockRelationship(viewerId, user._id);
    const isOwner = viewerId && String(viewerId) === String(user._id);
    const privateProfile = isPrivateProfile(user) && !isOwner;
    if (blocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (privateProfile) {
      return res.json({
        success: true,
        user: {
          ...toPublicUserProfile(user),
          hasPublicResume: false,
          restrictedContent: true
        },
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0
        }
      });
    }

    const query = {
      ...publicPostQuery(user._id),
      mediaUrls: { $exists: true, $ne: [] }
    };

    const resumePromise = Resume.findOne({ userId: user._id })
      .select('visibility basics.headline updatedAt')
      .lean();

    const [posts, total, resume] = await Promise.all([
      Post.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id authorId targetFeedId content visibility relationshipAudience mediaUrls createdAt updatedAt')
        .populate(publicPostPopulate)
        .lean(),
      Post.countDocuments(query),
      resumePromise
    ]);
    const resumeMeta = toDiscoverableResumeMeta(user, resume);

    const items = posts.map((post) => {
      const normalizedMediaUrls = normalizeMediaUrls(post.mediaUrls);
      const contentCensored = censorMaturityText(post.content || null, contentFilter.maturityCensoredWords);
      const displayContent = censorEnabled ? contentCensored : (post.content || null);

      return {
        postId: post._id,
        author: post.authorId,
        targetFeed: post.targetFeedId,
        mediaUrls: normalizedMediaUrls,
        normalizedMediaUrls,
        mediaItems: normalizedMediaUrls.map((url, index) => ({
          id: `${String(post._id)}:${index}`,
          url,
          index,
          sourcePostId: post._id
        })),
        sourcePost: {
            _id: post._id,
            content: displayContent,
            contentCensored,
            visibility: post.visibility,
            relationshipAudience: normalizeRelationshipAudience(post.relationshipAudience),
            createdAt: post.createdAt,
            updatedAt: post.updatedAt,
          author: post.authorId,
          targetFeed: post.targetFeedId
        },
        content: displayContent,
        contentCensored,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt
      };
    });

    return res.json({
      success: true,
      user: {
        ...toPublicUserProfile(user),
        ...(resumeMeta || { hasPublicResume: false })
      },
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching public user gallery:', error);
    return res.status(500).json({ error: 'Failed to fetch public gallery' });
  }
});

module.exports = router;
