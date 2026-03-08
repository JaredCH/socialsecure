import React from 'react';

const SocialStageSettingsSidebar = ({
  isOpen,
  onClose,
  hasUnsavedChanges,
  onSaveChanges,
  onCancelChanges,
  busy,
  error,
  successMessage,
  heroBackgroundImage,
  accentColor,
  fontFamily,
  fontOptions,
  selectedTopFriends,
  availableFriends,
  topFriendsLimit,
  onHeroBackgroundImageChange,
  onAccentColorChange,
  onFontFamilyChange,
  onToggleTopFriend,
  onMoveTopFriend
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/50 backdrop-blur-sm">
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-blue-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-blue-100 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 px-5 py-4 text-white">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-blue-100">Profile Customizer</p>
            <h2 className="text-xl font-semibold">Stage Settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {successMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}

          <section className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Hero Background Image</h3>
              <p className="mt-1 text-xs text-slate-500">Use a cinematic image URL for the profile header.</p>
            </div>
            <input
              type="url"
              value={heroBackgroundImage}
              onChange={(event) => onHeroBackgroundImageChange(event.target.value)}
              placeholder="https://example.com/hero-image.jpg"
              className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </section>

          <section className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Accent Color</h3>
              <p className="mt-1 text-xs text-slate-500">Updates links, icons, and primary highlights across the hub.</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accentColor}
                onChange={(event) => onAccentColorChange(event.target.value)}
                className="h-11 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(event) => onAccentColorChange(event.target.value)}
                className="flex-1 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </section>

          <section className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Global Font</h3>
              <p className="mt-1 text-xs text-slate-500">Applies to the hero, stage cards, and supporting rails.</p>
            </div>
            <select
              value={fontFamily}
              onChange={(event) => onFontFamilyChange(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {fontOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </section>

          <section className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Top 8 Friends</h3>
              <p className="mt-1 text-xs text-slate-500">Select up to {topFriendsLimit} friends for the Pulse rail and hero story bar.</p>
            </div>

            <div className="space-y-2">
              {selectedTopFriends.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">No top friends selected yet.</p>
              ) : selectedTopFriends.map((friend, index) => (
                <div key={friend._id || friend.username} className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white px-3 py-2 shadow-sm">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-blue-100 text-sm font-semibold text-blue-700">
                    {friend.avatarUrl ? <img src={friend.avatarUrl} alt={friend.username} className="h-full w-full object-cover" /> : (friend.realName || friend.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">@{friend.username}</p>
                    <p className="truncate text-xs text-slate-500">{friend.realName || 'Friend'}</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">#{index + 1}</span>
                  <div className="flex flex-col gap-1">
                    <button type="button" onClick={() => onMoveTopFriend(index, 'up')} disabled={index === 0} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">↑</button>
                    <button type="button" onClick={() => onMoveTopFriend(index, 'down')} disabled={index === selectedTopFriends.length - 1} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">↓</button>
                  </div>
                  <button type="button" onClick={() => onToggleTopFriend(friend._id)} className="rounded-xl border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available friends</p>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {availableFriends.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">Add friends to unlock Top 8 customization.</p>
                ) : availableFriends.map((friend) => {
                  const isSelected = selectedTopFriends.some((selected) => String(selected._id) === String(friend._id));
                  return (
                    <button
                      key={friend._id}
                      type="button"
                      onClick={() => onToggleTopFriend(friend._id)}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left shadow-sm transition ${isSelected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40'}`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-sm font-semibold text-slate-700">
                        {friend.avatarUrl ? <img src={friend.avatarUrl} alt={friend.username} className="h-full w-full object-cover" /> : (friend.realName || friend.username || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">@{friend.username}</p>
                        <p className="truncate text-xs text-slate-500">{friend.realName || 'Friend'}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                        {isSelected ? 'Selected' : 'Add'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancelChanges}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !hasUnsavedChanges}
              onClick={onSaveChanges}
              className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

SocialStageSettingsSidebar.defaultProps = {
  heroBackgroundImage: '',
  accentColor: '#3b82f6',
  fontFamily: 'Inter',
  fontOptions: [],
  selectedTopFriends: [],
  availableFriends: [],
  topFriendsLimit: 8,
  busy: false,
  error: '',
  successMessage: '',
  hasUnsavedChanges: false,
  onClose: () => {},
  onSaveChanges: () => {},
  onCancelChanges: () => {},
  onHeroBackgroundImageChange: () => {},
  onAccentColorChange: () => {},
  onFontFamilyChange: () => {},
  onToggleTopFriend: () => {},
  onMoveTopFriend: () => {}
};

export default SocialStageSettingsSidebar;
