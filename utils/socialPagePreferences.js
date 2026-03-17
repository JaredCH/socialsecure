const SOCIAL_THEME_PRESETS = ['default', 'light', 'dark', 'sunset', 'forest'];
const SOCIAL_LAYOUT_MODES = ['desktop', 'mobile'];
const SOCIAL_ACCENT_TOKENS = ['blue', 'violet', 'emerald', 'rose', 'amber'];
const SOCIAL_FONT_FAMILIES = ['Inter', 'Manrope', 'Space Grotesk', 'Merriweather', 'Fira Sans', 'Georgia'];
const SOCIAL_FONT_SIZE_TOKENS = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl'];
const SOCIAL_LAYOUT_AREAS = ['top', 'sideLeft', 'main', 'sideRight'];
const SOCIAL_LAYOUT_SIZES = ['sidePanelFull', 'sidePanelHalfHeight', 'quarterTile', 'halfTile', 'fullTile', 'halfCol', 'oneCol', 'twoCols', 'threeCols', 'fourCols'];
const SOCIAL_LAYOUT_HEIGHTS = ['halfRow', 'fullRow', 'twoRows', 'threeRows', 'fourRows'];
const SOCIAL_MODULE_IDS = ['marketplaceShortcut', 'calendarShortcut', 'settingsShortcut', 'referShortcut', 'chatPanel', 'communityNotes'];
const SOCIAL_PANEL_IDS = [
  'profile_header',
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
const SOCIAL_PRIMARY_SECTION_IDS = ['timeline', 'gallery'];
const SOCIAL_MANDATORY_SECTION_IDS = ['profile_header'];
const SOCIAL_DEFAULT_SECTION_ORDER = [...SOCIAL_PANEL_IDS];
const SOCIAL_PREFERENCES_VERSION = 2;
const LAYOUT_GRID_COLUMNS = 12;
const LAYOUT_GRID_ROWS = 20;
const MEDIA_URL_MAX_LENGTH = 2048;
// 3MB upload limit * 4/3 base64 overhead + small prefix/padding allowance.
const BODY_BG_DATA_URL_MAX_LENGTH = Math.ceil((3 * 1024 * 1024) * 4 / 3) + 64;
const HERO_IMAGE_HISTORY_LIMIT = 3;
const OPTIONAL_SOCIAL_SECTION_IDS = ['blog', 'resume', 'aboutme'];
const SOCIAL_SECTION_AUDIENCES = ['public', 'social', 'secure'];

const LEGACY_SECTION_ID_ALIASES = {
  header: 'profile_header',
  shortcuts: 'shortcuts',
  snapshot: 'snapshot',
  guestLookup: 'guest_lookup',
  composer: 'composer',
  circles: 'circles',
  timeline: 'timeline',
  moderation: 'moderation_status',
  gallery: 'gallery',
  chatPanel: 'chat_panel',
  communityNotes: 'community_notes'
};

const THEME_TO_DEFAULT_ACCENT = {
  default: 'blue',
  light: 'violet',
  dark: 'emerald',
  sunset: 'rose',
  forest: 'emerald'
};

const THEME_TO_ALLOWED_ACCENTS = {
  default: ['blue', 'violet', 'emerald', 'rose'],
  light: ['blue', 'violet', 'emerald'],
  dark: ['blue', 'violet', 'emerald', 'rose', 'amber'],
  sunset: ['rose', 'amber', 'violet'],
  forest: ['emerald', 'blue', 'amber']
};

const BODY_BG_DISPLAY_MODES = ['cover', 'repeat', 'fixed'];
const BODY_BG_OVERLAY_ANIMATIONS = ['none', 'snow', 'easter-eggs', 'halloween-ghosts', 'valentines-hearts', 'fireworks'];

const DEFAULT_GLOBAL_STYLES = Object.freeze({
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
});
const DEFAULT_HERO_CONFIG = Object.freeze({
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
  layout: 'standard',
  backgroundImageUseRandomGallery: false,
  backgroundImageHistory: [],
  profileImage: null,
  profileImageHistory: []
});

const DEFAULT_PANEL_LAYOUTS = Object.freeze({
  profile_header: { area: 'top', size: 'fullTile', height: 'fullRow', order: 0, visible: true, gridPlacement: { row: 15, col: 0 } },
  guest_preview_notice: { area: 'main', size: 'fourCols', height: 'halfRow', order: 0, visible: true, gridPlacement: { row: 0, col: 0 } },
  shortcuts: { area: 'sideLeft', size: 'sidePanelFull', height: 'twoRows', order: 0, visible: true, gridPlacement: { row: 0, col: 8 } },
  snapshot: { area: 'sideLeft', size: 'sidePanelHalfHeight', height: 'fullRow', order: 1, visible: true, gridPlacement: { row: 4, col: 8 } },
  guest_lookup: { area: 'main', size: 'oneCol', height: 'fullRow', order: 1, visible: true, gridPlacement: { row: 1, col: 0 } },
  composer: { area: 'main', size: 'threeCols', height: 'fullRow', order: 2, visible: true, gridPlacement: { row: 1, col: 2 } },
  circles: { area: 'main', size: 'twoCols', height: 'fullRow', order: 3, visible: true, gridPlacement: { row: 3, col: 0 } },
  timeline: { area: 'main', size: 'threeCols', height: 'twoRows', order: 4, visible: true, gridPlacement: { row: 5, col: 0 } },
  moderation_status: { area: 'main', size: 'oneCol', height: 'fullRow', order: 5, visible: true, gridPlacement: { row: 3, col: 4 } },
  gallery: { area: 'main', size: 'threeCols', height: 'twoRows', order: 6, visible: true, gridPlacement: { row: 5, col: 6 } },
  chat_panel: { area: 'sideRight', size: 'sidePanelHalfHeight', height: 'fullRow', order: 0, visible: true, gridPlacement: { row: 0, col: 10 } },
  top_friends: { area: 'sideRight', size: 'sidePanelFull', height: 'twoRows', order: 1, visible: true, gridPlacement: { row: 2, col: 10 } },
  community_notes: { area: 'sideRight', size: 'sidePanelHalfHeight', height: 'fullRow', order: 2, visible: true, gridPlacement: { row: 6, col: 10 } }
});
const DEFAULT_MOBILE_PANEL_LAYOUTS = Object.freeze({
  profile_header: { area: 'top', size: 'fullTile', height: 'fullRow', order: 0, visible: true, gridPlacement: { row: 0, col: 0 } },
  guest_preview_notice: { area: 'main', size: 'fourCols', height: 'halfRow', order: 1, visible: true, gridPlacement: { row: 1, col: 0 } },
  composer: { area: 'main', size: 'fourCols', height: 'fullRow', order: 2, visible: true, gridPlacement: { row: 2, col: 0 } },
  timeline: { area: 'main', size: 'fourCols', height: 'threeRows', order: 3, visible: true, gridPlacement: { row: 4, col: 0 } },
  gallery: { area: 'main', size: 'fourCols', height: 'twoRows', order: 4, visible: true, gridPlacement: { row: 10, col: 0 } },
  chat_panel: { area: 'main', size: 'fourCols', height: 'fullRow', order: 5, visible: true, gridPlacement: { row: 14, col: 0 } },
  top_friends: { area: 'main', size: 'twoCols', height: 'fullRow', order: 6, visible: true, gridPlacement: { row: 16, col: 0 } },
  snapshot: { area: 'main', size: 'twoCols', height: 'fullRow', order: 7, visible: true, gridPlacement: { row: 16, col: 6 } },
  circles: { area: 'main', size: 'fourCols', height: 'fullRow', order: 8, visible: true, gridPlacement: { row: 18, col: 0 } },
  guest_lookup: { area: 'main', size: 'twoCols', height: 'fullRow', order: 9, visible: true, gridPlacement: { row: 17, col: 0 } },
  moderation_status: { area: 'main', size: 'twoCols', height: 'fullRow', order: 10, visible: true, gridPlacement: { row: 17, col: 6 } },
  community_notes: { area: 'main', size: 'fourCols', height: 'halfRow', order: 11, visible: true, gridPlacement: { row: 19, col: 0 } },
  shortcuts: { area: 'main', size: 'fourCols', height: 'halfRow', order: 12, visible: true, gridPlacement: { row: 19, col: 6 } }
});

const SOCIAL_DESIGN_TEMPLATES = Object.freeze([
  {
    id: 'aurora-glass',
    name: 'Aurora Glass',
    description: 'Soft glass cards with cool neon accents.',
    design: {
      themePreset: 'dark',
      accentColorToken: 'violet',
      globalStyles: {
        panelColor: '#111827',
        headerColor: '#7c3aed',
        fontFamily: 'Space Grotesk',
        fontColor: '#f8fafc',
        pageBackgroundColor: '#020617',
        fontSizes: { header: '2xl', subHeader: 'xl', regular: 'base', small: 'sm' }
      },
      panels: {
        timeline: {
          size: 'fullTile',
          useCustomStyles: true,
          styles: { panelColor: '#0f172a', headerColor: '#4f46e5', fontColor: '#e2e8f0' }
        },
        gallery: {
          size: 'halfTile',
          useCustomStyles: true,
          styles: { panelColor: '#111827', headerColor: '#0ea5e9', fontColor: '#e2e8f0' }
        }
      }
    }
  },
  {
    id: 'sunset-editorial',
    name: 'Sunset Editorial',
    description: 'Warm editorial styling with bold section headers.',
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
  },
  {
    id: 'forest-board',
    name: 'Forest Board',
    description: 'Deep greens, strong cards, and dashboard-friendly spacing.',
    design: {
      themePreset: 'forest',
      accentColorToken: 'emerald',
      globalStyles: {
        panelColor: '#ecfdf5',
        headerColor: '#065f46',
        fontFamily: 'Manrope',
        fontColor: '#064e3b',
        pageBackgroundColor: '#f0fdf4',
        fontSizes: { header: '2xl', subHeader: 'lg', regular: 'base', small: 'sm' }
      },
      panels: {
        shortcuts: { size: 'sidePanelHalfHeight' },
        snapshot: { size: 'sidePanelHalfHeight' },
        top_friends: {
          useCustomStyles: true,
          styles: { panelColor: '#d1fae5', headerColor: '#047857', fontColor: '#064e3b' }
        }
      }
    }
  },
  {
    id: 'clean-studio',
    name: 'Clean Studio',
    description: 'Minimal, bright, and optimized for content-heavy layouts.',
    design: {
      themePreset: 'light',
      accentColorToken: 'blue',
      globalStyles: {
        panelColor: '#ffffff',
        headerColor: '#2563eb',
        fontFamily: 'Inter',
        fontColor: '#1f2937',
        pageBackgroundColor: '#f8fafc',
        fontSizes: { header: 'xl', subHeader: 'lg', regular: 'base', small: 'sm' }
      },
      panels: {
        composer: { size: 'halfTile' },
        circles: { size: 'halfTile' },
        timeline: { size: 'fullTile' },
        gallery: { size: 'fullTile' }
      }
    }
  }
]);

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const uniqueStrings = (value) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
};

const normalizeEnabledSections = (value = {}, fallback = {}) => OPTIONAL_SOCIAL_SECTION_IDS.reduce((acc, sectionId) => {
  const next = Object.prototype.hasOwnProperty.call(value || {}, sectionId)
    ? value[sectionId]
    : fallback[sectionId];
  acc[sectionId] = next === true;
  return acc;
}, {});

const normalizeSectionAudience = (value = {}, fallback = {}) => OPTIONAL_SOCIAL_SECTION_IDS.reduce((acc, sectionId) => {
  const requested = Object.prototype.hasOwnProperty.call(value || {}, sectionId)
    ? value[sectionId]
    : fallback[sectionId];
  acc[sectionId] = SOCIAL_SECTION_AUDIENCES.includes(requested) ? requested : 'social';
  return acc;
}, {});

const normalizeHexColor = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return /^#([0-9a-fA-F]{3,8})$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
};

const normalizeFontFamily = (value, fallback = DEFAULT_GLOBAL_STYLES.fontFamily) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return SOCIAL_FONT_FAMILIES.includes(trimmed) ? trimmed : fallback;
};

const normalizeFontSizeToken = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return SOCIAL_FONT_SIZE_TOKENS.includes(trimmed) ? trimmed : fallback;
};

const normalizeFontSizeMap = (value = {}, fallback = DEFAULT_GLOBAL_STYLES.fontSizes) => ({
  header: normalizeFontSizeToken(value.header, fallback.header),
  subHeader: normalizeFontSizeToken(value.subHeader, fallback.subHeader),
  regular: normalizeFontSizeToken(value.regular, fallback.regular),
  small: normalizeFontSizeToken(value.small, fallback.small)
});

const normalizePanelId = (panelId) => {
  if (typeof panelId !== 'string') return null;
  const trimmed = panelId.trim();
  return SOCIAL_PANEL_IDS.includes(trimmed) ? trimmed : (LEGACY_SECTION_ID_ALIASES[trimmed] || null);
};

const normalizeArea = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return SOCIAL_LAYOUT_AREAS.includes(trimmed) ? trimmed : fallback;
};

const normalizeSizeForArea = (size, area, fallback) => {
  const requested = typeof size === 'string' && SOCIAL_LAYOUT_SIZES.includes(size.trim()) ? size.trim() : fallback;
  const legacyToModern = {
    quarterTile: 'halfCol',
    halfTile: 'oneCol',
    fullTile: 'twoCols'
  };

  if (area === 'sideLeft' || area === 'sideRight') {
    if (requested === 'sidePanelHalfHeight' || requested === 'quarterTile') return 'sidePanelHalfHeight';
    return 'sidePanelFull';
  }

  if (area === 'top') {
    return 'fullTile';
  }

  const normalized = legacyToModern[requested] || requested;
  const fallbackNormalized = legacyToModern[fallback] || fallback;
  return ['halfCol', 'oneCol', 'twoCols', 'threeCols', 'fourCols'].includes(normalized)
    ? normalized
    : fallbackNormalized;
};

const normalizeHeightForArea = (height, area, fallback, sizeToken) => {
  if (area === 'top') return 'fullRow';

  if (area === 'sideLeft' || area === 'sideRight') {
    const fallbackHeight = sizeToken === 'sidePanelHalfHeight'
      ? 'halfRow'
      : sizeToken === 'sidePanelFull'
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

const buildDefaultPanels = () => SOCIAL_PANEL_IDS.reduce((acc, panelId) => {
  const defaults = DEFAULT_PANEL_LAYOUTS[panelId];
  acc[panelId] = {
    area: defaults.area,
    size: defaults.size,
    height: defaults.height,
    order: defaults.order,
    visible: defaults.visible,
    gridPlacement: defaults.gridPlacement ? { ...defaults.gridPlacement } : undefined,
    useCustomStyles: false,
    styles: {}
  };
  return acc;
}, {});
const buildDefaultPanelsForMode = (mode = 'desktop') => SOCIAL_PANEL_IDS.reduce((acc, panelId) => {
  const defaults = (mode === 'mobile' ? DEFAULT_MOBILE_PANEL_LAYOUTS : DEFAULT_PANEL_LAYOUTS)[panelId]
    || DEFAULT_PANEL_LAYOUTS[panelId];
  acc[panelId] = {
    area: defaults.area,
    size: defaults.size,
    height: defaults.height,
    order: defaults.order,
    visible: defaults.visible,
    gridPlacement: defaults.gridPlacement ? { ...defaults.gridPlacement } : undefined,
    useCustomStyles: false,
    styles: {}
  };
  return acc;
}, {});

const buildDefaultSocialPagePreferences = (profileTheme = 'default') => {
  const resolvedThemePreset = SOCIAL_THEME_PRESETS.includes(profileTheme) ? profileTheme : 'default';
  const desktopPanels = buildDefaultPanelsForMode('desktop');
  const mobilePanels = buildDefaultPanelsForMode('mobile');
  return {
    themePreset: resolvedThemePreset,
    accentColorToken: THEME_TO_DEFAULT_ACCENT[resolvedThemePreset] || 'blue',
    sectionOrder: [...SOCIAL_DEFAULT_SECTION_ORDER],
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
    panels: desktopPanels,
    layouts: {
      desktop: { panels: desktopPanels },
      mobile: { panels: mobilePanels },
      activeMode: 'desktop'
    },
    activeConfigId: null,
    enabledSections: normalizeEnabledSections(),
    sectionAudience: normalizeSectionAudience(),
    aboutMeContent: '',
    version: SOCIAL_PREFERENCES_VERSION
  };
};

const mergeDesignPatch = (base, patch = {}) => {
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
      ...(base.hero || {}),
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
    for (const [panelId, panelPatch] of Object.entries(patch.panels)) {
      const baseDesktopPanel = base.layouts?.desktop?.panels?.[panelId] || {};
      merged.panels[panelId] = {
        ...((base.panels && base.panels[panelId]) || {}),
        ...(panelPatch || {}),
        styles: {
          ...(((base.panels && base.panels[panelId]) || {}).styles || {}),
          ...((panelPatch && panelPatch.styles) || {})
        }
      };
      merged.layouts.desktop.panels[panelId] = {
        ...baseDesktopPanel,
        ...(panelPatch || {}),
        styles: {
          ...(baseDesktopPanel.styles || {}),
          ...((panelPatch && panelPatch.styles) || {})
        }
      };
    }
  }

  return merged;
};

const applyLegacyOrdering = (targetPanels, sectionOrder = [], hiddenSections = []) => {
  const orderedPanels = uniqueStrings(sectionOrder)
    .map(normalizePanelId)
    .filter(Boolean);
  const completeOrder = [...orderedPanels, ...SOCIAL_PANEL_IDS.filter((panelId) => !orderedPanels.includes(panelId))];

  completeOrder.forEach((panelId, index) => {
    if (targetPanels[panelId]) {
      targetPanels[panelId].order = index;
    }
  });

  uniqueStrings(hiddenSections)
    .map(normalizePanelId)
    .filter(Boolean)
    .forEach((panelId) => {
      if (targetPanels[panelId] && !SOCIAL_MANDATORY_SECTION_IDS.includes(panelId)) {
        targetPanels[panelId].visible = false;
      }
    });
};

const deriveLegacySectionData = (panels) => {
  const sectionOrder = SOCIAL_PANEL_IDS
    .map((panelId) => ({ panelId, order: Number.isFinite(Number(panels[panelId]?.order)) ? Number(panels[panelId].order) : 999 }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.panelId);

  const hiddenSections = sectionOrder.filter((panelId) => panels[panelId]?.visible === false);
  return { sectionOrder, hiddenSections };
};

const normalizePanelStyles = (styles = {}, fallback = DEFAULT_GLOBAL_STYLES) => ({
  panelColor: normalizeHexColor(styles.panelColor, fallback.panelColor),
  headerColor: normalizeHexColor(styles.headerColor, fallback.headerColor),
  fontFamily: normalizeFontFamily(styles.fontFamily, fallback.fontFamily),
  fontColor: normalizeHexColor(styles.fontColor, fallback.fontColor),
  fontSizes: normalizeFontSizeMap(styles.fontSizes, fallback.fontSizes)
});

const normalizePanelEntry = (rawPanel = {}, defaults, globalStyles = DEFAULT_GLOBAL_STYLES) => {
  const area = normalizeArea(rawPanel.area, defaults.area);
  return {
    area,
    size: normalizeSizeForArea(rawPanel.size, area, defaults.size),
    height: normalizeHeightForArea(rawPanel.height, area, defaults.height, rawPanel.size),
    order: Number.isFinite(Number(rawPanel.order)) ? Number(rawPanel.order) : defaults.order,
    visible: rawPanel.visible !== false,
    gridPlacement: normalizeGridPlacement(rawPanel.gridPlacement, defaults.gridPlacement),
    useCustomStyles: Boolean(rawPanel.useCustomStyles),
    styles: normalizePanelStyles(rawPanel.styles || {}, globalStyles)
  };
};

const normalizeMediaUrl = (value, fallback = null) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MEDIA_URL_MAX_LENGTH) return fallback;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
};

const normalizeBodyBackgroundImageUrl = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (/^\/uploads\/backgrounds\/[a-f0-9]+\/[a-f0-9]+-[a-f0-9]+\.\w{2,5}$/.test(trimmed)) {
    return trimmed;
  }
  if (
    /^data:image\/(?:jpeg|jpg|png|gif|webp);base64,[a-z0-9+/=]+$/i.test(trimmed)
    && trimmed.length <= BODY_BG_DATA_URL_MAX_LENGTH
  ) {
    return trimmed;
  }
  if (trimmed.length > MEDIA_URL_MAX_LENGTH) return fallback;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
};

const normalizeBodyBackgroundOverlay = (value, fallback = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, Math.round(num * 20) / 20));
};

const normalizeBodyBackgroundBlur = (value, fallback = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(20, Math.round(num)));
};

const normalizeHeroImageHistory = (value, currentValue) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  const normalizedCurrent = typeof currentValue === 'string' ? currentValue.toLowerCase() : '';
  for (const item of value) {
    const normalizedUrl = normalizeMediaUrl(item, null);
    if (!normalizedUrl) continue;
    const dedupeKey = normalizedUrl.toLowerCase();
    if (dedupeKey === normalizedCurrent || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(normalizedUrl);
    if (normalized.length >= HERO_IMAGE_HISTORY_LIMIT) break;
  }
  return normalized;
};

const normalizeHeroConfig = (value = {}, fallback = DEFAULT_HERO_CONFIG) => {
  const backgroundImage = normalizeMediaUrl(value.backgroundImage, fallback.backgroundImage);
  const profileImage = normalizeMediaUrl(value.profileImage, fallback.profileImage);
  return {
    backgroundColor: normalizeHexColor(value.backgroundColor, fallback.backgroundColor),
    backgroundImage,
    textColor: normalizeHexColor(value.textColor, fallback.textColor),
    nameColor: normalizeHexColor(value.nameColor, fallback.nameColor),
    locationColor: normalizeHexColor(value.locationColor, fallback.locationColor),
    menuTextColor: normalizeHexColor(value.menuTextColor, fallback.menuTextColor),
    menuActiveColor: normalizeHexColor(value.menuActiveColor, fallback.menuActiveColor),
    fontFamily: normalizeFontFamily(value.fontFamily, fallback.fontFamily),
    avatarSize: ['sm', 'md', 'lg', 'xl'].includes(value.avatarSize) ? value.avatarSize : fallback.avatarSize,
    showLocation: value.showLocation !== undefined ? Boolean(value.showLocation) : fallback.showLocation,
    showOnlineStatus: value.showOnlineStatus !== undefined ? Boolean(value.showOnlineStatus) : fallback.showOnlineStatus,
    showNavigation: value.showNavigation !== undefined ? Boolean(value.showNavigation) : fallback.showNavigation,
    activeTab: ['main', 'friends', 'gallery', 'chat', 'calendar'].includes(value.activeTab) ? value.activeTab : fallback.activeTab,
    layout: ['standard', 'compact', 'expanded'].includes(value.layout) ? value.layout : fallback.layout,
    backgroundImageUseRandomGallery: value.backgroundImageUseRandomGallery !== undefined
      ? Boolean(value.backgroundImageUseRandomGallery)
      : fallback.backgroundImageUseRandomGallery,
    backgroundImageHistory: normalizeHeroImageHistory(value.backgroundImageHistory, backgroundImage),
    profileImage,
    profileImageHistory: normalizeHeroImageHistory(value.profileImageHistory, profileImage)
  };
};

const normalizeSocialPagePreferences = (input, {
  profileTheme = 'default',
  strict = false,
  layoutMode = 'desktop'
} = {}) => {
  const defaults = buildDefaultSocialPagePreferences(profileTheme);
  const raw = isPlainObject(input) ? input : {};

  const themePreset = typeof raw.themePreset === 'string' && SOCIAL_THEME_PRESETS.includes(raw.themePreset.trim())
    ? raw.themePreset.trim()
    : defaults.themePreset;
  const allowedAccents = THEME_TO_ALLOWED_ACCENTS[themePreset] || THEME_TO_ALLOWED_ACCENTS.default;
  const requestedAccent = typeof raw.accentColorToken === 'string' ? raw.accentColorToken.trim() : '';
  const accentColorToken = allowedAccents.includes(requestedAccent)
    ? requestedAccent
    : (allowedAccents.includes(defaults.accentColorToken) ? defaults.accentColorToken : allowedAccents[0]);

  const hiddenModules = uniqueStrings(raw.hiddenModules).filter((moduleId) => SOCIAL_MODULE_IDS.includes(moduleId));
  const desktopPanels = buildDefaultPanelsForMode('desktop');
  const mobilePanels = buildDefaultPanelsForMode('mobile');
  const requestedLegacyOrder = uniqueStrings(raw.sectionOrder || raw.effective?.sectionOrder);
  const requestedLegacyHidden = uniqueStrings(raw.hiddenSections);

  const requestedPanelKeys = isPlainObject(raw.panels) ? Object.keys(raw.panels) : [];
  const requestedDesktopPanelKeys = isPlainObject(raw.layouts?.desktop?.panels) ? Object.keys(raw.layouts.desktop.panels) : [];
  const requestedMobilePanelKeys = isPlainObject(raw.layouts?.mobile?.panels) ? Object.keys(raw.layouts.mobile.panels) : [];
  if (strict) {
    const unknownPanelKey = requestedPanelKeys.find((panelId) => !normalizePanelId(panelId));
    if (unknownPanelKey) {
      return { error: `Unknown panel ID: ${unknownPanelKey}` };
    }
    const unknownLegacyOrder = requestedLegacyOrder.find((panelId) => !normalizePanelId(panelId));
    if (unknownLegacyOrder) {
      return { error: `Unknown section ID: ${unknownLegacyOrder}` };
    }
    const unknownLegacyHidden = requestedLegacyHidden.find((panelId) => !normalizePanelId(panelId));
    if (unknownLegacyHidden) {
      return { error: `Unknown hidden section ID: ${unknownLegacyHidden}` };
    }
    const unknownDesktopPanelKey = requestedDesktopPanelKeys.find((panelId) => !normalizePanelId(panelId));
    if (unknownDesktopPanelKey) {
      return { error: `Unknown desktop panel ID: ${unknownDesktopPanelKey}` };
    }
    const unknownMobilePanelKey = requestedMobilePanelKeys.find((panelId) => !normalizePanelId(panelId));
    if (unknownMobilePanelKey) {
      return { error: `Unknown mobile panel ID: ${unknownMobilePanelKey}` };
    }
  }

  applyLegacyOrdering(desktopPanels, requestedLegacyOrder, requestedLegacyHidden);
  applyLegacyOrdering(mobilePanels, requestedLegacyOrder, requestedLegacyHidden);

  if (isPlainObject(raw.panels)) {
    for (const [rawPanelId, panelConfig] of Object.entries(raw.panels)) {
      const panelId = normalizePanelId(rawPanelId);
      if (!panelId || !desktopPanels[panelId]) continue;
      desktopPanels[panelId] = normalizePanelEntry(panelConfig, {
        ...DEFAULT_PANEL_LAYOUTS[panelId],
        ...(desktopPanels[panelId] || {})
      });
    }
  }

  if (isPlainObject(raw.layouts?.desktop?.panels)) {
    for (const [rawPanelId, panelConfig] of Object.entries(raw.layouts.desktop.panels)) {
      const panelId = normalizePanelId(rawPanelId);
      if (!panelId || !desktopPanels[panelId]) continue;
      desktopPanels[panelId] = normalizePanelEntry(panelConfig, {
        ...DEFAULT_PANEL_LAYOUTS[panelId],
        ...(desktopPanels[panelId] || {})
      });
    }
  }

  if (isPlainObject(raw.layouts?.mobile?.panels)) {
    for (const [rawPanelId, panelConfig] of Object.entries(raw.layouts.mobile.panels)) {
      const panelId = normalizePanelId(rawPanelId);
      if (!panelId || !mobilePanels[panelId]) continue;
      mobilePanels[panelId] = normalizePanelEntry(panelConfig, {
        ...(DEFAULT_MOBILE_PANEL_LAYOUTS[panelId] || DEFAULT_PANEL_LAYOUTS[panelId]),
        ...(mobilePanels[panelId] || {})
      });
    }
  }

  for (const mandatoryPanelId of SOCIAL_MANDATORY_SECTION_IDS) {
    desktopPanels[mandatoryPanelId].visible = true;
    mobilePanels[mandatoryPanelId].visible = true;
  }

  const visiblePrimaryCount = SOCIAL_PRIMARY_SECTION_IDS.filter((panelId) => desktopPanels[panelId]?.visible !== false).length;
  if (visiblePrimaryCount === 0) {
    if (strict) {
      return { error: 'At least one primary section must remain visible' };
    }
    desktopPanels[SOCIAL_PRIMARY_SECTION_IDS[0]].visible = true;
  }

  const visibleMobilePrimaryCount = SOCIAL_PRIMARY_SECTION_IDS.filter((panelId) => mobilePanels[panelId]?.visible !== false).length;
  if (visibleMobilePrimaryCount === 0) {
    if (strict) {
      return { error: 'At least one primary section must remain visible for mobile layout' };
    }
    mobilePanels[SOCIAL_PRIMARY_SECTION_IDS[0]].visible = true;
  }

  const globalStyles = {
    panelColor: normalizeHexColor(raw.globalStyles?.panelColor, DEFAULT_GLOBAL_STYLES.panelColor),
    headerColor: normalizeHexColor(raw.globalStyles?.headerColor, DEFAULT_GLOBAL_STYLES.headerColor),
    fontFamily: normalizeFontFamily(raw.globalStyles?.fontFamily, DEFAULT_GLOBAL_STYLES.fontFamily),
    fontColor: normalizeHexColor(raw.globalStyles?.fontColor, DEFAULT_GLOBAL_STYLES.fontColor),
    pageBackgroundColor: normalizeHexColor(raw.globalStyles?.pageBackgroundColor, DEFAULT_GLOBAL_STYLES.pageBackgroundColor),
    fontSizes: normalizeFontSizeMap(raw.globalStyles?.fontSizes, DEFAULT_GLOBAL_STYLES.fontSizes),
    bodyBackgroundImage: normalizeBodyBackgroundImageUrl(raw.globalStyles?.bodyBackgroundImage, DEFAULT_GLOBAL_STYLES.bodyBackgroundImage),
    bodyBackgroundOverlay: normalizeBodyBackgroundOverlay(raw.globalStyles?.bodyBackgroundOverlay, DEFAULT_GLOBAL_STYLES.bodyBackgroundOverlay),
    bodyBackgroundGrain: normalizeBodyBackgroundOverlay(raw.globalStyles?.bodyBackgroundGrain, DEFAULT_GLOBAL_STYLES.bodyBackgroundGrain),
    bodyBackgroundBlur: normalizeBodyBackgroundBlur(raw.globalStyles?.bodyBackgroundBlur, DEFAULT_GLOBAL_STYLES.bodyBackgroundBlur),
    bodyBackgroundDisplayMode: BODY_BG_DISPLAY_MODES.includes(raw.globalStyles?.bodyBackgroundDisplayMode) ? raw.globalStyles.bodyBackgroundDisplayMode : DEFAULT_GLOBAL_STYLES.bodyBackgroundDisplayMode,
    bodyBackgroundOverlayAnimation: BODY_BG_OVERLAY_ANIMATIONS.includes(raw.globalStyles?.bodyBackgroundOverlayAnimation) ? raw.globalStyles.bodyBackgroundOverlayAnimation : DEFAULT_GLOBAL_STYLES.bodyBackgroundOverlayAnimation
  };
  const hero = normalizeHeroConfig(raw.hero, defaults.hero || DEFAULT_HERO_CONFIG);
  const enabledSections = normalizeEnabledSections(raw.enabledSections, defaults.enabledSections);
  const sectionAudience = normalizeSectionAudience(raw.sectionAudience, defaults.sectionAudience);
  const aboutMeContent = typeof raw.aboutMeContent === 'string'
    ? raw.aboutMeContent
    : defaults.aboutMeContent;

  const requestedMode = SOCIAL_LAYOUT_MODES.includes(layoutMode) ? layoutMode : 'desktop';
  const activeLayoutMode = SOCIAL_LAYOUT_MODES.includes(raw.layouts?.activeMode)
    ? raw.layouts.activeMode
    : requestedMode;
  const sourcePanels = activeLayoutMode === 'mobile' ? mobilePanels : desktopPanels;
  const effectivePanels = {};
  for (const panelId of SOCIAL_PANEL_IDS) {
    const basePanel = sourcePanels[panelId] || normalizePanelEntry({}, DEFAULT_PANEL_LAYOUTS[panelId]);
    effectivePanels[panelId] = {
      ...basePanel,
      resolvedStyles: basePanel.useCustomStyles ? normalizePanelStyles(basePanel.styles, globalStyles) : globalStyles
    };
  }

  const normalizeResolvedPanels = (panelsByMode) => {
    const resolved = {};
    for (const panelId of SOCIAL_PANEL_IDS) {
      const basePanel = panelsByMode[panelId] || normalizePanelEntry({}, DEFAULT_PANEL_LAYOUTS[panelId]);
      resolved[panelId] = {
        ...basePanel,
        resolvedStyles: basePanel.useCustomStyles ? normalizePanelStyles(basePanel.styles, globalStyles) : globalStyles
      };
    }
    return resolved;
  };

  const desktopResolvedPanels = normalizeResolvedPanels(desktopPanels);
  const mobileResolvedPanels = normalizeResolvedPanels(mobilePanels);
  const { sectionOrder, hiddenSections } = deriveLegacySectionData(effectivePanels);
  const value = {
    themePreset,
    accentColorToken,
    sectionOrder,
    hiddenSections,
    hiddenModules,
    globalStyles,
    hero,
    panels: effectivePanels,
    layouts: {
      desktop: { panels: desktopResolvedPanels },
      mobile: { panels: mobileResolvedPanels },
      activeMode: activeLayoutMode
    },
    activeConfigId: raw.activeConfigId ? String(raw.activeConfigId) : null,
    enabledSections,
    sectionAudience,
    aboutMeContent,
    version: Number.isInteger(raw.version) && raw.version > 0 ? raw.version : SOCIAL_PREFERENCES_VERSION,
    effective: {
      sectionOrder,
      visibleSections: sectionOrder.filter((panelId) => effectivePanels[panelId]?.visible !== false),
      visibleModules: SOCIAL_MODULE_IDS.filter((moduleId) => !hiddenModules.includes(moduleId)),
      panels: effectivePanels
    }
  };

  return { value };
};

const toPublicSocialPagePreferences = (input, options = {}) => {
  const normalized = normalizeSocialPagePreferences(input, options);
  if (normalized.error || !normalized.value) {
    return buildDefaultSocialPagePreferences(options.profileTheme);
  }
  return normalized.value;
};

module.exports = {
  SOCIAL_THEME_PRESETS,
  SOCIAL_LAYOUT_MODES,
  SOCIAL_ACCENT_TOKENS,
  SOCIAL_FONT_FAMILIES,
  SOCIAL_FONT_SIZE_TOKENS,
  SOCIAL_LAYOUT_AREAS,
  SOCIAL_LAYOUT_SIZES,
  SOCIAL_LAYOUT_HEIGHTS,
  SOCIAL_MODULE_IDS,
  SOCIAL_PANEL_IDS,
  SOCIAL_PRIMARY_SECTION_IDS,
  SOCIAL_MANDATORY_SECTION_IDS,
  SOCIAL_DEFAULT_SECTION_ORDER,
  SOCIAL_PREFERENCES_VERSION,
  THEME_TO_ALLOWED_ACCENTS,
  THEME_TO_DEFAULT_ACCENT,
  SOCIAL_DESIGN_TEMPLATES,
  DEFAULT_GLOBAL_STYLES,
  DEFAULT_HERO_CONFIG,
  DEFAULT_PANEL_LAYOUTS,
  BODY_BG_DISPLAY_MODES,
  BODY_BG_OVERLAY_ANIMATIONS,
  buildDefaultSocialPagePreferences,
  mergeDesignPatch,
  normalizeSocialPagePreferences,
  toPublicSocialPagePreferences
};
