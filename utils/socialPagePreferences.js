const SOCIAL_THEME_PRESETS = ['default', 'light', 'dark', 'sunset', 'forest'];
const SOCIAL_ACCENT_TOKENS = ['blue', 'violet', 'emerald', 'rose', 'amber'];
const SOCIAL_FONT_FAMILIES = ['Inter', 'Manrope', 'Space Grotesk', 'Merriweather', 'Fira Sans', 'Georgia'];
const SOCIAL_FONT_SIZE_TOKENS = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl'];
const SOCIAL_LAYOUT_AREAS = ['top', 'sideLeft', 'main', 'sideRight'];
const SOCIAL_LAYOUT_SIZES = ['sidePanelFull', 'sidePanelHalfHeight', 'quarterTile', 'halfTile', 'fullTile'];
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
  }
});

const DEFAULT_PANEL_LAYOUTS = Object.freeze({
  profile_header: { area: 'top', size: 'fullTile', order: 0, visible: true },
  guest_preview_notice: { area: 'top', size: 'fullTile', order: 1, visible: true },
  shortcuts: { area: 'sideLeft', size: 'sidePanelFull', order: 0, visible: true },
  snapshot: { area: 'sideLeft', size: 'sidePanelHalfHeight', order: 1, visible: true },
  guest_lookup: { area: 'main', size: 'halfTile', order: 0, visible: true },
  composer: { area: 'main', size: 'fullTile', order: 1, visible: true },
  circles: { area: 'main', size: 'halfTile', order: 2, visible: true },
  timeline: { area: 'main', size: 'fullTile', order: 3, visible: true },
  moderation_status: { area: 'main', size: 'halfTile', order: 4, visible: true },
  gallery: { area: 'main', size: 'fullTile', order: 5, visible: true },
  chat_panel: { area: 'sideRight', size: 'sidePanelHalfHeight', order: 0, visible: true },
  top_friends: { area: 'sideRight', size: 'sidePanelFull', order: 1, visible: true },
  community_notes: { area: 'sideRight', size: 'sidePanelHalfHeight', order: 2, visible: true }
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

  if (area === 'sideLeft' || area === 'sideRight') {
    if (requested === 'sidePanelFull' || requested === 'sidePanelHalfHeight') {
      return requested;
    }
    return requested === 'quarterTile' ? 'sidePanelHalfHeight' : 'sidePanelFull';
  }

  if (area === 'top') {
    return 'fullTile';
  }

  return ['quarterTile', 'halfTile', 'fullTile'].includes(requested) ? requested : 'fullTile';
};

const buildDefaultPanels = () => SOCIAL_PANEL_IDS.reduce((acc, panelId) => {
  const defaults = DEFAULT_PANEL_LAYOUTS[panelId];
  acc[panelId] = {
    area: defaults.area,
    size: defaults.size,
    order: defaults.order,
    visible: defaults.visible,
    useCustomStyles: false,
    styles: {}
  };
  return acc;
}, {});

const buildDefaultSocialPagePreferences = (profileTheme = 'default') => {
  const resolvedThemePreset = SOCIAL_THEME_PRESETS.includes(profileTheme) ? profileTheme : 'default';
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
    panels: buildDefaultPanels(),
    activeConfigId: null,
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
    panels: { ...(base.panels || {}) }
  };

  if (isPlainObject(patch.panels)) {
    for (const [panelId, panelPatch] of Object.entries(patch.panels)) {
      merged.panels[panelId] = {
        ...((base.panels && base.panels[panelId]) || {}),
        ...(panelPatch || {}),
        styles: {
          ...(((base.panels && base.panels[panelId]) || {}).styles || {}),
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

const normalizePanelEntry = (rawPanel = {}, defaults) => {
  const area = normalizeArea(rawPanel.area, defaults.area);
  return {
    area,
    size: normalizeSizeForArea(rawPanel.size, area, defaults.size),
    order: Number.isFinite(Number(rawPanel.order)) ? Number(rawPanel.order) : defaults.order,
    visible: rawPanel.visible !== false,
    useCustomStyles: Boolean(rawPanel.useCustomStyles),
    styles: normalizePanelStyles(rawPanel.styles || {}, DEFAULT_GLOBAL_STYLES)
  };
};

const normalizeSocialPagePreferences = (input, { profileTheme = 'default', strict = false } = {}) => {
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
  const panels = buildDefaultPanels();
  const requestedLegacyOrder = uniqueStrings(raw.sectionOrder || raw.effective?.sectionOrder);
  const requestedLegacyHidden = uniqueStrings(raw.hiddenSections);

  const requestedPanelKeys = isPlainObject(raw.panels) ? Object.keys(raw.panels) : [];
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
  }

  applyLegacyOrdering(panels, requestedLegacyOrder, requestedLegacyHidden);

  if (isPlainObject(raw.panels)) {
    for (const [rawPanelId, panelConfig] of Object.entries(raw.panels)) {
      const panelId = normalizePanelId(rawPanelId);
      if (!panelId || !panels[panelId]) continue;
      panels[panelId] = normalizePanelEntry(panelConfig, {
        ...DEFAULT_PANEL_LAYOUTS[panelId],
        ...(panels[panelId] || {})
      });
    }
  }

  for (const mandatoryPanelId of SOCIAL_MANDATORY_SECTION_IDS) {
    panels[mandatoryPanelId].visible = true;
  }

  const visiblePrimaryCount = SOCIAL_PRIMARY_SECTION_IDS.filter((panelId) => panels[panelId]?.visible !== false).length;
  if (visiblePrimaryCount === 0) {
    if (strict) {
      return { error: 'At least one primary section must remain visible' };
    }
    panels[SOCIAL_PRIMARY_SECTION_IDS[0]].visible = true;
  }

  const globalStyles = {
    panelColor: normalizeHexColor(raw.globalStyles?.panelColor, DEFAULT_GLOBAL_STYLES.panelColor),
    headerColor: normalizeHexColor(raw.globalStyles?.headerColor, DEFAULT_GLOBAL_STYLES.headerColor),
    fontFamily: normalizeFontFamily(raw.globalStyles?.fontFamily, DEFAULT_GLOBAL_STYLES.fontFamily),
    fontColor: normalizeHexColor(raw.globalStyles?.fontColor, DEFAULT_GLOBAL_STYLES.fontColor),
    pageBackgroundColor: normalizeHexColor(raw.globalStyles?.pageBackgroundColor, DEFAULT_GLOBAL_STYLES.pageBackgroundColor),
    fontSizes: normalizeFontSizeMap(raw.globalStyles?.fontSizes, DEFAULT_GLOBAL_STYLES.fontSizes)
  };

  const effectivePanels = {};
  for (const panelId of SOCIAL_PANEL_IDS) {
    const basePanel = panels[panelId] || normalizePanelEntry({}, DEFAULT_PANEL_LAYOUTS[panelId]);
    effectivePanels[panelId] = {
      ...basePanel,
      resolvedStyles: basePanel.useCustomStyles ? normalizePanelStyles(basePanel.styles, globalStyles) : globalStyles
    };
  }

  const { sectionOrder, hiddenSections } = deriveLegacySectionData(effectivePanels);
  const value = {
    themePreset,
    accentColorToken,
    sectionOrder,
    hiddenSections,
    hiddenModules,
    globalStyles,
    panels: effectivePanels,
    activeConfigId: raw.activeConfigId ? String(raw.activeConfigId) : null,
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
  SOCIAL_ACCENT_TOKENS,
  SOCIAL_FONT_FAMILIES,
  SOCIAL_FONT_SIZE_TOKENS,
  SOCIAL_LAYOUT_AREAS,
  SOCIAL_LAYOUT_SIZES,
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
  DEFAULT_PANEL_LAYOUTS,
  buildDefaultSocialPagePreferences,
  mergeDesignPatch,
  normalizeSocialPagePreferences,
  toPublicSocialPagePreferences
};
