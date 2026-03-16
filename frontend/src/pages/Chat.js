import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import ChatComposerBar from '../components/chat/ChatComposerBar';
import ChatMessageList from '../components/chat/ChatMessageList';
import { authAPI, chatAPI, friendsAPI, moderationAPI } from '../utils/api';
import { parseSlashCommand, runSlashCommand } from '../utils/chatCommands';
import { joinRealtimeRoom, leaveRealtimeRoom, onChatMessage } from '../utils/realtime';
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

const getPresenceState = (lastActiveAt) => {
  if (!lastActiveAt) return { label: 'Away', tone: 'bg-amber-400' };
  const ageMs = Date.now() - new Date(lastActiveAt).getTime();
  if (Number.isNaN(ageMs)) return { label: 'Away', tone: 'bg-amber-400' };
  return ageMs <= 5 * 60 * 1000
    ? { label: 'Online', tone: 'bg-emerald-400' }
    : { label: 'Away', tone: 'bg-amber-400' };
};

const DEFAULT_CHAT_THEME = 'midnight';
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
const normalizeId = (value) => String(value || '').trim();
const sortRoomsByName = (left, right) => String(left?.name || '').localeCompare(String(right?.name || ''));
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

function Chat() {
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
  const [expandedStateRooms, setExpandedStateRooms] = useState({});
  const [dmUnlockedByConversation, setDmUnlockedByConversation] = useState({});
  const [unlockDurationMinutes, setUnlockDurationMinutes] = useState(DEFAULT_UNLOCK_DURATION_MINUTES);
  const [unlockingDm, setUnlockingDm] = useState(false);
  const [dmFriends, setDmFriends] = useState([]);
  const [dmFriendsLoading, setDmFriendsLoading] = useState(false);
  const [openChatTabIds, setOpenChatTabIds] = useState([]);
  const search = window.location.search;
  const previousActiveChannelRef = useRef('zip');

  useEffect(() => {
    const requestedChannel = new URLSearchParams(search).get('tab');

    if (requestedChannel === 'dm') {
      setActiveChannel('dm');
      return;
    }

    // "rooms" is kept as a legacy alias that maps to the zip/rooms channel.
    if (requestedChannel === 'zip' || requestedChannel === 'rooms') {
      setActiveChannel('zip');
    }
  }, [search]);
  const [passwordInput, setPasswordInput] = useState('');
  const [reactionByMessageId, setReactionByMessageId] = useState({});
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
    [hubData?.zip?.current, ...(hubData?.zip?.nearby || []), ...(hubData?.dm || []), ...allChatRooms].forEach((entry) => {
      const entryId = normalizeId(entry?._id);
      if (!entryId) return;
      entries.set(entryId, entry);
    });
    return entries;
  }, [allChatRooms, hubData]);

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
    if (!profile?._id) return;
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
  }, [profile?._id]);

  useEffect(() => {
    if (!profile?._id || typeof chatAPI.getAllRooms !== 'function') return;
    let cancelled = false;
    setAllChatRoomsLoading(true);
    Promise.resolve()
      .then(() => chatAPI.syncLocationRooms?.())
      .catch(() => null)
      .then(() => chatAPI.getAllRooms(1, MAX_CHAT_ROOM_FETCH))
      .then(({ data }) => {
        if (cancelled) return;
        const rooms = Array.isArray(data?.rooms) ? data.rooms : [];
        setAllChatRooms(rooms);
        const nextJoinedIds = rooms.reduce((acc, room) => {
          const roomId = normalizeId(room?._id);
          if (!roomId) return acc;
          const members = Array.isArray(room?.members) ? room.members.map((memberId) => String(memberId)) : [];
          if (members.includes(String(profile?._id))) {
            acc[roomId] = true;
          }
          return acc;
        }, {});
        setJoinedRoomIds(nextJoinedIds);
      })
      .catch(() => {
        if (!cancelled) {
          setAllChatRooms([]);
          setJoinedRoomIds({});
        }
      })
      .finally(() => {
        if (!cancelled) setAllChatRoomsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?._id]);

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

  const stateRoomGroups = useMemo(() => {
    const countyRoomsByState = allChatRooms
      .filter((room) => room.type === 'county')
      .sort(sortRoomsByName)
      .reduce((acc, room) => {
        const stateCode = String(room.state || '').trim();
        if (!stateCode) return acc;
        if (!acc[stateCode]) acc[stateCode] = [];
        acc[stateCode].push(room);
        return acc;
      }, {});

    return allChatRooms
      .filter((room) => room.type === 'state')
      .sort(sortRoomsByName)
      .map((room) => ({
        room,
        counties: countyRoomsByState[String(room.state || '').trim()] || []
      }));
  }, [allChatRooms]);

  const topicRooms = useMemo(
    () => allChatRooms.filter((room) => room.type === 'topic').sort(sortRoomsByName),
    [allChatRooms]
  );

  const activeTheme = useMemo(
    () => CHAT_THEMES.find((themeOption) => themeOption.key === theme) || CHAT_THEMES[0],
    [theme]
  );

  const handleToggleExpandedStateRoom = useCallback((roomId) => {
    const normalizedRoomId = normalizeId(roomId);
    if (!normalizedRoomId) return;
    setExpandedStateRooms((prev) => ({
      ...prev,
      [normalizedRoomId]: !prev[normalizedRoomId]
    }));
  }, []);

  const resolvedZipCode = useMemo(
    () => profile?.zipCode || hubData?.zip?.current?.zipCode || null,
    [profile, hubData]
  );

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
      const next = [...prev.filter((tabId) => tabId !== normalizedConversationId), normalizedConversationId];
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
    if (channelKey === 'zip') {
      const next = data?.zip?.current || (data?.zip?.nearby || [])[0] || null;
      if (next) {
        openConversationById(next._id, { openWorkspace: false });
      } else {
        setActiveConversationId('');
      }
      return;
    }

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

      if (activeConversation?.type === 'zip-room') {
        const candidates = [nextData?.zip?.current, ...(nextData?.zip?.nearby || [])].filter(Boolean);
        return candidates.some((conversation) => String(conversation._id) === String(activeConversationId));
      }

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
          senderNameColor: nameColor,
          messageType: 'text'
        });
        data = response.data;
      } else {
        const response = await chatAPI.sendConversationMessage(activeConversationId, {
          content: contentToSend
        });
        data = response.data;
      }

      setMessages((prev) => upsertConversationMessage(prev, data.message));
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
  }, [openConversationById, refreshHub]);

  const handleOpenRoom = useCallback(async (room) => {
    const normalizedRoomId = normalizeId(room?._id || room);
    if (!normalizedRoomId) return;
    try {
      if (!joinedRoomIds[normalizedRoomId] && typeof chatAPI.joinRoom === 'function') {
        await chatAPI.joinRoom(normalizedRoomId);
        setJoinedRoomIds((prev) => ({
          ...prev,
          [normalizedRoomId]: true
        }));
        setAllChatRooms((prev) => prev.map((entry) => (
          String(entry?._id) === normalizedRoomId
            ? addCurrentUserToRoomEntry(entry, profile?._id)
            : entry
        )));
        toast.success('Joined room');
      }
      openConversationById(normalizedRoomId);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to join room');
    }
  }, [joinedRoomIds, openConversationById, profile?._id]);

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
  }, [profile?._id]);

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

  const conversationPresence = getPresenceState(getConversationActivityAt(activeConversation));
  const activeConversationUser = useMemo(() => {
    if (!activeConversation) return null;
    if (activeConversation.type === 'dm') return activeConversation.peer || null;
    return null;
  }, [activeConversation]);
  const activeMenuLabel = activeConversation
    ? getConversationLabel(activeConversation)
    : (activeChannel === 'dm' ? 'Direct Messages' : (resolvedZipCode ? `Zip ${resolvedZipCode}` : 'Secure Chat'));
  const activeMenuIcon = activeConversation ? getConversationTabIcon(activeConversation) : (activeChannel === 'dm' ? '✉️' : '💬');

  if (loadingHub) {
    return (
      <div className="h-full w-full grid place-items-center bg-white">
        <div className="text-sm opacity-80">Loading unified chat hub...</div>
      </div>
    );
  }

  return (
    <div className={`h-full w-full min-h-0 overflow-hidden flex flex-col ${activeTheme.shell}`}>
      <header className={`sticky top-0 z-40 border-b px-2 py-1.5 md:px-3 md:py-2 ${activeTheme.panelGlass}`} data-chat-menu-bar>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMobileWorkspaceOpen(false)}
            className={[
              mobileWorkspaceOpen ? 'inline-flex' : 'hidden',
              `items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold lg:hidden ${activeTheme.subtle}`
            ].join(' ')}
            aria-label="Back to conversations"
          >
            <span aria-hidden="true">←</span>
            <span>Back</span>
          </button>

          <div className={`inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border px-2.5 py-1 ${activeTheme.panel}`}>
            <span aria-hidden="true" className="text-xs">{activeMenuIcon}</span>
            {activeConversation?.type === 'dm' && activeConversationUser?.username ? (
              <a
                href={`/social?user=${encodeURIComponent(activeConversationUser.username)}`}
                className={`truncate text-xs font-semibold ${activeTheme.senderAccent} hover:opacity-80`}
                aria-label={`Open @${activeConversationUser.username} social page`}
              >
                @{activeConversationUser.username}
              </a>
            ) : (
              <span className="truncate text-xs font-semibold">{activeMenuLabel}</span>
            )}
            {activeConversation ? <span className="hidden text-[10px] font-mono opacity-70 sm:inline">Live conversation</span> : null}
          </div>

          <div className={`inline-flex items-center gap-1 rounded-full border p-0.5 ${activeTheme.panel}`} data-chat-channel-tabs>
            {CHANNELS.map((channel) => (
              <button
                key={channel.key}
                type="button"
                onClick={() => {
                  setActiveChannel(channel.key);
                  setMobileWorkspaceOpen(false);
                }}
                className={[
                  'rounded-full px-2.5 py-1 text-[10px] font-semibold transition sm:px-3 sm:text-xs',
                  activeChannel === channel.key ? activeTheme.subtle : 'opacity-80 hover:opacity-100'
                ].join(' ')}
              >
                {channel.label}
              </button>
            ))}
          </div>

          {resolvedZipCode ? (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${activeTheme.panel}`}>
              <span aria-hidden="true">📍</span>
              <span>Zip {resolvedZipCode}</span>
            </span>
          ) : null}

          {activeConversation ? (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${activeTheme.panel}`}>
              <span className={`h-2 w-2 rounded-full ${conversationPresence.tone}`} />
              {conversationPresence.label}
            </span>
          ) : null}

          <div className="relative ml-auto">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setThemeMenuOpen((open) => !open);
              }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold sm:text-xs ${activeTheme.subtle}`}
              aria-label="Open chat theme menu"
              aria-expanded={themeMenuOpen}
            >
              <span aria-hidden="true">🎨</span>
              <span>Theme</span>
            </button>
            {themeMenuOpen ? (
              <div
                className={`absolute right-0 top-10 z-50 min-w-44 rounded-xl border p-1.5 text-xs shadow-xl ${activeTheme.panelGlass}`}
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
                    className={`flex w-full items-center justify-between rounded px-2 py-1 text-left hover:opacity-80 ${theme === themeOption.key ? 'font-semibold' : ''}`}
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

          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${activeTheme.panel}`}>
            <span className={activeTheme.senderAccent}>Aa</span>
            <span className="hidden sm:inline">Theme-tuned accents</span>
            <span className="sm:hidden">Accent</span>
          </span>

          {activeConversationUser?.username ? (
            <a
              href={`/social?user=${encodeURIComponent(activeConversationUser.username)}`}
              className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${activeTheme.subtle}`}
              aria-label={`View @${activeConversationUser.username} profile`}
            >
              👤
            </a>
          ) : null}
        </div>

        {openChatTabs.length > 0 ? (
          <div className="mt-1 overflow-x-auto pb-0.5" data-open-chat-tabs>
            <div className="flex min-w-max items-center gap-1">
              {openChatTabs.map((conversation) => {
                const conversationId = String(conversation._id);
                const selected = conversationId === String(activeConversationId);
                const label = getConversationLabel(conversation);
                return (
                  <div
                    key={`open-chat-tab-${conversationId}`}
                    className={`flex items-stretch rounded-full border ${selected ? activeTheme.subtle : activeTheme.panelGlass}`}
                  >
                    <button
                      type="button"
                      onClick={() => openConversationById(conversationId)}
                      className="inline-flex min-w-0 max-w-[10rem] items-center gap-1.5 px-2.5 py-1 text-left text-[11px] font-semibold"
                      data-open-chat-tab={label}
                      title={`${getChatTabTypeLabel(conversation)} · ${label}`}
                    >
                      <span aria-hidden="true" className="shrink-0 text-[10px] opacity-75">{getConversationTabIcon(conversation)}</span>
                      <span className="truncate">{label}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCloseOpenTab(conversationId)}
                      className="border-l px-2 text-[11px] opacity-80 hover:opacity-100"
                      aria-label={`Close ${label} tab`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${activeTheme.panel}`}>
                {openChatTabs.length}/{MAX_OPEN_CHAT_TABS}
              </span>
            </div>
          </div>
        ) : null}

        {activeConversation?.type === 'dm' ? (
          <div className={`mt-1 rounded-full border px-2 py-1 text-[10px] ${activeTheme.panelGlass}`}>
            {profile?.hasPGP
              ? 'BYO PGP mode: incoming DM envelopes are encrypted to your public key; server admins cannot decrypt content.'
              : 'SocialSecure-generated key mode: DM content is E2EE and decrypts only after you unlock with your encryption password.'}
          </div>
        ) : null}
      </header>

      <div className="grid flex-1 min-h-0 grid-cols-1 gap-2 p-2 md:gap-3 md:p-3 lg:grid-cols-[2.6fr_8fr_2.2fr]">
        <aside
          className={[
            mobileWorkspaceOpen ? 'hidden' : 'flex',
            'min-h-0 flex-col rounded-2xl border p-2 md:p-3 lg:flex',
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
                        const status = getPresenceState(conversation.lastMessageAt);
                        return (
                          <li key={String(conversation._id)}>
                            <button
                              type="button"
                              onClick={() => {
                                openConversationById(String(conversation._id));
                              }}
                              className={`w-full rounded-xl border px-2.5 py-2 text-left text-sm transition ${selected ? activeTheme.subtle : 'hover:opacity-85'}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{getConversationLabel(conversation)}</span>
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase">
                                  {conversation.__hasUnread ? <span className="h-2 w-2 rounded-full bg-sky-500" /> : null}
                                  <span className={`h-2 w-2 rounded-full ${status.tone}`} />
                                  <span>{status.label}</span>
                                </span>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </>
            ) : (
              <>
                <section className={`rounded border p-2 ${activeTheme.panelGlass}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-80">Quick links</p>
                  <div className="mt-2 space-y-1">
                    {hubData?.zip?.current ? (
                      <button
                        type="button"
                        onClick={() => {
                          openConversationById(String(hubData.zip.current._id));
                        }}
                        className={`w-full rounded border px-2.5 py-2 text-left text-sm ${activeTheme.subtle}`}
                      >
                        There Zip
                      </button>
                    ) : null}
                    <section className={`rounded border p-1.5 ${activeTheme.panel}`}>
                      <button
                        type="button"
                        onClick={() => setStateChatsOpen((open) => !open)}
                        className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold"
                        aria-expanded={stateChatsOpen}
                        aria-controls="chat-state-discovery-list"
                      >
                        <span>State Chats</span>
                        <span aria-hidden="true">{stateChatsOpen ? '−' : '+'}</span>
                      </button>
                      {stateChatsOpen ? (
                        <ul id="chat-state-discovery-list" className="mt-2 space-y-1 text-xs">
                          {stateRoomGroups.length === 0 ? <li className="opacity-75">No state chats available.</li> : null}
                          {stateRoomGroups.map(({ room, counties }) => {
                            const roomId = String(room._id);
                            const joinedState = Boolean(joinedRoomIds[roomId]);
                            const stateExpanded = Boolean(expandedStateRooms[roomId]);
                            return (
                              <li key={roomId} className="rounded border px-2 py-1" data-discovery-state={room.name}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleExpandedStateRoom(roomId)}
                                  className="flex w-full items-center justify-between gap-2 text-left font-medium"
                                  data-discovery-state-summary={room.name}
                                  aria-expanded={stateExpanded}
                                  aria-controls={`chat-state-room-${roomId}`}
                                >
                                  <span>{room.name}</span>
                                  <span aria-hidden="true">{stateExpanded ? '−' : '+'}</span>
                                </button>
                                {stateExpanded ? (
                                  <div id={`chat-state-room-${roomId}`} className="mt-2 space-y-2">
                                    <div className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                                      <span>State room</span>
                                      {!joinedState ? (
                                        <button
                                          type="button"
                                          onClick={() => handleJoinRoom(room._id)}
                                          className={`rounded border px-2 py-0.5 ${activeTheme.subtle}`}
                                        >
                                          Join
                                        </button>
                                      ) : (
                                        <span className="opacity-70">Joined</span>
                                      )}
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase opacity-80">County Chats</p>
                                      <ul className="mt-1 space-y-1">
                                        {counties.length === 0 ? <li className="opacity-75">No county chats available.</li> : null}
                                        {counties.map((countyRoom) => {
                                          const countyRoomId = String(countyRoom._id);
                                          const joinedCounty = Boolean(joinedRoomIds[countyRoomId]);
                                          return (
                                            <li
                                              key={countyRoomId}
                                              className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                                              data-discovery-county={countyRoom.name}
                                            >
                                              <span>{countyRoom.name}</span>
                                              {!joinedCounty ? (
                                                <button
                                                  type="button"
                                                  onClick={() => handleJoinRoom(countyRoom._id)}
                                                  className={`rounded border px-2 py-0.5 ${activeTheme.subtle}`}
                                                >
                                                  Join
                                                </button>
                                              ) : (
                                                <span className="opacity-70">Joined</span>
                                              )}
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    </div>
                                  </div>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </section>
                    <section className={`rounded border p-1.5 ${activeTheme.panel}`}>
                      <button
                        type="button"
                        onClick={() => setTopicsOpen((open) => !open)}
                        className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold"
                        aria-expanded={topicsOpen}
                        aria-controls="chat-topic-discovery-list"
                      >
                        <span>Topics</span>
                        <span aria-hidden="true">{topicsOpen ? '−' : '+'}</span>
                      </button>
                      {topicsOpen ? (
                        <ul id="chat-topic-discovery-list" className="mt-2 space-y-1 text-xs">
                          {topicRooms.length === 0 ? <li className="opacity-75">No topic chats available.</li> : null}
                          {topicRooms.map((room) => {
                            const roomId = String(room._id);
                            const joined = Boolean(joinedRoomIds[roomId]);
                            return (
                              <li
                                key={roomId}
                                className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                                data-topic-room={room.name}
                              >
                                <span>{room.name}</span>
                                {!joined ? (
                                  <button
                                    type="button"
                                    onClick={() => handleJoinRoom(room._id)}
                                    className={`rounded border px-2 py-0.5 ${activeTheme.subtle}`}
                                  >
                                    Join
                                  </button>
                                ) : (
                                  <span className="opacity-70">Joined</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </section>
                  </div>
                </section>
                <section className={`rounded border p-2 ${activeTheme.panelGlass}`}>
                  <label className="text-xs font-semibold block">Search all chat rooms</label>
                  <input
                    value={roomQuery}
                    onChange={(event) => setRoomQuery(event.target.value)}
                    className={`mt-1 w-full rounded-lg border p-2 text-sm ${activeTheme.input}`}
                    placeholder="Search by room or location..."
                  />
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
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
                <section className={`rounded border p-2 ${activeTheme.panelGlass}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-80">Zip Rooms</p>
                  {conversationList.length === 0 ? (
                    <p className="mt-2 text-xs opacity-80">No conversations available here yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {conversationList.map((conversation) => {
                        const selected = String(conversation._id) === String(activeConversationId);
                        return (
                          <li key={String(conversation._id)}>
                            <button
                              type="button"
                              onClick={() => {
                                openConversationById(String(conversation._id));
                              }}
                              className={`w-full rounded-xl border px-2.5 py-2 text-left text-sm transition ${selected ? activeTheme.subtle : 'hover:opacity-85'}`}
                            >
                              <span className="font-medium">{getConversationLabel(conversation)}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>
        </aside>

        <section
          className={[
            mobileWorkspaceOpen ? 'flex' : 'hidden',
            'min-h-0 flex-col rounded-2xl border px-2 pb-2 pt-1 md:p-3 lg:flex',
            activeTheme.panel
          ].join(' ')}
        >
          {messagesError ? (
            <div className="mb-3 rounded border border-red-400 bg-red-50 p-2 text-sm text-red-700">{messagesError}</div>
          ) : null}

          <div className="relative flex-1 min-h-0">
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
              longPressDelayMs={LONG_PRESS_DELAY_MS}
              hasMoreMessages={messagesHasMore}
              onLoadOlderMessages={handleLoadOlderMessages}
              onVisibleMessageIdsChange={handleVisibleMessageIdsChange}
            />
            {activeConversation?.type === 'dm' && activeConversationId && !dmUnlockedByConversation[String(activeConversationId)] ? (
              <div
                className="absolute inset-3 z-20 flex items-center justify-center rounded-2xl border border-red-400/80 bg-gradient-to-br from-red-950/95 via-red-900/92 to-rose-950/95 p-4 text-red-50 shadow-[0_22px_55px_rgba(127,29,29,0.45)] backdrop-blur-sm"
                data-testid="dm-lock-overlay"
              >
                <form
                  className="w-full max-w-md rounded-2xl border border-red-300/35 bg-black/20 p-4 shadow-2xl backdrop-blur-md"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await handleUnlockActiveDM();
                  }}
                >
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-red-200/70 bg-red-500/20 text-3xl shadow-[0_0_28px_rgba(248,113,113,0.38)]">
                    🔒
                  </div>
                  <h3 className="text-center text-lg font-semibold">Encrypted conversation locked</h3>
                  <p className="mt-2 text-center text-sm text-red-100/90">
                    Enter your encryption password to reveal this direct message. Press Enter or use Unlock when you're ready.
                  </p>
                  <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.16em]" htmlFor="dm-unlock-password">
                    Encryption password
                  </label>
                  <input
                    id="dm-unlock-password"
                    type="password"
                    value={passwordInput}
                    onChange={(event) => setPasswordInput(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-red-200/45 bg-red-950/40 px-3 py-2 text-sm text-red-50 placeholder:text-red-200/60"
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
                    className="mt-2 w-full rounded-xl border border-red-200/45 bg-red-950/40 px-3 py-2 text-sm text-red-50"
                    disabled={unlockingDm}
                  >
                    {UNLOCK_DURATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="mt-4 w-full rounded-xl border border-red-100/70 bg-red-500 px-3 py-2 text-sm font-semibold text-white shadow-[0_0_24px_rgba(248,113,113,0.45)] transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-70"
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
              <div className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-mono opacity-80">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse [animation-delay:120ms]">●</span>
                <span className="animate-pulse [animation-delay:240ms]">●</span>
                You are typing...
              </div>
            ) : null}

            <div className="sticky bottom-0 pb-[env(safe-area-inset-bottom)]">
              <ChatComposerBar
                composerValue={composerValue}
                setComposerValue={setComposerValue}
                onSubmit={handleSend}
                disabled={
                  !activeConversationId
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
          <div className={`sticky top-0 z-10 rounded border p-3 ${activeTheme.panelGlass}`}>
            <h3 className="font-semibold uppercase tracking-[0.1em]">
              {activeConversation?.type === 'dm' ? 'Participants' : 'Conversation Details'}
            </h3>
            {activeConversation ? (
              <>
                <p className="text-xs opacity-80">{getConversationLabel(activeConversation)}</p>
                <p className="mt-1 text-[11px] font-mono opacity-80">
                  {activeConversation?.type === 'dm'
                    ? `${roomUsers.length || (Array.isArray(activeConversation?.participants) ? activeConversation.participants.length : 0) || 0} participants`
                    : `Status: ${conversationPresence.label}`}
                </p>
              </>
            ) : (
              <p className="text-xs opacity-80">Select a room to view details.</p>
            )}
            {activeConversation?.type === 'dm' ? (
              <p className="mt-2 text-xs opacity-80">This panel stays focused on everyone inside the direct message.</p>
            ) : null}
          </div>

          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
            <section className={`rounded border p-2 ${activeTheme.panelGlass}`}>
              <h4 className="text-sm font-semibold">
                {activeConversation?.type === 'dm' ? 'People in this DM' : 'Users in Room'}
              </h4>
              <p className="mt-1 text-[11px] opacity-80">
                Click, right-click, or long-press a user for quick actions.
              </p>
              <div className={`mt-2 rounded border overflow-auto ${activeConversation?.type === 'dm' ? 'h-full min-h-[20rem]' : 'max-h-56'}`}>
                {roomUsersLoading ? (
                  <p className="p-2 text-xs opacity-80">Loading users...</p>
                ) : roomUsers.length === 0 ? (
                  <p className="p-2 text-xs opacity-80">No users to display.</p>
                ) : (
                  <ul className="divide-y">
                    {roomUsers.map((user) => (
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
                        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${activeTheme.subtle}`}>
                          {String(user.username || user.realName || 'user').slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">@{user.username || user.realName || 'user'}</p>
                          <p className="truncate text-[11px] opacity-75">
                            {String(user._id) === String(profile?._id) ? 'You' : 'Available in this conversation'}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {activeConversation?.type === 'dm' ? null : (
              <section className={`rounded border p-2 ${activeTheme.panelGlass}`}>
                <h4 className="text-sm font-semibold">Shared Media / Links</h4>
                {sharedMediaSnippets.length === 0 ? (
                  <p className="mt-2 text-xs opacity-80">No shared media yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-xs">
                    {sharedMediaSnippets.map((message) => (
                      <li key={String(message._id)} className="rounded border px-2 py-1">
                        {(message.content || '').slice(0, 70)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
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
    </div>
  );
}

export default Chat;
