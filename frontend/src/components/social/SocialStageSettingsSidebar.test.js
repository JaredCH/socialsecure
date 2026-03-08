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
    expect(overlay.className).toContain('z-[1400]');
  });
});
