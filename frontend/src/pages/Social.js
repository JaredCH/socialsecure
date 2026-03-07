import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI, circlesAPI, discoveryAPI, feedAPI, friendsAPI, galleryAPI, moderationAPI, resumeAPI, socialPageAPI } from '../utils/api';
import PrivacySelector from '../components/PrivacySelector';
import CircleManager from '../components/CircleManager';
import ReportModal from '../components/ReportModal';
import BlockButton from '../components/BlockButton';
import TypingIndicator from '../components/TypingIndicator';
import SocialEditablePanel from '../components/social/SocialEditablePanel';
import SocialDesignStudioModal from '../components/social/SocialDesignStudioModal';
import SocialArchitectureBlueprint from '../components/social/SocialArchitectureBlueprint';
import {
  getFontSizeClass,
  getPanelsByArea,
  mergeDesignPatch,
  normalizeSocialPreferences as normalizePageDesign,
  SOCIAL_DESIGN_TEMPLATES,
  SOCIAL_LAYOUT_PRESETS,
  SOCIAL_PANEL_LABELS
} from '../utils/socialPagePreferences';
import {
  emitTypingStart,
  emitTypingStop,
  getRealtimeSocket,
  onFeedInteraction,
  onFeedPost,
  onTyping,
  subscribeToPost,
  unsubscribeFromPost
} from '../utils/realtime';

const MEDIA_URL_MAX_ITEMS = 8;
const MEDIA_URL_MAX_LENGTH = 2048;
const COMPOSER_CONTENT_TYPES = ['standard', 'poll', 'quiz', 'countdown'];
const INTERACTION_MAX_OPTIONS = 6;
const GALLERY_MAX_ITEMS = 24;
const GALLERY_MAX_IMAGE_SIZE_BYTES = 3 * 1024 * 1024;
const FEED_POLL_INTERVAL_MS = 30000;
const TYPING_TIMEOUT_MS = 900;
const REMOTE_TYPING_TTL_MS = 3000;
const PANEL_WIDTH_UNITS_BY_SIZE = {
  halfCol: 1,
  oneCol: 2,
  twoCols: 4,
  threeCols: 6,
  fourCols: 8
};
const PANEL_HEIGHT_UNITS_BY_SIZE = {
  halfRow: 1,
  fullRow: 2,
  twoRows: 4,
  threeRows: 6,
  fourRows: 8
};

const PRIVACY_BADGE_LABELS = {
  public: 'Public',
  friends: 'Friends',
  circles: 'Circles',
  specific_users: 'Specific Users',
  private: 'Private'
};
const RELATIONSHIP_AUDIENCE_LABELS = {
  social: 'Social',
  secure: 'Secure'
};

const SOCIAL_MODULE_IDS = ['marketplaceShortcut', 'calendarShortcut', 'settingsShortcut', 'referShortcut', 'chatPanel', 'communityNotes'];
const THEME_ACCENT_TO_HEADER_CLASS = {
  blue: 'from-blue-700 via-indigo-700 to-violet-700',
  violet: 'from-violet-700 via-fuchsia-700 to-purple-700',
  emerald: 'from-emerald-700 via-teal-700 to-cyan-700',
  rose: 'from-rose-700 via-pink-700 to-orange-600',
  amber: 'from-amber-700 via-orange-700 to-red-700'
};
const THEME_TO_PAGE_CLASS = {
  default: 'bg-slate-50 text-gray-900',
  light: 'bg-white text-gray-900',
  dark: 'bg-slate-900 text-slate-100',
  sunset: 'bg-orange-50 text-gray-900',
  forest: 'bg-emerald-50 text-gray-900'
};

const normalizeSocialPreferences = (input, profileTheme = 'default') => normalizePageDesign(input, profileTheme);

const isRenderableMediaUrl = (value) => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MEDIA_URL_MAX_LENGTH) return false;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const normalizeMediaUrls = (mediaUrls) => {
  if (!Array.isArray(mediaUrls)) return [];

  const seen = new Set();
  const normalized = [];

  for (const rawUrl of mediaUrls) {
    if (typeof rawUrl !== 'string') continue;
    const trimmed = rawUrl.trim();
    if (!isRenderableMediaUrl(trimmed)) continue;

    const dedupeKey = trimmed.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    normalized.push(trimmed);
    if (normalized.length >= MEDIA_URL_MAX_ITEMS) break;
  }

  return normalized;
};

const renderMediaItem = (url, key) => {
  const safeKey = `${key}-${url}`;

  return (
    <a
      key={safeKey}
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block rounded overflow-hidden border bg-gray-50"
    >
      <img
        src={url}
        alt="Post media"
        loading="lazy"
        className="w-full h-56 object-cover"
        onError={(event) => {
          event.currentTarget.style.display = 'none';
          const fallback = event.currentTarget.nextElementSibling;
          if (fallback) fallback.style.display = 'block';
        }}
      />
      <span
        className="hidden text-blue-600 text-sm break-all hover:underline p-3"
      >
        {url}
      </span>
    </a>
  );
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

const getInteractionStatus = (interaction) => {
  if (!interaction?.type) return null;
  if (interaction.status === 'closed') return 'closed';

  const now = Date.now();
  if (interaction.expiresAt && new Date(interaction.expiresAt).getTime() <= now) {
    return 'expired';
  }
  if (
    interaction.type === 'countdown'
    && interaction.countdown?.targetAt
    && new Date(interaction.countdown.targetAt).getTime() <= now
  ) {
    return 'expired';
  }
  return interaction.status || 'active';
};

const formatRemainingTime = (targetAt, nowMs) => {
  const target = new Date(targetAt).getTime();
  if (!Number.isFinite(target)) return 'Unknown';
  const diffMs = Math.max(0, target - nowMs);
  if (diffMs === 0) return 'Expired';

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
};

const normalizePost = (post) => {
  const normalizedLikes = Array.isArray(post.likes)
    ? post.likes.map((like) => (typeof like === 'string' ? like : String(like?._id || like)))
    : [];

  const normalizedComments = Array.isArray(post.comments)
    ? post.comments.map((comment) => ({
      ...comment,
      userId:
        typeof comment.userId === 'string'
          ? comment.userId
          : String(comment.userId?._id || comment.userId || ''),
      username:
        typeof comment.userId === 'object' && comment.userId?.username
          ? comment.userId.username
          : comment.username || null,
    }))
    : [];

  return {
    ...post,
    likes: normalizedLikes,
    comments: normalizedComments,
    likesCount:
      typeof post.likesCount === 'number'
        ? post.likesCount
        : normalizedLikes.length,
    commentsCount:
      typeof post.commentsCount === 'number'
        ? post.commentsCount
        : normalizedComments.length,
    relationshipAudience: post.relationshipAudience === 'secure' ? 'secure' : 'social',
    mediaUrls: normalizeMediaUrls(post.mediaUrls),
    interaction: post.interaction
      ? {
        ...post.interaction,
        status: getInteractionStatus(post.interaction),
      }
      : null,
  };
};

const normalizeGalleryItem = (item) => ({
  ...item,
  likesCount: typeof item?.likesCount === 'number' ? item.likesCount : 0,
  dislikesCount: typeof item?.dislikesCount === 'number' ? item.dislikesCount : 0,
  viewerReaction: item?.viewerReaction || null,
  caption: item?.caption || '',
  mediaType: item?.mediaType || 'url',
  relationshipAudience: item?.relationshipAudience === 'secure' ? 'secure' : 'social',
});

const Social = () => {
  const initialGuestUser = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('user') || '';
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(localStorage.getItem('token')));
  const [currentUser, setCurrentUser] = useState(null);
  const [isGuestPreview, setIsGuestPreview] = useState(false);
  const [guestUser, setGuestUser] = useState(initialGuestUser);
  const [guestProfile, setGuestProfile] = useState(null);
  const [ownerResumeMeta, setOwnerResumeMeta] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [submittingPost, setSubmittingPost] = useState(false);
  const [postForm, setPostForm] = useState({
    content: '',
    mediaUrlInput: '',
    mediaUrls: [],
    visibility: 'public',
    relationshipAudience: 'social',
    visibleToCircles: [],
    visibleToUsers: [],
    excludeUsers: [],
    locationRadius: '',
    expirationPreset: 'none',
    contentType: 'standard',
    interaction: {
      poll: {
        question: '',
        options: ['', ''],
        allowMultiple: false,
        expiresAt: '',
      },
      quiz: {
        question: '',
        options: ['', ''],
        correctOptionIndex: 0,
        explanation: '',
        expiresAt: '',
      },
      countdown: {
        label: '',
        targetAt: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        linkUrl: '',
      },
    },
  });
  const [nowMs, setNowMs] = useState(Date.now());
  const [circles, setCircles] = useState([]);
  const [friends, setFriends] = useState([]);
  const [topFriends, setTopFriends] = useState([]);
  const [commentInputs, setCommentInputs] = useState({});
  const [typingByPost, setTypingByPost] = useState({});
  const [actionLoadingByPost, setActionLoadingByPost] = useState({});
  const [galleryItems, setGalleryItems] = useState([]);
  const [galleryTargetInput, setGalleryTargetInput] = useState(initialGuestUser);
  const [galleryTarget, setGalleryTarget] = useState(initialGuestUser.trim());
  const [galleryUrlInput, setGalleryUrlInput] = useState('');
  const [galleryCaptionInput, setGalleryCaptionInput] = useState('');
  const [galleryRelationshipAudience, setGalleryRelationshipAudience] = useState('social');
  const [galleryError, setGalleryError] = useState('');
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryActionLoadingByImage, setGalleryActionLoadingByImage] = useState({});
  const [galleryEditById, setGalleryEditById] = useState({});
  const [blockedUserIds, setBlockedUserIds] = useState([]);
  const [mutedUserIds, setMutedUserIds] = useState([]);
  const [myReports, setMyReports] = useState([]);
  const [reportModalState, setReportModalState] = useState({
    isOpen: false,
    targetType: 'post',
    targetId: null,
    targetUserId: null
  });
  const [commentTypingByPostId, setCommentTypingByPostId] = useState({});
  const [designStudioOpen, setDesignStudioOpen] = useState(false);
  const [inlineEditingPanelId, setInlineEditingPanelId] = useState('');
  const [draftSocialPreferences, setDraftSocialPreferences] = useState(null);
  const [socialConfigs, setSocialConfigs] = useState([]);
  const [favoriteDesigns, setFavoriteDesigns] = useState([]);
  const [sharedDesigns, setSharedDesigns] = useState([]);
  const [socialTemplates, setSocialTemplates] = useState(SOCIAL_DESIGN_TEMPLATES);
  const [layoutPresets, setLayoutPresets] = useState(SOCIAL_LAYOUT_PRESETS);
  const [designBusy, setDesignBusy] = useState(false);
  const [designError, setDesignError] = useState('');
  const [designSuccessMessage, setDesignSuccessMessage] = useState('');
  const [hasUnsavedDesignChanges, setHasUnsavedDesignChanges] = useState(false);
  const [activeDesignConfigId, setActiveDesignConfigId] = useState(null);
  const [viewportLayoutMode, setViewportLayoutMode] = useState(() => (window.innerWidth < 1024 ? 'mobile' : 'desktop'));
  const [editorLayoutMode, setEditorLayoutMode] = useState(() => (window.innerWidth < 1024 ? 'mobile' : 'desktop'));
  const localTypingTimeoutsRef = useRef({});
  const remoteTypingTimeoutsRef = useRef({});
  const designDirtyRef = useRef(false);

  const realtimeEnabled = currentUser?.realtimePreferences?.enabled !== false;

  const requestedProfileIdentifier = guestUser.trim();
  const normalizedRequestedProfileIdentifier = requestedProfileIdentifier.toLowerCase();
  const normalizedCurrentUserId = String(currentUser?._id || '').trim().toLowerCase();
  const normalizedCurrentUsername = String(currentUser?.username || '').trim().toLowerCase();
  const isViewingAnotherProfile = Boolean(
    isAuthenticated
      && normalizedRequestedProfileIdentifier
      && normalizedRequestedProfileIdentifier !== normalizedCurrentUserId
      && normalizedRequestedProfileIdentifier !== normalizedCurrentUsername
  );
  const isOwnSocialContext = isAuthenticated && !isViewingAnotherProfile;
  const activeProfile = isAuthenticated && !isViewingAnotherProfile
    ? currentUser
    : guestProfile;
  const activeLayoutMode = designStudioOpen ? editorLayoutMode : viewportLayoutMode;
  const socialPreferences = useMemo(
    () => normalizeSocialPreferences(
      draftSocialPreferences || activeProfile?.socialPagePreferences,
      activeProfile?.profileTheme,
      activeLayoutMode
    ),
    [draftSocialPreferences, activeProfile?.socialPagePreferences, activeProfile?.profileTheme, activeLayoutMode]
  );
  const panelsByArea = useMemo(() => getPanelsByArea(socialPreferences), [socialPreferences]);
  const activePanelCount = useMemo(
    () => Object.values(panelsByArea).reduce((total, panels) => total + (Array.isArray(panels) ? panels.length : 0), 0),
    [panelsByArea]
  );
  const isSectionVisible = useCallback(
    (sectionId) => socialPreferences.effective?.panels?.[sectionId]?.visible !== false,
    [socialPreferences]
  );
  const isModuleVisible = useCallback(
    (moduleId) => !socialPreferences.hiddenModules.includes(moduleId),
    [socialPreferences.hiddenModules]
  );
  const headerGradientClass = THEME_ACCENT_TO_HEADER_CLASS[socialPreferences.accentColorToken] || THEME_ACCENT_TO_HEADER_CLASS.blue;
  const pageThemeClass = THEME_TO_PAGE_CLASS[socialPreferences.themePreset] || THEME_TO_PAGE_CLASS.default;

  const galleryOwnerIdentifier = useMemo(() => {
    // Profile context (/social?user=...) uses target user gallery
    if (isViewingAnotherProfile) {
      if (guestProfile?._id) {
        return String(guestProfile._id);
      }
      return requestedProfileIdentifier;
    }

    // Authenticated users on own /social always see only their own gallery
    if (isAuthenticated && currentUser?._id) {
      return String(currentUser._id);
    }

    // Guest mode: browse by explicit galleryTarget input
    if (galleryTarget) {
      return galleryTarget;
    }

    if (guestProfile?._id) {
      return String(guestProfile._id);
    }

    return requestedProfileIdentifier;
  }, [
    isViewingAnotherProfile,
    guestProfile?._id,
    requestedProfileIdentifier,
    isAuthenticated,
    currentUser?._id,
    galleryTarget
  ]);

  const viewerCanReact = isAuthenticated && !isGuestPreview && Boolean(currentUser?._id);
  const normalizedGalleryOwnerIdentifier = String(galleryOwnerIdentifier || '').trim().toLowerCase();

  const canManageGallery =
    viewerCanReact
    && !isGuestPreview
    && Boolean(galleryOwnerIdentifier)
    && (
      normalizedGalleryOwnerIdentifier === normalizedCurrentUserId
      || normalizedGalleryOwnerIdentifier === normalizedCurrentUsername
    );
  const topFriendIdSet = useMemo(
    () => new Set(topFriends.map((friend) => String(friend._id))),
    [topFriends]
  );

  const trackSocialEvent = useCallback((eventType, metadata = {}) => {
    if (!isAuthenticated) return;
    discoveryAPI.trackEvent(eventType, metadata).catch(() => {});
  }, [isAuthenticated]);

  const handleSectionClick = useCallback((sectionId) => {
    trackSocialEvent('social_profile_section_clicked', { sectionId });
  }, [trackSocialEvent]);

  const handleGuestPreviewToggle = (enabled) => {
    setIsGuestPreview(enabled);
    trackSocialEvent('social_guest_preview_toggled', { enabled });
  };

  const setGalleryActionLoading = (imageId, value) => {
    setGalleryActionLoadingByImage((prev) => {
      if (!value) {
        const next = { ...prev };
        delete next[imageId];
        return next;
      }
      return { ...prev, [imageId]: true };
    });
  };

  const loadGallery = useCallback(async () => {
    if (!galleryOwnerIdentifier) {
      setGalleryItems([]);
      setGalleryError('');
      return;
    }

    setGalleryLoading(true);
    setGalleryError('');
    try {
      const response = await galleryAPI.getGallery(galleryOwnerIdentifier, 1, GALLERY_MAX_ITEMS);
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      setGalleryItems(items.map(normalizeGalleryItem));
    } catch (error) {
      setGalleryItems([]);
      setGalleryError(error.response?.data?.error || 'Failed to load gallery.');
    } finally {
      setGalleryLoading(false);
    }
  }, [galleryOwnerIdentifier]);

  const setPostActionLoading = (postId, value) => {
    setActionLoadingByPost((prev) => {
      if (!value) {
        const next = { ...prev };
        delete next[postId];
        return next;
      }
      return { ...prev, [postId]: true };
    });
  };

  const hydrateInteractionsForPosts = useCallback(async (normalizedPosts) => {
    const interactivePosts = normalizedPosts.filter((post) => post.interaction?.type);
    if (interactivePosts.length === 0) {
      return normalizedPosts;
    }

    const interactionResults = await Promise.all(
      interactivePosts.map(async (post) => {
        try {
          const response = await feedAPI.getInteraction(post._id);
          return { postId: post._id, interaction: response.data?.interaction || null };
        } catch {
          return { postId: post._id, interaction: post.interaction };
        }
      })
    );

    const byPostId = new Map(interactionResults.map((entry) => [entry.postId, entry.interaction]));
    return normalizedPosts.map((post) => (
      byPostId.has(post._id)
        ? { ...post, interaction: byPostId.get(post._id) }
        : post
    ));
  }, []);

  const fetchTimelineWithRetry = useCallback(async () => {
    try {
      return await feedAPI.getTimeline();
    } catch (firstError) {
      const statusCode = Number(firstError?.response?.status || 0);
      const shouldRetry = !statusCode || statusCode >= 500;
      if (!shouldRetry) {
        throw firstError;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 500));
      return feedAPI.getTimeline();
    }
  }, []);

  const loadAuthenticatedFeed = useCallback(async () => {
    const [profileResponse, resumeMetaResponse] = await Promise.all([
      authAPI.getProfile(),
      resumeAPI.getMyResume().catch(() => null)
    ]);
    const user = profileResponse.data?.user;
    setCurrentUser(user || null);
    setOwnerResumeMeta(resumeMetaResponse?.data?.resume || null);

    const [circlesResponse, friendsResponse] = await Promise.all([
      circlesAPI.getCircles().catch(() => ({ data: { circles: [] } })),
      friendsAPI.getFriends().catch(() => ({ data: { friends: [] } }))
    ]);
    setCircles(Array.isArray(circlesResponse.data?.circles) ? circlesResponse.data.circles : []);
    const nextFriends = Array.isArray(friendsResponse.data?.friends) ? friendsResponse.data.friends : [];
    setFriends(nextFriends);

    const topFriendsResponse = await friendsAPI
      .getTopFriends(user?.username || user?._id)
      .catch(() => ({ data: { topFriends: [] } }));
    setTopFriends(Array.isArray(topFriendsResponse.data?.topFriends) ? topFriendsResponse.data.topFriends : []);

    const [blocksResponse, mutesResponse, reportsResponse] = await Promise.all([
      moderationAPI.getBlocks().catch(() => ({ data: { blockedUsers: [] } })),
      moderationAPI.getMutes().catch(() => ({ data: { mutedUsers: [] } })),
      moderationAPI.getMyReports().catch(() => ({ data: { reports: [] } }))
    ]);

    setBlockedUserIds((blocksResponse.data?.blockedUsers || []).map((entry) => String(entry._id)));
    setMutedUserIds((mutesResponse.data?.mutedUsers || []).map((entry) => String(entry._id)));
    setMyReports(Array.isArray(reportsResponse.data?.reports) ? reportsResponse.data.reports : []);

    const timelineResponse = await fetchTimelineWithRetry();
    const timelinePosts = Array.isArray(timelineResponse.data?.posts)
      ? timelineResponse.data.posts
      : [];
    const normalizedPosts = timelinePosts.map(normalizePost);
    const hydratedPosts = await hydrateInteractionsForPosts(normalizedPosts);
    setPosts(hydratedPosts);
    setGuestProfile(null);
  }, [fetchTimelineWithRetry, hydrateInteractionsForPosts]);

  const loadGuestFeed = useCallback(async () => {
    if (!guestUser.trim()) {
      setPosts([]);
      setGuestProfile(null);
      setOwnerResumeMeta(null);
      setFeedError('Enter a username or user ID in Guest mode to view a public feed.');
      return;
    }

    const response = await feedAPI.getPublicUserFeed(guestUser.trim());
    const publicPosts = Array.isArray(response.data?.posts) ? response.data.posts : [];
    setPosts(publicPosts.map(normalizePost));
    setGuestProfile(response.data?.user || null);
    setOwnerResumeMeta(null);
  }, [guestUser]);

  const visibleResumeInfo = useMemo(() => {
    if (isOwnSocialContext && currentUser?.username && ownerResumeMeta?.hasResume) {
      return {
        username: currentUser.username,
        resumeUrl: ownerResumeMeta.resumeUrl || `/resume/${encodeURIComponent(currentUser.username)}`,
        resumeHeadline: ownerResumeMeta.resumeHeadline || null,
        canManage: true
      };
    }

    if (guestProfile?.hasPublicResume && guestProfile?.username && guestProfile?.resumeUrl) {
      return {
        username: guestProfile.username,
        resumeUrl: guestProfile.resumeUrl,
        resumeHeadline: guestProfile.resumeHeadline || null,
        canManage: false
      };
    }

    return null;
  }, [isOwnSocialContext, currentUser?.username, ownerResumeMeta, guestProfile]);

  const handleResumeProfileLinkClick = useCallback((resumeUsername) => {
    if (!resumeUsername) return;
    resumeAPI.trackProfileLinkClick(resumeUsername, 'social_page').catch(() => {});
  }, []);

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    setFeedError('');

    const token = localStorage.getItem('token');
    if (!token) {
      setIsAuthenticated(false);
      try {
        await loadGuestFeed();
      } catch (error) {
        setFeedError(error.response?.data?.error || 'Failed to load public feed.');
      } finally {
        setLoadingFeed(false);
      }
      return;
    }

    setIsAuthenticated(true);
    try {
      if (isViewingAnotherProfile) {
        await loadGuestFeed();
      } else {
        await loadAuthenticatedFeed();
      }
    } catch (error) {
      setFeedError(error.response?.data?.error || (isViewingAnotherProfile
        ? 'Failed to load public feed.'
        : 'Failed to load timeline.'));
      setPosts([]);
    } finally {
      setLoadingFeed(false);
    }
  }, [loadAuthenticatedFeed, loadGuestFeed, isViewingAnotherProfile]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  useEffect(() => {
    if (!isAuthenticated || !galleryOwnerIdentifier) {
      setTopFriends([]);
      return;
    }

    friendsAPI.getTopFriends(galleryOwnerIdentifier)
      .then((response) => {
        setTopFriends(Array.isArray(response.data?.topFriends) ? response.data.topFriends : []);
      })
      .catch(() => {
        setTopFriends([]);
      });
  }, [isAuthenticated, galleryOwnerIdentifier]);

  useEffect(() => {
    if (!isAuthenticated || !galleryOwnerIdentifier) return;
    trackSocialEvent('social_gallery_opened', { profile: galleryOwnerIdentifier });
  }, [isAuthenticated, galleryOwnerIdentifier, trackSocialEvent]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser?._id || realtimeEnabled) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      loadAuthenticatedFeed().catch(() => {
        // keep polling fallback resilient
      });
    }, FEED_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isAuthenticated, currentUser?._id, realtimeEnabled, loadAuthenticatedFeed]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser?._id || !realtimeEnabled) {
      return undefined;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      return undefined;
    }

    const socket = getRealtimeSocket({ token, userId: currentUser._id });
    const subscribedPostIds = posts.map((post) => String(post._id || '')).filter(Boolean);
    subscribedPostIds.forEach((postId) => subscribeToPost(postId));

    const offFeedPost = onFeedPost((payload) => {
      const incomingPost = payload?.post ? normalizePost(payload.post) : null;
      if (!incomingPost?._id) return;

      setPosts((prev) => {
        const existingIndex = prev.findIndex((item) => String(item._id) === String(incomingPost._id));
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = { ...next[existingIndex], ...incomingPost };
          return next;
        }
        return [incomingPost, ...prev];
      });

      subscribeToPost(incomingPost._id);
    });

    const offFeedInteraction = onFeedInteraction((payload) => {
      const postId = String(payload?.postId || '').trim();
      if (!postId) return;

      setPosts((prev) => prev.map((item) => {
        if (String(item._id) !== postId) return item;

        const next = {
          ...item,
          likesCount: typeof payload?.likesCount === 'number' ? payload.likesCount : item.likesCount,
          commentsCount: typeof payload?.commentsCount === 'number' ? payload.commentsCount : item.commentsCount
        };

        if (payload?.type === 'comment' && payload?.comment?._id) {
          const alreadyExists = next.comments.some((comment) => String(comment._id) === String(payload.comment._id));
          if (!alreadyExists) {
            next.comments = [...next.comments, payload.comment];
          }
        }

        return next;
      }));
    });

    const offTyping = onTyping((payload) => {
      if (payload?.scope !== 'comment' || !payload?.targetId || !payload?.userId) return;

      const postId = String(payload.targetId);
      const userId = String(payload.userId);
      const timeoutKey = `${postId}:${userId}`;

      if (payload.status === 'stop') {
        const existingTimeout = remoteTypingTimeoutsRef.current[timeoutKey];
        if (existingTimeout) {
          window.clearTimeout(existingTimeout);
          delete remoteTypingTimeoutsRef.current[timeoutKey];
        }

        setCommentTypingByPostId((prev) => {
          const next = { ...prev };
          const postTyping = { ...(next[postId] || {}) };
          delete postTyping[userId];
          if (Object.keys(postTyping).length === 0) {
            delete next[postId];
          } else {
            next[postId] = postTyping;
          }
          return next;
        });
        return;
      }

      setCommentTypingByPostId((prev) => ({
        ...prev,
        [postId]: {
          ...(prev[postId] || {}),
          [userId]: payload.label || 'Someone'
        }
      }));

      const existingTimeout = remoteTypingTimeoutsRef.current[timeoutKey];
      if (existingTimeout) {
        window.clearTimeout(existingTimeout);
      }

      remoteTypingTimeoutsRef.current[timeoutKey] = window.setTimeout(() => {
        setCommentTypingByPostId((prev) => {
          const next = { ...prev };
          const postTyping = { ...(next[postId] || {}) };
          delete postTyping[userId];
          if (Object.keys(postTyping).length === 0) {
            delete next[postId];
          } else {
            next[postId] = postTyping;
          }
          return next;
        });
        delete remoteTypingTimeoutsRef.current[timeoutKey];
      }, REMOTE_TYPING_TTL_MS);
    });

    return () => {
      subscribedPostIds.forEach((postId) => unsubscribeFromPost(postId));
      offFeedPost();
      offFeedInteraction();
      offTyping();
      void socket;
    };
  }, [isAuthenticated, currentUser?._id, realtimeEnabled, posts]);

  useEffect(() => () => {
    Object.values(localTypingTimeoutsRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId));
    Object.values(remoteTypingTimeoutsRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setViewportLayoutMode(window.innerWidth < 1024 ? 'mobile' : 'desktop');
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!designStudioOpen) {
      setEditorLayoutMode(viewportLayoutMode);
    }
  }, [designStudioOpen, viewportLayoutMode]);

  const loadDesignData = useCallback(async () => {
    if (!isOwnSocialContext) {
      setSocialConfigs([]);
      setFavoriteDesigns([]);
      return;
    }

    try {
      const response = await socialPageAPI.getConfigs();
      setSocialConfigs(Array.isArray(response.data?.configs) ? response.data.configs : []);
      setFavoriteDesigns(Array.isArray(response.data?.favorites) ? response.data.favorites : []);
      setSocialTemplates(Array.isArray(response.data?.templates) && response.data.templates.length > 0
        ? response.data.templates
        : SOCIAL_DESIGN_TEMPLATES);
      setLayoutPresets(SOCIAL_LAYOUT_PRESETS);
      setActiveDesignConfigId(response.data?.activeConfigId || null);
      setHasUnsavedDesignChanges(false);
      designDirtyRef.current = false;
      if (response.data?.currentPreferences) {
        setCurrentUser((prev) => (prev ? {
          ...prev,
          socialPagePreferences: response.data.currentPreferences
        } : prev));
      }
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to load social page designs.');
    }
  }, [isOwnSocialContext]);

  const loadSharedDesigns = useCallback(async () => {
    if (!requestedProfileIdentifier || isOwnSocialContext) {
      setSharedDesigns([]);
      return;
    }

    try {
      const response = await socialPageAPI.getSharedByUser(requestedProfileIdentifier);
      const configs = Array.isArray(response.data?.configs) ? response.data.configs : [];
      const activeSharedConfigId = response.data?.activeConfigId ? String(response.data.activeConfigId) : '';
      const ordered = [...configs].sort((left, right) => {
        if (String(left._id) === activeSharedConfigId) return -1;
        if (String(right._id) === activeSharedConfigId) return 1;
        return 0;
      });
      setSharedDesigns(ordered);
    } catch {
      setSharedDesigns([]);
    }
  }, [requestedProfileIdentifier, isOwnSocialContext]);

  useEffect(() => {
    loadDesignData();
  }, [loadDesignData]);

  useEffect(() => {
    loadSharedDesigns();
  }, [loadSharedDesigns]);

  const patchDraftPreferences = useCallback((updater) => {
    setDesignError('');
    setDesignSuccessMessage('');
    setDraftSocialPreferences((prev) => {
      const base = prev || socialPreferences;
      const nextValue = typeof updater === 'function' ? updater(base) : updater;
      return normalizeSocialPreferences(
        nextValue,
        currentUser?.profileTheme || activeProfile?.profileTheme || 'default',
        activeLayoutMode
      );
    });
    designDirtyRef.current = true;
    setHasUnsavedDesignChanges(true);
  }, [socialPreferences, currentUser?.profileTheme, activeProfile?.profileTheme, activeLayoutMode]);

  const saveDraftPreferences = useCallback(async () => {
    if (!isOwnSocialContext || !draftSocialPreferences || !designDirtyRef.current) return;
    setDesignBusy(true);
    setDesignError('');
    try {
      const response = await socialPageAPI.savePreferences(draftSocialPreferences, true);
      const savedPreferences = normalizeSocialPreferences(
        response.data?.preferences || draftSocialPreferences,
        currentUser?.profileTheme || activeProfile?.profileTheme || 'default',
        activeLayoutMode
      );
      setCurrentUser((prev) => (prev ? { ...prev, socialPagePreferences: savedPreferences } : prev));
      setDraftSocialPreferences(savedPreferences);
      setActiveDesignConfigId(savedPreferences.activeConfigId || null);
      setDesignSuccessMessage('Layout saved');
      designDirtyRef.current = false;
      setHasUnsavedDesignChanges(false);
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to save social page customization.');
    } finally {
      setDesignBusy(false);
    }
  }, [
    isOwnSocialContext,
    draftSocialPreferences,
    currentUser?.profileTheme,
    activeProfile?.profileTheme,
    activeLayoutMode
  ]);

  const cancelDraftPreferences = useCallback(() => {
    const restored = normalizeSocialPreferences(
      activeProfile?.socialPagePreferences,
      activeProfile?.profileTheme || 'default',
      activeLayoutMode
    );
    setDraftSocialPreferences(restored);
    setDesignError('');
    setDesignSuccessMessage('Draft changes discarded');
    designDirtyRef.current = false;
    setHasUnsavedDesignChanges(false);
  }, [activeProfile?.socialPagePreferences, activeProfile?.profileTheme, activeLayoutMode]);

  const updateGlobalStyles = useCallback((patch) => {
    patchDraftPreferences((prev) => mergeDesignPatch(prev, { globalStyles: patch }));
  }, [patchDraftPreferences]);

  const updatePanelPreferences = useCallback((panelId, patch, mode = activeLayoutMode) => {
    const scopedPatch = {
      layouts: {
        activeMode: mode,
        [mode]: {
          panels: {
            [panelId]: patch
          }
        }
      }
    };
    if (mode === 'desktop') {
      scopedPatch.panels = { [panelId]: patch };
    }
    patchDraftPreferences((prev) => mergeDesignPatch(prev, {
      ...scopedPatch
    }));
  }, [patchDraftPreferences, activeLayoutMode]);

  const buildPanelOverridePatch = useCallback((enabled) => (
    enabled ? { useCustomStyles: true } : { useCustomStyles: false, styles: {} }
  ), []);

  const movePanel = useCallback((panelId, direction, mode = activeLayoutMode) => {
    patchDraftPreferences((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const panelCollection = mode === 'desktop'
        ? (next.layouts?.desktop?.panels || next.panels || {})
        : (next.layouts?.mobile?.panels || {});
      const panel = panelCollection?.[panelId];
      if (!panel) return next;
      const siblings = Object.entries(panelCollection)
        .filter(([, value]) => value.area === panel.area)
        .sort((left, right) => (left[1].order || 0) - (right[1].order || 0));
      const index = siblings.findIndex(([id]) => id === panelId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return next;
      const [currentId] = siblings[index];
      const [targetId] = siblings[targetIndex];
      const currentOrder = panelCollection[currentId].order;
      panelCollection[currentId].order = panelCollection[targetId].order;
      panelCollection[targetId].order = currentOrder;
      if (mode === 'desktop') {
        next.panels = {
          ...(next.panels || {}),
          [currentId]: panelCollection[currentId],
          [targetId]: panelCollection[targetId]
        };
      }
      next.layouts = {
        ...(next.layouts || {}),
        activeMode: mode,
        [mode]: {
          ...((next.layouts && next.layouts[mode]) || {}),
          panels: panelCollection
        }
      };
      return next;
    });
  }, [patchDraftPreferences, activeLayoutMode]);

  const applyTemplate = useCallback((template) => {
    if (!template?.design) return;
    patchDraftPreferences((prev) => mergeDesignPatch(prev, template.design));
  }, [patchDraftPreferences]);

  const applyLayoutPreset = useCallback((preset, mode = activeLayoutMode) => {
    if (!preset?.panels) return;
    patchDraftPreferences((prev) => mergeDesignPatch(prev, {
      ...(mode === 'desktop' ? { panels: preset.panels } : {}),
      layouts: {
        activeMode: mode,
        [mode]: { panels: preset.panels }
      }
    }));
  }, [patchDraftPreferences, activeLayoutMode]);

  const saveNewConfig = useCallback(async (name) => {
    setDesignBusy(true);
    setDesignError('');
    try {
      const response = await socialPageAPI.createConfig({
        name,
        design: draftSocialPreferences || socialPreferences,
        apply: false
      });
      const created = response.data?.config;
      if (created) {
        setSocialConfigs((prev) => [created, ...prev]);
      }
      setDesignSuccessMessage('Saved configuration created');
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to create saved configuration.');
    } finally {
      setDesignBusy(false);
    }
  }, [draftSocialPreferences, socialPreferences]);

  const saveConfigUpdate = useCallback(async (configId, payload) => {
    setDesignBusy(true);
    setDesignError('');
    try {
      const response = await socialPageAPI.updateConfig(configId, payload);
      const updated = response.data?.config;
      if (updated) {
        setSocialConfigs((prev) => prev.map((config) => (config._id === configId ? updated : config)));
      }
      setDesignSuccessMessage('Configuration updated');
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to update configuration.');
    } finally {
      setDesignBusy(false);
    }
  }, []);

  const applySavedConfig = useCallback(async (configId) => {
    setDesignBusy(true);
    setDesignError('');
    try {
      const response = await socialPageAPI.applyConfig(configId);
      const preferences = normalizeSocialPreferences(
        response.data?.preferences || socialPreferences,
        currentUser?.profileTheme || 'default',
        activeLayoutMode
      );
      setCurrentUser((prev) => (prev ? { ...prev, socialPagePreferences: preferences } : prev));
      setDraftSocialPreferences(preferences);
      setActiveDesignConfigId(response.data?.activeConfigId || configId);
      setInlineEditingPanelId('');
      setDesignSuccessMessage('Configuration applied');
      setHasUnsavedDesignChanges(false);
      designDirtyRef.current = false;
      await loadDesignData();
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to apply configuration.');
    } finally {
      setDesignBusy(false);
    }
  }, [socialPreferences, currentUser?.profileTheme, loadDesignData, activeLayoutMode]);

  const duplicateConfig = useCallback(async (configId, name) => {
    setDesignBusy(true);
    try {
      const response = await socialPageAPI.duplicateConfig(configId, { name, apply: false });
      if (response.data?.config) {
        setSocialConfigs((prev) => [response.data.config, ...prev]);
      }
      setDesignSuccessMessage('Configuration duplicated');
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to duplicate configuration.');
    } finally {
      setDesignBusy(false);
    }
  }, []);

  const deleteConfig = useCallback(async (configId) => {
    setDesignBusy(true);
    try {
      const response = await socialPageAPI.deleteConfig(configId);
      setSocialConfigs((prev) => prev.filter((config) => config._id !== configId));
      setActiveDesignConfigId(response.data?.activeConfigId || null);
      await loadDesignData();
      setDesignSuccessMessage('Configuration deleted');
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to delete configuration.');
    } finally {
      setDesignBusy(false);
    }
  }, [loadDesignData]);

  const toggleFavoriteSharedDesign = useCallback(async (config) => {
    try {
      if (config.isFavorite) {
        await socialPageAPI.unfavoriteShared(config._id);
      } else {
        await socialPageAPI.favoriteShared(config._id);
      }
      await Promise.all([loadSharedDesigns(), loadDesignData()]);
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to update favorite design.');
    }
  }, [loadDesignData, loadSharedDesigns]);

  const cloneSharedDesign = useCallback(async (config, name, apply = false) => {
    setDesignBusy(true);
    try {
      const response = await socialPageAPI.cloneShared(config._id, { name, apply });
      if (response.data?.config) {
        setSocialConfigs((prev) => [response.data.config, ...prev]);
      }
      await loadDesignData();
      if (apply && response.data?.config?._id) {
        await applySavedConfig(response.data.config._id);
      }
      setDesignSuccessMessage(apply ? 'Shared design cloned and applied' : 'Shared design cloned');
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to clone shared design.');
    } finally {
      setDesignBusy(false);
    }
  }, [applySavedConfig, loadDesignData]);

  const handleCommentInputChange = (postId, value) => {
    setCommentInputs((prev) => ({ ...prev, [postId]: value }));

    if (!isAuthenticated || !realtimeEnabled || !currentUser?._id) {
      return;
    }

    subscribeToPost(postId);

    if (!value.trim()) {
      emitTypingStop({ scope: 'comment', targetId: postId });
      if (localTypingTimeoutsRef.current[postId]) {
        window.clearTimeout(localTypingTimeoutsRef.current[postId]);
        delete localTypingTimeoutsRef.current[postId];
      }
      return;
    }

    emitTypingStart({ scope: 'comment', targetId: postId });

    if (localTypingTimeoutsRef.current[postId]) {
      window.clearTimeout(localTypingTimeoutsRef.current[postId]);
    }

    localTypingTimeoutsRef.current[postId] = window.setTimeout(() => {
      emitTypingStop({ scope: 'comment', targetId: postId });
      delete localTypingTimeoutsRef.current[postId];
    }, TYPING_TIMEOUT_MS);
  };

  const handleAddMediaUrl = () => {
    const value = postForm.mediaUrlInput.trim();
    if (!value) return;
    if (!isRenderableMediaUrl(value)) {
      setFeedError('Media URL must be a valid http/https URL.');
      return;
    }
    if (value.length > MEDIA_URL_MAX_LENGTH) {
      setFeedError(`Media URL exceeds max length (${MEDIA_URL_MAX_LENGTH}).`);
      return;
    }
    if (postForm.mediaUrls.length >= MEDIA_URL_MAX_ITEMS) {
      setFeedError(`You can attach up to ${MEDIA_URL_MAX_ITEMS} media URLs per post.`);
      setPostForm((prev) => ({ ...prev, mediaUrlInput: '' }));
      return;
    }
    if (postForm.mediaUrls.includes(value)) {
      setPostForm((prev) => ({ ...prev, mediaUrlInput: '' }));
      return;
    }

    setPostForm((prev) => ({
      ...prev,
      mediaUrls: [...prev.mediaUrls, value],
      mediaUrlInput: '',
    }));
    setFeedError('');
  };

  const handleRemoveMediaUrl = (index) => {
    setPostForm((prev) => ({
      ...prev,
      mediaUrls: prev.mediaUrls.filter((_, i) => i !== index),
    }));
  };

  const updateInteractionField = (type, field, value) => {
    setPostForm((prev) => ({
      ...prev,
      interaction: {
        ...prev.interaction,
        [type]: {
          ...prev.interaction[type],
          [field]: value,
        },
      },
    }));
  };

  const updateInteractionOption = (type, index, value) => {
    setPostForm((prev) => {
      const existingOptions = prev.interaction[type].options || [];
      const nextOptions = existingOptions.map((entry, i) => (i === index ? value : entry));
      return {
        ...prev,
        interaction: {
          ...prev.interaction,
          [type]: {
            ...prev.interaction[type],
            options: nextOptions,
          },
        },
      };
    });
  };

  const addInteractionOption = (type) => {
    setPostForm((prev) => {
      const existingOptions = prev.interaction[type].options || [];
      if (existingOptions.length >= INTERACTION_MAX_OPTIONS) {
        return prev;
      }
      return {
        ...prev,
        interaction: {
          ...prev.interaction,
          [type]: {
            ...prev.interaction[type],
            options: [...existingOptions, ''],
          },
        },
      };
    });
  };

  const removeInteractionOption = (type, index) => {
    setPostForm((prev) => {
      const existingOptions = prev.interaction[type].options || [];
      if (existingOptions.length <= 2) {
        return prev;
      }
      return {
        ...prev,
        interaction: {
          ...prev.interaction,
          [type]: {
            ...prev.interaction[type],
            options: existingOptions.filter((_, i) => i !== index),
          },
        },
      };
    });
  };

  const handlePostFormField = (field, value) => {
    setPostForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleStringInArray = (list, value) => {
    if (list.includes(value)) {
      return list.filter((entry) => entry !== value);
    }
    return [...list, value];
  };

  const handleToggleCircle = (circleName) => {
    setPostForm((prev) => ({
      ...prev,
      visibleToCircles: toggleStringInArray(prev.visibleToCircles, circleName)
    }));
  };

  const handleToggleVisibleUser = (userId) => {
    setPostForm((prev) => ({
      ...prev,
      visibleToUsers: toggleStringInArray(prev.visibleToUsers, userId)
    }));
  };

  const handleToggleExcludeUser = (userId) => {
    setPostForm((prev) => ({
      ...prev,
      excludeUsers: toggleStringInArray(prev.excludeUsers, userId)
    }));
  };

  const refreshCircles = async () => {
    try {
      const response = await circlesAPI.getCircles();
      setCircles(Array.isArray(response.data?.circles) ? response.data.circles : []);
    } catch {
      setCircles([]);
    }
  };

  const handleCreateCircle = async (payload) => {
    try {
      await circlesAPI.createCircle(payload);
      await refreshCircles();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to create circle.');
    }
  };

  const handleDeleteCircle = async (circleName) => {
    try {
      await circlesAPI.deleteCircle(circleName);
      await refreshCircles();
      setPostForm((prev) => ({
        ...prev,
        visibleToCircles: prev.visibleToCircles.filter((entry) => entry !== circleName)
      }));
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to delete circle.');
    }
  };

  const handleAddCircleMember = async (circleName, userId) => {
    try {
      await circlesAPI.addMember(circleName, userId);
      await refreshCircles();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to add circle member.');
    }
  };

  const handleRemoveCircleMember = async (circleName, userId) => {
    try {
      await circlesAPI.removeMember(circleName, userId);
      await refreshCircles();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to remove circle member.');
    }
  };

  const refreshModerationState = async () => {
    const [blocksResponse, mutesResponse, reportsResponse] = await Promise.all([
      moderationAPI.getBlocks().catch(() => ({ data: { blockedUsers: [] } })),
      moderationAPI.getMutes().catch(() => ({ data: { mutedUsers: [] } })),
      moderationAPI.getMyReports().catch(() => ({ data: { reports: [] } }))
    ]);

    setBlockedUserIds((blocksResponse.data?.blockedUsers || []).map((entry) => String(entry._id)));
    setMutedUserIds((mutesResponse.data?.mutedUsers || []).map((entry) => String(entry._id)));
    setMyReports(Array.isArray(reportsResponse.data?.reports) ? reportsResponse.data.reports : []);
  };

  const handleBlockUser = async (userId, reason = '') => {
    try {
      await moderationAPI.blockUser(userId, reason);
      await refreshModerationState();
      await loadFeed();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to block user.');
    }
  };

  const handleUnblockUser = async (userId) => {
    try {
      await moderationAPI.unblockUser(userId);
      await refreshModerationState();
      await loadFeed();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to unblock user.');
    }
  };

  const handleToggleMuteUser = async (userId) => {
    try {
      if (mutedUserIds.includes(String(userId))) {
        await moderationAPI.unmuteUser(userId);
      } else {
        await moderationAPI.muteUser(userId);
      }
      await refreshModerationState();
      await loadFeed();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to update mute state.');
    }
  };

  const openReportModal = (targetType, targetId, targetUserId) => {
    setReportModalState({
      isOpen: true,
      targetType,
      targetId,
      targetUserId
    });
  };

  const closeReportModal = () => {
    setReportModalState({
      isOpen: false,
      targetType: 'post',
      targetId: null,
      targetUserId: null
    });
  };

  const submitReport = async (payload) => {
    try {
      await moderationAPI.report(payload);
      await refreshModerationState();
      closeReportModal();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to submit report.');
    }
  };

  const handleSubmitPost = async (event) => {
    event.preventDefault();
    if (!currentUser?._id) return;

    const content = postForm.content.trim();
    const contentType = postForm.contentType;
    const hasStandardContent = content || postForm.mediaUrls.length > 0;
    let interactionPayload = null;

    if (contentType === 'standard' && !hasStandardContent) {
      setFeedError('Add post content or at least one media URL before publishing.');
      return;
    }
    if ((postForm.relationshipAudience || 'social') === 'secure' && postForm.visibility !== 'friends') {
      setFeedError('Secure audience currently supports only Friends visibility.');
      return;
    }

    if (contentType === 'poll') {
      const poll = postForm.interaction.poll;
      const options = (poll.options || []).map((option) => option.trim()).filter(Boolean);
      if (!poll.question.trim()) {
        setFeedError('Poll question is required.');
        return;
      }
      if (options.length < 2) {
        setFeedError('Poll needs at least two options.');
        return;
      }
      if (!poll.expiresAt) {
        setFeedError('Poll expiration is required.');
        return;
      }
      interactionPayload = {
        type: 'poll',
        question: poll.question.trim(),
        options,
        allowMultiple: Boolean(poll.allowMultiple),
        expiresAt: poll.expiresAt,
      };
    } else if (contentType === 'quiz') {
      const quiz = postForm.interaction.quiz;
      const options = (quiz.options || []).map((option) => option.trim()).filter(Boolean);
      const correctOptionIndex = Number(quiz.correctOptionIndex);
      if (!quiz.question.trim()) {
        setFeedError('Quiz question is required.');
        return;
      }
      if (options.length < 2) {
        setFeedError('Quiz needs at least two options.');
        return;
      }
      if (!Number.isInteger(correctOptionIndex) || correctOptionIndex < 0 || correctOptionIndex >= options.length) {
        setFeedError('Quiz correct option must match an existing option.');
        return;
      }
      if (!quiz.expiresAt) {
        setFeedError('Quiz expiration is required.');
        return;
      }
      interactionPayload = {
        type: 'quiz',
        question: quiz.question.trim(),
        options,
        correctOptionIndex,
        explanation: quiz.explanation.trim(),
        expiresAt: quiz.expiresAt,
      };
    } else if (contentType === 'countdown') {
      const countdown = postForm.interaction.countdown;
      if (!countdown.label.trim()) {
        setFeedError('Countdown label is required.');
        return;
      }
      if (!countdown.targetAt) {
        setFeedError('Countdown target time is required.');
        return;
      }
      if (!countdown.timezone.trim()) {
        setFeedError('Countdown timezone is required.');
        return;
      }
      interactionPayload = {
        type: 'countdown',
        label: countdown.label.trim(),
        targetAt: countdown.targetAt,
        timezone: countdown.timezone.trim(),
        linkUrl: countdown.linkUrl.trim(),
      };
    }

    setSubmittingPost(true);
    setFeedError('');
    try {
      let expiresAt = null;
      if (postForm.expirationPreset === '24h') {
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      } else if (postForm.expirationPreset === '7d') {
        expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (postForm.expirationPreset === '30d') {
        expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      const response = await feedAPI.createPost({
        content,
        mediaUrls: postForm.mediaUrls,
        visibility: postForm.visibility,
        relationshipAudience: postForm.relationshipAudience,
        visibleToCircles: postForm.visibleToCircles,
        visibleToUsers: postForm.visibleToUsers,
        excludeUsers: postForm.excludeUsers,
        locationRadius: postForm.locationRadius ? Number(postForm.locationRadius) : null,
        expiresAt,
        targetFeedId: currentUser._id,
        interaction: interactionPayload,
      });

      const created = response.data?.post ? normalizePost(response.data.post) : null;
      if (created) {
        let createdPost = created;
        if (created.interaction?.type) {
          try {
            const interactionResponse = await feedAPI.getInteraction(created._id);
            createdPost = {
              ...created,
              interaction: interactionResponse.data?.interaction || created.interaction,
            };
          } catch {
            createdPost = created;
          }
        }
        setPosts((prev) => [createdPost, ...prev]);
      } else {
        await loadAuthenticatedFeed();
      }

      setPostForm({
        content: '',
        mediaUrlInput: '',
        mediaUrls: [],
        visibility: 'public',
        relationshipAudience: 'social',
        visibleToCircles: [],
        visibleToUsers: [],
        excludeUsers: [],
        locationRadius: '',
        expirationPreset: 'none',
        contentType: 'standard',
        interaction: {
          poll: {
            question: '',
            options: ['', ''],
            allowMultiple: false,
            expiresAt: '',
          },
          quiz: {
            question: '',
            options: ['', ''],
            correctOptionIndex: 0,
            explanation: '',
            expiresAt: '',
          },
          countdown: {
            label: '',
            targetAt: '',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            linkUrl: '',
          },
        },
      });
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to publish post.');
    } finally {
      setSubmittingPost(false);
    }
  };

  const handleToggleLike = async (post) => {
    if (!currentUser?._id) return;
    const postId = post._id;
    const hasLiked = post.likes.includes(currentUser._id);

    setPostActionLoading(postId, true);
    try {
      if (hasLiked) {
        await feedAPI.unlikePost(postId);
      } else {
        await feedAPI.likePost(postId);
      }

      setPosts((prev) =>
        prev.map((item) => {
          if (item._id !== postId) return item;

          const nextLikes = hasLiked
            ? item.likes.filter((id) => id !== currentUser._id)
            : Array.from(new Set([...item.likes, currentUser._id]));

          return {
            ...item,
            likes: nextLikes,
            likesCount: nextLikes.length,
          };
        })
      );
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to update like.');
    } finally {
      setPostActionLoading(postId, false);
    }
  };

  const handleAddComment = async (postId) => {
    if (!currentUser?._id) return;
    const content = (commentInputs[postId] || '').trim();
    if (!content) return;

    setPostActionLoading(postId, true);
    try {
      const response = await feedAPI.addComment(postId, content);
      const addedComment = response.data?.comment;

      setPosts((prev) =>
        prev.map((item) => {
          if (item._id !== postId) return item;

          const nextComments = addedComment
            ? [
                ...item.comments,
                {
                  ...addedComment,
                  userId: String(addedComment.userId || currentUser._id),
                  username: currentUser.username,
                },
              ]
            : item.comments;

          return {
            ...item,
            comments: nextComments,
            commentsCount: nextComments.length,
          };
        })
      );

      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
      emitTypingStop({ scope: 'comment', targetId: postId });
      if (localTypingTimeoutsRef.current[postId]) {
        window.clearTimeout(localTypingTimeoutsRef.current[postId]);
        delete localTypingTimeoutsRef.current[postId];
      }
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to add comment.');
    } finally {
      setPostActionLoading(postId, false);
    }
  };

  const applyInteractionState = (postId, interactionState) => {
    if (!interactionState) return;
    setPosts((prev) =>
      prev.map((item) => (item._id === postId ? { ...item, interaction: interactionState } : item))
    );
  };

  const handleVotePoll = async (postId, optionIndex) => {
    if (!currentUser?._id || isGuestPreview) return;
    setPostActionLoading(postId, true);
    try {
      const response = await feedAPI.votePoll(postId, [optionIndex]);
      applyInteractionState(postId, response.data?.interaction || null);
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to submit poll vote.');
      if (error.response?.status === 409) {
        const interactionResponse = await feedAPI.getInteraction(postId);
        applyInteractionState(postId, interactionResponse.data?.interaction || null);
      }
    } finally {
      setPostActionLoading(postId, false);
    }
  };

  const handleSubmitQuizAnswer = async (postId, optionIndex) => {
    if (!currentUser?._id || isGuestPreview) return;
    setPostActionLoading(postId, true);
    try {
      const response = await feedAPI.submitQuizAnswer(postId, optionIndex);
      applyInteractionState(postId, response.data?.interaction || null);
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to submit quiz answer.');
      if (error.response?.status === 409) {
        const interactionResponse = await feedAPI.getInteraction(postId);
        applyInteractionState(postId, interactionResponse.data?.interaction || null);
      }
    } finally {
      setPostActionLoading(postId, false);
    }
  };

  const handleFollowCountdown = async (postId) => {
    if (!currentUser?._id || isGuestPreview) return;
    setPostActionLoading(postId, true);
    try {
      const response = await feedAPI.followCountdown(postId);
      applyInteractionState(postId, response.data?.interaction || null);
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to follow countdown.');
      if (error.response?.status === 409) {
        const interactionResponse = await feedAPI.getInteraction(postId);
        applyInteractionState(postId, interactionResponse.data?.interaction || null);
      }
    } finally {
      setPostActionLoading(postId, false);
    }
  };

  const handleAddGalleryUrl = async () => {
    if (!canManageGallery || !galleryOwnerIdentifier) return;

    const value = galleryUrlInput.trim();
    if (!value) return;

    if (!isRenderableMediaUrl(value)) {
      setGalleryError('Gallery image URL must be a valid http/https URL.');
      return;
    }

    if (galleryItems.length >= GALLERY_MAX_ITEMS) {
      setGalleryError(`Gallery can contain up to ${GALLERY_MAX_ITEMS} images.`);
      return;
    }

    setGalleryBusy(true);
    setGalleryError('');
    try {
      const response = await galleryAPI.createGalleryItem(galleryOwnerIdentifier, {
        mediaUrl: value,
        caption: galleryCaptionInput,
        relationshipAudience: galleryRelationshipAudience,
      });

      const created = response.data?.item ? normalizeGalleryItem(response.data.item) : null;
      if (created) {
        setGalleryItems((prev) => [created, ...prev]);
      } else {
        await loadGallery();
      }

      setGalleryUrlInput('');
      setGalleryCaptionInput('');
    } catch (error) {
      setGalleryError(error.response?.data?.error || 'Failed to add gallery URL.');
    } finally {
      setGalleryBusy(false);
    }
  };

  const handleUploadGalleryImage = async (event) => {
    if (!canManageGallery || !galleryOwnerIdentifier) return;

    const [file] = Array.from(event.target.files || []);
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setGalleryError('Only image files are supported.');
      return;
    }

    if (file.size > GALLERY_MAX_IMAGE_SIZE_BYTES) {
      setGalleryError('Image file is too large (max 3MB).');
      return;
    }

    if (galleryItems.length >= GALLERY_MAX_ITEMS) {
      setGalleryError(`Gallery can contain up to ${GALLERY_MAX_ITEMS} images.`);
      return;
    }

    setGalleryBusy(true);
    setGalleryError('');
    try {
      const response = await galleryAPI.uploadGalleryItem(
        galleryOwnerIdentifier,
        file,
        galleryCaptionInput,
        galleryRelationshipAudience
      );

      const created = response.data?.item ? normalizeGalleryItem(response.data.item) : null;
      if (created) {
        setGalleryItems((prev) => [created, ...prev]);
      } else {
        await loadGallery();
      }

      setGalleryCaptionInput('');
    } catch (error) {
      setGalleryError(error.response?.data?.error || 'Failed to upload image.');
    } finally {
      setGalleryBusy(false);
    }
  };

  const handleStartEditGalleryItem = (item) => {
    setGalleryEditById((prev) => ({
      ...prev,
      [item._id]: {
        mediaUrl: item.mediaType === 'url' ? item.mediaUrl || '' : '',
        caption: item.caption || '',
      },
    }));
  };

  const handleCancelEditGalleryItem = (imageId) => {
    setGalleryEditById((prev) => {
      const next = { ...prev };
      delete next[imageId];
      return next;
    });
  };

  const handleEditGalleryField = (imageId, field, value) => {
    setGalleryEditById((prev) => ({
      ...prev,
      [imageId]: {
        mediaUrl: prev[imageId]?.mediaUrl || '',
        caption: prev[imageId]?.caption || '',
        [field]: value,
      },
    }));
  };

  const handleSaveGalleryItem = async (item) => {
    if (!canManageGallery || !galleryOwnerIdentifier) return;

    const editState = galleryEditById[item._id];
    if (!editState) return;

    setGalleryActionLoading(item._id, true);
    setGalleryError('');
    try {
      const payload = { caption: editState.caption || '' };
      if (item.mediaType === 'url') {
        payload.mediaUrl = editState.mediaUrl || '';
      }

      const response = await galleryAPI.updateGalleryItem(galleryOwnerIdentifier, item._id, payload);
      const updated = response.data?.item ? normalizeGalleryItem(response.data.item) : null;

      if (updated) {
        setGalleryItems((prev) => prev.map((image) => (image._id === item._id ? updated : image)));
      } else {
        await loadGallery();
      }

      handleCancelEditGalleryItem(item._id);
    } catch (error) {
      setGalleryError(error.response?.data?.error || 'Failed to update gallery image.');
    } finally {
      setGalleryActionLoading(item._id, false);
    }
  };

  const handleRemoveGalleryImage = async (imageId) => {
    if (!canManageGallery || !galleryOwnerIdentifier) return;

    setGalleryActionLoading(imageId, true);
    setGalleryError('');
    try {
      await galleryAPI.deleteGalleryItem(galleryOwnerIdentifier, imageId);
      setGalleryItems((prev) => prev.filter((item) => item._id !== imageId));
      handleCancelEditGalleryItem(imageId);
    } catch (error) {
      setGalleryError(error.response?.data?.error || 'Failed to remove gallery image.');
    } finally {
      setGalleryActionLoading(imageId, false);
    }
  };

  const handleGalleryReaction = async (imageId, reactionType) => {
    if (!viewerCanReact || !galleryOwnerIdentifier) return;

    setGalleryActionLoading(imageId, true);
    setGalleryError('');
    try {
      const response = await galleryAPI.reactToGalleryImage(galleryOwnerIdentifier, imageId, reactionType);
      const viewerReaction = response.data?.reaction || null;
      const likesCount = typeof response.data?.likesCount === 'number' ? response.data.likesCount : 0;
      const dislikesCount = typeof response.data?.dislikesCount === 'number' ? response.data.dislikesCount : 0;

      setGalleryItems((prev) =>
        prev.map((item) =>
          item._id === imageId
            ? {
                ...item,
                viewerReaction,
                likesCount,
                dislikesCount,
              }
            : item
        )
      );
    } catch (error) {
      setGalleryError(error.response?.data?.error || 'Failed to update gallery reaction.');
    } finally {
      setGalleryActionLoading(imageId, false);
    }
  };

  const ownerEditingEnabled = isOwnSocialContext && !isGuestPreview;

  const renderPanelBody = (panelId) => {
    switch (panelId) {
      case 'profile_header':
        return (
          <div className={`rounded-2xl bg-gradient-to-r ${headerGradientClass} p-4 text-white shadow-sm`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Social</h2>
                {isViewingAnotherProfile ? <p className={`${getFontSizeClass(socialPreferences.globalStyles.fontSizes?.small)} text-white/90`}>Viewing @${requestedProfileIdentifier}</p> : null}
              </div>
              {isOwnSocialContext ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleGuestPreviewToggle(!isGuestPreview)}
                    className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
                  >
                    {isGuestPreview ? 'Exit guest preview' : 'View as guest'}
                  </button>
                  {!isGuestPreview ? (
                    <button
                      type="button"
                      onClick={() => setDesignStudioOpen(true)}
                      className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                    >
                      Design studio
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      case 'guest_preview_notice':
        return isOwnSocialContext ? (
          <div className={`rounded-xl border px-4 py-4 ${isGuestPreview ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            <p className="font-semibold">{isGuestPreview ? 'Guest preview is on' : 'Owner view is active'}</p>
            <p className="mt-1 text-sm">
              {isGuestPreview
                ? 'Your visitors do not see edit controls, inline panel tools, or the global design studio.'
                : 'Use the floating edit button or any panel edit icon to customize the page in place.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            Guest viewers always see a clean, read-only version of the social page.
          </div>
        );
      case 'shortcuts':
        return (
          <ul className="space-y-2 text-sm">
            <li><Link to="/social" className="block rounded-xl bg-blue-50 px-3 py-2 font-medium text-blue-700">Social Stream</Link></li>
            {isModuleVisible('marketplaceShortcut') ? <li><Link to="/market" className="block rounded-xl px-3 py-2 hover:bg-slate-50">Marketplace</Link></li> : null}
            {isModuleVisible('calendarShortcut') ? <li><Link to="/calendar" className="block rounded-xl px-3 py-2 hover:bg-slate-50">Calendar</Link></li> : null}
            {isModuleVisible('settingsShortcut') ? <li><Link to="/settings" className="block rounded-xl px-3 py-2 hover:bg-slate-50">User Settings</Link></li> : null}
            {isModuleVisible('referShortcut') ? <li><Link to="/refer" className="block rounded-xl px-3 py-2 hover:bg-slate-50">Refer Friend</Link></li> : null}
          </ul>
        );
      case 'snapshot':
        return (
          <div className="space-y-3 text-sm">
            <p>Active profile: <span className="font-semibold">{activeProfile?.username ? `@${activeProfile.username}` : 'Guest'}</span></p>
            <p>Loaded posts: <span className="font-semibold">{posts.length}</span></p>
            <p>Friends loaded: <span className="font-semibold">{friends.length}</span></p>
            <p>Top friends: <span className="font-semibold">{topFriends.length}</span></p>
            {visibleResumeInfo ? (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Resume</p>
                {visibleResumeInfo.resumeHeadline ? <p className="mt-1 text-sm text-blue-900">{visibleResumeInfo.resumeHeadline}</p> : null}
                <Link to={visibleResumeInfo.resumeUrl} onClick={() => handleResumeProfileLinkClick(visibleResumeInfo.username)} className="mt-2 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-800">View hosted resume</Link>
              </div>
            ) : null}
            {!isOwnSocialContext && isAuthenticated && sharedDesigns.length > 0 ? (
              <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Shared design</p>
                <p className="mt-1 text-sm text-violet-900">Favorite or clone @{requestedProfileIdentifier}'s shared social page design.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => toggleFavoriteSharedDesign(sharedDesigns[0])} className="rounded-lg border border-violet-200 px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-white">{sharedDesigns[0]?.isFavorite ? 'Unfavorite' : 'Favorite'}</button>
                  <button type="button" onClick={() => cloneSharedDesign(sharedDesigns[0], `${sharedDesigns[0]?.name || 'Shared design'} Clone`, false)} className="rounded-lg border border-violet-200 px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-white">Clone</button>
                </div>
              </div>
            ) : null}
          </div>
        );
      case 'guest_lookup':
        return !isAuthenticated ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Enter a username or user ID to load a public feed.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input type="text" value={guestUser} onChange={(event) => setGuestUser(event.target.value)} placeholder="username or user ID" className="flex-1 rounded-xl border px-3 py-2" />
              <button type="button" onClick={loadFeed} className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700" disabled={loadingFeed}>{loadingFeed ? 'Loading…' : 'Load profile'}</button>
            </div>
            {guestProfile ? (
              <div className="text-sm text-slate-600">
                Viewing public posts for <span className="font-semibold">@{guestProfile.username}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-slate-500">Guest lookup is hidden for signed-in owners and guest profile viewers.</div>
        );
      case 'composer':
        return isOwnSocialContext && !isGuestPreview ? (
          <form onSubmit={handleSubmitPost} className="space-y-4">
            <textarea value={postForm.content} onChange={(event) => setPostForm((prev) => ({ ...prev, content: event.target.value }))} placeholder="What's on your mind?" className="min-h-28 w-full rounded-xl border px-3 py-2" maxLength={5000} />

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Post Type</label>
              <select value={postForm.contentType} onChange={(event) => setPostForm((prev) => ({ ...prev, contentType: event.target.value }))} className="rounded-xl border px-3 py-2">
                {COMPOSER_CONTENT_TYPES.map((option) => <option key={option} value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Media URLs</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="url" value={postForm.mediaUrlInput} onChange={(event) => setPostForm((prev) => ({ ...prev, mediaUrlInput: event.target.value }))} placeholder="https://example.com/image.jpg" className="flex-1 rounded-xl border px-3 py-2" />
                <button type="button" onClick={handleAddMediaUrl} className="rounded-xl border border-blue-600 px-4 py-2 text-blue-600 hover:bg-blue-50">Add URL</button>
              </div>
              {postForm.mediaUrls.length > 0 ? (
                <ul className="space-y-1">
                  {postForm.mediaUrls.map((url, index) => (
                    <li key={`${url}-${index}`} className="flex items-center justify-between rounded-xl border bg-slate-50 px-3 py-2 text-sm">
                      <span className="truncate pr-2">{url}</span>
                      <button type="button" onClick={() => handleRemoveMediaUrl(index)} className="text-red-600 hover:text-red-700">Remove</button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <PrivacySelector form={postForm} circles={circles} friends={friends} onChange={handlePostFormField} onToggleCircle={handleToggleCircle} onToggleVisibleUser={handleToggleVisibleUser} onToggleExcludeUser={handleToggleExcludeUser} />

            {postForm.contentType === 'poll' ? (
              <div className="space-y-3 rounded-xl border bg-blue-50/40 p-3">
                <h4 className="text-sm font-semibold text-gray-700">Poll Settings</h4>
                <input type="text" value={postForm.interaction.poll.question} onChange={(event) => updateInteractionField('poll', 'question', event.target.value)} placeholder="Poll question" className="w-full rounded-xl border px-3 py-2 text-sm" />
                <div className="space-y-2">
                  {postForm.interaction.poll.options.map((option, index) => (
                    <div key={`poll-option-${index}`} className="flex gap-2">
                      <input type="text" value={option} onChange={(event) => updateInteractionOption('poll', index, event.target.value)} placeholder={`Option ${index + 1}`} className="flex-1 rounded-xl border px-3 py-2 text-sm" />
                      <button type="button" onClick={() => removeInteractionOption('poll', index)} className="px-2 text-red-600" disabled={postForm.interaction.poll.options.length <= 2}>Remove</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addInteractionOption('poll')} className="text-sm text-blue-700 hover:underline" disabled={postForm.interaction.poll.options.length >= INTERACTION_MAX_OPTIONS}>Add poll option</button>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={postForm.interaction.poll.allowMultiple} onChange={(event) => updateInteractionField('poll', 'allowMultiple', event.target.checked)} />Allow multiple selections</label>
                  <input type="datetime-local" value={postForm.interaction.poll.expiresAt} onChange={(event) => updateInteractionField('poll', 'expiresAt', event.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
                </div>
              </div>
            ) : null}

            {postForm.contentType === 'quiz' ? (
              <div className="space-y-3 rounded-xl border bg-violet-50/40 p-3">
                <h4 className="text-sm font-semibold text-gray-700">Quiz Settings</h4>
                <input type="text" value={postForm.interaction.quiz.question} onChange={(event) => updateInteractionField('quiz', 'question', event.target.value)} placeholder="Quiz question" className="w-full rounded-xl border px-3 py-2 text-sm" />
                <div className="space-y-2">
                  {postForm.interaction.quiz.options.map((option, index) => (
                    <div key={`quiz-option-${index}`} className="flex gap-2">
                      <input type="text" value={option} onChange={(event) => updateInteractionOption('quiz', index, event.target.value)} placeholder={`Option ${index + 1}`} className="flex-1 rounded-xl border px-3 py-2 text-sm" />
                      <button type="button" onClick={() => removeInteractionOption('quiz', index)} className="px-2 text-red-600" disabled={postForm.interaction.quiz.options.length <= 2}>Remove</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addInteractionOption('quiz')} className="text-sm text-blue-700 hover:underline" disabled={postForm.interaction.quiz.options.length >= INTERACTION_MAX_OPTIONS}>Add quiz option</button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <select value={postForm.interaction.quiz.correctOptionIndex} onChange={(event) => updateInteractionField('quiz', 'correctOptionIndex', Number(event.target.value))} className="rounded-xl border px-3 py-2 text-sm">
                    {postForm.interaction.quiz.options.map((_, index) => <option key={`quiz-correct-${index}`} value={index}>Correct option #{index + 1}</option>)}
                  </select>
                  <input type="datetime-local" value={postForm.interaction.quiz.expiresAt} onChange={(event) => updateInteractionField('quiz', 'expiresAt', event.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
                </div>
                <textarea value={postForm.interaction.quiz.explanation} onChange={(event) => updateInteractionField('quiz', 'explanation', event.target.value)} placeholder="Explanation shown after answer (optional)" className="w-full rounded-xl border px-3 py-2 text-sm" rows={2} />
              </div>
            ) : null}

            {postForm.contentType === 'countdown' ? (
              <div className="space-y-3 rounded-xl border bg-emerald-50/40 p-3">
                <h4 className="text-sm font-semibold text-gray-700">Countdown Settings</h4>
                <input type="text" value={postForm.interaction.countdown.label} onChange={(event) => updateInteractionField('countdown', 'label', event.target.value)} placeholder="Countdown label" className="w-full rounded-xl border px-3 py-2 text-sm" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input type="datetime-local" value={postForm.interaction.countdown.targetAt} onChange={(event) => updateInteractionField('countdown', 'targetAt', event.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
                  <input type="text" value={postForm.interaction.countdown.timezone} onChange={(event) => updateInteractionField('countdown', 'timezone', event.target.value)} placeholder="Timezone (e.g. UTC)" className="rounded-xl border px-3 py-2 text-sm" />
                </div>
                <input type="url" value={postForm.interaction.countdown.linkUrl} onChange={(event) => updateInteractionField('countdown', 'linkUrl', event.target.value)} placeholder="Optional link URL" className="w-full rounded-xl border px-3 py-2 text-sm" />
              </div>
            ) : null}

            <button type="submit" disabled={submittingPost} className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60">{submittingPost ? 'Publishing…' : 'Publish Post'}</button>
          </form>
        ) : <p className="text-sm text-slate-500">Post publishing is available only in owner view.</p>;
      case 'circles':
        return isOwnSocialContext && !isGuestPreview ? (
          <CircleManager circles={circles} friends={friends} onCreateCircle={handleCreateCircle} onDeleteCircle={handleDeleteCircle} onAddMember={handleAddCircleMember} onRemoveMember={handleRemoveCircleMember} />
        ) : <p className="text-sm text-slate-500">Circles are visible only while managing your own social page.</p>;
      case 'timeline':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">{(isOwnSocialContext && !isGuestPreview) ? 'Your personalized timeline.' : 'Public feed view.'}</p>
              <button type="button" onClick={loadFeed} className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50" disabled={loadingFeed}>{loadingFeed ? 'Refreshing…' : 'Refresh'}</button>
            </div>
            {feedError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{feedError}</div> : null}
            {isAuthenticated && !realtimeEnabled ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Real-time social updates are disabled for this account. Periodic refresh remains active.</div> : null}
            {loadingFeed ? <div className="rounded-xl border bg-slate-50 p-6 text-slate-500">Loading feed…</div> : posts.length === 0 ? <div className="rounded-xl border bg-slate-50 p-6 text-slate-500">No posts found yet.</div> : posts.map((post) => {
              const postAuthor = post.authorId?.username || 'unknown';
              const postAuthorId = String(post.authorId?._id || post.authorId || '');
              const postTarget = post.targetFeedId?.username || postAuthor;
              const hasLiked = currentUser ? post.likes.includes(currentUser._id) : false;
              const postBusy = Boolean(actionLoadingByPost[post._id]);
              const isBlocked = blockedUserIds.includes(postAuthorId);
              const isMuted = mutedUserIds.includes(postAuthorId);
              const interaction = post.interaction;
              const interactionStatus = getInteractionStatus(interaction);

              return (
                <article key={post._id} className="space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                  <header className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">@{postAuthor} {'→'} @{postTarget}</p>
                      <p className="text-xs text-gray-500">{formatDate(post.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs uppercase tracking-wide">{PRIVACY_BADGE_LABELS[post.visibility] || post.visibility}</span>
                      <span className={`rounded-full px-2 py-1 text-xs uppercase tracking-wide ${post.relationshipAudience === 'secure' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>{RELATIONSHIP_AUDIENCE_LABELS[post.relationshipAudience] || RELATIONSHIP_AUDIENCE_LABELS.social}</span>
                    </div>
                  </header>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                    {Array.isArray(post.visibleToCircles) && post.visibleToCircles.length > 0 ? <span className="rounded-full bg-gray-100 px-2 py-1">Circles: {post.visibleToCircles.join(', ')}</span> : null}
                    {post.locationRadius ? <span className="rounded-full bg-gray-100 px-2 py-1">Radius: {post.locationRadius} mi</span> : null}
                    {post.expiresAt ? <span className="rounded-full bg-gray-100 px-2 py-1">Expires: {formatDate(post.expiresAt)}</span> : null}
                  </div>
                  {post.content ? <p className="whitespace-pre-wrap text-gray-800">{post.content}</p> : null}
                  {post.mediaUrls.length > 0 ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{post.mediaUrls.map((url, index) => renderMediaItem(url, `${post._id}-media-${index}`))}</div> : null}
                  {interaction?.type === 'poll' ? <div className="rounded-xl border bg-slate-50 p-3"><p className="font-medium text-sm">{interaction.poll?.question}</p><p className="text-xs text-gray-500">Poll status: <span className="font-medium">{interactionStatus}</span></p></div> : null}
                  {interaction?.type === 'quiz' ? <div className="rounded-xl border bg-violet-50/40 p-3"><p className="font-medium text-sm">{interaction.quiz?.question}</p><p className="text-xs text-gray-500">Quiz status: <span className="font-medium">{interactionStatus}</span></p></div> : null}
                  {interaction?.type === 'countdown' ? <div className="rounded-xl border bg-emerald-50/50 p-3"><p className="font-medium text-sm">{interaction.countdown?.label}</p><p className="text-xs text-gray-600">Timezone: {interaction.countdown?.timezone || 'UTC'} • Status: {interactionStatus}</p><p className="text-lg font-semibold text-emerald-700">{formatRemainingTime(interaction.countdown?.targetAt, nowMs)}</p></div> : null}
                  <div className="flex items-center gap-4 text-sm text-gray-600"><span>{post.likesCount} like{post.likesCount === 1 ? '' : 's'}</span><span>{post.commentsCount} comment{post.commentsCount === 1 ? '' : 's'}</span></div>
                  {isAuthenticated && !isGuestPreview && postAuthorId && postAuthorId !== String(currentUser?._id) ? (
                    <div className="flex flex-wrap gap-2">
                      <BlockButton isBlocked={isBlocked} onBlock={(reason) => handleBlockUser(postAuthorId, reason)} onUnblock={() => handleUnblockUser(postAuthorId)} />
                      <button type="button" onClick={() => handleToggleMuteUser(postAuthorId)} className="rounded-lg border border-gray-400 px-3 py-1.5 text-sm">{isMuted ? 'Unmute User' : 'Mute User'}</button>
                      <button type="button" onClick={() => openReportModal('post', post._id, postAuthorId)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700">Report</button>
                    </div>
                  ) : null}
                  {isAuthenticated && !isGuestPreview ? (
                    <div className="space-y-3">
                      <button type="button" disabled={postBusy} onClick={() => handleToggleLike(post)} className={`rounded-lg border px-3 py-1.5 text-sm ${hasLiked ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 hover:bg-gray-50'}`}>{hasLiked ? 'Unlike' : 'Like'}</button>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Comments</h4>
                        {post.comments.length === 0 ? <p className="text-sm text-gray-500">No comments yet.</p> : (
                          <ul className="space-y-2">
                            {post.comments.map((comment, index) => (
                              <li key={comment._id || `${post._id}-comment-${index}`} className="rounded-xl border bg-gray-50 p-2 text-sm">
                                <p className="font-medium text-gray-700">@{comment.username || comment.userId || 'user'}</p>
                                <p className="whitespace-pre-wrap text-gray-800">{comment.content}</p>
                                <p className="text-xs text-gray-500">{formatDate(comment.createdAt)}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex gap-2">
                          <input type="text" value={commentInputs[post._id] || ''} onChange={(event) => handleCommentInputChange(post._id, event.target.value)} onBlur={() => emitTypingStop({ scope: 'comment', targetId: post._id })} placeholder="Add a comment..." className="flex-1 rounded-xl border px-3 py-2 text-sm" maxLength={1000} />
                          <button type="button" onClick={() => handleAddComment(post._id)} disabled={postBusy} className="rounded-xl bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-60">Comment</button>
                        </div>
                        <TypingIndicator labels={Object.values(commentTypingByPostId[post._id] || {})} />
                      </div>
                    </div>
                  ) : <p className="text-sm text-gray-500">Sign in to like or comment on posts.</p>}
                </article>
              );
            })}
          </div>
        );
      case 'moderation_status':
        return isAuthenticated && !isGuestPreview ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Track the current status of your submitted reports.</p>
            {myReports.length === 0 ? <p className="text-sm text-gray-500">No submitted reports yet.</p> : myReports.slice(0, 10).map((report) => (
              <div key={report.id} className="rounded-xl border p-2 text-sm">
                <p className="font-medium text-gray-900">{report.category} • {report.targetType} • {report.status}</p>
                <p className="text-gray-500">{formatDate(report.createdAt)}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500">Moderation status is available only in owner view.</p>;
      case 'gallery':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">Gallery items: {galleryItems.length}/{GALLERY_MAX_ITEMS}</p>
            </div>
            {!isAuthenticated ? (
              <div className="space-y-2 rounded-xl border bg-slate-50 p-3">
                <p className="text-sm text-gray-600">Choose a profile to browse gallery media.</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input type="text" value={galleryTargetInput} onChange={(event) => setGalleryTargetInput(event.target.value)} placeholder="username or user ID" className="flex-1 rounded-xl border px-3 py-2" />
                  <button type="button" onClick={() => setGalleryTarget(galleryTargetInput.trim())} disabled={galleryBusy || galleryLoading} className="rounded-xl border border-gray-300 px-4 py-2 hover:bg-gray-100 disabled:opacity-60">Load Gallery</button>
                </div>
              </div>
            ) : null}
            {canManageGallery ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input type="url" value={galleryUrlInput} onChange={(event) => setGalleryUrlInput(event.target.value)} placeholder="https://example.com/photo.jpg" className="flex-1 rounded-xl border px-3 py-2" />
                  <button type="button" onClick={handleAddGalleryUrl} disabled={galleryBusy} className="rounded-xl border border-blue-600 px-4 py-2 text-blue-600 hover:bg-blue-50">{galleryBusy ? 'Adding…' : 'Add URL'}</button>
                </div>
                <input type="text" value={galleryCaptionInput} onChange={(event) => setGalleryCaptionInput(event.target.value)} placeholder="Optional caption" maxLength={280} className="w-full rounded-xl border px-3 py-2" />
                <label className="flex flex-col gap-1 text-sm text-gray-700"><span>Audience</span><select value={galleryRelationshipAudience} onChange={(event) => setGalleryRelationshipAudience(event.target.value)} className="rounded-xl border px-3 py-2"><option value="social">Social</option><option value="secure">Secure</option></select></label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="file" accept="image/*" onChange={handleUploadGalleryImage} disabled={galleryBusy} /></label>
              </div>
            ) : <p className="text-sm text-gray-600">Browse gallery items and react with like/dislike.</p>}
            {galleryError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{galleryError}</div> : null}
            {galleryLoading ? <div className="rounded-xl border bg-slate-50 p-4 text-sm text-gray-500">Loading gallery…</div> : galleryItems.length === 0 ? <div className="rounded-xl border bg-slate-50 p-4 text-sm text-gray-500">No gallery images yet.</div> : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {galleryItems.map((image) => {
                  const viewerReaction = image.viewerReaction || null;
                  const imageBusy = Boolean(galleryActionLoadingByImage[image._id]);
                  const editState = galleryEditById[image._id] || null;
                  return (
                    <article key={image._id} className="overflow-hidden rounded-2xl border bg-white">
                      <img src={image.mediaUrl} alt="Gallery item" className="h-48 w-full object-cover" />
                      <div className="space-y-2 p-3">
                        {image.caption ? <p className="whitespace-pre-wrap text-sm text-gray-700">{image.caption}</p> : null}
                        <p className="text-xs font-medium text-gray-500">Audience: {RELATIONSHIP_AUDIENCE_LABELS[image.relationshipAudience] || RELATIONSHIP_AUDIENCE_LABELS.social}</p>
                        <div className="flex items-center gap-2 text-sm">
                          <button type="button" onClick={() => handleGalleryReaction(image._id, 'like')} disabled={!viewerCanReact || imageBusy} className={`rounded-lg border px-2 py-1 ${viewerReaction === 'like' ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 hover:bg-gray-50'}`}>👍 {image.likesCount || 0}</button>
                          <button type="button" onClick={() => handleGalleryReaction(image._id, 'dislike')} disabled={!viewerCanReact || imageBusy} className={`rounded-lg border px-2 py-1 ${viewerReaction === 'dislike' ? 'border-red-600 bg-red-600 text-white' : 'border-gray-300 hover:bg-gray-50'}`}>👎 {image.dislikesCount || 0}</button>
                        </div>
                        {canManageGallery ? (
                          <div className="space-y-2 border-t pt-2">
                            {editState ? (
                              <div className="space-y-2">
                                {image.mediaType === 'url' ? <input type="url" value={editState.mediaUrl} onChange={(event) => handleEditGalleryField(image._id, 'mediaUrl', event.target.value)} placeholder="https://example.com/photo.jpg" className="w-full rounded-xl border px-2 py-1 text-sm" /> : null}
                                <input type="text" value={editState.caption} onChange={(event) => handleEditGalleryField(image._id, 'caption', event.target.value)} placeholder="Caption" maxLength={280} className="w-full rounded-xl border px-2 py-1 text-sm" />
                                <div className="flex gap-2">
                                  <button type="button" onClick={() => handleSaveGalleryItem(image)} disabled={imageBusy} className="rounded-lg bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-60">Save</button>
                                  <button type="button" onClick={() => handleCancelEditGalleryItem(image._id)} disabled={imageBusy} className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50">Cancel</button>
                                </div>
                              </div>
                            ) : <button type="button" onClick={() => handleStartEditGalleryItem(image)} disabled={imageBusy} className="text-xs text-blue-600 hover:text-blue-700">Edit image</button>}
                            <button type="button" onClick={() => handleRemoveGalleryImage(image._id)} disabled={imageBusy} className="text-xs text-red-600 hover:text-red-700 disabled:opacity-60">Remove image</button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        );
      case 'chat_panel':
        return (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">Jump into direct or room conversations without leaving the social experience.</p>
            <Link to="/chat" className="inline-flex w-full items-center justify-center rounded-xl bg-gray-900 px-4 py-2 text-white hover:bg-gray-800">Open Chat</Link>
          </div>
        );
      case 'top_friends':
        return topFriends.length === 0 ? (
          <p className="text-sm text-gray-600">Top friends are private or not set yet.</p>
        ) : (
          <ul className="space-y-3 text-sm text-gray-700">
            {topFriends.slice(0, 5).map((friend, index) => (
              <li key={friend._id || friend.username} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">@{friend.username}</p>
                    {friend.realName ? <p className="text-xs text-gray-500">{friend.realName}</p> : null}
                  </div>
                  <span className="rounded-full bg-amber-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900">Top {index + 1}</span>
                </div>
              </li>
            ))}
          </ul>
        );
      case 'community_notes':
        return (
          <div className="space-y-3 text-sm text-gray-700">
            <ul className="list-disc space-y-2 pl-5">
              <li>Keep posts constructive and clear.</li>
              <li>Use visibility settings to control reach.</li>
              <li>Switch to chat for real-time discussion.</li>
            </ul>
            {!isOwnSocialContext && sharedDesigns.length > 0 ? (
              <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Design sharing</p>
                <p className="mt-1 text-sm text-violet-900">This creator shared {sharedDesigns.length} design configuration{sharedDesigns.length === 1 ? '' : 's'}.</p>
              </div>
            ) : null}
          </div>
        );
      default:
        return <div className="text-sm text-slate-500">{SOCIAL_PANEL_LABELS[panelId] || panelId}</div>;
    }
  };

  const renderPanel = (panel) => {
    if (!panel) return null;
    const normalizedSize = panel.size === 'quarterTile'
      ? 'halfCol'
      : panel.size === 'halfTile'
        ? 'oneCol'
        : panel.size === 'fullTile'
          ? 'twoCols'
          : panel.size;
    const widthUnits = PANEL_WIDTH_UNITS_BY_SIZE[normalizedSize] || 8;
    const heightUnits = PANEL_HEIGHT_UNITS_BY_SIZE[panel.height] || 2;
    const hasMainGridPlacement = panel.area === 'main'
      && Number.isFinite(Number(panel.gridPlacement?.row))
      && Number.isFinite(Number(panel.gridPlacement?.col));
    const rowSpan = panel.height === 'halfRow'
      ? 'md:[grid-row:span_1/span_1]'
      : panel.height === 'twoRows'
        ? 'md:[grid-row:span_4/span_4]'
        : panel.height === 'threeRows'
          ? 'md:[grid-row:span_6/span_6]'
          : panel.height === 'fourRows'
            ? 'md:[grid-row:span_8/span_8]'
            : 'md:[grid-row:span_2/span_2]';
    const sideHeightClass = panel.height === 'halfRow'
      ? 'min-h-[7rem]'
      : panel.height === 'twoRows'
        ? 'min-h-[16rem]'
        : panel.height === 'fourRows'
          ? 'min-h-[30rem]'
          : 'min-h-[11rem]';
    const className = panel.area === 'main'
      ? hasMainGridPlacement
        ? 'md:[grid-column:var(--panel-col)_/_span_var(--panel-width)] md:[grid-row:var(--panel-row)_/_span_var(--panel-height)]'
        : `${normalizedSize === 'halfCol' ? 'md:col-span-1' : normalizedSize === 'oneCol' ? 'md:col-span-2' : normalizedSize === 'twoCols' ? 'md:col-span-4' : normalizedSize === 'threeCols' ? 'md:col-span-6' : 'md:col-span-8'} ${rowSpan}`
      : panel.area === 'sideLeft' || panel.area === 'sideRight'
        ? sideHeightClass
        : '';
    const style = hasMainGridPlacement
      ? {
        '--panel-col': Number(panel.gridPlacement.col) + 1,
        '--panel-row': Number(panel.gridPlacement.row) + 1,
        '--panel-width': widthUnits,
        '--panel-height': heightUnits
      }
      : {};

    return (
      <SocialEditablePanel
        key={panel.id}
        panelId={panel.id}
        title={SOCIAL_PANEL_LABELS[panel.id] || panel.id}
        panel={panel}
        isOwnerEditing={ownerEditingEnabled}
        isInlineEditing={inlineEditingPanelId === panel.id}
        onToggleInlineEdit={() => setInlineEditingPanelId((prev) => (prev === panel.id ? '' : panel.id))}
        onPanelChange={(patch) => updatePanelPreferences(panel.id, patch)}
        onMove={(direction) => movePanel(panel.id, direction)}
        className={className}
        style={style}
      >
        {renderPanelBody(panel.id)}
      </SocialEditablePanel>
    );
  };

  return (
    <div
      className={`relative left-1/2 right-1/2 min-h-[calc(100vh-9rem)] w-screen -translate-x-1/2 space-y-6 px-3 py-4 sm:px-4 ${pageThemeClass}`}
      style={{ backgroundColor: socialPreferences.globalStyles?.pageBackgroundColor }}
    >
      {ownerEditingEnabled ? (
        <button
          type="button"
          onClick={() => setDesignStudioOpen(true)}
          className="fixed right-4 top-1/2 z-30 -translate-y-1/2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl hover:bg-slate-800"
        >
          ✎ Edit
        </button>
      ) : null}

      <div className="space-y-6">
        {ownerEditingEnabled ? (
          <SocialArchitectureBlueprint
            activePanelCount={activePanelCount}
            currentThemePreset={socialPreferences.themePreset}
            currentFontFamily={socialPreferences.globalStyles.fontFamily}
          />
        ) : null}

        {panelsByArea.top.map(renderPanel)}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(240px,0.95fr)_minmax(0,2fr)_minmax(240px,0.95fr)]">
          <div className="space-y-6">{panelsByArea.sideLeft.map(renderPanel)}</div>
          <div className="grid grid-cols-1 gap-6 md:auto-rows-[5.5rem] md:grid-cols-12">{panelsByArea.main.map(renderPanel)}</div>
          <div className="space-y-6">{panelsByArea.sideRight.map(renderPanel)}</div>
        </div>
      </div>

      <SocialDesignStudioModal
        isOpen={designStudioOpen}
        onClose={() => setDesignStudioOpen(false)}
        preferences={socialPreferences}
        configs={socialConfigs}
        activeConfigId={activeDesignConfigId}
        sharedDesigns={sharedDesigns}
        favoriteDesigns={favoriteDesigns}
        layoutPresets={layoutPresets}
        onApplyTemplate={applyTemplate}
        onApplyLayoutPreset={(preset) => applyLayoutPreset(preset, editorLayoutMode)}
        onGlobalStylesChange={updateGlobalStyles}
        onPanelOverrideToggle={(panelId, enabled) => updatePanelPreferences(panelId, buildPanelOverridePatch(enabled), editorLayoutMode)}
        onPanelStyleChange={(panelId, patch) => updatePanelPreferences(panelId, { useCustomStyles: true, styles: patch }, editorLayoutMode)}
        onPanelLayoutChange={(panelId, patch) => updatePanelPreferences(panelId, patch, editorLayoutMode)}
        layoutMode={editorLayoutMode}
        onLayoutModeChange={(mode) => setEditorLayoutMode(mode)}
        onSaveChanges={saveDraftPreferences}
        onCancelChanges={cancelDraftPreferences}
        hasUnsavedChanges={hasUnsavedDesignChanges}
        onCreateConfig={saveNewConfig}
        onUpdateConfig={saveConfigUpdate}
        onApplyConfig={applySavedConfig}
        onDuplicateConfig={duplicateConfig}
        onDeleteConfig={deleteConfig}
        onFavoriteShared={toggleFavoriteSharedDesign}
        onCloneShared={cloneSharedDesign}
        busy={designBusy}
        error={designError}
        successMessage={designSuccessMessage}
      />

      <ReportModal
        isOpen={reportModalState.isOpen}
        targetType={reportModalState.targetType}
        targetId={reportModalState.targetId}
        targetUserId={reportModalState.targetUserId}
        onClose={closeReportModal}
        onSubmit={submitReport}
      />
    </div>
  );
};

export default Social;
