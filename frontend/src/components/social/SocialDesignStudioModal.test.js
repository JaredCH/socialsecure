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

  it('guides panel editing through popup and allows placement on a valid grouped footprint', async () => {
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

    await act(async () => {
      getButtonContainingText('Guest Lookup').click();
    });
    expect(container.textContent).toContain('Edit panel shape');

    const widthSelect = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent && label.textContent.includes('Width'))
      .querySelector('select');
    expect(widthSelect).toBeTruthy();
    await act(async () => {
      widthSelect.value = 'fourCols';
      widthSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onPanelLayoutChange).toHaveBeenCalledWith('guest_lookup', expect.objectContaining({ size: 'fourCols' }));

    await act(async () => {
      getButtonContainingText('Start placement').click();
    });
    expect(container.textContent).not.toContain('Edit panel shape');

    const targetCell = container.querySelector('[aria-label="Grid cell row 19 col 1"]');
    expect(targetCell).toBeTruthy();
    await act(async () => {
      targetCell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(container.querySelectorAll('.bg-emerald-400').length).toBeGreaterThan(1);

    await act(async () => {
      targetCell.click();
    });
    expect(onPanelLayoutChange).toHaveBeenCalledWith(
      'guest_lookup',
      expect.objectContaining({
        gridPlacement: { row: 18, col: 0 },
        order: 1800
      })
    );
  });
});
