import { buildDefaultSocialPreferences, normalizeSocialPreferences } from './socialPagePreferences';

describe('socialPagePreferences layout normalization', () => {
  it('uses compact defaults for social header and grid-ready sizes', () => {
    const preferences = buildDefaultSocialPreferences('default');

    expect(preferences.panels.profile_header.visible).toBe(false);
    expect(preferences.panels.guest_preview_notice.area).toBe('main');
    expect(preferences.panels.guest_preview_notice.size).toBe('fourCols');
    expect(preferences.panels.guest_preview_notice.height).toBe('halfRow');
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
});
