import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { authAPI, chatAPI } from '../utils/api';
import {
  parseSlashCommand,
  runSlashCommand,
  UNKNOWN_COMMAND_HELP,
  SUPPORTED_COMMANDS
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
  const [nickByUserId, setNickByUserId] = useState({});
  const [localNickname, setLocalNickname] = useState('');
  const [useMonospace, setUseMonospace] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [replyToUsername, setReplyToUsername] = useState('');

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

  const [dmQuery, setDmQuery] = useState('');
  const [dmSearchLoading, setDmSearchLoading] = useState(false);
  const [dmResults, setDmResults] = useState([]);

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

  const scrollToBottom = () => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
    setUnreadCount(0);
    setIsAtBottom(true);
  };

  const getDisplayName = (message) => {
    const messageUserId = message?.userId?._id ? String(message.userId._id) : null;
    if (messageUserId && nickByUserId[messageUserId]) {
      return nickByUserId[messageUserId];
    }
    if (profile?._id && messageUserId && String(profile._id) === messageUserId && localNickname) {
      return localNickname;
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

  const handleSend = async (event) => {
    event.preventDefault();
    const trimmed = composerValue.trim();
    if (!trimmed || !activeConversationId) return;

    setSending(true);
    try {
      const { data } = await chatAPI.sendConversationMessage(activeConversationId, trimmed);
      setMessages((prev) => [...prev, data.message]);
      setComposerValue('');
      await refreshHub(activeChannel);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleStartDM = async (targetUserId) => {
    try {
      const { data } = await chatAPI.startDM(targetUserId);
      await refreshHub('dm');
      setActiveChannel('dm');
      setActiveConversationId(String(data.conversation._id));
      setDmResults([]);
      setDmQuery('');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to start DM');
    }
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

  useEffect(() => () => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
    }
  }, []);

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

  const handleCopyMessage = async (text) => {
    const normalized = String(text || '').trim();
    if (!normalized) return;
    try {
      await navigator.clipboard.writeText(normalized);
      toast.success('Copied message');
    } catch {
      toast.error('Unable to copy message');
    }
  };

  const handleReplyToUser = (username) => {
    const normalized = String(username || '').trim();
    if (!normalized) return;
    setReplyToUsername(normalized);
    setSendValue((prev) => {
      if (prev.trim().startsWith(`@${normalized}`)) return prev;
      if (prev.trim().length === 0) return `@${normalized} `;
      return `@${normalized} ${prev}`;
    });
  };

  const handleSlashCommand = async ({ command, argsRaw }) => {
    const result = runSlashCommand({
      command,
      argsRaw,
      username: localNickname || profile?.username || profile?.realName || 'user'
    });

    if (!result.ok) {
      toast.error(result.error || UNKNOWN_COMMAND_HELP);
      return;
    }
    await sendEncryptedPayload(result.payload);
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
        const withReply = replyToUsername ? `@${replyToUsername} ${trimmed}` : trimmed;
        await sendEncryptedPayload({ plaintext: withReply, messageType: 'text' });
      }
      setSendValue('');
      setReplyToUsername('');
      if (isAtBottom) {
        requestAnimationFrame(() => scrollToBottom());
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to search users');
    } finally {
      setDmSearchLoading(false);
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
      <div>
        <h2 className="text-2xl font-semibold">Unified Chat Hub</h2>
        <p className="text-sm text-gray-600">
          Zip rooms, direct messages, and profile threads in one workspace.
        </p>
        {profile?.zipCode ? (
          <p className="text-xs text-gray-500 mt-1">Your default zip room: {profile.zipCode}</p>
        ) : (
          <p className="text-xs text-amber-700 mt-1">Add a zip code in your profile to enable default zip-room chat.</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <aside className="lg:col-span-3 border rounded p-3 space-y-3">
          <h3 className="font-semibold">Channels</h3>
          <div className="space-y-2">
            {CHANNELS.map((channel) => (
              <button
                key={channel.key}
                type="button"
                onClick={() => setActiveChannel(channel.key)}
                className={`w-full text-left border rounded px-2 py-2 text-sm ${activeChannel === channel.key ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'}`}
              >
                {channel.label}
              </button>
            ))}
          </div>

          {activeChannel === 'zip' ? (
            <div className="text-xs text-gray-600 border-t pt-3">
              Nearby zip rooms are shown only when active rooms exist.
            </div>
          ) : null}

          {activeChannel === 'dm' ? (
            <form onSubmit={runDmSearch} className="space-y-2 border-t pt-3">
              <label className="text-xs font-medium text-gray-700 block">Start DM</label>
              <input
                value={dmQuery}
                onChange={(event) => setDmQuery(event.target.value)}
                className="w-full border rounded p-2 text-sm"
                placeholder="Search users"
              />
              <button type="submit" className="w-full bg-blue-600 text-white rounded px-3 py-2 text-sm" disabled={dmSearchLoading}>
                {dmSearchLoading ? 'Searching...' : 'Search'}
              </button>
              {dmResults.length > 0 ? (
                <ul className="max-h-40 overflow-auto border rounded divide-y">
                  {dmResults.map((user) => (
                    <li key={String(user._id)} className="p-2 text-xs flex justify-between items-center gap-2">
                      <span>@{user.username || user.realName || 'user'}</span>
                      <button
                        type="button"
                        onClick={() => handleStartDM(user._id)}
                        className="border rounded px-2 py-1 hover:bg-gray-50"
                      >
                        DM
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </form>
          ) : null}
        </aside>

        <section className="lg:col-span-4 border rounded p-3">
          <h3 className="font-semibold mb-2">Conversations</h3>
          {conversationList.length === 0 ? (
            <p className="text-sm text-gray-500">No conversations in this channel yet.</p>
          ) : (
            <ul className="space-y-2">
              {conversationList.map((conversation) => {
                const selected = String(conversation._id) === String(activeConversationId);
                return (
                  <li key={String(conversation._id)}>
                    <button
                      type="button"
                      onClick={() => setActiveConversationId(String(conversation._id))}
                      className={`w-full text-left border rounded px-2 py-2 text-sm ${selected ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'}`}
                    >
                      <div className="font-medium">{getConversationLabel(conversation)}</div>
                      {conversation.lastMessageAt ? (
                        <div className="text-xs text-gray-500">Last active {new Date(conversation.lastMessageAt).toLocaleString()}</div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="lg:col-span-5 border rounded p-3 space-y-3">
          <h3 className="font-semibold">{activeConversation ? getConversationLabel(activeConversation) : 'Select a conversation'}</h3>

          {messagesError ? (
            <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded p-2">{messagesError}</div>
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
            ) : (
              messages.map((message) => (
                <div key={String(message._id)} className="text-sm">
                  <div className="text-xs text-gray-500">
                    @{message.userId?.username || message.userId?.realName || 'user'} · {new Date(message.createdAt).toLocaleString()}
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
                  {messageType !== 'system' ? (
                    <span className="ml-2 hidden group-hover:inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleReplyToUser(author)}
                        className="text-[10px] text-blue-600 hover:underline"
                      >
                        Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(bodyText)}
                        className="text-[10px] text-blue-600 hover:underline"
                      >
                        Copy
                      </button>
                    </span>
                  ) : null}
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
                {unreadCount} unread message{unreadCount === 1 ? '' : 's'} ↓
              </button>
            </div>
          ) : null}

          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={sendValue}
              onChange={(event) => handleInputChange(event.target.value)}
              onBlur={() => emitTypingStop({ scope: 'chat', targetId: activeRoomId })}
              disabled={!isUnlocked || !activeRoomId || sending}
              className="flex-1 border rounded p-2"
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              maxLength={2000}
              placeholder={isUnlocked ? `Type encrypted message or ${SUPPORTED_COMMANDS.map((name) => `/${name}`).join(' ')}` : 'Unlock encryption to send'}
            />
            <button
              type="submit"
              disabled={!activeConversationId || !composerValue.trim() || sending}
              className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </form>

          {/* Rate limit info display */}
          {rateLimitInfo && (
            <div className={`text-xs p-2 rounded ${rateLimitInfo.allowed ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
              {rateLimitInfo.bucket === 'primary' ? (
                <span>✓ You're in this city - unlimited messages</span>
              ) : rateLimitInfo.bucket === 'nearby' ? (
                <span>📍 Nearby city ({rateLimitInfo.distance?.toFixed(0)} miles) - {rateLimitInfo.remaining}/{rateLimitInfo.limit} messages per {rateLimitInfo.windowSeconds}s remaining</span>
              ) : (
                <span>🌍 Remote city - {rateLimitInfo.allowed ? `${rateLimitInfo.remaining} message(s) remaining` : `Rate limited - try again in ${rateLimitInfo.retryAfter}s`}</span>
              )}
            </div>
          )}

          {replyToUsername ? (
            <div className="text-xs text-gray-600 -mt-1">
              Replying to <span className="font-semibold">@{replyToUsername}</span>
              <button
                type="button"
                onClick={() => setReplyToUsername('')}
                className="ml-2 text-blue-600 hover:underline"
              >
                Clear
              </button>
            </div>
          ) : null}

          <p className="text-xs text-gray-500">
            Slash commands: {SUPPORTED_COMMANDS.map((name) => `/${name}`).join(', ')}
          </p>
        </section>
      </div>
    </div>
  );
}

export default Chat;
