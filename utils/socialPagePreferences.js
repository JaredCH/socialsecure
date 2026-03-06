const SOCIAL_THEME_PRESETS = ['default', 'light', 'dark', 'sunset', 'forest'];
const SOCIAL_ACCENT_TOKENS = ['blue', 'violet', 'emerald', 'rose', 'amber'];
const SOCIAL_SECTION_IDS = ['header', 'shortcuts', 'snapshot', 'guestLookup', 'composer', 'circles', 'timeline', 'gallery', 'moderation', 'chatPanel', 'communityNotes'];
const SOCIAL_PRIMARY_SECTION_IDS = ['timeline', 'gallery'];
const SOCIAL_MANDATORY_SECTION_IDS = ['header'];
const SOCIAL_MODULE_IDS = ['marketplaceShortcut', 'calendarShortcut', 'settingsShortcut', 'referShortcut', 'chatPanel', 'communityNotes'];
const SOCIAL_DEFAULT_SECTION_ORDER = [...SOCIAL_SECTION_IDS];
const SOCIAL_PREFERENCES_VERSION = 1;

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

const buildDefaultSocialPagePreferences = (profileTheme = 'default') => {
  const resolvedThemePreset = SOCIAL_THEME_PRESETS.includes(profileTheme) ? profileTheme : 'default';
  return {
    themePreset: resolvedThemePreset,
    accentColorToken: THEME_TO_DEFAULT_ACCENT[resolvedThemePreset] || 'blue',
    sectionOrder: [...SOCIAL_DEFAULT_SECTION_ORDER],
    hiddenSections: [],
    hiddenModules: [],
    version: SOCIAL_PREFERENCES_VERSION
  };
};

const normalizeSocialPagePreferences = (input, {
  profileTheme = 'default',
  strict = false
} = {}) => {
  const defaults = buildDefaultSocialPagePreferences(profileTheme);
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  const themePreset = typeof raw.themePreset === 'string' && SOCIAL_THEME_PRESETS.includes(raw.themePreset.trim())
    ? raw.themePreset.trim()
    : defaults.themePreset;

  const allowedAccents = THEME_TO_ALLOWED_ACCENTS[themePreset] || THEME_TO_ALLOWED_ACCENTS.default;
  const requestedAccent = typeof raw.accentColorToken === 'string' ? raw.accentColorToken.trim() : '';
  const accentColorToken = allowedAccents.includes(requestedAccent)
    ? requestedAccent
    : (allowedAccents.includes(defaults.accentColorToken) ? defaults.accentColorToken : allowedAccents[0]);

  const requestedOrder = uniqueStrings(raw.sectionOrder);
  const unknownOrderSection = requestedOrder.find((sectionId) => !SOCIAL_SECTION_IDS.includes(sectionId));
  if (strict && unknownOrderSection) {
    return { error: `Unknown section ID: ${unknownOrderSection}` };
  }

  const orderedKnownSections = requestedOrder.filter((sectionId) => SOCIAL_SECTION_IDS.includes(sectionId));
  const sectionOrder = [
    ...orderedKnownSections,
    ...SOCIAL_DEFAULT_SECTION_ORDER.filter((sectionId) => !orderedKnownSections.includes(sectionId))
  ];

  const requestedHiddenSections = uniqueStrings(raw.hiddenSections);
  const unknownHiddenSection = requestedHiddenSections.find((sectionId) => !SOCIAL_SECTION_IDS.includes(sectionId));
  if (strict && unknownHiddenSection) {
    return { error: `Unknown hidden section ID: ${unknownHiddenSection}` };
  }

  const hiddenSections = requestedHiddenSections
    .filter((sectionId) => SOCIAL_SECTION_IDS.includes(sectionId))
    .filter((sectionId) => !SOCIAL_MANDATORY_SECTION_IDS.includes(sectionId));

  const visiblePrimaryCount = SOCIAL_PRIMARY_SECTION_IDS
    .filter((sectionId) => !hiddenSections.includes(sectionId))
    .length;
  if (visiblePrimaryCount === 0) {
    const restoreSectionId = SOCIAL_PRIMARY_SECTION_IDS[0];
    const restoreIndex = hiddenSections.indexOf(restoreSectionId);
    if (restoreIndex >= 0) {
      hiddenSections.splice(restoreIndex, 1);
    }
  }

  const requestedHiddenModules = uniqueStrings(raw.hiddenModules);
  const unknownHiddenModule = requestedHiddenModules.find((moduleId) => !SOCIAL_MODULE_IDS.includes(moduleId));
  if (strict && unknownHiddenModule) {
    return { error: `Unknown hidden module ID: ${unknownHiddenModule}` };
  }
  const hiddenModules = requestedHiddenModules.filter((moduleId) => SOCIAL_MODULE_IDS.includes(moduleId));

  const version = Number.isInteger(raw.version) && raw.version > 0 ? raw.version : SOCIAL_PREFERENCES_VERSION;
  const visibleSections = sectionOrder.filter((sectionId) => !hiddenSections.includes(sectionId));
  const visibleModules = SOCIAL_MODULE_IDS.filter((moduleId) => !hiddenModules.includes(moduleId));

  return {
    value: {
      themePreset,
      accentColorToken,
      sectionOrder,
      hiddenSections,
      hiddenModules,
      version,
      effective: {
        sectionOrder: visibleSections,
        visibleSections,
        visibleModules
      }
    }
  };
};

const toPublicSocialPagePreferences = (input, options = {}) => {
  const normalized = normalizeSocialPagePreferences(input, options);
  if (normalized.error || !normalized.value) {
    return buildDefaultSocialPagePreferences(options.profileTheme);
  }
  const { value } = normalized;
  return {
    themePreset: value.themePreset,
    accentColorToken: value.accentColorToken,
    sectionOrder: value.sectionOrder,
    hiddenSections: value.hiddenSections,
    hiddenModules: value.hiddenModules,
    version: value.version,
    effective: value.effective
  };
};

module.exports = {
  SOCIAL_THEME_PRESETS,
  SOCIAL_ACCENT_TOKENS,
  SOCIAL_SECTION_IDS,
  SOCIAL_MODULE_IDS,
  SOCIAL_PRIMARY_SECTION_IDS,
  SOCIAL_MANDATORY_SECTION_IDS,
  SOCIAL_DEFAULT_SECTION_ORDER,
  SOCIAL_PREFERENCES_VERSION,
  THEME_TO_ALLOWED_ACCENTS,
  buildDefaultSocialPagePreferences,
  normalizeSocialPagePreferences,
  toPublicSocialPagePreferences
};
