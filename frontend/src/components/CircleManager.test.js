import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import CircleManager from './CircleManager';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const renderWithRouter = (ui, root) => root.render(<MemoryRouter>{ui}</MemoryRouter>);

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
      renderWithRouter(
        <CircleManager
          circles={[]}
          friends={baseFriends}
          onCreateCircle={onCreateCircle}
          onUpdateCircle={jest.fn()}
          onDeleteCircle={jest.fn()}
          onAddMember={jest.fn()}
          onRemoveMember={jest.fn()}
        />,
        root
      );
    });

    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add New Circle');

    await act(async () => {
      createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const nameInputAfterOpen = container.querySelector('input[placeholder="Circle name"]');
    const profileInput = container.querySelector('input[placeholder="Profile image URL (optional)"]');
    const secureToggle = container.querySelector('input[aria-label="Create secure circle toggle"]');
    const submitButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add');

    await act(async () => {
      setInputValue(nameInputAfterOpen, 'Core Team');
      setInputValue(profileInput, 'https://example.com/core.png');
      secureToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCreateCircle).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Core Team',
      relationshipAudience: 'secure',
      profileImageUrl: 'https://example.com/core.png'
    }));
  });

  it('blocks quick add when circle limit is reached', async () => {
    const onCreateCircle = jest.fn();
    const tenCircles = Array.from({ length: 10 }).map((_, index) => ({
      name: `Circle ${index + 1}`,
      color: '#3B82F6',
      relationshipAudience: 'social',
      profileImageUrl: '',
      members: []
    }));

    await act(async () => {
      renderWithRouter(
        <CircleManager
          circles={tenCircles}
          friends={baseFriends}
          onCreateCircle={onCreateCircle}
          onUpdateCircle={jest.fn()}
          onDeleteCircle={jest.fn()}
          onAddMember={jest.fn()}
          onRemoveMember={jest.fn()}
        />,
        root
      );
    });

    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add New Circle');
    expect(createButton.disabled).toBe(true);
    expect(container.textContent).toContain('Circle limit reached (10)');
    expect(onCreateCircle).not.toHaveBeenCalled();
  });

  it('shows member limit message when suggestion add exceeds 25', async () => {
    const onAddMember = jest.fn();
    const fullCircle = [{
      name: 'Trusted',
      color: '#3B82F6',
      relationshipAudience: 'social',
      profileImageUrl: '',
      members: Array.from({ length: 25 }).map((_, index) => ({
        _id: `member-${index}`,
        username: `member${index}`,
        realName: `Member ${index}`
      }))
    }];

    await act(async () => {
      renderWithRouter(
        <CircleManager
          circles={fullCircle}
          friends={baseFriends}
          onCreateCircle={jest.fn()}
          onUpdateCircle={jest.fn()}
          onDeleteCircle={jest.fn()}
          onAddMember={onAddMember}
          onRemoveMember={jest.fn()}
        />,
        root
      );
    });

    const suggestInput = Array.from(container.querySelectorAll('input')).find((input) => input.getAttribute('placeholder')?.startsWith('Search friends to add'));
    await act(async () => {
      setInputValue(suggestInput, 'bob');
    });

    const bobSuggestion = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('@bob'));
    await act(async () => {
      bobSuggestion.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAddMember).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Each circle can have up to 25 members.');
  });

  it('saves edits and supports autosuggest + remove', async () => {
    const onUpdateCircle = jest.fn();
    const onAddMember = jest.fn();
    const onRemoveMember = jest.fn();

    await act(async () => {
      renderWithRouter(
        <CircleManager
          circles={baseCircles}
          friends={baseFriends}
          onCreateCircle={jest.fn()}
          onUpdateCircle={onUpdateCircle}
          onDeleteCircle={jest.fn()}
          onAddMember={onAddMember}
          onRemoveMember={onRemoveMember}
        />,
        root
      );
    });

    const editInputs = Array.from(container.querySelectorAll('input[placeholder="Circle name"]'));
    const editNameInput = editInputs[0];
    const editProfileInput = Array.from(container.querySelectorAll('input[placeholder="Profile image URL (optional)"]'))[0];
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

  it('renders friends as connected circle nodes around the owner node', async () => {
    await act(async () => {
      renderWithRouter(
        <CircleManager
          circles={baseCircles}
          friends={baseFriends}
          onCreateCircle={jest.fn()}
          onUpdateCircle={jest.fn()}
          onDeleteCircle={jest.fn()}
          onAddMember={jest.fn()}
          onRemoveMember={jest.fn()}
        />,
        root
      );
    });

    const aliceNode = container.querySelector('[data-testid="friend-node-f-1"]');
    const bobNode = container.querySelector('[data-testid="friend-node-f-2"]');
    expect(aliceNode).toBeTruthy();
    expect(bobNode).toBeTruthy();
    expect(aliceNode.textContent).toContain('Alice');
    expect(bobNode.textContent).toContain('Bob');
  });

  it('opens member preview with remove and move actions when clicking a member chip', async () => {
    const onRemoveMember = jest.fn();
    const onMoveMember = jest.fn();
    const twoCircles = [
      {
        name: 'Trusted',
        color: '#3B82F6',
        relationshipAudience: 'social',
        profileImageUrl: '',
        members: [{ _id: 'f-1', username: 'alice', realName: 'Alice' }]
      },
      {
        name: 'VIP',
        color: '#7c3aed',
        relationshipAudience: 'secure',
        profileImageUrl: '',
        members: []
      }
    ];

    await act(async () => {
      renderWithRouter(
        <CircleManager
          circles={twoCircles}
          friends={baseFriends}
          onCreateCircle={jest.fn()}
          onUpdateCircle={jest.fn()}
          onDeleteCircle={jest.fn()}
          onAddMember={jest.fn()}
          onRemoveMember={onRemoveMember}
          onMoveMember={onMoveMember}
        />,
        root
      );
    });

    const previewBtn = container.querySelector('[data-testid="member-preview-btn-f-1"]');
    expect(previewBtn).toBeTruthy();

    await act(async () => {
      previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('@alice');
    expect(container.textContent).toContain('Remove from Trusted');

    const viewProfileLink = container.querySelector('a[href*="alice"]');
    expect(viewProfileLink).toBeTruthy();
    expect(viewProfileLink.textContent).toContain('View Full Profile');

    const moveSelect = container.querySelector('select[aria-label="Select target circle"]');
    expect(moveSelect).toBeTruthy();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(moveSelect, 'VIP');
      moveSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const moveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Move');
    await act(async () => {
      moveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onMoveMember).toHaveBeenCalledWith('Trusted', 'VIP', 'f-1');
  });

  it('opens member preview when clicking a friend node in the graph', async () => {
    await act(async () => {
      renderWithRouter(
        <CircleManager
          circles={baseCircles}
          friends={baseFriends}
          onCreateCircle={jest.fn()}
          onUpdateCircle={jest.fn()}
          onDeleteCircle={jest.fn()}
          onAddMember={jest.fn()}
          onRemoveMember={jest.fn()}
        />,
        root
      );
    });

    const aliceNode = container.querySelector('[data-testid="friend-node-f-1"]');
    await act(async () => {
      aliceNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('@alice');
    const viewProfileLink = container.querySelector('a[href*="alice"]');
    expect(viewProfileLink).toBeTruthy();
  });
});
