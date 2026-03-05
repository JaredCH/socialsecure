import React, { useState } from 'react';

function CircleManager({ circles, friends, onCreateCircle, onDeleteCircle, onAddMember, onRemoveMember }) {
  const [circleName, setCircleName] = useState('');
  const [circleColor, setCircleColor] = useState('#3B82F6');

  const handleCreate = (event) => {
    event.preventDefault();
    const name = circleName.trim();
    if (!name) return;
    onCreateCircle({ name, color: circleColor });
    setCircleName('');
  };

  return (
    <div className="bg-white rounded-xl shadow p-6 border border-gray-100 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Circle Manager</h3>

      <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          value={circleName}
          onChange={(event) => setCircleName(event.target.value)}
          className="border rounded p-2"
          placeholder="Circle name"
          maxLength={50}
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
                <span className="font-medium text-gray-900">{circle.name}</span>
                <span className="text-sm text-gray-500">({circle.memberCount || 0})</span>
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
