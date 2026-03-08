import { normalizeSocialPreferences } from './socialPagePreferences';

describe('socialPagePreferences hero media normalization', () => {
  it('keeps hero media values and random gallery toggle', () => {
    const normalized = normalizeSocialPreferences({
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

    expect(normalized.hero.backgroundImage).toBe('https://example.com/hero.jpg');
    expect(normalized.hero.profileImage).toBe('https://example.com/profile.jpg');
    expect(normalized.hero.backgroundImageUseRandomGallery).toBe(true);
    expect(normalized.hero.backgroundImageHistory).toEqual([
      'https://example.com/old-1.jpg',
      'https://example.com/old-2.jpg',
      'https://example.com/old-3.jpg'
    ]);
  });
});
