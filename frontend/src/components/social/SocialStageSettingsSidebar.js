import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SIDEBAR_OVERLAY_Z_INDEX_CLASS = 'z-[1700]';
const SIDEBAR_PANEL_SHADOW_CLASS = 'shadow-[0_30px_90px_rgba(15,23,42,0.35)]';

const DISPLAY_MODE_OPTIONS = [
  { value: 'cover', label: 'Stretched', description: 'Image covers the full page' },
  { value: 'repeat', label: 'Repeating', description: 'Image tiles across the page' },
  { value: 'fixed', label: 'Fixed', description: 'Image stays fixed while scrolling' }
];

const OVERLAY_ANIMATION_OPTIONS = [
  { value: 'none', label: 'None', emoji: '' },
  { value: 'snow', label: 'Christmas Snow', emoji: '❄️' },
  { value: 'easter-eggs', label: 'Easter Eggs', emoji: '🥚' },
  { value: 'halloween-ghosts', label: 'Halloween Ghosts', emoji: '👻' },
  { value: 'valentines-hearts', label: "Valentine's Hearts", emoji: '💕' },
  { value: 'fireworks', label: 'Fireworks', emoji: '🎆' }
];

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
  heroBackgroundImageHistory,
  heroRandomGalleryEnabled,
  heroProfileImage,
  heroProfileImageHistory,
  heroBackgroundDisplayMode,
  heroBackgroundOverlay,
  heroBackgroundGrain,
  heroBackgroundBlur,
  onHeroBackgroundDisplayModeChange,
  onHeroBackgroundOverlayChange,
  onHeroBackgroundGrainChange,
  onHeroBackgroundBlurChange,
  bodyBackgroundImage,
  bodyBackgroundOverlay,
  bodyBackgroundGrain,
  bodyBackgroundBlur,
  bodyBackgroundDisplayMode,
  bodyBackgroundOverlayAnimation,
  onBodyBackgroundImageChange,
  onBodyBackgroundOverlayChange,
  onBodyBackgroundGrainChange,
  onBodyBackgroundBlurChange,
  onBodyBackgroundDisplayModeChange,
  onBodyBackgroundOverlayAnimationChange,
  onBodyBackgroundUpload,
  themePreset,
  themeOptions,
  accentColor,
  fontFamily,
  fontOptions,
  selectedTopFriends,
  availableFriends,
  topFriendsLimit,
  onHeroBackgroundImageChange,
  onHeroBackgroundImageUpload,
  onHeroProfileImageChange,
  onHeroProfileImageUpload,
  onHeroRandomGalleryToggle,
  onThemePresetChange,
  onAccentColorChange,
  onFontFamilyChange,
  onToggleTopFriend,
  onMoveTopFriend
}) => {
  if (!isOpen) return null;
  const themeValues = themeOptions.map((option) => option.value);
  const resolvedThemePreset = themeValues.includes(themePreset)
    ? themePreset
    : (themeValues[0] || 'default');
  const backgroundFileInputRef = useRef(null);
  const profileFileInputRef = useRef(null);
  const bodyBgFileInputRef = useRef(null);
  const [heroBackgroundDraft, setHeroBackgroundDraft] = useState(heroBackgroundImage);
  const [heroProfileDraft, setHeroProfileDraft] = useState(heroProfileImage);
  const [bodyBgDraft, setBodyBgDraft] = useState(bodyBackgroundImage || '');
  const [bgUploading, setBgUploading] = useState(false);
  const [bgUploadStatus, setBgUploadStatus] = useState('');

  useEffect(() => {
    setHeroBackgroundDraft(heroBackgroundImage);
  }, [heroBackgroundImage]);

  useEffect(() => {
    setHeroProfileDraft(heroProfileImage);
  }, [heroProfileImage]);

  useEffect(() => {
    setBodyBgDraft(bodyBackgroundImage || '');
  }, [bodyBackgroundImage]);

  return createPortal(
    <div className={`fixed inset-0 ${SIDEBAR_OVERLAY_Z_INDEX_CLASS} pointer-events-none`}>
      <button
        type="button"
        aria-label="Close stage settings backdrop"
        onClick={onClose}
        className="absolute inset-0 z-0 bg-slate-950/55 backdrop-blur-sm pointer-events-auto"
      />
      <div className={`relative z-10 ml-auto flex h-full w-full max-w-[26rem] flex-col border-l border-slate-200 bg-white ${SIDEBAR_PANEL_SHADOW_CLASS} pointer-events-auto`}>
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

        <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50 px-5 py-5">
          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {successMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}

          <section className="space-y-3 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Theme Selector</h3>
              <p className="mt-1 text-xs text-slate-500">Apply a complete color mood for your social page.</p>
            </div>
            <select
              value={resolvedThemePreset}
              onChange={(event) => onThemePresetChange(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {themeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </section>

          <section className="space-y-3 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Hero Background Image</h3>
              <p className="mt-1 text-xs text-slate-500">Use a URL or upload, then optionally randomize from your gallery.</p>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={heroBackgroundDraft}
                onChange={(event) => setHeroBackgroundDraft(event.target.value)}
                placeholder="https://example.com/hero-image.jpg"
                className="flex-1 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => onHeroBackgroundImageChange(heroBackgroundDraft)}
                className="rounded-2xl border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                Set URL
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => backgroundFileInputRef.current?.click()}
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Upload image
              </button>
              <input
                ref={backgroundFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => onHeroBackgroundImageUpload(event)}
              />
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={heroRandomGalleryEnabled}
                  onChange={(event) => onHeroRandomGalleryToggle(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Randomize using gallery images
              </label>
            </div>
            {heroBackgroundImageHistory.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent hero backgrounds</p>
                <div className="flex flex-wrap gap-2">
                  {heroBackgroundImageHistory.map((url, index) => (
                    <button
                      key={`hero-background-history-${index}`}
                      type="button"
                      onClick={() => onHeroBackgroundImageChange(url)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Use recent {index + 1}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {heroBackgroundImage ? (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex h-20 items-center justify-center overflow-hidden rounded-xl bg-slate-200">
                  <img src={heroBackgroundImage} alt="Hero background preview" className="h-full w-full object-cover" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Display Mode</label>
                  <div className="flex gap-1.5" data-testid="hero-display-mode-selector">
                    {DISPLAY_MODE_OPTIONS.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => onHeroBackgroundDisplayModeChange(mode.value)}
                        className={`flex-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition ${
                          (heroBackgroundDisplayMode || 'cover') === mode.value
                            ? 'border border-blue-300 bg-blue-50 text-blue-700'
                            : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                        title={mode.description}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    Dark overlay
                    <span className="text-slate-400">{Math.round((heroBackgroundOverlay || 0) * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={heroBackgroundOverlay || 0}
                    onChange={(event) => onHeroBackgroundOverlayChange(parseFloat(event.target.value))}
                    className="mt-1 w-full accent-blue-600"
                    data-testid="hero-overlay-slider"
                  />
                </div>
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    Grain / Noise
                    <span className="text-slate-400">{Math.round((heroBackgroundGrain || 0) * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={heroBackgroundGrain || 0}
                    onChange={(event) => onHeroBackgroundGrainChange(parseFloat(event.target.value))}
                    className="mt-1 w-full accent-blue-600"
                    data-testid="hero-grain-slider"
                  />
                </div>
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    Blur
                    <span className="text-slate-400">{heroBackgroundBlur || 0}px</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={heroBackgroundBlur || 0}
                    onChange={(event) => onHeroBackgroundBlurChange(parseInt(event.target.value, 10))}
                    className="mt-1 w-full accent-blue-600"
                    data-testid="hero-blur-slider"
                  />
                </div>
              </div>
            ) : null}
          </section>

          <section className="space-y-3 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Hero Profile Picture</h3>
              <p className="mt-1 text-xs text-slate-500">Override the hero avatar with a URL or uploaded image.</p>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={heroProfileDraft}
                onChange={(event) => setHeroProfileDraft(event.target.value)}
                placeholder="https://example.com/profile-image.jpg"
                className="flex-1 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => onHeroProfileImageChange(heroProfileDraft)}
                className="rounded-2xl border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                Set URL
              </button>
            </div>
            <button
              type="button"
              onClick={() => profileFileInputRef.current?.click()}
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Upload profile image
            </button>
            <input
              ref={profileFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => onHeroProfileImageUpload(event)}
            />
            {heroProfileImageHistory.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent profile images</p>
                <div className="flex flex-wrap gap-2">
                  {heroProfileImageHistory.map((url, index) => (
                    <button
                      key={`hero-profile-history-${index}`}
                      type="button"
                      onClick={() => onHeroProfileImageChange(url)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Use recent {index + 1}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="space-y-3 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Body Background Image</h3>
              <p className="mt-1 text-xs text-slate-500">Optional full-page background image with overlay effects. Leave empty to use your theme colors.</p>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={bodyBgDraft}
                onChange={(event) => setBodyBgDraft(event.target.value)}
                placeholder="https://example.com/background.jpg"
                className="flex-1 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => { onBodyBackgroundImageChange(bodyBgDraft); setBgUploadStatus(''); }}
                className="rounded-2xl border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                Set
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={bgUploading}
                onClick={() => bodyBgFileInputRef.current?.click()}
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {bgUploading ? 'Uploading…' : 'Upload image'}
              </button>
              <input
                ref={bodyBgFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  if (!file.type.startsWith('image/')) {
                    setBgUploadStatus('Only image files are supported.');
                    return;
                  }
                  if (file.size > 3 * 1024 * 1024) {
                    setBgUploadStatus('Image is too large (max 3 MB).');
                    return;
                  }
                  setBgUploading(true);
                  setBgUploadStatus('');
                  try {
                    if (onBodyBackgroundUpload) {
                      await onBodyBackgroundUpload(file);
                      setBgUploadStatus('✓ Image uploaded and applied');
                    }
                  } catch (err) {
                    setBgUploadStatus(err?.response?.data?.error || 'Upload failed.');
                  } finally {
                    setBgUploading(false);
                  }
                }}
              />
              {bodyBackgroundImage ? (
                <button
                  type="button"
                  onClick={() => { onBodyBackgroundImageChange(''); setBodyBgDraft(''); setBgUploadStatus(''); }}
                  className="rounded-2xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              ) : null}
            </div>
            {bgUploadStatus ? (
              <p className={`text-xs font-medium ${bgUploadStatus.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>
                {bgUploadStatus}
              </p>
            ) : null}
            {bodyBackgroundImage ? (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex h-20 items-center justify-center overflow-hidden rounded-xl bg-slate-200">
                  <img src={bodyBackgroundImage} alt="Body background preview" className="h-full w-full object-cover" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Display Mode</label>
                  <div className="flex gap-1.5" data-testid="display-mode-selector">
                    {DISPLAY_MODE_OPTIONS.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => onBodyBackgroundDisplayModeChange(mode.value)}
                        className={`flex-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition ${
                          (bodyBackgroundDisplayMode || 'cover') === mode.value
                            ? 'border border-blue-300 bg-blue-50 text-blue-700'
                            : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                        title={mode.description}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    Dark overlay
                    <span className="text-slate-400">{Math.round((bodyBackgroundOverlay || 0) * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={bodyBackgroundOverlay || 0}
                    onChange={(event) => onBodyBackgroundOverlayChange(parseFloat(event.target.value))}
                    className="mt-1 w-full accent-blue-600"
                  />
                </div>
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    Grain / Noise
                    <span className="text-slate-400">{Math.round((bodyBackgroundGrain || 0) * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={bodyBackgroundGrain || 0}
                    onChange={(event) => onBodyBackgroundGrainChange(parseFloat(event.target.value))}
                    className="mt-1 w-full accent-blue-600"
                  />
                </div>
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    Blur
                    <span className="text-slate-400">{bodyBackgroundBlur || 0}px</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={bodyBackgroundBlur || 0}
                    onChange={(event) => onBodyBackgroundBlurChange(parseInt(event.target.value, 10))}
                    className="mt-1 w-full accent-blue-600"
                  />
                </div>
              </div>
            ) : null}
          </section>

          <section className="space-y-3 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Seasonal Overlay</h3>
              <p className="mt-1 text-xs text-slate-500">Add a lightweight seasonal animation overlay to your page.</p>
            </div>
            <div className="grid grid-cols-3 gap-1.5" data-testid="overlay-animation-selector">
              {OVERLAY_ANIMATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onBodyBackgroundOverlayAnimationChange(opt.value)}
                  className={`rounded-xl px-2 py-2 text-xs font-semibold transition ${
                    (bodyBackgroundOverlayAnimation || 'none') === opt.value
                      ? 'border border-blue-300 bg-blue-50 text-blue-700'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {opt.emoji ? `${opt.emoji} ` : ''}{opt.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
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

          <section className="space-y-3 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
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

          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Top Friends</h3>
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
                  <p className="rounded-2xl border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">Add friends to unlock Top Friends customization.</p>
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
    </div>,
    document.body
  );
};

SocialStageSettingsSidebar.defaultProps = {
  heroBackgroundImage: '',
  heroBackgroundImageHistory: [],
  heroRandomGalleryEnabled: false,
  heroProfileImage: '',
  heroProfileImageHistory: [],
  bodyBackgroundImage: '',
  bodyBackgroundOverlay: 0,
  bodyBackgroundGrain: 0,
  bodyBackgroundBlur: 0,
  bodyBackgroundDisplayMode: 'cover',
  bodyBackgroundOverlayAnimation: 'none',
  themePreset: 'default',
  themeOptions: [],
  accentColor: '#3b82f6',
  fontFamily: 'Inter',
  fontOptions: [],
  selectedTopFriends: [],
  availableFriends: [],
  topFriendsLimit: 5,
  busy: false,
  error: '',
  successMessage: '',
  hasUnsavedChanges: false,
  onClose: () => {},
  onSaveChanges: () => {},
  onCancelChanges: () => {},
  onHeroBackgroundImageChange: () => {},
  onHeroBackgroundImageUpload: () => {},
  onHeroProfileImageChange: () => {},
  onHeroProfileImageUpload: () => {},
  onHeroRandomGalleryToggle: () => {},
  onBodyBackgroundImageChange: () => {},
  onBodyBackgroundOverlayChange: () => {},
  onBodyBackgroundGrainChange: () => {},
  onBodyBackgroundBlurChange: () => {},
  onBodyBackgroundDisplayModeChange: () => {},
  onBodyBackgroundOverlayAnimationChange: () => {},
  onBodyBackgroundUpload: null,
  onThemePresetChange: () => {},
  onAccentColorChange: () => {},
  onFontFamilyChange: () => {},
  onToggleTopFriend: () => {},
  onMoveTopFriend: () => {}
};

export default SocialStageSettingsSidebar;
