import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Social from './Social';
import { authAPI, calendarAPI, chatAPI, circlesAPI, discoveryAPI, feedAPI, friendsAPI, galleryAPI, moderationAPI, resumeAPI, socialPageAPI } from '../utils/api';
import { onFeedInteraction, onFeedPost, onTyping } from '../utils/realtime';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../utils/api', () => ({
  authAPI: {
    getProfile: jest.fn()
  },
  calendarAPI: {
    getMyEvents: jest.fn(),
    getUserCalendarEvents: jest.fn()
  },
  chatAPI: {
    getProfileThread: jest.fn(),
    getConversationMessages: jest.fn()
  },
  circlesAPI: {
    getCircles: jest.fn()
  },
  discoveryAPI: {
    trackEvent: jest.fn(() => Promise.resolve())
  },
  feedAPI: {
    getTimeline: jest.fn(),
    getPublicUserFeed: jest.fn()
  },
  friendsAPI: {
    getFriends: jest.fn(),
    getTopFriends: jest.fn(),
    getPublicCircles: jest.fn()
  },
  galleryAPI: {
    getGallery: jest.fn()
  },
  moderationAPI: {
    getBlocks: jest.fn(),
    getMutes: jest.fn(),
    getMyReports: jest.fn()
  },
  resumeAPI: {
    getMyResume: jest.fn()
  },
  socialPageAPI: {
    getConfigs: jest.fn(),
    getSharedByUser: jest.fn()
  }
}));

jest.mock('../utils/realtime', () => ({
  emitTypingStart: jest.fn(),
  emitTypingStop: jest.fn(),
  getRealtimeSocket: jest.fn(() => null),
  onFeedInteraction: jest.fn(() => () => {}),
  onFeedPost: jest.fn(() => () => {}),
  onTyping: jest.fn(() => () => {}),
  subscribeToPost: jest.fn(),
  unsubscribeFromPost: jest.fn()
}));

describe('Social page hero background rendering', () => {
  let container;
  let root;

  const renderPage = async () => {
    const LocationProbe = () => {
      const location = useLocation();
      return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
    };

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`${window.location.pathname}${window.location.search}`]}>
          <LocationProbe />
          <Social />
        </MemoryRouter>
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('token', 'token');
    window.history.replaceState({}, '', '/social');

    authAPI.getProfile.mockResolvedValue({
      data: {
        user: {
          _id: 'u-1',
          username: 'alpha',
          socialPagePreferences: {
            hero: {
              backgroundImageUseRandomGallery: true
            }
          }
        }
      }
    });
    discoveryAPI.trackEvent.mockResolvedValue({});
    resumeAPI.getMyResume.mockResolvedValue({ data: { resume: null } });
    circlesAPI.getCircles.mockResolvedValue({ data: { circles: [] } });
    friendsAPI.getFriends.mockResolvedValue({ data: { friends: [] } });
    friendsAPI.getTopFriends.mockResolvedValue({ data: { topFriends: [] } });
    friendsAPI.getPublicCircles.mockResolvedValue({ data: { circles: [] } });
    moderationAPI.getBlocks.mockResolvedValue({ data: { blockedUsers: [] } });
    moderationAPI.getMutes.mockResolvedValue({ data: { mutedUsers: [] } });
    moderationAPI.getMyReports.mockResolvedValue({ data: { reports: [] } });
    feedAPI.getTimeline.mockResolvedValue({ data: { posts: [] } });
    feedAPI.getPublicUserFeed.mockResolvedValue({ data: { posts: [], user: null } });
    galleryAPI.getGallery.mockResolvedValue({ data: { items: [] } });
    socialPageAPI.getConfigs.mockResolvedValue({ data: { configs: [] } });
    socialPageAPI.getSharedByUser.mockResolvedValue({ data: { configs: [] } });
    calendarAPI.getMyEvents.mockResolvedValue({ data: { events: [] } });
    calendarAPI.getUserCalendarEvents.mockResolvedValue({ data: { events: [] } });
    chatAPI.getProfileThread.mockResolvedValue({
      data: {
        conversation: {
          _id: 'thread-1',
          permissions: { isOwner: true, canRead: true, canWrite: true },
          profileThreadAccess: { readRoles: ['friends', 'circles'], writeRoles: ['friends', 'circles'] }
        }
      }
    });
    chatAPI.getConversationMessages.mockResolvedValue({ data: { messages: [] } });
    onFeedPost.mockImplementation(() => () => {});
    onFeedInteraction.mockImplementation(() => () => {});
    onTyping.mockImplementation(() => () => {});

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    localStorage.clear();
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  it('renders without throwing when hero random gallery mode is enabled', async () => {
    await expect(renderPage()).resolves.toBeUndefined();
    expect(container.firstChild).not.toBeNull();
  });

  it('builds social chat and calendar links for friend profile context', async () => {
    window.history.replaceState({}, '', '/social?user=buddy');
    feedAPI.getPublicUserFeed.mockResolvedValue({
      data: {
        posts: [],
        user: { _id: 'u-2', username: 'buddy' }
      }
    });

    await expect(renderPage()).resolves.toBeUndefined();

    const links = Array.from(container.querySelectorAll('a'));
    expect(links.some((link) => link.getAttribute('href') === '/calendar?user=buddy')).toBe(true);
    expect(links.some((link) => link.getAttribute('href') === '/chat?profile=u-2')).toBe(true);
  });

  it('navigates to the selected profile calendar when guest clicks the calendar tab', async () => {
    window.history.replaceState({}, '', '/social?user=buddy');
    feedAPI.getPublicUserFeed.mockResolvedValue({
      data: {
        posts: [],
        user: { _id: 'u-2', username: 'buddy' }
      }
    });

    await expect(renderPage()).resolves.toBeUndefined();

    const calendarTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Calendar'));
    expect(calendarTab).toBeDefined();

    await act(async () => {
      calendarTab.click();
    });

    const locationProbe = container.querySelector('[data-testid="location-probe"]');
    expect(locationProbe?.textContent).toBe('/calendar?user=buddy');
  });

  it('renders a scaled calendar preview on the calendar tab', async () => {
    calendarAPI.getMyEvents.mockResolvedValue({
      data: {
        events: [
          {
            _id: 'event-1',
            startAt: new Date().toISOString(),
            endAt: new Date().toISOString()
          }
        ]
      }
    });

    await expect(renderPage()).resolves.toBeUndefined();

    const calendarTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Calendar'));
    expect(calendarTab).toBeDefined();

    await act(async () => {
      calendarTab.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(calendarAPI.getMyEvents).toHaveBeenCalled();
    expect(container.querySelector('[data-testid="social-calendar-preview-grid"]')).toBeTruthy();
  });

  it('keeps composer hidden by default with a reveal action', async () => {
    await expect(renderPage()).resolves.toBeUndefined();
    expect(container.textContent).toContain('Start a post');
    expect(container.textContent).not.toContain('Publish Post');
  });

  it('positions owner floating controls with elevated stacking context', async () => {
    await expect(renderPage()).resolves.toBeUndefined();
    const guestViewButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Guest View');
    expect(guestViewButton).toBeTruthy();
    expect(guestViewButton.closest('div').className).toContain('top-36');
    expect(guestViewButton.closest('div').className).toContain('z-[70]');
  });

  it('loads profile chat thread/messages for guest viewers when read access allows guests', async () => {
    localStorage.clear();
    window.history.replaceState({}, '', '/social?user=buddy');
    feedAPI.getPublicUserFeed.mockResolvedValue({
      data: {
        posts: [],
        user: { _id: 'u-2', username: 'buddy' }
      }
    });
    chatAPI.getProfileThread.mockResolvedValue({
      data: {
        conversation: {
          _id: 'thread-guest',
          permissions: { isOwner: false, canRead: true, canWrite: false },
          profileThreadAccess: { readRoles: ['guests'], writeRoles: ['friends'] }
        }
      }
    });
    chatAPI.getConversationMessages.mockResolvedValue({
      data: {
        messages: [{ _id: 'm1', content: 'guest-readable', userId: { username: 'buddy' } }]
      }
    });

    await expect(renderPage()).resolves.toBeUndefined();

    expect(chatAPI.getProfileThread).toHaveBeenCalledWith('u-2');
    expect(chatAPI.getConversationMessages).toHaveBeenCalledWith('thread-guest', 1, 25);
    expect(container.textContent).toContain('guest-readable');
    expect(container.textContent).toContain('Sign in to post in this chat room.');
  });
});
