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
