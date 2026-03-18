import React, { useEffect, useState } from 'react';
import { chatAPI } from '../utils/api';

const GuestChat = () => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await chatAPI.getQuickAccessRooms();
        if (cancelled) return;
        const roomPayload = data?.rooms || {};
        const collected = [roomPayload.state, roomPayload.county, roomPayload.zip, ...(roomPayload.cities || [])]
          .filter(Boolean);
        setRooms(collected);
      } catch {
        if (!cancelled) setError('Unable to load guest chat rooms right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <p className="font-semibold">Guest mode: read-only chat discovery</p>
        <p className="mt-1 text-sm">Register to join rooms, post messages, and react in live chat.</p>
      </div>
      {loading ? <p className="text-sm text-slate-500">Loading rooms…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!loading && !error && rooms.length === 0 ? (
        <p className="text-sm text-slate-500">No public chat rooms available right now.</p>
      ) : null}
      <ul className="space-y-2">
        {rooms.map((room, index) => (
          <li key={String(room._id || `${room.type}-${room.name}-${index}`)} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="font-medium text-slate-900">{room.name || 'Room'}</p>
            <p className="text-xs text-slate-500">
              {room.type || 'room'}
              {room.state ? ` • ${room.state}` : ''}
              {room.zipCode ? ` • ${room.zipCode}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default GuestChat;
