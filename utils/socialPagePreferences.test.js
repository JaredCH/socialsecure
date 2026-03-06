const {
  buildDefaultSocialPagePreferences,
  normalizeSocialPagePreferences,
  mergeDesignPatch
} = require('./socialPagePreferences');

describe('socialPagePreferences utility', () => {
  it('builds v2 defaults with layout and global style metadata', () => {
    const prefs = buildDefaultSocialPagePreferences('dark');

    expect(prefs.version).toBe(2);
    expect(prefs.themePreset).toBe('dark');
    expect(prefs.globalStyles.panelColor).toBe('#ffffff');
    expect(prefs.panels.timeline.area).toBe('main');
    expect(prefs.panels.shortcuts.size).toBe('sidePanelFull');
    expect(prefs.panels.timeline.height).toBe('twoRows');
    expect(prefs.panels.timeline.gridPlacement).toEqual({ row: 5, col: 0 });
  });

  it('rejects unknown legacy section ids in strict mode', () => {
    const normalized = normalizeSocialPagePreferences({
      sectionOrder: ['timeline', 'unknown-section']
    }, { strict: true });

    expect(normalized.error).toMatch(/unknown section id/i);
  });

  it('normalizes per-panel overrides and snaps side layouts safely', () => {
    const normalized = normalizeSocialPagePreferences({
      panels: {
        shortcuts: {
          area: 'sideLeft',
          size: 'quarterTile',
          useCustomStyles: true,
          styles: {
            panelColor: '#101010',
            headerColor: '#202020',
            fontColor: '#f5f5f5',
            fontFamily: 'Manrope',
            fontSizes: {
              header: '3xl'
            }
          }
        }
      }
    });

    expect(normalized.value.panels.shortcuts.size).toBe('sidePanelHalfHeight');
    expect(normalized.value.panels.shortcuts.resolvedStyles.panelColor).toBe('#101010');
    expect(normalized.value.panels.shortcuts.resolvedStyles.fontFamily).toBe('Manrope');
    expect(normalized.value.panels.shortcuts.resolvedStyles.fontSizes.header).toBe('3xl');
  });

  it('normalizes modern grid-aware main sizes and keeps valid placement coordinates', () => {
    const normalized = normalizeSocialPagePreferences({
      panels: {
        timeline: { area: 'main', size: 'halfTile', height: 'threeRows', gridPlacement: { row: 10, col: 2 } },
      }
    });

    expect(normalized.value.panels.timeline.size).toBe('oneCol');
    expect(normalized.value.panels.timeline.height).toBe('threeRows');
    expect(normalized.value.panels.timeline.gridPlacement).toEqual({ row: 10, col: 2 });
  });

  it('merges template patches without dropping existing panel data', () => {
    const base = buildDefaultSocialPagePreferences('default');
    const merged = mergeDesignPatch(base, {
      globalStyles: { panelColor: '#fafafa' },
      panels: {
        timeline: {
          useCustomStyles: true,
          styles: { headerColor: '#123456' }
        }
      }
    });

    expect(merged.globalStyles.panelColor).toBe('#fafafa');
    expect(merged.panels.timeline.useCustomStyles).toBe(true);
    expect(merged.panels.timeline.styles.headerColor).toBe('#123456');
    expect(merged.panels.gallery.area).toBe('main');
  });
});
