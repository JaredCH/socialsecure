import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { authAPI, chatAPI } from '../utils/api';
import {
  parseCommandArguments,
  parseSlashCommand,
  SUPPORTED_COMMANDS,
  UNKNOWN_COMMAND_HELP
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

const MESSAGE_PAGE_SIZE = {
  INITIAL_LOAD: 500,
  OLDER_LOAD: 250
};
const MAX_MESSAGES_IN_MEMORY = 1200;
const MAX_VISIBLE_DECRYPT = 120;
const SCROLL_BOTTOM_THRESHOLD = 48;
const MAX_VOICE_DURATION_MS = 120000;
const MAX_WAVEFORM_BINS = 48;

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

const formatDuration = (durationMs = 0) => {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const WaveformBars = ({ bins = [] }) => (
  <div className="flex items-end gap-[1px] h-8 w-full max-w-xs">
    {bins.map((value, index) => (
      <span
        key={`${index}-${value}`}
        className="block bg-blue-400/80 rounded-sm flex-1 min-w-[2px]"
        style={{ height: `${Math.max(8, Math.round(value * 100))}%` }}
      />
    ))}
  </div>
);

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
  const [voiceState, setVoiceState] = useState('idle');
  const [voiceBlob, setVoiceBlob] = useState(null);
  const [voiceDurationMs, setVoiceDurationMs] = useState(0);
  const [voiceWaveform, setVoiceWaveform] = useState([]);
  const [voiceMimeType, setVoiceMimeType] = useState('');
  const [voicePreviewUrl, setVoicePreviewUrl] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [recordingStartedAt, setRecordingStartedAt] = useState(null);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [nickByUserId, setNickByUserId] = useState({});
  const [localNickname, setLocalNickname] = useState('');
  const [useMonospace, setUseMonospace] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const [decrypting, setDecrypting] = useState(false);
  const [decryptErrors, setDecryptErrors] = useState({});
  const [plaintextById, setPlaintextById] = useState({});
  const [rateLimitInfo, setRateLimitInfo] = useState(null);
  const plaintextCacheRef = useRef(new Map());
  const latestPackageSyncByRoomRef = useRef({});
  const messageViewportRef = useRef(null);
  const messageCountRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);

  const isUnlocked = Boolean(session);
  const activeRoom = useMemo(
    () => rooms.find((room) => String(room._id) === String(activeRoomId)) || null,
    [rooms, activeRoomId]
  );

  useEffect(() => () => {
    if (voicePreviewUrl) {
      URL.revokeObjectURL(voicePreviewUrl);
    }
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => track.stop());
    }
  }, [voicePreviewUrl]);

  useEffect(() => {
    if (!recordingStartedAt || voiceState !== 'recording') return undefined;
    const interval = setInterval(() => {
      const elapsed = Date.now() - recordingStartedAt;
      setRecordingElapsedMs(elapsed);
      if (elapsed >= MAX_VOICE_DURATION_MS && mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    }, 250);
    return () => clearInterval(interval);
  }, [recordingStartedAt, voiceState]);

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

        // Check if encryption is already unlocked via 12h session
        if (profileData.user?.hasEncryptionPassword) {
          try {
            const unlockStatus = await authAPI.getEncryptionUnlockStatus();
            if (unlockStatus.data?.unlocked) {
              setServerUnlocked(true);
              // Show modal but don't require password - user can proceed with session
              setShowUnlockModal(true);
            }
          } catch (unlockCheckError) {
            console.warn('Could not check unlock status:', unlockCheckError);
          }
        }

        // Try to sync location rooms first, then get nearby rooms
        try {
          await chatAPI.syncLocationRooms();
        } catch (syncError) {
          // Continue even if sync fails - user may not have location set
          console.warn('Location room sync skipped:', syncError.response?.data?.error);
        }

        // Get nearby rooms using user's location or browser geolocation
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
        // Security-critical: ignore tampered key package but keep sync process alive.
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

  // Handle unlock from modal (with 12h session) - called after modal successfully verifies password
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
      // Unlock local vault with the password from modal
      const { session: unlockedSession, created } = await unlockOrCreateVault({
        userId: profile._id,
        password: password
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
    
    // Tell backend to clear the unlock cookie
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

  const resetVoiceDraft = () => {
    if (voicePreviewUrl) {
      URL.revokeObjectURL(voicePreviewUrl);
    }
    setVoiceBlob(null);
    setVoiceDurationMs(0);
    setVoiceWaveform([]);
    setVoiceMimeType('');
    setVoicePreviewUrl('');
    setVoiceError('');
    setRecordingElapsedMs(0);
    setRecordingStartedAt(null);
    setVoiceState('idle');
  };

  const buildWaveformBins = async (blob) => {
    const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextImpl) return Array.from({ length: 12 }, () => 0.3);

    const audioContext = new AudioContextImpl();
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(arrayBuffer);
      const channelData = decoded.getChannelData(0);
      const segmentLength = Math.max(1, Math.floor(channelData.length / MAX_WAVEFORM_BINS));
      const bins = [];
      for (let i = 0; i < MAX_WAVEFORM_BINS; i += 1) {
        const start = i * segmentLength;
        if (start >= channelData.length) break;
        const end = Math.min(channelData.length, start + segmentLength);
        let sum = 0;
        for (let j = start; j < end; j += 1) {
          sum += Math.abs(channelData[j]);
        }
        const average = sum / Math.max(1, end - start);
        bins.push(Math.min(1, Number(average.toFixed(4))));
      }
      return bins.length > 0 ? bins : Array.from({ length: 12 }, () => 0.3);
    } finally {
      await audioContext.close().catch(() => {});
    }
  };

  const startVoiceRecording = async () => {
    if (!activeRoomId || !isUnlocked || voiceState === 'uploading' || sending) return;

    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      toast.error('Voice recording is not supported in this browser.');
      return;
    }

    try {
      if (voicePreviewUrl) {
        URL.revokeObjectURL(voicePreviewUrl);
      }
      setVoiceBlob(null);
      setVoiceDurationMs(0);
      setVoiceWaveform([]);
      setVoiceMimeType('');
      setVoicePreviewUrl('');
      setVoiceError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const preferredMime = ['audio/webm', 'audio/ogg', 'audio/mp4']
        .find((mime) => window.MediaRecorder.isTypeSupported?.(mime)) || 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      const startedAt = Date.now();
      recorder.onstop = async () => {
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        const elapsed = Math.max(1, Date.now() - startedAt);
        const blob = new Blob(chunks, { type: preferredMime });
        const bins = await buildWaveformBins(blob);
        const previewUrl = URL.createObjectURL(blob);

        if (recordingStreamRef.current) {
          recordingStreamRef.current.getTracks().forEach((track) => track.stop());
          recordingStreamRef.current = null;
        }

        setVoiceBlob(blob);
        setVoiceDurationMs(elapsed);
        setVoiceWaveform(bins);
        setVoiceMimeType(preferredMime);
        setVoicePreviewUrl(previewUrl);
        setRecordingElapsedMs(elapsed);
        setVoiceState('preview');
      };

      setRecordingStartedAt(startedAt);
      setRecordingElapsedMs(0);
      setVoiceState('recording');
      recorder.start();
    } catch (error) {
      setVoiceState('idle');
      toast.error(error.message || 'Unable to access microphone.');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const sendVoiceNote = async () => {
    if (!voiceBlob || !activeRoomId || !isUnlocked || voiceState === 'uploading') return;
    setVoiceState('uploading');
    setVoiceError('');

    try {
      const uploadResponse = await chatAPI.requestAudioUpload(activeRoomId, voiceBlob, {
        mimeType: voiceMimeType || voiceBlob.type || 'audio/webm',
        durationMs: voiceDurationMs,
        waveformBins: voiceWaveform
      });
      const audio = uploadResponse.data?.audio;
      if (!audio) {
        throw new Error('Upload did not return audio metadata.');
      }

      const sendResponse = await chatAPI.sendVoiceMessage(activeRoomId, audio);
      const sentMessage = sendResponse.data?.message || sendResponse.data?.messageData;
      if (sentMessage) {
        appendMessage(sentMessage);
      }
      resetVoiceDraft();
      toast.success('Voice note sent.');
      if (isAtBottom) {
        requestAnimationFrame(() => scrollToBottom());
      }
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Failed to send voice note.';
      setVoiceError(message);
      setVoiceState('preview');
      toast.error(message);
    }
  };

  const handleSlashCommand = async ({ command, argsRaw }) => {
    const parsed = parseCommandArguments(command, argsRaw);
    if (!parsed.ok) {
      toast.error(parsed.error || UNKNOWN_COMMAND_HELP);
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
        const rendered = `→ ${target}: ${message}`;
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
        toast.error(`Unsupported command. Available: ${SUPPORTED_COMMANDS.map((name) => `/${name}`).join(', ')}`);
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
      if (isAtBottom) {
        requestAnimationFrame(() => scrollToBottom());
      }
    } catch (error) {
      // Handle rate limit response
      if (error.response?.status === 429) {
        const rateData = error.response?.data?.rateLimit;
        if (rateData) {
          setRateLimitInfo({
            allowed: false,
            bucket: rateData.bucket || 'remote',
            limit: rateData.limit,
            remaining: 0,
            retryAfter: rateData.retryAfter,
            windowSeconds: rateData.windowSeconds
          });
          toast.error(`Rate limited. Try again in ${rateData.retryAfter} seconds.`);
          return;
        }
      }
      toast.error(error.response?.data?.error || error.message || 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
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
              const isAudioMessage = message?.mediaType === 'audio' && message?.audio;
              const audioMeta = isAudioMessage ? message.audio : null;
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
                      {isAudioMessage ? (
                        <span className="ml-2 inline-flex flex-col gap-1 align-middle">
                          <span className="text-xs text-gray-600">🎤 Voice note ({formatDuration(audioMeta.durationMs)})</span>
                          <WaveformBars bins={audioMeta.waveformBins || []} />
                          <audio controls preload="none" className="h-8" src={audioMeta.url} />
                        </span>
                      ) : (
                        <span className={`ml-1 whitespace-pre-wrap ${decryptError ? 'text-red-600' : (messageType === 'command' ? 'text-indigo-700' : 'text-gray-900')}`}>
                          {bodyText || '[Non-E2EE message]'}
                        </span>
                      )}
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
                {unreadCount} unread message{unreadCount === 1 ? '' : 's'} ↓
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

          {voiceState === 'recording' ? (
            <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm">
              <span className="text-red-600 font-medium">● Recording {formatDuration(recordingElapsedMs)}</span>
              <button
                type="button"
                onClick={stopVoiceRecording}
                className="px-3 py-1 rounded border border-red-300 text-red-700"
              >
                Stop
              </button>
            </div>
          ) : null}

          {voiceState === 'preview' || voiceState === 'uploading' ? (
            <div className="rounded border bg-blue-50 px-3 py-2 space-y-2">
              <div className="text-sm font-medium text-blue-800">Voice note preview ({formatDuration(voiceDurationMs)})</div>
              <WaveformBars bins={voiceWaveform} />
              {voicePreviewUrl ? <audio controls preload="metadata" className="w-full max-w-md" src={voicePreviewUrl} /> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={sendVoiceNote}
                  disabled={voiceState === 'uploading' || !voiceBlob}
                  className="bg-blue-600 text-white rounded px-3 py-1 disabled:opacity-50"
                >
                  {voiceState === 'uploading' ? 'Uploading...' : 'Send voice note'}
                </button>
                <button
                  type="button"
                  onClick={resetVoiceDraft}
                  disabled={voiceState === 'uploading'}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  Discard
                </button>
              </div>
              {voiceError ? <p className="text-xs text-red-600">{voiceError}</p> : null}
            </div>
          ) : null}

          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={sendValue}
              onChange={(event) => setSendValue(event.target.value)}
              disabled={!isUnlocked || !activeRoomId || sending || voiceState === 'recording' || voiceState === 'uploading'}
              className="flex-1 border rounded p-2"
              maxLength={2000}
              placeholder={isUnlocked ? 'Type encrypted message or /join /leave /nick /msg /list' : 'Unlock encryption to send'}
            />
            <button
              type="button"
              onClick={startVoiceRecording}
              disabled={!isUnlocked || !activeRoomId || sending || voiceState === 'recording' || voiceState === 'uploading'}
              className="px-3 py-2 border rounded disabled:opacity-50"
              title="Record voice note"
            >
              🎤
            </button>
            <button
              type="submit"
              disabled={!isUnlocked || !activeRoomId || !sendValue.trim() || sending || voiceState === 'recording' || voiceState === 'uploading'}
              className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send E2EE'}
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

          <p className="text-xs text-gray-500">
            Slash commands: /join [room], /leave, /nick [name], /msg [user] [message], /list
          </p>
        </section>
      </div>

      {/* Encryption Unlock Modal */}
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
