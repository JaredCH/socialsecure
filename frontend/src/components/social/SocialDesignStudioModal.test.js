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

  it('lets users define panel size and placement by selecting top-left and bottom-right corners', async () => {
    const onPanelLayoutChange = jest.fn();

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
          onApplyTemplate={jest.fn()}
          onGlobalStylesChange={jest.fn()}
          onPanelOverrideToggle={jest.fn()}
          onPanelStyleChange={jest.fn()}
          onPanelLayoutChange={onPanelLayoutChange}
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

    const guestLookupButton = getButtonContainingText('Guest Lookup');
    expect(guestLookupButton).toBeTruthy();
    await act(async () => {
      guestLookupButton.click();
    });
    expect(container.textContent).toContain('Select its top-left corner on the grid');

    const topLeftCell = container.querySelector('[aria-label="Grid cell row 19 col 1"]');
    expect(topLeftCell).toBeTruthy();
    await act(async () => {
      topLeftCell.click();
    });
    expect(container.textContent).toContain('Now select the bottom-right corner');
    expect(container.querySelectorAll('.pointer-events-none').length).toBeGreaterThan(0);

    const bottomRightCell = container.querySelector('[aria-label="Grid cell row 20 col 8"]');
    expect(bottomRightCell).toBeTruthy();
    await act(async () => {
      bottomRightCell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(container.querySelectorAll('.bg-emerald-400').length).toBeGreaterThan(1);

    await act(async () => {
      bottomRightCell.click();
    });
    expect(onPanelLayoutChange).toHaveBeenCalledWith(
        'guest_lookup',
      expect.objectContaining({
        size: 'fourCols',
        height: 'fullRow',
        gridPlacement: { row: 18, col: 0 },
        order: 0
      })
    );
  });

  it('keeps explicit grid placements ahead of auto-placed panels', async () => {
    await act(async () => {
      root.render(
        <SocialDesignStudioModal
          isOpen
          onClose={jest.fn()}
          preferences={{ panels: { timeline: { gridPlacement: { row: 0, col: 0 } } } }}
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

    const timelinePreview = Array.from(container.querySelectorAll('div[draggable="true"]'))
      .find((element) => element.textContent && element.textContent.includes('Timeline'));
    expect(timelinePreview).toBeTruthy();
    expect(timelinePreview.style.left).toBe('calc(0% + 4px)');
    expect(timelinePreview.style.top).toBe('calc(0% + 4px)');
  });

});
