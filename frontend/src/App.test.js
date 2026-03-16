import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { authAPI, notificationAPI, getAuthToken, clearAuthToken } from './utils/api';

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
jest.mock('./components/social/GlobalSocialLauncher', () => () => <div data-testid="global-social-launcher" />);
jest.mock('./pages/NotificationSettings', () => () => <div>Notification Settings</div>);
jest.mock('./pages/ResumePublic', () => () => <div>Public Resume</div>);
jest.mock('./pages/MobileProfile', () => () => <div>Mobile Profile Page</div>);
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
  },
  getAuthToken: jest.fn(),
  setAuthToken: jest.fn(),
  clearAuthToken: jest.fn()
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
    getAuthToken.mockImplementation(() => localStorage.getItem('token'));
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

  it('moves discover, calendar, resume, and settings links out of the main nav', async () => {
    localStorage.setItem('token', 'token');

    await renderApp();

    expect(authAPI.getProfile).toHaveBeenCalled();

    const mainNav = container.querySelector('#main-nav-menu');
    expect(mainNav).not.toBeNull();
    expect(container.querySelector('[data-testid="features-menu"]')).toBeNull();

    const navText = mainNav.textContent;
    expect(navText).not.toContain('Calendar');
    expect(navText).not.toContain('Resume');
    expect(navText).not.toContain('Discover');
    expect(navText).not.toContain('Control Panel');
    expect(navText).not.toContain('User Settings');
    expect(navText).not.toContain('Refer Friend');

    // NotificationCenter (user pill) is rendered
    expect(container.textContent).toContain('🔔');
  });

  it('does not redirect completed users to onboarding when onboarding status refresh fails', async () => {
    localStorage.setItem('token', 'token');
    authAPI.getOnboardingStatus.mockRejectedValueOnce(new Error('network error'));

    await renderApp();

    expect(container.textContent).toContain('Home Page');
    expect(container.textContent).not.toContain('Onboarding Page');
  });

  it('main nav contains core section links for authenticated users', async () => {
    localStorage.setItem('token', 'token');

    await renderApp();

    const mainNav = container.querySelector('#main-nav-menu');
    expect(mainNav).not.toBeNull();
    const navText = mainNav.textContent;
    expect(navText).toContain('Home');
    expect(navText).toContain('Social');
    expect(navText).toContain('Chat');
    expect(navText).toContain('News');
    expect(navText).toContain('Market');
    expect(navText).toContain('Maps');
  });

  it('calendar link is not shown in main nav when not authenticated', async () => {
    await renderApp();

    expect(container.textContent).toContain('SocialSecure');

    const mainNav = container.querySelector('#main-nav-menu');
    expect(mainNav).not.toBeNull();
    expect(mainNav.textContent).not.toContain('Calendar');
    expect(mainNav.textContent).not.toContain('Discover');
    expect(mainNav.textContent).not.toContain('Resume');
  });

  it('calendar link is not shown in main nav even when authenticated', async () => {
    localStorage.setItem('token', 'token');

    await renderApp();

    const mainNav = container.querySelector('#main-nav-menu');
    expect(mainNav).not.toBeNull();
    expect(mainNav.textContent).not.toContain('Calendar');
    expect(mainNav.textContent).not.toContain('Discover');
    expect(mainNav.textContent).not.toContain('Resume');
  });

  it('toggles the mobile nav menu with the hamburger button', async () => {
    localStorage.setItem('token', 'token');

    await renderApp();

    const mobileToggle = container.querySelector('button[aria-label="Toggle navigation menu"]');
    expect(mobileToggle).not.toBeNull();

    const navMenu = container.querySelector('#main-nav-menu');
    expect(navMenu).not.toBeNull();
    expect(navMenu.className).toContain('hidden');

    await act(async () => {
      mobileToggle.click();
    });

    expect(navMenu.className).toContain('absolute');
    expect(navMenu.className).toContain('top-full');
    expect(navMenu.className).not.toContain('hidden');
  });

  it('orders the primary nav links in a more familiar sequence', async () => {
    localStorage.setItem('token', 'token');

    await renderApp();

    const navItems = Array.from(container.querySelectorAll('#main-nav-menu > a'))
      .map((node) => node.textContent.trim());

    expect(navItems.indexOf('Social')).toBeGreaterThan(navItems.indexOf('Home'));
    expect(navItems.indexOf('Chat')).toBeGreaterThan(navItems.indexOf('Social'));
    expect(navItems.indexOf('News')).toBeGreaterThan(navItems.indexOf('Chat'));
    expect(navItems.indexOf('Market')).toBeGreaterThan(navItems.indexOf('News'));
    expect(navItems.indexOf('Maps')).toBeGreaterThan(navItems.indexOf('Market'));
  });

  it('uses full-width main layout on the social route', async () => {
    localStorage.setItem('token', 'token');
    window.history.pushState({}, '', '/social');

    await renderApp();

    const main = container.querySelector('main');
    expect(main).not.toBeNull();
    expect(main.className).toContain('w-full');
    expect(main.className).not.toContain('container');
    expect(container.textContent).toContain('Social Page');
  });

  it('redirects to home after logout from a protected route', async () => {
    localStorage.setItem('token', 'token');
    window.history.pushState({}, '', '/social');

    await renderApp();
    expect(window.location.pathname).toBe('/social');

    const logoutButton = Array.from(container.querySelectorAll('button'))
      .find((node) => node.textContent === 'Logout');
    expect(logoutButton).toBeTruthy();

    await act(async () => {
      logoutButton.click();
      await Promise.resolve();
    });

    expect(clearAuthToken).toHaveBeenCalled();
    expect(container.textContent).toContain('Home Page');
    expect(container.textContent).not.toContain('Login Page');
  });

  it('does not clear a newer token when an older bootstrap profile request fails', async () => {
    localStorage.setItem('token', 'old-token');
    clearAuthToken.mockImplementation(() => {
      localStorage.removeItem('token');
    });
    let rejectProfile;
    authAPI.getProfile.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectProfile = reject;
    }));

    await act(async () => {
      root.render(<App />);
    });

    localStorage.setItem('token', 'new-token');

    await act(async () => {
      rejectProfile(new Error('unauthorized'));
      await Promise.resolve();
    });

    expect(clearAuthToken).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBe('new-token');
  });

});
