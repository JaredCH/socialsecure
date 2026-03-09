import React from 'react';

const VISIBILITY_PRESET_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'social', label: 'Social' },
  { value: 'secure', label: 'Secure' },
  { value: 'circles', label: 'Circle Specific' }
];

const resolveVisibilityPreset = (form) => {
  if (form.visibility === 'public') return 'public';
  if (form.visibility === 'circles') return 'circles';
  if (form.relationshipAudience === 'secure' && form.visibility === 'friends') return 'secure';
  return 'social';
};

function PrivacySelector({
  form,
  circles,
  friends,
  onChange,
  onToggleCircle,
  onAddExcludeUser,
  onRemoveExcludeUser
}) {
  const visibilityPreset = resolveVisibilityPreset(form);
  const [excludeQuery, setExcludeQuery] = React.useState('');
  const friendById = React.useMemo(
    () => new Map(friends.map((friend) => [String(friend._id), friend])),
    [friends]
  );
  const excludedSet = React.useMemo(
    () => new Set((form.excludeUsers || []).map((entry) => String(entry))),
    [form.excludeUsers]
  );
  const excludeSuggestions = React.useMemo(() => {
    const query = excludeQuery.trim().toLowerCase();
    if (!query) return [];
    return friends
      .filter((friend) => !excludedSet.has(String(friend._id)))
      .filter((friend) => {
        const username = String(friend.username || '').toLowerCase();
        const realName = String(friend.realName || '').toLowerCase();
        return username.includes(query) || realName.includes(query);
      })
      .slice(0, 6);
  }, [friends, excludeQuery, excludedSet]);

  const applyVisibilityPreset = (preset) => {
    if (preset === 'public') {
      onChange('relationshipAudience', 'social');
      onChange('visibility', 'public');
      return;
    }
    if (preset === 'circles') {
      onChange('relationshipAudience', 'social');
      onChange('visibility', 'circles');
      return;
    }
    if (preset === 'secure') {
      onChange('relationshipAudience', 'secure');
      onChange('visibility', 'friends');
      return;
    }
    onChange('relationshipAudience', 'social');
    onChange('visibility', 'friends');
  };

  const addExcludedUser = (friend) => {
    if (!friend?._id) return;
    onAddExcludeUser(String(friend._id));
    setExcludeQuery('');
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Visibility</label>
        <select
          value={visibilityPreset}
          onChange={(event) => applyVisibilityPreset(event.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
        >
          {VISIBILITY_PRESET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {visibilityPreset === 'circles' && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Circles</label>
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

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Exclude Users</label>
        <input
          type="text"
          data-testid="exclude-user-search-input"
          value={excludeQuery}
          onChange={(event) => setExcludeQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (excludeSuggestions[0]) {
              addExcludedUser(excludeSuggestions[0]);
            }
          }}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          placeholder="Search friends to exclude"
        />
        {excludeSuggestions.length > 0 ? (
          <ul className="mt-2 space-y-1 rounded-xl border border-slate-200 bg-white p-2">
            {excludeSuggestions.map((friend) => (
              <li key={`exclude-suggestion-${friend._id}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{friend.realName || friend.username}</span>
                <button
                  type="button"
                  onClick={() => addExcludedUser(friend)}
                  className="rounded-lg border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(form.excludeUsers || []).map((userId) => {
            const friend = friendById.get(String(userId));
            return (
              <button
                key={`excluded-chip-${userId}`}
                type="button"
                onClick={() => onRemoveExcludeUser(String(userId))}
                className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                title="Remove excluded user"
                aria-label={`Remove ${friend?.realName || friend?.username || 'excluded user'}`}
              >
                {(friend?.realName || friend?.username || 'Unknown user')} ×
              </button>
            );
          })}
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
