import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Social from './Social';
import { authAPI, circlesAPI, discoveryAPI, feedAPI, friendsAPI, galleryAPI, moderationAPI, resumeAPI, socialPageAPI } from '../utils/api';
import { onFeedInteraction, onFeedPost, onTyping } from '../utils/realtime';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../utils/api', () => ({
  authAPI: {
    getProfile: jest.fn()
  },
  chatAPI: {
    getProfileThread: jest.fn()
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
    getTopFriends: jest.fn()
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
    await act(async () => {
      root.render(
        <MemoryRouter>
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
    moderationAPI.getBlocks.mockResolvedValue({ data: { blockedUsers: [] } });
    moderationAPI.getMutes.mockResolvedValue({ data: { mutedUsers: [] } });
    moderationAPI.getMyReports.mockResolvedValue({ data: { reports: [] } });
    feedAPI.getTimeline.mockResolvedValue({ data: { posts: [] } });
    feedAPI.getPublicUserFeed.mockResolvedValue({ data: { posts: [], user: null } });
    galleryAPI.getGallery.mockResolvedValue({ data: { items: [] } });
    socialPageAPI.getConfigs.mockResolvedValue({ data: { configs: [] } });
    socialPageAPI.getSharedByUser.mockResolvedValue({ data: { configs: [] } });
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
});
