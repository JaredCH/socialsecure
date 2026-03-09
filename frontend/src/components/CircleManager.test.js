import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import CircleManager from './CircleManager';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('CircleManager', () => {
  let container;
  let root;
  const setInputValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const baseFriends = [
    { _id: 'f-1', username: 'alice', realName: 'Alice' },
    { _id: 'f-2', username: 'bob', realName: 'Bob' }
  ];

  const baseCircles = [{
    name: 'Trusted',
    color: '#3B82F6',
    relationshipAudience: 'social',
    profileImageUrl: '',
    memberCount: 1,
    members: [{ _id: 'f-1', username: 'alice', realName: 'Alice' }]
  }];

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

  it('creates a circle with toggle, color, and profile image', async () => {
    const onCreateCircle = jest.fn();

    await act(async () => {
      root.render(
        <CircleManager
          circles={[]}
          friends={baseFriends}
          onCreateCircle={onCreateCircle}
          onUpdateCircle={jest.fn()}
          onDeleteCircle={jest.fn()}
          onAddMember={jest.fn()}
          onRemoveMember={jest.fn()}
        />
      );
    });

    const nameInput = container.querySelector('input[placeholder="Circle name"]');
    const profileInput = container.querySelector('input[placeholder="Profile image URL (optional)"]');
    const secureToggle = container.querySelector('input[aria-label="Create secure circle toggle"]');
    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add New Circle');

    await act(async () => {
      setInputValue(nameInput, 'Core Team');
      setInputValue(profileInput, 'https://example.com/core.png');
      secureToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCreateCircle).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Core Team',
      relationshipAudience: 'secure',
      profileImageUrl: 'https://example.com/core.png'
    }));
  });

  it('saves edits and supports autosuggest + remove', async () => {
    const onUpdateCircle = jest.fn();
    const onAddMember = jest.fn();
    const onRemoveMember = jest.fn();

    await act(async () => {
      root.render(
        <CircleManager
          circles={baseCircles}
          friends={baseFriends}
          onCreateCircle={jest.fn()}
          onUpdateCircle={onUpdateCircle}
          onDeleteCircle={jest.fn()}
          onAddMember={onAddMember}
          onRemoveMember={onRemoveMember}
        />
      );
    });

    const editInputs = Array.from(container.querySelectorAll('input[placeholder="Circle name"]'));
    const editNameInput = editInputs[1];
    const editProfileInput = Array.from(container.querySelectorAll('input[placeholder="Profile image URL (optional)"]'))[1];
    const editToggle = container.querySelector('input[aria-label="Circle type toggle"]');
    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Changes');

    await act(async () => {
      setInputValue(editNameInput, 'Trusted VIP');
      setInputValue(editProfileInput, 'https://example.com/vip.png');
      editToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateCircle).toHaveBeenCalledWith('Trusted', {
      name: 'Trusted VIP',
      relationshipAudience: 'secure',
      profileImageUrl: 'https://example.com/vip.png'
    });

    const suggestInput = Array.from(container.querySelectorAll('input')).find((input) => input.getAttribute('placeholder')?.startsWith('Search friends to add'));
    expect(suggestInput).toBeTruthy();

    await act(async () => {
      setInputValue(suggestInput, 'bob');
    });

    const bobSuggestion = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('@bob'));
    expect(bobSuggestion).toBeTruthy();

    await act(async () => {
      bobSuggestion.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAddMember).toHaveBeenCalledWith('Trusted', 'f-2');

    const removeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Remove');
    await act(async () => {
      removeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onRemoveMember).toHaveBeenCalledWith('Trusted', 'f-1');
  });
});
