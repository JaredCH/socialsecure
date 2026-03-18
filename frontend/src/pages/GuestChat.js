import React, { useEffect, useMemo, useState } from 'react';
import { chatAPI } from '../utils/api';

const GuestChat = () => {
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setRoomsLoading(true);
      setRoomsError('');
      try {
        const { data } = await chatAPI.getAllRooms(1, 500);
        if (cancelled) return;
        const discoveredRooms = Array.isArray(data?.rooms) ? data.rooms : [];
        setRooms(discoveredRooms);
        setSelectedRoomId((current) => {
          if (String(current || '').trim().length > 0 || discoveredRooms.length === 0) return current;
          return String(discoveredRooms[0]._id || '');
        });
      } catch {
        if (!cancelled) setRoomsError('Unable to load guest chat rooms right now.');
      } finally {
        if (!cancelled) setRoomsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const normalizedRoomId = String(selectedRoomId || '').trim();
    if (!normalizedRoomId) {
      setMessages([]);
      setMessagesError('');
      setMessagesLoading(false);
      return;
    }

    let cancelled = false;
    const loadRoomMessages = async () => {
      setMessagesLoading(true);
      setMessagesError('');
      try {
        const { data } = await chatAPI.getMessages(normalizedRoomId, 1, 100);
        if (cancelled) return;
        setMessages(Array.isArray(data?.messages) ? data.messages : []);
      } catch {
        if (!cancelled) {
          setMessages([]);
          setMessagesError('Unable to load room messages right now.');
        }
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    };

    loadRoomMessages();
    return () => {
      cancelled = true;
    };
  }, [selectedRoomId]);

  const selectedRoom = useMemo(
    () => rooms.find((room) => String(room?._id || '') === String(selectedRoomId || '')) || null,
    [rooms, selectedRoomId]
  );

  const stateRooms = useMemo(
    () => rooms.filter((room) => room?.discoveryGroup === 'states'),
    [rooms]
  );
  const topicRooms = useMemo(
    () => rooms.filter((room) => room?.discoveryGroup === 'topics'),
    [rooms]
  );
  const otherRooms = useMemo(
    () => rooms.filter((room) => room?.discoveryGroup !== 'states' && room?.discoveryGroup !== 'topics'),
    [rooms]
  );

  const renderRoomButton = (room) => {
    const roomId = String(room?._id || '');
    if (!roomId) return null;
    const isActive = roomId === String(selectedRoomId || '');
    return (
      <button
        key={roomId}
        type="button"
        onClick={() => setSelectedRoomId(roomId)}
        className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${isActive ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
      >
        <p className="font-medium">{room.name || 'Room'}</p>
        <p className="text-xs text-slate-500">
          {room.type || 'room'}
          {room.state ? ` • ${room.state}` : ''}
          {room.zipCode ? ` • ${room.zipCode}` : ''}
        </p>
      </button>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <p className="font-semibold">Guest mode: full chat browsing (read-only)</p>
        <p className="mt-1 text-sm">Room discovery and message reading are enabled. Sign in to send messages, react, or post.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          {roomsLoading ? <p className="text-sm text-slate-500">Loading rooms…</p> : null}
          {roomsError ? <p className="text-sm text-red-600">{roomsError}</p> : null}
          {!roomsLoading && !roomsError && rooms.length === 0 ? (
            <p className="text-sm text-slate-500">No public chat rooms available right now.</p>
          ) : null}

          <div className="space-y-3">
            {stateRooms.length > 0 ? (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">State Rooms</h2>
                <div className="space-y-2">{stateRooms.map(renderRoomButton)}</div>
              </section>
            ) : null}
            {topicRooms.length > 0 ? (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Topics</h2>
                <div className="space-y-2">{topicRooms.map(renderRoomButton)}</div>
              </section>
            ) : null}
            {otherRooms.length > 0 ? (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">More Rooms</h2>
                <div className="space-y-2">{otherRooms.map(renderRoomButton)}</div>
              </section>
            ) : null}
          </div>
        </aside>

        <section className="flex min-h-[420px] flex-col rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-900">{selectedRoom?.name || 'Select a room'}</h2>
            <p className="text-xs text-slate-500">
              {selectedRoom ? `${selectedRoom.type || 'room'} read-only view` : 'Choose any room from discovery to read messages.'}
            </p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" data-testid="guest-chat-message-list">
            {messagesLoading ? <p className="text-sm text-slate-500">Loading messages…</p> : null}
            {messagesError ? <p className="text-sm text-red-600">{messagesError}</p> : null}
            {!messagesLoading && !messagesError && selectedRoom && messages.length === 0 ? (
              <p className="text-sm text-slate-500">No messages in this room yet.</p>
            ) : null}
            {messages.map((message) => (
              <article key={String(message?._id || `${message?.createdAt}-${message?.content}`)} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">
                  @{message?.userId?.username || message?.userId?.realName || 'Unknown'}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{message?.content || ''}</p>
              </article>
            ))}
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3" data-testid="guest-chat-readonly-composer">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
              Read-only mode: sign in to send messages or react.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default GuestChat;
