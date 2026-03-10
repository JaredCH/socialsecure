import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

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
const MAX_CIRCLES = 10;
const MAX_MEMBERS_PER_CIRCLE = 25;
const CIRCLE_LIMIT_MESSAGE = `Circle limit reached (${MAX_CIRCLES}). Delete one to add another.`;

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
  onRemoveMember,
  onMoveMember
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
  const [showCreateControls, setShowCreateControls] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [memberPreview, setMemberPreview] = useState(null);
  const [moveTargetCircle, setMoveTargetCircle] = useState('');
  const [stageScale, setStageScale] = useState(1);
  const stageWrapperRef = useRef(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(null);
  const hasCircleCapacity = circles.length < MAX_CIRCLES;

  useEffect(() => {
    const wrapper = stageWrapperRef.current;
    if (!wrapper || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const containerWidth = entry.contentRect.width;
      if (containerWidth > 0) {
        setStageScale(Math.min(1, containerWidth / STAGE_WIDTH));
      }
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasCircleCapacity) {
      setStatusMessage(CIRCLE_LIMIT_MESSAGE);
    } else {
      setStatusMessage((prev) => (prev === CIRCLE_LIMIT_MESSAGE ? '' : prev));
    }
  }, [hasCircleCapacity]);

  const handleCreate = (event) => {
    event.preventDefault();
    if (!hasCircleCapacity) {
      setStatusMessage(`You can create up to ${MAX_CIRCLES} circles.`);
      return;
    }
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
    setShowCreateControls(false);
    setStatusMessage('');
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

  const memberCirclesMap = useMemo(() => {
    const map = new Map();
    circles.forEach((circle) => {
      (circle.members || []).forEach((member) => {
        const id = String(member._id || '');
        if (!id) return;
        if (!map.has(id)) map.set(id, []);
        map.get(id).push(circle.name);
      });
    });
    return map;
  }, [circles]);

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
      const members = Array.isArray(circle.members) ? circle.members : [];
      const alreadyMember = members.some((member) => String(member?._id || member) === String(friendId));
      if (alreadyMember) {
        setStatusMessage('That friend is already in this circle.');
        return;
      }
      if (members.length >= MAX_MEMBERS_PER_CIRCLE) {
        setStatusMessage(`Each circle can have up to ${MAX_MEMBERS_PER_CIRCLE} members.`);
        return;
      }
      setStatusMessage('');
      onAddMember(circle.name, friendId);
    }
  };

  const openMemberPreview = (member, fromCircle) => {
    setMemberPreview({ member, fromCircle: fromCircle || null });
    setMoveTargetCircle('');
  };

  const closeMemberPreview = () => {
    setMemberPreview(null);
    setMoveTargetCircle('');
  };

  const handlePreviewRemove = () => {
    if (!memberPreview) return;
    const { member, fromCircle } = memberPreview;
    if (!fromCircle) return;
    onRemoveMember(fromCircle, member._id || member.id);
    closeMemberPreview();
  };

  const handlePreviewMove = () => {
    if (!memberPreview || !moveTargetCircle) return;
    const { member, fromCircle } = memberPreview;
    if (!fromCircle || !onMoveMember) return;
    onMoveMember(fromCircle, moveTargetCircle, member._id || member.id);
    closeMemberPreview();
  };

  return (
    <div className="space-y-5 rounded-2xl border border-violet-100 bg-gradient-to-b from-white via-violet-50/30 to-sky-50/40 p-5 shadow-sm">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Circle Manager</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Organise your connections into named circles. Drag bubbles, drop friends, or use search to add members.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
            {circles.length} / {MAX_CIRCLES} circles
          </span>
          {!showCreateControls ? (
            <button
              type="button"
              onClick={() => setShowCreateControls(true)}
              disabled={!hasCircleCapacity}
              className="flex items-center gap-1.5 rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Add New Circle
            </button>
          ) : null}
        </div>
      </div>

      {/* Create circle form */}
      {showCreateControls ? (
        <div className="rounded-2xl border border-violet-100 bg-white/80 p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Create a new circle</p>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                value={circleName}
                onChange={(event) => setCircleName(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm placeholder-slate-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
                placeholder="Circle name"
                maxLength={50}
              />
              <input
                value={circleProfileImageUrl}
                onChange={(event) => setCircleProfileImageUrl(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm placeholder-slate-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
                placeholder="Profile image URL (optional)"
                maxLength={2048}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm transition hover:bg-slate-50">
                <span className="font-medium text-slate-600">Circle colour</span>
                <input
                  type="color"
                  value={circleColor}
                  onChange={(event) => setCircleColor(event.target.value)}
                  className="h-6 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm transition hover:bg-slate-50">
                <input
                  aria-label="Create secure circle toggle"
                  type="checkbox"
                  checked={circleAudience === 'secure'}
                  onChange={(event) => setCircleAudience(event.target.checked ? 'secure' : 'social')}
                  className="h-4 w-4 rounded accent-amber-500"
                />
                <span className="font-medium text-slate-600">Secure circle</span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"><span aria-hidden="true">🔒</span> private</span>
              </label>
              <div className="ml-auto flex gap-2">
                <button type="submit" className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-violet-700 active:translate-y-0">
                  Add
                </button>
                <button type="button" onClick={() => setShowCreateControls(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {/* Status message */}
      {statusMessage ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <span className="text-amber-500" aria-hidden="true">⚠</span>
          <p className="text-xs font-medium text-amber-700">{statusMessage}</p>
        </div>
      ) : null}

      {/* Main content: canvas + sidebar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">

        {/* Canvas stage */}
        <div>
          <div
            ref={stageWrapperRef}
            className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-sm"
            style={{ height: `${STAGE_HEIGHT * stageScale}px` }}
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDraggingCircleName('')}
            onPointerLeave={() => setDraggingCircleName('')}
          >
            <div className="pointer-events-none absolute inset-0" style={{ background: STAGE_BACKGROUND }} />
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{ width: `${STAGE_WIDTH}px`, height: `${STAGE_HEIGHT}px`, transform: `scale(${stageScale})` }}
              data-testid="circle-spider-stage"
            >
              <div
                className="absolute rounded-full border-2 border-violet-300 bg-gradient-to-br from-violet-500 to-violet-700 text-xs font-bold text-white shadow-lg"
                style={{ left: `${OWNER_X - (OWNER_NODE_SIZE / 2)}px`, top: `${OWNER_Y - (OWNER_NODE_SIZE / 2)}px`, width: `${OWNER_NODE_SIZE}px`, height: `${OWNER_NODE_SIZE}px`, display: 'grid', placeItems: 'center' }}
              >
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
                const friendCircles = memberCirclesMap.get(String(friend._id)) || [];
                const isInActiveCircle = activeCircleName && friendCircles.includes(activeCircleName);
                return (
                  <React.Fragment key={friend._id}>
                    <div
                      className="pointer-events-none absolute origin-left transition-all duration-200"
                      style={{ left: `${OWNER_X}px`, top: `${OWNER_Y}px`, width: `${distance}px`, height: isInActiveCircle ? '2px' : '1px', transform: `rotate(${angle}deg)`, backgroundColor: isInActiveCircle ? '#7c3aed' : '#e2e8f0', opacity: isInActiveCircle ? 0.8 : 0.4 }}
                    />
                    <button
                      type="button"
                      draggable
                      data-testid={`friend-node-${friend._id}`}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('application/socialsecure-friend-id', String(friend._id));
                        event.dataTransfer.setData('text/plain', friendName);
                      }}
                      onClick={() => openMemberPreview(friend, friendCircles[0] || null)}
                      className={`absolute flex items-center justify-center rounded-full border-2 px-2 text-[11px] font-semibold shadow-md transition hover:scale-110 hover:shadow-lg ${isInActiveCircle ? 'border-violet-400 bg-violet-50 text-violet-800 ring-2 ring-violet-200' : 'border-slate-200 bg-white text-slate-600'}`}
                      style={{ left: `${x}px`, top: `${y}px`, width: `${FRIEND_NODE_SIZE}px`, height: `${FRIEND_NODE_SIZE}px` }}
                      title={`Click to preview ${friendName} • Drag to add to a circle`}
                    >
                      {isRenderableCircleImage(friend.avatarUrl) ? (
                        <img src={friend.avatarUrl} alt={friendName} className="h-full w-full rounded-full object-cover" />
                      ) : (
                        <span className="line-clamp-2 text-center leading-tight">{friendName}</span>
                      )}
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
                    className={`absolute flex cursor-grab flex-col items-center justify-center rounded-full border-2 text-xs font-bold text-white shadow-xl transition hover:scale-105 ${isActive ? 'scale-110 ring-4 ring-white/60 ring-offset-2 ring-offset-transparent' : ''}`}
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
                      <img src={circle.profileImageUrl} alt="" className="mb-1 h-7 w-7 rounded-full border-2 border-white/80 object-cover shadow-sm" />
                    ) : null}
                    <span className="w-full truncate px-1 text-center leading-tight">{circle.name}</span>
                    <span className="mt-0.5 text-[9px] font-medium opacity-80">{circle.memberCount || 0} members</span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <span aria-hidden="true">💡</span>
            Drag friend chips onto a circle bubble to add them, or use the search panel on the right.
          </p>
        </div>

        {/* Edit / detail sidebar */}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          {selectedCircle ? (
            <>
              {/* Circle header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-3 w-3 flex-shrink-0 rounded-full shadow-sm" style={{ backgroundColor: selectedCircle.color || '#3B82F6' }} />
                  <h4 className="truncate font-semibold text-slate-800">{selectedCircle.name}</h4>
                  {selectedCircle.relationshipAudience === 'secure' ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"><span aria-hidden="true">🔒</span> secure</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteCircle(selectedCircle.name)}
                  className="flex-shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-red-400 transition hover:bg-red-50 hover:text-red-600"
                >
                  Delete
                </button>
              </div>

              {/* Edit fields */}
              <div className="space-y-2">
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm placeholder-slate-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  placeholder="Circle name"
                  maxLength={50}
                />
                <input
                  value={editProfileImageUrl}
                  onChange={(event) => setEditProfileImageUrl(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm placeholder-slate-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  placeholder="Profile image URL (optional)"
                  maxLength={2048}
                />
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition hover:bg-slate-50">
                  <span className="font-medium text-slate-600">{editAudience === 'secure' ? <><span aria-hidden="true">🔒</span> Secure circle</> : <><span aria-hidden="true">🌐</span> Social circle</>}</span>
                  <input
                    type="checkbox"
                    checked={editAudience === 'secure'}
                    onChange={(event) => setEditAudience(event.target.checked ? 'secure' : 'social')}
                    aria-label="Circle type toggle"
                    className="h-4 w-4 rounded accent-amber-500"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleSaveCircle}
                  className="w-full rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 active:scale-95"
                >
                  Save Changes
                </button>
              </div>

              {/* Add member search */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Add members</p>
                <input
                  value={suggestQuery}
                  onChange={(event) => setSuggestQuery(event.target.value)}
                  placeholder="Search friends to add…"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm placeholder-slate-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
                {suggestQuery.trim() ? (
                  <div className="max-h-40 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                    {friendSuggestions.length > 0 ? friendSuggestions.map((friend) => (
                      <button
                        key={friend._id}
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition hover:bg-violet-50"
                        onClick={() => {
                          const memberCount = Array.isArray(selectedCircle.members) ? selectedCircle.members.length : 0;
                          if (memberCount >= MAX_MEMBERS_PER_CIRCLE) {
                            setStatusMessage(`Each circle can have up to ${MAX_MEMBERS_PER_CIRCLE} members.`);
                            return;
                          }
                          setStatusMessage('');
                          onAddMember(selectedCircle.name, friend._id);
                          setSuggestQuery('');
                        }}
                      >
                        <span className="font-medium text-slate-800">{friend.realName || friend.username}</span>
                        <span className="text-xs text-slate-500">@{friend.username}</span>
                      </button>
                    )) : <p className="px-3 py-2 text-xs text-slate-500">No matching friends found.</p>}
                  </div>
                ) : null}
              </div>

              {/* Members list */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Members</p>
                  <span className="text-xs text-slate-400">
                    {Array.isArray(selectedCircle.members) ? selectedCircle.members.length : 0} / {MAX_MEMBERS_PER_CIRCLE}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {(selectedCircle.members || []).length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 py-4 text-center text-xs text-slate-400">
                      No members yet — search above to add people.
                    </p>
                  ) : (selectedCircle.members || []).map((member) => (
                    <div key={member._id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm transition hover:bg-violet-50/50">
                      <button
                        type="button"
                        data-testid={`member-preview-btn-${member._id}`}
                        className="flex flex-1 items-center gap-2 text-left hover:opacity-80"
                        onClick={() => openMemberPreview(member, selectedCircle.name)}
                      >
                        {isRenderableCircleImage(member.avatarUrl) ? (
                          <img src={member.avatarUrl} alt="" className="h-7 w-7 flex-shrink-0 rounded-full object-cover ring-1 ring-slate-200" />
                        ) : (
                          <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700">
                            {(member.realName || member.username || '?').charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="truncate font-medium text-slate-800">{member.realName || member.username}</span>
                      </button>
                      <button
                        type="button"
                        className="flex-shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        onClick={() => onRemoveMember(selectedCircle.name, member._id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
              {circles.length === 0 ? (
                <>
                  <span className="mb-3 text-4xl" aria-hidden="true">⭕</span>
                  <p className="text-sm font-semibold text-slate-700">No circles yet</p>
                  <p className="mt-1 text-xs text-slate-400">Click <strong>Add New Circle</strong> above to create your first circle.</p>
                </>
              ) : (
                <>
                  <span className="mb-3 text-3xl" aria-hidden="true">👆</span>
                  <p className="text-sm font-semibold text-slate-700">Select a circle</p>
                  <p className="mt-1 text-xs text-slate-400">Tap a circle bubble on the canvas to view and edit it here.</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {memberPreview ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Member profile preview"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
          onClick={(event) => { if (event.target === event.currentTarget) closeMemberPreview(); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start gap-4">
              {isRenderableCircleImage(memberPreview.member.avatarUrl) ? (
                <img src={memberPreview.member.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-violet-300" />
              ) : (
                <span className="grid h-14 w-14 place-items-center rounded-full bg-violet-100 text-xl font-bold text-violet-700 ring-2 ring-violet-200">
                  {(memberPreview.member.realName || memberPreview.member.username || '?').charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-slate-900">{memberPreview.member.realName || memberPreview.member.username}</p>
                <p className="truncate text-sm text-slate-500">@{memberPreview.member.username}</p>
                {memberPreview.fromCircle ? (
                  <p className="mt-1 text-xs text-slate-400">in <span className="font-medium text-slate-600">{memberPreview.fromCircle}</span></p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    {(memberCirclesMap.get(String(memberPreview.member._id)) || []).length > 0
                      ? `in ${(memberCirclesMap.get(String(memberPreview.member._id)) || []).join(', ')}`
                      : 'not in any circle yet'}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeMemberPreview}
                aria-label="Close preview"
                className="flex-shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <Link
                to={`/social?user=${encodeURIComponent(memberPreview.member.username)}`}
                onClick={closeMemberPreview}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
              >
                View Full Profile
              </Link>

              {memberPreview.fromCircle ? (
                <>
                  <button
                    type="button"
                    onClick={handlePreviewRemove}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100"
                  >
                    Remove from {memberPreview.fromCircle}
                  </button>

                  {onMoveMember && circles.filter((c) => c.name !== memberPreview.fromCircle).length > 0 ? (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-600">Move to another circle:</label>
                      <div className="flex gap-2">
                        <select
                          value={moveTargetCircle}
                          onChange={(event) => setMoveTargetCircle(event.target.value)}
                          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                          aria-label="Select target circle"
                        >
                          <option value="">Select circle…</option>
                          {circles.filter((c) => c.name !== memberPreview.fromCircle).map((c) => (
                            <option key={c.name} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!moveTargetCircle}
                          onClick={handlePreviewMove}
                          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          Move
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CircleManager;
