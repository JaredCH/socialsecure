const Friendship = require('../models/Friendship');

const RELATIONSHIP_AUDIENCE_VALUES = ['social', 'secure'];
const DEFAULT_RELATIONSHIP_AUDIENCE = 'social';

const normalizeRelationshipAudience = (value) => (
  value === 'secure' ? 'secure' : DEFAULT_RELATIONSHIP_AUDIENCE
);

const socialOrUnsetAudienceQuery = (fieldName = 'relationshipAudience') => ({
  $or: [
    { [fieldName]: DEFAULT_RELATIONSHIP_AUDIENCE },
    { [fieldName]: { $exists: false } },
    { [fieldName]: null }
  ]
});

const readAudienceValue = (friendship, side) => {
  // Prefer the current schema field first, then fall back to alternative key names
  // to safely read companion/legacy friendship documents without data migration.
  const candidates = side === 'requester'
    ? [
      friendship?.requesterRelationshipAudience,
      friendship?.requesterAudience,
      friendship?.requesterCategory
    ]
    : [
      friendship?.recipientRelationshipAudience,
      friendship?.recipientAudience,
      friendship?.recipientCategory
    ];

  for (const candidate of candidates) {
    if (candidate === 'social' || candidate === 'secure') {
      return candidate;
    }
  }

  return DEFAULT_RELATIONSHIP_AUDIENCE;
};

const ownerCategorizedViewerAsSecure = (friendship, ownerId, viewerId) => {
  const normalizedOwnerId = String(ownerId || '');
  const normalizedViewerId = String(viewerId || '');
  if (!normalizedOwnerId || !normalizedViewerId) return false;
  if (String(friendship?.status || '') !== 'accepted') return false;

  const requesterId = String(friendship?.requester || '');
  const recipientId = String(friendship?.recipient || '');

  if (requesterId === normalizedOwnerId && recipientId === normalizedViewerId) {
    return readAudienceValue(friendship, 'requester') === 'secure';
  }

  if (recipientId === normalizedOwnerId && requesterId === normalizedViewerId) {
    return readAudienceValue(friendship, 'recipient') === 'secure';
  }

  return false;
};

const getViewerRelationshipContext = async (viewerId) => {
  const normalizedViewerId = String(viewerId || '').trim();
  if (!normalizedViewerId) {
    return {
      friendIds: new Set(),
      secureAudienceOwnerIds: new Set()
    };
  }

  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [
      { requester: normalizedViewerId },
      { recipient: normalizedViewerId }
    ]
  }).select(
    'status requester recipient requesterRelationshipAudience recipientRelationshipAudience requesterAudience recipientAudience requesterCategory recipientCategory'
  ).lean();

  const friendIds = new Set();
  const secureAudienceOwnerIds = new Set();

  for (const friendship of friendships) {
    const requesterId = String(friendship.requester || '');
    const recipientId = String(friendship.recipient || '');
    const friendId = requesterId === normalizedViewerId ? recipientId : requesterId;
    if (!friendId) continue;

    friendIds.add(friendId);
    if (ownerCategorizedViewerAsSecure(friendship, friendId, normalizedViewerId)) {
      secureAudienceOwnerIds.add(friendId);
    }
  }

  return {
    friendIds,
    secureAudienceOwnerIds
  };
};

const isViewerSecureFriendOfOwner = async (viewerId, ownerId) => {
  const normalizedViewerId = String(viewerId || '').trim();
  const normalizedOwnerId = String(ownerId || '').trim();
  if (!normalizedViewerId || !normalizedOwnerId) return false;

  const friendship = await Friendship.findOne({
    status: 'accepted',
    $or: [
      { requester: normalizedViewerId, recipient: normalizedOwnerId },
      { requester: normalizedOwnerId, recipient: normalizedViewerId }
    ]
  }).select(
    'status requester recipient requesterRelationshipAudience recipientRelationshipAudience requesterAudience recipientAudience requesterCategory recipientCategory'
  ).lean();

  if (!friendship) return false;
  return ownerCategorizedViewerAsSecure(friendship, normalizedOwnerId, normalizedViewerId);
};

const logRelationshipAudienceEvent = ({ eventType, viewerId = null, ownerId = null, req = null, metadata = {} }) => {
  if (!eventType) return;
  const payload = {
    eventType,
    viewerId: viewerId ? String(viewerId) : null,
    ownerId: ownerId ? String(ownerId) : null,
    metadata,
    ipAddress: req?.ip || null,
    userAgent: req?.get ? (req.get('user-agent') || null) : null,
    createdAt: new Date().toISOString()
  };
  console.log('[relationship-audience-event]', JSON.stringify(payload));
};

module.exports = {
  RELATIONSHIP_AUDIENCE_VALUES,
  DEFAULT_RELATIONSHIP_AUDIENCE,
  normalizeRelationshipAudience,
  socialOrUnsetAudienceQuery,
  ownerCategorizedViewerAsSecure,
  getViewerRelationshipContext,
  isViewerSecureFriendOfOwner,
  logRelationshipAudienceEvent
};
