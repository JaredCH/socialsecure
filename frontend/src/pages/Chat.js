import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import ChatComposerBar from '../components/chat/ChatComposerBar';
import ChatMessageList from '../components/chat/ChatMessageList';
import PasswordField from '../components/PasswordField';
import { authAPI, chatAPI, friendsAPI, moderationAPI, userAPI } from '../utils/api';
import { parseSlashCommand, runSlashCommand } from '../utils/chatCommands';
import { joinRealtimeRoom, leaveRealtimeRoom, onChatMessage, onFriendPresence, onPresenceUpdate } from '../utils/realtime';
import { getPresenceMeta } from '../utils/presence';
import {
  createWrappedRoomKeyPackage,
  decryptEnvelope,
  encryptEnvelope,
  ingestWrappedRoomKeyPackage,
  unlockOrCreateVault
} from '../utils/e2ee';

const CHANNELS = [
  { key: 'zip', label: 'Chat' },
  { key: 'dm', label: 'Direct Messages' }
];

const UNLOCK_DURATION_OPTIONS = [
  { value: 2, label: '2 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '60 minutes' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '24 hours' },
  { value: 10080, label: '7 days' }
];

const MESSAGE_REACTIONS = [
  { key: 'like', label: 'Like', emoji: '👍' },
  { key: 'hate', label: 'Hate', emoji: '💢' },
  { key: 'thumbs_up', label: 'Thumbs up', emoji: '👍🏻' },
  { key: 'thumbs_down', label: 'Thumbs down', emoji: '👎' },
  { key: 'love', label: 'Love', emoji: '❤️' },
  { key: 'shocked', label: 'Shocked', emoji: '😲' },
  { key: 'excited', label: 'Excited', emoji: '🤩' }
];

const PARTICIPANT_REFRESH_DEBOUNCE_MS = 1000;

const CHAT_THEMES = [
  {
    key: 'classic',
    label: 'Classic Light',
    shell: 'bg-gradient-to-br from-slate-100 via-white to-slate-200 text-slate-900',
    panel: 'border-slate-300/90 bg-white/75 backdrop-blur-xl shadow-[0_12px_30px_rgba(15,23,42,0.08)]',
    panelGlass: 'border-slate-300/90 bg-white/85 backdrop-blur-2xl shadow-[0_12px_30px_rgba(15,23,42,0.10)]',
    accent: 'border border-blue-600 bg-blue-600 text-white hover:bg-blue-700',
    subtle: 'border-slate-300 bg-slate-100/95 text-slate-700 hover:bg-slate-200',
    input: 'border-slate-300 bg-white/95 text-slate-900',
    messagesShell: 'bg-slate-50/90',
    messageOwn: 'bg-blue-600 text-white',
    messageOther: 'bg-white text-slate-900',
    senderAccent: 'text-blue-700',
    roomHover: 'hover:bg-slate-200/65'
  },
  {
    key: 'midnight',
    label: 'Midnight',
    shell: 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100',
    panel: 'border-cyan-700/70 bg-slate-900/70 backdrop-blur-xl shadow-[0_16px_35px_rgba(8,145,178,0.22)]',
    panelGlass: 'border-cyan-700/70 bg-slate-900/80 backdrop-blur-2xl shadow-[0_16px_35px_rgba(8,145,178,0.26)]',
    accent: 'border border-cyan-400 bg-cyan-400 text-slate-950 hover:bg-cyan-300',
    subtle: 'border-cyan-800 bg-slate-800/90 text-cyan-100 hover:bg-slate-700',
    input: 'border-cyan-700 bg-slate-950/95 text-cyan-100',
    messagesShell: 'bg-slate-950/35',
    messageOwn: 'bg-cyan-400/25 text-cyan-50',
    messageOther: 'bg-slate-800/95 text-slate-100',
    senderAccent: 'text-cyan-300',
    roomHover: 'hover:bg-slate-800/65'
  },
  {
    key: 'ocean',
    label: 'Ocean',
    shell: 'bg-gradient-to-br from-cyan-950 via-sky-900 to-cyan-950 text-cyan-50',
    panel: 'border-cyan-700 bg-cyan-900/70 backdrop-blur-xl shadow-[0_16px_35px_rgba(14,116,144,0.28)]',
    panelGlass: 'border-cyan-600 bg-cyan-900/80 backdrop-blur-2xl shadow-[0_16px_35px_rgba(14,116,144,0.32)]',
    accent: 'border border-cyan-300 bg-cyan-300 text-cyan-950 hover:bg-cyan-200',
    subtle: 'border-cyan-700 bg-cyan-800/95 text-cyan-50 hover:bg-cyan-700',
    input: 'border-cyan-600 bg-cyan-950/95 text-cyan-50',
    messagesShell: 'bg-cyan-950/35',
    messageOwn: 'bg-cyan-300/25 text-cyan-50',
    messageOther: 'bg-cyan-900/95 text-cyan-50',
    senderAccent: 'text-cyan-200',
    roomHover: 'hover:bg-cyan-900/60'
  },
  {
    key: 'terminal',
    label: 'Terminal',
    shell: 'bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-lime-200',
    panel: 'border-lime-700 bg-zinc-900/75 backdrop-blur-xl shadow-[0_16px_35px_rgba(77,124,15,0.25)]',
    panelGlass: 'border-lime-700 bg-zinc-900/85 backdrop-blur-2xl shadow-[0_16px_35px_rgba(77,124,15,0.3)]',
    accent: 'border border-lime-500 bg-lime-500 text-zinc-950 hover:bg-lime-400',
    subtle: 'border-lime-800 bg-zinc-800/95 text-lime-200 hover:bg-zinc-700',
    input: 'border-lime-700 bg-zinc-950/95 text-lime-200',
    messagesShell: 'bg-zinc-950/45',
    messageOwn: 'bg-lime-500/25 text-lime-100',
    messageOther: 'bg-zinc-900/95 text-lime-100',
    senderAccent: 'text-lime-300',
    roomHover: 'hover:bg-zinc-800/70'
  },
  {
    key: 'sunset',
    label: 'Sunset',
    shell: 'bg-gradient-to-br from-orange-50 via-amber-50 to-rose-100 text-orange-950',
    panel: 'border-orange-300/90 bg-white/80 backdrop-blur-xl shadow-[0_14px_32px_rgba(194,65,12,0.14)]',
    panelGlass: 'border-orange-300/90 bg-white/88 backdrop-blur-2xl shadow-[0_14px_32px_rgba(194,65,12,0.18)]',
    accent: 'border border-orange-600 bg-orange-600 text-white hover:bg-orange-700',
    subtle: 'border-orange-300 bg-orange-100/95 text-orange-900 hover:bg-orange-200',
    input: 'border-orange-300 bg-white/95 text-orange-950',
    messagesShell: 'bg-orange-50/85',
    messageOwn: 'bg-orange-500 text-white',
    messageOther: 'bg-white text-orange-950',
    senderAccent: 'text-orange-700',
    roomHover: 'hover:bg-orange-100/80'
  },
  {
    key: 'lavender',
    label: 'Lavender',
    shell: 'bg-gradient-to-br from-violet-50 via-fuchsia-50 to-violet-100 text-violet-950',
    panel: 'border-violet-300/90 bg-white/80 backdrop-blur-xl shadow-[0_14px_32px_rgba(109,40,217,0.12)]',
    panelGlass: 'border-violet-300/90 bg-white/90 backdrop-blur-2xl shadow-[0_14px_32px_rgba(109,40,217,0.16)]',
    accent: 'border border-violet-600 bg-violet-600 text-white hover:bg-violet-700',
    subtle: 'border-violet-300 bg-violet-100/95 text-violet-900 hover:bg-violet-200',
    input: 'border-violet-300 bg-white/95 text-violet-950',
    messagesShell: 'bg-violet-50/85',
    messageOwn: 'bg-violet-500 text-white',
    messageOther: 'bg-white text-violet-950',
    senderAccent: 'text-violet-700',
    roomHover: 'hover:bg-violet-100/80'
  },
  {
    key: 'nightwatch',
    label: 'Nightwatch',
    shell: 'font-outfit bg-[#0b0e14] text-[#c5cad3]',
    panel: 'border-[#1a1f2b] bg-[#11151d]/90 backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.5)]',
    panelGlass: 'border-[#1a1f2b] bg-[#11151d]/95 backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.55)]',
    accent: 'border border-emerald-500 bg-emerald-500 text-[#0b0e14] hover:bg-emerald-400 font-semibold',
    subtle: 'border-[#1e2430] bg-[#161b25] text-[#c5cad3] hover:bg-[#1e2430]',
    input: 'border-[#1e2430] bg-[#0d1017] text-[#c5cad3] placeholder:text-[#4a5568]',
    messagesShell: 'bg-[#0d1017]/60',
    messageOwn: 'bg-emerald-500/15 text-emerald-100',
    messageOther: 'bg-[#161b25] text-[#c5cad3]',
    senderAccent: 'text-emerald-400',
    roomHover: 'hover:bg-[#1a1f2b]/80'
  }
];

const getConversationLabel = (conversation) => {
  if (!conversation) return '';

  if (conversation.type === 'zip-room') {
    return conversation.title || (conversation.zipCode ? `Zip ${conversation.zipCode}` : 'Zip room');
  }

  if (conversation.type === 'dm') {
    return conversation.peer?.username
      ? `@${conversation.peer.username}`
      : (conversation.peer?.realName || 'Direct message');
  }

  if (conversation.type === 'profile-thread') {
    return conversation.profileUser?.username
      ? `@${conversation.profileUser.username}`
      : (conversation.title || 'Profile thread');
  }

  return conversation.title || conversation.name || 'Conversation';
};

const getActivityState = (lastActiveAt) => {
  if (!lastActiveAt) return { label: 'Away', tone: 'bg-amber-400' };
  const ageMs = Date.now() - new Date(lastActiveAt).getTime();
  if (Number.isNaN(ageMs)) return { label: 'Away', tone: 'bg-amber-400' };
  return ageMs <= 5 * 60 * 1000
    ? { label: 'Online', tone: 'bg-emerald-400' }
    : { label: 'Away', tone: 'bg-amber-400' };
};

const getPresenceState = (presence, referenceTime = Date.now()) => {
  const meta = getPresenceMeta(presence, referenceTime);
  return {
    label: meta.shortLabel,
    description: meta.label,
    tone: meta.dotClassName
  };
};

const DEFAULT_CHAT_THEME = 'nightwatch';
const LONG_PRESS_DELAY_MS = 550;
const USER_MENU_WIDTH_PX = 240;
const USER_MENU_HEIGHT_PX = 220;
const DM_UNLOCK_COOKIE_NAME = 'socialsecure_dm_unlock_v1';
const DM_READ_CACHE_KEY = 'socialsecure_dm_read_v1';
const FAVORITE_ROOM_IDS_KEY = 'socialsecure_favorite_room_ids_v1';
const DEFAULT_UNLOCK_DURATION_MINUTES = 30;
const LOCKED_DM_PLACEHOLDER = '🔒 Conversation locked. Unlock to view encrypted messages.';
const INITIAL_MESSAGES_PAGE_SIZE = 40;
const OLDER_MESSAGES_PAGE_SIZE = 10;
const DM_DECRYPT_BATCH_SIZE = 5;
const MAX_CHAT_ROOM_FETCH = 500;
const MAX_CHAT_ROOM_RESULTS = 20;
const MAX_FAVORITE_ROOMS = 8;
const MAX_DM_FRIEND_PICKER_RESULTS = 12;
const MAX_OPEN_CHAT_TABS = 6;
const ROOM_CHAT_TYPES = ['state', 'county', 'topic', 'city'];
const ROOM_DISCOVERY_GROUP_OPTIONS = [
  { value: 'states', label: 'State Chats' },
  { value: 'topics', label: 'Topics' }
];
const ROOM_DISCOVERY_TYPE_OPTIONS = [
  { value: 'state', label: 'State' },
  { value: 'topic', label: 'Topic' },
  { value: 'city', label: 'City / sub-room' },
  { value: 'county', label: 'County / sub-room' }
];
const normalizeId = (value) => String(value || '').trim();
const sortRoomsByName = (left, right) => String(left?.name || '').localeCompare(String(right?.name || ''));
const normalizeRoomSortOrder = (room, fallback = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(room?.sortOrder);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const sortRoomsByDiscoveryOrder = (left, right) => {
  const orderDifference = normalizeRoomSortOrder(left) - normalizeRoomSortOrder(right);
  if (orderDifference !== 0) return orderDifference;
  return sortRoomsByName(left, right);
};
const getRoomDiscoveryGroup = (room) => {
  if (room?.discoveryGroup === 'states' || room?.discoveryGroup === 'topics') return room.discoveryGroup;
  if (room?.type === 'state') return 'states';
  if (room?.type === 'topic') return 'topics';
  return null;
};
const createRoomAdminForm = (room = null) => ({
  name: room?.name || '',
  type: room?.type || 'topic',
  discoveryGroup: getRoomDiscoveryGroup(room) || 'topics',
  parentRoomId: normalizeId(room?.parentRoomId?._id || room?.parentRoomId || ''),
  state: room?.state || '',
  city: room?.city || '',
  county: room?.county || '',
  country: room?.country || 'US',
  defaultLanding: Boolean(room?.defaultLanding)
});
const isRoomConversation = (conversation) => ROOM_CHAT_TYPES.includes(String(conversation?.type || ''));
const getConversationActivityAt = (conversation) => conversation?.lastMessageAt || conversation?.lastActivity || null;
const getChatTabTypeLabel = (conversation) => {
  if (conversation?.type === 'dm') return 'DM';
  if (isRoomConversation(conversation)) return 'Room';
  return 'Zip';
};
const getConversationTabIcon = (conversation) => {
  if (conversation?.type === 'dm') return '✉️';
  if (isRoomConversation(conversation)) return '#';
  return '📍';
};
const addCurrentUserToRoomEntry = (entry, profileId) => {
  const normalizedProfileId = normalizeId(profileId);
  if (String(entry?._id || '') === '') return entry;
  const nextMembers = Array.isArray(entry?.members)
    ? Array.from(new Set([...entry.members.map((memberId) => String(memberId)), normalizedProfileId].filter(Boolean)))
    : [normalizedProfileId].filter(Boolean);
  return {
    ...entry,
    memberCount: Math.max(Number(entry?.memberCount || 0), nextMembers.length),
    members: nextMembers
  };
};

const upsertConversationMessage = (messages, incomingMessage) => {
  const normalizedId = String(incomingMessage?._id || '').trim();
  if (!normalizedId) return Array.isArray(messages) ? messages : [];
  const existing = Array.isArray(messages) ? messages : [];
  const existingIndex = existing.findIndex((message) => String(message?._id) === normalizedId);
  if (existingIndex >= 0) {
    const next = [...existing];
    next[existingIndex] = {
      ...next[existingIndex],
      ...incomingMessage
    };
    return next;
  }
  return [...existing, incomingMessage];
};

const readCookie = (name) => {
  const source = typeof document?.cookie === 'string' ? document.cookie : '';
  const prefix = `${name}=`;
  const entry = source.split(';').find((part) => part.trim().startsWith(prefix));
  if (!entry) return '';
  try {
    return decodeURIComponent(entry.trim().slice(prefix.length));
  } catch {
    return '';
  }
};

const writeCookie = (name, value, maxAgeSeconds) => {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.max(0, Number(maxAgeSeconds) || 0)}; SameSite=Strict${secure}`;
};

const clearCookie = (name) => {
  writeCookie(name, '', 0);
};

const readDmUnlockCache = () => {
  try {
    const parsed = JSON.parse(readCookie(DM_UNLOCK_COOKIE_NAME) || '{}');
    const expiresAt = Number(parsed?.expiresAt || 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return { expiresAt: 0, conversationIds: [] };
    }
    const conversationIds = Array.isArray(parsed?.conversationIds)
      ? parsed.conversationIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    return { expiresAt, conversationIds };
  } catch {
    return { expiresAt: 0, conversationIds: [] };
  }
};

const writeDmUnlockCache = (conversationIds, unlockDurationMinutes = DEFAULT_UNLOCK_DURATION_MINUTES) => {
  const uniqueIds = Array.from(new Set(
    (Array.isArray(conversationIds) ? conversationIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  ));
  if (uniqueIds.length === 0) {
    clearCookie(DM_UNLOCK_COOKIE_NAME);
    return;
  }
  const parsedDuration = Number(unlockDurationMinutes);
  const effectiveMinutes = UNLOCK_DURATION_OPTIONS.some((option) => option.value === parsedDuration)
    ? parsedDuration
    : DEFAULT_UNLOCK_DURATION_MINUTES;
  const maxAgeSeconds = effectiveMinutes * 60;
  const expiresAt = Date.now() + (maxAgeSeconds * 1000);
  writeCookie(
    DM_UNLOCK_COOKIE_NAME,
    JSON.stringify({ expiresAt, conversationIds: uniqueIds }),
    maxAgeSeconds
  );
};

function Chat({ isGuestMode = false }) {
  const [profile, setProfile] = useState(null);
  const [loadingHub, setLoadingHub] = useState(true);
  const [activeChannel, setActiveChannel] = useState('zip');
  const [hubData, setHubData] = useState({
    zip: { current: null, nearby: [] },
    dm: [],
    profile: []
  });
  const [activeConversationId, setActiveConversationId] = useState('');

  const [messages, setMessages] = useState([]);
  const [decryptedDmContentById, setDecryptedDmContentById] = useState({});
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesPage, setMessagesPage] = useState(1);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesLoadingOlder, setMessagesLoadingOlder] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [visibleMessageIds, setVisibleMessageIds] = useState([]);
  const [composerValue, setComposerValue] = useState('');
  const [sending, setSending] = useState(false);
  const [localTyping, setLocalTyping] = useState(false);

  const [dmQuery, setDmQuery] = useState('');
  const [newDmPickerOpen, setNewDmPickerOpen] = useState(false);
  const [newDmQuery, setNewDmQuery] = useState('');
  const [roomQuery, setRoomQuery] = useState('');
  const [allChatRooms, setAllChatRooms] = useState([]);
  const [allChatRoomsLoading, setAllChatRoomsLoading] = useState(false);
  const [quickAccessRooms, setQuickAccessRooms] = useState({
    state: null,
    county: null,
    zip: null,
    cities: []
  });
  const [joinedRoomIds, setJoinedRoomIds] = useState({});
  const [favoriteRoomIds, setFavoriteRoomIds] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(FAVORITE_ROOM_IDS_KEY) || '[]');
      if (!Array.isArray(parsed)) return {};
      return parsed.reduce((acc, roomId) => {
        const normalizedId = normalizeId(roomId);
        if (normalizedId) acc[normalizedId] = true;
        return acc;
      }, {});
    } catch {
      return {};
    }
  });
  const [dmReadByConversation, setDmReadByConversation] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(DM_READ_CACHE_KEY) || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.entries(parsed).reduce((acc, [conversationId, readAt]) => {
        const normalizedId = normalizeId(conversationId);
        const parsedReadAt = Number(readAt);
        if (normalizedId && Number.isFinite(parsedReadAt) && parsedReadAt > 0) {
          acc[normalizedId] = parsedReadAt;
        }
        return acc;
      }, {});
    } catch {
      return {};
    }
  });
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('chatTheme');
      if (saved && CHAT_THEMES.some((t) => t.key === saved)) return saved;
    } catch {
      // ignore localStorage errors
    }
    return DEFAULT_CHAT_THEME;
  });
  const [roomUsers, setRoomUsers] = useState([]);
  const [roomUsersLoading, setRoomUsersLoading] = useState(false);
  const [mobileWorkspaceOpen, setMobileWorkspaceOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [stateChatsOpen, setStateChatsOpen] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [expandedManagedRooms, setExpandedManagedRooms] = useState({});
  const [dmUnlockedByConversation, setDmUnlockedByConversation] = useState({});
  const [unlockDurationMinutes, setUnlockDurationMinutes] = useState(DEFAULT_UNLOCK_DURATION_MINUTES);
  const [unlockingDm, setUnlockingDm] = useState(false);
  const [dmFriends, setDmFriends] = useState([]);
  const [dmFriendsLoading, setDmFriendsLoading] = useState(false);
  const [presenceReferenceTime, setPresenceReferenceTime] = useState(() => Date.now());
  const [openChatTabIds, setOpenChatTabIds] = useState([]);
  const search = window.location.search;
  const previousActiveChannelRef = useRef('zip');
  const initialDefaultRoomAppliedRef = useRef(false);

  useEffect(() => {
    const requestedChannel = new URLSearchParams(search).get('tab');

    if (!isGuestMode && requestedChannel === 'dm') {
      setActiveChannel('dm');
      return;
    }

    // "rooms" is kept as a legacy alias that maps to the zip/rooms channel.
    if (requestedChannel === 'zip' || requestedChannel === 'rooms') {
      setActiveChannel('zip');
    }
    if (isGuestMode) {
      setActiveChannel('zip');
    }
  }, [isGuestMode, search]);
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPresenceReferenceTime(Date.now());
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const unsubscribe = onFriendPresence((payload) => {
      const userId = normalizeId(payload?.userId);
      if (!userId) return;

      setDmFriends((prev) => prev.map((friend) => (
        normalizeId(friend?._id) === userId
          ? { ...friend, presence: { status: payload.status, lastSeen: payload.lastSeen || null } }
          : friend
      )));
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onPresenceUpdate((payload) => {
      const userId = normalizeId(payload?.userId);
      if (!userId) return;

      setRoomUsers((prev) => prev.map((user) => (
        normalizeId(user?._id) === userId
          ? { ...user, presence: { status: payload.status, lastSeen: payload.lastSeen || null } }
          : user
      )));
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);
  const [passwordInput, setPasswordInput] = useState('');
  const [reactionByMessageId, setReactionByMessageId] = useState({});
  const [adminMessageActionIds, setAdminMessageActionIds] = useState([]);
  const [adminMuteActionUserIds, setAdminMuteActionUserIds] = useState([]);
  const [adminRoomForm, setAdminRoomForm] = useState(() => createRoomAdminForm());
  const [editingRoomId, setEditingRoomId] = useState('');
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminRoomSaving, setAdminRoomSaving] = useState(false);
  const [adminRoomActionIds, setAdminRoomActionIds] = useState([]);
  const adminMutedUserIds = useMemo(() => new Set(
    roomUsers
      .filter((entry) => {
        const mutedUntilTs = new Date(entry?.mutedUntil || 0).getTime();
        return Number.isFinite(mutedUntilTs) && mutedUntilTs > Date.now();
      })
      .map((entry) => String(entry?._id || '').trim())
      .filter(Boolean)
  ), [roomUsers]);
  const adminProcessingMessageIds = useMemo(
    () => new Set(adminMessageActionIds.map((entry) => String(entry || '').trim()).filter(Boolean)),
    [adminMessageActionIds]
  );
  const adminProcessingUserIds = useMemo(
    () => new Set(adminMuteActionUserIds.map((entry) => String(entry || '').trim()).filter(Boolean)),
    [adminMuteActionUserIds]
  );
  const adminProcessingRoomIds = useMemo(
    () => new Set(adminRoomActionIds.map((entry) => String(entry || '').trim()).filter(Boolean)),
    [adminRoomActionIds]
  );
  const [userContextMenu, setUserContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    user: null
  });
  const userLongPressTimerRef = useRef(null);
  const e2eeSessionRef = useRef(null);
  const decryptingMessageIdsRef = useRef(new Set());
  const participantRefreshTimerRef = useRef(null);
  const lastParticipantRefreshAtRef = useRef(0);

  const [userHoverPopup, setUserHoverPopup] = useState({ visible: false, user: null, rect: null, profileData: null, loading: false });
  const userHoverTimerRef = useRef(null);
  const userHoverCancelRef = useRef(false);
  const HOVER_POPUP_DELAY_MS = 400;
  const HOVER_POPUP_CLOSE_DELAY_MS = 300;

  const handleUsernameHoverStart = useCallback((user, rect) => {
    if (!user?.username && !user?._id) return;
    userHoverCancelRef.current = false;
    if (userHoverTimerRef.current) clearTimeout(userHoverTimerRef.current);
    userHoverTimerRef.current = setTimeout(async () => {
      if (userHoverCancelRef.current) return;
      setUserHoverPopup((prev) => ({ ...prev, visible: true, user, rect, profileData: null, loading: true }));
      try {
        const identifier = user.username || user._id;
        const response = await userAPI.getByUsername(identifier);
        if (userHoverCancelRef.current) return;
        setUserHoverPopup((prev) => prev.user === user ? { ...prev, profileData: response.data?.user || null, loading: false } : prev);
      } catch {
        if (userHoverCancelRef.current) return;
        setUserHoverPopup((prev) => prev.user === user ? { ...prev, loading: false } : prev);
      }
    }, HOVER_POPUP_DELAY_MS);
  }, []);

  const handleUsernameHoverEnd = useCallback(() => {
    userHoverCancelRef.current = true;
    if (userHoverTimerRef.current) {
      clearTimeout(userHoverTimerRef.current);
      userHoverTimerRef.current = null;
    }
    userHoverTimerRef.current = setTimeout(() => {
      setUserHoverPopup((prev) => ({ ...prev, visible: false, user: null, rect: null, profileData: null, loading: false }));
    }, HOVER_POPUP_CLOSE_DELAY_MS);
  }, []);

  const handleHoverPopupMouseEnter = useCallback(() => {
    userHoverCancelRef.current = false;
    if (userHoverTimerRef.current) {
      clearTimeout(userHoverTimerRef.current);
      userHoverTimerRef.current = null;
    }
  }, []);

  const handleHoverPopupMouseLeave = useCallback(() => {
    handleUsernameHoverEnd();
  }, [handleUsernameHoverEnd]);

  const handleThemeChange = useCallback((nextTheme) => {
    if (!CHAT_THEMES.some((t) => t.key === nextTheme)) return;
    setTheme(nextTheme);
    try {
      localStorage.setItem('chatTheme', nextTheme);
    } catch {
      // ignore localStorage errors
    }
  }, []);

  const handleVisibleMessageIdsChange = useCallback((nextIds) => {
    const normalizedNext = Array.isArray(nextIds)
      ? nextIds.map((id) => String(id || '')).filter(Boolean)
      : [];
    setVisibleMessageIds((prev) => {
      if (prev.length === normalizedNext.length && prev.every((id, index) => id === normalizedNext[index])) {
        return prev;
      }
      return normalizedNext;
    });
  }, []);

  const conversationList = useMemo(() => {
    if (activeChannel === 'zip') {
      const entries = [];
      if (hubData.zip.current) entries.push(hubData.zip.current);
      if (Array.isArray(hubData.zip.nearby)) {
        entries.push(...hubData.zip.nearby);
      }
      return entries;
    }

    if (activeChannel === 'dm') {
      const dmEntries = Array.isArray(hubData.dm) ? [...hubData.dm] : [];
      return dmEntries
        .map((conversation) => {
          const lastMessageAtTs = new Date(conversation?.lastMessageAt || 0).getTime();
          const readAtTs = Number(dmReadByConversation[String(conversation?._id)] || 0);
          const hasUnread = Number.isFinite(lastMessageAtTs) && lastMessageAtTs > readAtTs;
          return {
            ...conversation,
            __hasUnread: hasUnread
          };
        })
        .sort((left, right) => {
          if (Boolean(left.__hasUnread) !== Boolean(right.__hasUnread)) {
            return left.__hasUnread ? -1 : 1;
          }
          const leftTs = new Date(left?.lastMessageAt || 0).getTime();
          const rightTs = new Date(right?.lastMessageAt || 0).getTime();
          return rightTs - leftTs;
        });
    }
    return [];
  }, [activeChannel, dmReadByConversation, hubData]);

  const filteredDmConversations = useMemo(() => {
    if (activeChannel !== 'dm') return [];
    const query = dmQuery.trim().toLowerCase();
    if (!query) return conversationList;
    return conversationList.filter((conversation) => (
      getConversationLabel(conversation).toLowerCase().includes(query)
    ));
  }, [activeChannel, conversationList, dmQuery]);

  const workspaceEntries = useMemo(() => {
    const entries = new Map();
    [hubData?.zip?.current, ...(hubData?.zip?.nearby || []), ...(hubData?.dm || []), ...allChatRooms, quickAccessRooms.state, quickAccessRooms.county].forEach((entry) => {
      const entryId = normalizeId(entry?._id);
      if (!entryId) return;
      entries.set(entryId, entry);
    });
    return entries;
  }, [allChatRooms, hubData, quickAccessRooms.state, quickAccessRooms.county]);
  const roomUserPresenceMap = useMemo(
    () => new Map(roomUsers.map((user) => [normalizeId(user?._id), user?.presence || null])),
    [roomUsers]
  );
  const dmFriendPresenceMap = useMemo(
    () => new Map(dmFriends.map((friend) => [normalizeId(friend?._id), friend?.presence || null])),
    [dmFriends]
  );
  const friendIdSet = useMemo(
    () => new Set(dmFriends.map((f) => normalizeId(f?._id)).filter(Boolean)),
    [dmFriends]
  );
  const sortedRoomUsers = useMemo(() => {
    if (!roomUsers.length) return { friends: [], others: [] };
    const getName = (u) => (u.username || u.realName || '').toLowerCase();
    const friends = [];
    const others = [];
    for (const user of roomUsers) {
      if (friendIdSet.has(normalizeId(user?._id))) {
        friends.push(user);
      } else {
        others.push(user);
      }
    }
    friends.sort((a, b) => getName(a).localeCompare(getName(b)));
    others.sort((a, b) => getName(a).localeCompare(getName(b)));
    return { friends, others };
  }, [roomUsers, friendIdSet]);
  const getConversationUserPresence = useCallback((conversation) => {
    if (!conversation) return null;
    const targetUser = conversation.type === 'dm' ? conversation.peer : conversation.profileUser;
    const targetUserId = normalizeId(targetUser?._id);
    if (!targetUserId) return null;

    return roomUserPresenceMap.get(targetUserId)
      || targetUser?.presence
      || dmFriendPresenceMap.get(targetUserId)
      || null;
  }, [dmFriendPresenceMap, roomUserPresenceMap]);

  const openChatTabs = useMemo(
    () => openChatTabIds.map((tabId) => workspaceEntries.get(String(tabId))).filter(Boolean),
    [openChatTabIds, workspaceEntries]
  );

  const activeConversation = useMemo(
    () => workspaceEntries.get(String(activeConversationId)) || null,
    [workspaceEntries, activeConversationId]
  );

  useEffect(() => {
    if (activeConversation?.type !== 'dm' || !activeConversationId) return;
    const conversationId = String(activeConversationId);
    const lastMessageTs = new Date(activeConversation?.lastMessageAt || Date.now()).getTime();
    if (!Number.isFinite(lastMessageTs) || lastMessageTs <= 0) return;
    setDmReadByConversation((prev) => {
      if (Number(prev[conversationId] || 0) >= lastMessageTs) return prev;
      return {
        ...prev,
        [conversationId]: lastMessageTs
      };
    });
  }, [activeConversation?.lastMessageAt, activeConversation?.type, activeConversationId]);

  useEffect(() => {
    setDecryptedDmContentById({});
    setReactionByMessageId({});
    setVisibleMessageIds([]);
    decryptingMessageIdsRef.current = new Set();
  }, [activeConversationId, activeConversation?.type]);

  useEffect(() => {
    if (isGuestMode || !profile?._id) return;
    let cancelled = false;
    setDmFriendsLoading(true);
    friendsAPI.getFriends()
      .then(({ data }) => {
        if (cancelled) return;
        setDmFriends(Array.isArray(data?.friends) ? data.friends : []);
      })
      .catch(() => {
        if (!cancelled) setDmFriends([]);
      })
      .finally(() => {
        if (!cancelled) setDmFriendsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isGuestMode, profile?._id]);

  const loadAllChatRooms = useCallback(async () => {
    if (typeof chatAPI.getAllRooms !== 'function') return;

    setAllChatRoomsLoading(true);
    try {
      if (!isGuestMode) {
        await Promise.resolve(chatAPI.syncLocationRooms?.()).catch(() => null);
      }
      const { data } = await chatAPI.getAllRooms(1, MAX_CHAT_ROOM_FETCH);
      const rooms = Array.isArray(data?.rooms) ? data.rooms : [];
      setAllChatRooms(rooms);
      const nextJoinedIds = rooms.reduce((acc, room) => {
        const roomId = normalizeId(room?._id);
        if (!roomId) return acc;
        if (isGuestMode) {
          acc[roomId] = true;
          return acc;
        }
        const members = Array.isArray(room?.members) ? room.members.map((memberId) => String(memberId)) : [];
        if (members.includes(String(profile?._id))) {
          acc[roomId] = true;
        }
        return acc;
      }, {});
      setJoinedRoomIds(nextJoinedIds);
    } catch {
      setAllChatRooms([]);
      setJoinedRoomIds({});
    } finally {
      setAllChatRoomsLoading(false);
    }
  }, [isGuestMode, profile?._id]);

  const loadQuickAccessRooms = useCallback(async () => {
    if (typeof chatAPI.getQuickAccessRooms !== 'function') return;

    try {
      const { data } = await chatAPI.getQuickAccessRooms();
      setQuickAccessRooms({
        state: data?.rooms?.state || null,
        county: data?.rooms?.county || null,
        zip: data?.rooms?.zip || null,
        cities: Array.isArray(data?.rooms?.cities) ? data.rooms.cities : []
      });
    } catch {
      setQuickAccessRooms({
        state: null,
        county: null,
        zip: null,
        cities: []
      });
    }
  }, []);

  useEffect(() => {
    if (typeof chatAPI.getAllRooms !== 'function') return;
    let cancelled = false;
    loadAllChatRooms()
      .catch(() => null)
      .finally(() => {
        if (cancelled) return;
      });
    return () => {
      cancelled = true;
    };
  }, [loadAllChatRooms]);

  useEffect(() => {
    if (typeof chatAPI.getQuickAccessRooms !== 'function') return;
    loadQuickAccessRooms().catch(() => null);
  }, [loadQuickAccessRooms]);

  useEffect(() => {
    try {
      const serialized = Object.entries(favoriteRoomIds)
        .filter(([, favorited]) => Boolean(favorited))
        .map(([roomId]) => roomId);
      localStorage.setItem(FAVORITE_ROOM_IDS_KEY, JSON.stringify(serialized));
    } catch {
      // ignore localStorage errors
    }
  }, [favoriteRoomIds]);

  useEffect(() => {
    try {
      localStorage.setItem(DM_READ_CACHE_KEY, JSON.stringify(dmReadByConversation));
    } catch {
      // ignore localStorage errors
    }
  }, [dmReadByConversation]);

  useEffect(() => {
    if (!activeConversationId || activeConversation?.type !== 'dm') return;
    const conversationId = String(activeConversationId);
    const cache = readDmUnlockCache();
    if (!cache.conversationIds.includes(conversationId)) return;
    setDmUnlockedByConversation((prev) => ({
      ...prev,
      [conversationId]: true
    }));
  }, [activeConversation?.type, activeConversationId]);

  const filteredFriendCandidates = useMemo(() => {
    const query = newDmQuery.trim().toLowerCase();
    if (!query) return dmFriends;
    return dmFriends.filter((friend) => {
      const username = String(friend?.username || '').toLowerCase();
      const realName = String(friend?.realName || '').toLowerCase();
      return username.includes(query) || realName.includes(query);
    });
  }, [dmFriends, newDmQuery]);

  const chatRoomsByQuery = useMemo(() => {
    const query = roomQuery.trim().toLowerCase();
    if (!query) return [];
    return allChatRooms
      .filter((room) => {
        const label = String(room.name || '').toLowerCase();
        const location = [room.city, room.state, room.country, room.county].filter(Boolean).join(' ').toLowerCase();
        return label.includes(query) || location.includes(query);
      })
      .slice(0, MAX_CHAT_ROOM_RESULTS);
  }, [allChatRooms, roomQuery]);

  const favoriteRooms = useMemo(
    () => allChatRooms.filter((room) => favoriteRoomIds[String(room._id)]),
    [allChatRooms, favoriteRoomIds]
  );

  const childRoomsByParentId = useMemo(() => allChatRooms.reduce((acc, room) => {
    const parentId = normalizeId(room?.parentRoomId?._id || room?.parentRoomId);
    if (!parentId) return acc;
    if (!acc[parentId]) acc[parentId] = [];
    acc[parentId].push(room);
    return acc;
  }, {}), [allChatRooms]);
  const allChatRoomsById = useMemo(
    () => new Map(allChatRooms.map((room) => [normalizeId(room?._id), room])),
    [allChatRooms]
  );
  const managedStateRooms = useMemo(
    () => allChatRooms
      .filter((room) => getRoomDiscoveryGroup(room) === 'states' && !normalizeId(room?.parentRoomId?._id || room?.parentRoomId))
      .sort(sortRoomsByDiscoveryOrder),
    [allChatRooms]
  );
  const managedTopicRooms = useMemo(
    () => allChatRooms
      .filter((room) => getRoomDiscoveryGroup(room) === 'topics' && !normalizeId(room?.parentRoomId?._id || room?.parentRoomId))
      .sort(sortRoomsByDiscoveryOrder),
    [allChatRooms]
  );
  const defaultLandingRooms = useMemo(
    () => allChatRooms.filter((room) => room?.defaultLanding),
    [allChatRooms]
  );
  const defaultLandingRoom = useMemo(
    () => defaultLandingRooms[0] || allChatRooms.find((room) => room?.stableKey === 'topic:socialsecure') || null,
    [allChatRooms, defaultLandingRooms]
  );
  const roomParentOptions = useMemo(
    () => allChatRooms
      .filter((room) => ['state', 'topic', 'city', 'county'].includes(String(room?.type || '')))
      .sort((left, right) => {
        const groupDifference = String(getRoomDiscoveryGroup(left) || '').localeCompare(String(getRoomDiscoveryGroup(right) || ''));
        if (groupDifference !== 0) return groupDifference;
        return sortRoomsByDiscoveryOrder(left, right);
      }),
    [allChatRooms]
  );
  const relationalQuickRooms = useMemo(
    () => [quickAccessRooms.state, quickAccessRooms.county].filter(Boolean),
    [quickAccessRooms]
  );
  const nearbyCityQuickRooms = useMemo(
    () => (Array.isArray(quickAccessRooms.cities) ? quickAccessRooms.cities : []),
    [quickAccessRooms]
  );

  const activeTheme = useMemo(
    () => CHAT_THEMES.find((themeOption) => themeOption.key === theme) || CHAT_THEMES[0],
    [theme]
  );

  const handleToggleExpandedManagedRoom = useCallback((roomId) => {
    const normalizedRoomId = normalizeId(roomId);
    if (!normalizedRoomId) return;
    setExpandedManagedRooms((prev) => ({
      ...prev,
      [normalizedRoomId]: !prev[normalizedRoomId]
    }));
  }, []);

  const renderedMessages = useMemo(() => {
    if (activeConversation?.type !== 'dm') return messages;
    if (!dmUnlockedByConversation[String(activeConversationId || '')]) {
      return messages.map((message) => {
        return {
          ...message,
          content: LOCKED_DM_PLACEHOLDER
        };
      });
    }
    return messages.map((message) => {
      const messageId = String(message._id);
      if (!Object.prototype.hasOwnProperty.call(decryptedDmContentById, messageId)) return message;
      const decrypted = decryptedDmContentById[messageId];
      return {
        ...message,
        content: decrypted
      };
    });
  }, [activeConversation?.type, activeConversationId, decryptedDmContentById, dmUnlockedByConversation, messages]);

  const openConversationById = useCallback((conversationId, { openWorkspace = true } = {}) => {
    const normalizedConversationId = normalizeId(conversationId);
    if (!normalizedConversationId) return;
    let removedOverflowTab = false;
    setOpenChatTabIds((prev) => {
      if (prev.includes(normalizedConversationId)) return prev;
      const next = [...prev, normalizedConversationId];
      if (next.length <= MAX_OPEN_CHAT_TABS) return next;
      removedOverflowTab = true;
      return next.slice(next.length - MAX_OPEN_CHAT_TABS);
    });
    setActiveConversationId(normalizedConversationId);
    if (openWorkspace) {
      setMobileWorkspaceOpen(true);
    }
    if (removedOverflowTab) {
      toast('Only 6 chat tabs can stay open at once.');
    }
  }, []);

  const sharedMediaSnippets = useMemo(
    () => renderedMessages.filter((message) => /\[[^\]]+\]|https?:\/\//i.test(message.content || '')).slice(-6),
    [renderedMessages]
  );
  const encryptedDmMessages = useMemo(
    () => (activeConversation?.type === 'dm'
      ? messages.filter((message) => message?.e2ee?.ciphertext)
      : []),
    [activeConversation?.type, messages]
  );

  const applyDefaultConversationSelection = useCallback((channelKey, data) => {
    if (channelKey === 'dm') {
      const next = (data?.dm || [])[0] || null;
      if (next) {
        openConversationById(next._id, { openWorkspace: false });
      } else {
        setActiveConversationId('');
      }
      return;
    }

    setActiveConversationId('');
  }, [openConversationById]);

  const refreshHub = async (channelToKeep = activeChannel) => {
    if (isGuestMode) {
      try {
        const [roomsResponse, quickAccessResponse] = await Promise.all([
          chatAPI.getAllRooms(1, MAX_CHAT_ROOM_FETCH),
          Promise.resolve(chatAPI.getQuickAccessRooms?.()).catch(() => ({ data: { rooms: {} } }))
        ]);
        const rooms = Array.isArray(roomsResponse?.data?.rooms) ? roomsResponse.data.rooms : [];
        const quickRooms = quickAccessResponse?.data?.rooms || {};
        const currentRoom = quickRooms.zip || quickRooms.state || quickRooms.county || rooms[0] || null;
        setProfile(null);
        setHubData({
          zip: { current: currentRoom, nearby: [] },
          dm: [],
          profile: []
        });
      } catch {
        setProfile(null);
        setHubData({
          zip: { current: null, nearby: [] },
          dm: [],
          profile: []
        });
      }
      return;
    }

    const [{ data: me }, { data: conversationsData }] = await Promise.all([
      authAPI.getProfile(),
      chatAPI.getConversations()
    ]);

    setProfile(me.user || null);
    const nextData = conversationsData?.conversations || { zip: { current: null, nearby: [] }, dm: [], profile: [] };
    setHubData(nextData);

    const stillExists = (() => {
      if (!activeConversationId) return false;
      if (isRoomConversation(activeConversation)) return true;

      if (activeConversation?.type === 'dm') {
        return (nextData?.dm || []).some((conversation) => String(conversation._id) === String(activeConversationId));
      }

      return false;
    })();

    if (!stillExists && activeConversationId) {
      applyDefaultConversationSelection(channelToKeep, nextData);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      setLoadingHub(true);
      try {
        await refreshHub('zip');
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to load chat hub');
      } finally {
        setLoadingHub(false);
      }
    };

    bootstrap();
  }, []);

  useEffect(() => {
    const channelChanged = previousActiveChannelRef.current !== activeChannel;
    previousActiveChannelRef.current = activeChannel;
    if (!activeConversationId || channelChanged) {
      applyDefaultConversationSelection(activeChannel, hubData);
    }
  }, [activeChannel, activeConversationId, applyDefaultConversationSelection, hubData]);

  useEffect(() => {
    if (initialDefaultRoomAppliedRef.current) return;
    if (!defaultLandingRoom?._id) return;
    if (allChatRoomsLoading) return;
    if (activeChannel !== 'zip') return;
    const defaultLandingRoomId = normalizeId(defaultLandingRoom._id);
    if (!joinedRoomIds[defaultLandingRoomId]) return;
    const currentType = String(activeConversation?.type || '');
    if (activeConversationId && currentType && currentType !== 'zip-room') {
      initialDefaultRoomAppliedRef.current = true;
      return;
    }
    openConversationById(defaultLandingRoomId, { openWorkspace: false });
    initialDefaultRoomAppliedRef.current = true;
  }, [
    activeChannel,
    activeConversation?.type,
    activeConversationId,
    allChatRoomsLoading,
    defaultLandingRoom,
    joinedRoomIds,
    openConversationById
  ]);

  useEffect(() => {
    if (isGuestMode || !profile?._id || allChatRoomsLoading || typeof chatAPI.joinRoom !== 'function') return;
    const roomIdsToAutoJoin = Array.from(new Set([
      normalizeId(quickAccessRooms.state?._id),
      normalizeId(quickAccessRooms.county?._id),
      ...defaultLandingRooms.map((room) => normalizeId(room?._id))
    ].filter(Boolean)));
    if (roomIdsToAutoJoin.length === 0) return;

    const missingRoomIds = roomIdsToAutoJoin.filter((roomId) => !joinedRoomIds[roomId]);
    if (missingRoomIds.length === 0) return;

    let cancelled = false;
    const autoJoinRooms = async () => {
      for (const roomId of missingRoomIds) {
        try {
          await chatAPI.joinRoom(roomId);
          if (cancelled) return;
          setJoinedRoomIds((prev) => (
            prev[roomId]
              ? prev
              : { ...prev, [roomId]: true }
          ));
          setAllChatRooms((prev) => prev.map((entry) => (
            String(entry?._id) === roomId
              ? addCurrentUserToRoomEntry(entry, profile?._id)
              : entry
          )));
        } catch {
          // ignore auto-join failures and allow manual joins
        }
      }
    };

    autoJoinRooms();
    return () => {
      cancelled = true;
    };
  }, [
    allChatRoomsLoading,
    defaultLandingRooms,
    joinedRoomIds,
    isGuestMode,
    profile?._id,
    quickAccessRooms.county?._id,
    quickAccessRooms.state?._id
  ]);

  useEffect(() => {
    if (allChatRoomsLoading) return;
    const quickAccessRoomIds = [
      normalizeId(quickAccessRooms.state?._id),
      normalizeId(quickAccessRooms.county?._id)
    ].filter((roomId) => roomId && joinedRoomIds[roomId]);
    if (quickAccessRoomIds.length === 0) return;

    setOpenChatTabIds((prev) => {
      const existingIds = new Set(prev.map((entryId) => String(entryId)));
      const roomIdsToOpen = quickAccessRoomIds.filter((roomId) => !existingIds.has(roomId));
      if (roomIdsToOpen.length === 0) return prev;
      const next = [...prev, ...roomIdsToOpen];
      if (next.length <= MAX_OPEN_CHAT_TABS) return next;
      return next.slice(next.length - MAX_OPEN_CHAT_TABS);
    });
  }, [
    allChatRoomsLoading,
    joinedRoomIds,
    quickAccessRooms.county?._id,
    quickAccessRooms.state?._id
  ]);

  const loadLatestConversationMessages = useCallback(async (conversationId) => {
    const request = isRoomConversation(activeConversation)
      ? chatAPI.getMessages(conversationId, 1, INITIAL_MESSAGES_PAGE_SIZE)
      : chatAPI.getConversationMessages(conversationId, 1, INITIAL_MESSAGES_PAGE_SIZE);
    const { data } = await request;
    const latestMessages = Array.isArray(data?.messages) ? data.messages : [];
    setMessages(latestMessages);
    setMessagesPage(1);
    setMessagesHasMore(Boolean(data?.pagination?.hasMore ?? data?.hasMore));
    return latestMessages;
  }, [activeConversation]);

  useEffect(() => {
    const loadMessages = async () => {
      if (!activeConversationId) {
        setMessages([]);
        setMessagesPage(1);
        setMessagesHasMore(false);
        setMessagesError('');
        return;
      }

      setMessagesLoading(true);
      setMessagesError('');
      try {
        await loadLatestConversationMessages(activeConversationId);
      } catch (error) {
        setMessages([]);
        setMessagesPage(1);
        setMessagesHasMore(false);
        setMessagesError(error.response?.data?.error || 'Failed to load conversation messages');
      } finally {
        setMessagesLoading(false);
      }
    };

    loadMessages();
  }, [activeConversationId, loadLatestConversationMessages]);

  const handleLoadOlderMessages = useCallback(async () => {
    if (!activeConversationId || messagesLoadingOlder || !messagesHasMore) return 0;
    const nextPage = messagesPage + 1;
    setMessagesLoadingOlder(true);
    try {
      const request = isRoomConversation(activeConversation)
        ? chatAPI.getMessages(activeConversationId, nextPage, OLDER_MESSAGES_PAGE_SIZE)
        : chatAPI.getConversationMessages(activeConversationId, nextPage, OLDER_MESSAGES_PAGE_SIZE);
      const { data } = await request;
      const olderMessages = Array.isArray(data?.messages) ? data.messages : [];
      if (olderMessages.length > 0) {
        setMessages((prev) => {
          const existingById = new Set((Array.isArray(prev) ? prev : []).map((message) => String(message?._id)));
          const uniqueOlderMessages = olderMessages.filter((message) => !existingById.has(String(message?._id)));
          if (uniqueOlderMessages.length === 0) return prev;
          return [...uniqueOlderMessages, ...prev];
        });
      }
      setMessagesPage(nextPage);
      setMessagesHasMore(Boolean(data?.pagination?.hasMore ?? data?.hasMore));
      return olderMessages.length;
    } catch {
      return 0;
    } finally {
      setMessagesLoadingOlder(false);
    }
  }, [activeConversation, activeConversationId, messagesHasMore, messagesLoadingOlder, messagesPage]);

  const loadConversationUsers = useCallback(async ({ silent = false } = {}) => {
    if (!activeConversationId) {
      setRoomUsers([]);
      return;
    }

    if (!silent) {
      setRoomUsersLoading(true);
    }

    try {
      const { data } = await chatAPI.getConversationUsers(activeConversationId);
      setRoomUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (error) {
      if (!silent) {
        setRoomUsers([]);
        toast.error(error.response?.data?.error || 'Failed to load room users');
      }
    } finally {
      if (!silent) {
        setRoomUsersLoading(false);
      }
    }
  }, [activeConversationId]);

  const scheduleConversationUsersRefresh = useCallback(() => {
    if (!activeConversationId) return;
    const now = Date.now();
    const elapsedMs = now - lastParticipantRefreshAtRef.current;
    const runRefresh = () => {
      lastParticipantRefreshAtRef.current = Date.now();
      loadConversationUsers({ silent: true });
    };

    if (elapsedMs >= PARTICIPANT_REFRESH_DEBOUNCE_MS) {
      if (participantRefreshTimerRef.current) {
        window.clearTimeout(participantRefreshTimerRef.current);
        participantRefreshTimerRef.current = null;
      }
      runRefresh();
      return;
    }

    if (participantRefreshTimerRef.current) return;

    participantRefreshTimerRef.current = window.setTimeout(() => {
      participantRefreshTimerRef.current = null;
      runRefresh();
    }, PARTICIPANT_REFRESH_DEBOUNCE_MS - elapsedMs);
  }, [activeConversationId, loadConversationUsers]);

  useEffect(() => {
    if (!activeConversationId) return undefined;
    joinRealtimeRoom(activeConversationId);
    return () => {
      leaveRealtimeRoom(activeConversationId);
    };
  }, [activeConversationId]);

  useEffect(() => {
    const unsubscribe = onChatMessage((payload) => {
      const incomingMessage = payload?.message;
      if (!incomingMessage) return;
      const incomingTargetId = String(incomingMessage.conversationId || incomingMessage.roomId || '');
      if (!incomingTargetId) return;
      if (incomingTargetId !== String(activeConversationId || '')) return;
      setMessages((prev) => upsertConversationMessage(prev, incomingMessage));
      scheduleConversationUsersRefresh();
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [activeConversationId, scheduleConversationUsersRefresh]);

  useEffect(() => {
    const loadRoomUsers = async () => {
      if (!activeConversationId) {
        setRoomUsers([]);
        return;
      }

      setRoomUsersLoading(true);
      try {
        const request = isRoomConversation(activeConversation)
          ? chatAPI.getRoomUsers(activeConversationId)
          : chatAPI.getConversationUsers(activeConversationId);
        const { data } = await request;
        setRoomUsers(Array.isArray(data?.users) ? data.users : []);
      } catch (error) {
        setRoomUsers([]);
        toast.error(error.response?.data?.error || 'Failed to load room users');
      } finally {
        setRoomUsersLoading(false);
      }
    };

    loadRoomUsers();
  }, [activeConversation, activeConversationId]);

  useEffect(() => {
    if (!composerValue.trim()) {
      setLocalTyping(false);
      return;
    }

    setLocalTyping(true);
    const timer = setTimeout(() => setLocalTyping(false), 1200);
    return () => clearTimeout(timer);
  }, [composerValue]);

  const ensureE2EESession = useCallback(async (encryptionPassword) => {
    if (e2eeSessionRef.current) {
      return e2eeSessionRef.current;
    }
    if (!profile?._id) {
      throw new Error('Profile is required to unlock encryption vault');
    }
    if (!String(encryptionPassword || '').trim()) {
      throw new Error('Encryption password is required');
    }

    const { session } = await unlockOrCreateVault({
      userId: profile._id,
      password: encryptionPassword
    });
    const registerPayload = await session.getRegisterPayload();
    await chatAPI.registerDeviceKeys(registerPayload);
    e2eeSessionRef.current = session;
    return session;
  }, [profile?._id]);

  useEffect(() => {
    if (!activeConversationId || activeConversation?.type !== 'dm') return;
    if (!dmUnlockedByConversation[String(activeConversationId)]) return;
    if (encryptedDmMessages.length === 0) return;
    const pendingMessages = [...encryptedDmMessages]
      .reverse()
      .filter((message) => (
        !Object.prototype.hasOwnProperty.call(decryptedDmContentById, String(message._id))
        && !decryptingMessageIdsRef.current.has(String(message._id))
      ))
      .slice(0, DM_DECRYPT_BATCH_SIZE);
    if (pendingMessages.length === 0) return;

    let cancelled = false;
    const decryptMessages = async () => {
      try {
        const session = await ensureE2EESession();
        const decryptedEntries = {};
        for (const message of pendingMessages) {
          const messageId = String(message._id);
          decryptingMessageIdsRef.current.add(messageId);
          try {
            decryptedEntries[messageId] = await decryptEnvelope({
              session,
              roomId: activeConversationId,
              envelope: message.e2ee
            });
          } catch {
            // keep encrypted placeholder when key is unavailable
          } finally {
            decryptingMessageIdsRef.current.delete(messageId);
          }
        }
        if (!cancelled && Object.keys(decryptedEntries).length > 0) {
          setDecryptedDmContentById((prev) => ({
            ...prev,
            ...decryptedEntries
          }));
        }
      } catch {
        // decryption waits until credentials/session are available
      }
    };

    decryptMessages();
    return () => {
      cancelled = true;
    };
  }, [
    activeConversation?.type,
    activeConversationId,
    decryptedDmContentById,
    dmUnlockedByConversation,
    encryptedDmMessages,
    ensureE2EESession
  ]);

  const persistDmUnlockCache = useCallback((conversationId, shouldCache, durationMinutes = DEFAULT_UNLOCK_DURATION_MINUTES) => {
    const normalizedId = String(conversationId || '').trim();
    if (!normalizedId) return;
    const existing = readDmUnlockCache();
    const nextSet = new Set(existing.conversationIds);
    if (shouldCache) {
      nextSet.add(normalizedId);
    } else {
      nextSet.delete(normalizedId);
    }
    writeDmUnlockCache([...nextSet], durationMinutes);
  }, []);

  const hydrateConversationKeys = useCallback(async ({ conversationId, session }) => {
    const { data } = await chatAPI.syncConversationKeyPackages(conversationId, session.deviceId);
    const packages = Array.isArray(data?.packages) ? data.packages : [];
    let hasNewRoomKey = false;
    for (const pkg of packages) {
      try {
        await ingestWrappedRoomKeyPackage({ session, pkg });
        hasNewRoomKey = true;
      } catch (error) {
        // keep unlock flow resilient when legacy/corrupt packages are present
        if (process.env.NODE_ENV !== 'test') {
          console.warn('Skipping invalid DM key package during unlock hydration:', error);
        }
      }
    }
    if (hasNewRoomKey) {
      await session.persist();
    }
  }, []);

  const handleSend = async (event) => {
    event.preventDefault();
    if (isGuestMode) return;
    const trimmed = composerValue.trim();
    if (!trimmed || !activeConversationId) return;

    const parsed = parseSlashCommand(trimmed);
    let contentToSend = trimmed;
    if (parsed) {
      const result = runSlashCommand({
        command: parsed.command,
        argsRaw: parsed.argsRaw,
        username: profile?.username || profile?.realName || 'user'
      });
      if (!result.ok) {
        toast.error(result.error || 'Invalid slash command');
        return;
      }
      contentToSend = result.payload?.plaintext || trimmed;
    }

    setSending(true);
    try {
      let data;
      if (activeConversation?.type === 'dm') {
        const session = await ensureE2EESession();
        await hydrateConversationKeys({ conversationId: activeConversationId, session });
        const existingKey = session.getLatestRoomKey(activeConversationId);
        const keyVersion = existingKey?.keyVersion || 1;
        const roomKey = existingKey?.keyBytes || session.createRoomKey();
        if (!existingKey) {
          session.setRoomKey(activeConversationId, keyVersion, roomKey);
        }

        const envelope = await encryptEnvelope({
          session,
          roomId: activeConversationId,
          keyVersion,
          roomKey,
          plaintext: contentToSend
        });

        const devicesResponse = await chatAPI.getConversationDevices(activeConversationId);
        const allDevices = Array.isArray(devicesResponse?.data?.devices) ? devicesResponse.data.devices : [];
        const targetDevices = allDevices.filter((device) => (
          !(String(device.userId) === String(profile?._id) && String(device.deviceId) === String(session.deviceId))
        ));

        if (targetDevices.length > 0) {
          const packages = await Promise.all(targetDevices.map((device) => createWrappedRoomKeyPackage({
            session,
            roomId: activeConversationId,
            keyVersion,
            roomKey,
            recipientUserId: String(device.userId),
            recipientDeviceId: String(device.deviceId),
            recipientPublicKey: device.publicEncryptionKey
          })));
          await chatAPI.publishConversationKeyPackages(activeConversationId, packages);
        }

        const response = await chatAPI.sendConversationE2EEMessage(activeConversationId, {
          e2ee: envelope,
          messageType: 'text'
        });
        data = response.data;
        await session.persist();
      } else if (isRoomConversation(activeConversation)) {
        const response = await chatAPI.sendMessage(activeConversationId, {
          content: contentToSend,
          messageType: 'text'
        });
        data = response.data;
      } else {
        const response = await chatAPI.sendConversationMessage(activeConversationId, {
          content: contentToSend
        });
        data = response.data;
      }

      let messageForState = data?.message || null;
      if (messageForState) {
        const currentProfileId = String(profile?._id || '');
        const senderId = String(messageForState.userId?._id || messageForState.userId || '');
        if (senderId && senderId === currentProfileId) {
          const rawUserId = messageForState.userId;
          const existingUser = (typeof messageForState.userId === 'object' && messageForState.userId !== null)
            ? messageForState.userId
            : (rawUserId ? { _id: rawUserId } : {});
          messageForState = {
            ...messageForState,
            userId: {
              ...existingUser,
              _id: existingUser._id || profile?._id,
              username: existingUser.username || profile?.username,
              realName: existingUser.realName || profile?.realName,
              avatarUrl: existingUser.avatarUrl || profile?.avatarUrl || ''
            }
          };
        }
      }
      setMessages((prev) => upsertConversationMessage(prev, messageForState));
      setComposerValue('');
      setLocalTyping(false);
      if (!isRoomConversation(activeConversation)) {
        await refreshHub(activeConversation?.type === 'dm' ? 'dm' : 'zip');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleStartDM = useCallback(async (targetUserId) => {
    if (isGuestMode) return;
    try {
      const { data } = await chatAPI.startDM(targetUserId);
      await refreshHub('dm');
      setActiveChannel('dm');
      openConversationById(String(data.conversation._id));
      setNewDmPickerOpen(false);
      setNewDmQuery('');
      setMobileWorkspaceOpen(true);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to start DM');
    }
  }, [isGuestMode, openConversationById, refreshHub]);

  const handleDeleteConversation = useCallback(async (conversationId) => {
    if (isGuestMode) return;
    if (!conversationId) return;
    if (!window.confirm('Are you sure you want to delete this conversation? This will permanently remove it for both you and the other participant.')) return;
    try {
      await chatAPI.deleteConversation(conversationId);
      if (String(activeConversationId) === String(conversationId)) {
        setActiveConversationId('');
        setMessages([]);
        setDecryptedDmContentById({});
        setMobileWorkspaceOpen(false);
      }
      setOpenChatTabs((prev) => prev.filter((tab) => String(tab._id) !== String(conversationId)));
      await refreshHub('dm');
      toast.success('Conversation deleted');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete conversation');
    }
  }, [activeConversationId, isGuestMode, refreshHub]);

  const handleOpenRoom = useCallback(async (room) => {
    const normalizedRoomId = normalizeId(room?._id || room);
    if (!normalizedRoomId) return;
    try {
      if (!isGuestMode && !joinedRoomIds[normalizedRoomId] && typeof chatAPI.joinRoom === 'function') {
        const { data } = await chatAPI.joinRoom(normalizedRoomId);
        setJoinedRoomIds((prev) => ({
          ...prev,
          [normalizedRoomId]: true
        }));
        setAllChatRooms((prev) => prev.map((entry) => (
          String(entry?._id) === normalizedRoomId
            ? addCurrentUserToRoomEntry(entry, profile?._id)
            : entry
        )));
        if (data?.systemMessage) {
          setMessages((prev) => upsertConversationMessage(prev, data.systemMessage));
        }
        toast.success('Joined room');
      }
      openConversationById(normalizedRoomId);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to join room');
    }
  }, [isGuestMode, joinedRoomIds, openConversationById, profile?._id]);

  const handleCloseOpenTab = useCallback((conversationId) => {
    const normalizedConversationId = normalizeId(conversationId);
    if (!normalizedConversationId) return;
    let remainingTabIds = [];
    setOpenChatTabIds((prev) => {
      remainingTabIds = prev.filter((tabId) => tabId !== normalizedConversationId);
      return remainingTabIds;
    });
    if (normalizedConversationId !== String(activeConversationId)) return;
    setActiveConversationId(remainingTabIds[remainingTabIds.length - 1] || '');
  }, [activeConversationId]);

  const handleToggleFavoriteRoom = useCallback((roomId) => {
    const normalizedRoomId = normalizeId(roomId);
    if (!normalizedRoomId) return;
    setFavoriteRoomIds((prev) => ({
      ...prev,
      [normalizedRoomId]: !prev[normalizedRoomId]
    }));
  }, []);

  const canDeleteRoom = useCallback((room) => {
    const ownerId = String(room?.createdBy?._id || room?.createdBy || '').trim();
    if (profile?.isAdmin) return !room?.eventRef;
    if (room?.stableKey || room?.eventRef || room?.autoLifecycle) return false;
    return ownerId && ownerId === String(profile?._id || '');
  }, [profile?._id, profile?.isAdmin]);

  const handleDeleteRoom = useCallback(async (room) => {
    const roomId = normalizeId(room?._id);
    const roomName = String(room?.name || 'this room').trim() || 'this room';
    if (!roomId || typeof chatAPI.deleteRoom !== 'function' || !canDeleteRoom(room)) return;
    if (!window.confirm(`Delete "${roomName}"?`)) return;

    try {
      const { data } = await chatAPI.deleteRoom(roomId);
      setAllChatRooms((prev) => prev.filter((entry) => String(entry?._id) !== roomId));
      setJoinedRoomIds((prev) => {
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
      setFavoriteRoomIds((prev) => {
        if (!prev[roomId]) return prev;
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
      setOpenChatTabIds((prev) => prev.filter((tabId) => tabId !== roomId));
      if (String(activeConversationId || '') === roomId) {
        setActiveConversationId('');
        setMessages([]);
        setRoomUsers([]);
        setMobileWorkspaceOpen(false);
      }
      if (data?.archived) {
        await loadAllChatRooms().catch(() => null);
      }
      toast.success(data?.archived ? 'Removed room from the room list' : 'Deleted room');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete room');
      await loadAllChatRooms().catch(() => null);
    }
  }, [activeConversationId, canDeleteRoom, loadAllChatRooms]);

  const resetAdminRoomForm = useCallback(() => {
    setEditingRoomId('');
    setAdminRoomForm(createRoomAdminForm());
  }, []);

  const handleAdminRoomFormChange = useCallback((field, value) => {
    setAdminRoomForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'parentRoomId' && value) {
        const parent = allChatRoomsById.get(normalizeId(value));
        if (parent) {
          next.discoveryGroup = getRoomDiscoveryGroup(parent) || prev.discoveryGroup;
          if (!next.state && parent.state) next.state = parent.state;
          if (!next.country && parent.country) next.country = parent.country;
        }
      }
      if (field === 'discoveryGroup' && !normalizeId(next.parentRoomId)) {
        next.type = value === 'states' ? 'state' : 'topic';
      }
      return next;
    });
  }, [allChatRoomsById]);

  const handleEditRoom = useCallback((room) => {
    setEditingRoomId(normalizeId(room?._id));
    setAdminRoomForm(createRoomAdminForm(room));
    setAdminPanelOpen(true);
  }, []);

  const handleSaveAdminRoom = useCallback(async (event) => {
    event.preventDefault();
    if (!profile?.isAdmin) return;
    setAdminRoomSaving(true);
    try {
      const payload = {
        ...adminRoomForm,
        name: String(adminRoomForm.name || '').trim(),
        parentRoomId: normalizeId(adminRoomForm.parentRoomId) || null,
        state: String(adminRoomForm.state || '').trim() || undefined,
        city: String(adminRoomForm.city || '').trim() || undefined,
        county: String(adminRoomForm.county || '').trim() || undefined,
        country: String(adminRoomForm.country || '').trim() || 'US',
        defaultLanding: Boolean(adminRoomForm.defaultLanding)
      };
      if (!payload.name) {
        toast.error('Room name is required.');
        return;
      }

      const request = editingRoomId
        ? chatAPI.updateRoom(editingRoomId, payload)
        : chatAPI.createManagedRoom(payload);
      await request;
      await loadAllChatRooms();
      resetAdminRoomForm();
      toast.success(editingRoomId ? 'Room updated' : 'Room created');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save room');
    } finally {
      setAdminRoomSaving(false);
    }
  }, [adminRoomForm, editingRoomId, loadAllChatRooms, profile?.isAdmin, resetAdminRoomForm]);

  const handleMoveRoom = useCallback(async (roomId, direction) => {
    const normalizedRoomId = normalizeId(roomId);
    if (!profile?.isAdmin || !normalizedRoomId || typeof chatAPI.moveRoom !== 'function') return;
    setAdminRoomActionIds((prev) => (prev.includes(normalizedRoomId) ? prev : [...prev, normalizedRoomId]));
    try {
      await chatAPI.moveRoom(normalizedRoomId, direction);
      await loadAllChatRooms();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to move room');
    } finally {
      setAdminRoomActionIds((prev) => prev.filter((entry) => entry !== normalizedRoomId));
    }
  }, [loadAllChatRooms, profile?.isAdmin]);

  const handleUnlockActiveDM = useCallback(async () => {
    if (!activeConversationId || activeConversation?.type !== 'dm') return;
    if (!String(passwordInput || '').trim()) {
      toast.error('Encryption password is required');
      return;
    }
    setUnlockingDm(true);
    try {
      await authAPI.verifyEncryptionPassword(passwordInput, unlockDurationMinutes);
      const session = await ensureE2EESession(passwordInput);
      await hydrateConversationKeys({ conversationId: activeConversationId, session });
      setDecryptedDmContentById({});
      decryptingMessageIdsRef.current = new Set();
      const latestMessages = await loadLatestConversationMessages(activeConversationId);
      const encrypted = (Array.isArray(latestMessages) ? latestMessages : [])
        .filter((message) => message?.e2ee?.ciphertext);
      const decryptedEntries = {};
      for (const message of encrypted) {
        const messageId = String(message._id);
        try {
          decryptedEntries[messageId] = await decryptEnvelope({
            session,
            roomId: activeConversationId,
            envelope: message.e2ee
          });
        } catch {
          // keep encrypted placeholder when room key is unavailable
        }
      }
      if (Object.keys(decryptedEntries).length > 0) {
        setDecryptedDmContentById(decryptedEntries);
      }
      setDmUnlockedByConversation((prev) => ({
        ...prev,
        [String(activeConversationId)]: true
      }));
      persistDmUnlockCache(activeConversationId, true, unlockDurationMinutes);
      setPasswordInput('');
      toast.success('Direct message unlocked.');
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Failed to unlock direct message');
    } finally {
      setUnlockingDm(false);
    }
  }, [
    activeConversation?.type,
    activeConversationId,
    ensureE2EESession,
    hydrateConversationKeys,
    loadLatestConversationMessages,
    passwordInput,
    persistDmUnlockCache,
    unlockDurationMinutes
  ]);

  const handleLockActiveDM = useCallback(() => {
    if (!activeConversationId || activeConversation?.type !== 'dm') return;
    setDmUnlockedByConversation((prev) => ({
      ...prev,
      [String(activeConversationId)]: false
    }));
    setDecryptedDmContentById({});
    setPasswordInput('');
    persistDmUnlockCache(activeConversationId, false);
    e2eeSessionRef.current = null;
    toast.success('Direct message locked.');
  }, [activeConversation?.type, activeConversationId, persistDmUnlockCache]);

  useEffect(() => {
    if (!profile?._id) return;

    const params = new URLSearchParams(window.location.search);
    const directMessageTarget = params.get('dm');

    if (!directMessageTarget || String(directMessageTarget) === String(profile._id)) {
      return;
    }

    handleStartDM(directMessageTarget).finally(() => {
      window.history.replaceState({}, '', '/chat');
    });
  }, [profile?._id, handleStartDM]);

  const openUserContextMenu = (event, user, point) => {
    if (event?.preventDefault) event.preventDefault();
    const fallbackRect = event?.currentTarget?.getBoundingClientRect?.();
    const x = Number.isFinite(point?.x)
      ? point.x
      : Number.isFinite(event?.clientX)
        ? event.clientX
        : (fallbackRect?.left || 0) + ((fallbackRect?.width || 0) / 2);
    const y = Number.isFinite(point?.y)
      ? point.y
      : Number.isFinite(event?.clientY)
        ? event.clientY
        : (fallbackRect?.top || 0) + ((fallbackRect?.height || 0) / 2);
    setUserContextMenu({
      open: true,
      x: Math.max(8, Math.min(window.innerWidth - USER_MENU_WIDTH_PX, x)),
      y: Math.max(8, Math.min(window.innerHeight - USER_MENU_HEIGHT_PX, y)),
      user
    });
  };

  const closeUserContextMenu = () => {
    setUserContextMenu((prev) => ({ ...prev, open: false }));
  };

  const handleViewUserSocial = (user) => {
    const identifier = user?.username || user?._id;
    if (!identifier) return;
    window.open(`/social?user=${encodeURIComponent(identifier)}`, '_blank', 'noopener,noreferrer');
  };

  const handleRequestFriendship = async (user) => {
    if (!user?._id || String(user._id) === String(profile?._id)) return;
    try {
      await friendsAPI.sendRequest(user._id);
      toast.success(`Friend request sent to @${user.username || user.realName || 'user'}`);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send friend request');
    }
  };

  const handleBlockIgnore = async (user) => {
    if (!user?._id || String(user._id) === String(profile?._id)) return;
    try {
      await moderationAPI.blockUser(user._id, 'Blocked from chat user context menu');
      toast.success(`Blocked @${user.username || user.realName || 'user'}`);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to block user');
    }
  };

  const handleToggleMessageReaction = useCallback((messageId, reactionKey) => {
    if (isGuestMode) return;
    const normalizedMessageId = String(messageId || '').trim();
    const normalizedReactionKey = String(reactionKey || '').trim();
    if (!normalizedMessageId || !normalizedReactionKey) return;
    const actorId = String(profile?._id || '');
    if (!actorId) return;
    setReactionByMessageId((prev) => {
      const currentByReaction = prev[normalizedMessageId] || {};
      const existingActors = new Set(currentByReaction[normalizedReactionKey] || []);
      if (existingActors.has(actorId)) {
        existingActors.delete(actorId);
      } else {
        existingActors.add(actorId);
      }
      return {
        ...prev,
        [normalizedMessageId]: {
          ...currentByReaction,
          [normalizedReactionKey]: [...existingActors]
        }
      };
    });
  }, [isGuestMode, profile?._id]);

  const handleToggleAdminMessageRemoval = useCallback(async (message) => {
    const messageId = String(message?._id || '').trim();
    if (!profile?.isAdmin || !messageId || activeConversation?.type === 'dm') return;

    const messageType = isRoomConversation(activeConversation) ? 'room' : 'conversation';
    setAdminMessageActionIds((prev) => (prev.includes(messageId) ? prev : [...prev, messageId]));
    try {
      const response = message?.moderation?.removedByAdmin
        ? await moderationAPI.restoreMessageByAdmin(messageId, messageType)
        : await moderationAPI.removeMessageByAdmin(messageId, messageType);
      setMessages((prev) => upsertConversationMessage(prev, response.data?.message || {}));
      toast.success(message?.moderation?.removedByAdmin ? 'Message restored' : 'Message removed');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update message');
    } finally {
      setAdminMessageActionIds((prev) => prev.filter((entry) => entry !== messageId));
    }
  }, [activeConversation, profile?.isAdmin]);

  const handleAdminDeleteMessage = useCallback(async (message) => {
    const messageId = String(message?._id || '').trim();
    if (!profile?.isAdmin || !messageId || activeConversation?.type === 'dm') return;

    const messageType = isRoomConversation(activeConversation) ? 'room' : 'conversation';
    setAdminMessageActionIds((prev) => (prev.includes(messageId) ? prev : [...prev, messageId]));
    try {
      await moderationAPI.deleteMessageByAdmin(messageId, messageType);
      setMessages((prev) => prev.filter((m) => String(m._id) !== messageId));
      toast.success('Message deleted');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete message');
    } finally {
      setAdminMessageActionIds((prev) => prev.filter((entry) => entry !== messageId));
    }
  }, [activeConversation, profile?.isAdmin]);

  const handleToggleAdminUserMute = useCallback(async (user) => {
    const userId = String(user?._id || '').trim();
    if (!profile?.isAdmin || !userId || userId === String(profile?._id || '')) return;

    const isMuted = roomUsers.some((entry) => {
      if (String(entry?._id || '') !== userId) return false;
      const mutedUntilTs = new Date(entry?.mutedUntil || 0).getTime();
      return Number.isFinite(mutedUntilTs) && mutedUntilTs > Date.now();
    });
    setAdminMuteActionUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    try {
      if (isMuted) {
        await moderationAPI.unmuteUserByAdmin(userId);
      } else {
        await moderationAPI.muteUserByAdmin(userId, {
          durationKey: '2h',
          reason: 'Muted by site Admin from chat room'
        });
      }
      setRoomUsers((prev) => {
        const nextMutedUntil = isMuted ? null : new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString();
        let found = false;
        const nextUsers = prev.map((entry) => {
          if (String(entry?._id || '') !== userId) return entry;
          found = true;
          return {
            ...entry,
            mutedUntil: nextMutedUntil
          };
        });
        if (found) return nextUsers;
        return [
          ...nextUsers,
          {
            _id: userId,
            username: user?.username || null,
            realName: user?.realName || null,
            mutedUntil: nextMutedUntil
          }
        ];
      });
      toast.success(isMuted ? 'User unmuted' : 'User muted for 2 hours');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update user mute');
    } finally {
      setAdminMuteActionUserIds((prev) => prev.filter((entry) => entry !== userId));
    }
  }, [profile?._id, profile?.isAdmin, roomUsers]);

  useEffect(() => {
    if (!userContextMenu.open) return undefined;
    const handleWindowClick = () => setUserContextMenu((prev) => ({ ...prev, open: false }));
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setUserContextMenu((prev) => ({ ...prev, open: false }));
      }
    };
    window.addEventListener('click', handleWindowClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('click', handleWindowClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [userContextMenu.open]);

  useEffect(() => {
    if (!themeMenuOpen) return undefined;
    const handleWindowClick = () => setThemeMenuOpen(false);
    const handleEscape = (event) => {
      if (event.key === 'Escape') setThemeMenuOpen(false);
    };
    window.addEventListener('click', handleWindowClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('click', handleWindowClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [themeMenuOpen]);

  useEffect(() => () => {
    if (participantRefreshTimerRef.current) {
      window.clearTimeout(participantRefreshTimerRef.current);
      participantRefreshTimerRef.current = null;
    }
    if (userLongPressTimerRef.current) {
      clearTimeout(userLongPressTimerRef.current);
      userLongPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setOpenChatTabIds((prev) => prev.filter((tabId) => workspaceEntries.has(String(tabId))));
  }, [workspaceEntries]);

  useEffect(() => {
    if (activeConversationId && !workspaceEntries.has(String(activeConversationId))) {
      setActiveConversationId('');
    }
  }, [activeConversationId, workspaceEntries]);

  const activeConversationPresence = useMemo(
    () => getConversationUserPresence(activeConversation),
    [activeConversation, getConversationUserPresence]
  );
  const conversationPresence = useMemo(() => (
    activeConversation?.type === 'dm' || activeConversation?.type === 'profile-thread'
      ? getPresenceState(activeConversationPresence, presenceReferenceTime)
      : getActivityState(getConversationActivityAt(activeConversation))
  ), [activeConversation, activeConversationPresence, presenceReferenceTime]);
  const activeConversationUser = useMemo(() => {
    if (!activeConversation) return null;
    if (activeConversation.type === 'dm') return activeConversation.peer || null;
    if (activeConversation.type === 'profile-thread') return activeConversation.profileUser || null;
    return null;
  }, [activeConversation]);
  const activeMenuLabel = useMemo(() => {
    if (activeConversation) return getConversationLabel(activeConversation);
    if (activeChannel === 'dm') return 'Direct Messages';
    return 'Secure Chat';
  }, [activeChannel, activeConversation]);
  const activeMenuIcon = activeConversation ? getConversationTabIcon(activeConversation) : (activeChannel === 'dm' ? '✉️' : '💬');
  const renderManagedRoomBranch = useCallback((room, depth = 0, extraProps = {}) => {
    const roomId = normalizeId(room?._id);
    const joined = Boolean(joinedRoomIds[roomId]);
    const children = (childRoomsByParentId[roomId] || []).slice().sort(sortRoomsByDiscoveryOrder);
    const isExpanded = Boolean(expandedManagedRooms[roomId]);
    const hasChildren = children.length > 0;
    const paddingLeft = `${Math.min(depth, 3) * 0.75}rem`;

    return (
      <li
        key={roomId}
        className="rounded border px-2 py-1"
        style={{ marginLeft: paddingLeft }}
        data-room-tree-item={room.name}
        data-discovery-city={room.type === 'city' ? room.name : undefined}
        {...extraProps}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              if (hasChildren) {
                handleToggleExpandedManagedRoom(roomId);
              } else {
                handleOpenRoom(room);
              }
            }}
            className="min-w-0 flex-1 text-left"
            data-discovery-state-summary={room.type === 'state' && depth === 0 ? room.name : undefined}
            aria-expanded={hasChildren ? isExpanded : undefined}
          >
            <span className="truncate font-medium">{room.name}</span>
            <span className="block text-[10px] uppercase opacity-70">
              {room.defaultLanding ? 'default room' : room.type}
              {hasChildren ? ` · ${children.length} sub-room${children.length === 1 ? '' : 's'}` : ''}
            </span>
          </button>
          <div className="flex items-center gap-1">
            {!joined ? (
              <button
                type="button"
                onClick={() => handleOpenRoom(room)}
                className={`rounded border px-2 py-0.5 ${activeTheme.subtle}`}
              >
                Join
              </button>
            ) : (
              <span className="opacity-70">Joined</span>
            )}
            {hasChildren ? (
              <button
                type="button"
                onClick={() => handleToggleExpandedManagedRoom(roomId)}
                className={`rounded border px-2 py-0.5 ${activeTheme.subtle}`}
              >
                {isExpanded ? '−' : '+'}
              </button>
            ) : null}
          </div>
        </div>
        {isExpanded && hasChildren ? (
          <ul className="mt-2 space-y-1">
            {children.map((childRoom) => renderManagedRoomBranch(childRoom, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  }, [
    activeTheme.subtle,
    childRoomsByParentId,
    expandedManagedRooms,
    handleOpenRoom,
    handleToggleExpandedManagedRoom,
    joinedRoomIds
  ]);

  if (loadingHub) {
    return (
      <div className={`h-full w-full grid place-items-center ${activeTheme.shell}`}>
        <div className="w-full max-w-md space-y-3 px-4">
          <div className={`h-4 w-3/5 animate-pulse rounded ${activeTheme.subtle}`} />
          <div className={`h-3 w-4/5 animate-pulse rounded ${activeTheme.subtle}`} />
          <div className={`h-3 w-2/5 animate-pulse rounded ${activeTheme.subtle}`} />
          <p className="mt-2 text-center text-sm opacity-60 font-outfit">Loading unified chat hub…</p>
        </div>
      </div>
    );
  }

  const chatMenuBar = (
    <header
      className={`mb-1 rounded-xl border shadow-sm backdrop-blur-sm lg:mb-2 ${activeTheme.panelGlass}`}
      data-chat-menu-bar
      data-testid="chat-page-header"
    >
      <div className="flex items-center">
        <nav className="min-w-0 flex flex-1 items-center overflow-x-auto">
          <button
            type="button"
            onClick={() => setMobileWorkspaceOpen(false)}
            className={[
              mobileWorkspaceOpen ? 'inline-flex' : 'hidden',
              `shrink-0 items-center gap-1 px-3 py-2 text-[11px] font-semibold lg:hidden opacity-70 hover:opacity-100`
            ].join(' ')}
            aria-label="Back to conversations"
          >
            <span aria-hidden="true">←</span>
            <span>Back</span>
          </button>

          <div
            className="inline-flex shrink-0 items-center"
            data-chat-channel-tabs
            role="tablist"
            aria-label="Chat channels"
          >
            {CHANNELS.map((channel) => {
              const channelDisabled = isGuestMode && channel.key === 'dm';
              return (
                <button
                  key={channel.key}
                  type="button"
                  disabled={channelDisabled}
                  onClick={() => {
                    if (channelDisabled) return;
                    setActiveChannel(channel.key);
                    setMobileWorkspaceOpen(false);
                  }}
                  className={[
                    'relative px-3 py-2 text-xs font-semibold tracking-wide transition-all duration-150',
                    activeChannel === channel.key ? 'opacity-100' : 'opacity-50 hover:opacity-80',
                    channelDisabled ? 'cursor-not-allowed opacity-30' : ''
                  ].join(' ')}
                  role="tab"
                  aria-selected={activeChannel === channel.key}
                  aria-disabled={channelDisabled}
                  style={activeChannel === channel.key ? { boxShadow: 'inset 0 -2px 0 currentColor' } : undefined}
                >
                  {channel.label}
                </button>
              );
            })}
          </div>

          {activeConversation?.type === 'dm' && activeConversationUser?.username ? (
            <a
              href={`/social?user=${encodeURIComponent(activeConversationUser.username)}`}
              className={`shrink-0 truncate px-2 py-1 text-[11px] font-semibold ${activeTheme.senderAccent} hover:opacity-80`}
              aria-label={`Open @${activeConversationUser.username} social page`}
            >
              @{activeConversationUser.username}
            </a>
          ) : null}

          {openChatTabs.length > 0 ? (
            <>
              <span className="mx-1 hidden h-4 w-px opacity-15 sm:inline-block" style={{ background: 'currentColor' }} />
              <div className="flex min-w-0 items-center gap-px" data-open-chat-tabs role="tablist" aria-label="Open chat conversations">
                {openChatTabs.map((conversation) => {
                  const conversationId = String(conversation._id);
                  const selected = conversationId === String(activeConversationId);
                  const label = getConversationLabel(conversation);
                  return (
                    <div
                      key={`open-chat-tab-${conversationId}`}
                      className={`flex shrink-0 items-stretch transition-all duration-150 ${selected ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}
                      style={selected ? { boxShadow: 'inset 0 -2px 0 currentColor' } : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => openConversationById(conversationId)}
                        className="inline-flex min-w-0 max-w-32 items-center gap-1 px-2 py-2 text-left text-[11px] font-medium"
                        data-open-chat-tab={label}
                        title={`${getChatTabTypeLabel(conversation)} · ${label}`}
                        role="tab"
                        aria-selected={selected}
                      >
                        <span aria-hidden="true" className="shrink-0 text-[9px] opacity-60">{getConversationTabIcon(conversation)}</span>
                        <span className="truncate">{label}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCloseOpenTab(conversationId)}
                        className="px-1 text-[10px] opacity-40 hover:opacity-100 transition-opacity"
                        aria-label={`Close ${label} tab`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {openChatTabs.length > 0 ? (
            <span className="ml-auto shrink-0 px-2 py-1 text-[10px] font-medium opacity-40">
              {openChatTabs.length}/{MAX_OPEN_CHAT_TABS}
            </span>
          ) : null}
        </nav>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setThemeMenuOpen((open) => !open);
            }}
            className="inline-flex items-center gap-1 px-3 py-2 text-[11px] font-medium opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Open chat theme menu"
            aria-expanded={themeMenuOpen}
          >
            <span aria-hidden="true">🎨</span>
            <span className="hidden sm:inline">Theme</span>
            <span aria-hidden="true" className="text-[9px]">{themeMenuOpen ? '▴' : '▾'}</span>
          </button>
          {themeMenuOpen ? (
            <div
              className={`absolute right-0 top-[calc(100%+0.25rem)] z-[100] min-w-44 rounded-lg border p-1 text-xs shadow-xl ${activeTheme.panelGlass}`}
              onClick={(event) => event.stopPropagation()}
            >
              {CHAT_THEMES.map((themeOption) => (
                <button
                  key={themeOption.key}
                  type="button"
                  onClick={() => {
                    handleThemeChange(themeOption.key);
                    setThemeMenuOpen(false);
                  }}
                  className={[
                    'flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition hover:opacity-85',
                    theme === themeOption.key ? `${activeTheme.subtle} font-semibold` : ''
                  ].join(' ')}
                >
                  <span>{themeOption.label}</span>
                  {theme === themeOption.key ? <span>✓</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <label className="sr-only" htmlFor="chat-theme-select-fallback">Theme</label>
        <select
          id="chat-theme-select-fallback"
          value={theme}
          onChange={(event) => handleThemeChange(event.target.value)}
          className="sr-only"
        >
          {CHAT_THEMES.map((themeOption) => (
            <option key={themeOption.key} value={themeOption.key}>
              {themeOption.label}
            </option>
          ))}
        </select>
      </div>

      {activeConversation?.type === 'dm' ? (
        <div
          className="mt-0.5 truncate text-[10px] leading-tight opacity-60"
          title={profile?.hasPGP
            ? 'BYO PGP mode: incoming DM envelopes are encrypted to your public key; server admins cannot decrypt content.'
            : 'SocialSecure-generated key mode: DM content is E2EE and decrypts only after you unlock with your encryption password.'}
        >
          {profile?.hasPGP
            ? 'BYO PGP mode: incoming DM envelopes are encrypted to your public key; server admins cannot decrypt content.'
            : 'SocialSecure-generated key mode: DM content is E2EE and decrypts only after you unlock with your encryption password.'}
        </div>
      ) : null}
    </header>
  );

  return (
    <div className={`h-full w-full min-h-0 overflow-hidden flex flex-col ${activeTheme.shell}`}>
      <div
        className="grid flex-1 min-h-0 grid-cols-1 gap-1 p-1 sm:gap-2 sm:p-2 md:gap-3 md:p-3 lg:grid-cols-[2.6fr_8fr_2.2fr]"
        data-testid="chat-layout-grid"
      >
        <aside
          className={[
            mobileWorkspaceOpen ? 'hidden' : 'flex',
            'min-h-0 flex-col rounded-2xl border p-1.5 sm:p-2 md:p-3 lg:flex',
            activeTheme.panel
          ].join(' ')}
        >
          <div className="sticky top-0 z-10 space-y-2 pb-2">
            <h3 className="font-semibold">Conversations</h3>
          </div>

          <div className="mt-2 space-y-3 overflow-y-auto pr-1">
            {activeChannel === 'dm' ? (
              <>
                <section className={`rounded border p-2 ${activeTheme.panelGlass}`}>
                  <div className="flex items-center gap-2">
                    <input
                      value={dmQuery}
                      onChange={(event) => setDmQuery(event.target.value)}
                      className={`w-full rounded-lg border px-3 py-2 text-sm ${activeTheme.input}`}
                      placeholder="Search conversations..."
                    />
                    <button
                      type="button"
                      onClick={() => setNewDmPickerOpen((open) => !open)}
                      className={`h-9 w-9 rounded-lg border text-lg leading-none ${activeTheme.subtle}`}
                      aria-label="Start a new direct message"
                    >
                      +
                    </button>
                  </div>
                  {newDmPickerOpen ? (
                    <div className={`mt-2 rounded-lg border p-2 ${activeTheme.panel}`}>
                      <label className="text-xs font-semibold block">New conversation</label>
                      <input
                        value={newDmQuery}
                        onChange={(event) => setNewDmQuery(event.target.value)}
                        className={`mt-1 w-full rounded border p-2 text-sm ${activeTheme.input}`}
                        placeholder="Filter friends..."
                      />
                      {dmFriendsLoading ? <p className="mt-2 text-xs opacity-80">Loading friends...</p> : null}
                      {!dmFriendsLoading && filteredFriendCandidates.length === 0 ? <p className="mt-2 text-xs opacity-80">No matching friends.</p> : null}
                      {filteredFriendCandidates.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-xs">
                        {filteredFriendCandidates.slice(0, MAX_DM_FRIEND_PICKER_RESULTS).map((friend) => (
                            <li key={String(friend._id)} className="flex items-center justify-between gap-2 rounded border p-1.5">
                              <span>@{friend.username || friend.realName || 'friend'}</span>
                              <button
                                type="button"
                                onClick={() => handleStartDM(friend._id)}
                                className={`rounded border px-2 py-1 ${activeTheme.subtle}`}
                              >
                                Start
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </section>
                <section className={`rounded border p-2 ${activeTheme.panelGlass}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-80">Direct Messages</p>
                  {filteredDmConversations.length === 0 ? (
                    <p className="mt-2 text-xs opacity-80">No conversations available here yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {filteredDmConversations.map((conversation) => {
                        const selected = String(conversation._id) === String(activeConversationId);
                        const status = getPresenceState(getConversationUserPresence(conversation), presenceReferenceTime);
                        return (
                          <li key={String(conversation._id)}>
                            <div className={`flex items-stretch rounded-xl border text-sm transition ${selected ? activeTheme.subtle : 'hover:opacity-85'}`}>
                              <button
                                type="button"
                                onClick={() => {
                                  openConversationById(String(conversation._id));
                                }}
                                className="min-w-0 flex-1 px-2.5 py-2 text-left"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate font-medium">{getConversationLabel(conversation)}</span>
                                  <span className="inline-flex items-center gap-1 text-[10px] font-jetbrains uppercase">
                                    {conversation.__hasUnread ? <span className="h-2 w-2 rounded-full bg-sky-500" /> : null}
                                    <span className={`h-2 w-2 rounded-full ${status.tone}`} />
                                    <span>{status.label}</span>
                                  </span>
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteConversation(String(conversation._id));
                                }}
                                className="shrink-0 border-l px-2 text-[10px] opacity-60 hover:opacity-100"
                                aria-label={`Delete conversation with ${getConversationLabel(conversation)}`}
                                title="Delete conversation"
                              >
                                ✕
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </>
            ) : (
              <>
                {/* ── Quick Access ────────────────────────────── */}
                <section className={`rounded-xl border p-3 ${activeTheme.panelGlass}`}>
                  <h3 className="text-sm font-semibold">Quick Access</h3>
                  <div className="mt-2 space-y-1">
                    {hubData?.zip?.current ? (
                      <button
                        type="button"
                        onClick={() => {
                          openConversationById(String(hubData.zip.current._id));
                        }}
                        className={`w-full rounded-lg border px-2.5 py-2 text-left text-sm ${activeTheme.subtle}`}
                        data-quick-access-room={getConversationLabel(hubData.zip.current)}
                      >
                        {getConversationLabel(hubData.zip.current)}
                      </button>
                    ) : null}
                    {relationalQuickRooms.map((room) => (
                      <button
                        key={String(room._id)}
                        type="button"
                        onClick={() => handleOpenRoom(room)}
                        className={`w-full rounded-lg border px-2.5 py-2 text-left text-sm ${activeTheme.subtle}`}
                        data-quick-access-room={room.name}
                      >
                        <span className="block font-medium">{room.name}</span>
                        <span className="block text-[10px] uppercase tracking-[0.12em] opacity-70">{room.type}</span>
                      </button>
                    ))}
                    {nearbyCityQuickRooms.length > 0 ? (
                      <div className={`mt-1 rounded-lg border p-2 ${activeTheme.panel}`}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-80">Nearby cities</p>
                        <div className="mt-2 space-y-1">
                          {nearbyCityQuickRooms.map((room) => (
                            <button
                              key={String(room._id)}
                              type="button"
                              onClick={() => handleOpenRoom(room)}
                              className={`w-full rounded-lg border px-2.5 py-2 text-left text-sm ${activeTheme.subtle}`}
                              data-quick-access-city={room.name}
                            >
                              <span className="block font-medium">{room.name}</span>
                              <span className="block text-[10px] opacity-70">
                                {room.distanceMiles ? `${room.distanceMiles} mi away` : 'Nearby city room'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>

                {/* ── Find Room ───────────────────────────────── */}
                <section className={`rounded-xl border p-3 ${activeTheme.panelGlass}`}>
                  <h3 className="text-sm font-semibold">Find Room</h3>
                  <div className="relative mt-2">
                    <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs opacity-50" aria-hidden="true">🔍</span>
                    <input
                      value={roomQuery}
                      onChange={(event) => setRoomQuery(event.target.value)}
                      className={`w-full rounded-lg border py-2 pl-8 pr-3 text-sm ${activeTheme.input}`}
                      placeholder="Search by room or location..."
                    />
                  </div>
                  {allChatRoomsLoading ? <p className="mt-2 text-xs opacity-80">Loading rooms...</p> : null}
                  {favoriteRooms.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-[10px] font-semibold uppercase opacity-80">Favorites</p>
                      <ul className="mt-1 space-y-1 text-xs">
                        {favoriteRooms.slice(0, MAX_FAVORITE_ROOMS).map((room) => (
                          <li key={`favorite-${String(room._id)}`} className="flex items-center justify-between gap-2 rounded border p-1.5">
                            <button type="button" onClick={() => handleOpenRoom(room)} className="truncate text-left hover:underline">{room.name}</button>
                            <button type="button" onClick={() => handleToggleFavoriteRoom(room._id)} className={`rounded border px-1.5 py-0.5 ${activeTheme.subtle}`}>Remove</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {!roomQuery.trim() ? (
                    <p className="mt-2 text-xs opacity-80">Search to find a room when you need one.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-xs">
                      {chatRoomsByQuery.length === 0 ? <li className="rounded border p-1.5 opacity-80">No matching rooms found.</li> : null}
                      {chatRoomsByQuery.map((room) => {
                        const roomId = String(room._id);
                        const joined = Boolean(joinedRoomIds[roomId]);
                        const favorited = Boolean(favoriteRoomIds[roomId]);
                        return (
                          <li key={roomId} className="rounded border p-1.5" data-room-search-result={room.name}>
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenRoom(room)}
                                aria-label={`Open ${room.name} room`}
                                className="min-w-0 flex-1 text-left"
                              >
                                <p className="truncate font-semibold">{room.name}</p>
                                <p className="truncate opacity-75">{[room.city, room.state, room.country].filter(Boolean).join(', ') || room.type}</p>
                              </button>
                              <div className="flex items-center gap-1">
                                {!joined ? (
                                  <button type="button" onClick={() => handleOpenRoom(room)} className={`rounded border px-2 py-1 ${activeTheme.subtle}`}>Join</button>
                                ) : (
                                  <span className="text-[10px] font-semibold opacity-80">Joined</span>
                                )}
                                {joined ? (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleFavoriteRoom(roomId)}
                                    className={`rounded border px-2 py-1 ${activeTheme.subtle}`}
                                  >
                                    {favorited ? '★' : '☆'}
                                  </button>
                                ) : null}
                                {canDeleteRoom(room) ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRoom(room)}
                                    className="rounded border px-2 py-1 text-rose-700"
                                    aria-label={`Delete ${room.name} room`}
                                  >
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {/* ── State Rooms ─────────────────────────────── */}
                <section className={`rounded-xl border p-3 ${activeTheme.panelGlass}`}>
                  <button
                    type="button"
                    onClick={() => setStateChatsOpen((open) => !open)}
                    className="flex w-full items-center justify-between gap-2 text-left"
                    aria-expanded={stateChatsOpen}
                    aria-controls="chat-state-discovery-list"
                  >
                    <h3 className="text-sm font-semibold">State Rooms</h3>
                    <span className="text-xs opacity-70" aria-hidden="true">{stateChatsOpen ? '▾' : '▸'}</span>
                  </button>
                  {stateChatsOpen ? (
                    <ul id="chat-state-discovery-list" className="mt-2 space-y-1 text-xs">
                      {managedStateRooms.length === 0 ? <li className="opacity-75">No state chats available.</li> : null}
                      {managedStateRooms.map((room) => renderManagedRoomBranch(room))}
                    </ul>
                  ) : null}
                </section>

                {/* ── Topics ──────────────────────────────────── */}
                <section className={`rounded-xl border p-3 ${activeTheme.panelGlass}`}>
                  <button
                    type="button"
                    onClick={() => setTopicsOpen((open) => !open)}
                    className="flex w-full items-center justify-between gap-2 text-left"
                    aria-expanded={topicsOpen}
                    aria-controls="chat-topic-discovery-list"
                  >
                    <h3 className="text-sm font-semibold">Topics</h3>
                    <span className="text-xs opacity-70" aria-hidden="true">{topicsOpen ? '▾' : '▸'}</span>
                  </button>
                  {topicsOpen ? (
                    <ul id="chat-topic-discovery-list" className="mt-2 space-y-1 text-xs">
                      {managedTopicRooms.length === 0 ? <li className="opacity-75">No topic chats available.</li> : null}
                      {managedTopicRooms.map((room) => (
                        <React.Fragment key={String(room._id)}>
                          {renderManagedRoomBranch(room, 0, { 'data-topic-room': room.name })}
                        </React.Fragment>
                      ))}
                    </ul>
                  ) : null}
                </section>

                {/* ── Admin Panel ─────────────────────────────── */}
                {profile?.isAdmin ? (
                  <section className={`rounded-xl border p-3 ${activeTheme.panelGlass}`} data-testid="chat-admin-control-panel">
                    <button
                      type="button"
                      onClick={() => setAdminPanelOpen((open) => !open)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                      aria-expanded={adminPanelOpen}
                      aria-controls="chat-admin-control-panel-body"
                    >
                      <h3 className="text-sm font-semibold">Admin Panel</h3>
                      <span className="text-xs opacity-70" aria-hidden="true">{adminPanelOpen ? '▾' : '▸'}</span>
                    </button>
                    <p className="mt-1 text-xs opacity-75">Add, edit, remove, and reorder state/topic rooms and nested sub-rooms.</p>
                    {editingRoomId ? (
                      <button
                        type="button"
                        onClick={resetAdminRoomForm}
                        className={`mt-1 rounded border px-2 py-1 text-xs ${activeTheme.subtle}`}
                      >
                        Cancel edit
                      </button>
                    ) : null}
                    {adminPanelOpen ? (
                    <div id="chat-admin-control-panel-body">
                    <form className="mt-2 space-y-2" onSubmit={handleSaveAdminRoom}>
                      <input
                        value={adminRoomForm.name}
                        onChange={(event) => handleAdminRoomFormChange('name', event.target.value)}
                        className={`w-full rounded-lg border p-2 text-sm ${activeTheme.input}`}
                        placeholder="Room name"
                        aria-label="Admin room name"
                      />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <select
                          value={adminRoomForm.discoveryGroup}
                          onChange={(event) => handleAdminRoomFormChange('discoveryGroup', event.target.value)}
                          className={`rounded-lg border p-2 text-sm ${activeTheme.input}`}
                          aria-label="Admin room list"
                        >
                          {ROOM_DISCOVERY_GROUP_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <select
                          value={adminRoomForm.type}
                          onChange={(event) => handleAdminRoomFormChange('type', event.target.value)}
                          className={`rounded-lg border p-2 text-sm ${activeTheme.input}`}
                          aria-label="Admin room type"
                        >
                          {ROOM_DISCOVERY_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <select
                          value={adminRoomForm.parentRoomId}
                          onChange={(event) => handleAdminRoomFormChange('parentRoomId', event.target.value)}
                          className={`rounded-lg border p-2 text-sm ${activeTheme.input}`}
                          aria-label="Admin room parent"
                        >
                          <option value="">Top-level room</option>
                          {roomParentOptions.map((room) => (
                            <option key={String(room._id)} value={String(room._id)}>
                              {`${getRoomDiscoveryGroup(room) === 'states' ? 'State' : 'Topic'} · ${room.name}`}
                            </option>
                          ))}
                        </select>
                        <input
                          value={adminRoomForm.state}
                          onChange={(event) => handleAdminRoomFormChange('state', event.target.value)}
                          className={`rounded-lg border p-2 text-sm ${activeTheme.input}`}
                          placeholder="State code (optional)"
                          aria-label="Admin room state"
                        />
                        <input
                          value={adminRoomForm.city}
                          onChange={(event) => handleAdminRoomFormChange('city', event.target.value)}
                          className={`rounded-lg border p-2 text-sm ${activeTheme.input}`}
                          placeholder="City label (optional)"
                          aria-label="Admin room city"
                        />
                        <input
                          value={adminRoomForm.county}
                          onChange={(event) => handleAdminRoomFormChange('county', event.target.value)}
                          className={`rounded-lg border p-2 text-sm ${activeTheme.input}`}
                          placeholder="County label (optional)"
                          aria-label="Admin room county"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={adminRoomForm.defaultLanding}
                          onChange={(event) => handleAdminRoomFormChange('defaultLanding', event.target.checked)}
                        />
                        <span>Use as default room when people open /chat</span>
                      </label>
                      <button
                        type="submit"
                        className={`w-full rounded border px-3 py-2 text-sm font-semibold ${activeTheme.subtle}`}
                        disabled={adminRoomSaving}
                      >
                        {adminRoomSaving ? 'Saving…' : editingRoomId ? 'Save room changes' : 'Add room'}
                      </button>
                    </form>
                    <div className="mt-3 space-y-3 text-xs">
                      {[
                        { title: 'State room order', rooms: managedStateRooms },
                        { title: 'Topic room order', rooms: managedTopicRooms }
                      ].map((section) => (
                        <div key={section.title}>
                          <p className="font-semibold opacity-80">{section.title}</p>
                          {section.rooms.length === 0 ? (
                            <p className="mt-1 opacity-75">No rooms in this list.</p>
                          ) : (
                            <ul className="mt-1 space-y-1">
                              {section.rooms.map((room) => {
                                const roomId = String(room._id);
                                const processing = adminProcessingRoomIds.has(roomId);
                                return (
                                  <li key={`admin-${roomId}`} className="rounded border px-2 py-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="truncate font-medium">{room.name}</p>
                                        <p className="truncate text-[10px] uppercase opacity-70">
                                          {room.defaultLanding ? 'Default room' : room.type}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button type="button" onClick={() => handleMoveRoom(roomId, 'up')} className={`rounded border px-1.5 py-0.5 ${activeTheme.subtle}`} disabled={processing}>↑</button>
                                        <button type="button" onClick={() => handleMoveRoom(roomId, 'down')} className={`rounded border px-1.5 py-0.5 ${activeTheme.subtle}`} disabled={processing}>↓</button>
                                        <button type="button" onClick={() => handleEditRoom(room)} className={`rounded border px-1.5 py-0.5 ${activeTheme.subtle}`}>Edit</button>
                                        <button type="button" onClick={() => handleDeleteRoom(room)} className="rounded border px-1.5 py-0.5 text-rose-700">Remove</button>
                                      </div>
                                    </div>
                                    {(childRoomsByParentId[roomId] || []).length > 0 ? (
                                      <ul className="mt-2 space-y-1 border-l pl-2">
                                        {(childRoomsByParentId[roomId] || []).slice().sort(sortRoomsByDiscoveryOrder).map((childRoom) => {
                                          const childId = String(childRoom._id);
                                          const childProcessing = adminProcessingRoomIds.has(childId);
                                          return (
                                            <li key={`admin-child-${childId}`} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                                              <div className="min-w-0">
                                                <p className="truncate">{childRoom.name}</p>
                                                <p className="truncate text-[10px] uppercase opacity-70">{childRoom.type}</p>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                <button type="button" onClick={() => handleMoveRoom(childId, 'up')} className={`rounded border px-1.5 py-0.5 ${activeTheme.subtle}`} disabled={childProcessing}>↑</button>
                                                <button type="button" onClick={() => handleMoveRoom(childId, 'down')} className={`rounded border px-1.5 py-0.5 ${activeTheme.subtle}`} disabled={childProcessing}>↓</button>
                                                <button type="button" onClick={() => handleEditRoom(childRoom)} className={`rounded border px-1.5 py-0.5 ${activeTheme.subtle}`}>Edit</button>
                                                <button type="button" onClick={() => handleDeleteRoom(childRoom)} className="rounded border px-1.5 py-0.5 text-rose-700">Remove</button>
                                              </div>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                    </div>
                    ) : null}
                  </section>
                ) : null}

              </>
            )}
          </div>
        </aside>

        <section
          className={[
            mobileWorkspaceOpen ? 'flex' : 'hidden',
            'min-h-0 flex-col rounded-2xl border px-1.5 pb-1.5 pt-1 sm:px-2 sm:pb-2 md:p-3 lg:flex',
            activeTheme.panel
          ].join(' ')}
          data-testid="chat-workspace-panel"
        >
          {chatMenuBar}
          {messagesError ? (
            <div className={`mb-3 rounded-lg border p-2 text-sm ${activeTheme.subtle}`}>
              <span className="mr-1.5" aria-hidden="true">⚠️</span>{messagesError}
            </div>
          ) : null}

          <div className="relative flex-1 min-h-0 overflow-hidden" data-testid="chat-message-panel">
            <ChatMessageList
              conversationId={activeConversationId}
              conversationType={activeConversation?.type}
              messages={renderedMessages}
              loading={messagesLoading}
              profile={profile}
              theme={activeTheme}
              onOpenUserMenu={openUserContextMenu}
              reactionsByMessageId={reactionByMessageId}
              reactionOptions={MESSAGE_REACTIONS}
              onToggleReaction={handleToggleMessageReaction}
              reactionsDisabled={isGuestMode}
              longPressDelayMs={LONG_PRESS_DELAY_MS}
              hasMoreMessages={messagesHasMore}
              onLoadOlderMessages={handleLoadOlderMessages}
              onVisibleMessageIdsChange={handleVisibleMessageIdsChange}
              showAdminActions={!!profile?.isAdmin && activeConversation?.type !== 'dm'}
              adminMutedUserIds={adminMutedUserIds}
              adminProcessingMessageIds={adminProcessingMessageIds}
              adminProcessingUserIds={adminProcessingUserIds}
              onToggleAdminMessageRemoval={handleToggleAdminMessageRemoval}
              onToggleAdminUserMute={handleToggleAdminUserMute}
              onAdminDeleteMessage={handleAdminDeleteMessage}
              onUsernameHoverStart={handleUsernameHoverStart}
              onUsernameHoverEnd={handleUsernameHoverEnd}
            />
            {activeConversation?.type === 'dm' && activeConversationId && !dmUnlockedByConversation[String(activeConversationId)] ? (
              <div
                className={`absolute inset-2 z-20 flex items-center justify-center rounded-2xl border p-3 backdrop-blur-sm sm:inset-3 sm:p-4 ${activeTheme.panelGlass}`}
                data-testid="dm-lock-overlay"
              >
                <form
                  className={`w-full max-w-md rounded-2xl border bg-black/20 p-3 shadow-2xl backdrop-blur-md sm:p-4 ${activeTheme.panel}`}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await handleUnlockActiveDM();
                  }}
                >
                  <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border text-2xl sm:h-14 sm:w-14 sm:text-3xl ${activeTheme.subtle}`}>
                    🔒
                  </div>
                  <h3 className="text-center text-base font-semibold sm:text-lg">Encrypted conversation locked</h3>
                  <p className="mt-2 text-center text-xs opacity-80 sm:text-sm">
                    Enter your encryption password to reveal this direct message. Press Enter or use Unlock when you're ready.
                  </p>
                  <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.16em]" htmlFor="dm-unlock-password">
                    Encryption password
                  </label>
                  <PasswordField
                    id="dm-unlock-password"
                    value={passwordInput}
                    onChange={(event) => setPasswordInput(event.target.value)}
                    className={`mt-2 w-full rounded-xl px-3 py-2 text-sm ${activeTheme.input}`}
                    placeholder="Enter password to unlock"
                    aria-label="Encryption password"
                    disabled={unlockingDm}
                  />
                  <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.16em]" htmlFor="password-modal-unlock-duration">
                    Unlock duration
                  </label>
                  <select
                    id="password-modal-unlock-duration"
                    value={String(unlockDurationMinutes)}
                    onChange={(event) => setUnlockDurationMinutes(Number(event.target.value) || DEFAULT_UNLOCK_DURATION_MINUTES)}
                    className={`mt-2 w-full rounded-xl px-3 py-2 text-sm ${activeTheme.input}`}
                    disabled={unlockingDm}
                  >
                    {UNLOCK_DURATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className={`mt-4 w-full rounded-xl px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${activeTheme.accent}`}
                    disabled={unlockingDm}
                  >
                    {unlockingDm ? 'Unlocking…' : 'Unlock'}
                  </button>
                </form>
              </div>
            ) : null}
          </div>

          <div className="mt-1 space-y-1">
            {localTyping ? (
              <div className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-jetbrains opacity-80 ${activeTheme.subtle}`}>
                <span className="animate-pulse">●</span>
                <span className="animate-pulse [animation-delay:120ms]">●</span>
                <span className="animate-pulse [animation-delay:240ms]">●</span>
                You are typing...
              </div>
            ) : null}

            <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" data-testid="chat-composer-shell">
              <ChatComposerBar
                composerValue={composerValue}
                setComposerValue={setComposerValue}
                onSubmit={handleSend}
                disabled={
                  isGuestMode
                  || !activeConversationId
                  || (activeConversation?.type === 'dm' && (
                    !dmUnlockedByConversation[String(activeConversationId)]
                  ))
                }
                sending={sending}
                theme={activeTheme}
                onComposerError={(message) => toast.error(message)}
                secondaryActionLabel={activeConversation?.type === 'dm' ? 'Lock' : ''}
                onSecondaryAction={activeConversation?.type === 'dm' ? handleLockActiveDM : undefined}
                secondaryActionDisabled={activeConversation?.type === 'dm' && !dmUnlockedByConversation[String(activeConversationId)]}
              />
            </div>
          </div>
        </section>

        <aside className={`hidden min-h-0 flex-col rounded-2xl border p-2 md:p-3 lg:flex ${activeTheme.panel}`}>
          {activeConversation?.type === 'dm' ? (
            <>
              <div className={`sticky top-0 z-10 rounded border p-3 ${activeTheme.panelGlass}`}>
                <h3 className="font-semibold uppercase tracking-[0.1em]">Participants</h3>
                {activeConversation ? (
                  <>
                    <p className="text-xs opacity-80">{getConversationLabel(activeConversation)}</p>
                    <p className="mt-1 text-[11px] font-mono opacity-80">
                      {`${roomUsers.length || (Array.isArray(activeConversation?.participants) ? activeConversation.participants.length : 0) || 0} participants`}
                    </p>
                  </>
                ) : (
                  <p className="text-xs opacity-80">Select a conversation to view details.</p>
                )}
                <p className="mt-2 text-xs opacity-80">This panel stays focused on everyone inside the direct message.</p>
              </div>

              <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
                <section className={`rounded border p-2 ${activeTheme.panelGlass}`}>
                  <h4 className="text-sm font-semibold">People in this DM</h4>
                  <p className="mt-1 text-[11px] opacity-80">
                    Click, right-click, or long-press a user for quick actions.
                  </p>
                  <div className="mt-2 rounded border overflow-auto h-full min-h-[20rem]">
                    {roomUsersLoading ? (
                      <div className="space-y-3 p-2">
                        {[1, 2, 3].map((i) => (
                          <div key={`dm-user-skeleton-${i}`} className="flex items-center gap-3 animate-pulse">
                            <span className={`inline-block h-9 w-9 shrink-0 rounded-full ${activeTheme.subtle}`} />
                            <div className="flex-1 space-y-1.5">
                              <div className={`h-3 rounded ${activeTheme.subtle}`} style={{ width: `${55 + (i * 11) % 30}%` }} />
                              <div className={`h-2.5 rounded ${activeTheme.subtle}`} style={{ width: `${35 + (i * 7) % 25}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : roomUsers.length === 0 ? (
                      <p className="p-2 text-xs opacity-80">No users to display.</p>
                    ) : (
                      <ul className="divide-y">
                        {roomUsers.map((user) => {
                          const presenceState = getPresenceState(user.presence, presenceReferenceTime);
                          return (
                            <li
                              key={String(user._id)}
                              className="flex cursor-pointer items-center gap-3 p-2 text-sm"
                              onClick={(event) => openUserContextMenu(event, user)}
                              onContextMenu={(event) => openUserContextMenu(event, user)}
                              onTouchStart={(event) => {
                                const touch = event.touches?.[0];
                                if (!touch) return;
                                if (userLongPressTimerRef.current) clearTimeout(userLongPressTimerRef.current);
                                userLongPressTimerRef.current = setTimeout(() => {
                                  openUserContextMenu(event, user, { x: touch.clientX, y: touch.clientY });
                                }, LONG_PRESS_DELAY_MS);
                              }}
                              onTouchEnd={() => {
                                if (userLongPressTimerRef.current) {
                                  clearTimeout(userLongPressTimerRef.current);
                                  userLongPressTimerRef.current = null;
                                }
                              }}
                            >
                              <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold overflow-hidden ${activeTheme.subtle}`}>
                                {user.avatarUrl ? (
                                  <img src={user.avatarUrl} alt={`@${user.username || 'user'}`} className="h-full w-full rounded-full object-cover" />
                                ) : (
                                  String(user.username || user.realName || 'user').slice(0, 1).toUpperCase()
                                )}
                              </span>
                              <div className="min-w-0">
                                <a
                                  href={`/social?user=${encodeURIComponent(user.username || user._id)}`}
                                  className="truncate font-semibold hover:underline block"
                                  onMouseEnter={(event) => {
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    handleUsernameHoverStart(user, rect);
                                  }}
                                  onMouseLeave={handleUsernameHoverEnd}
                                >
                                  @{user.username || user.realName || 'user'}
                                </a>
                                <p className="truncate text-[11px] opacity-75">
                                  {String(user._id) === String(profile?._id) ? 'You' : 'Available in this conversation'}
                                </p>
                                <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] opacity-75">
                                  <span className={`h-2 w-2 rounded-full ${presenceState.tone}`} />
                                  <span>{presenceState.description}</span>
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </section>
              </div>
            </>
          ) : (
            <>
              <div className={`sticky top-0 z-10 rounded border p-2 ${activeTheme.panelGlass}`}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.1em]">Users in Room</h3>
                {activeConversation ? (
                  <p className="mt-1 text-[11px] font-jetbrains opacity-80">
                    {getConversationLabel(activeConversation)} &middot;
                    <span className="ml-1" aria-hidden="true">🟢</span>
                    <span className="ml-0.5">{roomUsers.length} {roomUsers.length === 1 ? 'user' : 'users'}</span>
                    <span className="ml-1" aria-hidden="true">👥</span>
                    <span className="sr-only">online</span>
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] opacity-80">Select a room to see who's here.</p>
                )}
              </div>

              <div className="mt-2 min-h-0 flex-1 overflow-y-auto" data-testid="room-user-list">
                {roomUsersLoading ? (
                  <div className="space-y-2 px-2 py-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={`user-skeleton-${i}`} className="flex items-center gap-2 animate-pulse">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${activeTheme.subtle}`} />
                        <span className={`h-3 rounded ${activeTheme.subtle}`} style={{ width: `${50 + (i * 13) % 35}%` }} />
                      </div>
                    ))}
                  </div>
                ) : roomUsers.length === 0 ? (
                  <p className="px-2 py-3 text-xs opacity-80">No users to display.</p>
                ) : (
                  <ul>
                    {sortedRoomUsers.friends.map((user) => (
                      <li
                        key={String(user._id)}
                        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs ${activeTheme.roomHover}`}
                        onClick={(event) => openUserContextMenu(event, user)}
                        onContextMenu={(event) => openUserContextMenu(event, user)}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${getPresenceState(user.presence, presenceReferenceTime).tone}`} />
                        <a
                          href={`/social?user=${encodeURIComponent(user.username || user._id)}`}
                          className="truncate hover:underline"
                          onMouseEnter={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            handleUsernameHoverStart(user, rect);
                          }}
                          onMouseLeave={handleUsernameHoverEnd}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {user.username || user.realName || 'user'}
                        </a>
                      </li>
                    ))}
                    {sortedRoomUsers.friends.length > 0 && sortedRoomUsers.others.length > 0 ? (
                      <li aria-hidden="true" className="my-1 border-b opacity-30" />
                    ) : null}
                    {sortedRoomUsers.others.map((user) => (
                      <li
                        key={String(user._id)}
                        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs ${activeTheme.roomHover}`}
                        onClick={(event) => openUserContextMenu(event, user)}
                        onContextMenu={(event) => openUserContextMenu(event, user)}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${getPresenceState(user.presence, presenceReferenceTime).tone}`} />
                        <a
                          href={`/social?user=${encodeURIComponent(user.username || user._id)}`}
                          className="truncate hover:underline"
                          onMouseEnter={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            handleUsernameHoverStart(user, rect);
                          }}
                          onMouseLeave={handleUsernameHoverEnd}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {user.username || user.realName || 'user'}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
      {userContextMenu.open && userContextMenu.user ? (
        <div
          className={`fixed z-50 w-56 rounded border p-1 shadow-xl ${activeTheme.panelGlass}`}
          style={{ left: userContextMenu.x, top: userContextMenu.y }}
          role="menu"
          aria-label="User actions menu"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="w-full rounded px-2 py-1 text-left text-sm hover:opacity-80"
            onClick={async () => {
              await handleStartDM(userContextMenu.user._id);
              closeUserContextMenu();
            }}
          >
            Send direct message
          </button>
          <button
            type="button"
            className="w-full rounded px-2 py-1 text-left text-sm hover:opacity-80"
            onClick={() => {
              handleViewUserSocial(userContextMenu.user);
              closeUserContextMenu();
            }}
          >
            View user social
          </button>
          <button
            type="button"
            className="w-full rounded px-2 py-1 text-left text-sm hover:opacity-80 disabled:opacity-50"
            disabled={String(userContextMenu.user._id) === String(profile?._id)}
            onClick={async () => {
              await handleRequestFriendship(userContextMenu.user);
              closeUserContextMenu();
            }}
          >
            Request friendship
          </button>
          <button
            type="button"
            className="w-full rounded px-2 py-1 text-left text-sm hover:opacity-80 disabled:opacity-50"
            disabled={String(userContextMenu.user._id) === String(profile?._id)}
            onClick={async () => {
              await handleBlockIgnore(userContextMenu.user);
              closeUserContextMenu();
            }}
          >
            Block/ignore
          </button>
        </div>
      ) : null}
      {userHoverPopup.visible && userHoverPopup.rect ? (() => {
        const pd = userHoverPopup.profileData;
        const prefs = pd?.socialPagePreferences || {};
        const heroPrefs = prefs?.hero || {};
        const globalStyles = prefs?.globalStyles || {};
        const panelColor = globalStyles.panelColor || '#ffffff';
        const headerColor = globalStyles.headerColor || '#0f172a';
        const fontColor = globalStyles.fontColor || '#0f172a';
        const heroImg = heroPrefs.backgroundImage || pd?.bannerUrl || '';
        const profileImg = heroPrefs.profileImage || pd?.avatarUrl || '';
        const popupLeft = Math.min(userHoverPopup.rect.left, window.innerWidth - 260);
        const popupTop = userHoverPopup.rect.bottom + 4;
        const createdDate = pd?.createdAt ? new Date(pd.createdAt).toLocaleDateString() : '';
        return (
          <div
            className="fixed z-[60] w-60 rounded-lg border shadow-xl overflow-hidden"
            style={{ left: popupLeft, top: Math.min(popupTop, window.innerHeight - 340), backgroundColor: panelColor, color: fontColor }}
            data-testid="user-hover-popup"
            onMouseEnter={handleHoverPopupMouseEnter}
            onMouseLeave={handleHoverPopupMouseLeave}
          >
            {userHoverPopup.loading ? (
              <div className="p-4 text-center text-xs opacity-60">Loading...</div>
            ) : pd ? (
              <>
                <div className="relative h-20 w-full" style={{ backgroundColor: headerColor }}>
                  {heroImg ? <img src={heroImg} alt={`Header image for ${pd.username || 'user'}`} className="h-full w-full object-cover" /> : null}
                  <div className="absolute -bottom-5 left-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white text-sm font-bold overflow-hidden" style={{ borderColor: panelColor }}>
                      {profileImg ? <img src={profileImg} alt={`${pd.username || 'user'} profile`} className="h-full w-full rounded-full object-cover" /> : (pd.username || 'U').slice(0, 1).toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="px-3 pt-7 pb-3 text-xs" style={{ color: fontColor }}>
                  <p className="font-bold text-sm truncate">@{pd.username || 'user'}</p>
                  {pd.realName ? <p className="truncate opacity-75">{pd.realName}</p> : null}
                  {pd.zipCode ? <p className="mt-1 opacity-60">📍 {pd.zipCode}</p> : null}
                  {createdDate ? <p className="mt-0.5 opacity-60">Joined {createdDate}</p> : null}
                  <a href={`/social?user=${encodeURIComponent(pd.username || pd._id)}`} className="mt-2 block text-center rounded border px-2 py-1 text-[11px] font-semibold hover:opacity-80" style={{ borderColor: headerColor, color: headerColor }}>
                    View Social Page
                  </a>
                </div>
              </>
            ) : (
              <div className="p-4 text-center text-xs opacity-60">Could not load profile</div>
            )}
          </div>
        );
      })() : null}
    </div>
  );
}

export default Chat;
