import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { authAPI, chatAPI } from '../utils/api';
import {
  parseSlashCommand
} from '../utils/chatCommands';
import {
  createWrappedRoomKeyPackage,
  decryptEnvelope,
  encryptEnvelope,
  getCacheLimit,
  ingestWrappedRoomKeyPackage,
  setBoundedPlaintextCache,
  unlockOrCreateVault
} from '../utils/e2ee';
import EncryptionUnlockModal from '../components/EncryptionUnlockModal';
import TypingIndicator from '../components/TypingIndicator';
import {
  emitTypingStart,
  emitTypingStop,
  getRealtimeSocket,
  joinRealtimeRoom,
  leaveRealtimeRoom,
  onChatMessage,
  onTyping
} from '../utils/realtime';

const MESSAGE_PAGE_SIZE = {
  INITIAL_LOAD: 500,
  OLDER_LOAD: 250
};
const MAX_MESSAGES_IN_MEMORY = 1200;
const MAX_VISIBLE_DECRYPT = 120;
const SCROLL_BOTTOM_THRESHOLD = 48;
const CHAT_POLL_INTERVAL_MS = 15000;
const TYPING_TIMEOUT_MS = 900;
const REMOTE_TYPING_TTL_MS = 3000;
const CHAT_SUPPORTED_COMMANDS = ['join', 'leave', 'nick', 'msg', 'list'];
const CHAT_UNKNOWN_COMMAND_HELP = 'Unknown command. Available: /join, /leave, /nick, /msg, /list';

const parseCommandArguments = (command, argsRaw = '') => {
  const args = String(argsRaw || '').trim();

  switch (command) {
    case 'join': {
      if (!args) return { ok: false, error: 'Usage: /join [room]' };
      return { ok: true, data: { roomQuery: args } };
    }
    case 'leave':
    case 'list':
      return { ok: true, data: {} };
    case 'nick': {
      if (!args) return { ok: false, error: 'Usage: /nick [name]' };
      const nickname = args.slice(0, 32);
      if (!/^[A-Za-z0-9_-]{2,32}$/.test(nickname)) {
        return { ok: false, error: 'Nickname must be 2-32 chars: letters, numbers, _ or -' };
      }
      return { ok: true, data: { nickname } };
    }
    case 'msg': {
      const [target, ...rest] = args.split(/\s+/);
      const message = rest.join(' ').trim();
      if (!target || !message) {
        return { ok: false, error: 'Usage: /msg [user] [message]' };
      }
      return { ok: true, data: { target: target.slice(0, 64), message: message.slice(0, 2000) } };
    }
    default:
      return { ok: false, error: CHAT_UNKNOWN_COMMAND_HELP };
  }
};

const getMessageId = (message) => String(message?._id || `${message?.e2ee?.clientMessageId || 'msg'}:${message?.createdAt || ''}`);

const normalizeRoomLabel = (room) => {
  if (!room) return '';
  return room.name || [room.city, room.state].filter(Boolean).join(', ') || String(room._id);
};

const pad2 = (value) => String(value).padStart(2, '0');

const formatCompactTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--:--';

  const now = new Date();
  const isSameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();

  if (isSameDay) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const hashString = (value = '') => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return Math.abs(hash);
};

const stringToColor = (value = '') => {
  const hash = hashString(value || 'user');
  const hue = hash % 360;
  const saturation = 60 + (hash % 12);
  const lightness = 42 + (hash % 14);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const Chat = () => {
  const [profile, setProfile] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [activeRoomId, setActiveRoomId] = useState('');

  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [session, setSession] = useState(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [serverUnlocked, setServerUnlocked] = useState(false);

  const [messages, setMessages] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [sendValue, setSendValue] = useState('');
  const [sending, setSending] = useState(false);
  const [nickByUserId, setNickByUserId] = useState({});
  const [localNickname, setLocalNickname] = useState('');
  const [useMonospace, setUseMonospace] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [typingLabelsByRoom, setTypingLabelsByRoom] = useState({});

  const [decrypting, setDecrypting] = useState(false);
  const [decryptErrors, setDecryptErrors] = useState({});
  const [plaintextById, setPlaintextById] = useState({});
  const [rateLimitInfo, setRateLimitInfo] = useState(null);
  const plaintextCacheRef = useRef(new Map());
  const latestPackageSyncByRoomRef = useRef({});
  const messageViewportRef = useRef(null);
  const messageCountRef = useRef(0);
  const localTypingTimeoutRef = useRef(null);
  const remoteTypingTimeoutsRef = useRef({});

  const isUnlocked = Boolean(session);
  const realtimeEnabled = profile?.realtimePreferences?.enabled !== false;
  const activeRoom = useMemo(
    () => rooms.find((room) => String(room._id) === String(activeRoomId)) || null,
    [rooms, activeRoomId]
  );

  const appendMessage = (incoming) => {
    if (!incoming) return;
    const incomingId = getMessageId(incoming);
    setMessages((prev) => {
      if (prev.some((item) => getMessageId(item) === incomingId)) {
        return prev;
      }
      const next = [...prev, incoming];
      return next.length > MAX_MESSAGES_IN_MEMORY ? next.slice(next.length - MAX_MESSAGES_IN_MEMORY) : next;
    });
  };

  const appendLocalSystemMessage = (content) => {
    appendMessage({
      _id: `local:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      roomId: activeRoomId,
      userId: {
        _id: profile?._id || 'system',
        username: 'system',
        realName: 'System'
      },
      content,
      messageType: 'system',
      createdAt: new Date().toISOString(),
      isEncrypted: false,
      isE2EE: false
    });
  };

  const scrollToBottom = () => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
    setUnreadCount(0);
    setIsAtBottom(true);
  };

  const findRoomByQuery = (query) => {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized) return null;
    return rooms.find((room) => {
      const roomId = String(room._id).toLowerCase();
      const label = normalizeRoomLabel(room).toLowerCase();
      return roomId === normalized || label === normalized || label.includes(normalized);
    }) || null;
  };

  const getDisplayName = (message) => {
    const messageUserId = message?.userId?._id ? String(message.userId._id) : null;
    if (messageUserId && nickByUserId[messageUserId]) {
      return nickByUserId[messageUserId];
    }
    if (profile?._id && messageUserId && String(profile._id) === messageUserId && localNickname) {
      return localNickname;
    }
    return message?.userId?.username || message?.userId?.realName || 'user';
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [{ data: profileData }, location] = await Promise.all([
          authAPI.getProfile(),
          new Promise((resolve) => {
            if (!navigator.geolocation) {
              resolve({ latitude: 0, longitude: 0 });
              return;
            }
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              () => resolve({ latitude: 0, longitude: 0 }),
              { timeout: 5000 }
            );
          })
        ]);

        setProfile(profileData.user || null);
        setLocalNickname(profileData.user?.username || profileData.user?.realName || '');

        if (profileData.user?.hasEncryptionPassword) {
          try {
            const unlockStatus = await authAPI.getEncryptionUnlockStatus();
            if (unlockStatus.data?.unlocked) {
              setServerUnlocked(true);
              setShowUnlockModal(true);
            }
          } catch (unlockCheckError) {
            console.warn('Could not check unlock status:', unlockCheckError);
          }
        }

        try {
          await chatAPI.syncLocationRooms();
        } catch (syncError) {
          console.warn('Location room sync skipped:', syncError.response?.data?.error);
        }

        const nearby = await chatAPI.getNearbyRooms(location.latitude, location.longitude, 100);
        const roomList = Array.isArray(nearby.data?.rooms) ? nearby.data.rooms : [];
        setRooms(roomList);
        if (roomList.length > 0) {
          setActiveRoomId(String(roomList[0]._id));
        }
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to load chat rooms.');
      } finally {
        setRoomsLoading(false);
      }
    };

    bootstrap();
  }, []);

  const loadKeyPackages = async (roomId, unlockedSession) => {
    if (!unlockedSession) return;
    const since = latestPackageSyncByRoomRef.current[roomId] || null;
    const response = await chatAPI.syncRoomKeyPackages(roomId, unlockedSession.deviceId, since, 100);
    const incoming = Array.isArray(response.data?.packages) ? response.data.packages : [];
    for (const pkg of incoming) {
      try {
        await ingestWrappedRoomKeyPackage({ session: unlockedSession, pkg });
      } catch {
        // Ignore malformed or tampered key packages and keep syncing.
      }
    }
    if (incoming.length > 0) {
      latestPackageSyncByRoomRef.current[roomId] = incoming[incoming.length - 1].createdAt;
      await unlockedSession.persist();
    }
  };

  const ensureRoomKey = async (roomId, unlockedSession) => {
    const known = unlockedSession.getLatestRoomKey(roomId);
    if (known) {
      return known;
    }

    const newKeyVersion = 1;
    const roomKey = unlockedSession.createRoomKey();
    unlockedSession.setRoomKey(roomId, newKeyVersion, roomKey);

    if (profile?._id) {
      const pkg = await createWrappedRoomKeyPackage({
        session: unlockedSession,
        roomId,
        keyVersion: newKeyVersion,
        roomKey,
        recipientUserId: profile._id,
        recipientDeviceId: unlockedSession.deviceId
      });
      await chatAPI.publishRoomKeyPackages(roomId, [pkg]);
    }

    await unlockedSession.persist();
    return { keyVersion: newKeyVersion, keyBytes: roomKey };
  };

  const handleUnlock = async (event) => {
    event.preventDefault();
    if (!profile?._id) {
      setUnlockError('User profile is unavailable. Please re-login.');
      return;
    }

    setUnlocking(true);
    setUnlockError('');

    try {
      const { session: unlockedSession, created } = await unlockOrCreateVault({
        userId: profile._id,
        password: unlockPassword
      });

      await chatAPI.registerDeviceKeys(await unlockedSession.getRegisterPayload());
      if (activeRoomId) {
        await loadKeyPackages(activeRoomId, unlockedSession);
      }

      setSession(unlockedSession);
      setUnlockPassword('');
      toast.success(created ? 'Encryption vault created and unlocked.' : 'Encryption unlocked.');
    } catch (error) {
      const message = error?.message || error.response?.data?.error || 'Failed to unlock encryption vault.';
      setUnlockError(message);
      toast.error(message);
    } finally {
      setUnlocking(false);
    }
  };

  const handleModalUnlock = async (password) => {
    if (!profile?._id) {
      toast.error('User profile is unavailable. Please re-login.');
      return;
    }

    if (!password) {
      toast.error('Password is required');
      return;
    }

    setUnlocking(true);
    setUnlockError('');

    try {
      const { session: unlockedSession, created } = await unlockOrCreateVault({
        userId: profile._id,
        password
      });

      await chatAPI.registerDeviceKeys(await unlockedSession.getRegisterPayload());
      if (activeRoomId) {
        await loadKeyPackages(activeRoomId, unlockedSession);
      }

      setSession(unlockedSession);
      setShowUnlockModal(false);
      setServerUnlocked(true);
      toast.success(created ? 'Encryption vault created and unlocked for 12h.' : 'Encryption unlocked for 12h.');
    } catch (error) {
      const message = error?.message || error.response?.data?.error || 'Failed to unlock encryption vault.';
      setUnlockError(message);
      toast.error(message);
    } finally {
      setUnlocking(false);
    }
  };

  const handleLock = async () => {
    setSession(null);
    setPlaintextById({});
    setServerUnlocked(false);

    try {
      await authAPI.lockEncryption();
    } catch (error) {
      console.warn('Failed to lock on server:', error);
    }

    setSession(null);
    setPlaintextById({});
    setDecryptErrors({});
    plaintextCacheRef.current.clear();
  };

  const fetchMessagesPage = async (roomId, cursor, reset = false) => {
    const viewport = messageViewportRef.current;
    const preserveScroll = !reset && Boolean(cursor) && Boolean(viewport);
    const prevScrollHeight = preserveScroll ? viewport.scrollHeight : 0;
    const prevScrollTop = preserveScroll ? viewport.scrollTop : 0;

    if (preserveScroll) {
      setOlderLoading(true);
    } else {
      setMessagesLoading(true);
    }

    try {
      const response = await chatAPI.getMessagesByCursor(
        roomId,
        cursor,
        reset ? MESSAGE_PAGE_SIZE.INITIAL_LOAD : MESSAGE_PAGE_SIZE.OLDER_LOAD
      );
      const batch = Array.isArray(response.data?.messages) ? response.data.messages : [];
      const pagination = response.data?.pagination || {};

      setMessages((prev) => {
        const combined = reset ? batch : [...batch, ...prev];
        if (combined.length <= MAX_MESSAGES_IN_MEMORY) return combined;
        return combined.slice(combined.length - MAX_MESSAGES_IN_MEMORY);
      });

      setHasMore(Boolean(pagination.hasMore));
      setNextCursor(pagination.nextCursor || null);

      if (preserveScroll && messageViewportRef.current) {
        requestAnimationFrame(() => {
          const currentViewport = messageViewportRef.current;
          if (!currentViewport) return;
          const nextScrollHeight = currentViewport.scrollHeight;
          currentViewport.scrollTop = prevScrollTop + (nextScrollHeight - prevScrollHeight);
        });
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load encrypted messages.');
    } finally {
      setMessagesLoading(false);
      setOlderLoading(false);
    }
  };

  useEffect(() => {
    if (!activeRoomId) {
      setMessages([]);
      setPlaintextById({});
      setDecryptErrors({});
      setNextCursor(null);
      setHasMore(true);
      setUnreadCount(0);
      setTypingLabelsByRoom({});
      return;
    }

    setMessages([]);
    setPlaintextById({});
    setDecryptErrors({});
    setNextCursor(null);
    setHasMore(true);
    setUnreadCount(0);
    fetchMessagesPage(activeRoomId, null, true);

    if (session) {
      loadKeyPackages(activeRoomId, session).catch(() => {
        toast.error('Unable to sync room key packages.');
      });
    }
  }, [activeRoomId]);

  useEffect(() => {
    if (!profile?._id || !realtimeEnabled) {
      return undefined;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      return undefined;
    }

    getRealtimeSocket({ token, userId: profile._id });

    const offChatMessage = onChatMessage((payload) => {
      const incoming = payload?.message;
      if (!incoming?._id) return;

      if (String(incoming.roomId) !== String(activeRoomId)) {
        return;
      }

      appendMessage(incoming);
    });

    const offTyping = onTyping((payload) => {
      if (payload?.scope !== 'chat' || String(payload?.targetId) !== String(activeRoomId) || !payload?.userId) {
        return;
      }

      const timeoutKey = String(payload.userId);
      if (payload.status === 'stop') {
        const timeoutId = remoteTypingTimeoutsRef.current[timeoutKey];
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          delete remoteTypingTimeoutsRef.current[timeoutKey];
        }
        setTypingLabelsByRoom((prev) => {
          const next = { ...(prev[String(activeRoomId)] || {}) };
          delete next[timeoutKey];
          return {
            ...prev,
            [String(activeRoomId)]: next
          };
        });
        return;
      }

      setTypingLabelsByRoom((prev) => ({
        ...prev,
        [String(activeRoomId)]: {
          ...(prev[String(activeRoomId)] || {}),
          [timeoutKey]: payload.label || 'Someone'
        }
      }));

      const existingTimeout = remoteTypingTimeoutsRef.current[timeoutKey];
      if (existingTimeout) {
        window.clearTimeout(existingTimeout);
      }
      remoteTypingTimeoutsRef.current[timeoutKey] = window.setTimeout(() => {
        setTypingLabelsByRoom((prev) => {
          const next = { ...(prev[String(activeRoomId)] || {}) };
          delete next[timeoutKey];
          return {
            ...prev,
            [String(activeRoomId)]: next
          };
        });
        delete remoteTypingTimeoutsRef.current[timeoutKey];
      }, REMOTE_TYPING_TTL_MS);
    });

    return () => {
      offChatMessage();
      offTyping();
    };
  }, [profile?._id, realtimeEnabled, activeRoomId]);

  useEffect(() => {
    if (!activeRoomId || !profile?._id || !realtimeEnabled) {
      return undefined;
    }

    joinRealtimeRoom(activeRoomId);
    return () => {
      leaveRealtimeRoom(activeRoomId);
    };
  }, [activeRoomId, profile?._id, realtimeEnabled]);

  useEffect(() => {
    if (!activeRoomId || realtimeEnabled) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      fetchMessagesPage(activeRoomId, null, true);
    }, CHAT_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [activeRoomId, realtimeEnabled]);

  useEffect(() => () => {
    if (localTypingTimeoutRef.current) {
      window.clearTimeout(localTypingTimeoutRef.current);
    }
    Object.values(remoteTypingTimeoutsRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, []);

  useEffect(() => {
    const decryptVisible = async () => {
      if (!session || !activeRoomId || messages.length === 0) return;

      const visibleWindow = messages.slice(-MAX_VISIBLE_DECRYPT);
      const plainUpdates = {};
      const errorUpdates = {};
      let changed = false;

      setDecrypting(true);
      try {
        for (const msg of visibleWindow) {
          const id = getMessageId(msg);
          if (!msg?.e2ee?.enabled || !msg?.e2ee?.ciphertext) {
            continue;
          }
          if (plaintextCacheRef.current.has(id)) {
            plainUpdates[id] = plaintextCacheRef.current.get(id);
            continue;
          }

          try {
            const plaintext = await decryptEnvelope({
              session,
              roomId: activeRoomId,
              envelope: msg.e2ee
            });
            setBoundedPlaintextCache(plaintextCacheRef.current, id, plaintext);
            plainUpdates[id] = plaintext;
            delete errorUpdates[id];
            changed = true;
          } catch {
            errorUpdates[id] = 'Unable to decrypt (wrong key/password or tampered ciphertext).';
            changed = true;
          }
        }
      } finally {
        setDecrypting(false);
      }

      if (changed) {
        setPlaintextById((prev) => ({ ...prev, ...plainUpdates }));
        setDecryptErrors((prev) => ({ ...prev, ...errorUpdates }));
      }
    };

    decryptVisible();
  }, [messages, session, activeRoomId]);

  useEffect(() => {
    if (!Array.isArray(messages) || messages.length === 0) return;

    const nextNickByUserId = {};
    for (const message of messages) {
      if (message?.messageType !== 'command') continue;
      if (message?.commandData?.command !== 'nick') continue;
      const targetUserId = message?.commandData?.targetUserId || message?.userId?._id;
      const nickname = message?.commandData?.nickname;
      if (targetUserId && nickname) {
        nextNickByUserId[String(targetUserId)] = nickname;
      }
    }

    if (Object.keys(nextNickByUserId).length > 0) {
      setNickByUserId((prev) => ({ ...prev, ...nextNickByUserId }));
    }
  }, [messages]);

  useEffect(() => {
    if (!messageViewportRef.current) return;

    if (isAtBottom) {
      scrollToBottom();
    } else {
      const previousCount = messageCountRef.current;
      const delta = Math.max(messages.length - previousCount, 0);
      if (delta > 0) {
        setUnreadCount((prev) => prev + delta);
      }
    }

    messageCountRef.current = messages.length;
  }, [messages, isAtBottom]);

  const sendEncryptedPayload = async ({ plaintext, messageType = 'text', commandData = null }) => {
    await loadKeyPackages(activeRoomId, session);
    const { keyVersion, keyBytes } = await ensureRoomKey(activeRoomId, session);
    const envelope = await encryptEnvelope({
      session,
      roomId: activeRoomId,
      keyVersion,
      roomKey: keyBytes,
      plaintext
    });

    const response = await chatAPI.sendE2EEMessage(activeRoomId, {
      e2ee: envelope,
      messageType,
      commandData
    });

    const sentMessage = response.data?.messageData;
    if (sentMessage) {
      appendMessage(sentMessage);
    }
  };

  const handleSlashCommand = async ({ command, argsRaw }) => {
    const parsed = parseCommandArguments(command, argsRaw);
    if (!parsed.ok) {
      toast.error(parsed.error || CHAT_UNKNOWN_COMMAND_HELP);
      return;
    }

    switch (command) {
      case 'join': {
        const targetRoom = findRoomByQuery(parsed.data.roomQuery);
        if (!targetRoom) {
          toast.error(`Room not found: ${parsed.data.roomQuery}`);
          return;
        }
        const response = await chatAPI.joinRoom(String(targetRoom._id));
        setRooms((prev) => prev.map((room) => {
          if (String(room._id) !== String(targetRoom._id)) return room;
          return {
            ...room,
            memberCount: response.data?.room?.memberCount ?? room.memberCount
          };
        }));
        if (String(activeRoomId) === String(targetRoom._id) && response.data?.systemMessage) {
          appendMessage(response.data.systemMessage);
        }
        setActiveRoomId(String(targetRoom._id));
        toast.success(`Joined ${normalizeRoomLabel(targetRoom)}`);
        break;
      }
      case 'leave': {
        if (!activeRoomId) {
          toast.error('No active room selected.');
          return;
        }
        const leavingRoomId = String(activeRoomId);
        const response = await chatAPI.leaveRoom(leavingRoomId);
        if (response.data?.systemMessage) {
          appendMessage(response.data.systemMessage);
        }
        setRooms((prev) => prev.map((room) => {
          if (String(room._id) !== leavingRoomId) return room;
          return {
            ...room,
            memberCount: response.data?.room?.memberCount ?? room.memberCount
          };
        }));

        const fallbackRoom = rooms.find((room) => String(room._id) !== leavingRoomId) || null;
        setActiveRoomId(fallbackRoom ? String(fallbackRoom._id) : '');
        toast.success('Left room.');
        break;
      }
      case 'nick': {
        const previous = localNickname || profile?.username || profile?.realName || 'user';
        const nickname = parsed.data.nickname;
        setLocalNickname(nickname);
        if (profile?._id) {
          setNickByUserId((prev) => ({ ...prev, [String(profile._id)]: nickname }));
        }

        const rendered = `${previous} is now known as ${nickname}`;
        await sendEncryptedPayload({
          plaintext: rendered,
          messageType: 'command',
          commandData: {
            command: 'nick',
            nickname,
            targetUserId: String(profile?._id || ''),
            targetUsername: profile?.username || profile?.realName || 'user',
            processedContent: rendered
          }
        });
        toast.success(`Nickname set to ${nickname}`);
        break;
      }
      case 'msg': {
        const target = parsed.data.target;
        const message = parsed.data.message;
        const rendered = `-> ${target}: ${message}`;
        await sendEncryptedPayload({
          plaintext: rendered,
          messageType: 'command',
          commandData: {
            command: 'msg',
            targetUsername: target,
            processedContent: rendered
          }
        });
        break;
      }
      case 'list': {
        if (!activeRoomId) {
          toast.error('No active room selected.');
          return;
        }
        const response = await chatAPI.getRoomUsers(activeRoomId);
        const users = Array.isArray(response.data?.users) ? response.data.users : [];
        const names = users
          .map((user) => {
            const userId = String(user._id);
            return nickByUserId[userId] || user.username || user.realName || userId;
          })
          .filter(Boolean);
        const rendered = names.length > 0
          ? `Users (${names.length}): ${names.join(', ')}`
          : 'No users currently in this room.';
        appendLocalSystemMessage(rendered);
        toast.success(`Listed ${names.length} user${names.length === 1 ? '' : 's'}.`);
        break;
      }
      default:
        toast.error(`Unsupported command. Available: ${CHAT_SUPPORTED_COMMANDS.map((name) => `/${name}`).join(', ')}`);
    }
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const trimmed = sendValue.trim();
    if (!trimmed || !activeRoomId || !session) return;

    setSending(true);
    try {
      const parsed = parseSlashCommand(trimmed);
      if (parsed) {
        await handleSlashCommand(parsed);
      } else {
        await sendEncryptedPayload({ plaintext: trimmed, messageType: 'text' });
      }
      setSendValue('');
      emitTypingStop({ scope: 'chat', targetId: activeRoomId });
      if (localTypingTimeoutRef.current) {
        window.clearTimeout(localTypingTimeoutRef.current);
        localTypingTimeoutRef.current = null;
      }
      if (isAtBottom) {
        requestAnimationFrame(() => scrollToBottom());
      }
    } catch (error) {
      if (error.response?.status === 429) {
        const rateData = error.response?.data?.rateLimit;
        if (rateData) {
          setRateLimitInfo({
            allowed: false,
            bucket: rateData.bucket || 'remote',
            limit: rateData.limit,
            remaining: 0,
            retryAfter: rateData.retryAfter,
            windowSeconds: rateData.windowSeconds,
            distance: rateData.distance
          });
          toast.error(`Rate limited. Try again in ${rateData.retryAfter} seconds.`);
          return;
        }
      }
      toast.error(error.response?.data?.error || error.message || 'Failed to send encrypted message.');
    } finally {
      setSending(false);
    }
  };

  const handleInputChange = (value) => {
    setSendValue(value);

    if (!activeRoomId || !realtimeEnabled || !profile?._id) {
      return;
    }

    if (!value.trim()) {
      emitTypingStop({ scope: 'chat', targetId: activeRoomId });
      if (localTypingTimeoutRef.current) {
        window.clearTimeout(localTypingTimeoutRef.current);
        localTypingTimeoutRef.current = null;
      }
      return;
    }

    emitTypingStart({ scope: 'chat', targetId: activeRoomId });
    if (localTypingTimeoutRef.current) {
      window.clearTimeout(localTypingTimeoutRef.current);
    }

    localTypingTimeoutRef.current = window.setTimeout(() => {
      emitTypingStop({ scope: 'chat', targetId: activeRoomId });
      localTypingTimeoutRef.current = null;
    }, TYPING_TIMEOUT_MS);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Chat (E2EE)</h2>
          <p className="text-gray-600 text-sm">
            IRC-like compact chat with slash commands. Content remains client-side encrypted.
          </p>
        </div>
        {isUnlocked ? (
          <button type="button" onClick={handleLock} className="px-3 py-2 rounded border text-sm">
            Lock Encryption
          </button>
        ) : null}
      </div>

      {!isUnlocked && profile?.hasEncryptionPassword ? (
        <div className="border rounded p-4 bg-gray-50 space-y-3">
          <h3 className="font-semibold">Encryption Password Required</h3>
          <p className="text-sm text-gray-700">
            Enter your Encryption Password to unlock local device keys and room keys.
          </p>
          <button
            type="button"
            onClick={() => setShowUnlockModal(true)}
            className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700"
          >
            Unlock Encryption
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <aside className="md:col-span-1 border rounded p-3">
          <h3 className="font-semibold mb-2">Nearby Rooms</h3>
          {roomsLoading ? (
            <p className="text-sm text-gray-500">Loading rooms...</p>
          ) : rooms.length === 0 ? (
            <p className="text-sm text-gray-500">No rooms found for current location.</p>
          ) : (
            <ul className="space-y-2">
              {rooms.map((room) => {
                const selected = String(room._id) === String(activeRoomId);
                return (
                  <li key={String(room._id)}>
                    <button
                      type="button"
                      onClick={() => setActiveRoomId(String(room._id))}
                      className={`w-full text-left rounded border px-2 py-2 text-sm ${selected ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'}`}
                    >
                      <div className="font-medium">{normalizeRoomLabel(room)}</div>
                      <div className="text-xs text-gray-500">{room.memberCount || 0} members</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="md:col-span-3 border rounded p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">
              {activeRoom ? normalizeRoomLabel(activeRoom) : 'Select a room'}
            </h3>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={useMonospace}
                  onChange={(event) => setUseMonospace(event.target.checked)}
                />
                <span>Monospace</span>
              </label>
              <span>Decrypt cache: {plaintextCacheRef.current.size}/{getCacheLimit()}</span>
            </div>
          </div>

          <div
            ref={messageViewportRef}
            onScroll={(event) => {
              const viewport = event.currentTarget;
              const nearBottom = (viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop) <= SCROLL_BOTTOM_THRESHOLD;
              setIsAtBottom(nearBottom);
              if (nearBottom) {
                setUnreadCount(0);
              }
            }}
            className={`space-y-0.5 max-h-[480px] overflow-y-auto border rounded p-2 bg-gray-50 ${useMonospace ? 'font-mono text-[13px]' : 'text-sm'}`}
          >
            {messages.length === 0 && !messagesLoading ? (
              <p className="text-sm text-gray-500">No messages yet.</p>
            ) : null}

            {messagesLoading && messages.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">Loading recent messages...</div>
            ) : null}

            {olderLoading ? (
              <div className="py-1 text-center text-xs text-gray-500">Loading older messages...</div>
            ) : null}

            {messages.map((message) => {
              const id = getMessageId(message);
              const plaintext = plaintextById[id];
              const decryptError = decryptErrors[id];
              const isE2EE = Boolean(message?.e2ee?.enabled);
              const author = getDisplayName(message);
              const messageType = message?.messageType || 'text';
              const compactTs = formatCompactTimestamp(message.createdAt);
              const fullTs = new Date(message.createdAt).toLocaleString();

              let bodyText = message.content || '';
              if (isE2EE) {
                if (plaintext) {
                  bodyText = plaintext;
                } else if (decryptError) {
                  bodyText = decryptError;
                } else {
                  bodyText = 'Encrypted message (locked or pending decrypt)';
                }
              }

              if (messageType === 'system') {
                return (
                  <div key={id} className="text-center text-xs text-gray-500 py-0.5" title={fullTs}>
                    [{compactTs}] {bodyText || 'System event'}
                  </div>
                );
              }

              return (
                <div key={id} className="group leading-5 py-0.5" title={fullTs}>
                  <span className="text-gray-500">[{compactTs}] </span>
                  {messageType === 'action' ? (
                    <>
                      <span className="text-gray-700 italic">* </span>
                      <span className="font-semibold italic" style={{ color: stringToColor(author) }}>{author}</span>
                      <span className={`ml-1 italic ${decryptError ? 'text-red-600' : 'text-gray-700'} whitespace-pre-wrap`}>{bodyText}</span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold" style={{ color: stringToColor(author) }}>&lt;{author}&gt;</span>
                      <span className={`ml-1 whitespace-pre-wrap ${decryptError ? 'text-red-600' : (messageType === 'command' ? 'text-indigo-700' : 'text-gray-900')}`}>
                        {bodyText || '[Non-E2EE message]'}
                      </span>
                    </>
                  )}
                  <span className="ml-2 hidden group-hover:inline text-[10px] text-gray-400">{fullTs}</span>
                </div>
              );
            })}
          </div>

          {!isAtBottom && unreadCount > 0 ? (
            <div className="-mt-1">
              <button
                type="button"
                onClick={scrollToBottom}
                className="text-xs px-2 py-1 rounded border bg-amber-50 border-amber-300 text-amber-800"
              >
                {unreadCount} unread message{unreadCount === 1 ? '' : 's'}
              </button>
            </div>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fetchMessagesPage(activeRoomId, nextCursor, false)}
              disabled={!activeRoomId || !hasMore || messagesLoading || olderLoading}
              className="px-3 py-2 border rounded text-sm disabled:opacity-50"
            >
              {olderLoading ? 'Loading...' : hasMore ? `Load Older (${MESSAGE_PAGE_SIZE.OLDER_LOAD})` : 'No More Messages'}
            </button>
            {decrypting ? <span className="text-xs text-gray-500 self-center">Decrypting visible messages...</span> : null}
          </div>

          {!realtimeEnabled ? (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              Real-time chat updates are disabled. This room will fall back to periodic refreshes.
            </div>
          ) : null}

          <TypingIndicator labels={Object.values(typingLabelsByRoom[String(activeRoomId)] || {})} />

          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={sendValue}
              onChange={(event) => handleInputChange(event.target.value)}
              onBlur={() => emitTypingStop({ scope: 'chat', targetId: activeRoomId })}
              disabled={!isUnlocked || !activeRoomId || sending}
              className="flex-1 border rounded p-2"
              maxLength={2000}
              placeholder={isUnlocked ? `Type encrypted message or ${CHAT_SUPPORTED_COMMANDS.map((name) => `/${name}`).join(' ')}` : 'Unlock encryption to send'}
            />
            <button
              type="submit"
              disabled={!isUnlocked || !activeRoomId || !sendValue.trim() || sending}
              className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send E2EE'}
            </button>
          </form>

          {rateLimitInfo && (
            <div className={`text-xs p-2 rounded ${rateLimitInfo.allowed ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
              {rateLimitInfo.bucket === 'primary' ? (
                <span>Primary city: unlimited messages</span>
              ) : rateLimitInfo.bucket === 'nearby' ? (
                <span>Nearby city ({rateLimitInfo.distance?.toFixed(0)} miles): {rateLimitInfo.remaining}/{rateLimitInfo.limit} messages remaining in {rateLimitInfo.windowSeconds}s</span>
              ) : (
                <span>Remote city: {rateLimitInfo.allowed ? `${rateLimitInfo.remaining} message(s) remaining` : `Rate limited - try again in ${rateLimitInfo.retryAfter}s`}</span>
              )}
            </div>
          )}

          <p className="text-xs text-gray-500">
            Slash commands: {CHAT_SUPPORTED_COMMANDS.map((name) => `/${name}`).join(', ')}
          </p>
        </section>
      </div>

      <EncryptionUnlockModal
        isOpen={showUnlockModal}
        onUnlock={handleModalUnlock}
        onClose={() => setShowUnlockModal(false)}
        showCloseButton={serverUnlocked}
      />
    </div>
  );
};

export default Chat;
