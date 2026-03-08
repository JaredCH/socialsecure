import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import ChatComposerBar from '../components/chat/ChatComposerBar';
import ChatMessageList from '../components/chat/ChatMessageList';
import { authAPI, chatAPI, friendsAPI, moderationAPI, userAPI } from '../utils/api';
import { parseSlashCommand, runSlashCommand } from '../utils/chatCommands';

const CHANNELS = [
  { key: 'zip', label: 'Zip Rooms' },
  { key: 'dm', label: 'Direct Messages' },
  { key: 'profile', label: 'Profile Threads' }
];

const CHAT_THEMES = [
  {
    key: 'classic',
    label: 'Classic Light',
    shell: 'bg-slate-100 text-slate-900',
    panel: 'border-slate-300 bg-white/80 backdrop-blur-sm',
    panelGlass: 'border-slate-300 bg-white/85 backdrop-blur-md',
    accent: 'border border-blue-700 bg-blue-700 text-white hover:bg-blue-800',
    subtle: 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200',
    input: 'border-slate-300 bg-white text-slate-900',
    messagesShell: 'border-slate-300 bg-gradient-to-b from-white to-slate-100',
    messageOwn: 'border-blue-700 bg-blue-100',
    messageOther: 'border-slate-400 bg-white'
  },
  {
    key: 'midnight',
    label: 'Midnight',
    shell: 'bg-slate-950 text-slate-100',
    panel: 'border-cyan-700/70 bg-slate-900/85 backdrop-blur-sm',
    panelGlass: 'border-cyan-700/70 bg-slate-900/90 backdrop-blur-md',
    accent: 'border border-cyan-400 bg-cyan-400 text-slate-950 hover:bg-cyan-300',
    subtle: 'border-cyan-800 bg-slate-800 text-cyan-100 hover:bg-slate-700',
    input: 'border-cyan-700 bg-slate-950 text-cyan-100',
    messagesShell: 'border-cyan-700 bg-gradient-to-b from-slate-900 to-slate-950',
    messageOwn: 'border-cyan-400 bg-cyan-400/20',
    messageOther: 'border-slate-600 bg-slate-800'
  },
  {
    key: 'ocean',
    label: 'Ocean',
    shell: 'bg-cyan-950 text-cyan-50',
    panel: 'border-cyan-700 bg-cyan-900/85 backdrop-blur-sm',
    panelGlass: 'border-cyan-600 bg-cyan-900/90 backdrop-blur-md',
    accent: 'border border-cyan-300 bg-cyan-300 text-cyan-950 hover:bg-cyan-200',
    subtle: 'border-cyan-700 bg-cyan-800 text-cyan-50 hover:bg-cyan-700',
    input: 'border-cyan-600 bg-cyan-950 text-cyan-50',
    messagesShell: 'border-cyan-700 bg-gradient-to-b from-cyan-900 to-cyan-950',
    messageOwn: 'border-cyan-300 bg-cyan-300/20',
    messageOther: 'border-cyan-700 bg-cyan-900'
  },
  {
    key: 'terminal',
    label: 'Terminal',
    shell: 'bg-zinc-950 text-lime-200',
    panel: 'border-lime-700 bg-zinc-900/90 backdrop-blur-sm',
    panelGlass: 'border-lime-700 bg-zinc-900/95 backdrop-blur-md',
    accent: 'border border-lime-500 bg-lime-500 text-zinc-950 hover:bg-lime-400',
    subtle: 'border-lime-800 bg-zinc-800 text-lime-200 hover:bg-zinc-700',
    input: 'border-lime-700 bg-zinc-950 text-lime-200',
    messagesShell: 'border-lime-700 bg-zinc-950',
    messageOwn: 'border-lime-500 bg-lime-500/20',
    messageOther: 'border-lime-800 bg-zinc-900'
  },
  {
    key: 'sunset',
    label: 'Sunset',
    shell: 'bg-orange-50 text-orange-950',
    panel: 'border-orange-300 bg-white/85 backdrop-blur-sm',
    panelGlass: 'border-orange-300 bg-white/95 backdrop-blur-md',
    accent: 'border border-orange-600 bg-orange-600 text-white hover:bg-orange-700',
    subtle: 'border-orange-300 bg-orange-100 text-orange-900 hover:bg-orange-200',
    input: 'border-orange-300 bg-white text-orange-950',
    messagesShell: 'border-orange-300 bg-gradient-to-b from-white to-orange-100',
    messageOwn: 'border-orange-600 bg-orange-200',
    messageOther: 'border-orange-300 bg-white'
  },
  {
    key: 'lavender',
    label: 'Lavender',
    shell: 'bg-violet-50 text-violet-950',
    panel: 'border-violet-300 bg-white/85 backdrop-blur-sm',
    panelGlass: 'border-violet-300 bg-white/95 backdrop-blur-md',
    accent: 'border border-violet-600 bg-violet-600 text-white hover:bg-violet-700',
    subtle: 'border-violet-300 bg-violet-100 text-violet-900 hover:bg-violet-200',
    input: 'border-violet-300 bg-white text-violet-950',
    messagesShell: 'border-violet-300 bg-gradient-to-b from-white to-violet-100',
    messageOwn: 'border-violet-600 bg-violet-200',
    messageOther: 'border-violet-300 bg-white'
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

  return conversation.title || 'Conversation';
};

const getPresenceState = (lastActiveAt) => {
  if (!lastActiveAt) return { label: 'Away', tone: 'bg-amber-400' };
  const ageMs = Date.now() - new Date(lastActiveAt).getTime();
  if (Number.isNaN(ageMs)) return { label: 'Away', tone: 'bg-amber-400' };
  return ageMs <= 5 * 60 * 1000
    ? { label: 'Online', tone: 'bg-emerald-400' }
    : { label: 'Away', tone: 'bg-amber-400' };
};

const HEX_COLOR_REGEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const DEFAULT_CHAT_NAME_COLOR = '#2563eb';
const LONG_PRESS_DELAY_MS = 550;
const USER_MENU_WIDTH_PX = 240;
const USER_MENU_HEIGHT_PX = 220;

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
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [composerValue, setComposerValue] = useState('');
  const [sending, setSending] = useState(false);
  const [localTyping, setLocalTyping] = useState(false);

  const [dmQuery, setDmQuery] = useState('');
  const [dmSuggestions, setDmSuggestions] = useState([]);
  const [dmSearchLoading, setDmSearchLoading] = useState(false);

  const [roomQuery, setRoomQuery] = useState('');
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('chatTheme');
      if (saved && CHAT_THEMES.some((t) => t.key === saved)) return saved;
    } catch {
      // ignore localStorage errors
    }
    return CHAT_THEMES[0].key;
  });
  const [nameColor, setNameColor] = useState(() => {
    try {
      const saved = localStorage.getItem('chatNameColor');
      if (saved && HEX_COLOR_REGEX.test(saved)) return saved;
    } catch {
      // ignore localStorage errors
    }
    return DEFAULT_CHAT_NAME_COLOR;
  });
  const [roomUsers, setRoomUsers] = useState([]);
  const [roomUsersLoading, setRoomUsersLoading] = useState(false);
  const [mobileWorkspaceOpen, setMobileWorkspaceOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [userContextMenu, setUserContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    user: null
  });
  const userLongPressTimerRef = useRef(null);

  const handleThemeChange = useCallback((nextTheme) => {
    if (!CHAT_THEMES.some((t) => t.key === nextTheme)) return;
    setTheme(nextTheme);
    try {
      localStorage.setItem('chatTheme', nextTheme);
    } catch {
      // ignore localStorage errors
    }
  }, []);

  const handleNameColorChange = useCallback((nextColor) => {
    if (!HEX_COLOR_REGEX.test(String(nextColor || ''))) return;
    setNameColor(nextColor);
    try {
      localStorage.setItem('chatNameColor', nextColor);
    } catch {
      // ignore localStorage errors
    }
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
      return Array.isArray(hubData.dm) ? hubData.dm : [];
    }

    return Array.isArray(hubData.profile) ? hubData.profile : [];
  }, [activeChannel, hubData]);

  const activeConversation = useMemo(
    () => conversationList.find((conversation) => String(conversation._id) === String(activeConversationId)) || null,
    [conversationList, activeConversationId]
  );

  const allRooms = useMemo(() => {
    const withSearchLabel = (room, channel) => {
      const label = getConversationLabel(room);
      return {
        ...room,
        __channel: channel,
        __label: label,
        __labelLower: label.toLowerCase()
      };
    };
    const zipRooms = [
      ...(hubData?.zip?.current ? [withSearchLabel(hubData.zip.current, 'zip')] : []),
      ...((hubData?.zip?.nearby || []).map((room) => withSearchLabel(room, 'zip')))
    ];
    const dmRooms = (hubData?.dm || []).map((room) => withSearchLabel(room, 'dm'));
    const profileRooms = (hubData?.profile || []).map((room) => withSearchLabel(room, 'profile'));
    return [...zipRooms, ...dmRooms, ...profileRooms];
  }, [hubData]);

  const activeTheme = useMemo(
    () => CHAT_THEMES.find((themeOption) => themeOption.key === theme) || CHAT_THEMES[0],
    [theme]
  );

  const resolvedZipCode = useMemo(
    () => profile?.zipCode || hubData?.zip?.current?.zipCode || null,
    [profile, hubData]
  );

  const sharedMediaSnippets = useMemo(
    () => messages.filter((message) => /\[[^\]]+\]|https?:\/\//i.test(message.content || '')).slice(-6),
    [messages]
  );

  const applyDefaultConversationSelection = (channelKey, data) => {
    if (channelKey === 'zip') {
      const next = data?.zip?.current || (data?.zip?.nearby || [])[0] || null;
      setActiveConversationId(next ? String(next._id) : '');
      return;
    }

    if (channelKey === 'dm') {
      const next = (data?.dm || [])[0] || null;
      setActiveConversationId(next ? String(next._id) : '');
      return;
    }

    const next = (data?.profile || [])[0] || null;
    setActiveConversationId(next ? String(next._id) : '');
  };

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

      if (channelToKeep === 'zip') {
        const candidates = [nextData?.zip?.current, ...(nextData?.zip?.nearby || [])].filter(Boolean);
        return candidates.some((conversation) => String(conversation._id) === String(activeConversationId));
      }

      if (channelToKeep === 'dm') {
        return (nextData?.dm || []).some((conversation) => String(conversation._id) === String(activeConversationId));
      }

      return (nextData?.profile || []).some((conversation) => String(conversation._id) === String(activeConversationId));
    })();

    if (!stillExists) {
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
    applyDefaultConversationSelection(activeChannel, hubData);
  }, [activeChannel, hubData]);

  useEffect(() => {
    const loadMessages = async () => {
      if (!activeConversationId) {
        setMessages([]);
        setMessagesError('');
        return;
      }

      setMessagesLoading(true);
      setMessagesError('');
      try {
        const { data } = await chatAPI.getConversationMessages(activeConversationId, 1, 100);
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      } catch (error) {
        setMessages([]);
        setMessagesError(error.response?.data?.error || 'Failed to load conversation messages');
      } finally {
        setMessagesLoading(false);
      }
    };

    loadMessages();
  }, [activeConversationId]);

  useEffect(() => {
    const loadRoomUsers = async () => {
      if (!activeConversationId) {
        setRoomUsers([]);
        return;
      }

      setRoomUsersLoading(true);
      try {
        const { data } = await chatAPI.getConversationUsers(activeConversationId);
        setRoomUsers(Array.isArray(data?.users) ? data.users : []);
      } catch (error) {
        setRoomUsers([]);
        toast.error(error.response?.data?.error || 'Failed to load room users');
      } finally {
        setRoomUsersLoading(false);
      }
    };

    loadRoomUsers();
  }, [activeConversationId]);

  useEffect(() => {
    if (!composerValue.trim()) {
      setLocalTyping(false);
      return;
    }

    setLocalTyping(true);
    const timer = setTimeout(() => setLocalTyping(false), 1200);
    return () => clearTimeout(timer);
  }, [composerValue]);

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
      const { data } = await chatAPI.sendConversationMessage(activeConversationId, {
        content: contentToSend,
        senderNameColor: nameColor
      });
      setMessages((prev) => [...prev, data.message]);
      setComposerValue('');
      setLocalTyping(false);
      await refreshHub(activeChannel);
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
      setActiveConversationId(String(data.conversation._id));
      setDmSuggestions([]);
      setDmQuery('');
      setMobileWorkspaceOpen(true);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to start DM');
    }
  }, [refreshHub]);

  const handleOpenProfileThread = useCallback(async (targetUserId) => {
    try {
      const { data } = await chatAPI.getProfileThread(targetUserId);
      const conversationId = data?.conversation?._id ? String(data.conversation._id) : '';
      await refreshHub('profile');
      setActiveChannel('profile');
      if (conversationId) {
        setActiveConversationId(conversationId);
      }
      setMobileWorkspaceOpen(true);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to open profile thread');
    }
  }, [refreshHub]);

  useEffect(() => {
    if (!profile?._id) return;

    const params = new URLSearchParams(window.location.search);
    const profileThreadTarget = params.get('profile');
    const directMessageTarget = params.get('dm');
    if (profileThreadTarget && String(profileThreadTarget) !== String(profile._id)) {
      handleOpenProfileThread(profileThreadTarget).finally(() => {
        window.history.replaceState({}, '', '/chat');
      });
      return;
    }

    if (!directMessageTarget || String(directMessageTarget) === String(profile._id)) {
      return;
    }

    handleStartDM(directMessageTarget).finally(() => {
      window.history.replaceState({}, '', '/chat');
    });
  }, [profile?._id, handleOpenProfileThread, handleStartDM]);

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

  useEffect(() => {
    const query = dmQuery.trim();
    if (query.length < 2) {
      setDmSuggestions([]);
      setDmSearchLoading(false);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      setDmSearchLoading(true);
      userAPI.search(query)
        .then(({ data }) => {
          if (cancelled) return;
          const users = Array.isArray(data?.users) ? data.users : [];
          setDmSuggestions(users.filter((user) => String(user._id) !== String(profile?._id)));
        })
        .catch((error) => {
          if (cancelled) return;
          setDmSuggestions([]);
          toast.error(error.response?.data?.error || 'Failed to search users');
        })
        .finally(() => {
          if (!cancelled) setDmSearchLoading(false);
        });
    }, 300);

    return () => {
      clearTimeout(handle);
      cancelled = true;
    };
  }, [dmQuery, profile]);

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
    if (userLongPressTimerRef.current) {
      clearTimeout(userLongPressTimerRef.current);
      userLongPressTimerRef.current = null;
    }
  }, []);

  const roomSuggestions = useMemo(() => {
    const query = roomQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    return allRooms
      .filter((room) => room.__labelLower.includes(query))
      .slice(0, 8);
  }, [roomQuery, allRooms]);

  const selectRoomSuggestion = (room) => {
    setActiveChannel(room.__channel || 'zip');
    setActiveConversationId(String(room._id));
    setRoomQuery(room.__label || getConversationLabel(room));
    setMobileWorkspaceOpen(true);
  };

  const conversationPresence = getPresenceState(activeConversation?.lastMessageAt);
  const activeConversationUser = useMemo(() => {
    if (!activeConversation) return null;
    if (activeConversation.type === 'dm') return activeConversation.peer || null;
    if (activeConversation.type === 'profile-thread') return activeConversation.profileUser || null;
    return null;
  }, [activeConversation]);

  if (loadingHub) {
    return (
      <div className="h-full w-full grid place-items-center bg-white">
        <div className="text-sm opacity-80">Loading unified chat hub...</div>
      </div>
    );
  }

  return (
    <div className={`h-full w-full min-h-0 overflow-hidden flex flex-col ${activeTheme.shell}`}>
      <header className={`border-b px-2 py-1.5 md:px-3 ${activeTheme.panelGlass}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">Chat</h2>
            <p className="truncate text-[10px] opacity-80">
              @{profile?.username || 'you'}{resolvedZipCode ? ` • Zip ${resolvedZipCode}` : ''}
            </p>
          </div>
        </div>
      </header>

      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-12">
        <aside
          className={[
            mobileWorkspaceOpen ? 'hidden' : 'flex',
            'min-h-0 flex-col border-b p-2 md:p-3 lg:col-span-3 lg:flex lg:border-b-0 lg:border-r',
            activeTheme.panel
          ].join(' ')}
        >
          <div className="sticky top-0 z-10 space-y-3 pb-3">
            <h3 className="font-semibold">Conversations</h3>
            <div className="grid grid-cols-3 gap-2">
              {CHANNELS.map((channel) => (
                <button
                  key={channel.key}
                  type="button"
                  onClick={() => setActiveChannel(channel.key)}
                  className={`rounded border px-2 py-2 text-xs md:text-sm transition ${activeChannel === channel.key ? activeTheme.subtle : 'opacity-80 hover:opacity-100'}`}
                >
                  {channel.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 space-y-3 overflow-y-auto pr-1">
            <div className="space-y-2">
              <label className="text-xs font-semibold block">Find Rooms</label>
              <input
                value={roomQuery}
                onChange={(event) => setRoomQuery(event.target.value)}
                className={`w-full border rounded p-2 text-sm ${activeTheme.input}`}
                placeholder="Search room names..."
              />
              {roomSuggestions.length > 0 ? (
                <ul className={`max-h-36 overflow-auto border rounded divide-y text-xs ${activeTheme.panelGlass}`}>
                  {roomSuggestions.map((room) => (
                    <li key={String(room._id)}>
                      <button
                        type="button"
                        onClick={() => selectRoomSuggestion(room)}
                        className="w-full text-left p-2 hover:opacity-80"
                      >
                        {room.__label || getConversationLabel(room)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="space-y-2 border-t pt-3">
              <label className="text-xs font-semibold block">Find Users (DM)</label>
              <input
                value={dmQuery}
                onChange={(event) => setDmQuery(event.target.value)}
                className={`w-full border rounded p-2 text-sm ${activeTheme.input}`}
                placeholder="Search username or name..."
              />
              {dmSearchLoading ? (
                <p className="text-xs opacity-80">Searching users...</p>
              ) : null}
              {dmSuggestions.length > 0 ? (
                <ul className={`max-h-40 overflow-auto border rounded divide-y text-xs ${activeTheme.panelGlass}`}>
                  {dmSuggestions.map((user) => (
                    <li key={String(user._id)} className="p-2 flex justify-between items-center gap-2">
                      <span>@{user.username || user.realName || 'user'}</span>
                      <button
                        type="button"
                        onClick={() => handleStartDM(user._id)}
                        className={`rounded border px-2 py-1 ${activeTheme.subtle}`}
                      >
                        Start DM
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-semibold">Rooms in this channel</p>
              {conversationList.length === 0 ? (
                <p className="text-xs opacity-80">No rooms available in this channel yet.</p>
              ) : (
                <ul className="space-y-2">
                  {conversationList.map((conversation) => {
                    const selected = String(conversation._id) === String(activeConversationId);
                    const status = getPresenceState(conversation.lastMessageAt);
                    return (
                      <li key={String(conversation._id)}>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveConversationId(String(conversation._id));
                            setMobileWorkspaceOpen(true);
                          }}
                          className={`w-full rounded border px-3 py-2 text-left text-sm transition ${selected ? activeTheme.subtle : 'hover:opacity-85'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{getConversationLabel(conversation)}</span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase">
                              <span className={`h-2 w-2 rounded-full ${status.tone}`} />
                              {status.label}
                            </span>
                          </div>
                          {conversation.lastMessageAt ? (
                            <div className="text-[11px] opacity-80 font-mono">Last active {new Date(conversation.lastMessageAt).toLocaleString()}</div>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </aside>

        <section
          className={[
            mobileWorkspaceOpen ? 'flex' : 'hidden',
            'min-h-0 flex-col border-b px-2 pb-2 pt-1 md:p-3 lg:col-span-6 lg:flex lg:border-b-0 lg:border-r',
            activeTheme.panel
          ].join(' ')}
        >
          <header className={`relative sticky top-0 z-40 mb-2 rounded border px-2 py-1.5 ${activeTheme.panelGlass}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMobileWorkspaceOpen(false)}
                  className={`rounded border px-2 py-1 text-xs lg:hidden ${activeTheme.subtle}`}
                  aria-label="Back to conversations"
                >
                  ← Back
                </button>
                <div>
                  <h3 className="text-sm font-semibold">{activeConversation ? getConversationLabel(activeConversation) : 'Select a room'}</h3>
                  <p className="text-[10px] font-mono opacity-75">Mobile chat</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setThemeMenuOpen((open) => !open);
                    }}
                    className={`rounded border px-2 py-1 text-sm ${activeTheme.subtle}`}
                    aria-label="Open chat theme menu"
                    aria-expanded={themeMenuOpen}
                  >
                    🎨
                    <span className="sr-only">Theme menu</span>
                  </button>
                  {themeMenuOpen ? (
                    <div
                      className={`absolute right-0 top-9 z-50 min-w-40 rounded border p-1 text-xs shadow-xl ${activeTheme.panelGlass}`}
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
                <label className="text-xs font-medium flex items-center">
                  <input
                    type="color"
                    value={nameColor}
                    onChange={(event) => handleNameColorChange(event.target.value)}
                    className="h-7 w-8 rounded border border-slate-300 bg-transparent p-0.5"
                    aria-label="Set your chat name color"
                  />
                </label>
                {activeConversationUser?.username ? (
                  <a
                    href={`/social?user=${encodeURIComponent(activeConversationUser.username)}`}
                    className={`rounded border px-2 py-1 text-[10px] ${activeTheme.subtle}`}
                    aria-label={`View @${activeConversationUser.username} profile`}
                  >
                    👤
                  </a>
                ) : null}
                {activeConversation ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase">
                    <span className={`h-2 w-2 rounded-full ${conversationPresence.tone}`} />
                    {conversationPresence.label}
                  </span>
                ) : null}
              </div>
            </div>
          </header>

          {messagesError ? (
            <div className="mb-3 rounded border border-red-400 bg-red-50 p-2 text-sm text-red-700">{messagesError}</div>
          ) : null}

          <ChatMessageList
            conversationId={activeConversationId}
            messages={messages}
            loading={messagesLoading}
            profile={profile}
            theme={activeTheme}
            onOpenUserMenu={openUserContextMenu}
            longPressDelayMs={LONG_PRESS_DELAY_MS}
          />

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
                disabled={!activeConversationId}
                sending={sending}
                theme={activeTheme}
                onComposerError={(message) => toast.error(message)}
              />
            </div>
          </div>
        </section>

        <aside className={`hidden min-h-0 flex-col p-2 md:p-3 lg:col-span-3 lg:flex ${activeTheme.panel}`}>
          <div className={`sticky top-0 z-10 rounded border p-3 ${activeTheme.panelGlass}`}>
            <h3 className="font-semibold">Conversation Details</h3>
            {activeConversation ? (
              <>
                <p className="text-xs opacity-80">{getConversationLabel(activeConversation)}</p>
                <p className="text-[11px] font-mono opacity-80 mt-1">Status: {conversationPresence.label}</p>
              </>
            ) : (
              <p className="text-xs opacity-80">Select a room to view details.</p>
            )}
            <p className="mt-2 text-xs opacity-80">About: Retro-modern workspace with neon borders and classic buddy presence markers.</p>
          </div>

          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
            <section className={`rounded border p-2 ${activeTheme.panelGlass}`}>
              <h4 className="text-sm font-semibold">Users in Room</h4>
              <p className="mt-1 text-[11px] opacity-80">Click, right-click, or long-press a user for quick actions.</p>
              <div className="mt-2 rounded border overflow-auto max-h-56">
                {roomUsersLoading ? (
                  <p className="p-2 text-xs opacity-80">Loading users...</p>
                ) : roomUsers.length === 0 ? (
                  <p className="p-2 text-xs opacity-80">No users to display.</p>
                ) : (
                  <ul className="divide-y">
                    {roomUsers.map((user) => {
                      const status = getPresenceState(user.lastActiveAt || user.updatedAt || user.lastSeenAt);
                      return (
                        <li
                          key={String(user._id)}
                          className="flex cursor-pointer items-center justify-between gap-2 p-2 text-sm"
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
                          <span>@{user.username || user.realName || 'user'}</span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase opacity-80">
                            <span className={`h-2 w-2 rounded-full ${status.tone}`} />
                            {status.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

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
