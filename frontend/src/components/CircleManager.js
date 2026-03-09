import React, { useEffect, useMemo, useRef, useState } from 'react';

const STAGE_WIDTH = 760;
const STAGE_HEIGHT = 460;
const NODE_SIZE = 84;
const OWNER_X = STAGE_WIDTH / 2;
const OWNER_Y = STAGE_HEIGHT / 2;
const OWNER_RADIUS = 120;
const OWNER_NODE_SIZE = 64;
const FRIEND_NODE_SIZE = 56;
const FRIEND_RING_RADIUS = OWNER_RADIUS + 120;
const SECURE_RING_COLOR = '#f59e0b';
const SOCIAL_RING_COLOR = '#e0e7ff';
const STAGE_BACKGROUND = 'radial-gradient(circle at center, rgba(59,130,246,0.14), rgba(15,23,42,0.04) 58%)';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const isRenderableCircleImage = (value = '') => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

function CircleManager({
  circles,
  friends,
  onCreateCircle,
  onUpdateCircle,
  onDeleteCircle,
  onAddMember,
  onRemoveMember
}) {
  const [circleName, setCircleName] = useState('');
  const [circleColor, setCircleColor] = useState('#3B82F6');
  const [circleAudience, setCircleAudience] = useState('social');
  const [circleProfileImageUrl, setCircleProfileImageUrl] = useState('');
  const [activeCircleName, setActiveCircleName] = useState('');
  const [editName, setEditName] = useState('');
  const [editAudience, setEditAudience] = useState('social');
  const [editProfileImageUrl, setEditProfileImageUrl] = useState('');
  const [suggestQuery, setSuggestQuery] = useState('');
  const [positions, setPositions] = useState({});
  const [draggingCircleName, setDraggingCircleName] = useState('');
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(null);

  const handleCreate = (event) => {
    event.preventDefault();
    const name = circleName.trim();
    if (!name) return;
    const normalizedProfileImageUrl = circleProfileImageUrl.trim();
    onCreateCircle({
      name,
      color: circleColor,
      relationshipAudience: circleAudience,
      profileImageUrl: isRenderableCircleImage(normalizedProfileImageUrl) ? normalizedProfileImageUrl : ''
    });
    setCircleName('');
    setCircleProfileImageUrl('');
    setCircleAudience('social');
  };

  useEffect(() => {
    if (!Array.isArray(circles) || circles.length === 0) {
      setActiveCircleName('');
      setPositions({});
      return;
    }
    const fallbackCircleName = circles[0]?.name || '';
    setActiveCircleName((prev) => (prev && circles.some((circle) => circle.name === prev) ? prev : fallbackCircleName));
    setPositions((prev) => {
      const next = {};
      circles.forEach((circle, index) => {
        const angle = ((Math.PI * 2) / Math.max(circles.length, 1)) * index - (Math.PI / 2);
        const targetX = OWNER_X + (OWNER_RADIUS * Math.cos(angle)) - (NODE_SIZE / 2);
        const targetY = OWNER_Y + (OWNER_RADIUS * Math.sin(angle)) - (NODE_SIZE / 2);
        const existing = prev[circle.name];
        next[circle.name] = existing || { x: targetX, y: targetY, vx: 0, vy: 0 };
      });
      return next;
    });
  }, [circles]);

  useEffect(() => {
    const selectedCircle = circles.find((circle) => circle.name === activeCircleName);
    if (!selectedCircle) return;
    setEditName(selectedCircle.name);
    setEditAudience(selectedCircle.relationshipAudience === 'secure' ? 'secure' : 'social');
    setEditProfileImageUrl(selectedCircle.profileImageUrl || '');
  }, [activeCircleName, circles]);

  useEffect(() => {
    if (!circles.length) return undefined;
    const step = () => {
      setPositions((prev) => {
        const next = { ...prev };
        circles.forEach((circle, index) => {
          const current = next[circle.name];
          if (!current || draggingCircleName === circle.name) return;

          const angle = ((Math.PI * 2) / Math.max(circles.length, 1)) * index - (Math.PI / 2);
          const targetX = OWNER_X + (OWNER_RADIUS * Math.cos(angle)) - (NODE_SIZE / 2);
          const targetY = OWNER_Y + (OWNER_RADIUS * Math.sin(angle)) - (NODE_SIZE / 2);

          const springX = (targetX - current.x) * 0.02;
          const springY = (targetY - current.y) * 0.02;
          let vx = (current.vx + springX) * 0.9;
          let vy = (current.vy + springY) * 0.9;
          let x = current.x + vx;
          let y = current.y + vy;

          const minX = 10;
          const minY = 10;
          const maxX = STAGE_WIDTH - NODE_SIZE - 10;
          const maxY = STAGE_HEIGHT - NODE_SIZE - 10;
          if (x < minX || x > maxX) {
            vx *= -0.7;
            x = clamp(x, minX, maxX);
          }
          if (y < minY || y > maxY) {
            vy *= -0.7;
            y = clamp(y, minY, maxY);
          }
          next[circle.name] = { x, y, vx, vy };
        });
        return next;
      });
      rafRef.current = window.requestAnimationFrame(step);
    };

    rafRef.current = window.requestAnimationFrame(step);
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [circles, draggingCircleName]);

  const selectedCircle = useMemo(
    () => circles.find((circle) => circle.name === activeCircleName) || null,
    [circles, activeCircleName]
  );

  const friendSuggestions = useMemo(() => {
    if (!selectedCircle) return [];
    const memberSet = new Set((selectedCircle.members || []).map((member) => String(member._id)));
    const normalizedQuery = suggestQuery.trim().toLowerCase();
    return friends.filter((friend) => {
      if (memberSet.has(String(friend._id))) return false;
      if (!normalizedQuery) return true;
      const label = `${friend.realName || ''} ${friend.username || ''}`.toLowerCase();
      return label.includes(normalizedQuery);
    }).slice(0, 8);
  }, [selectedCircle, friends, suggestQuery]);

  const friendPositions = useMemo(
    () => friends.map((friend, index) => {
      const angle = ((Math.PI * 2) / Math.max(friends.length, 1)) * index - (Math.PI / 2);
      const x = OWNER_X + (FRIEND_RING_RADIUS * Math.cos(angle)) - (FRIEND_NODE_SIZE / 2);
      const y = OWNER_Y + (FRIEND_RING_RADIUS * Math.sin(angle)) - (FRIEND_NODE_SIZE / 2);
      return {
        friend,
        x: clamp(x, 10, STAGE_WIDTH - FRIEND_NODE_SIZE - 10),
        y: clamp(y, 10, STAGE_HEIGHT - FRIEND_NODE_SIZE - 10)
      };
    }),
    [friends]
  );

  const handleSaveCircle = () => {
    if (!selectedCircle) return;
    const normalizedName = editName.trim();
    if (!normalizedName) return;
    const normalizedImage = editProfileImageUrl.trim();
    onUpdateCircle(selectedCircle.name, {
      name: normalizedName,
      relationshipAudience: editAudience,
      profileImageUrl: isRenderableCircleImage(normalizedImage) ? normalizedImage : ''
    });
  };

  const handlePointerMove = (event) => {
    if (!draggingCircleName) return;
    const stageBounds = event.currentTarget.getBoundingClientRect();
    const rawX = event.clientX - stageBounds.left - dragOffsetRef.current.x;
    const rawY = event.clientY - stageBounds.top - dragOffsetRef.current.y;
    const x = clamp(rawX, 10, STAGE_WIDTH - NODE_SIZE - 10);
    const y = clamp(rawY, 10, STAGE_HEIGHT - NODE_SIZE - 10);
    setPositions((prev) => ({
      ...prev,
      [draggingCircleName]: { x, y, vx: 0, vy: 0 }
    }));
  };

  const handleFriendDrop = (event, circle) => {
    event.preventDefault();
    const friendId = event.dataTransfer.getData('application/socialsecure-friend-id');
    if (friendId) {
      onAddMember(circle.name, friendId);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-violet-200 bg-gradient-to-b from-white via-violet-50/40 to-sky-50/50 p-5 shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-900">Circle Manager</h3>
        <p className="text-xs text-slate-500">Drag circles, drop friends, and tap nodes to edit instantly.</p>
      </div>

      <form onSubmit={handleCreate} className="grid grid-cols-1 gap-2 md:grid-cols-5">
        <input
          value={circleName}
          onChange={(event) => setCircleName(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2"
          placeholder="Circle name"
          maxLength={50}
        />
        <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <span className="font-medium text-slate-600">Secure circle</span>
          <input
            aria-label="Create secure circle toggle"
            type="checkbox"
            checked={circleAudience === 'secure'}
            onChange={(event) => setCircleAudience(event.target.checked ? 'secure' : 'social')}
          />
        </label>
        <input
          value={circleProfileImageUrl}
          onChange={(event) => setCircleProfileImageUrl(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2"
          placeholder="Profile image URL (optional)"
          maxLength={2048}
        />
        <input
          type="color"
          value={circleColor}
          onChange={(event) => setCircleColor(event.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white p-1"
        />
        <button type="submit" className="rounded-xl bg-violet-600 px-4 py-2 text-white transition hover:-translate-y-0.5 hover:bg-violet-700">
          Add New Circle
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <div>
          <div
            className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/90"
            style={{ maxWidth: `${STAGE_WIDTH}px` }}
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDraggingCircleName('')}
            onPointerLeave={() => setDraggingCircleName('')}
          >
            <div className="pointer-events-none absolute inset-0 opacity-50" style={{ background: STAGE_BACKGROUND }} />
            <div
              className="relative mx-auto"
              style={{ width: `${STAGE_WIDTH}px`, height: `${STAGE_HEIGHT}px` }}
              data-testid="circle-spider-stage"
            >
              <div className="absolute rounded-full border-2 border-violet-200 bg-violet-500 text-xs font-semibold text-white shadow-sm" style={{ left: `${OWNER_X - (OWNER_NODE_SIZE / 2)}px`, top: `${OWNER_Y - (OWNER_NODE_SIZE / 2)}px`, width: `${OWNER_NODE_SIZE}px`, height: `${OWNER_NODE_SIZE}px`, display: 'grid', placeItems: 'center' }}>
                You
              </div>
              {friendPositions.map(({ friend, x, y }) => {
                const friendName = friend.realName || friend.username;
                const centerX = x + (FRIEND_NODE_SIZE / 2);
                const centerY = y + (FRIEND_NODE_SIZE / 2);
                const dx = centerX - OWNER_X;
                const dy = centerY - OWNER_Y;
                const distance = Math.hypot(dx, dy);
                const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                return (
                  <React.Fragment key={friend._id}>
                    <div
                      className="pointer-events-none absolute origin-left bg-slate-200/80"
                      style={{ left: `${OWNER_X}px`, top: `${OWNER_Y}px`, width: `${distance}px`, height: '2px', transform: `rotate(${angle}deg)` }}
                    />
                    <button
                      type="button"
                      draggable
                      data-testid={`friend-node-${friend._id}`}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('application/socialsecure-friend-id', String(friend._id));
                        event.dataTransfer.setData('text/plain', friendName);
                      }}
                      className="absolute flex items-center justify-center rounded-full border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 shadow-sm"
                      style={{ left: `${x}px`, top: `${y}px`, width: `${FRIEND_NODE_SIZE}px`, height: `${FRIEND_NODE_SIZE}px` }}
                      title={`Drag ${friendName} onto a circle`}
                    >
                      <span className="line-clamp-2 text-center leading-tight">{friendName}</span>
                    </button>
                  </React.Fragment>
                );
              })}
              {circles.map((circle) => {
                const position = positions[circle.name] || { x: OWNER_X, y: OWNER_Y };
                const isActive = circle.name === activeCircleName;
                return (
                  <button
                    key={circle.name}
                    type="button"
                    data-testid={`circle-node-${circle.name}`}
                    className={`absolute flex cursor-grab flex-col items-center justify-center rounded-full border-2 text-xs font-semibold text-white shadow-lg transition ${isActive ? 'scale-105 ring-4 ring-violet-200' : ''}`}
                    style={{ left: `${position.x}px`, top: `${position.y}px`, width: `${NODE_SIZE}px`, height: `${NODE_SIZE}px`, backgroundColor: circle.color || '#3B82F6', borderColor: circle.relationshipAudience === 'secure' ? SECURE_RING_COLOR : SOCIAL_RING_COLOR }}
                    onClick={() => setActiveCircleName(circle.name)}
                    onPointerDown={(event) => {
                      const nodeBounds = event.currentTarget.getBoundingClientRect();
                      dragOffsetRef.current = {
                        x: event.clientX - nodeBounds.left,
                        y: event.clientY - nodeBounds.top
                      };
                      setDraggingCircleName(circle.name);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleFriendDrop(event, circle)}
                  >
                    {isRenderableCircleImage(circle.profileImageUrl) ? (
                      <img src={circle.profileImageUrl} alt="" className="mb-1 h-6 w-6 rounded-full border border-white/70 object-cover" />
                    ) : null}
                    <span className="w-full truncate px-1 text-center">{circle.name}</span>
                    <span className="text-[10px] opacity-90">{circle.memberCount || 0} members</span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Tip: drag friend chips onto circle bubbles, or use quick-add search.</p>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4">
          {selectedCircle ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-slate-800">Edit Circle</h4>
                <button type="button" onClick={() => onDeleteCircle(selectedCircle.name)} className="text-sm font-medium text-red-600 hover:text-red-700">Delete</button>
              </div>
              <input value={editName} onChange={(event) => setEditName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Circle name" maxLength={50} />
              <input value={editProfileImageUrl} onChange={(event) => setEditProfileImageUrl(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Profile image URL (optional)" maxLength={2048} />
              <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <span>{editAudience === 'secure' ? 'Secure circle' : 'Social circle'}</span>
                <input type="checkbox" checked={editAudience === 'secure'} onChange={(event) => setEditAudience(event.target.checked ? 'secure' : 'social')} aria-label="Circle type toggle" />
              </label>
              <button type="button" onClick={handleSaveCircle} className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">Save Changes</button>

              <div className="space-y-2">
                <input
                  value={suggestQuery}
                  onChange={(event) => setSuggestQuery(event.target.value)}
                  placeholder="Search friends to add…"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                {suggestQuery.trim() ? (
                  <div className="max-h-32 overflow-auto rounded-xl border border-slate-200">
                    {friendSuggestions.length > 0 ? friendSuggestions.map((friend) => (
                      <button
                        key={friend._id}
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => {
                          onAddMember(selectedCircle.name, friend._id);
                          setSuggestQuery('');
                        }}
                      >
                        <span>{friend.realName || friend.username}</span>
                        <span className="text-xs text-slate-500">@{friend.username}</span>
                      </button>
                    )) : <p className="px-3 py-2 text-xs text-slate-500">No matching friends.</p>}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                {(selectedCircle.members || []).length === 0 ? (
                  <p className="text-sm text-slate-500">No members yet.</p>
                ) : (selectedCircle.members || []).map((member) => (
                  <div key={member._id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <span>{member.realName || member.username}</span>
                    <button type="button" className="text-red-600 hover:text-red-700" onClick={() => onRemoveMember(selectedCircle.name, member._id)}>Remove</button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">{circles.length === 0 ? 'No circles yet. Add one to get started.' : 'Select a circle bubble to edit details.'}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default CircleManager;
