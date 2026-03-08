import React, { useState } from 'react';

const isRenderableCircleImage = (value = '') => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

function CircleManager({ circles, friends, onCreateCircle, onDeleteCircle, onAddMember, onRemoveMember }) {
  const [circleName, setCircleName] = useState('');
  const [circleColor, setCircleColor] = useState('#3B82F6');
  const [circleAudience, setCircleAudience] = useState('social');
  const [circleProfileImageUrl, setCircleProfileImageUrl] = useState('');

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

  return (
    <div className="bg-white rounded-xl shadow p-6 border border-gray-100 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Circle Manager</h3>

      <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <input
          value={circleName}
          onChange={(event) => setCircleName(event.target.value)}
          className="border rounded p-2"
          placeholder="Circle name"
          maxLength={50}
        />
        <select
          value={circleAudience}
          onChange={(event) => setCircleAudience(event.target.value)}
          className="border rounded p-2 bg-white"
          aria-label="Circle audience"
        >
          <option value="social">Social circle</option>
          <option value="secure">Secure circle</option>
        </select>
        <input
          value={circleProfileImageUrl}
          onChange={(event) => setCircleProfileImageUrl(event.target.value)}
          className="border rounded p-2"
          placeholder="Profile image URL (optional)"
          maxLength={2048}
        />
        <input
          type="color"
          value={circleColor}
          onChange={(event) => setCircleColor(event.target.value)}
          className="border rounded p-1 h-10"
        />
        <button type="submit" className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
          Create Circle
        </button>
      </form>

      <div className="space-y-3">
        {circles.map((circle) => (
          <div key={circle.name} className="border rounded p-3">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: circle.color || '#3B82F6' }} />
                {isRenderableCircleImage(circle.profileImageUrl) ? <img src={circle.profileImageUrl} alt="" className="h-6 w-6 rounded-full object-cover" /> : null}
                <span className="font-medium text-gray-900">{circle.name}</span>
                <span className="text-sm text-gray-500">({circle.memberCount || 0})</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${circle.relationshipAudience === 'secure' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>
                  {circle.relationshipAudience === 'secure' ? 'Secure' : 'Social'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onDeleteCircle(circle.name)}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Delete
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {friends.map((friend) => {
                const isMember = (circle.members || []).some((member) => String(member._id) === String(friend._id));
                return (
                  <label key={`${circle.name}-${friend._id}`} className="flex items-center justify-between text-sm border rounded px-2 py-1">
                    <span>{friend.realName || friend.username}</span>
                    <input
                      type="checkbox"
                      checked={isMember}
                      onChange={() => {
                        if (isMember) {
                          onRemoveMember(circle.name, friend._id);
                        } else {
                          onAddMember(circle.name, friend._id);
                        }
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {circles.length === 0 && <p className="text-sm text-gray-500">No circles yet.</p>}
      </div>
    </div>
  );
}

export default CircleManager;
