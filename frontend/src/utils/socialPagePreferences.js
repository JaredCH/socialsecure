export const SOCIAL_THEME_PRESETS = ['default', 'light', 'dark', 'sunset', 'forest'];
export const SOCIAL_LAYOUT_MODES = ['desktop', 'mobile'];
export const SOCIAL_FONT_FAMILIES = ['Inter', 'Manrope', 'Space Grotesk', 'Merriweather', 'Fira Sans', 'Georgia'];
export const SOCIAL_FONT_SIZE_TOKENS = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl'];
export const SOCIAL_LAYOUT_AREAS = ['top', 'sideLeft', 'main', 'sideRight'];
export const SOCIAL_LAYOUT_SIZES = ['sidePanelFull', 'sidePanelHalfHeight', 'quarterTile', 'halfTile', 'fullTile', 'halfCol', 'oneCol', 'twoCols', 'threeCols', 'fourCols'];
export const SOCIAL_LAYOUT_HEIGHTS = ['halfRow', 'fullRow', 'twoRows', 'threeRows', 'fourRows'];
export const SOCIAL_MODULE_IDS = ['marketplaceShortcut', 'calendarShortcut', 'settingsShortcut', 'referShortcut', 'chatPanel', 'communityNotes'];
export const SOCIAL_PANEL_SHAPES = ['rectangle', 'square', 'wide', 'tall', 'l-shape', 't-shape', 'z-shape'];
export const BODY_BG_DISPLAY_MODES = ['cover', 'repeat', 'fixed'];
export const BODY_BG_OVERLAY_ANIMATIONS = ['none', 'snow', 'easter-eggs', 'halloween-ghosts', 'valentines-hearts', 'fireworks'];
export const SOCIAL_PANEL_SHAPE_MASKS = {
  rectangle: [[1, 1], [1, 1]],
  square: [[1, 1], [1, 1]],
  wide: [[1, 1, 1], [1, 1, 1]],
  tall: [[1, 1], [1, 1], [1, 1]],
  'l-shape': [[1, 0], [1, 0], [1, 1]],
  't-shape': [[1, 1, 1], [0, 1, 0]],
  'z-shape': [[1, 1, 0], [0, 1, 1]]
};
export const SOCIAL_PANEL_IDS = [
  'guest_preview_notice',
  'shortcuts',
  'snapshot',
  'guest_lookup',
  'composer',
  'circles',
  'timeline',
  'moderation_status',
  'gallery',
  'chat_panel',
  'top_friends',
  'community_notes'
];

// Hero sub-page tabs
export const SOCIAL_HERO_TABS = [
  { id: 'main', label: 'Feed', icon: 'home' },
  { id: 'gallery', label: 'Gallery', icon: 'photo' },
  { id: 'friends', label: 'Friends', icon: 'users' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'blog', label: 'Blog', icon: 'blog', optional: true },
  { id: 'resume', label: 'Resume', icon: 'resume', optional: true },
  { id: 'aboutme', label: 'About Me', icon: 'aboutme', optional: true }
];

export const SOCIAL_HERO_TAB_LABELS = {
  main: 'Main',
  friends: 'Friends',
  gallery: 'Gallery',
  chat: 'Chat',
  calendar: 'Calendar',
  blog: 'Blog',
  resume: 'Resume',
  aboutme: 'About Me'
};

export const SOCIAL_PANEL_LABELS = {
  guest_preview_notice: 'Guest Preview Notice',
  shortcuts: 'Shortcuts',
  snapshot: 'Social Snapshot',
  guest_lookup: 'Guest Lookup',
  composer: 'Composer',
  circles: 'Circles',
  timeline: 'Timeline',
  moderation_status: 'Moderation',
  gallery: 'Gallery',
  chat_panel: 'Chat Panel',
  top_friends: 'Top Friends',
  community_notes: 'Community Notes'
};

// Hero configuration defaults
export const DEFAULT_HERO_CONFIG = {
  backgroundColor: '#1e293b',
  backgroundImage: null,
  textColor: '#ffffff',
  nameColor: '#ffffff',
  locationColor: '#94a3b8',
  menuTextColor: '#e2e8f0',
  menuActiveColor: '#3b82f6',
  fontFamily: 'Inter',
  avatarSize: 'lg',
  showLocation: true,
  showOnlineStatus: true,
  showNavigation: true,
  activeTab: 'main',
  layout: 'standard', // 'standard' | 'compact' | 'expanded'
  backgroundImageUseRandomGallery: false,
  backgroundImageHistory: [],
  profileImage: null,
  profileImageHistory: []
};

export const HERO_AVATAR_SIZES = {
  sm: { desktop: 64, mobile: 48 },
  md: { desktop: 80, mobile: 56 },
  lg: { desktop: 96, mobile: 64 },
  xl: { desktop: 120, mobile: 80 }
};

export const HERO_LAYOUTS = [
  { id: 'standard', name: 'Standard', description: 'Balanced layout with avatar and info side by side' },
  { id: 'compact', name: 'Compact', description: 'Smaller avatar, more space for content' },
  { id: 'expanded', name: 'Expanded', description: 'Large avatar with more profile details' }
];

export const SOCIAL_AREA_LABELS = {
  top: 'Top',
  sideLeft: 'Left rail',
  main: 'Main grid',
  sideRight: 'Right rail'
};

export const SOCIAL_SIZE_LABELS = {
  sidePanelFull: 'Side panel full',
  sidePanelHalfHeight: 'Side panel half height',
  quarterTile: '½ column',
  halfTile: '1 column',
  fullTile: '2 columns',
  halfCol: '½ column',
  oneCol: '1 column',
  twoCols: '2 columns',
  threeCols: '3 columns',
  fourCols: '4 columns'
};

export const SOCIAL_HEIGHT_LABELS = {
  halfRow: '½ row',
  fullRow: '1 row',
  twoRows: '2 rows',
  threeRows: '3 rows',
  fourRows: '4 rows'
};

export const SOCIAL_LAYOUT_PRESETS = [
  {
    id: 'compact',
    name: 'Compact',
    description: 'Dense arrangement for quick scanning across all panels.',
    panels: {
      guest_preview_notice: { area: 'main', size: 'fourCols', height: 'halfRow', order: 0, gridPlacement: { row: 0, col: 0 }, visible: true },
      guest_lookup: { area: 'main', size: 'twoCols', height: 'fullRow', order: 1, gridPlacement: { row: 1, col: 0 }, visible: true },
      composer: { area: 'main', size: 'fourCols', height: 'fullRow', order: 2, gridPlacement: { row: 3, col: 0 }, visible: true },
      circles: { area: 'main', size: 'twoCols', height: 'fullRow', order: 3, gridPlacement: { row: 5, col: 0 }, visible: true },
      timeline: { area: 'main', size: 'fourCols', height: 'twoRows', order: 4, gridPlacement: { row: 7, col: 0 }, visible: true },
      moderation_status: { area: 'main', size: 'oneCol', height: 'fullRow', order: 5, gridPlacement: { row: 5, col: 4 }, visible: true },
      gallery: { area: 'main', size: 'threeCols', height: 'twoRows', order: 6, gridPlacement: { row: 11, col: 0 }, visible: true },
      shortcuts: { area: 'sideLeft', size: 'sidePanelFull', height: 'twoRows', order: 0, gridPlacement: { row: 0, col: 8 }, visible: true },
      snapshot: { area: 'sideLeft', size: 'sidePanelHalfHeight', height: 'fullRow', order: 1, gridPlacement: { row: 4, col: 8 }, visible: true },
      chat_panel: { area: 'sideRight', size: 'sidePanelHalfHeight', height: 'fullRow', order: 0, gridPlacement: { row: 0, col: 10 }, visible: true },
      top_friends: { area: 'sideRight', size: 'sidePanelFull', height: 'twoRows', order: 1, gridPlacement: { row: 2, col: 10 }, visible: true },
      community_notes: { area: 'sideRight', size: 'sidePanelHalfHeight', height: 'fullRow', order: 2, gridPlacement: { row: 6, col: 10 }, visible: true }
    }
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Evenly weighted layout for feed, actions, and utilities.',
    panels: {
      guest_preview_notice: { area: 'main', size: 'fourCols', height: 'halfRow', order: 0, gridPlacement: { row: 0, col: 0 }, visible: true },
      guest_lookup: { area: 'main', size: 'oneCol', height: 'fullRow', order: 1, gridPlacement: { row: 1, col: 0 }, visible: true },
      composer: { area: 'main', size: 'threeCols', height: 'fullRow', order: 2, gridPlacement: { row: 1, col: 2 }, visible: true },
      circles: { area: 'main', size: 'twoCols', height: 'fullRow', order: 3, gridPlacement: { row: 3, col: 0 }, visible: true },
      timeline: { area: 'main', size: 'threeCols', height: 'twoRows', order: 4, gridPlacement: { row: 5, col: 0 }, visible: true },
      moderation_status: { area: 'main', size: 'oneCol', height: 'fullRow', order: 5, gridPlacement: { row: 3, col: 4 }, visible: true },
      gallery: { area: 'main', size: 'threeCols', height: 'twoRows', order: 6, gridPlacement: { row: 5, col: 6 }, visible: true },
      shortcuts: { area: 'sideLeft', size: 'sidePanelFull', height: 'twoRows', order: 0, gridPlacement: { row: 0, col: 8 }, visible: true },
      snapshot: { area: 'sideLeft', size: 'sidePanelHalfHeight', height: 'fullRow', order: 1, gridPlacement: { row: 4, col: 8 }, visible: true },
      chat_panel: { area: 'sideRight', size: 'sidePanelHalfHeight', height: 'fullRow', order: 0, gridPlacement: { row: 0, col: 10 }, visible: true },
      top_friends: { area: 'sideRight', size: 'sidePanelFull', height: 'twoRows', order: 1, gridPlacement: { row: 2, col: 10 }, visible: true },
      community_notes: { area: 'sideRight', size: 'sidePanelHalfHeight', height: 'fullRow', order: 2, gridPlacement: { row: 6, col: 10 }, visible: true }
    }
  },
  {
    id: 'content-first',
    name: 'Content first',
    description: 'Prioritizes timeline and gallery while keeping utility panels accessible.',
    panels: {
      guest_preview_notice: { area: 'main', size: 'fourCols', height: 'halfRow', order: 0, gridPlacement: { row: 0, col: 0 }, visible: true },
      composer: { area: 'main', size: 'fourCols', height: 'fullRow', order: 1, gridPlacement: { row: 1, col: 0 }, visible: true },
      timeline: { area: 'main', size: 'fourCols', height: 'threeRows', order: 2, gridPlacement: { row: 3, col: 0 }, visible: true },
      gallery: { area: 'main', size: 'fourCols', height: 'twoRows', order: 3, gridPlacement: { row: 9, col: 0 }, visible: true },
      guest_lookup: { area: 'main', size: 'oneCol', height: 'fullRow', order: 4, gridPlacement: { row: 13, col: 0 }, visible: true },
      circles: { area: 'main', size: 'oneCol', height: 'fullRow', order: 5, gridPlacement: { row: 13, col: 2 }, visible: true },
      moderation_status: { area: 'main', size: 'oneCol', height: 'fullRow', order: 6, gridPlacement: { row: 13, col: 4 }, visible: true },
      shortcuts: { area: 'sideLeft', size: 'sidePanelFull', height: 'twoRows', order: 0, gridPlacement: { row: 0, col: 8 }, visible: true },
      snapshot: { area: 'sideLeft', size: 'sidePanelHalfHeight', height: 'fullRow', order: 1, gridPlacement: { row: 4, col: 8 }, visible: true },
      chat_panel: { area: 'sideRight', size: 'sidePanelHalfHeight', height: 'fullRow', order: 0, gridPlacement: { row: 0, col: 10 }, visible: true },
      top_friends: { area: 'sideRight', size: 'sidePanelFull', height: 'twoRows', order: 1, gridPlacement: { row: 2, col: 10 }, visible: true },
      community_notes: { area: 'sideRight', size: 'sidePanelHalfHeight', height: 'fullRow', order: 2, gridPlacement: { row: 6, col: 10 }, visible: true }
    }
  }
];

export const SOCIAL_THEME_STYLE_PRESETS = [
  {
    id: 'oceanic',
    name: 'Oceanic',
    description: 'Cool blues with crisp contrast for long reading sessions.',
    design: {
      themePreset: 'default',
      accentColorToken: 'blue',
      globalStyles: {
        panelColor: '#eff6ff',
        headerColor: '#1d4ed8',
        fontFamily: 'Inter',
        fontColor: '#0f172a',
        pageBackgroundColor: '#e0f2fe',
        fontSizes: { header: '2xl', subHeader: 'xl', regular: 'base', small: 'sm' }
      }
    }
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Dark, focused palette ideal for dense dashboards.',
    design: {
      themePreset: 'dark',
      accentColorToken: 'emerald',
      globalStyles: {
        panelColor: '#0f172a',
        headerColor: '#334155',
        fontFamily: 'Space Grotesk',
        fontColor: '#e2e8f0',
        pageBackgroundColor: '#020617',
        fontSizes: { header: '2xl', subHeader: 'lg', regular: 'base', small: 'sm' }
      }
    }
  },
  {
    id: 'sunrise',
    name: 'Sunrise',
    description: 'Warm editorial tones with high readability.',
    design: {
      themePreset: 'sunset',
      accentColorToken: 'rose',
      globalStyles: {
        panelColor: '#fff7ed',
        headerColor: '#c2410c',
        fontFamily: 'Merriweather',
        fontColor: '#7c2d12',
        pageBackgroundColor: '#fff1f2',
        fontSizes: { header: '3xl', subHeader: 'xl', regular: 'lg', small: 'base' }
      }
    }
  }
];

export const FONT_SIZE_LABELS = {
  xs: 'XS',
  sm: 'SM',
  base: 'Base',
  lg: 'LG',
  xl: 'XL',
  '2xl': '2XL',
  '3xl': '3XL'
};

export const THEME_TO_DEFAULT_ACCENT = {
  default: 'blue',
  light: 'violet',
  dark: 'emerald',
  sunset: 'rose',
  forest: 'emerald'
};

export const THEME_TO_ALLOWED_ACCENTS = {
  default: ['blue', 'violet', 'emerald', 'rose'],
  light: ['blue', 'violet', 'emerald'],
  dark: ['blue', 'violet', 'emerald', 'rose', 'amber'],
  sunset: ['rose', 'amber', 'violet'],
  forest: ['emerald', 'blue', 'amber']
};

export const DEFAULT_GLOBAL_STYLES = {
  panelColor: '#ffffff',
  headerColor: '#0f172a',
  fontFamily: 'Inter',
  fontColor: '#0f172a',
  pageBackgroundColor: '#f8fafc',
  fontSizes: {
    header: '2xl',
    subHeader: 'xl',
    regular: 'base',
    small: 'sm'
  },
  bodyBackgroundImage: '',
  bodyBackgroundOverlay: 0,
  bodyBackgroundGrain: 0,
  bodyBackgroundBlur: 0,
  bodyBackgroundDisplayMode: 'cover',
  bodyBackgroundOverlayAnimation: 'none'
};

const BALANCED_LAYOUT_PRESET = SOCIAL_LAYOUT_PRESETS.find((preset) => preset.id === 'balanced')
  || SOCIAL_LAYOUT_PRESETS[0]
  || { panels: {} };

export const DEFAULT_PANEL_LAYOUTS = BALANCED_LAYOUT_PRESET.panels;
export const DEFAULT_MOBILE_PANEL_LAYOUTS = {
  guest_preview_notice: { area: 'main', size: 'fourCols', height: 'halfRow', order: 0, visible: true, gridPlacement: { row: 0, col: 0 } },
  composer: { area: 'main', size: 'fourCols', height: 'fullRow', order: 1, visible: true, gridPlacement: { row: 1, col: 0 } },
  timeline: { area: 'main', size: 'fourCols', height: 'threeRows', order: 2, visible: true, gridPlacement: { row: 3, col: 0 } },
  gallery: { area: 'main', size: 'fourCols', height: 'twoRows', order: 3, visible: true, gridPlacement: { row: 9, col: 0 } },
  chat_panel: { area: 'main', size: 'fourCols', height: 'fullRow', order: 4, visible: true, gridPlacement: { row: 13, col: 0 } },
  top_friends: { area: 'main', size: 'twoCols', height: 'fullRow', order: 5, visible: true, gridPlacement: { row: 15, col: 0 } },
  snapshot: { area: 'main', size: 'twoCols', height: 'fullRow', order: 6, visible: true, gridPlacement: { row: 15, col: 6 } },
  circles: { area: 'main', size: 'fourCols', height: 'fullRow', order: 7, visible: true, gridPlacement: { row: 17, col: 0 } },
  guest_lookup: { area: 'main', size: 'twoCols', height: 'fullRow', order: 8, visible: true, gridPlacement: { row: 16, col: 0 } },
  moderation_status: { area: 'main', size: 'twoCols', height: 'fullRow', order: 9, visible: true, gridPlacement: { row: 16, col: 6 } },
  community_notes: { area: 'main', size: 'fourCols', height: 'halfRow', order: 10, visible: true, gridPlacement: { row: 18, col: 0 } },
  shortcuts: { area: 'main', size: 'fourCols', height: 'halfRow', order: 11, visible: true, gridPlacement: { row: 18, col: 6 } }
};

export const SOCIAL_DESIGN_TEMPLATES = [
  {
    id: 'aurora-glass',
    name: 'Aurora Glass',
    description: 'Soft glass cards with cool neon accents.',
    design: {
      themePreset: 'dark',
      globalStyles: {
        panelColor: '#111827',
        headerColor: '#7c3aed',
        fontFamily: 'Space Grotesk',
        fontColor: '#f8fafc',
        pageBackgroundColor: '#020617',
        fontSizes: { header: '2xl', subHeader: 'xl', regular: 'base', small: 'sm' }
      },
      panels: {
        timeline: { useCustomStyles: true, styles: { panelColor: '#0f172a', headerColor: '#4f46e5', fontColor: '#e2e8f0' } }
      }
    }
  },
  {
    id: 'sunset-editorial',
    name: 'Sunset Editorial',
    description: 'Warm editorial styling with bold section headers.',
    design: {
      themePreset: 'sunset',
      globalStyles: {
        panelColor: '#fff7ed',
        headerColor: '#c2410c',
        fontFamily: 'Merriweather',
        fontColor: '#7c2d12',
        pageBackgroundColor: '#fff1f2',
        fontSizes: { header: '3xl', subHeader: 'xl', regular: 'lg', small: 'base' }
      }
    }
  },
  {
    id: 'forest-board',
    name: 'Forest Board',
    description: 'Deep greens, strong cards, and dashboard-friendly spacing.',
    design: {
      themePreset: 'forest',
      globalStyles: {
        panelColor: '#ecfdf5',
        headerColor: '#065f46',
        fontFamily: 'Manrope',
        fontColor: '#064e3b',
        pageBackgroundColor: '#f0fdf4',
        fontSizes: { header: '2xl', subHeader: 'lg', regular: 'base', small: 'sm' }
      }
    }
  },
  {
    id: 'clean-studio',
    name: 'Clean Studio',
    description: 'Minimal, bright, and optimized for content-heavy layouts.',
    design: {
      themePreset: 'light',
      globalStyles: {
        panelColor: '#ffffff',
        headerColor: '#2563eb',
        fontFamily: 'Inter',
        fontColor: '#1f2937',
        pageBackgroundColor: '#f8fafc',
        fontSizes: { header: 'xl', subHeader: 'lg', regular: 'base', small: 'sm' }
      }
    }
  }
];

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const isHex = (value) => typeof value === 'string' && /^#([0-9a-fA-F]{3,8})$/.test(value.trim());
const LAYOUT_GRID_COLUMNS = 12;
const LAYOUT_GRID_ROWS = 20;
const MEDIA_URL_MAX_LENGTH = 2048;
const HERO_IMAGE_HISTORY_LIMIT = 3;

const normalizeFontSizes = (value = {}, fallback = DEFAULT_GLOBAL_STYLES.fontSizes) => ({
  header: SOCIAL_FONT_SIZE_TOKENS.includes(value.header) ? value.header : fallback.header,
  subHeader: SOCIAL_FONT_SIZE_TOKENS.includes(value.subHeader) ? value.subHeader : fallback.subHeader,
  regular: SOCIAL_FONT_SIZE_TOKENS.includes(value.regular) ? value.regular : fallback.regular,
  small: SOCIAL_FONT_SIZE_TOKENS.includes(value.small) ? value.small : fallback.small,
});

const normalizeSizeForArea = (size, area, fallback) => {
  if (area === 'sideLeft' || area === 'sideRight') {
    return ['sidePanelFull', 'sidePanelHalfHeight'].includes(size)
      ? size
      : (fallback === 'sidePanelHalfHeight' ? 'sidePanelHalfHeight' : 'sidePanelFull');
  }
  if (area === 'top') return 'fullTile';
  const legacyToModern = {
    quarterTile: 'halfCol',
    halfTile: 'oneCol',
    fullTile: 'twoCols'
  };
  const normalized = legacyToModern[size] || size;
  const normalizedFallback = legacyToModern[fallback] || fallback;
  return ['halfCol', 'oneCol', 'twoCols', 'threeCols', 'fourCols'].includes(normalized) ? normalized : normalizedFallback;
};

const normalizeHeightForArea = (height, area, fallback, rawSize) => {
  if (area === 'top') return 'fullRow';

  if (area === 'sideLeft' || area === 'sideRight') {
    const fallbackHeight = rawSize === 'sidePanelHalfHeight'
      ? 'halfRow'
      : rawSize === 'sidePanelFull'
        ? 'fullRow'
        : (SOCIAL_LAYOUT_HEIGHTS.includes(fallback) ? fallback : 'fullRow');
    return ['halfRow', 'fullRow', 'twoRows', 'fourRows'].includes(height) ? height : fallbackHeight;
  }

  const fallbackHeight = SOCIAL_LAYOUT_HEIGHTS.includes(fallback) ? fallback : 'fullRow';
  return SOCIAL_LAYOUT_HEIGHTS.includes(height) ? height : fallbackHeight;
};

const normalizeGridPlacement = (gridPlacement, fallback) => {
  const row = Number(gridPlacement?.row);
  const col = Number(gridPlacement?.col);
  if (!Number.isFinite(row) || !Number.isFinite(col)) {
    return isPlainObject(fallback) ? fallback : undefined;
  }
  if (row < 0 || row >= LAYOUT_GRID_ROWS || col < 0 || col >= LAYOUT_GRID_COLUMNS) {
    return isPlainObject(fallback) ? fallback : undefined;
  }
  return { row: Math.floor(row), col: Math.floor(col) };
};

const normalizeHeroConfig = (heroInput, fallback) => {
  const isHexColor = (value) => typeof value === 'string' && /^#([0-9a-fA-F]{3,8})$/.test(value.trim());
  const isValidFont = (value) => SOCIAL_FONT_FAMILIES.includes(value);
  const isValidSize = (value) => ['sm', 'md', 'lg', 'xl'].includes(value);
  const isValidLayout = (value) => ['standard', 'compact', 'expanded'].includes(value);
  const normalizeMediaUrl = (value, valueFallback = null) => {
    if (typeof value !== 'string') return valueFallback;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MEDIA_URL_MAX_LENGTH) return valueFallback;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return valueFallback;
      return parsed.toString();
    } catch {
      return valueFallback;
    }
  };
  const normalizeHistory = (history, currentValue) => {
    if (!Array.isArray(history)) return [];
    const seen = new Set();
    const normalized = [];
    const currentKey = typeof currentValue === 'string' ? currentValue.toLowerCase() : '';
    for (const item of history) {
      const normalizedUrl = normalizeMediaUrl(item, null);
      if (!normalizedUrl) continue;
      const dedupeKey = normalizedUrl.toLowerCase();
      if (dedupeKey === currentKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      normalized.push(normalizedUrl);
      if (normalized.length >= HERO_IMAGE_HISTORY_LIMIT) break;
    }
    return normalized;
  };
  const backgroundImage = normalizeMediaUrl(heroInput?.backgroundImage, fallback.backgroundImage);
  const profileImage = normalizeMediaUrl(heroInput?.profileImage, fallback.profileImage);
  
  return {
    backgroundColor: isHexColor(heroInput?.backgroundColor) ? heroInput.backgroundColor : fallback.backgroundColor,
    backgroundImage,
    textColor: isHexColor(heroInput?.textColor) ? heroInput.textColor : fallback.textColor,
    nameColor: isHexColor(heroInput?.nameColor) ? heroInput.nameColor : fallback.nameColor,
    locationColor: isHexColor(heroInput?.locationColor) ? heroInput.locationColor : fallback.locationColor,
    menuTextColor: isHexColor(heroInput?.menuTextColor) ? heroInput.menuTextColor : fallback.menuTextColor,
    menuActiveColor: isHexColor(heroInput?.menuActiveColor) ? heroInput.menuActiveColor : fallback.menuActiveColor,
    fontFamily: isValidFont(heroInput?.fontFamily) ? heroInput.fontFamily : fallback.fontFamily,
    avatarSize: isValidSize(heroInput?.avatarSize) ? heroInput.avatarSize : fallback.avatarSize,
    showLocation: heroInput?.showLocation !== undefined ? Boolean(heroInput.showLocation) : fallback.showLocation,
    showOnlineStatus: heroInput?.showOnlineStatus !== undefined ? Boolean(heroInput.showOnlineStatus) : fallback.showOnlineStatus,
    showNavigation: heroInput?.showNavigation !== undefined ? Boolean(heroInput.showNavigation) : fallback.showNavigation,
    activeTab: SOCIAL_HERO_TABS.some(t => t.id === heroInput?.activeTab) ? heroInput.activeTab : fallback.activeTab,
    layout: isValidLayout(heroInput?.layout) ? heroInput.layout : fallback.layout,
    backgroundImageUseRandomGallery: heroInput?.backgroundImageUseRandomGallery !== undefined
      ? Boolean(heroInput.backgroundImageUseRandomGallery)
      : Boolean(fallback.backgroundImageUseRandomGallery),
    backgroundImageHistory: normalizeHistory(heroInput?.backgroundImageHistory, backgroundImage),
    profileImage,
    profileImageHistory: normalizeHistory(heroInput?.profileImageHistory, profileImage)
  };
};

export const buildDefaultSocialPreferences = (profileTheme = 'default') => ({
  themePreset: SOCIAL_THEME_PRESETS.includes(profileTheme) ? profileTheme : 'default',
  accentColorToken: THEME_TO_DEFAULT_ACCENT[profileTheme] || THEME_TO_DEFAULT_ACCENT.default,
  sectionOrder: [...SOCIAL_PANEL_IDS],
  hiddenSections: [],
  hiddenModules: [],
  globalStyles: {
    ...DEFAULT_GLOBAL_STYLES,
    fontSizes: { ...DEFAULT_GLOBAL_STYLES.fontSizes }
  },
  hero: {
    ...DEFAULT_HERO_CONFIG,
    backgroundImageHistory: [...DEFAULT_HERO_CONFIG.backgroundImageHistory],
    profileImageHistory: [...DEFAULT_HERO_CONFIG.profileImageHistory]
  },
  panels: SOCIAL_PANEL_IDS.reduce((acc, panelId) => {
    const panelDefaults = DEFAULT_PANEL_LAYOUTS[panelId];
    acc[panelId] = {
      ...panelDefaults,
      gridPlacement: panelDefaults.gridPlacement ? { ...panelDefaults.gridPlacement } : undefined,
      useCustomStyles: false,
      styles: {}
    };
    return acc;
  }, {}),
  layouts: {
    desktop: {
      panels: SOCIAL_PANEL_IDS.reduce((acc, panelId) => {
        const panelDefaults = DEFAULT_PANEL_LAYOUTS[panelId];
        acc[panelId] = {
          ...panelDefaults,
          gridPlacement: panelDefaults.gridPlacement ? { ...panelDefaults.gridPlacement } : undefined,
          useCustomStyles: false,
          styles: {}
        };
        return acc;
      }, {})
    },
    mobile: {
      panels: SOCIAL_PANEL_IDS.reduce((acc, panelId) => {
        const panelDefaults = DEFAULT_MOBILE_PANEL_LAYOUTS[panelId] || DEFAULT_PANEL_LAYOUTS[panelId];
        acc[panelId] = {
          ...panelDefaults,
          gridPlacement: panelDefaults.gridPlacement ? { ...panelDefaults.gridPlacement } : undefined,
          useCustomStyles: false,
          styles: {}
        };
        return acc;
      }, {})
    },
    activeMode: 'desktop'
  },
  activeConfigId: null,
  version: 2
});

export const normalizeSocialPreferences = (input, profileTheme = 'default', requestedLayoutMode = 'desktop') => {
  const defaults = buildDefaultSocialPreferences(profileTheme);
  const raw = isPlainObject(input) ? input : {};
  const themePreset = SOCIAL_THEME_PRESETS.includes(raw.themePreset) ? raw.themePreset : defaults.themePreset;
  const allowedAccents = THEME_TO_ALLOWED_ACCENTS[themePreset] || THEME_TO_ALLOWED_ACCENTS.default;
  const accentColorToken = allowedAccents.includes(raw.accentColorToken)
    ? raw.accentColorToken
    : (allowedAccents.includes(defaults.accentColorToken) ? defaults.accentColorToken : allowedAccents[0]);
  const normalizeBodyBgUrl = (val) => {
    if (typeof val !== 'string') return '';
    const trimmed = val.trim();
    if (!trimmed || trimmed.length > 2048) return '';
    if (/^\/uploads\/backgrounds\/[a-f0-9]+\/[a-f0-9]+-[a-f0-9]+\.\w{2,5}$/.test(trimmed)) return trimmed;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
    } catch { /* invalid URL */ }
    return '';
  };
  const clampFloat = (val, min, max) => { const n = Number(val); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min; };
  const globalStyles = {
    panelColor: isHex(raw.globalStyles?.panelColor || '') ? raw.globalStyles.panelColor : DEFAULT_GLOBAL_STYLES.panelColor,
    headerColor: isHex(raw.globalStyles?.headerColor || '') ? raw.globalStyles.headerColor : DEFAULT_GLOBAL_STYLES.headerColor,
    fontFamily: SOCIAL_FONT_FAMILIES.includes(raw.globalStyles?.fontFamily) ? raw.globalStyles.fontFamily : DEFAULT_GLOBAL_STYLES.fontFamily,
    fontColor: isHex(raw.globalStyles?.fontColor || '') ? raw.globalStyles.fontColor : DEFAULT_GLOBAL_STYLES.fontColor,
    pageBackgroundColor: isHex(raw.globalStyles?.pageBackgroundColor || '') ? raw.globalStyles.pageBackgroundColor : DEFAULT_GLOBAL_STYLES.pageBackgroundColor,
    fontSizes: normalizeFontSizes(raw.globalStyles?.fontSizes),
    bodyBackgroundImage: normalizeBodyBgUrl(raw.globalStyles?.bodyBackgroundImage),
    bodyBackgroundOverlay: clampFloat(raw.globalStyles?.bodyBackgroundOverlay, 0, 1),
    bodyBackgroundGrain: clampFloat(raw.globalStyles?.bodyBackgroundGrain, 0, 1),
    bodyBackgroundBlur: Math.round(clampFloat(raw.globalStyles?.bodyBackgroundBlur, 0, 20)),
    bodyBackgroundDisplayMode: BODY_BG_DISPLAY_MODES.includes(raw.globalStyles?.bodyBackgroundDisplayMode) ? raw.globalStyles.bodyBackgroundDisplayMode : DEFAULT_GLOBAL_STYLES.bodyBackgroundDisplayMode,
    bodyBackgroundOverlayAnimation: BODY_BG_OVERLAY_ANIMATIONS.includes(raw.globalStyles?.bodyBackgroundOverlayAnimation) ? raw.globalStyles.bodyBackgroundOverlayAnimation : DEFAULT_GLOBAL_STYLES.bodyBackgroundOverlayAnimation
  };
  const normalizePanelsForMode = (panelInput = {}, fallbackPanels = defaults.panels) => {
    const normalizedPanels = {};
    SOCIAL_PANEL_IDS.forEach((panelId) => {
      const panelRaw = panelInput?.[panelId] || {};
      const panelFallback = fallbackPanels[panelId] || defaults.panels[panelId];
      const area = SOCIAL_LAYOUT_AREAS.includes(panelRaw.area) ? panelRaw.area : panelFallback.area;
      normalizedPanels[panelId] = {
        area,
        order: Number.isFinite(Number(panelRaw.order)) ? Number(panelRaw.order) : panelFallback.order,
        visible: panelRaw.visible !== false,
        size: normalizeSizeForArea(panelRaw.size, area, panelFallback.size),
        height: normalizeHeightForArea(panelRaw.height, area, panelFallback.height, panelRaw.size),
        gridPlacement: normalizeGridPlacement(panelRaw.gridPlacement, panelFallback.gridPlacement),
        shape: SOCIAL_PANEL_SHAPES.includes(panelRaw.shape) ? panelRaw.shape : (panelFallback.shape || 'rectangle'),
        useCustomStyles: Boolean(panelRaw.useCustomStyles),
        styles: {
          panelColor: isHex(panelRaw.styles?.panelColor || '') ? panelRaw.styles.panelColor : globalStyles.panelColor,
          headerColor: isHex(panelRaw.styles?.headerColor || '') ? panelRaw.styles.headerColor : globalStyles.headerColor,
          fontFamily: SOCIAL_FONT_FAMILIES.includes(panelRaw.styles?.fontFamily) ? panelRaw.styles.fontFamily : globalStyles.fontFamily,
          fontColor: isHex(panelRaw.styles?.fontColor || '') ? panelRaw.styles.fontColor : globalStyles.fontColor,
          fontSizes: normalizeFontSizes(panelRaw.styles?.fontSizes, globalStyles.fontSizes)
        }
      };
    });
    return normalizedPanels;
  };

  const desktopPanels = normalizePanelsForMode(
    raw.layouts?.desktop?.panels || raw.panels || {},
    defaults.layouts.desktop.panels
  );
  const mobilePanels = normalizePanelsForMode(
    raw.layouts?.mobile?.panels || {},
    defaults.layouts.mobile.panels
  );
  const activeLayoutMode = SOCIAL_LAYOUT_MODES.includes(raw.layouts?.activeMode)
    ? raw.layouts.activeMode
    : (SOCIAL_LAYOUT_MODES.includes(requestedLayoutMode) ? requestedLayoutMode : 'desktop');
  const panels = activeLayoutMode === 'mobile' ? mobilePanels : desktopPanels;
  const orderedPanels = [...SOCIAL_PANEL_IDS].sort((a, b) => (panels[a]?.order || 0) - (panels[b]?.order || 0));
  // Normalize hero configuration
  const hero = normalizeHeroConfig(raw.hero, defaults.hero || DEFAULT_HERO_CONFIG);
  
  return {
    ...defaults,
    ...raw,
    themePreset,
    accentColorToken,
    globalStyles,
    hero,
    layouts: {
      desktop: { panels: desktopPanels },
      mobile: { panels: mobilePanels },
      activeMode: activeLayoutMode
    },
    panels,
    sectionOrder: orderedPanels,
    hiddenSections: orderedPanels.filter((panelId) => panels[panelId]?.visible === false),
    hiddenModules: Array.isArray(raw.hiddenModules) ? raw.hiddenModules.filter((id) => SOCIAL_MODULE_IDS.includes(id)) : [],
    effective: {
      sectionOrder: orderedPanels,
      visibleSections: orderedPanels.filter((panelId) => panels[panelId]?.visible !== false),
      visibleModules: SOCIAL_MODULE_IDS.filter((id) => !(raw.hiddenModules || []).includes(id)),
      hero,
      panels: orderedPanels.reduce((acc, panelId) => {
        const panel = panels[panelId];
        acc[panelId] = {
          ...panel,
          resolvedStyles: panel.useCustomStyles ? panel.styles : {
            panelColor: globalStyles.panelColor,
            headerColor: globalStyles.headerColor,
            fontFamily: globalStyles.fontFamily,
            fontColor: globalStyles.fontColor,
            fontSizes: globalStyles.fontSizes
          }
        };
        return acc;
      }, {})
    }
  };
};

export const mergeDesignPatch = (base, patch = {}) => {
  const merged = {
    ...base,
    ...patch,
    globalStyles: {
      ...(base.globalStyles || {}),
      ...(patch.globalStyles || {}),
      fontSizes: {
        ...((base.globalStyles && base.globalStyles.fontSizes) || {}),
        ...((patch.globalStyles && patch.globalStyles.fontSizes) || {})
      }
    },
    hero: {
      ...(base.hero || DEFAULT_HERO_CONFIG),
      ...(patch.hero || {})
    },
    panels: { ...(base.panels || {}) },
    layouts: {
      ...(base.layouts || {}),
      ...(patch.layouts || {}),
      desktop: {
        ...((base.layouts && base.layouts.desktop) || {}),
        ...((patch.layouts && patch.layouts.desktop) || {}),
        panels: {
          ...(((base.layouts && base.layouts.desktop) || {}).panels || {}),
          ...(((patch.layouts && patch.layouts.desktop) || {}).panels || {})
        }
      },
      mobile: {
        ...((base.layouts && base.layouts.mobile) || {}),
        ...((patch.layouts && patch.layouts.mobile) || {}),
        panels: {
          ...(((base.layouts && base.layouts.mobile) || {}).panels || {}),
          ...(((patch.layouts && patch.layouts.mobile) || {}).panels || {})
        }
      }
    }
  };

  if (isPlainObject(patch.panels)) {
    Object.entries(patch.panels).forEach(([panelId, value]) => {
      const baseDesktopPanel = base.layouts?.desktop?.panels?.[panelId] || {};
      merged.panels[panelId] = {
        ...((base.panels && base.panels[panelId]) || {}),
        ...(value || {}),
        styles: {
          ...(((base.panels && base.panels[panelId]) || {}).styles || {}),
          ...((value && value.styles) || {})
        }
      };
      merged.layouts.desktop.panels[panelId] = {
        ...baseDesktopPanel,
        ...(value || {}),
        styles: {
          ...(baseDesktopPanel.styles || {}),
          ...((value && value.styles) || {})
        }
      };
    });
  }

  return merged;
};

export const getPanelsByArea = (preferences) => {
  const normalized = normalizeSocialPreferences(preferences);
  const result = { top: [], sideLeft: [], main: [], sideRight: [] };
  normalized.sectionOrder.forEach((panelId) => {
    const panel = normalized.effective.panels[panelId];
    if (!panel || panel.visible === false) return;
    result[panel.area].push({ id: panelId, ...panel });
  });
  return result;
};

export const getFontSizeClass = (token) => ({
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl'
}[token] || 'text-base');

export const getPanelSpanClass = (panel) => {
  if (!panel) return 'col-span-4';
  if (panel.area === 'sideLeft' || panel.area === 'sideRight') {
    const sideHeight = panel.height || (panel.size === 'sidePanelHalfHeight' ? 'halfRow' : 'fullRow');
    if (sideHeight === 'halfRow') return 'min-h-[7rem]';
    if (sideHeight === 'twoRows') return 'min-h-[16rem]';
    if (sideHeight === 'fourRows') return 'min-h-[30rem]';
    return 'min-h-[11rem]';
  }
  if (panel.area === 'top') return 'col-span-4';
  const size = panel.size === 'quarterTile'
    ? 'halfCol'
    : panel.size === 'halfTile'
      ? 'oneCol'
      : panel.size === 'fullTile'
        ? 'twoCols'
        : panel.size;
  if (size === 'halfCol') return 'col-span-1';
  if (size === 'oneCol') return 'col-span-2';
  if (size === 'twoCols') return 'col-span-4';
  if (size === 'threeCols') return 'col-span-6';
  if (size === 'fourCols') return 'col-span-8';
  return 'col-span-4';
};
