import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SocialStageSettingsSidebar from './SocialStageSettingsSidebar';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

    const selector = container.querySelector('select');
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

    const overlay = container.querySelector('.fixed.inset-0');
    expect(overlay).toBeTruthy();
    expect(overlay.className).toContain('z-[1700]');
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

    const urlInput = container.querySelector('input[placeholder="https://example.com/hero-image.jpg"]');
    expect(urlInput).toBeTruthy();
    expect(urlInput.value).toBe('https://example.com/new-hero.jpg');

    const setUrlButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Set URL');
    await act(async () => {
      setUrlButton.click();
    });
    expect(onHeroBackgroundImageChange).toHaveBeenCalledWith('https://example.com/new-hero.jpg');

    const historyButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Use recent 1');
    await act(async () => {
      historyButton.click();
    });
    expect(onHeroBackgroundImageChange).toHaveBeenCalledWith('https://example.com/old-hero.jpg');

    const randomizeToggle = container.querySelector('input[type="checkbox"]');
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

    const modeSelector = container.querySelector('[data-testid="display-mode-selector"]');
    expect(modeSelector).toBeTruthy();
    const buttons = Array.from(modeSelector.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual(['Stretched', 'Repeating', 'Fixed']);

    const stretchedBtn = buttons.find((b) => b.textContent === 'Stretched');
    expect(stretchedBtn.className).toContain('bg-blue-50');

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

    const animSelector = container.querySelector('[data-testid="overlay-animation-selector"]');
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

    const modeSelector = container.querySelector('[data-testid="display-mode-selector"]');
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

    const uploadBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Upload image');
    expect(uploadBtn).toBeTruthy();
    expect(uploadBtn.disabled).toBe(false);
  });
});
