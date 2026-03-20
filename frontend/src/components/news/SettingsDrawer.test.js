import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import SettingsDrawer from './SettingsDrawer';

/* Stub the heavy child so the drawer test stays focused on the shell */
jest.mock('./control/NewsControlPanel', () => {
  return function StubPanel({ onClose }) {
    return <button onClick={onClose}>Close</button>;
  };
});

describe('SettingsDrawer', () => {
  let container;
  let root;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

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

  it('uses inert instead of aria-hidden on the dialog panel when closed', async () => {
    await act(async () => {
      root.render(<SettingsDrawer isOpen={false} onClose={() => {}} />);
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();

    // The closed drawer should use inert, not aria-hidden
    expect(dialog.hasAttribute('inert')).toBe(true);
    expect(dialog.hasAttribute('aria-hidden')).toBe(false);
  });

  it('removes inert from the dialog panel when open', async () => {
    await act(async () => {
      root.render(<SettingsDrawer isOpen={true} onClose={() => {}} />);
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();

    expect(dialog.hasAttribute('inert')).toBe(false);
    expect(dialog.hasAttribute('aria-hidden')).toBe(false);
  });

  it('transitions from open to closed without aria-hidden on focused descendant', async () => {
    const onClose = jest.fn();

    await act(async () => {
      root.render(<SettingsDrawer isOpen={true} onClose={onClose} />);
    });

    const dialog = document.querySelector('[role="dialog"]');
    const button = dialog.querySelector('button');
    expect(button).not.toBeNull();
    button.focus();

    // Close the drawer — should set inert, not aria-hidden
    await act(async () => {
      root.render(<SettingsDrawer isOpen={false} onClose={onClose} />);
    });

    expect(dialog.hasAttribute('inert')).toBe(true);
    expect(dialog.hasAttribute('aria-hidden')).toBe(false);
  });
});
