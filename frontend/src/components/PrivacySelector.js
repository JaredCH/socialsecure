import React from 'react';

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'friends', label: 'Friends' },
  { value: 'circles', label: 'Specific Circles' },
  { value: 'specific_users', label: 'Specific Users' },
  { value: 'private', label: 'Private' }
];
const RELATIONSHIP_AUDIENCE_OPTIONS = [
  { value: 'social', label: 'Social' },
  { value: 'secure', label: 'Secure (secure friends only)' }
];
const SECURE_ALLOWED_VISIBILITY = new Set(['friends']);

function PrivacySelector({
  form,
  circles,
  friends,
  onChange,
  onToggleCircle,
  onToggleVisibleUser,
  onToggleExcludeUser
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Audience</label>
        <select
          value={form.relationshipAudience || 'social'}
          onChange={(event) => onChange('relationshipAudience', event.target.value)}
          className="w-full border rounded p-2"
        >
          {RELATIONSHIP_AUDIENCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
        <select
          value={form.visibility}
          onChange={(event) => onChange('visibility', event.target.value)}
          className="w-full border rounded p-2"
        >
          {VISIBILITY_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={
                (form.relationshipAudience || 'social') === 'secure'
                && !SECURE_ALLOWED_VISIBILITY.has(option.value)
              }
            >
              {option.label}
            </option>
          ))}
        </select>
        {(form.relationshipAudience || 'social') === 'secure' && !SECURE_ALLOWED_VISIBILITY.has(form.visibility) ? (
          <p className="mt-1 text-xs text-amber-700">
            Secure audience currently supports only Friends visibility.
          </p>
        ) : null}
      </div>

      {form.visibility === 'circles' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Circles</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {circles.map((circle) => (
              <label key={circle.name} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.visibleToCircles.includes(circle.name)}
                  onChange={() => onToggleCircle(circle.name)}
                />
                <span>{circle.name} ({circle.memberCount || 0})</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {form.visibility === 'specific_users' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Specific Users</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-auto border rounded p-2">
            {friends.map((friend) => (
              <label key={friend._id} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.visibleToUsers.includes(friend._id)}
                  onChange={() => onToggleVisibleUser(friend._id)}
                />
                <span>{friend.realName || friend.username}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Exclude Users</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-auto border rounded p-2">
          {friends.map((friend) => (
            <label key={`exclude-${friend._id}`} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.excludeUsers.includes(friend._id)}
                onChange={() => onToggleExcludeUser(friend._id)}
              />
              <span>{friend.realName || friend.username}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location Radius (miles)</label>
          <input
            type="number"
            min="1"
            max="1000"
            value={form.locationRadius}
            onChange={(event) => onChange('locationRadius', event.target.value)}
            className="w-full border rounded p-2"
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Expires In</label>
          <select
            value={form.expirationPreset}
            onChange={(event) => onChange('expirationPreset', event.target.value)}
            className="w-full border rounded p-2"
          >
            <option value="none">No Expiration</option>
            <option value="24h">24 Hours</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default PrivacySelector;
