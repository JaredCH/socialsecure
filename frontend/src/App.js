import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import UserSettings from './pages/UserSettings';
import ReferFriend from './pages/ReferFriend';
import Social from './pages/Social';
import Chat from './pages/Chat';
import GuestChat from './pages/GuestChat';
import Market from './pages/Market';
import News from './pages/News';
import GuestNews from './pages/GuestNews';
import Maps from './pages/Maps';
import Discovery from './pages/Discovery';
import Calendar from './pages/Calendar';
import ResumeBuilder from './pages/ResumeBuilder';
import OnboardingPage from './pages/OnboardingPage';
import PostRegistrationWelcome from './pages/PostRegistrationWelcome';
import ModerationDashboard from './pages/ModerationDashboard';
import AdminNewsReview from './pages/AdminNewsReview';
import NotificationCenter from './components/NotificationCenter';
import DotNav from './components/social/DotNav';
import SocialLoadingOverlay from './components/social/SocialLoadingOverlay';
import NotificationSettings from './pages/NotificationSettings';
import NotificationsHistory from './pages/NotificationsHistory';
import Notifications from './pages/Notifications';
import ResumePublic from './pages/ResumePublic';
import MobileProfile from './pages/MobileProfile';
import Friends from './pages/Friends';
import { authAPI, notificationAPI, friendsAPI, getAuthToken, setAuthToken, clearAuthToken } from './utils/api';
import { initRealtime, disconnectRealtime } from './utils/realtime';
import { deliverSiteNotification, shouldDisplaySiteNotification } from './utils/browserNotifications';

const ONBOARDING_TOTAL_STEPS = 4;
const COMPLETED_ONBOARDING_STEPS = [1, 2, 3, 4];
const DEFAULT_SECURITY_PREFERENCES = {
  loginNotifications: true,
  sessionTimeout: 60,
  requirePasswordForSensitive: true
};
const VALID_ONBOARDING_STATUSES = new Set(['pending', 'in_progress', 'completed']);
const NEWS_PREFETCH_STATUS_KEY = 'registrationNewsPrefetchStatus';
const LOGOUT_REDIRECT_KEY = 'logoutRedirectHome';

const normalizeOnboardingStatus = (value, fallback = 'pending') => (
  VALID_ONBOARDING_STATUSES.has(value) ? value : fallback
);

const ProtectedRoute = ({
  isAuthenticated,
  onboardingRequired = false,
  allowWhenOnboardingRequired = false,
  encryptionPasswordRequired = false,
  allowWhenEncryptionRequired = false,
  passwordResetRequired = false,
  allowWhenPasswordResetRequired = false,
  children
}) => {
  if (!isAuthenticated) {
    let redirectPath = '/login';
    try {
      if (sessionStorage.getItem(LOGOUT_REDIRECT_KEY) === 'true') {
        redirectPath = '/';
        sessionStorage.removeItem(LOGOUT_REDIRECT_KEY);
      }
    } catch {
      // fall back to login if session storage is unavailable
    }
    return <Navigate to={redirectPath} replace />;
  }

  if (onboardingRequired && !allowWhenOnboardingRequired) {
    return <Navigate to="/onboarding" replace />;
  }

  if (encryptionPasswordRequired && !allowWhenEncryptionRequired) {
    return <Navigate to="/onboarding" replace />;
  }

  if (passwordResetRequired && !allowWhenPasswordResetRequired) {
    return <Navigate to="/settings#account" replace />;
  }

  return children;
};

const RouteMain = ({ children }) => {
  const location = useLocation();
  const isChatRoute = location.pathname === '/chat';
  const isMapsRoute = location.pathname === '/maps';
  const isNewsRoute = location.pathname === '/news';
  const isSocialRoute = location.pathname === '/social' || location.pathname === '/friends';
  const isCalendarRoute = location.pathname === '/calendar';
  const isProfileRoute = location.pathname === '/profile';
  const isHomeRoute = location.pathname === '/';

  return (
    <main className={isChatRoute || isMapsRoute
      ? 'flex-1 min-h-0 overflow-hidden'
      : isNewsRoute
        ? 'flex-1 min-h-0 overflow-hidden'
      : isProfileRoute
        ? 'mx-auto flex-1 min-h-0 w-full overflow-y-auto'
      : isSocialRoute
        ? 'mx-auto flex-1 min-h-0 w-full overflow-y-auto'
      : isHomeRoute
        ? 'flex-1 min-h-0 w-full overflow-y-auto'
      : isCalendarRoute
        ? 'container mx-auto mt-4 mb-4 flex-1 min-h-0 overflow-hidden'
        : 'container mx-auto mt-8 flex-1 min-h-0 overflow-y-auto'}
    >
      {children}
    </main>
  );
};

const GUEST_BANNER_DISMISSED_KEY = 'guestBannerDismissed';

const GuestBanner = () => {
  const location = useLocation();
  const [dismissed, setDismissed] = React.useState(() => {
    try { return localStorage.getItem(GUEST_BANNER_DISMISSED_KEY) === '1'; } catch { return false; }
  });
  if (dismissed) return null;
  if (location.pathname === '/social' || location.pathname === '/friends') return null;
  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(GUEST_BANNER_DISMISSED_KEY, '1'); } catch { /* noop */ }
  };
  return (
    <button
      type="button"
      onClick={handleDismiss}
      className="fixed bottom-20 left-3 z-[60] flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-900 shadow-lg transition-transform active:scale-95 md:static md:mx-auto md:mt-4 md:flex md:rounded md:border md:px-3 md:py-3 md:shadow-none"
      aria-label="Dismiss guest browsing notice"
      data-testid="guest-banner"
      role="status"
    >
      <span>You&apos;re browsing as a guest. Tap to dismiss.</span>
      <span aria-hidden="true" className="ml-1 text-blue-400">✕</span>
    </button>
  );
};

const LegacyDiscoverRedirect = () => {
  const { search, hash } = useLocation();
  return <Navigate to={`/find-friends${search}${hash}`} replace />;
};

function App() {
  const WELCOME_PENDING_KEY = 'postRegistrationWelcomePending';
  const WELCOME_PROFILE_KEY = 'postRegistrationWelcomeProfile';
  const readSessionFlag = (key) => {
    try {
      return sessionStorage.getItem(key) === 'true';
    } catch {
      return false;
    }
  };

  const readSessionJson = (key) => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const writeSessionValue = (key, value) => {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // best effort only
    }
  };

  const removeSessionValue = (key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // best effort only
    }
  };

  const readLocalNumber = (key, fallback = 0) => {
    try {
      return Number(localStorage.getItem(key) || fallback);
    } catch {
      return fallback;
    }
  };

  const writeLocalValue = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // best effort only
    }
  };
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [checkingEncryptionStatus, setCheckingEncryptionStatus] = useState(false);
  const [checkingOnboardingStatus, setCheckingOnboardingStatus] = useState(false);
  const [encryptionPasswordStatus, setEncryptionPasswordStatus] = useState({
    hasEncryptionPassword: true,
    encryptionPasswordSetAt: null,
    encryptionPasswordVersion: 0
  });
  const [onboardingStatus, setOnboardingStatus] = useState({
    status: 'completed',
    currentStep: ONBOARDING_TOTAL_STEPS,
    completedSteps: COMPLETED_ONBOARDING_STEPS,
    securityPreferences: DEFAULT_SECURITY_PREFERENCES
  });
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [incomingNotification, setIncomingNotification] = useState(null);
  const [friendPresence, setFriendPresence] = useState({ online: 0, offline: 0 });
  const [notificationPreferences, setNotificationPreferences] = useState({});
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [welcomeConfirmationPending, setWelcomeConfirmationPending] = useState(
    () => readSessionFlag(WELCOME_PENDING_KEY)
  );
  const [welcomeProfile, setWelcomeProfile] = useState(() => readSessionJson(WELCOME_PROFILE_KEY));
  const notificationSocketRef = useRef(null);

  const isAuthenticated = useMemo(() => Boolean(getAuthToken() && user), [user]);
  const socialProfilePath = useMemo(() => {
    const username = String(user?.username || '').trim();
    return username ? `/social?user=${encodeURIComponent(username)}` : '/social';
  }, [user?.username]);
  const onboardingRequired = isAuthenticated && onboardingStatus.status !== 'completed';
  const encryptionPasswordRequired = isAuthenticated && !encryptionPasswordStatus.hasEncryptionPassword;
  const passwordResetRequired = isAuthenticated && !!user?.mustResetPassword;
  const canUseProtectedFeatures = isAuthenticated && !encryptionPasswordRequired && !onboardingRequired && !passwordResetRequired;

  const refreshEncryptionPasswordStatus = async () => {
    if (!getAuthToken()) {
      setEncryptionPasswordStatus({
        hasEncryptionPassword: true,
        encryptionPasswordSetAt: null,
        encryptionPasswordVersion: 0
      });
      return;
    }

    setCheckingEncryptionStatus(true);
    try {
      const { data } = await authAPI.getEncryptionPasswordStatus();
      setEncryptionPasswordStatus({
        hasEncryptionPassword: !!data.hasEncryptionPassword,
        encryptionPasswordSetAt: data.encryptionPasswordSetAt || null,
        encryptionPasswordVersion: data.encryptionPasswordVersion || 0
      });
    } catch {
      setEncryptionPasswordStatus({
        hasEncryptionPassword: false,
        encryptionPasswordSetAt: null,
        encryptionPasswordVersion: 0
      });
    } finally {
      setCheckingEncryptionStatus(false);
    }
  };

  const refreshOnboardingStatus = async () => {
    if (!getAuthToken()) {
      setOnboardingStatus({
        status: 'completed',
        currentStep: ONBOARDING_TOTAL_STEPS,
        completedSteps: COMPLETED_ONBOARDING_STEPS,
        securityPreferences: DEFAULT_SECURITY_PREFERENCES
      });
      return;
    }

    setCheckingOnboardingStatus(true);
    try {
      const { data } = await authAPI.getOnboardingStatus();
      setOnboardingStatus((prev) => {
        const status = normalizeOnboardingStatus(data.status, prev.status);
        return {
          status,
          currentStep: status === 'completed'
            ? ONBOARDING_TOTAL_STEPS
            : Number.isInteger(data.currentStep) ? data.currentStep : prev.currentStep,
          completedSteps: status === 'completed'
            ? COMPLETED_ONBOARDING_STEPS
            : Array.isArray(data.completedSteps) ? data.completedSteps : prev.completedSteps,
          securityPreferences: data.securityPreferences || prev.securityPreferences || DEFAULT_SECURITY_PREFERENCES
        };
      });
    } catch {
      // Keep the last known-good onboarding state from profile/bootstrap data.
    } finally {
      setCheckingOnboardingStatus(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      const tokenAtBootstrap = getAuthToken();
      if (!tokenAtBootstrap) {
        setCheckingAuth(false);
        return;
      }

      try {
        const { data } = await authAPI.getProfile();
        if (getAuthToken() !== tokenAtBootstrap) {
          return;
        }
        try {
          sessionStorage.removeItem(LOGOUT_REDIRECT_KEY);
        } catch {
          // best effort only
        }
        setUser(data.user);
        setUnreadNotificationCount(Number(data.user?.unreadNotificationCount || 0));
        setOnboardingStatus((prev) => ({
          ...prev,
          status: normalizeOnboardingStatus(data.user?.onboardingStatus, prev.status),
          currentStep: Number.isInteger(data.user?.onboardingStep) ? data.user.onboardingStep : prev.currentStep,
          securityPreferences: data.user?.securityPreferences || prev.securityPreferences || DEFAULT_SECURITY_PREFERENCES
        }));
        setEncryptionPasswordStatus((prev) => ({
          ...prev,
          hasEncryptionPassword: !!data.user?.hasEncryptionPassword
        }));
      } catch {
        if (getAuthToken() === tokenAtBootstrap) {
          clearAuthToken();
          setUser(null);
        }
      } finally {
        setCheckingAuth(false);
      }
    };

    bootstrap();
  }, []);

  useEffect(() => {
    if (!canUseProtectedFeatures) return;
    let cancelled = false;
    const fetchPresence = async () => {
      try {
        const res = await friendsAPI.getPresenceSummary();
        if (!cancelled) setFriendPresence({ online: res.data.online || 0, offline: res.data.offline || 0 });
      } catch { /* best effort */ }
    };
    fetchPresence();
    const interval = setInterval(fetchPresence, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [canUseProtectedFeatures]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCheckingEncryptionStatus(false);
      setCheckingOnboardingStatus(false);
      return;
    }

    refreshEncryptionPasswordStatus();
    refreshOnboardingStatus();
  }, [isAuthenticated]);

  useEffect(() => {
    const bootstrapNotifications = async () => {
      if (!isAuthenticated) {
        setUnreadNotificationCount(0);
        return;
      }

      try {
        const { data } = await notificationAPI.getUnreadCount();
        setUnreadNotificationCount(Number(data?.count || 0));
      } catch {
        // ignore notification count refresh failures
      }
    };

    bootstrapNotifications();
  }, [isAuthenticated]);

  const refreshUnreadNotificationCount = useCallback(async () => {
    try {
      const { data } = await notificationAPI.getUnreadCount();
      setUnreadNotificationCount(Number(data?.count || 0));
    } catch {
      // ignore notification count refresh failures
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user?._id) {
      disconnectRealtime();
      notificationSocketRef.current = null;
      return;
    }

    let cancelled = false;
    const connectSocket = async () => {
      let preferences = null;
      try {
        const response = await notificationAPI.getPreferences();
        preferences = response.data?.preferences || null;
        setNotificationPreferences(preferences || {});
      } catch {
        preferences = null;
        setNotificationPreferences({});
      }

      if (cancelled) return;
      if (preferences?.realtime?.enabled === false) {
        disconnectRealtime();
        notificationSocketRef.current = null;
        return;
      }

      const token = getAuthToken();
      const socket = initRealtime({
        token,
        userId: String(user._id),
        lastEventTimestamp: readLocalNumber('realtime:lastEventTs', 0)
      });
      if (!socket) return;

      socket.on('notification', (payload) => {
        if (!payload) return;
        setIncomingNotification(payload);
        setUnreadNotificationCount((prev) => prev + (payload.isRead ? 0 : 1));
        writeLocalValue('realtime:lastEventTs', String(Date.now()));
      });

      socket.on('realtime_events_replay', (payload) => {
        const events = Array.isArray(payload?.events) ? payload.events : [];
        events.forEach((event) => {
          if (event?.eventName === 'notification' && event?.payload) {
            setIncomingNotification(event.payload);
            setUnreadNotificationCount((prev) => prev + (event.payload.isRead ? 0 : 1));
          }
        });
        writeLocalValue('realtime:lastEventTs', String(Date.now()));
      });

      notificationSocketRef.current = socket;
    };

    connectSocket();

    return () => {
      cancelled = true;
      disconnectRealtime();
      notificationSocketRef.current = null;
    };
  }, [isAuthenticated, user?._id]);

  useEffect(() => {
    if (!shouldDisplaySiteNotification(incomingNotification, notificationPreferences)) {
      return;
    }

    deliverSiteNotification(incomingNotification);
  }, [incomingNotification, notificationPreferences]);


  const handleAuthSuccess = (payload) => {
    setAuthToken(payload.token);
    try {
      sessionStorage.removeItem(LOGOUT_REDIRECT_KEY);
    } catch {
      // best effort only
    }
    if (payload?.registrationNewsPrefetch) {
      writeSessionValue(NEWS_PREFETCH_STATUS_KEY, JSON.stringify(payload.registrationNewsPrefetch));
    }
    setUser(payload.user);
    setUnreadNotificationCount(Number(payload.user?.unreadNotificationCount || 0));
    setOnboardingStatus((prev) => ({
      ...prev,
      status: normalizeOnboardingStatus(payload.user?.onboardingStatus, prev.status),
      currentStep: Number.isInteger(payload.user?.onboardingStep) ? payload.user.onboardingStep : prev.currentStep,
      securityPreferences: payload.user?.securityPreferences || prev.securityPreferences || DEFAULT_SECURITY_PREFERENCES
    }));
    setEncryptionPasswordStatus({
      hasEncryptionPassword: !!payload.user?.hasEncryptionPassword,
      encryptionPasswordSetAt: null,
      encryptionPasswordVersion: 0
    });
  };

  const handleLogout = () => {
    try {
      sessionStorage.setItem(LOGOUT_REDIRECT_KEY, 'true');
    } catch {
      // best effort only
    }
    clearAuthToken();
    removeSessionValue(NEWS_PREFETCH_STATUS_KEY);
    removeSessionValue(WELCOME_PENDING_KEY);
    removeSessionValue(WELCOME_PROFILE_KEY);
    setUser(null);
    setWelcomeConfirmationPending(false);
    setWelcomeProfile(null);
    setOnboardingStatus({
      status: 'completed',
      currentStep: ONBOARDING_TOTAL_STEPS,
      completedSteps: COMPLETED_ONBOARDING_STEPS,
      securityPreferences: DEFAULT_SECURITY_PREFERENCES
    });
    setEncryptionPasswordStatus({
      hasEncryptionPassword: true,
      encryptionPasswordSetAt: null,
      encryptionPasswordVersion: 0
    });
    setUnreadNotificationCount(0);
    setIncomingNotification(null);
    setNotificationPreferences({});
  };

  const handleRegistrationWelcomeRequired = (registeredUser) => {
    const profile = {
      realName: registeredUser?.realName || '',
      username: registeredUser?.username || ''
    };
    writeSessionValue(WELCOME_PENDING_KEY, 'true');
    writeSessionValue(WELCOME_PROFILE_KEY, JSON.stringify(profile));
    setWelcomeProfile(profile);
    setWelcomeConfirmationPending(true);
  };

  const handleWelcomeConfirmed = () => {
    removeSessionValue(WELCOME_PENDING_KEY);
    removeSessionValue(WELCOME_PROFILE_KEY);
    setWelcomeConfirmationPending(false);
    setWelcomeProfile(null);
  };

  const handleOnboardingCompleted = async () => {
    await refreshOnboardingStatus();

    try {
      const { data } = await authAPI.getProfile();
      setUser(data.user);
    } catch {
      // ignore profile refresh failure and rely on cached user
    }
  };

  if (checkingAuth || (isAuthenticated && (checkingEncryptionStatus || checkingOnboardingStatus))) {
    return <div className="min-h-screen grid place-items-center">Loading...</div>;
  }

  const navLinkClass = 'shrink-0 inline-flex min-h-[44px] items-center rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300';
  const navEmphasisLinkClass = 'shrink-0 inline-flex min-h-[44px] items-center rounded-full px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50';
  const navDangerButtonClass = 'shrink-0 inline-flex min-h-[44px] items-center rounded-full px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50';
  const closeNavMenus = () => {
    setIsMobileMenuOpen(false);
  };
  const isGuest = !isAuthenticated;

  return (
    <Router>
      <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
        <nav className="relative z-[1200] hidden shrink-0 border-b border-blue-100 bg-gradient-to-r from-white via-slate-50 to-blue-50 p-3 shadow-md md:block">
          <div className="relative mx-auto w-full px-2 md:px-4">
            <div className="flex items-stretch gap-4">
              <h1 className="text-3xl font-black tracking-tight text-blue-700 shrink-0">SocialSecure</h1>
              <div
                id="main-nav-menu"
                className={`${isMobileMenuOpen ? 'flex' : 'hidden'} absolute right-0 top-full z-[1300] mt-2 w-64 flex-col gap-2 overflow-visible rounded-2xl border border-slate-200 bg-white p-2 shadow-lg md:static md:z-auto md:flex md:w-auto md:flex-1 md:flex-row md:flex-wrap md:items-center md:justify-end md:gap-3 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none`}
              >
                {!encryptionPasswordRequired && <Link to="/" onClick={closeNavMenus} className={navLinkClass}>Home</Link>}
                {canUseProtectedFeatures && <Link to={socialProfilePath} onClick={closeNavMenus} className={navLinkClass}>Social</Link>}
                {canUseProtectedFeatures && <Link to="/chat" onClick={closeNavMenus} className={navLinkClass}>Chat</Link>}
                {canUseProtectedFeatures && <Link to="/news" onClick={closeNavMenus} className={navLinkClass}>News</Link>}
                {canUseProtectedFeatures && <Link to="/market" onClick={closeNavMenus} className={navLinkClass}>Market</Link>}
                {canUseProtectedFeatures && <Link to="/maps" onClick={closeNavMenus} className={navLinkClass}>Maps</Link>}
                {isGuest && <Link to="/social" onClick={closeNavMenus} className={navLinkClass}>Social</Link>}
                {isGuest && <Link to="/find-friends" onClick={closeNavMenus} className={navLinkClass}>Find Friends</Link>}
                {isGuest && <Link to="/chat" onClick={closeNavMenus} className={navLinkClass}>Chat</Link>}
                {isGuest && <Link to="/news" onClick={closeNavMenus} className={navLinkClass}>News</Link>}
                {isAuthenticated && onboardingRequired && <Link to="/onboarding" onClick={closeNavMenus} className={navEmphasisLinkClass}>Onboarding</Link>}
                {isAuthenticated ? (
                  !canUseProtectedFeatures && <button onClick={handleLogout} className={navDangerButtonClass}>Logout</button>
                ) : (
                  <>
                    <Link to="/login" onClick={closeNavMenus} className={navEmphasisLinkClass}>Login</Link>
                    <Link to="/register" onClick={closeNavMenus} className={navEmphasisLinkClass}>Register</Link>
                  </>
                )}
              </div>
              <div className="ml-auto flex shrink-0 items-stretch gap-2">
                {canUseProtectedFeatures && (
                  <NotificationCenter
                    unreadCount={unreadNotificationCount}
                    onUnreadCountChange={setUnreadNotificationCount}
                    incomingNotification={incomingNotification}
                    userDisplayName={user?.username || user?.realName || 'Account'}
                    navLinks={[
                      { to: '/calendar', label: 'Calendar' },
                      { to: '/resume', label: 'Resume' },
                      { to: '/find-friends', label: 'Find Friends' },
                      { to: '/friends', label: `Friends ${friendPresence.online} | ${friendPresence.offline}` },
                      ...(user?.isAdmin ? [{ to: '/control-panel', label: 'Control Panel' }] : []),
                      { to: '/settings', label: 'User Settings' },
                      { to: '/refer', label: 'Refer Friend' },
                    ]}
                    onLogout={handleLogout}
                    containerClassName="h-full"
                    buttonClassName="md:h-full md:min-h-[44px]"
                  />
                )}
                <button
                  type="button"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 md:hidden"
                  onClick={() => setIsMobileMenuOpen((prev) => !prev)}
                  aria-expanded={isMobileMenuOpen}
                  aria-controls="main-nav-menu"
                  aria-label="Toggle navigation menu"
                >
                  <span aria-hidden="true" className="text-lg">☰</span>
                </button>
              </div>
            </div>
          </div>
        </nav>

        {onboardingRequired ? (
          <div className="container mx-auto mt-4">
            <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3">
              Security onboarding is required before using Feed, Chat, and Market.
            </div>
          </div>
        ) : null}

        {encryptionPasswordRequired && !onboardingRequired ? (
          <div className="container mx-auto mt-4">
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-3">
              Encryption password setup is required before using Social, Chat, Market, and referral features.
            </div>
          </div>
        ) : null}
        {isGuest ? <GuestBanner /> : null}

        <RouteMain>
          <Routes>
            <Route
              path="/"
              element={
                isAuthenticated
                  ? welcomeConfirmationPending
                    ? <Navigate to="/welcome" replace />
                    : onboardingRequired
                    ? <Navigate to="/onboarding" replace />
                    : encryptionPasswordRequired
                      ? <Navigate to="/onboarding" replace />
                      : passwordResetRequired
                        ? <Navigate to="/settings#account" replace />
                        : <Home isAuthenticated={isAuthenticated} />
                  : <Home isAuthenticated={isAuthenticated} />
              }
            />
            <Route path="/login" element={<Login onSuccess={handleAuthSuccess} />} />
            <Route
              path="/register"
              element={
                <Register
                  onSuccess={handleAuthSuccess}
                  onWelcomeRequired={handleRegistrationWelcomeRequired}
                />
              }
            />
            <Route
              path="/welcome"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  allowWhenOnboardingRequired
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  allowWhenEncryptionRequired
                  passwordResetRequired={passwordResetRequired}
                  allowWhenPasswordResetRequired
                >
                  {welcomeConfirmationPending ? (
                    <PostRegistrationWelcome
                      user={welcomeProfile || user}
                      onConfirm={handleWelcomeConfirmed}
                    />
                  ) : (
                    <Navigate to={encryptionPasswordRequired ? '/onboarding' : '/'} replace />
                  )}
                </ProtectedRoute>
              )}
            />
            <Route
              path="/onboarding"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  allowWhenOnboardingRequired
                  encryptionPasswordRequired={false}
                  allowWhenEncryptionRequired
                  passwordResetRequired={passwordResetRequired}
                  allowWhenPasswordResetRequired
                >
                  {onboardingRequired || encryptionPasswordRequired ? (
                    <OnboardingPage
                      user={user}
                      onboarding={onboardingStatus}
                      refreshOnboardingStatus={refreshOnboardingStatus}
                      onCompleted={handleOnboardingCompleted}
                      refreshEncryptionPasswordStatus={refreshEncryptionPasswordStatus}
                    />
                  ) : (
                    <Navigate to="/" replace />
                  )}
                </ProtectedRoute>
              )}
            />
            <Route path="/settings" element={(
              <ProtectedRoute
                isAuthenticated={isAuthenticated}
                onboardingRequired={onboardingRequired}
                allowWhenOnboardingRequired
                encryptionPasswordRequired={encryptionPasswordRequired}
                allowWhenEncryptionRequired
                passwordResetRequired={passwordResetRequired}
                allowWhenPasswordResetRequired
              >
                {welcomeConfirmationPending ? (
                  <Navigate to="/welcome" replace />
                ) : (
                  <UserSettings
                    user={user}
                    setUser={setUser}
                    encryptionPasswordStatus={encryptionPasswordStatus}
                    refreshEncryptionPasswordStatus={refreshEncryptionPasswordStatus}
                    encryptionPasswordRequired={encryptionPasswordRequired}
                  />
                )}
              </ProtectedRoute>
            )} />
            <Route
              path="/profile"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <MobileProfile user={user} />
                </ProtectedRoute>
              )}
            />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/resume/:username" element={<ResumePublic />} />
            <Route
              path="/resume"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <ResumeBuilder />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/security"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  allowWhenOnboardingRequired={false}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  allowWhenEncryptionRequired={false}
                  passwordResetRequired={passwordResetRequired}
                  allowWhenPasswordResetRequired={false}
                >
                  <Navigate to="/settings#security" replace />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/control-panel"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  allowWhenOnboardingRequired={false}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  allowWhenEncryptionRequired={false}
                  passwordResetRequired={passwordResetRequired}
                  allowWhenPasswordResetRequired={false}
                >
                  {user?.isAdmin ? <ModerationDashboard /> : <Navigate to={socialProfilePath} replace />}
                </ProtectedRoute>
              )}
            />
            <Route path="/moderation" element={<Navigate to="/control-panel" replace />} />
            <Route
              path="/control-panel/news-review"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  allowWhenOnboardingRequired={false}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  allowWhenEncryptionRequired={false}
                  passwordResetRequired={passwordResetRequired}
                  allowWhenPasswordResetRequired={false}
                >
                  {user?.isAdmin ? <AdminNewsReview /> : <Navigate to={socialProfilePath} replace />}
                </ProtectedRoute>
              )}
            />
            <Route
              path="/find-friends"
              element={isAuthenticated ? (
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <Discovery />
                </ProtectedRoute>
              ) : <Discovery />}
            />
            <Route path="/discover" element={<LegacyDiscoverRedirect />} />
            <Route
              path="/social"
              element={
                <SocialLoadingOverlay>
                  {isAuthenticated ? (
                    <ProtectedRoute
                      isAuthenticated={isAuthenticated}
                      onboardingRequired={onboardingRequired}
                      encryptionPasswordRequired={encryptionPasswordRequired}
                      passwordResetRequired={passwordResetRequired}
                    >
                      <Social />
                    </ProtectedRoute>
                  ) : <Social />}
                </SocialLoadingOverlay>
              }
            />
            <Route
              path="/friends"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <Friends user={user} />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/notification-settings"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <NotificationSettings />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/notifications/history"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <NotificationsHistory />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/notifications"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <Notifications />
                </ProtectedRoute>
              )}
            />
            <Route path="/feed" element={<Navigate to={socialProfilePath} replace />} />
            <Route
              path="/chat"
              element={isAuthenticated ? (
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <Chat />
                </ProtectedRoute>
              ) : <GuestChat />}
            />
            <Route
              path="/market"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <Market />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/news"
              element={isAuthenticated ? (
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <News />
                </ProtectedRoute>
              ) : <GuestNews />}
            />
            <Route
              path="/maps"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <Maps />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/refer"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <ReferFriend />
                </ProtectedRoute>
              )}
            />
            <Route path="/pgp" element={<Navigate to="/settings?deprecated=pgp" replace />} />
            <Route path="*" element={<Navigate to={isAuthenticated ? (passwordResetRequired ? '/settings#account' : socialProfilePath) : '/'} replace />} />
          </Routes>
        </RouteMain>

        <DotNav
          loggedInUser={user?.username || ''}
          userId={user?._id || ''}
          unreadNotificationCount={unreadNotificationCount}
          incomingNotification={incomingNotification}
          onNotificationCountRefresh={refreshUnreadNotificationCount}
          onLogout={handleLogout}
        />

        <Toaster position="bottom-right" />
      </div>
    </Router>
  );
}

export default App;
