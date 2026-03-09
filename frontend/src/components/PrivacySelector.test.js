import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PrivacySelector from './PrivacySelector';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('PrivacySelector composer controls', () => {
  let container;
  let root;

  const baseProps = {
    form: {
      visibility: 'friends',
      relationshipAudience: 'social',
      visibleToCircles: [],
      excludeUsers: [],
      locationRadius: '',
      expirationPreset: 'none'
    },
    circles: [{ name: 'Core', memberCount: 3 }],
    friends: [
      { _id: 'friend-1', username: 'alpha', realName: 'Alpha One' },
      { _id: 'friend-2', username: 'bravo', realName: 'Bravo Two' }
    ],
    onChange: jest.fn(),
    onToggleCircle: jest.fn(),
    onAddExcludeUser: jest.fn(),
    onRemoveExcludeUser: jest.fn()
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it('maps secure visibility preset to secure friends-only fields', async () => {
    const onChange = jest.fn();
    await act(async () => {
      root.render(<PrivacySelector {...baseProps} onChange={onChange} />);
    });

    const visibilitySelect = container.querySelector('select');
    await act(async () => {
      visibilitySelect.value = 'secure';
      visibilitySelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith('relationshipAudience', 'secure');
    expect(onChange).toHaveBeenCalledWith('visibility', 'friends');
  });

  it('adds excluded user from search suggestions on enter', async () => {
    const onAddExcludeUser = jest.fn();
    await act(async () => {
      root.render(<PrivacySelector {...baseProps} onAddExcludeUser={onAddExcludeUser} />);
    });

    const searchInput = container.querySelector('[data-testid="exclude-user-search-input"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(searchInput, 'alp');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAddExcludeUser).toHaveBeenCalledWith('friend-1');
  });
});
