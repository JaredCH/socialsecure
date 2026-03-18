import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import './DotNav.css';

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const PAD = 26;
const DSIZ = 56;
const BSIZ = 44;
const CA = (DSIZ - BSIZ) / 2;
const TOTAL_SLOTS = 16;
const STORAGE_KEY = 'dotnav-state';

// ═══════════════════════════════════════════
// DOCK POSITION CONFIGS
// ═══════════════════════════════════════════
const DOCK_CONFIGS = {
  br:  { label: 'Bottom Right',  anchor: (w, h) => ({ left: w - PAD - DSIZ, top: h - PAD - DSIZ }),  cogCorner: 'tl', labelSide: 'left' },
  ubr: { label: 'Mid Right',     anchor: (w, h) => ({ left: w - PAD - DSIZ, top: Math.round(h * 2 / 3) - DSIZ }), cogCorner: 'tl', labelSide: 'left' },
  bl:  { label: 'Bottom Left',   anchor: (w, h) => ({ left: PAD, top: h - PAD - DSIZ }),             cogCorner: 'tr', labelSide: 'right' },
  ubl: { label: 'Mid Left',      anchor: (w, h) => ({ left: PAD, top: Math.round(h * 2 / 3) - DSIZ }), cogCorner: 'tr', labelSide: 'right' },
};

// ═══════════════════════════════════════════
// ARC OFFSETS (12 radial slots)
// ═══════════════════════════════════════════
function buildArc(side) {
  const sign = side === 'right' ? -1 : 1;
  const slots = [];
  function ring(r, n, aMin, aMax) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const rad = (aMin + t * (aMax - aMin)) * Math.PI / 180;
      slots.push({ dl: CA + sign * r * Math.cos(rad), db: CA + r * Math.sin(rad) });
    }
  }
  ring(105, 3, 12, 72);
  ring(165, 5, 7, 83);
  ring(228, 4, 13, 77);
  return slots;
}

// 4 vertical power button offsets
function buildPowerSlots(side) {
  const sign = side === 'right' ? -1 : 1;
  return [0, 1, 2, 3].map(i => ({
    dl: CA + sign * 60,
    db: CA + 70 + i * 52,
  }));
}

// ═══════════════════════════════════════════
// SVG ICONS
// ═══════════════════════════════════════════
const SVG_ICONS = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  image: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  message: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  'book-open': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
  'file-text': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>,
  'file-user': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><circle cx="12" cy="13" r="2" /><path d="M16 19c0-1.66-1.79-3-4-3s-4 1.34-4 3" /></svg>,
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
  sparkle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" /></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  'user-plus': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>,
  pen: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>,
  news: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" /><line x1="10" y1="6" x2="18" y2="6" /><line x1="10" y1="10" x2="18" y2="10" /><line x1="10" y1="14" x2="14" y2="14" /></svg>,
  market: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>,
  discover: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  map: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  'msg-heart': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M12 8.5c-.5-1-1.8-1.6-3-1 -1.3.7-1.6 2.3-.7 3.5L12 15l3.7-4c.9-1.2.6-2.8-.7-3.5-1.2-.6-2.5 0-3 1z" /></svg>,
  'cal-star': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="M12 13l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5L11 15z" /></svg>,
};

// ═══════════════════════════════════════════
// FULL BUTTON CATALOG
// Context Types:
// 'absolute'    → always routes to logged-in user's section
// 'contextual'  → routes to currently-viewed user's section
// 'global'      → standard non-user-specific page
// 'power'       → power buttons (top-level app navigation, preserved targets)
// ═══════════════════════════════════════════
const CATALOG = [
  // Power Buttons (preserved link targets from SocialHero SITE_NAV_LINKS)
  { key: 'chat-power',  label: 'Chat',     icon: 'message',    type: 'power', path: '/chat' },
  { key: 'news-power',  label: 'News',     icon: 'news',       type: 'power', path: '/news' },
  { key: 'market-power', label: 'Market',  icon: 'market',     type: 'power', path: '/market' },
  { key: 'discover-power', label: 'Discover', icon: 'discover', type: 'power', path: '/discover' },

  // Global
  { key: 'main',        label: 'Main',         icon: 'home',       type: 'global',      target: 'feed' },

  // Absolute (always route to logged-in user's sections)
  { key: 'my-gallery',  label: 'My Gallery',   icon: 'image',      type: 'absolute',    target: 'gallery' },
  { key: 'my-friends',  label: 'My Friends',   icon: 'users',      type: 'absolute',    target: 'friends' },
  { key: 'my-chat',     label: 'My Chat',      icon: 'msg-heart',  type: 'absolute',    target: 'chat' },
  { key: 'my-calendar', label: 'My Calendar',  icon: 'cal-star',   type: 'absolute',    target: 'calendar' },
  { key: 'my-blog',     label: 'My Blog',      icon: 'book-open',  type: 'absolute',    target: 'blog' },
  { key: 'my-resume',   label: 'My Resume',    icon: 'file-user',  type: 'absolute',    target: 'resume' },
  { key: 'my-about',    label: 'My About Me',  icon: 'sparkle',    type: 'absolute',    target: 'about' },

  // Contextual (route to currently-viewed user when on another user's profile)
  { key: 'gallery',     label: 'Gallery',      icon: 'grid',       type: 'contextual',  target: 'gallery' },
  { key: 'friends',     label: 'Friends',      icon: 'user-plus',  type: 'contextual',  target: 'friends' },
  { key: 'chat',        label: 'Chat',         icon: 'message',    type: 'contextual',  target: 'chat' },
  { key: 'calendar',    label: 'Calendar',     icon: 'calendar',   type: 'contextual',  target: 'calendar' },
  { key: 'blog',        label: 'Blog',         icon: 'pen',        type: 'contextual',  target: 'blog' },
  { key: 'resume',      label: 'Resume',       icon: 'file-text',  type: 'contextual',  target: 'resume' },
  { key: 'about',       label: 'About Me',     icon: 'info',       type: 'contextual',  target: 'about' },

  // Additional global
  { key: 'map',         label: 'Map',          icon: 'map',        type: 'global',      target: 'map' },
];

const CATALOG_BY_KEY = Object.fromEntries(CATALOG.map(c => [c.key, c]));

// Default layout: 4 power buttons + 12 context-aware buttons
const DEFAULT_ASSIGNED = [
  // Radial slots 0-11
  'main', 'my-gallery', 'my-friends',
  'gallery', 'friends', 'chat', 'calendar', 'blog',
  'my-chat', 'my-calendar', 'my-blog', 'my-resume',
  // Power slots 12-15
  'chat-power', 'news-power', 'market-power', 'discover-power',
];

// ═══════════════════════════════════════════
// PERSISTENT STATE HELPERS
// ═══════════════════════════════════════════
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.dock === 'string' && Array.isArray(parsed.assigned)) {
      return parsed;
    }
  } catch {
    // Gracefully handle corrupted data, quota exceeded, or restricted storage access
  }
  return null;
}

function saveState(dock, assigned) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dock, assigned }));
  } catch {
    // Gracefully handle quota exceeded or restricted storage access
  }
}

// ═══════════════════════════════════════════
// NAVIGATION EVENT
// ═══════════════════════════════════════════
function dispatchVoidNavTrigger(detail) {
  window.dispatchEvent(new CustomEvent('VoidNavTrigger', { detail }));
}

// ═══════════════════════════════════════════
// ROUTE RESOLVER
// ═══════════════════════════════════════════
function resolveRoute(catalogEntry, loggedInUser, viewingUser) {
  if (!catalogEntry) return null;

  // Power buttons always use their fixed path
  if (catalogEntry.type === 'power') {
    return catalogEntry.path;
  }

  // Global routes
  if (catalogEntry.type === 'global') {
    if (catalogEntry.target === 'feed') return '/social';
    if (catalogEntry.target === 'map') return '/maps';
    return `/${catalogEntry.target}`;
  }

  const targetUser = catalogEntry.type === 'contextual' && viewingUser
    ? viewingUser
    : loggedInUser;

  const target = catalogEntry.target;

  // Calendar has its own route
  if (target === 'calendar') {
    if (targetUser && targetUser !== loggedInUser) {
      return `/calendar?user=${encodeURIComponent(targetUser)}`;
    }
    return '/calendar';
  }

  // Chat with context
  if (target === 'chat') {
    if (targetUser && targetUser !== loggedInUser) {
      return `/chat?user=${encodeURIComponent(targetUser)}`;
    }
    return '/chat';
  }

  // Social sub-sections via tab parameter
  if (['gallery', 'friends', 'blog', 'resume', 'about'].includes(target)) {
    if (targetUser && targetUser !== loggedInUser) {
      return `/social?user=${encodeURIComponent(targetUser)}&tab=${target === 'about' ? 'aboutme' : target}`;
    }
    return `/social?tab=${target === 'about' ? 'aboutme' : target}`;
  }

  return '/social';
}

// ═══════════════════════════════════════════
// DOTNAV COMPONENT
// ═══════════════════════════════════════════
const DotNav = ({ loggedInUser = '', viewingUser: viewingUserProp = '', enabled = true }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Resolve the user being viewed from URL query params or explicit prop
  // Resolve the user being viewed from URL query params or explicit prop.
  // Checks ?user= and ?username= query params, and /resume/:username path pattern.
  const viewingUser = useMemo(() => {
    if (viewingUserProp) return viewingUserProp;
    const params = new URLSearchParams(location.search);
    const queryUser = String(params.get('user') || params.get('username') || '').trim();
    if (queryUser) return queryUser;
    // Resume pages use /resume/:username path pattern
    const resumeMatch = location.pathname.match(/^\/resume\/([^/?#]+)/i);
    if (resumeMatch?.[1]) return decodeURIComponent(resumeMatch[1]);
    return '';
  }, [viewingUserProp, location.search, location.pathname]);

  // State
  const [isOpen, setIsOpen] = useState(false);
  const [dock, setDock] = useState(() => {
    const saved = loadState();
    return saved?.dock || 'br';
  });
  const [assigned, setAssigned] = useState(() => {
    const saved = loadState();
    return saved?.assigned || [...DEFAULT_ASSIGNED];
  });
  const [isEditing, setIsEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pickerSlotIndex, setPickerSlotIndex] = useState(null);
  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  const dotRef = useRef(null);

  // Persist state changes
  useEffect(() => {
    saveState(dock, assigned);
  }, [dock, assigned]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showSettings) { setShowSettings(false); return; }
        if (pickerSlotIndex !== null) { setPickerSlotIndex(null); return; }
        if (isEditing) { setIsEditing(false); return; }
        if (isOpen) { setIsOpen(false); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isEditing, showSettings, pickerSlotIndex]);

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false);
    setIsEditing(false);
    setShowSettings(false);
    setPickerSlotIndex(null);
  }, [location.pathname, location.search]);

  // Compute anchor position
  const config = DOCK_CONFIGS[dock] || DOCK_CONFIGS.br;
  const anchorPos = useMemo(() => config.anchor(windowSize.w, windowSize.h), [config, windowSize]);

  // Compute side
  const side = dock.includes('l') ? 'left' : 'right';

  // Build slot positions
  const arcOffsets = useMemo(() => buildArc(side), [side]);
  const powerOffsets = useMemo(() => buildPowerSlots(side), [side]);

  // All 16 slot positions
  const slotPositions = useMemo(() => {
    return [...arcOffsets, ...powerOffsets].map((offset, i) => ({
      left: anchorPos.left + offset.dl,
      top: anchorPos.top - offset.db,
      index: i,
    }));
  }, [arcOffsets, powerOffsets, anchorPos]);

  // Cog position
  const cogPos = useMemo(() => {
    const corner = config.cogCorner;
    return {
      left: anchorPos.left + (corner.includes('r') ? DSIZ + 6 : -30),
      top: anchorPos.top + (corner.includes('b') ? DSIZ + 6 : -30),
    };
  }, [anchorPos, config.cogCorner]);

  // Nav label position
  const labelPos = useMemo(() => ({
    left: anchorPos.left + (config.labelSide === 'left' ? -80 : DSIZ + 10),
    top: anchorPos.top + DSIZ / 2 - 6,
  }), [anchorPos, config.labelSide]);

  // Resolve which catalog entries are used
  const usedKeys = useMemo(() => new Set(assigned.filter(Boolean)), [assigned]);

  // Available items for picker (not currently assigned)
  const availableForPicker = useMemo(
    () => CATALOG.filter(c => !usedKeys.has(c.key)),
    [usedKeys]
  );

  // Handlers
  const handleDotClick = useCallback(() => {
    if (showSettings) { setShowSettings(false); return; }
    if (pickerSlotIndex !== null) { setPickerSlotIndex(null); return; }
    setIsOpen(prev => !prev);
    if (isEditing && isOpen) setIsEditing(false);
  }, [showSettings, pickerSlotIndex, isEditing, isOpen]);

  const handleNavClick = useCallback((slotIndex) => {
    const key = assigned[slotIndex];
    if (!key) return;
    const entry = CATALOG_BY_KEY[key];
    if (!entry) return;

    const route = resolveRoute(entry, loggedInUser, viewingUser);
    if (!route) return;

    dispatchVoidNavTrigger({
      key: entry.key,
      label: entry.label,
      type: entry.type,
      route,
      loggedInUser,
      viewingUser,
    });

    navigate(route);
    setIsOpen(false);
    setIsEditing(false);
  }, [assigned, loggedInUser, viewingUser, navigate]);

  const handleRemoveSlot = useCallback((slotIndex) => {
    setAssigned(prev => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
  }, []);

  const handlePickerSelect = useCallback((key) => {
    if (pickerSlotIndex === null) return;
    setAssigned(prev => {
      const next = [...prev];
      next[pickerSlotIndex] = key;
      return next;
    });
    setPickerSlotIndex(null);
  }, [pickerSlotIndex]);

  const handleEmptySlotClick = useCallback((slotIndex) => {
    if (isEditing) {
      setPickerSlotIndex(slotIndex);
    }
  }, [isEditing]);

  const handleDockChange = useCallback((newDock) => {
    setDock(newDock);
  }, []);

  const toggleEditing = useCallback(() => {
    setIsEditing(prev => !prev);
    setPickerSlotIndex(null);
    setShowSettings(false);
  }, []);

  const toggleSettings = useCallback(() => {
    setShowSettings(prev => !prev);
    setPickerSlotIndex(null);
  }, []);

  // Determine context for viewingUser
  const effectiveViewingUser = useMemo(() => {
    if (!viewingUser || viewingUser === loggedInUser) return null;
    return viewingUser;
  }, [viewingUser, loggedInUser]);

  if (!enabled) return null;

  // Picker position near the target empty slot
  const pickerPos = pickerSlotIndex !== null && slotPositions[pickerSlotIndex]
    ? {
        left: Math.min(slotPositions[pickerSlotIndex].left, windowSize.w - 240),
        top: Math.max(slotPositions[pickerSlotIndex].top - 120, 10),
      }
    : { left: 0, top: 0 };

  // Settings panel position near cog
  const settingsPos = {
    left: Math.min(cogPos.left, windowSize.w - 260),
    top: Math.max(cogPos.top - 180, 10),
  };

  const portalContent = (
    <>
      {/* Backdrop */}
      <div
        id="dotnav-backdrop"
        className={isOpen ? 'dotnav-visible' : ''}
        onClick={() => {
          setIsOpen(false);
          setIsEditing(false);
          setShowSettings(false);
          setPickerSlotIndex(null);
        }}
        aria-hidden="true"
      />

      {/* Main Dot Button */}
      <button
        ref={dotRef}
        id="dotnav-dot"
        className={isOpen ? 'dotnav-open' : ''}
        style={{ left: anchorPos.left, top: anchorPos.top }}
        onClick={handleDotClick}
        aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isOpen}
        type="button"
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        )}
      </button>

      {/* Settings Cog */}
      <button
        id="dotnav-cog"
        className={`${isOpen ? 'dotnav-visible' : ''} ${isEditing ? 'dotnav-editing' : ''}`}
        style={{ left: cogPos.left, top: cogPos.top }}
        onClick={toggleSettings}
        aria-label="Navigation settings"
        type="button"
      >
        {SVG_ICONS.settings}
      </button>

      {/* Navigation Label */}
      <span
        id="dotnav-nav-label"
        className={isOpen && !isEditing ? 'dotnav-visible' : ''}
        style={{ left: labelPos.left, top: labelPos.top }}
        aria-hidden="true"
      >
        navigate
      </span>

      {/* Slots */}
      {slotPositions.map((pos, index) => {
        const key = assigned[index] || null;
        const entry = key ? CATALOG_BY_KEY[key] : null;
        const isFilled = Boolean(entry);
        const isPower = index >= 12;
        const isHovered = hoveredSlot === index;

        return (
          <div
            key={index}
            className={[
              'dotnav-slot',
              isOpen ? 'dotnav-visible' : '',
              !isFilled ? 'dotnav-empty' : '',
              isEditing ? 'dotnav-editing' : '',
            ].filter(Boolean).join(' ')}
            style={{
              left: pos.left,
              top: pos.top,
              transitionDelay: isOpen ? `${index * 25}ms` : '0ms',
            }}
            data-slot-index={index}
            onMouseEnter={() => setHoveredSlot(index)}
            onMouseLeave={() => setHoveredSlot(null)}
          >
            {isFilled ? (
              <>
                <button
                  className="dotnav-nbtn"
                  onClick={() => isEditing ? undefined : handleNavClick(index)}
                  aria-label={`${entry.label}${isPower ? ' (Power Button)' : ''}${entry.type === 'contextual' && effectiveViewingUser ? ` for ${effectiveViewingUser}` : ''}`}
                  title={entry.label}
                  type="button"
                  style={isPower ? { background: '#2563eb' } : undefined}
                >
                  {SVG_ICONS[entry.icon] || <span>{entry.label.charAt(0)}</span>}
                </button>
                {isEditing && (
                  <button
                    className="dotnav-slot-remove"
                    onClick={(e) => { e.stopPropagation(); handleRemoveSlot(index); }}
                    aria-label={`Remove ${entry.label}`}
                    type="button"
                  >
                    ×
                  </button>
                )}
                {isHovered && !isEditing && (
                  <span className="dotnav-tip dotnav-tip-top dotnav-visible" style={{ bottom: BSIZ + 8, left: '50%', transform: 'translateX(-50%)' }}>
                    {entry.label}
                    {entry.type === 'contextual' && effectiveViewingUser ? ` (${effectiveViewingUser})` : ''}
                  </span>
                )}
              </>
            ) : (
              <button
                className="dotnav-nbtn"
                onClick={() => handleEmptySlotClick(index)}
                aria-label={isEditing ? `Add button to slot ${index + 1}` : `Empty slot ${index + 1}`}
                type="button"
                style={{ background: 'transparent', border: `2px dashed var(--dotnav-slot-empty)` }}
              >
                {isEditing ? <span style={{ fontSize: 20, color: 'var(--dotnav-slot-empty)' }}>+</span> : null}
              </button>
            )}
          </div>
        );
      })}

      {/* Edit Mode Hint */}
      <div
        id="dotnav-hint"
        className={isEditing ? 'dotnav-visible' : ''}
      >
        drag to rearrange · tap + to add · tap × to remove
      </div>

      {/* Button Picker */}
      <div
        id="dotnav-btn-picker"
        className={pickerSlotIndex !== null ? 'dotnav-visible' : ''}
        style={{ left: pickerPos.left, top: pickerPos.top }}
        role="listbox"
        aria-label="Choose a button to add"
      >
        {availableForPicker.map(item => (
          <button
            key={item.key}
            className="dotnav-picker-item"
            onClick={() => handlePickerSelect(item.key)}
            aria-label={item.label}
            title={item.label}
            type="button"
            role="option"
          >
            {SVG_ICONS[item.icon] || <span>{item.label.charAt(0)}</span>}
          </button>
        ))}
        {availableForPicker.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--dotnav-mid)', padding: '8px', margin: 0 }}>All buttons assigned</p>
        )}
      </div>

      {/* Settings Panel */}
      <div
        id="dotnav-settings-panel"
        className={showSettings ? 'dotnav-visible' : ''}
        style={{ left: settingsPos.left, top: settingsPos.top }}
        role="dialog"
        aria-label="Navigation settings"
      >
        <h3>Dock Position</h3>
        {Object.entries(DOCK_CONFIGS).map(([key, cfg]) => (
          <label key={key}>
            <input
              type="radio"
              name="dotnav-dock"
              checked={dock === key}
              onChange={() => handleDockChange(key)}
            />
            {cfg.label}
          </label>
        ))}
        <div style={{ marginTop: 14, borderTop: '1px solid var(--dotnav-border)', paddingTop: 12 }}>
          <button
            type="button"
            onClick={toggleEditing}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--dotnav-border)',
              borderRadius: 8,
              background: isEditing ? 'var(--dotnav-ink)' : 'transparent',
              color: isEditing ? 'var(--dotnav-btn-fg)' : 'var(--dotnav-ink)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 8,
            }}
            aria-label={isEditing ? 'Exit edit mode' : 'Enter edit mode'}
          >
            {isEditing ? 'Done Editing' : 'Edit Buttons'}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(false)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--dotnav-border)',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--dotnav-mid)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
            aria-label="Close settings"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(portalContent, document.body);
};

export { CATALOG, CATALOG_BY_KEY, resolveRoute, DEFAULT_ASSIGNED, DOCK_CONFIGS };
export default DotNav;
