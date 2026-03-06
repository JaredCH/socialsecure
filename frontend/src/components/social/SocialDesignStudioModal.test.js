import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SocialDesignStudioModal from './SocialDesignStudioModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('SocialDesignStudioModal layout studio', () => {
  let container;
  let root;

  const getButtonContainingText = (text) => Array.from(container.querySelectorAll('button'))
    .find((button) => button.textContent && button.textContent.includes(text));

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

  it('surfaces curated layout/theme presets and panel reset controls', async () => {
    const onApplyTemplate = jest.fn();
    const onApplyLayoutPreset = jest.fn();
    const onPanelOverrideToggle = jest.fn();

    await act(async () => {
      root.render(
        <SocialDesignStudioModal
          isOpen
          onClose={jest.fn()}
          preferences={{}}
          configs={[]}
          activeConfigId=""
          sharedDesigns={[]}
          favoriteDesigns={[]}
          onApplyTemplate={onApplyTemplate}
          onApplyLayoutPreset={onApplyLayoutPreset}
          onGlobalStylesChange={jest.fn()}
          onPanelOverrideToggle={onPanelOverrideToggle}
          onPanelStyleChange={jest.fn()}
          onPanelLayoutChange={jest.fn()}
          onCreateConfig={jest.fn()}
          onUpdateConfig={jest.fn()}
          onApplyConfig={jest.fn()}
          onDuplicateConfig={jest.fn()}
          onDeleteConfig={jest.fn()}
          onFavoriteShared={jest.fn()}
          onCloneShared={jest.fn()}
          busy={false}
          error=""
          successMessage=""
        />
      );
    });

    const compactPreset = getButtonContainingText('Compact');
    expect(compactPreset).toBeTruthy();
    await act(async () => {
      compactPreset.click();
    });
    expect(onApplyLayoutPreset).toHaveBeenCalled();

    const oceanicPreset = getButtonContainingText('Oceanic');
    expect(oceanicPreset).toBeTruthy();
    await act(async () => {
      oceanicPreset.click();
    });
    expect(onApplyTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 'oceanic' }));

    const resetButtons = Array.from(container.querySelectorAll('button'))
      .filter((button) => button.textContent && button.textContent.includes('Reset to global'));
    expect(resetButtons.length).toBeGreaterThan(0);
    await act(async () => {
      resetButtons[0].click();
    });
    expect(onPanelOverrideToggle).toHaveBeenCalledWith('profile_header', false);
  });

  it('keeps explicit grid placements ahead of auto-placed panels', async () => {
    await act(async () => {
      root.render(
        <SocialDesignStudioModal
          isOpen
          onClose={jest.fn()}
          preferences={{
            panels: {
              timeline: { gridPlacement: { row: 0, col: 0 } },
              guest_preview_notice: { visible: false },
              guest_lookup: { visible: false },
              composer: { visible: false },
              circles: { visible: false },
              moderation_status: { visible: false },
              gallery: { visible: false }
            }
          }}
          configs={[]}
          activeConfigId=""
          sharedDesigns={[]}
          favoriteDesigns={[]}
          onApplyTemplate={jest.fn()}
          onGlobalStylesChange={jest.fn()}
          onPanelOverrideToggle={jest.fn()}
          onPanelStyleChange={jest.fn()}
          onPanelLayoutChange={jest.fn()}
          onCreateConfig={jest.fn()}
          onUpdateConfig={jest.fn()}
          onApplyConfig={jest.fn()}
          onDuplicateConfig={jest.fn()}
          onDeleteConfig={jest.fn()}
          onFavoriteShared={jest.fn()}
          onCloneShared={jest.fn()}
          busy={false}
          error=""
          successMessage=""
        />
      );
    });

    const timelinePreview = Array.from(container.querySelectorAll('div[role="button"]'))
      .find((element) => element.textContent && element.textContent.includes('Timeline'));
    expect(timelinePreview).toBeTruthy();
    expect(timelinePreview.style.left).toBe('calc(0% + 4px)');
    expect(timelinePreview.style.top).toBe('calc(0% + 4px)');
  });

  it('renders safely when toggling from closed to open', async () => {
    const baseProps = {
      onClose: jest.fn(),
      preferences: {},
      configs: [],
      activeConfigId: '',
      sharedDesigns: [],
      favoriteDesigns: [],
      onApplyTemplate: jest.fn(),
      onGlobalStylesChange: jest.fn(),
      onPanelOverrideToggle: jest.fn(),
      onPanelStyleChange: jest.fn(),
      onPanelLayoutChange: jest.fn(),
      onCreateConfig: jest.fn(),
      onUpdateConfig: jest.fn(),
      onApplyConfig: jest.fn(),
      onDuplicateConfig: jest.fn(),
      onDeleteConfig: jest.fn(),
      onFavoriteShared: jest.fn(),
      onCloneShared: jest.fn(),
      busy: false,
      error: '',
      successMessage: ''
    };

    await act(async () => {
      root.render(<SocialDesignStudioModal {...baseProps} isOpen={false} />);
    });

    expect(container.textContent).toBe('');

    await act(async () => {
      root.render(<SocialDesignStudioModal {...baseProps} isOpen />);
    });

    expect(container.textContent).toContain('Social Page Customization');
  });

});
