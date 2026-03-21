import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

const SIDEBAR_OVERLAY_Z_INDEX_CLASS = 'z-[1700]';
const MAX_UPLOAD_SIZE_BYTES = 3 * 1024 * 1024;
const GRAIN_TEXTURE_URL = 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.5\'/%3E%3C/svg%3E")';

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

const TAB_IDS = ['theme', 'hero', 'background', 'effects'];
const TAB_META = {
  theme: { label: 'Theme', icon: '🎨' },
  hero: { label: 'Hero', icon: '🖼' },
  background: { label: 'Background', icon: '🌄' },
  effects: { label: 'Effects', icon: '✨' }
};

/* ── Tiny reusable controls ───────────────────────────────────── */

const ColorField = ({ label, value, onChange }) => (
  <div>
    {label ? <label className="mb-1 block text-[11px] font-semibold text-slate-600">{label}</label> : null}
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value || '#3b82f6'}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5"
      />
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#hex"
        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
      />
    </div>
  </div>
);

const SliderField = ({ label, value, min, max, step, unit, onChange, testId }) => (
  <div>
    <label className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
      {label}
      <span className="font-normal text-slate-400">{unit === '%' ? `${Math.round((value || 0) * 100)}%` : `${value || 0}${unit || ''}`}</span>
    </label>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value || 0}
      onChange={(e) => onChange(step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10))}
      className="mt-0.5 w-full accent-blue-600"
      data-testid={testId}
    />
  </div>
);

const ToggleSwitch = ({ checked, onChange, label }) => (
  <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-medium text-slate-600">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
    </button>
    {label}
  </label>
);

const PillSelect = ({ options, value, onChange, testId }) => (
  <div className="flex gap-1" data-testid={testId}>
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={`flex-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
          (value || options[0]?.value) === opt.value
            ? 'bg-blue-600 text-white shadow-sm'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
        title={opt.description}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

/* ── Mini preview stripe for image backgrounds ────────────────── */

const BackgroundPreview = ({ image, overlay, grain, blur, displayMode }) => {
  if (!image) return null;
  const bgStyle = {
    backgroundImage: `url(${image})`,
    backgroundSize: displayMode === 'repeat' ? 'auto' : 'cover',
    backgroundRepeat: displayMode === 'repeat' ? 'repeat' : 'no-repeat',
    backgroundPosition: 'center',
    backgroundAttachment: displayMode === 'fixed' ? 'fixed' : 'scroll',
    filter: blur ? `blur(${blur}px)` : undefined
  };
  return (
    <div className="relative mt-2 h-16 overflow-hidden rounded-lg border border-slate-200" data-testid="bg-preview">
      <div className="absolute inset-0" style={bgStyle} />
      {(overlay || 0) > 0 && <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${overlay})` }} />}
      {(grain || 0) > 0 && (
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: grain, backgroundImage: GRAIN_TEXTURE_URL, backgroundRepeat: 'repeat', backgroundSize: '128px 128px' }} />
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="rounded-full bg-black/40 px-2 py-0.5 text-[9px] font-semibold text-white/80">Preview</span>
      </div>
    </div>
  );
};

/* ── Expandable section wrapper ───────────────────────────────── */

const ExpandableSection = ({ title, testId, children, defaultOpen }) => {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="rounded-lg border border-slate-200/80">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50/60"
        data-testid={testId}
      >
        {title}
        <span className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="space-y-2.5 border-t border-slate-100 px-3 py-2.5" data-testid={testId ? `${testId}-content` : undefined}>{children}</div>}
    </div>
  );
};

/* ── Main component ───────────────────────────────────────────── */

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
  onMoveTopFriend,
  glassMorphEnabled,
  onGlassMorphToggle,
  panelColorOverride,
  onPanelColorOverrideChange,
  pageBackgroundColorOverride,
  onPageBackgroundColorOverrideChange
}) => {
  const backgroundFileInputRef = useRef(null);
  const profileFileInputRef = useRef(null);
  const bodyBgFileInputRef = useRef(null);

  const [heroBackgroundDraft, setHeroBackgroundDraft] = useState(heroBackgroundImage);
  const [heroProfileDraft, setHeroProfileDraft] = useState(heroProfileImage);
  const [bodyBgDraft, setBodyBgDraft] = useState(bodyBackgroundImage || '');
  const [bgUploading, setBgUploading] = useState(false);
  const [bgUploadStatus, setBgUploadStatus] = useState('');
  const [activeTab, setActiveTab] = useState('theme');

  useEffect(() => { setHeroBackgroundDraft(heroBackgroundImage); }, [heroBackgroundImage]);
  useEffect(() => { setHeroProfileDraft(heroProfileImage); }, [heroProfileImage]);
  useEffect(() => { setBodyBgDraft(bodyBackgroundImage || ''); }, [bodyBackgroundImage]);

  const handleBodyBgUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setBgUploadStatus('Only image files are supported.'); return; }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) { setBgUploadStatus('Image is too large (max 3 MB).'); return; }
    setBgUploading(true);
    setBgUploadStatus('');
    try {
      if (onBodyBackgroundUpload) { await onBodyBackgroundUpload(file); setBgUploadStatus('✓ Image uploaded and applied'); }
    } catch (err) { setBgUploadStatus(err?.response?.data?.error || 'Upload failed.'); } finally { setBgUploading(false); }
  }, [onBodyBackgroundUpload]);

  if (!isOpen) return null;

  const themeValues = themeOptions.map((o) => o.value);
  const resolvedThemePreset = themeValues.includes(themePreset) ? themePreset : (themeValues[0] || 'default');

  /* ── Tab content renderers ──────────────────────────────────── */

  const renderThemeTab = () => (
    <div className="space-y-4">
      {/* Theme selector */}
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-slate-600">Theme Preset</label>
        <select
          value={resolvedThemePreset}
          onChange={(e) => onThemePresetChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
        >
          {themeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Accent color */}
      <ColorField label="Accent Color" value={accentColor} onChange={onAccentColorChange} />

      {/* Font */}
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-slate-600">Global Font</label>
        <select
          value={fontFamily}
          onChange={(e) => onFontFamilyChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
        >
          {fontOptions.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {/* Glass Morph toggle */}
      <div className="rounded-lg border border-slate-200/80 px-3 py-2.5">
        <ToggleSwitch
          checked={Boolean(glassMorphEnabled)}
          onChange={(v) => onGlassMorphToggle?.(v)}
          label="Glass Morph Panels"
        />
        <p className="mt-1 text-[10px] text-slate-400">Frosted-glass effect on cards. Disable for solid backgrounds.</p>
      </div>

      {/* Color overrides (expandable) */}
      <ExpandableSection title="Color Overrides" testId="color-overrides-toggle">
        <ColorField label="Panel Background" value={panelColorOverride} onChange={(v) => onPanelColorOverrideChange?.(v)} />
        <ColorField label="Page Background" value={pageBackgroundColorOverride} onChange={(v) => onPageBackgroundColorOverrideChange?.(v)} />
        <p className="text-[10px] text-slate-400">Override theme colors with your own selections.</p>
      </ExpandableSection>
    </div>
  );

  const renderHeroTab = () => (
    <div className="space-y-4">
      {/* Hero background */}
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-slate-600">Background Image</label>
        <div className="flex gap-1.5">
          <input
            type="url"
            value={heroBackgroundDraft}
            onChange={(e) => setHeroBackgroundDraft(e.target.value)}
            placeholder="https://example.com/hero-image.jpg"
            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
          <button type="button" onClick={() => onHeroBackgroundImageChange(heroBackgroundDraft)} className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700">Set URL</button>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <button type="button" onClick={() => backgroundFileInputRef.current?.click()} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">Upload image</button>
          <input ref={backgroundFileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onHeroBackgroundImageUpload(e)} />
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <input type="checkbox" checked={heroRandomGalleryEnabled} onChange={(e) => onHeroRandomGalleryToggle(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            Randomize using gallery images
          </label>
        </div>
      </div>

      {heroBackgroundImageHistory.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recent hero backgrounds</p>
          <div className="flex flex-wrap gap-1">{heroBackgroundImageHistory.map((url, i) => (
            <button key={`hero-background-history-${i}`} type="button" onClick={() => onHeroBackgroundImageChange(url)} className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50">Use recent {i + 1}</button>
          ))}</div>
        </div>
      )}

      {heroBackgroundImage && (
        <div className="space-y-2.5">
          <BackgroundPreview image={heroBackgroundImage} overlay={heroBackgroundOverlay} grain={heroBackgroundGrain} blur={heroBackgroundBlur} displayMode={heroBackgroundDisplayMode} />
          <PillSelect options={DISPLAY_MODE_OPTIONS} value={heroBackgroundDisplayMode || 'cover'} onChange={onHeroBackgroundDisplayModeChange} testId="hero-display-mode-selector" />
          <SliderField label="Darkness" value={heroBackgroundOverlay} min={0} max={1} step={0.05} unit="%" onChange={onHeroBackgroundOverlayChange} testId="hero-overlay-slider" />
          <ExpandableSection title="Advanced" testId="hero-advanced-toggle">
            <SliderField label="Grain / Noise" value={heroBackgroundGrain} min={0} max={1} step={0.05} unit="%" onChange={onHeroBackgroundGrainChange} testId="hero-grain-slider" />
            <SliderField label="Blur" value={heroBackgroundBlur} min={0} max={20} step={1} unit="px" onChange={onHeroBackgroundBlurChange} testId="hero-blur-slider" />
          </ExpandableSection>
        </div>
      )}

      {/* Profile picture */}
      <div className="border-t border-slate-100 pt-3">
        <label className="mb-1 block text-[11px] font-semibold text-slate-600">Profile Picture</label>
        <div className="flex gap-1.5">
          <input
            type="url"
            value={heroProfileDraft}
            onChange={(e) => setHeroProfileDraft(e.target.value)}
            placeholder="https://example.com/profile-image.jpg"
            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
          <button type="button" onClick={() => onHeroProfileImageChange(heroProfileDraft)} className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700">Set URL</button>
        </div>
        <button type="button" onClick={() => profileFileInputRef.current?.click()} className="mt-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">Upload profile image</button>
        <input ref={profileFileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onHeroProfileImageUpload(e)} />
        {heroProfileImageHistory.length > 0 && (
          <div className="mt-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recent profile images</p>
            <div className="flex flex-wrap gap-1">{heroProfileImageHistory.map((url, i) => (
              <button key={`hero-profile-history-${i}`} type="button" onClick={() => onHeroProfileImageChange(url)} className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50">Use recent {i + 1}</button>
            ))}</div>
          </div>
        )}
      </div>
    </div>
  );

  const renderBackgroundTab = () => (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-slate-600">Body Background Image</label>
        <p className="mb-2 text-[10px] text-slate-400">Leave empty to use your theme colors.</p>
        <div className="flex gap-1.5">
          <input
            type="url"
            value={bodyBgDraft}
            onChange={(e) => setBodyBgDraft(e.target.value)}
            placeholder="https://example.com/background.jpg"
            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
          <button type="button" onClick={() => { onBodyBackgroundImageChange(bodyBgDraft); setBgUploadStatus(''); }} className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700">Set</button>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <button type="button" disabled={bgUploading} onClick={() => bodyBgFileInputRef.current?.click()} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">{bgUploading ? 'Uploading…' : 'Upload image'}</button>
          <input ref={bodyBgFileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleBodyBgUpload} />
          {bodyBackgroundImage && (
            <button type="button" onClick={() => { onBodyBackgroundImageChange(''); setBodyBgDraft(''); setBgUploadStatus(''); }} className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-red-500 hover:bg-red-50">Remove</button>
          )}
        </div>
        {bgUploadStatus && <p className={`mt-1 text-[10px] font-medium ${bgUploadStatus.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{bgUploadStatus}</p>}
      </div>

      {bodyBackgroundImage && (
        <div className="space-y-2.5">
          <BackgroundPreview image={bodyBackgroundImage} overlay={bodyBackgroundOverlay} grain={bodyBackgroundGrain} blur={bodyBackgroundBlur} displayMode={bodyBackgroundDisplayMode} />
          <PillSelect options={DISPLAY_MODE_OPTIONS} value={bodyBackgroundDisplayMode || 'cover'} onChange={onBodyBackgroundDisplayModeChange} testId="display-mode-selector" />
          <SliderField label="Darkness" value={bodyBackgroundOverlay} min={0} max={1} step={0.05} unit="%" onChange={onBodyBackgroundOverlayChange} />
          <ExpandableSection title="Advanced" testId="body-advanced-toggle">
            <SliderField label="Grain / Noise" value={bodyBackgroundGrain} min={0} max={1} step={0.05} unit="%" onChange={onBodyBackgroundGrainChange} />
            <SliderField label="Blur" value={bodyBackgroundBlur} min={0} max={20} step={1} unit="px" onChange={onBodyBackgroundBlurChange} />
          </ExpandableSection>
        </div>
      )}
    </div>
  );

  const renderEffectsTab = () => (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-slate-600">Seasonal Overlay</label>
        <p className="mb-2 text-[10px] text-slate-400">Lightweight seasonal animation on your page.</p>
        <div className="grid grid-cols-3 gap-1" data-testid="overlay-animation-selector">
          {OVERLAY_ANIMATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onBodyBackgroundOverlayAnimationChange(opt.value)}
              className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                (bodyBackgroundOverlayAnimation || 'none') === opt.value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.emoji ? `${opt.emoji} ` : ''}{opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const TAB_RENDERERS = { theme: renderThemeTab, hero: renderHeroTab, background: renderBackgroundTab, effects: renderEffectsTab };

  return createPortal(
    <div className={`fixed inset-0 ${SIDEBAR_OVERLAY_Z_INDEX_CLASS}`}>
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={-1}
        aria-label="Close stage settings backdrop"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClose(); } }}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
      />

      {/* Modal panel — centered popup on desktop, full-width on mobile */}
      <div
        className="absolute inset-4 z-10 mx-auto flex max-h-[calc(100vh-2rem)] max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_25px_60px_rgba(15,23,42,0.3)] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[min(640px,85vh)] sm:w-[620px] sm:-translate-x-1/2 sm:-translate-y-1/2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 py-3 text-white">
          <div>
            <p className="text-[9px] uppercase tracking-[0.25em] text-slate-400">Profile Customizer</p>
            <h2 className="text-sm font-semibold">Stage Settings</h2>
          </div>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Unsaved changes" />}
            <button type="button" onClick={onClose} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80 hover:bg-white/20">✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200/80 bg-slate-50/80">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`tab-${id}`}
              onClick={() => setActiveTab(id)}
              className={`flex-1 px-1 py-2 text-center text-[11px] font-semibold transition ${
                activeTab === id
                  ? 'border-b-2 border-blue-600 text-blue-700 bg-white/60'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'
              }`}
            >
              <span className="mr-0.5">{TAB_META[id].icon}</span> {TAB_META[id].label}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
          {successMessage && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">{successMessage}</div>}
          {TAB_RENDERERS[activeTab]?.()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200/80 bg-slate-50/60 px-5 py-2.5">
          <span className="text-[10px] text-slate-400">{hasUnsavedChanges ? 'You have unsaved changes' : 'All changes saved'}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onCancelChanges} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button
              type="button"
              disabled={busy || !hasUnsavedChanges}
              onClick={onSaveChanges}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
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
  glassMorphEnabled: false,
  onGlassMorphToggle: () => {},
  panelColorOverride: '',
  onPanelColorOverrideChange: () => {},
  pageBackgroundColorOverride: '',
  onPageBackgroundColorOverrideChange: () => {},
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
