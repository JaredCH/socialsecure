export const SOCIAL_THEME_PRESETS = ['default', 'light', 'dark', 'sunset', 'forest'];
export const SOCIAL_FONT_FAMILIES = ['Inter', 'Manrope', 'Space Grotesk', 'Merriweather', 'Fira Sans', 'Georgia'];
export const SOCIAL_FONT_SIZE_TOKENS = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl'];
export const SOCIAL_LAYOUT_AREAS = ['top', 'sideLeft', 'main', 'sideRight'];
export const SOCIAL_LAYOUT_SIZES = ['sidePanelFull', 'sidePanelHalfHeight', 'quarterTile', 'halfTile', 'fullTile', 'halfCol', 'oneCol', 'twoCols', 'threeCols', 'fourCols'];
export const SOCIAL_LAYOUT_HEIGHTS = ['halfRow', 'fullRow', 'twoRows', 'threeRows', 'fourRows'];
export const SOCIAL_MODULE_IDS = ['marketplaceShortcut', 'calendarShortcut', 'settingsShortcut', 'referShortcut', 'chatPanel', 'communityNotes'];
export const SOCIAL_PANEL_IDS = [
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

export const SOCIAL_PANEL_LABELS = {
  profile_header: 'Profile Header',
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
      community_notes: { area: 'sideRight', size: 'sidePanelHalfHeight', height: 'fullRow', order: 2, gridPlacement: { row: 6, col: 10 }, visible: true },
      profile_header: { area: 'top', size: 'fullTile', height: 'fullRow', order: 0, gridPlacement: { row: 15, col: 0 }, visible: true }
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
      community_notes: { area: 'sideRight', size: 'sidePanelHalfHeight', height: 'fullRow', order: 2, gridPlacement: { row: 6, col: 10 }, visible: true },
      profile_header: { area: 'top', size: 'fullTile', height: 'fullRow', order: 0, gridPlacement: { row: 15, col: 0 }, visible: true }
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
      community_notes: { area: 'sideRight', size: 'sidePanelHalfHeight', height: 'fullRow', order: 2, gridPlacement: { row: 6, col: 10 }, visible: true },
      profile_header: { area: 'top', size: 'fullTile', height: 'fullRow', order: 0, gridPlacement: { row: 15, col: 0 }, visible: true }
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
  }
};

const BALANCED_LAYOUT_PRESET = SOCIAL_LAYOUT_PRESETS.find((preset) => preset.id === 'balanced')
  || SOCIAL_LAYOUT_PRESETS[0]
  || { panels: {} };

export const DEFAULT_PANEL_LAYOUTS = BALANCED_LAYOUT_PRESET.panels;

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
  activeConfigId: null,
  version: 2
});

export const normalizeSocialPreferences = (input, profileTheme = 'default') => {
  const defaults = buildDefaultSocialPreferences(profileTheme);
  const raw = isPlainObject(input) ? input : {};
  const themePreset = SOCIAL_THEME_PRESETS.includes(raw.themePreset) ? raw.themePreset : defaults.themePreset;
  const allowedAccents = THEME_TO_ALLOWED_ACCENTS[themePreset] || THEME_TO_ALLOWED_ACCENTS.default;
  const accentColorToken = allowedAccents.includes(raw.accentColorToken)
    ? raw.accentColorToken
    : (allowedAccents.includes(defaults.accentColorToken) ? defaults.accentColorToken : allowedAccents[0]);
  const globalStyles = {
    panelColor: isHex(raw.globalStyles?.panelColor || '') ? raw.globalStyles.panelColor : DEFAULT_GLOBAL_STYLES.panelColor,
    headerColor: isHex(raw.globalStyles?.headerColor || '') ? raw.globalStyles.headerColor : DEFAULT_GLOBAL_STYLES.headerColor,
    fontFamily: SOCIAL_FONT_FAMILIES.includes(raw.globalStyles?.fontFamily) ? raw.globalStyles.fontFamily : DEFAULT_GLOBAL_STYLES.fontFamily,
    fontColor: isHex(raw.globalStyles?.fontColor || '') ? raw.globalStyles.fontColor : DEFAULT_GLOBAL_STYLES.fontColor,
    pageBackgroundColor: isHex(raw.globalStyles?.pageBackgroundColor || '') ? raw.globalStyles.pageBackgroundColor : DEFAULT_GLOBAL_STYLES.pageBackgroundColor,
    fontSizes: normalizeFontSizes(raw.globalStyles?.fontSizes)
  };
  const panels = { ...defaults.panels };
  SOCIAL_PANEL_IDS.forEach((panelId) => {
    const panelRaw = raw.panels?.[panelId] || {};
    const area = SOCIAL_LAYOUT_AREAS.includes(panelRaw.area) ? panelRaw.area : defaults.panels[panelId].area;
    panels[panelId] = {
      area,
      order: Number.isFinite(Number(panelRaw.order)) ? Number(panelRaw.order) : defaults.panels[panelId].order,
      visible: panelRaw.visible !== false,
      size: normalizeSizeForArea(panelRaw.size, area, defaults.panels[panelId].size),
      height: normalizeHeightForArea(panelRaw.height, area, defaults.panels[panelId].height, panelRaw.size),
      gridPlacement: normalizeGridPlacement(panelRaw.gridPlacement, defaults.panels[panelId].gridPlacement),
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

  const orderedPanels = [...SOCIAL_PANEL_IDS].sort((a, b) => (panels[a]?.order || 0) - (panels[b]?.order || 0));
  return {
    ...defaults,
    ...raw,
    themePreset,
    accentColorToken,
    globalStyles,
    panels,
    sectionOrder: orderedPanels,
    hiddenSections: orderedPanels.filter((panelId) => panels[panelId]?.visible === false),
    hiddenModules: Array.isArray(raw.hiddenModules) ? raw.hiddenModules.filter((id) => SOCIAL_MODULE_IDS.includes(id)) : [],
    effective: {
      sectionOrder: orderedPanels,
      visibleSections: orderedPanels.filter((panelId) => panels[panelId]?.visible !== false),
      visibleModules: SOCIAL_MODULE_IDS.filter((id) => !(raw.hiddenModules || []).includes(id)),
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
    panels: { ...(base.panels || {}) }
  };

  if (isPlainObject(patch.panels)) {
    Object.entries(patch.panels).forEach(([panelId, value]) => {
      merged.panels[panelId] = {
        ...((base.panels && base.panels[panelId]) || {}),
        ...(value || {}),
        styles: {
          ...(((base.panels && base.panels[panelId]) || {}).styles || {}),
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
