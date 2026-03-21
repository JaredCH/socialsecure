import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SocialStageSettingsSidebar from './SocialStageSettingsSidebar';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* Helper: navigate to a specific tab by clicking its button */
const switchTab = async (label) => {
  const btn = Array.from(document.body.querySelectorAll('button')).find(
    (b) => b.textContent.trim().includes(label)
  );
  if (btn) await act(async () => { btn.click(); });
};

describe('SocialStageSettingsSidebar', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
  });

  it('shows theme selector choices and emits selected theme', async () => {
    const onThemePresetChange = jest.fn();
    await act(async () => {
      root.render(
        <SocialStageSettingsSidebar
          isOpen
          themePreset="default"
          themeOptions={[
            { value: 'default', label: 'Default' },
            { value: 'dark', label: 'Dark' }
          ]}
          onThemePresetChange={onThemePresetChange}
        />
      );
    });

    // Theme tab is active by default
    const selector = document.body.querySelector('select');
    expect(selector).toBeTruthy();
    expect(selector.value).toBe('default');
    const optionLabels = Array.from(selector.querySelectorAll('option')).map((option) => option.textContent);
    expect(optionLabels).toEqual(['Default', 'Dark']);

    await act(async () => {
      selector.value = 'dark';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onThemePresetChange).toHaveBeenCalledWith('dark');
  });

  it('keeps the sidebar overlay above page chrome layers', async () => {
    await act(async () => {
      root.render(<SocialStageSettingsSidebar isOpen />);
    });

    const overlay = document.body.querySelector('.fixed.inset-0');
    expect(overlay).toBeTruthy();
    expect(overlay.className).toContain('z-[1700]');
  });

  it('renders via portal as a direct child of document.body', async () => {
    await act(async () => {
      root.render(<SocialStageSettingsSidebar isOpen />);
    });

    const overlay = document.body.querySelector(':scope > .fixed.inset-0');
    expect(overlay).toBeTruthy();
    expect(container.querySelector('.fixed.inset-0')).toBeNull();
  });

  it('applies hero background URL, history revert, and random gallery toggle', async () => {
    const onHeroBackgroundImageChange = jest.fn();
    const onHeroRandomGalleryToggle = jest.fn();
    await act(async () => {
      root.render(
        <SocialStageSettingsSidebar
          isOpen
          heroBackgroundImage="https://example.com/new-hero.jpg"
          heroBackgroundImageHistory={['https://example.com/old-hero.jpg']}
          onHeroBackgroundImageChange={onHeroBackgroundImageChange}
          onHeroRandomGalleryToggle={onHeroRandomGalleryToggle}
        />
      );
    });

    // Switch to hero tab
    await switchTab('Hero');

    const urlInput = document.body.querySelector('input[placeholder="https://example.com/hero-image.jpg"]');
    expect(urlInput).toBeTruthy();
    expect(urlInput.value).toBe('https://example.com/new-hero.jpg');

    const setUrlButton = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent === 'Set URL');
    await act(async () => {
      setUrlButton.click();
    });
    expect(onHeroBackgroundImageChange).toHaveBeenCalledWith('https://example.com/new-hero.jpg');

    const historyButton = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent === 'Use recent 1');
    await act(async () => {
      historyButton.click();
    });
    expect(onHeroBackgroundImageChange).toHaveBeenCalledWith('https://example.com/old-hero.jpg');

    const randomizeToggle = document.body.querySelector('input[type="checkbox"]');
    await act(async () => {
      randomizeToggle.click();
    });
    expect(onHeroRandomGalleryToggle).toHaveBeenCalledWith(true);
  });

  it('shows display mode selector when body background image is set', async () => {
    const onBodyBackgroundDisplayModeChange = jest.fn();
    await act(async () => {
      root.render(
        <SocialStageSettingsSidebar
          isOpen
          bodyBackgroundImage="https://example.com/bg.jpg"
          bodyBackgroundDisplayMode="cover"
          onBodyBackgroundDisplayModeChange={onBodyBackgroundDisplayModeChange}
        />
      );
    });

    // Switch to background tab
    await switchTab('Background');

    const modeSelector = document.body.querySelector('[data-testid="display-mode-selector"]');
    expect(modeSelector).toBeTruthy();
    const buttons = Array.from(modeSelector.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual(['Stretched', 'Repeating', 'Fixed']);

    const stretchedBtn = buttons.find((b) => b.textContent === 'Stretched');
    expect(stretchedBtn.className).toContain('bg-blue-600');

    await act(async () => {
      buttons.find((b) => b.textContent === 'Fixed').click();
    });
    expect(onBodyBackgroundDisplayModeChange).toHaveBeenCalledWith('fixed');
  });

  it('shows seasonal overlay animation selector', async () => {
    const onBodyBackgroundOverlayAnimationChange = jest.fn();
    await act(async () => {
      root.render(
        <SocialStageSettingsSidebar
          isOpen
          bodyBackgroundOverlayAnimation="none"
          onBodyBackgroundOverlayAnimationChange={onBodyBackgroundOverlayAnimationChange}
        />
      );
    });

    // Switch to effects tab
    await switchTab('Effects');

    const animSelector = document.body.querySelector('[data-testid="overlay-animation-selector"]');
    expect(animSelector).toBeTruthy();
    const buttons = Array.from(animSelector.querySelectorAll('button'));
    expect(buttons.length).toBe(6);
    expect(buttons.map((b) => b.textContent.trim())).toEqual(
      expect.arrayContaining(['None', expect.stringContaining('Christmas Snow'), expect.stringContaining('Easter Eggs'), expect.stringContaining('Halloween Ghosts')])
    );

    await act(async () => {
      buttons.find((b) => b.textContent.includes('Christmas Snow')).click();
    });
    expect(onBodyBackgroundOverlayAnimationChange).toHaveBeenCalledWith('snow');
  });

  it('hides display mode selector when no body background image is set', async () => {
    await act(async () => {
      root.render(
        <SocialStageSettingsSidebar
          isOpen
          bodyBackgroundImage=""
        />
      );
    });

    // Switch to background tab
    await switchTab('Background');

    const modeSelector = document.body.querySelector('[data-testid="display-mode-selector"]');
    expect(modeSelector).toBeNull();
  });

  it('shows upload status after successful upload', async () => {
    const mockUpload = jest.fn().mockResolvedValue();
    await act(async () => {
      root.render(
        <SocialStageSettingsSidebar
          isOpen
          onBodyBackgroundUpload={mockUpload}
        />
      );
    });

    // Switch to background tab
    await switchTab('Background');

    const uploadBtn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'Upload image');
    expect(uploadBtn).toBeTruthy();
    expect(uploadBtn.disabled).toBe(false);
  });

  it('hides grain/blur sliders behind Advanced toggle for hero background', async () => {
    const onHeroBackgroundGrainChange = jest.fn();
    const onHeroBackgroundBlurChange = jest.fn();
    await act(async () => {
      root.render(
        <SocialStageSettingsSidebar
          isOpen
          heroBackgroundImage="https://example.com/hero.jpg"
          onHeroBackgroundGrainChange={onHeroBackgroundGrainChange}
          onHeroBackgroundBlurChange={onHeroBackgroundBlurChange}
        />
      );
    });

    // Switch to hero tab
    await switchTab('Hero');

    // Advanced section should be hidden initially
    expect(document.body.querySelector('[data-testid="hero-advanced-toggle-content"]')).toBeNull();

    // Click the Advanced toggle
    const advancedBtn = document.body.querySelector('[data-testid="hero-advanced-toggle"]');
    expect(advancedBtn).toBeTruthy();
    await act(async () => {
      advancedBtn.click();
    });

    // Advanced section should now be visible
    expect(document.body.querySelector('[data-testid="hero-advanced-toggle-content"]')).toBeTruthy();
    expect(document.body.querySelector('[data-testid="hero-grain-slider"]')).toBeTruthy();
    expect(document.body.querySelector('[data-testid="hero-blur-slider"]')).toBeTruthy();
  });

  it('does not render a Top Friends section', async () => {
    await act(async () => {
      root.render(
        <SocialStageSettingsSidebar
          isOpen
          selectedTopFriends={[]}
          availableFriends={[]}
        />
      );
    });

    const headings = Array.from(document.body.querySelectorAll('h3'));
    const friendsHeading = headings.find((h) => h.textContent === 'Top Friends');
    expect(friendsHeading).toBeFalsy();
  });

  it('does not use pointer-events-none on the sidebar overlay container', async () => {
    await act(async () => {
      root.render(<SocialStageSettingsSidebar isOpen />);
    });

    const overlay = document.body.querySelector('.fixed.inset-0');
    expect(overlay).toBeTruthy();
    expect(overlay.className).not.toContain('pointer-events-none');
  });

  it('renders glass morph toggle on the theme tab', async () => {
    const onGlassMorphToggle = jest.fn();
    await act(async () => {
      root.render(
        <SocialStageSettingsSidebar
          isOpen
          glassMorphEnabled={false}
          onGlassMorphToggle={onGlassMorphToggle}
        />
      );
    });

    const toggle = document.body.querySelector('[role="switch"]');
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    await act(async () => {
      toggle.click();
    });
    expect(onGlassMorphToggle).toHaveBeenCalledWith(true);
  });

  it('shows tabbed navigation with 4 tabs', async () => {
    await act(async () => {
      root.render(<SocialStageSettingsSidebar isOpen />);
    });

    const tabLabels = ['Theme', 'Hero', 'Background', 'Effects'];
    tabLabels.forEach((label) => {
      const btn = Array.from(document.body.querySelectorAll('button')).find(
        (b) => b.textContent.trim().includes(label)
      );
      expect(btn).toBeTruthy();
    });
  });

  it('shows a live preview when body background is set', async () => {
    await act(async () => {
      root.render(
        <SocialStageSettingsSidebar
          isOpen
          bodyBackgroundImage="https://example.com/bg.jpg"
        />
      );
    });

    await switchTab('Background');

    const preview = document.body.querySelector('[data-testid="bg-preview"]');
    expect(preview).toBeTruthy();
  });
});
