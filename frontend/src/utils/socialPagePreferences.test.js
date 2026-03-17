import {
  SOCIAL_LAYOUT_PRESETS,
  SOCIAL_THEME_STYLE_PRESETS,
  buildDefaultSocialPreferences,
  normalizeSocialPreferences
} from './socialPagePreferences';

describe('socialPagePreferences layout normalization', () => {
  it('uses balanced defaults for full panel set with grid placements', () => {
    const preferences = buildDefaultSocialPreferences('default');

    expect(preferences.panels.profile_header.visible).toBe(true);
    expect(preferences.panels.guest_preview_notice.gridPlacement).toEqual({ row: 0, col: 0 });
    expect(preferences.panels.timeline.size).toBe('threeCols');
    expect(preferences.panels.timeline.height).toBe('twoRows');
  });

  it('maps legacy main tile sizes to modern width tokens', () => {
    const normalized = normalizeSocialPreferences({
      panels: {
        timeline: { area: 'main', size: 'halfTile', height: 'threeRows' },
      }
    });

    expect(normalized.panels.timeline.size).toBe('oneCol');
    expect(normalized.panels.timeline.height).toBe('threeRows');
  });

  it('derives side panel height from legacy size when height is missing', () => {
    const normalized = normalizeSocialPreferences({
      panels: {
        chat_panel: { area: 'sideRight', size: 'sidePanelHalfHeight' },
      }
    });

    expect(normalized.panels.chat_panel.height).toBe('halfRow');
  });

  it('preserves valid grid placement coordinates when provided', () => {
    const normalized = normalizeSocialPreferences({
      panels: {
        guest_lookup: { gridPlacement: { row: 18, col: 0 } },
        composer: { gridPlacement: { row: 22, col: -1 } }
      }
    });

    expect(normalized.panels.guest_lookup.gridPlacement).toEqual({ row: 18, col: 0 });
    expect(normalized.panels.composer.gridPlacement).toEqual({ row: 1, col: 2 });
  });

  it('includes curated layout and theme presets for quick starts', () => {
    expect(SOCIAL_LAYOUT_PRESETS.map((preset) => preset.id)).toEqual(expect.arrayContaining(['compact', 'balanced', 'content-first']));
    expect(SOCIAL_THEME_STYLE_PRESETS.map((preset) => preset.id)).toEqual(expect.arrayContaining(['oceanic', 'midnight', 'sunrise']));
  });

  it('keeps data URL body background images from design preferences', () => {
    const normalized = normalizeSocialPreferences({
      globalStyles: {
        bodyBackgroundImage: 'data:image/webp;base64,aGVsbG8='
      }
    });

    expect(normalized.globalStyles.bodyBackgroundImage).toBe('data:image/webp;base64,aGVsbG8=');
  });

  it('keeps uploaded body background paths with mixed casing and nested folders', () => {
    const normalized = normalizeSocialPreferences({
      globalStyles: {
        bodyBackgroundImage: '/uploads/backgrounds/User_123/20260317-hero-BG.WebP'
      }
    });

    expect(normalized.globalStyles.bodyBackgroundImage).toBe('/uploads/backgrounds/User_123/20260317-hero-BG.WebP');
  });
});
