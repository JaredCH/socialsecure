import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI, calendarAPI, chatAPI, circlesAPI, discoveryAPI, feedAPI, friendsAPI, galleryAPI, moderationAPI, resumeAPI, socialPageAPI } from '../utils/api';
import PrivacySelector from '../components/PrivacySelector';
import CircleManager from '../components/CircleManager';
import ReportModal from '../components/ReportModal';
import BlockButton from '../components/BlockButton';
import TypingIndicator from '../components/TypingIndicator';
import SocialHero from '../components/social/SocialHero';
import SocialStageSettingsSidebar from '../components/social/SocialStageSettingsSidebar';
import CircleSpiderDiagram from '../components/social/CircleSpiderDiagram';
import {
  getFontSizeClass,
  mergeDesignPatch,
  normalizeSocialPreferences as normalizePageDesign,
  SOCIAL_DESIGN_TEMPLATES,
  SOCIAL_LAYOUT_PRESETS,
  SOCIAL_PANEL_LABELS,
  SOCIAL_HERO_TABS,
  SOCIAL_FONT_FAMILIES,
  SOCIAL_THEME_PRESETS
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
const HERO_IMAGE_HISTORY_LIMIT = 3;
const HERO_RANDOM_BACKGROUND_ROTATION_INTERVAL_MS = 12000;
const FEED_POLL_INTERVAL_MS = 30000;
const TOP_FRIENDS_LIMIT = 5;
const TYPING_TIMEOUT_MS = 900;
const REMOTE_TYPING_TTL_MS = 3000;
const MAX_UPCOMING_CALENDAR_ITEMS = 6;
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
const PROFILE_CHAT_ROLE_OPTIONS = [
  { value: 'friends', label: 'Friends' },
  { value: 'circles', label: 'Circles' },
  { value: 'guests', label: 'Guests' }
];

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
const STAGE_THEME_LABELS = {
  default: 'Default',
  light: 'Light',
  dark: 'Dark',
  sunset: 'Sunset',
  forest: 'Forest'
};
const STAGE_THEME_OPTIONS = SOCIAL_THEME_PRESETS.map((value) => ({
  value,
  label: STAGE_THEME_LABELS[value] || value
}));
const STAGE_THEME_STYLE_PATCH = {
  default: {
    accentColorToken: 'blue',
    globalStyles: { pageBackgroundColor: '#f8fafc', panelColor: '#ffffff', fontColor: '#0f172a', headerColor: '#1d4ed8' },
    heroColor: '#2563eb'
  },
  light: {
    accentColorToken: 'blue',
    globalStyles: { pageBackgroundColor: '#ffffff', panelColor: '#ffffff', fontColor: '#0f172a', headerColor: '#2563eb' },
    heroColor: '#3b82f6'
  },
  dark: {
    accentColorToken: 'emerald',
    globalStyles: { pageBackgroundColor: '#020617', panelColor: '#0f172a', fontColor: '#e2e8f0', headerColor: '#10b981' },
    heroColor: '#10b981'
  },
  sunset: {
    accentColorToken: 'rose',
    globalStyles: { pageBackgroundColor: '#fff7ed', panelColor: '#ffedd5', fontColor: '#7c2d12', headerColor: '#f97316' },
    heroColor: '#f97316'
  },
  forest: {
    accentColorToken: 'emerald',
    globalStyles: { pageBackgroundColor: '#ecfdf5', panelColor: '#d1fae5', fontColor: '#14532d', headerColor: '#059669' },
    heroColor: '#059669'
  }
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

const buildRecentImageHistory = (previousValue, nextValue, existing = []) => {
  const normalizedPrevious = typeof previousValue === 'string' ? previousValue.trim() : '';
  const normalizedNext = typeof nextValue === 'string' ? nextValue.trim() : '';
  const seen = new Set();
  const history = [];
  const append = (url) => {
    if (!isRenderableMediaUrl(url)) return;
    const key = url.toLowerCase();
    if (key === normalizedNext.toLowerCase() || seen.has(key)) return;
    seen.add(key);
    history.push(url);
  };

  if (normalizedPrevious) {
    append(normalizedPrevious);
  }
  existing.forEach((url) => append(typeof url === 'string' ? url.trim() : ''));
  return history.slice(0, HERO_IMAGE_HISTORY_LIMIT);
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

const CALENDAR_PREVIEW_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getCalendarWeekStart = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const buildCalendarPreviewMonthGrid = (anchorDate) => {
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const gridStart = getCalendarWeekStart(monthStart);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
};

const formatCalendarDayKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createHolidayEntry = (year, monthIndex, day, name, category) => {
  const date = new Date(year, monthIndex, day);
  return {
    id: `${category}-${name}-${formatCalendarDayKey(date)}`,
    name,
    category,
    date,
    dayKey: formatCalendarDayKey(date),
  };
};

const nthWeekdayOfMonth = (year, monthIndex, weekday, occurrence) => {
  const firstDay = new Date(year, monthIndex, 1);
  const dayOffset = (weekday - firstDay.getDay() + 7) % 7;
  return 1 + dayOffset + ((occurrence - 1) * 7);
};

const lastWeekdayOfMonth = (year, monthIndex, weekday) => {
  const lastDay = new Date(year, monthIndex + 1, 0);
  const dayOffset = (lastDay.getDay() - weekday + 7) % 7;
  return lastDay.getDate() - dayOffset;
};

const buildHolidayEntriesForYear = (year) => {
  const international = [
    createHolidayEntry(year, 0, 1, 'New Year\'s Day', 'international'),
    createHolidayEntry(year, 2, 8, 'International Women\'s Day', 'international'),
    createHolidayEntry(year, 3, 22, 'Earth Day', 'international'),
    createHolidayEntry(year, 4, 1, 'International Workers\' Day', 'international'),
    createHolidayEntry(year, 9, 24, 'United Nations Day', 'international'),
    createHolidayEntry(year, 11, 10, 'Human Rights Day', 'international'),
  ];

  const usFederal = [
    createHolidayEntry(year, 0, 1, 'US: New Year\'s Day', 'government'),
    createHolidayEntry(year, 0, nthWeekdayOfMonth(year, 0, 1, 3), 'US: Martin Luther King Jr. Day', 'government'),
    createHolidayEntry(year, 1, nthWeekdayOfMonth(year, 1, 1, 3), 'US: Presidents\' Day', 'government'),
    createHolidayEntry(year, 4, lastWeekdayOfMonth(year, 4, 1), 'US: Memorial Day', 'government'),
    createHolidayEntry(year, 5, 19, 'US: Juneteenth', 'government'),
    createHolidayEntry(year, 6, 4, 'US: Independence Day', 'government'),
    createHolidayEntry(year, 8, nthWeekdayOfMonth(year, 8, 1, 1), 'US: Labor Day', 'government'),
    createHolidayEntry(year, 9, nthWeekdayOfMonth(year, 9, 1, 2), 'US: Columbus Day', 'government'),
    createHolidayEntry(year, 10, 11, 'US: Veterans Day', 'government'),
    createHolidayEntry(year, 10, nthWeekdayOfMonth(year, 10, 4, 4), 'US: Thanksgiving Day', 'government'),
    createHolidayEntry(year, 11, 25, 'US: Christmas Day', 'government'),
  ];

  return [...international, ...usFederal];
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

const resolveInitialHeroTab = (pathname = '', search = '') => {
  const requestedTab = new URLSearchParams(search).get('tab');
  if (SOCIAL_HERO_TABS.some((tab) => tab.id === requestedTab)) {
    return requestedTab;
  }
  if (pathname === '/friends') {
    return 'friends';
  }
  return 'main';
};

const Social = () => {
  const navigate = useNavigate();
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
  const [heroRandomBackgroundImage, setHeroRandomBackgroundImage] = useState('');
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
  const [draftTopFriendIds, setDraftTopFriendIds] = useState([]);
  const [inlineEditingPanelId, setInlineEditingPanelId] = useState('');
  const [activeHeroTab, setActiveHeroTab] = useState(() => resolveInitialHeroTab(window.location.pathname, window.location.search));
  const [heroEditingOpen, setHeroEditingOpen] = useState(false);
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
  const [profileChatThreadId, setProfileChatThreadId] = useState('');
  const [profileChatMessages, setProfileChatMessages] = useState([]);
  const [profileChatLoading, setProfileChatLoading] = useState(false);
  const [profileChatError, setProfileChatError] = useState('');
  const [profileChatInput, setProfileChatInput] = useState('');
  const [profileChatSending, setProfileChatSending] = useState(false);
  const [profileChatPermissions, setProfileChatPermissions] = useState({ isOwner: false, canRead: false, canWrite: false });
  const [profileChatAccess, setProfileChatAccess] = useState({ readRoles: ['friends', 'circles'], writeRoles: ['friends', 'circles'] });
  const [profileChatAccessDraft, setProfileChatAccessDraft] = useState({ readRoles: ['friends', 'circles'], writeRoles: ['friends', 'circles'] });
  const [profileChatSavingAccess, setProfileChatSavingAccess] = useState(false);
  const [calendarPreviewEvents, setCalendarPreviewEvents] = useState([]);
  const [calendarPreviewLoading, setCalendarPreviewLoading] = useState(false);
  const [calendarPreviewError, setCalendarPreviewError] = useState('');
  const [calendarPreviewOwnerVisibility, setCalendarPreviewOwnerVisibility] = useState('private');
  const [calendarPreviewShowsOwnerEvents, setCalendarPreviewShowsOwnerEvents] = useState(false);
  const [calendarPreviewAnchorDate, setCalendarPreviewAnchorDate] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [partnerActionBusyFriendshipId, setPartnerActionBusyFriendshipId] = useState('');
  const [partnerActionError, setPartnerActionError] = useState('');
  const [composerVisible, setComposerVisible] = useState(false);
  const [showSlimHeader, setShowSlimHeader] = useState(false);
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
  const galleryImageUrls = useMemo(
    () => galleryItems.map((item) => item.mediaUrl).filter((url) => isRenderableMediaUrl(url)),
    [galleryItems]
  );
  const isHeroRandomGalleryEnabled = Boolean(socialPreferences.hero?.backgroundImageUseRandomGallery);
  const resolvedHeroBackgroundImage = useMemo(() => {
    if (isHeroRandomGalleryEnabled && galleryImageUrls.length > 0) {
      return heroRandomBackgroundImage || galleryImageUrls[0];
    }
    return socialPreferences.hero?.backgroundImage || '';
  }, [isHeroRandomGalleryEnabled, galleryImageUrls, heroRandomBackgroundImage, socialPreferences.hero?.backgroundImage]);
  const heroConfig = useMemo(
    () => ({ ...(socialPreferences.hero || {}), backgroundImage: resolvedHeroBackgroundImage || null }),
    [socialPreferences.hero, resolvedHeroBackgroundImage]
  );

  useEffect(() => {
    if (!isHeroRandomGalleryEnabled || galleryImageUrls.length === 0) {
      setHeroRandomBackgroundImage('');
      return undefined;
    }

    setHeroRandomBackgroundImage((prev) => {
      if (galleryImageUrls.length === 1) return galleryImageUrls[0];
      if (galleryImageUrls.includes(prev)) return prev;
      return galleryImageUrls[Math.floor(Math.random() * galleryImageUrls.length)];
    });

    const intervalId = window.setInterval(() => {
      setHeroRandomBackgroundImage((prev) => {
        if (galleryImageUrls.length === 1) return galleryImageUrls[0];
        const options = galleryImageUrls.filter((url) => url !== prev);
        const pool = options.length > 0 ? options : galleryImageUrls;
        return pool[Math.floor(Math.random() * pool.length)];
      });
    }, HERO_RANDOM_BACKGROUND_ROTATION_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isHeroRandomGalleryEnabled, galleryImageUrls]);

  const heroProfile = useMemo(() => {
    const profileSource = activeProfile || currentUser || {};
    const locationLabel = [profileSource?.city, profileSource?.state, profileSource?.country]
      .filter(Boolean)
      .join(', ');

    return {
      name: profileSource?.realName || profileSource?.name || profileSource?.username || 'User',
      location: locationLabel || profileSource?.location || '',
      avatarUrl: socialPreferences.hero?.profileImage || profileSource?.avatarUrl || '',
      isOnline: Boolean(isOwnSocialContext),
      lastActive: profileSource?.lastActive || null
    };
  }, [activeProfile, currentUser, isOwnSocialContext, socialPreferences.hero?.profileImage]);
  const isPrivateGuestLock = !isOwnSocialContext && Boolean(activeProfile?.isPrivateProfile);
  const socialCalendarPath = useMemo(() => {
    const calendarUsername = activeProfile?.username || requestedProfileIdentifier;
    if (!calendarUsername || isOwnSocialContext) {
      return '/calendar';
    }
    return `/calendar?user=${encodeURIComponent(calendarUsername)}`;
  }, [activeProfile?.username, requestedProfileIdentifier, isOwnSocialContext]);
  const handleHeroTabChange = useCallback((tabId) => {
    if (tabId === 'calendar' && !isOwnSocialContext) {
      navigate(socialCalendarPath);
      return;
    }
    setActiveHeroTab(tabId);
  }, [isOwnSocialContext, navigate, socialCalendarPath]);
  const socialChatPath = useMemo(() => {
    if (isAuthenticated && !isOwnSocialContext && activeProfile?._id) {
      return `/chat?profile=${encodeURIComponent(String(activeProfile._id))}`;
    }
    return '/chat';
  }, [isAuthenticated, isOwnSocialContext, activeProfile?._id]);
  const socialFriendsPath = useMemo(() => {
    const friendsUsername = activeProfile?.username || requestedProfileIdentifier;
    if (!friendsUsername || isOwnSocialContext) {
      return '/friends';
    }
    return `/friends?user=${encodeURIComponent(friendsUsername)}`;
  }, [activeProfile?.username, requestedProfileIdentifier, isOwnSocialContext]);
  const socialChatLabel = !isOwnSocialContext && activeProfile?.username
    ? `Message @${activeProfile.username}`
    : 'Open chat';
  const profileChatAccessSummary = useMemo(() => {
    const readLabels = profileChatAccess.readRoles.map((role) => PROFILE_CHAT_ROLE_OPTIONS.find((option) => option.value === role)?.label || role);
    const writeLabels = profileChatAccess.writeRoles.map((role) => PROFILE_CHAT_ROLE_OPTIONS.find((option) => option.value === role)?.label || role);
    return {
      read: readLabels.join(', ') || 'Friends, Circles',
      write: writeLabels.join(', ') || 'Friends, Circles'
    };
  }, [profileChatAccess]);

  const toggleProfileChatRole = useCallback((field, role) => {
    setProfileChatAccessDraft((prev) => {
      const current = Array.isArray(prev[field]) ? prev[field] : [];
      const hasRole = current.includes(role);
      const nextRoles = hasRole ? current.filter((entry) => entry !== role) : [...current, role];
      return {
        ...prev,
        [field]: nextRoles.length > 0 ? nextRoles : current
      };
    });
  }, []);

  useEffect(() => {
    const loadProfileChatThread = async () => {
      if (!activeProfile?._id) {
        setProfileChatThreadId('');
        setProfileChatMessages([]);
        setProfileChatPermissions({ isOwner: false, canRead: false, canWrite: false });
        setProfileChatError('');
        return;
      }

      setProfileChatLoading(true);
      setProfileChatError('');
      try {
        const { data } = await chatAPI.getProfileThread(activeProfile._id);
        const thread = data?.conversation || {};
        const threadId = thread?._id ? String(thread._id) : '';
        const nextAccess = {
          readRoles: Array.isArray(thread?.profileThreadAccess?.readRoles) ? thread.profileThreadAccess.readRoles : ['friends', 'circles'],
          writeRoles: Array.isArray(thread?.profileThreadAccess?.writeRoles) ? thread.profileThreadAccess.writeRoles : ['friends', 'circles']
        };
        setProfileChatThreadId(threadId);
        setProfileChatAccess(nextAccess);
        setProfileChatAccessDraft(nextAccess);
        setProfileChatPermissions({
          isOwner: Boolean(thread?.permissions?.isOwner),
          canRead: Boolean(thread?.permissions?.canRead),
          canWrite: Boolean(thread?.permissions?.canWrite)
        });

        if (!threadId || !thread?.permissions?.canRead) {
          setProfileChatMessages([]);
          return;
        }

        const { data: messageData } = await chatAPI.getConversationMessages(threadId, 1, 25);
        setProfileChatMessages(Array.isArray(messageData?.messages) ? messageData.messages : []);
      } catch (error) {
        setProfileChatThreadId('');
        setProfileChatMessages([]);
        setProfileChatPermissions({ isOwner: false, canRead: false, canWrite: false });
        setProfileChatError(error.response?.data?.error || 'Unable to load profile chat room.');
      } finally {
        setProfileChatLoading(false);
      }
    };

    loadProfileChatThread();
  }, [activeProfile?._id]);

  useEffect(() => {
    const loadCalendarPreview = async () => {
      if (activeHeroTab !== 'calendar' || isPrivateGuestLock) {
        return;
      }

      const calendarUsername = isOwnSocialContext
        ? currentUser?.username
        : (activeProfile?.username || requestedProfileIdentifier);
      if (!calendarUsername) {
        setCalendarPreviewEvents([]);
        setCalendarPreviewError('');
        setCalendarPreviewOwnerVisibility('private');
        setCalendarPreviewShowsOwnerEvents(false);
        return;
      }

      const monthGrid = buildCalendarPreviewMonthGrid(calendarPreviewAnchorDate);
      const rangeStart = monthGrid[0];
      const rangeEnd = new Date(monthGrid[monthGrid.length - 1]);
      rangeEnd.setDate(rangeEnd.getDate() + 1);

      setCalendarPreviewLoading(true);
      setCalendarPreviewError('');
      try {
        const params = { from: rangeStart.toISOString(), to: rangeEnd.toISOString() };
        let response = null;

        if (isOwnSocialContext && isAuthenticated) {
          setCalendarPreviewOwnerVisibility('private');
          setCalendarPreviewShowsOwnerEvents(true);
          response = await calendarAPI.getMyEvents(params);
        } else {
          const { data: calendarMeta } = await calendarAPI.getUserCalendar(calendarUsername);
          const ownerGuestVisibility = calendarMeta?.calendar?.guestVisibility || 'private';
          const viewerIsOwner = Boolean(calendarMeta?.isOwner);
          setCalendarPreviewOwnerVisibility(ownerGuestVisibility);
          setCalendarPreviewShowsOwnerEvents(viewerIsOwner || ownerGuestVisibility !== 'private');
          response = await calendarAPI.getUserCalendarEvents(calendarUsername, params);
        }

        const nextEvents = Array.isArray(response.data?.events) ? response.data.events : [];
        setCalendarPreviewEvents(nextEvents);
      } catch (error) {
        setCalendarPreviewEvents([]);
        setCalendarPreviewShowsOwnerEvents(false);
        const statusCode = Number(error?.response?.status || 0);
        if (statusCode === 403) {
          setCalendarPreviewError('This owner has hidden calendar events for your current access level.');
        } else {
          setCalendarPreviewError(error.response?.data?.error || 'Unable to load calendar preview.');
        }
      } finally {
        setCalendarPreviewLoading(false);
      }
    };

    loadCalendarPreview();
  }, [
    activeHeroTab,
    isPrivateGuestLock,
    isOwnSocialContext,
    isAuthenticated,
    currentUser?.username,
    activeProfile?.username,
    requestedProfileIdentifier,
    calendarPreviewAnchorDate
  ]);

  const handleSendProfileChatMessage = useCallback(async () => {
    const content = profileChatInput.trim();
    if (!content || !profileChatThreadId || profileChatSending || !profileChatPermissions.canWrite) return;
    setProfileChatSending(true);
    setProfileChatError('');
    try {
      const { data } = await chatAPI.sendConversationMessage(profileChatThreadId, { content });
      if (data?.message) {
        setProfileChatMessages((prev) => [...prev, data.message]);
      }
      setProfileChatInput('');
    } catch (error) {
      setProfileChatError(error.response?.data?.error || 'Failed to send message.');
    } finally {
      setProfileChatSending(false);
    }
  }, [profileChatInput, profileChatThreadId, profileChatSending, profileChatPermissions.canWrite]);

  const handleSaveProfileChatAccess = useCallback(async () => {
    if (!profileChatPermissions.isOwner || !activeProfile?._id) return;
    setProfileChatSavingAccess(true);
    setProfileChatError('');
    try {
      const payload = {
        readRoles: profileChatAccessDraft.readRoles,
        writeRoles: profileChatAccessDraft.writeRoles
      };
      const { data } = await chatAPI.updateProfileThreadSettings(activeProfile._id, payload);
      const savedAccess = {
        readRoles: Array.isArray(data?.conversation?.profileThreadAccess?.readRoles) ? data.conversation.profileThreadAccess.readRoles : payload.readRoles,
        writeRoles: Array.isArray(data?.conversation?.profileThreadAccess?.writeRoles) ? data.conversation.profileThreadAccess.writeRoles : payload.writeRoles
      };
      setProfileChatAccess(savedAccess);
      setProfileChatAccessDraft(savedAccess);
      setProfileChatPermissions((prev) => ({
        ...prev,
        isOwner: data?.conversation?.permissions?.isOwner ?? true,
        canRead: data?.conversation?.permissions?.canRead ?? true,
        canWrite: data?.conversation?.permissions?.canWrite ?? true
      }));
    } catch (error) {
      setProfileChatError(error.response?.data?.error || 'Failed to save chat access settings.');
    } finally {
      setProfileChatSavingAccess(false);
    }
  }, [profileChatPermissions.isOwner, activeProfile?._id, profileChatAccessDraft]);

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
  const draftTopFriends = useMemo(() => {
    const lookup = new Map();
    [...topFriends, ...friends].forEach((friend) => {
      if (friend?._id) {
        lookup.set(String(friend._id), friend);
      }
    });
    return draftTopFriendIds
      .map((friendId) => lookup.get(String(friendId)))
      .filter(Boolean);
  }, [draftTopFriendIds, topFriends, friends]);

  useEffect(() => {
    setDraftTopFriendIds(topFriends.slice(0, TOP_FRIENDS_LIMIT).map((friend) => String(friend._id)));
  }, [topFriends]);

  const trackSocialEvent = useCallback((eventType, metadata = {}) => {
    if (!isAuthenticated) return;
    discoveryAPI.trackEvent(eventType, metadata).catch(() => {});
  }, [isAuthenticated]);

  const handleGuestPreviewToggle = (enabled) => {
    setIsGuestPreview(enabled);
    trackSocialEvent('social_guest_preview_toggled', { enabled });
  };

  const handlePartnerListingAction = async (friendshipId, action) => {
    const normalizedFriendshipId = String(friendshipId || '').trim();
    if (!normalizedFriendshipId || !isOwnSocialContext || isGuestPreview) return;
    setPartnerActionBusyFriendshipId(normalizedFriendshipId);
    setPartnerActionError('');
    try {
      const response = await friendsAPI.updatePartnerStatus(normalizedFriendshipId, action);
      const partner = response.data?.partner || {};
      const nextStatus = ['none', 'pending', 'accepted'].includes(partner.status) ? partner.status : 'none';
      const requestedByViewer = Boolean(partner.requestedByViewer);
      const requestedAt = partner.requestedAt || null;
      setFriends((prev) => prev.map((friend) => {
        if (String(friend.friendshipId || '') !== normalizedFriendshipId) {
          return friend;
        }
        return {
          ...friend,
          partnerStatus: nextStatus,
          partnerRequestedByViewer: requestedByViewer,
          partnerCanRespond: nextStatus === 'pending' && !requestedByViewer,
          partnerRequestedAt: requestedAt
        };
      }));
    } catch (error) {
      setPartnerActionError(error.response?.data?.error || 'Failed to update partner listing.');
    } finally {
      setPartnerActionBusyFriendshipId('');
    }
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

    if (isPrivateGuestLock) {
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
  }, [galleryOwnerIdentifier, isPrivateGuestLock]);

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
      setCircles([]);
      setFriends([]);
      setFeedError('Enter a username or user ID in Guest mode to view a public feed.');
      return;
    }

    const [response, circlesResponse] = await Promise.all([
      feedAPI.getPublicUserFeed(guestUser.trim()),
      friendsAPI.getPublicCircles(guestUser.trim()).catch(() => ({ data: { circles: [] } }))
    ]);
    const publicPosts = Array.isArray(response.data?.posts) ? response.data.posts : [];
    setPosts(publicPosts.map(normalizePost));
    setGuestProfile(response.data?.user || null);
    setCircles(Array.isArray(circlesResponse.data?.circles) ? circlesResponse.data.circles : []);
    setFriends([]);
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
    if (!isAuthenticated || !galleryOwnerIdentifier || isPrivateGuestLock) {
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
  }, [isAuthenticated, galleryOwnerIdentifier, isPrivateGuestLock]);

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

  useEffect(() => {
    if (isGuestPreview || !isOwnSocialContext || activeHeroTab !== 'main') {
      setComposerVisible(false);
    }
  }, [activeHeroTab, isGuestPreview, isOwnSocialContext]);

  useEffect(() => {
    const handleScroll = () => {
      const shouldShow = window.innerWidth >= 1024 && window.scrollY > 240;
      setShowSlimHeader((prev) => (prev === shouldShow ? prev : shouldShow));
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

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

  const markCustomizerDirty = useCallback(() => {
    setDesignError('');
    setDesignSuccessMessage('');
    designDirtyRef.current = true;
    setHasUnsavedDesignChanges(true);
  }, []);

  const toggleDraftTopFriend = useCallback((friendId) => {
    const normalizedId = String(friendId || '');
    if (!normalizedId) return;

    setDraftTopFriendIds((prev) => {
      if (prev.includes(normalizedId)) {
        markCustomizerDirty();
        return prev.filter((id) => id !== normalizedId);
      }
      if (prev.length >= TOP_FRIENDS_LIMIT) {
        setDesignError(`Select up to ${TOP_FRIENDS_LIMIT} Top Friends.`);
        return prev;
      }
      markCustomizerDirty();
      return [...prev, normalizedId];
    });
  }, [markCustomizerDirty]);

  const moveDraftTopFriend = useCallback((index, direction) => {
    setDraftTopFriendIds((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (index < 0 || index >= next.length || targetIndex < 0 || targetIndex >= next.length) {
        return prev;
      }
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      markCustomizerDirty();
      return next;
    });
  }, [markCustomizerDirty]);

  const saveDraftPreferences = useCallback(async () => {
    if (!isOwnSocialContext || !designDirtyRef.current) return;
    const currentTopFriendIds = topFriends.slice(0, TOP_FRIENDS_LIMIT).map((friend) => String(friend._id));
    const topFriendsChanged = JSON.stringify(currentTopFriendIds) !== JSON.stringify(draftTopFriendIds);
    if (!draftSocialPreferences && !topFriendsChanged) return;
    setDesignBusy(true);
    setDesignError('');
    try {
      let savedPreferences = draftSocialPreferences;

      if (draftSocialPreferences) {
        const response = await socialPageAPI.savePreferences(draftSocialPreferences, true);
        savedPreferences = normalizeSocialPreferences(
          response.data?.preferences || draftSocialPreferences,
          currentUser?.profileTheme || activeProfile?.profileTheme || 'default',
          activeLayoutMode
        );
        setCurrentUser((prev) => (prev ? { ...prev, socialPagePreferences: savedPreferences } : prev));
        setDraftSocialPreferences(savedPreferences);
        setActiveDesignConfigId(savedPreferences.activeConfigId || null);
      }

      if (topFriendsChanged) {
        const topFriendsResponse = await friendsAPI.updateTopFriends(draftTopFriendIds);
        setTopFriends(Array.isArray(topFriendsResponse.data?.topFriends) ? topFriendsResponse.data.topFriends : []);
      }

      setDesignSuccessMessage('Stage settings saved');
      designDirtyRef.current = false;
      setHasUnsavedDesignChanges(false);
      setDesignStudioOpen(false);
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to save social page customization.');
    } finally {
      setDesignBusy(false);
    }
  }, [
    isOwnSocialContext,
    draftSocialPreferences,
    draftTopFriendIds,
    topFriends,
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
    setDraftTopFriendIds(topFriends.slice(0, TOP_FRIENDS_LIMIT).map((friend) => String(friend._id)));
    setDesignError('');
    setDesignSuccessMessage('Draft changes discarded');
    designDirtyRef.current = false;
    setHasUnsavedDesignChanges(false);
  }, [activeProfile?.socialPagePreferences, activeProfile?.profileTheme, activeLayoutMode, topFriends]);

  const updateGlobalStyles = useCallback((patch) => {
    patchDraftPreferences((prev) => mergeDesignPatch(prev, { globalStyles: patch }));
  }, [patchDraftPreferences]);

  const updateHeroConfig = useCallback((patch) => {
    patchDraftPreferences((prev) => mergeDesignPatch(prev, { hero: patch }));
  }, [patchDraftPreferences]);
  const updateHeroMediaPreference = useCallback((field, rawValue) => {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (value && !isRenderableMediaUrl(value)) {
      setDesignError('Hero images must use a valid http/https URL.');
      return;
    }
    const historyField = field === 'backgroundImage' ? 'backgroundImageHistory' : 'profileImageHistory';
    patchDraftPreferences((prev) => {
      const currentHero = prev?.hero || {};
      const previousValue = typeof currentHero[field] === 'string' ? currentHero[field].trim() : '';
      const existingHistory = Array.isArray(currentHero[historyField]) ? currentHero[historyField] : [];
      return mergeDesignPatch(prev, {
        hero: {
          [field]: value || null,
          [historyField]: buildRecentImageHistory(previousValue, value, existingHistory)
        }
      });
    });
  }, [patchDraftPreferences]);
  const uploadHeroMediaPreference = useCallback(async (event, field) => {
    if (!isOwnSocialContext || !galleryOwnerIdentifier) return;
    const [file] = Array.from(event.target.files || []);
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setDesignError('Only image files are supported.');
      return;
    }

    if (file.size > GALLERY_MAX_IMAGE_SIZE_BYTES) {
      setDesignError('Image file is too large (max 3MB).');
      return;
    }

    setDesignBusy(true);
    setDesignError('');
    try {
      const response = await galleryAPI.uploadGalleryItem(galleryOwnerIdentifier, file, `Hero ${field === 'backgroundImage' ? 'background' : 'profile'} image`, 'social');
      const created = response.data?.item ? normalizeGalleryItem(response.data.item) : null;
      if (created) {
        setGalleryItems((prev) => [created, ...prev]);
        updateHeroMediaPreference(field, created.mediaUrl || '');
      } else {
        await loadGallery();
      }
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to upload image.');
    } finally {
      setDesignBusy(false);
    }
  }, [isOwnSocialContext, galleryOwnerIdentifier, updateHeroMediaPreference, loadGallery]);
  const updateThemePreset = useCallback((themePreset) => {
    const resolvedPreset = SOCIAL_THEME_PRESETS.includes(themePreset) ? themePreset : 'default';
    const themeStylePatch = STAGE_THEME_STYLE_PATCH[resolvedPreset] || STAGE_THEME_STYLE_PATCH.default;
    patchDraftPreferences((prev) => mergeDesignPatch(prev, {
      themePreset: resolvedPreset,
      accentColorToken: themeStylePatch.accentColorToken,
      globalStyles: themeStylePatch.globalStyles,
      hero: {
        menuActiveColor: themeStylePatch.heroColor,
        locationColor: themeStylePatch.heroColor
      }
    }));
  }, [patchDraftPreferences]);

  const updatePanelPreferences = useCallback((panelId, patch, mode) => {
    const resolvedMode = mode || activeLayoutMode;
    const scopedPatch = {
      layouts: {
        activeMode: resolvedMode,
        [resolvedMode]: {
          panels: {
            [panelId]: patch
          }
        }
      }
    };
    if (resolvedMode === 'desktop') {
      scopedPatch.panels = { [panelId]: patch };
    }
    patchDraftPreferences((prev) => mergeDesignPatch(prev, {
      ...scopedPatch
    }));
  }, [patchDraftPreferences, activeLayoutMode]);

  const buildPanelOverridePatch = useCallback((enabled) => (
    enabled ? { useCustomStyles: true } : { useCustomStyles: false, styles: {} }
  ), []);

  const movePanel = useCallback((panelId, direction, mode) => {
    const resolvedMode = mode || activeLayoutMode;
    patchDraftPreferences((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const panelCollection = resolvedMode === 'desktop'
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
      if (resolvedMode === 'desktop') {
        next.panels = {
          ...(next.panels || {}),
          [currentId]: panelCollection[currentId],
          [targetId]: panelCollection[targetId]
        };
      }
      next.layouts = {
        ...(next.layouts || {}),
        activeMode: resolvedMode,
        [resolvedMode]: {
          ...((next.layouts && next.layouts[resolvedMode]) || {}),
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

  const applyLayoutPreset = useCallback((preset, mode) => {
    const resolvedMode = mode || activeLayoutMode;
    if (!preset?.panels) return;
    patchDraftPreferences((prev) => mergeDesignPatch(prev, {
      ...(resolvedMode === 'desktop' ? { panels: preset.panels } : {}),
      layouts: {
        activeMode: resolvedMode,
        [resolvedMode]: { panels: preset.panels }
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
            {isModuleVisible('calendarShortcut') ? <li><Link to={socialCalendarPath} className="block rounded-xl px-3 py-2 hover:bg-slate-50">Calendar</Link></li> : null}
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
        ) : (
          <div className="space-y-4">
            <CircleSpiderDiagram
              circles={circles}
              profileLabel={activeProfile?.username || requestedProfileIdentifier || 'user'}
              accentColor={accentColor}
            />
            {circles.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {circles.map((circle) => (
                  <div key={circle.name} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <div className="flex items-center gap-3">
                      {isRenderableMediaUrl(circle.profileImageUrl) ? <img src={circle.profileImageUrl} alt={circle.name} className="h-10 w-10 rounded-full object-cover" /> : <span className="h-3 w-3 rounded-full" style={{ backgroundColor: circle.color || accentColor }} />}
                      <div>
                        <p className="font-semibold text-slate-900">{circle.name}</p>
                        <p className="text-xs text-slate-500">{circle.memberCount || 0} members</p>
                      </div>
                      <span className={`ml-auto rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${circle.relationshipAudience === 'secure' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>
                        {RELATIONSHIP_AUDIENCE_LABELS[circle.relationshipAudience] || RELATIONSHIP_AUDIENCE_LABELS.social}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
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
        {
          const canPostToProfileThread = isAuthenticated && profileChatPermissions.canWrite;
          return (
            <div className="space-y-3">
              <div className="rounded-xl border bg-white/70 p-3 text-xs text-slate-600">
                <p><span className="font-semibold text-slate-800">Read:</span> {profileChatAccessSummary.read}</p>
                <p><span className="font-semibold text-slate-800">Write:</span> {profileChatAccessSummary.write}</p>
              </div>
              {profileChatLoading ? (
                <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-500">Loading chat room…</div>
              ) : profileChatPermissions.canRead ? (
                <>
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">
                      <span>{activeProfile?.username ? `@${activeProfile.username}` : 'Profile'} chat room</span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">Live</span>
                    </div>
                    <div data-testid="social-mini-chat-viewport" className="max-h-72 space-y-1 overflow-y-auto px-2 py-1.5 [scrollbar-gutter:stable]">
                      {profileChatMessages.length === 0 ? (
                        <p className="text-sm text-slate-500">No messages yet. Start the conversation.</p>
                      ) : profileChatMessages.map((message) => (
                        <div key={message._id} className="flex justify-start">
                          <div data-testid="social-mini-chat-bubble" className="max-w-[94%] rounded-xl border border-slate-200 bg-slate-50 px-1.5 py-0.5">
                            <p className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">@{message?.userId?.username || 'user'}</p>
                            <p data-testid="social-mini-chat-message-content" className="whitespace-pre-wrap break-words text-[13px] leading-4 text-slate-800">{message?.content || ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
                    <textarea
                      value={profileChatInput}
                      onChange={(event) => setProfileChatInput(event.target.value)}
                      aria-label="Profile chat message"
                      placeholder={canPostToProfileThread ? 'Write a message…' : (isAuthenticated ? 'You do not have write access' : 'Sign in to send messages')}
                      disabled={!canPostToProfileThread || profileChatSending}
                      rows={3}
                      className="max-h-36 min-h-[40px] w-full resize-none rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm leading-5 disabled:bg-slate-200"
                    />
                    <button
                      type="button"
                      onClick={handleSendProfileChatMessage}
                      disabled={!canPostToProfileThread || profileChatSending || !profileChatInput.trim()}
                      className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition duration-150 hover:bg-slate-800 disabled:opacity-60"
                    >
                      {profileChatSending ? 'Sending…' : 'Send'}
                    </button>
                    {!isAuthenticated ? (
                      <p className="text-xs text-slate-600">Sign in to post in this chat room.</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-600">
                  This profile chat room is limited by the owner&apos;s access settings.
                </div>
              )}
            {profileChatPermissions.isOwner ? (
              <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Read access</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-700">
                    {PROFILE_CHAT_ROLE_OPTIONS.map((option) => (
                      <label key={`read-${option.value}`} className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={profileChatAccessDraft.readRoles.includes(option.value)}
                          onChange={() => toggleProfileChatRole('readRoles', option.value)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Write access</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-700">
                    {PROFILE_CHAT_ROLE_OPTIONS.map((option) => (
                      <label key={`write-${option.value}`} className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={profileChatAccessDraft.writeRoles.includes(option.value)}
                          onChange={() => toggleProfileChatRole('writeRoles', option.value)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveProfileChatAccess}
                  disabled={profileChatSavingAccess}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-white disabled:opacity-60"
                >
                  {profileChatSavingAccess ? 'Saving access…' : 'Save chat access'}
                </button>
              </div>
            ) : null}
            {profileChatError ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{profileChatError}</div> : null}
            <Link to={socialChatPath} className="inline-flex w-full items-center justify-center rounded-xl bg-gray-900 px-4 py-2 text-white hover:bg-gray-800">{socialChatLabel}</Link>
            </div>
          );
        }
      case 'top_friends':
        return topFriends.length === 0 ? (
          <p className="text-sm text-gray-600">Top friends are private or not set yet.</p>
        ) : (
          <ul className="space-y-3 text-sm text-gray-700">
            {topFriends.slice(0, TOP_FRIENDS_LIMIT).map((friend, index) => (
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

  const accentColor = socialPreferences.hero?.menuActiveColor || socialPreferences.globalStyles?.headerColor || '#3b82f6';
  const hubFontFamily = socialPreferences.globalStyles?.fontFamily || socialPreferences.hero?.fontFamily || 'Inter';
  const hubSurfaceStyle = {
    backgroundColor: 'rgba(255, 255, 255, 0.64)',
    borderColor: 'rgba(255, 255, 255, 0.45)',
    fontFamily: `"${hubFontFamily}", sans-serif`
  };
  const onlineFriends = friends.filter((friend) => {
    const status = String(friend?.presence?.status || '').toLowerCase();
    return status === 'online' || status === 'active' || friend?.presence?.isOnline;
  });
  const activePartnerFriend = friends.find((friend) => friend.partnerStatus === 'accepted');
  const incomingPartnerRequests = friends.filter((friend) => friend.partnerStatus === 'pending' && friend.partnerCanRespond);
  const outgoingPartnerRequest = friends.find((friend) => friend.partnerStatus === 'pending' && friend.partnerRequestedByViewer);
  const availablePartnerCandidates = friends.filter((friend) => friend.partnerStatus === 'none');
  const liveTypingCount = Object.values(commentTypingByPostId).reduce((total, entry) => total + Object.keys(entry || {}).length, 0);
  const calendarCountdowns = posts.filter((post) => post?.interaction?.type === 'countdown').slice(0, 5);
  const calendarPreviewMonthDays = useMemo(
    () => buildCalendarPreviewMonthGrid(calendarPreviewAnchorDate),
    [calendarPreviewAnchorDate]
  );
  const calendarPreviewYears = useMemo(
    () => Array.from(new Set(calendarPreviewMonthDays.map((day) => day.getFullYear()))),
    [calendarPreviewMonthDays]
  );
  const calendarPreviewHolidays = useMemo(
    () => calendarPreviewYears.flatMap((year) => buildHolidayEntriesForYear(year)),
    [calendarPreviewYears]
  );
  const calendarPreviewHolidaysByDay = useMemo(() => {
    const holidaysByDay = new Map();
    calendarPreviewHolidays.forEach((holiday) => {
      const list = holidaysByDay.get(holiday.dayKey) || [];
      holidaysByDay.set(holiday.dayKey, [...list, holiday]);
    });
    return holidaysByDay;
  }, [calendarPreviewHolidays]);
  const calendarPreviewEventCountByDay = useMemo(() => {
    const counts = new Map();
    calendarPreviewEvents.forEach((event) => {
      const startAt = new Date(event?.startAt);
      const endAt = new Date(event?.endAt || event?.startAt);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return;

      const cursor = new Date(startAt);
      cursor.setHours(0, 0, 0, 0);
      const endDay = new Date(endAt);
      endDay.setHours(0, 0, 0, 0);

      while (cursor <= endDay) {
        const key = formatCalendarDayKey(cursor);
        counts.set(key, (counts.get(key) || 0) + 1);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return counts;
  }, [calendarPreviewEvents]);
  const upcomingCalendarItems = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const upcomingEvents = calendarPreviewEvents
      .map((event) => {
        const startAt = new Date(event?.startAt);
        if (Number.isNaN(startAt.getTime())) return null;
        return {
          id: `event-${event._id || startAt.toISOString()}`,
          title: event.title || 'Untitled event',
          date: startAt,
          type: 'event'
        };
      })
      .filter((entry) => entry && entry.date >= startOfToday);

    const upcomingHolidays = calendarPreviewHolidays
      .filter((holiday) => holiday.date >= startOfToday)
      .map((holiday) => ({
        id: holiday.id,
        title: holiday.name,
        date: holiday.date,
        type: holiday.category
      }));

    return [...upcomingEvents, ...upcomingHolidays]
      .sort((left, right) => left.date - right.date)
      .slice(0, MAX_UPCOMING_CALENDAR_ITEMS);
  }, [calendarPreviewEvents, calendarPreviewHolidays]);
  const navigateCalendarPreviewMonth = useCallback((monthOffset) => {
    setCalendarPreviewAnchorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + monthOffset, 1));
  }, []);

  const renderGlassPanel = (title, body, options = {}) => (
    <section
      className={`overflow-hidden rounded-[1.75rem] border shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl ${options.className || ''}`}
      style={{ ...hubSurfaceStyle, ...(options.style || {}) }}
    >
      <div className="border-b border-white/30 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</h2>
            {options.subtitle ? <p className="mt-1 text-sm text-slate-500">{options.subtitle}</p> : null}
          </div>
          {options.action}
        </div>
      </div>
      <div className="px-5 py-5">{body}</div>
    </section>
  );

  const renderPrivateProfileBody = () => (
    <div className="space-y-4 text-sm text-slate-700">
      <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-900 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Private profile</p>
        <p className="mt-2 text-base font-semibold">Only limited identity details are visible to visitors.</p>
        <p className="mt-2 text-sm text-amber-800">Posts, gallery media, calendar activity, and network panels stay locked until the owner decides to share more.</p>
      </div>
      <div className="space-y-3 rounded-3xl border border-slate-200 bg-white/70 px-4 py-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-4">
            <div className="h-3 w-24 rounded-full bg-slate-200" />
            <div className="mt-3 h-3 w-full rounded-full bg-slate-200" />
            <div className="mt-2 h-3 w-3/4 rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );

  const renderNavigationDiscovery = () => renderGlassPanel(
    'Navigation',
    <div className="space-y-5 text-sm text-slate-700">
      <ul className="space-y-2">
        <li><Link to="/social" className="flex items-center justify-between rounded-2xl bg-blue-50 px-3 py-2 font-semibold text-blue-700"><span>Social Hub</span><span aria-hidden="true">↗</span></Link></li>
        <li><Link to={socialFriendsPath} className="block rounded-2xl px-3 py-2 hover:bg-white/60">Friends Circles</Link></li>
        {isModuleVisible('marketplaceShortcut') ? <li><Link to="/market" className="block rounded-2xl px-3 py-2 hover:bg-white/60">Marketplace</Link></li> : null}
        {isModuleVisible('calendarShortcut') ? <li><Link to={socialCalendarPath} className="block rounded-2xl px-3 py-2 hover:bg-white/60">Calendar</Link></li> : null}
        {isModuleVisible('settingsShortcut') ? <li><Link to="/settings" className="block rounded-2xl px-3 py-2 hover:bg-white/60">Settings</Link></li> : null}
        {isModuleVisible('referShortcut') ? <li><Link to="/refer" className="block rounded-2xl px-3 py-2 hover:bg-white/60">Refer a Friend</Link></li> : null}
      </ul>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">My Groups</p>
        <div className="space-y-2">
          {circles.length === 0 ? (
            <div className="rounded-2xl bg-white/50 px-3 py-3 text-sm text-slate-500">No circles yet. Create one from the Friends tab.</div>
          ) : circles.slice(0, 6).map((circle) => (
            <div key={circle._id || circle.name} className="flex items-center gap-3 rounded-2xl bg-white/55 px-3 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: circle.color || accentColor }} />
              <div>
                <p className="font-medium text-slate-800">{circle.name}</p>
                <p className="text-xs text-slate-500">{Array.isArray(circle.members) ? circle.members.length : 0} members</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Communities</p>
        <div className="space-y-2">
          {[
            { name: 'Local Discovery', meta: 'Places, events, and neighborhood updates' },
            { name: 'Secure Circle', meta: 'Private coordination for trusted contacts' },
            { name: 'Creator Lounge', meta: 'Share projects, updates, and media drops' }
          ].map((community) => (
            <div key={community.name} className="rounded-2xl bg-white/55 px-3 py-3">
              <p className="font-semibold text-slate-800">{community.name}</p>
              <p className="mt-1 text-xs text-slate-500">{community.meta}</p>
            </div>
          ))}
        </div>
      </div>
    </div>,
    {
      subtitle: 'Navigation & Discovery',
      action: ownerEditingEnabled && !isGuestPreview ? (
        <button
          type="button"
          onClick={() => setDesignStudioOpen(true)}
          className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          Customize
        </button>
      ) : null
    }
  );

  const renderSharedDesignCard = !isOwnSocialContext && isAuthenticated && sharedDesigns.length > 0
    ? renderGlassPanel(
      'Shared Design',
      <div className="space-y-3 text-sm text-slate-700">
        <p>@{requestedProfileIdentifier} shared a public style pack.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => toggleFavoriteSharedDesign(sharedDesigns[0])} className="rounded-2xl border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50">{sharedDesigns[0]?.isFavorite ? 'Unfavorite' : 'Favorite'}</button>
          <button type="button" onClick={() => cloneSharedDesign(sharedDesigns[0], `${sharedDesigns[0]?.name || 'Shared design'} Clone`, false)} className="rounded-2xl border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50">Clone</button>
        </div>
      </div>
    )
    : null;

  const renderCenterStage = () => {
    if (isPrivateGuestLock) {
      return renderGlassPanel('Private Stage', renderPrivateProfileBody(), {
        subtitle: 'Guest access is limited by this account\'s privacy settings'
      });
    }

    switch (activeHeroTab) {
      case 'friends':
        return renderGlassPanel('Circles', renderPanelBody('circles'), {
          subtitle: 'Expanded circles and trusted groups'
        });
      case 'gallery':
        return renderGlassPanel('Gallery', renderPanelBody('gallery'), {
          subtitle: 'Media, moments, and social proof'
        });
      case 'chat':
        return renderGlassPanel('Chat', renderPanelBody('chat_panel'), {
          subtitle: 'Jump into direct or room conversations'
        });
      case 'calendar':
        return renderGlassPanel(
          'Calendar',
          <div className="space-y-4 text-sm text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/55 px-4 py-4">
              <div>
                <p className="font-semibold text-slate-900">Coordinate upcoming events</p>
                <p className="mt-1 text-slate-500">Open the full calendar to manage events, reminders, and shared plans.</p>
              </div>
              <Link to={socialCalendarPath} className="rounded-2xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700">Open calendar</Link>
            </div>
            <div className="rounded-2xl bg-white/55 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigateCalendarPreviewMonth(-1)}
                    className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-white/80"
                    aria-label="Previous month"
                  >
                    ←
                  </button>
                  <p className="text-sm font-semibold text-slate-900">
                    {calendarPreviewAnchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigateCalendarPreviewMonth(1)}
                    className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-white/80"
                    aria-label="Next month"
                  >
                    →
                  </button>
                </div>
                <span role="status" aria-live="polite" className="text-xs text-slate-500">
                  {calendarPreviewLoading ? 'Loading…' : 'Live'}
                </span>
              </div>
              {!isOwnSocialContext && !calendarPreviewShowsOwnerEvents ? (
                <div className="mb-3 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
                  Owner setting: {calendarPreviewOwnerVisibility === 'friends_readonly' ? 'Friends only' : 'Private'}.
                </div>
              ) : null}
              {calendarPreviewError ? (
                <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">{calendarPreviewError}</div>
              ) : null}
              <div data-testid="social-calendar-preview-grid" className="mt-3">
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {CALENDAR_PREVIEW_WEEKDAY_LABELS.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {calendarPreviewMonthDays.map((day) => {
                    const inMonth = day.getMonth() === calendarPreviewAnchorDate.getMonth();
                    const dayKey = formatCalendarDayKey(day);
                    const eventCount = calendarPreviewEventCountByDay.get(dayKey) || 0;
                    const holidays = calendarPreviewHolidaysByDay.get(dayKey) || [];
                    return (
                      <div
                        key={dayKey}
                        className={`rounded-lg border px-1 py-1 text-center text-xs ${inMonth ? 'border-slate-200 bg-white/80 text-slate-800' : 'border-slate-100 bg-white/40 text-slate-400'}`}
                        title={holidays.map((holiday) => holiday.name).join(', ')}
                      >
                        <p>{day.getDate()}</p>
                        {eventCount > 0 ? (
                          <p className="mt-0.5 text-[10px] font-semibold" style={{ color: accentColor }}>
                            {eventCount}
                          </p>
                        ) : holidays.length > 0 ? (
                          <p className="mt-0.5 text-[10px] font-semibold text-rose-600">
                            ★
                          </p>
                        ) : (
                          <span className="mt-0.5 block h-[12px]" aria-hidden="true" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 space-y-2 rounded-xl bg-white/70 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upcoming</p>
                {upcomingCalendarItems.length === 0 ? (
                  <p className="text-xs text-slate-500">No upcoming events or holidays in this window.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {upcomingCalendarItems.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2 text-xs text-slate-700">
                        <span className="truncate">{item.title}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 ${item.type === 'event' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}>
                          {item.type === 'event' ? 'Event' : 'Holiday'} • {item.date.toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {calendarCountdowns.length === 0 ? (
              <div className="rounded-2xl bg-white/50 px-4 py-4 text-slate-500">No active countdown posts yet.</div>
            ) : (
              calendarCountdowns.map((post) => (
                <div key={post._id} className="rounded-2xl bg-white/55 px-4 py-4">
                  <p className="font-semibold text-slate-900">{post.interaction?.countdown?.label || 'Countdown event'}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(post.interaction?.countdown?.targetAt)}</p>
                  <p className="mt-3 text-lg font-semibold" style={{ color: accentColor }}>{formatRemainingTime(post.interaction?.countdown?.targetAt, nowMs)}</p>
                </div>
              ))
            )}
          </div>,
          { subtitle: 'Schedules and countdown-driven moments' }
        );
      case 'main':
      default:
        return (
          <div className="space-y-6">
            {ownerEditingEnabled && !isGuestPreview ? (
              composerVisible
                ? renderGlassPanel('Composer', renderPanelBody('composer'), {
                  subtitle: 'Share an update to the center stage',
                  action: (
                    <button
                      type="button"
                      onClick={() => setComposerVisible(false)}
                      className="rounded-2xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white/70"
                    >
                      Hide
                    </button>
                  )
                })
                : renderGlassPanel(
                  'Composer',
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/55 px-4 py-4 text-sm text-slate-700">
                    <p>The composer stays tucked away until you need to post.</p>
                    <button
                      type="button"
                      onClick={() => setComposerVisible(true)}
                      className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Start a post
                    </button>
                  </div>,
                  {
                    subtitle: 'Hidden by default for a cleaner stage'
                  }
                )
            ) : null}
            {renderGlassPanel('Feed', renderPanelBody('timeline'), {
              subtitle: (isOwnSocialContext && !isGuestPreview) ? 'Your personalized stream' : 'Public social feed'
            })}
            {renderGlassPanel('Gallery', renderPanelBody('gallery'), {
              subtitle: 'Pinned visuals and recent uploads'
            })}
          </div>
        );
    }
  };

  const renderPulseRail = () => (
    <div className="space-y-6">
      {isPrivateGuestLock ? renderGlassPanel('Access Locked', renderPrivateProfileBody(), {
        subtitle: 'Pulse, live activity, and messaging stay hidden while this profile is private'
      }) : renderGlassPanel(
        'Top Friends',
        topFriends.length === 0 ? (
          <div className="rounded-2xl bg-white/55 px-4 py-4 text-sm text-slate-500">Top friends are private or not configured yet.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            {topFriends.slice(0, TOP_FRIENDS_LIMIT).map((friend, index) => (
              <div key={friend._id || friend.username} className="rounded-2xl bg-white/55 p-3 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-[1.1rem] bg-slate-200 text-lg font-semibold text-slate-700">
                  {friend.avatarUrl ? <img src={friend.avatarUrl} alt={friend.username} className="h-full w-full object-cover" /> : (friend.realName || friend.username || '?').charAt(0).toUpperCase()}
                </div>
                <p className="mt-2 truncate text-sm font-semibold text-slate-900">@{friend.username}</p>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Top {index + 1}</p>
              </div>
            ))}
          </div>
        ),
        { subtitle: 'Top 5 ranking' }
      )}

      {!isPrivateGuestLock ? renderGlassPanel(
        'Partner / Spouse',
        (activePartnerFriend || incomingPartnerRequests.length > 0 || outgoingPartnerRequest || availablePartnerCandidates.length > 0) ? (
          <div className="space-y-3 text-sm text-slate-700">
            {activePartnerFriend ? (
              <div className="rounded-2xl bg-emerald-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Listed partner</p>
                <p className="mt-1 font-semibold text-slate-900">@{activePartnerFriend.username}</p>
                {isOwnSocialContext && !isGuestPreview ? (
                  <button
                    type="button"
                    onClick={() => handlePartnerListingAction(activePartnerFriend.friendshipId, 'clear')}
                    disabled={partnerActionBusyFriendshipId === String(activePartnerFriend.friendshipId)}
                    className="mt-3 rounded-xl border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-white disabled:opacity-60"
                  >
                    Remove listing
                  </button>
                ) : null}
              </div>
            ) : null}

            {incomingPartnerRequests.map((friend) => (
              <div key={`partner-incoming-${friend.friendshipId || friend._id}`} className="rounded-2xl bg-amber-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Incoming request</p>
                <p className="mt-1 font-semibold text-slate-900">@{friend.username}</p>
                {isOwnSocialContext && !isGuestPreview ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handlePartnerListingAction(friend.friendshipId, 'accept')}
                      disabled={partnerActionBusyFriendshipId === String(friend.friendshipId)}
                      className="rounded-xl border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-white disabled:opacity-60"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePartnerListingAction(friend.friendshipId, 'deny')}
                      disabled={partnerActionBusyFriendshipId === String(friend.friendshipId)}
                      className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-white disabled:opacity-60"
                    >
                      Deny
                    </button>
                  </div>
                ) : null}
              </div>
            ))}

            {!activePartnerFriend && outgoingPartnerRequest ? (
              <div className="rounded-2xl bg-blue-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Pending request</p>
                <p className="mt-1 font-semibold text-slate-900">@{outgoingPartnerRequest.username}</p>
                {isOwnSocialContext && !isGuestPreview ? (
                  <button
                    type="button"
                    onClick={() => handlePartnerListingAction(outgoingPartnerRequest.friendshipId, 'clear')}
                    disabled={partnerActionBusyFriendshipId === String(outgoingPartnerRequest.friendshipId)}
                    className="mt-3 rounded-xl border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-white disabled:opacity-60"
                  >
                    Cancel request
                  </button>
                ) : null}
              </div>
            ) : null}

            {isOwnSocialContext && !isGuestPreview && !activePartnerFriend ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Send request</p>
                {availablePartnerCandidates.length === 0 ? (
                  <p className="rounded-2xl bg-white/55 px-3 py-3 text-xs text-slate-500">No available friends to request right now.</p>
                ) : availablePartnerCandidates.map((friend) => (
                  <button
                    key={`partner-candidate-${friend.friendshipId || friend._id}`}
                    type="button"
                    onClick={() => handlePartnerListingAction(friend.friendshipId, 'request')}
                    disabled={partnerActionBusyFriendshipId === String(friend.friendshipId)}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50/50 disabled:opacity-60"
                  >
                    <span>@{friend.username}</span>
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] uppercase tracking-wide text-blue-700">Request</span>
                  </button>
                ))}
              </div>
            ) : null}

            {partnerActionError ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{partnerActionError}</div> : null}
          </div>
        ) : (
          <div className="rounded-2xl bg-white/55 px-4 py-4 text-sm text-slate-500">
            No partner listing activity yet.
          </div>
        ),
        { subtitle: 'Request, accept, or deny relationship listing' }
      ) : null}

      {!isPrivateGuestLock ? renderGlassPanel(
        'Live Activity',
        <div className="grid grid-cols-2 gap-3 text-sm text-slate-700">
          {[
            { label: 'Realtime', value: realtimeEnabled ? 'On' : 'Polling' },
            { label: 'Online Friends', value: onlineFriends.length },
            { label: 'Live Typing', value: liveTypingCount },
            { label: 'Gallery Items', value: galleryItems.length }
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-white/55 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900" style={item.label === 'Realtime' ? { color: accentColor } : undefined}>{item.value}</p>
            </div>
          ))}
        </div>,
        { subtitle: 'Signals from your network' }
      ) : null}

      {!isPrivateGuestLock ? renderGlassPanel('Chat', renderPanelBody('chat_panel'), {
        subtitle: 'Stay responsive without leaving the hub'
      }) : null}

      {isAuthenticated && !isGuestPreview && !isPrivateGuestLock ? renderGlassPanel('Moderation', renderPanelBody('moderation_status'), {
        subtitle: 'Recent trust & safety signals'
      }) : null}
    </div>
  );

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div
      className={`min-h-[calc(100vh-4rem)] w-full pb-8 ${pageThemeClass}`}
      style={{ backgroundColor: socialPreferences.globalStyles?.pageBackgroundColor, fontFamily: `"${hubFontFamily}", sans-serif` }}
    >
      {showSlimHeader ? (
        <div className="fixed inset-x-0 top-16 z-40 hidden lg:block">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex items-center justify-between gap-4 rounded-b-2xl border border-white/30 bg-slate-950/90 px-4 py-3 text-white shadow-lg backdrop-blur-xl">
              <p className="truncate text-sm font-semibold">{heroProfile?.name || activeProfile?.realName || activeProfile?.username || 'Social'}</p>
              <div className="flex items-center gap-1">
                {SOCIAL_HERO_TABS.map((tab) => (
                  <button
                    key={`slim-tab-${tab.id}`}
                    type="button"
                    onClick={() => handleHeroTabChange(tab.id)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${activeHeroTab === tab.id ? 'bg-blue-500 text-white' : 'text-slate-200 hover:bg-white/10'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="w-full">
        <SocialHero
          profile={heroProfile}
          heroConfig={heroConfig}
          activeTab={activeHeroTab}
          onTabChange={handleHeroTabChange}
          isMobile={isMobile}
          isEditing={ownerEditingEnabled}
          onEditClick={() => setDesignStudioOpen(true)}
        />

        {isOwnSocialContext ? (
          <div className="fixed right-4 top-36 z-[70] hidden flex-col gap-2 lg:flex">
            <button
              type="button"
              onClick={() => handleGuestPreviewToggle(!isGuestPreview)}
              className="rounded-xl border border-white/40 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-white shadow-sm backdrop-blur-xl hover:bg-slate-800/90"
            >
              {isGuestPreview ? 'Owner View' : 'Guest View'}
            </button>
            {!isGuestPreview ? (
              <>
                <button
                  type="button"
                  onClick={() => setComposerVisible((prev) => !prev)}
                  className="rounded-xl border border-white/40 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-white shadow-sm backdrop-blur-xl hover:bg-slate-800/90"
                >
                  {composerVisible ? 'Hide Compose' : 'Compose'}
                </button>
                <button
                  type="button"
                  onClick={() => setDesignStudioOpen(true)}
                  className="rounded-xl border border-blue-200 bg-white/90 px-3 py-2 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-50"
                >
                  Stage Settings
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        <div className={`px-4 sm:px-6 lg:px-8 ${isMobile ? 'pb-24 pt-8' : 'pt-8'}`}>
          <div className="rounded-[2rem] border border-white/25 bg-white/8 p-4 shadow-[0_30px_90px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:p-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(220px,20%)_minmax(0,1fr)_minmax(280px,25%)]">
              {!isMobile ? (
                <aside className="space-y-6 xl:sticky xl:top-24">
                  {renderNavigationDiscovery()}
                  {isPrivateGuestLock ? renderGlassPanel('Profile Privacy', renderPrivateProfileBody(), {
                    subtitle: 'Limited details are available while this account is private'
                  }) : renderGlassPanel('Profile Snapshot', renderPanelBody('snapshot'), {
                    subtitle: 'Identity, resume, and quick stats'
                  })}
                  {!isPrivateGuestLock ? renderSharedDesignCard : null}
                </aside>
              ) : null}

              <main className="space-y-6">
                {!isAuthenticated ? renderGlassPanel('Guest Access', renderPanelBody('guest_lookup'), {
                  subtitle: 'Load a public profile by username or user ID'
                }) : null}
                {renderCenterStage()}
              </main>

              <aside className="space-y-6 xl:sticky xl:top-24">
                {renderPulseRail()}
              </aside>
            </div>
          </div>
        </div>
      </div>

      <SocialStageSettingsSidebar
        isOpen={designStudioOpen}
        onClose={() => setDesignStudioOpen(false)}
        hasUnsavedChanges={hasUnsavedDesignChanges}
        onSaveChanges={saveDraftPreferences}
        onCancelChanges={cancelDraftPreferences}
        busy={designBusy}
        error={designError}
        successMessage={designSuccessMessage}
        heroBackgroundImage={socialPreferences.hero?.backgroundImage || ''}
        heroBackgroundImageHistory={socialPreferences.hero?.backgroundImageHistory || []}
        heroRandomGalleryEnabled={Boolean(socialPreferences.hero?.backgroundImageUseRandomGallery)}
        heroProfileImage={socialPreferences.hero?.profileImage || ''}
        heroProfileImageHistory={socialPreferences.hero?.profileImageHistory || []}
        themePreset={socialPreferences.themePreset || 'default'}
        themeOptions={STAGE_THEME_OPTIONS}
        accentColor={accentColor}
        fontFamily={socialPreferences.globalStyles?.fontFamily || 'Inter'}
        fontOptions={SOCIAL_FONT_FAMILIES}
        selectedTopFriends={draftTopFriends}
        availableFriends={friends}
        topFriendsLimit={TOP_FRIENDS_LIMIT}
        onHeroBackgroundImageChange={(value) => updateHeroMediaPreference('backgroundImage', value)}
        onHeroBackgroundImageUpload={(event) => uploadHeroMediaPreference(event, 'backgroundImage')}
        onHeroProfileImageChange={(value) => updateHeroMediaPreference('profileImage', value)}
        onHeroProfileImageUpload={(event) => uploadHeroMediaPreference(event, 'profileImage')}
        onHeroRandomGalleryToggle={(enabled) => updateHeroConfig({ backgroundImageUseRandomGallery: enabled })}
        onThemePresetChange={updateThemePreset}
        onAccentColorChange={(value) => {
          updateHeroConfig({ menuActiveColor: value, locationColor: value });
          updateGlobalStyles({ headerColor: value });
        }}
        onFontFamilyChange={(value) => {
          updateGlobalStyles({ fontFamily: value });
          updateHeroConfig({ fontFamily: value });
        }}
        onToggleTopFriend={toggleDraftTopFriend}
        onMoveTopFriend={moveDraftTopFriend}
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
