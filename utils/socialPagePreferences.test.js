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
    expect(prefs.hero.backgroundImageUseRandomGallery).toBe(false);
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

  it('normalizes and persists hero media settings including image history', () => {
    const normalized = normalizeSocialPagePreferences({
      hero: {
        backgroundImage: 'https://example.com/hero.jpg',
        profileImage: 'https://example.com/profile.jpg',
        backgroundImageUseRandomGallery: true,
        backgroundImageHistory: [
          'https://example.com/old-1.jpg',
          'https://example.com/old-2.jpg',
          'https://example.com/old-3.jpg',
          'https://example.com/old-4.jpg'
        ]
      }
    });

    expect(normalized.value.hero.backgroundImage).toBe('https://example.com/hero.jpg');
    expect(normalized.value.hero.profileImage).toBe('https://example.com/profile.jpg');
    expect(normalized.value.hero.backgroundImageUseRandomGallery).toBe(true);
    expect(normalized.value.hero.backgroundImageHistory).toEqual([
      'https://example.com/old-1.jpg',
      'https://example.com/old-2.jpg',
      'https://example.com/old-3.jpg'
    ]);
  });

  it('keeps uploaded hero media paths so gallery-hosted images continue to load', () => {
    const normalized = normalizeSocialPagePreferences({
      hero: {
        backgroundImage: '/uploads/gallery/user-1/photo-1.jpg',
        profileImage: '/uploads/gallery/user-1/photo-2.jpg'
      }
    });

    expect(normalized.value.hero.backgroundImage).toBe('/uploads/gallery/user-1/photo-1.jpg');
    expect(normalized.value.hero.profileImage).toBe('/uploads/gallery/user-1/photo-2.jpg');
  });

  it('strips host from absolute URLs that contain server upload paths', () => {
    const normalized = normalizeSocialPagePreferences({
      hero: {
        backgroundImage: 'https://example.com/uploads/gallery/user-1/photo-1.jpg',
        profileImage: 'https://old-host.railway.app/uploads/gallery/user-1/photo-2.jpg',
        backgroundImageHistory: [
          'https://example.com/uploads/gallery/user-1/old.jpg',
          'https://cdn.example.com/image.jpg'
        ]
      }
    });

    expect(normalized.value.hero.backgroundImage).toBe('/uploads/gallery/user-1/photo-1.jpg');
    expect(normalized.value.hero.profileImage).toBe('/uploads/gallery/user-1/photo-2.jpg');
    expect(normalized.value.hero.backgroundImageHistory).toEqual([
      '/uploads/gallery/user-1/old.jpg',
      'https://cdn.example.com/image.jpg'
    ]);
  });

  it('persists optional social section visibility fields used by blog, resume, and about me', () => {
    const normalized = normalizeSocialPagePreferences({
      enabledSections: { blog: true, resume: true, aboutme: false },
      sectionAudience: { resume: 'secure' },
      aboutMeContent: 'I build secure systems.'
    }, { strict: true });

    expect(normalized.value.enabledSections).toEqual({
      blog: true,
      resume: true,
      aboutme: false
    });
    expect(normalized.value.sectionAudience).toEqual({
      blog: 'social',
      resume: 'secure',
      aboutme: 'social'
    });
    expect(normalized.value.aboutMeContent).toBe('I build secure systems.');
  });

  it('keeps uploaded body background paths with mixed casing and nested folders', () => {
    const normalized = normalizeSocialPagePreferences({
      globalStyles: {
        bodyBackgroundImage: '/uploads/backgrounds/User_123/20260317-hero-BG.WebP'
      }
    });

    expect(normalized.value.globalStyles.bodyBackgroundImage).toBe('/uploads/backgrounds/User_123/20260317-hero-BG.WebP');
  });

  it('does not copy body background media into resolved panel styles', () => {
    const normalized = normalizeSocialPagePreferences({
      globalStyles: {
        bodyBackgroundImage: 'data:image/png;base64,aGVsbG8='
      }
    });

    const timelineResolved = normalized.value.panels.timeline.resolvedStyles;
    expect(timelineResolved.bodyBackgroundImage).toBeUndefined();
    expect(timelineResolved.panelColor).toBe(normalized.value.globalStyles.panelColor);
  });
});
