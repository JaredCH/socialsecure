import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// Mock APIs
jest.mock('../../utils/api', () => ({
  friendsAPI: {
    getFriends: jest.fn(),
  },
  mapsAPI: {
    getFriendsLocations: jest.fn(),
  },
  getAuthToken: jest.fn(() => 'mock-token'),
}));

jest.mock('../../utils/realtime', () => ({
  getRealtimeSocket: jest.fn(),
  onFriendPresence: jest.fn(() => jest.fn()),
}));

const { friendsAPI, mapsAPI } = require('../../utils/api');

import DotNavFriendsList, {
  getInitials,
  getDisplayName,
  isFriendOnline,
  haversineDistanceMeters,
  METERS_TO_FEET,
} from './DotNavFriendsList';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('DotNavFriendsList', () => {
  let container;
  let root;

  const makeFriend = (overrides = {}) => ({
    _id: 'user1',
    username: 'johndoe',
    realName: 'John Doe',
    avatarUrl: null,
    presence: { status: 'online' },
    ...overrides,
  });

  beforeEach(() => {
    friendsAPI.getFriends.mockResolvedValue({ data: { friends: [] } });
    mapsAPI.getFriendsLocations.mockResolvedValue({ data: { locations: [] } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    container = null;
    root = null;
  });

  // ─── Unit tests for pure helper functions ───────────────────────

  describe('getInitials', () => {
    it('returns first and last initials from realName', () => {
      expect(getInitials({ realName: 'John Doe' })).toBe('JD');
    });

    it('returns single initial if only first name', () => {
      expect(getInitials({ realName: 'John' })).toBe('J');
    });

    it('falls back to username', () => {
      expect(getInitials({ username: 'jdoe' })).toBe('J');
    });

    it('handles multi-word names', () => {
      expect(getInitials({ realName: 'Mary Jane Watson' })).toBe('MW');
    });

    it('returns ? for empty data', () => {
      expect(getInitials({})).toBe('?');
    });
  });

  describe('getDisplayName', () => {
    it('returns first name + last initial for full name', () => {
      expect(getDisplayName({ realName: 'John Doe' })).toBe('John D.');
    });

    it('returns just first name if no last name', () => {
      expect(getDisplayName({ realName: 'John' })).toBe('John');
    });

    it('falls back to username', () => {
      expect(getDisplayName({ username: 'jdoe' })).toBe('jdoe');
    });
  });

  describe('isFriendOnline', () => {
    it('returns true for online presence', () => {
      expect(isFriendOnline({ presence: { status: 'online' } })).toBe(true);
    });

    it('returns true for inactive presence', () => {
      expect(isFriendOnline({ presence: { status: 'inactive' } })).toBe(true);
    });

    it('returns false for offline presence', () => {
      expect(isFriendOnline({ presence: { status: 'offline' } })).toBe(false);
    });

    it('returns false for no presence', () => {
      expect(isFriendOnline({})).toBe(false);
    });
  });

  describe('haversineDistanceMeters', () => {
    it('returns 0 for same coordinates', () => {
      expect(haversineDistanceMeters(0, 0, 0, 0)).toBe(0);
    });

    it('calculates approximate distance between two known points', () => {
      // Austin TX to San Antonio TX: ~120km
      const meters = haversineDistanceMeters(30.2672, -97.7431, 29.4241, -98.4936);
      expect(meters).toBeGreaterThan(100000);
      expect(meters).toBeLessThan(150000);
    });
  });

  describe('METERS_TO_FEET', () => {
    it('has the correct conversion factor', () => {
      expect(METERS_TO_FEET).toBeCloseTo(3.28084, 4);
    });
  });

  // ─── Component rendering tests ─────────────────────────────────

  it('does not render when not open', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <DotNavFriendsList isOpen={false} side="right" loggedInUser="me" userId="uid1" />
        </MemoryRouter>
      );
    });

    expect(document.querySelector('[data-testid="dotnav-friends-list"]')).toBeNull();
  });

  it('does not render when there are no friends', async () => {
    friendsAPI.getFriends.mockResolvedValue({ data: { friends: [] } });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DotNavFriendsList isOpen={true} side="right" loggedInUser="me" userId="uid1" />
        </MemoryRouter>
      );
    });

    expect(document.querySelector('[data-testid="dotnav-friends-list"]')).toBeNull();
  });

  it('renders friends list on the opposing side when dotnav is on the right', async () => {
    friendsAPI.getFriends.mockResolvedValue({
      data: { friends: [makeFriend()] },
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DotNavFriendsList isOpen={true} side="right" loggedInUser="me" userId="uid1" />
        </MemoryRouter>
      );
    });

    const list = document.querySelector('[data-testid="dotnav-friends-list"]');
    expect(list).not.toBeNull();
    expect(list.classList.contains('dotnav-friends-left')).toBe(true);
  });

  it('renders friends list on the opposing side when dotnav is on the left', async () => {
    friendsAPI.getFriends.mockResolvedValue({
      data: { friends: [makeFriend()] },
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DotNavFriendsList isOpen={true} side="left" loggedInUser="me" userId="uid1" />
        </MemoryRouter>
      );
    });

    const list = document.querySelector('[data-testid="dotnav-friends-list"]');
    expect(list).not.toBeNull();
    expect(list.classList.contains('dotnav-friends-right')).toBe(true);
  });

  it('renders friend initials when no avatar is available', async () => {
    friendsAPI.getFriends.mockResolvedValue({
      data: { friends: [makeFriend({ avatarUrl: null, realName: 'Jane Smith' })] },
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DotNavFriendsList isOpen={true} side="right" loggedInUser="me" userId="uid1" />
        </MemoryRouter>
      );
    });

    const initials = document.querySelector('.dotnav-friend-initials');
    expect(initials).not.toBeNull();
    expect(initials.textContent).toBe('JS');
  });

  it('renders display name as first name + last initial', async () => {
    friendsAPI.getFriends.mockResolvedValue({
      data: { friends: [makeFriend({ realName: 'Jane Smith' })] },
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DotNavFriendsList isOpen={true} side="right" loggedInUser="me" userId="uid1" />
        </MemoryRouter>
      );
    });

    const name = document.querySelector('.dotnav-friend-name');
    expect(name).not.toBeNull();
    expect(name.textContent).toBe('Jane S.');
  });

  it('applies online glow for online friends', async () => {
    friendsAPI.getFriends.mockResolvedValue({
      data: { friends: [makeFriend({ presence: { status: 'online' } })] },
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DotNavFriendsList isOpen={true} side="right" loggedInUser="me" userId="uid1" />
        </MemoryRouter>
      );
    });

    const avatar = document.querySelector('.dotnav-friend-avatar');
    expect(avatar.classList.contains('dotnav-friend-glow-online')).toBe(true);
  });

  it('applies offline glow for offline friends', async () => {
    friendsAPI.getFriends.mockResolvedValue({
      data: { friends: [makeFriend({ presence: { status: 'offline' } })] },
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DotNavFriendsList isOpen={true} side="right" loggedInUser="me" userId="uid1" />
        </MemoryRouter>
      );
    });

    const avatar = document.querySelector('.dotnav-friend-avatar');
    expect(avatar.classList.contains('dotnav-friend-glow-offline')).toBe(true);
  });

  it('groups friends by online and offline', async () => {
    friendsAPI.getFriends.mockResolvedValue({
      data: {
        friends: [
          makeFriend({ _id: 'u1', realName: 'Alice A', presence: { status: 'online' } }),
          makeFriend({ _id: 'u2', realName: 'Bob B', presence: { status: 'offline' } }),
        ],
      },
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DotNavFriendsList isOpen={true} side="right" loggedInUser="me" userId="uid1" />
        </MemoryRouter>
      );
    });

    const groups = document.querySelectorAll('.dotnav-friends-group-label');
    expect(groups.length).toBe(2);
    expect(groups[0].textContent).toBe('Online');
    expect(groups[1].textContent).toBe('Offline');
  });

  it('links friend avatar and name to that user social page', async () => {
    friendsAPI.getFriends.mockResolvedValue({
      data: { friends: [makeFriend({ _id: 'u1', username: 'alice' })] },
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DotNavFriendsList isOpen={true} side="right" loggedInUser="me" userId="uid1" />
        </MemoryRouter>
      );
    });

    const avatarLink = document.querySelector('.dotnav-friend-avatar-link');
    const nameLink = document.querySelector('.dotnav-friend-name-link');
    expect(avatarLink).not.toBeNull();
    expect(nameLink).not.toBeNull();
    expect(avatarLink.getAttribute('href')).toBe('/social?user=alice');
    expect(nameLink.getAttribute('href')).toBe('/social?user=alice');
  });

  it('renders avatar image when avatarUrl is provided', async () => {
    friendsAPI.getFriends.mockResolvedValue({
      data: { friends: [makeFriend({ avatarUrl: 'https://example.com/avatar.jpg' })] },
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DotNavFriendsList isOpen={true} side="right" loggedInUser="me" userId="uid1" />
        </MemoryRouter>
      );
    });

    const img = document.querySelector('.dotnav-friend-avatar-img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://example.com/avatar.jpg');
  });

  it('falls back to initials on avatar image error', async () => {
    friendsAPI.getFriends.mockResolvedValue({
      data: { friends: [makeFriend({ avatarUrl: 'https://example.com/bad.jpg', realName: 'Alice Bob' })] },
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DotNavFriendsList isOpen={true} side="right" loggedInUser="me" userId="uid1" />
        </MemoryRouter>
      );
    });

    // Trigger image error
    const img = document.querySelector('.dotnav-friend-avatar-img');
    expect(img).not.toBeNull();

    await act(async () => {
      img.dispatchEvent(new Event('error'));
    });

    const initials = document.querySelector('.dotnav-friend-initials');
    expect(initials).not.toBeNull();
    expect(initials.textContent).toBe('AB');
  });

  it('parses friend locations from backend { friends: [...] } response format', async () => {
    const geo = { getCurrentPosition: jest.fn(), watchPosition: jest.fn(), clearWatch: jest.fn() };
    geo.watchPosition.mockImplementation((success) => {
      success({ coords: { latitude: 30.2672, longitude: -97.7431 } });
      return 1;
    });
    Object.defineProperty(global.navigator, 'geolocation', { value: geo, configurable: true });

    const friend = makeFriend({
      _id: 'u1',
      username: 'alice',
      realName: 'Alice A',
      presence: { status: 'online' },
    });

    friendsAPI.getFriends.mockResolvedValue({ data: { friends: [friend] } });
    // Backend returns { friends: [...] } format (not { locations: [...] })
    mapsAPI.getFriendsLocations.mockResolvedValue({
      data: {
        friends: [
          { user: { _id: 'u1' }, lat: 30.2672, lng: -97.7431 },
        ],
      },
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DotNavFriendsList isOpen={true} side="right" loggedInUser="me" userId="uid1" />
        </MemoryRouter>
      );
    });

    // The distance badge should render because locations were parsed correctly
    const distBadge = document.querySelector('.dotnav-friend-distance');
    expect(distBadge).not.toBeNull();
    // Distance from self (same coords) should be 0 Ft
    expect(distBadge.textContent).toBe('0 Ft');
  });
});
