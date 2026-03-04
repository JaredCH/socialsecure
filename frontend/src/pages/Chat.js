import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { authAPI, chatAPI } from '../utils/api';
import {
  createWrappedRoomKeyPackage,
  decryptEnvelope,
  encryptEnvelope,
  getCacheLimit,
  ingestWrappedRoomKeyPackage,
  setBoundedPlaintextCache,
  unlockOrCreateVault
} from '../utils/e2ee';

const MESSAGE_PAGE_SIZE = 30;
const MAX_MESSAGES_IN_MEMORY = 150;
const MAX_VISIBLE_DECRYPT = 30;

const getMessageId = (message) => String(message?._id || `${message?.e2ee?.clientMessageId || 'msg'}:${message?.createdAt || ''}`);

const normalizeRoomLabel = (room) => {
  if (!room) return '';
  return room.name || [room.city, room.state].filter(Boolean).join(', ') || String(room._id);
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

  const [messages, setMessages] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendValue, setSendValue] = useState('');
  const [sending, setSending] = useState(false);

  const [decrypting, setDecrypting] = useState(false);
  const [decryptErrors, setDecryptErrors] = useState({});
  const [plaintextById, setPlaintextById] = useState({});
  const plaintextCacheRef = useRef(new Map());
  const latestPackageSyncByRoomRef = useRef({});

  const isUnlocked = Boolean(session);
  const activeRoom = useMemo(
    () => rooms.find((room) => String(room._id) === String(activeRoomId)) || null,
    [rooms, activeRoomId]
  );

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

        const nearby = await chatAPI.getNearbyRooms(location.longitude, location.latitude, 100);
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

  const handleLock = () => {
    setSession(null);
    setPlaintextById({});
    setDecryptErrors({});
    plaintextCacheRef.current.clear();
  };

  const fetchMessagesPage = async (roomId, cursor, reset = false) => {
    setMessagesLoading(true);
    try {
      const response = await chatAPI.getMessagesByCursor(roomId, cursor, MESSAGE_PAGE_SIZE);
      const batch = Array.isArray(response.data?.messages) ? response.data.messages : [];
      const pagination = response.data?.pagination || {};

      setMessages((prev) => {
        // Older pages are prepended to keep chronological ordering in the viewport.
        const combined = reset ? batch : [...batch, ...prev];
        if (combined.length <= MAX_MESSAGES_IN_MEMORY) return combined;
        return combined.slice(combined.length - MAX_MESSAGES_IN_MEMORY);
      });

      setHasMore(Boolean(pagination.hasMore));
      setNextCursor(pagination.nextCursor || null);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load encrypted messages.');
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    if (!activeRoomId) return;
    setMessages([]);
    setPlaintextById({});
    setDecryptErrors({});
    setNextCursor(null);
    setHasMore(true);
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

  const handleSend = async (event) => {
    event.preventDefault();
    const trimmed = sendValue.trim();
    if (!trimmed || !activeRoomId || !session) return;

    setSending(true);
    try {
      await loadKeyPackages(activeRoomId, session);
      const { keyVersion, keyBytes } = await ensureRoomKey(activeRoomId, session);
      const envelope = await encryptEnvelope({
        session,
        roomId: activeRoomId,
        keyVersion,
        roomKey: keyBytes,
        plaintext: trimmed
      });

      const response = await chatAPI.sendE2EEMessage(activeRoomId, { e2ee: envelope });
      const sentMessage = response.data?.messageData;
      if (sentMessage) {
        setMessages((prev) => {
          const next = [...prev, sentMessage];
          return next.length > MAX_MESSAGES_IN_MEMORY ? next.slice(next.length - MAX_MESSAGES_IN_MEMORY) : next;
        });
      }
      setSendValue('');
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Failed to send encrypted message.');
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
            Messages are encrypted client-side. Server stores only ciphertext envelopes.
          </p>
        </div>
        {isUnlocked ? (
          <button type="button" onClick={handleLock} className="px-3 py-2 rounded border text-sm">
            Lock Encryption
          </button>
        ) : null}
      </div>

      {!isUnlocked ? (
        <form onSubmit={handleUnlock} className="border rounded p-4 bg-gray-50 space-y-3">
          <h3 className="font-semibold">Encryption Password Required</h3>
          <p className="text-sm text-gray-700">
            Enter your Encryption Password to unlock local device keys and room keys.
          </p>
          <input
            type="password"
            value={unlockPassword}
            onChange={(event) => setUnlockPassword(event.target.value)}
            className="w-full border rounded p-2"
            autoComplete="current-password"
            placeholder="Encryption Password"
            required
          />
          {unlockError ? <p className="text-sm text-red-600">{unlockError}</p> : null}
          <button
            type="submit"
            disabled={unlocking}
            className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
          >
            {unlocking ? 'Unlocking...' : 'Unlock Encryption'}
          </button>
        </form>
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
            <div className="text-xs text-gray-500">
              Decrypt cache: {plaintextCacheRef.current.size}/{getCacheLimit()} in memory
            </div>
          </div>

          <div className="space-y-2 max-h-[420px] overflow-y-auto border rounded p-3 bg-gray-50">
            {messages.length === 0 && !messagesLoading ? (
              <p className="text-sm text-gray-500">No messages yet.</p>
            ) : null}

            {messages.map((message) => {
              const id = getMessageId(message);
              const plaintext = plaintextById[id];
              const decryptError = decryptErrors[id];
              const isE2EE = Boolean(message?.e2ee?.enabled);
              const author = message?.userId?.username || message?.userId?.realName || 'user';

              return (
                <article key={id} className="border rounded bg-white p-2">
                  <div className="text-xs text-gray-500 mb-1">
                    <span className="font-medium">@{author}</span> • {new Date(message.createdAt).toLocaleString()}
                  </div>
                  {isE2EE ? (
                    <>
                      {plaintext ? <p className="text-sm whitespace-pre-wrap">{plaintext}</p> : null}
                      {!plaintext && decryptError ? (
                        <p className="text-sm text-red-600">{decryptError}</p>
                      ) : null}
                      {!plaintext && !decryptError ? (
                        <p className="text-sm text-gray-500">Encrypted message (locked or pending decrypt)</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm">{message.content || '[Non-E2EE message]'}</p>
                  )}
                </article>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fetchMessagesPage(activeRoomId, nextCursor, false)}
              disabled={!activeRoomId || !hasMore || messagesLoading}
              className="px-3 py-2 border rounded text-sm disabled:opacity-50"
            >
              {messagesLoading ? 'Loading...' : hasMore ? `Load Older (${MESSAGE_PAGE_SIZE})` : 'No More Messages'}
            </button>
            {decrypting ? <span className="text-xs text-gray-500 self-center">Decrypting visible messages...</span> : null}
          </div>

          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={sendValue}
              onChange={(event) => setSendValue(event.target.value)}
              disabled={!isUnlocked || !activeRoomId || sending}
              className="flex-1 border rounded p-2"
              maxLength={2000}
              placeholder={isUnlocked ? 'Type encrypted message...' : 'Unlock encryption to send'}
            />
            <button
              type="submit"
              disabled={!isUnlocked || !activeRoomId || !sendValue.trim() || sending}
              className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send E2EE'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default Chat;
