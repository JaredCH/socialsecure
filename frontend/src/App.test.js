import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { authAPI, notificationAPI } from './utils/api';

jest.mock('./pages/Home', () => () => <div>Home Page</div>);
jest.mock('./pages/Login', () => () => <div>Login Page</div>);
jest.mock('./pages/Register', () => () => <div>Register Page</div>);
jest.mock('./pages/UserSettings', () => () => <div>User Settings Page</div>);
jest.mock('./pages/ReferFriend', () => () => <div>Refer Friend Page</div>);
jest.mock('./pages/Social', () => () => <div>Social Page</div>);
jest.mock('./pages/Chat', () => () => <div>Chat Page</div>);
jest.mock('./pages/Market', () => () => <div>Market Page</div>);
jest.mock('./pages/News', () => () => <div>News Page</div>);
jest.mock('./pages/Maps', () => () => <div>Maps Page</div>);
jest.mock('./pages/Discovery', () => () => <div>Discovery Page</div>);
jest.mock('./pages/Calendar', () => () => <div>Calendar Page</div>);
jest.mock('./pages/ResumeBuilder', () => () => <div>Resume Builder Page</div>);
jest.mock('./pages/OnboardingPage', () => () => <div>Onboarding Page</div>);
jest.mock('./pages/PostRegistrationWelcome', () => () => <div>Welcome Page</div>);
jest.mock('./pages/ModerationDashboard', () => () => <div>Moderation Dashboard</div>);
jest.mock('./components/NotificationCenter', () => () => <div>🔔</div>);
jest.mock('./pages/NotificationSettings', () => () => <div>Notification Settings</div>);
jest.mock('./pages/ResumePublic', () => () => <div>Public Resume</div>);
jest.mock('react-hot-toast', () => ({ Toaster: () => null }));

jest.mock('./utils/realtime', () => ({
  initRealtime: jest.fn(() => ({ on: jest.fn() })),
  disconnectRealtime: jest.fn()
}));

jest.mock('./utils/api', () => ({
  authAPI: {
    getProfile: jest.fn(),
    getEncryptionPasswordStatus: jest.fn(),
    getOnboardingStatus: jest.fn()
  },
  notificationAPI: {
    getUnreadCount: jest.fn(),
    getPreferences: jest.fn()
  }
}));

describe('App navbar features dropdown', () => {
  let container;
  let root;

  const renderApp = async () => {
    await act(async () => {
      root.render(<App />);
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    authAPI.getProfile.mockResolvedValue({
      data: {
        user: {
          _id: 'user-1',
          username: 'user1',
          hasEncryptionPassword: true,
          onboardingStatus: 'completed',
          onboardingStep: 4,
          unreadNotificationCount: 0
        }
      }
    });
    authAPI.getEncryptionPasswordStatus.mockResolvedValue({
      data: { hasEncryptionPassword: true, encryptionPasswordSetAt: null, encryptionPasswordVersion: 0 }
    });
    authAPI.getOnboardingStatus.mockResolvedValue({
      data: { status: 'completed', currentStep: 4, completedSteps: [1, 2, 3, 4] }
    });
    notificationAPI.getUnreadCount.mockResolvedValue({ data: { count: 0 } });
    notificationAPI.getPreferences.mockResolvedValue({ data: { preferences: { realtime: { enabled: false } } } });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
    localStorage.clear();
    sessionStorage.clear();
    jest.clearAllMocks();
  });

  it('groups discover, calendar, and resume under Features for authenticated users', async () => {
    localStorage.setItem('token', 'token');

    await renderApp();

    expect(authAPI.getProfile).toHaveBeenCalled();

    const featuresMenu = container.querySelector('[data-testid="features-menu"]');
    expect(featuresMenu).not.toBeNull();
    const featuresButton = featuresMenu.querySelector('button');
    expect(featuresButton).not.toBeNull();

    await act(async () => {
      featuresButton.click();
    });

    expect(featuresMenu.textContent).toContain('Features');
    expect(featuresMenu.textContent).toContain('Discover');
    expect(featuresMenu.textContent).toContain('Calendar');
    expect(featuresMenu.textContent).toContain('Resume');
  });

  it('keeps calendar in Features when not authenticated', async () => {
    await renderApp();

    expect(container.textContent).toContain('SocialSecure');

    const featuresMenu = container.querySelector('[data-testid="features-menu"]');
    expect(featuresMenu).not.toBeNull();
    const featuresButton = featuresMenu.querySelector('button');
    expect(featuresButton).not.toBeNull();

    await act(async () => {
      featuresButton.click();
    });

    expect(featuresMenu.textContent).toContain('Calendar');
    expect(featuresMenu.textContent).not.toContain('Discover');
    expect(featuresMenu.textContent).not.toContain('Resume');
  });
});
