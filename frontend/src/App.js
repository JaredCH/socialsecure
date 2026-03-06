import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import UserSettings from './pages/UserSettings';
import ReferFriend from './pages/ReferFriend';
import Social from './pages/Social';
import Chat from './pages/Chat';
import Market from './pages/Market';
import News from './pages/News';
import Maps from './pages/Maps';
import Discovery from './pages/Discovery';
import Calendar from './pages/Calendar';
import ResumeBuilder from './pages/ResumeBuilder';
import OnboardingPage from './pages/OnboardingPage';
import PostRegistrationWelcome from './pages/PostRegistrationWelcome';
import ModerationDashboard from './pages/ModerationDashboard';
import NotificationCenter from './components/NotificationCenter';
import NotificationSettings from './pages/NotificationSettings';
import ResumePublic from './pages/ResumePublic';
import { authAPI, notificationAPI } from './utils/api';
import { initRealtime, disconnectRealtime } from './utils/realtime';

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
    return <Navigate to="/login" replace />;
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
  const isCalendarRoute = location.pathname === '/calendar';

  return (
    <main className={isChatRoute
      ? 'flex-1 min-h-0 overflow-hidden'
      : isCalendarRoute
        ? 'container mx-auto mt-4 mb-4 flex-1 min-h-0 overflow-hidden'
        : 'container mx-auto mt-8'}
    >
      {children}
    </main>
  );
};

function App() {
  const WELCOME_PENDING_KEY = 'postRegistrationWelcomePending';
  const WELCOME_PROFILE_KEY = 'postRegistrationWelcomeProfile';
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
    currentStep: 4,
    completedSteps: [1, 2, 3, 4],
    securityPreferences: {
      loginNotifications: true,
      sessionTimeout: 60,
      requirePasswordForSensitive: true
    }
  });
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [incomingNotification, setIncomingNotification] = useState(null);
  const [isFeaturesMenuOpen, setIsFeaturesMenuOpen] = useState(false);
  const [welcomeConfirmationPending, setWelcomeConfirmationPending] = useState(
    () => sessionStorage.getItem(WELCOME_PENDING_KEY) === 'true'
  );
  const [welcomeProfile, setWelcomeProfile] = useState(() => {
    try {
      const rawProfile = sessionStorage.getItem(WELCOME_PROFILE_KEY);
      return rawProfile ? JSON.parse(rawProfile) : null;
    } catch {
      return null;
    }
  });
  const notificationSocketRef = useRef(null);
  const featuresMenuRef = useRef(null);
  const firstFeatureItemRef = useRef(null);
  const lastFeatureItemRef = useRef(null);

  const isAuthenticated = useMemo(() => Boolean(localStorage.getItem('token') && user), [user]);
  const onboardingRequired = isAuthenticated && onboardingStatus.status !== 'completed';
  const encryptionPasswordRequired = isAuthenticated && !encryptionPasswordStatus.hasEncryptionPassword;
  const passwordResetRequired = isAuthenticated && !!user?.mustResetPassword;
  const canUseProtectedFeatures = isAuthenticated && !encryptionPasswordRequired && !onboardingRequired && !passwordResetRequired;

  const refreshEncryptionPasswordStatus = async () => {
    if (!localStorage.getItem('token')) {
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
    if (!localStorage.getItem('token')) {
      setOnboardingStatus({
        status: 'completed',
        currentStep: 4,
        completedSteps: [1, 2, 3, 4],
        securityPreferences: {
          loginNotifications: true,
          sessionTimeout: 60,
          requirePasswordForSensitive: true
        }
      });
      return;
    }

    setCheckingOnboardingStatus(true);
    try {
      const { data } = await authAPI.getOnboardingStatus();
      setOnboardingStatus({
        status: data.status || 'pending',
        currentStep: data.currentStep || 1,
        completedSteps: data.completedSteps || [],
        securityPreferences: data.securityPreferences || {
          loginNotifications: true,
          sessionTimeout: 60,
          requirePasswordForSensitive: true
        }
      });
    } catch {
      setOnboardingStatus({
        status: 'pending',
        currentStep: 1,
        completedSteps: [],
        securityPreferences: {
          loginNotifications: true,
          sessionTimeout: 60,
          requirePasswordForSensitive: true
        }
      });
    } finally {
      setCheckingOnboardingStatus(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setCheckingAuth(false);
        return;
      }

      try {
        const { data } = await authAPI.getProfile();
        setUser(data.user);
        setUnreadNotificationCount(Number(data.user?.unreadNotificationCount || 0));
        setOnboardingStatus((prev) => ({
          ...prev,
          status: data.user?.onboardingStatus || 'pending',
          currentStep: data.user?.onboardingStep || 1,
          securityPreferences: data.user?.securityPreferences || prev.securityPreferences
        }));
        setEncryptionPasswordStatus((prev) => ({
          ...prev,
          hasEncryptionPassword: !!data.user?.hasEncryptionPassword
        }));
      } catch {
        localStorage.removeItem('token');
        setUser(null);
      } finally {
        setCheckingAuth(false);
      }
    };

    bootstrap();
  }, []);

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
      } catch {
        preferences = null;
      }

      if (cancelled) return;
      if (preferences?.realtime?.enabled === false) {
        disconnectRealtime();
        notificationSocketRef.current = null;
        return;
      }

      const token = localStorage.getItem('token');
      const socket = initRealtime({
        token,
        userId: String(user._id),
        lastEventTimestamp: Number(localStorage.getItem('realtime:lastEventTs') || 0)
      });
      if (!socket) return;

      socket.on('notification', (payload) => {
        if (!payload) return;
        setIncomingNotification(payload);
        setUnreadNotificationCount((prev) => prev + (payload.isRead ? 0 : 1));
        localStorage.setItem('realtime:lastEventTs', String(Date.now()));
      });

      socket.on('realtime_events_replay', (payload) => {
        const events = Array.isArray(payload?.events) ? payload.events : [];
        events.forEach((event) => {
          if (event?.eventName === 'notification' && event?.payload) {
            setIncomingNotification(event.payload);
            setUnreadNotificationCount((prev) => prev + (event.payload.isRead ? 0 : 1));
          }
        });
        localStorage.setItem('realtime:lastEventTs', String(Date.now()));
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
    if (!isFeaturesMenuOpen) {
      return undefined;
    }

    const handleMouseDown = (event) => {
      if (featuresMenuRef.current && !featuresMenuRef.current.contains(event.target)) {
        setIsFeaturesMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsFeaturesMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isFeaturesMenuOpen]);

  useEffect(() => {
    if (isFeaturesMenuOpen && firstFeatureItemRef.current) {
      firstFeatureItemRef.current.focus();
    }
  }, [isFeaturesMenuOpen]);

  const handleAuthSuccess = (payload) => {
    localStorage.setItem('token', payload.token);
    setUser(payload.user);
    setUnreadNotificationCount(Number(payload.user?.unreadNotificationCount || 0));
    setOnboardingStatus((prev) => ({
      ...prev,
      status: payload.user?.onboardingStatus || 'pending',
      currentStep: payload.user?.onboardingStep || 1,
      securityPreferences: payload.user?.securityPreferences || prev.securityPreferences
    }));
    setEncryptionPasswordStatus({
      hasEncryptionPassword: !!payload.user?.hasEncryptionPassword,
      encryptionPasswordSetAt: null,
      encryptionPasswordVersion: 0
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem(WELCOME_PENDING_KEY);
    sessionStorage.removeItem(WELCOME_PROFILE_KEY);
    setUser(null);
    setWelcomeConfirmationPending(false);
    setWelcomeProfile(null);
    setOnboardingStatus({
      status: 'completed',
      currentStep: 4,
      completedSteps: [1, 2, 3, 4],
      securityPreferences: {
        loginNotifications: true,
        sessionTimeout: 60,
        requirePasswordForSensitive: true
      }
    });
    setEncryptionPasswordStatus({
      hasEncryptionPassword: true,
      encryptionPasswordSetAt: null,
      encryptionPasswordVersion: 0
    });
    setUnreadNotificationCount(0);
    setIncomingNotification(null);
  };

  const handleRegistrationWelcomeRequired = (registeredUser) => {
    const profile = {
      realName: registeredUser?.realName || '',
      username: registeredUser?.username || ''
    };
    sessionStorage.setItem(WELCOME_PENDING_KEY, 'true');
    sessionStorage.setItem(WELCOME_PROFILE_KEY, JSON.stringify(profile));
    setWelcomeProfile(profile);
    setWelcomeConfirmationPending(true);
  };

  const handleWelcomeConfirmed = () => {
    sessionStorage.removeItem(WELCOME_PENDING_KEY);
    sessionStorage.removeItem(WELCOME_PROFILE_KEY);
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

  const navLinkClass = 'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700';
  const navEmphasisLinkClass = 'shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50';
  const navDangerButtonClass = 'shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50';

  return (
    <Router>
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <nav className="bg-white shadow-md border-b border-gray-200 p-4">
          <div className="container mx-auto flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">SocialSecure</h1>
            <div className="flex flex-nowrap items-center gap-3 overflow-x-auto overflow-y-visible">
              {!encryptionPasswordRequired && <Link to="/" className="text-gray-600 hover:text-blue-600 whitespace-nowrap">Home</Link>}
              {canUseProtectedFeatures && <Link to="/social" className="text-gray-600 hover:text-blue-600 whitespace-nowrap">Social</Link>}
              {canUseProtectedFeatures && <Link to="/chat" className="text-gray-600 hover:text-blue-600 whitespace-nowrap">Chat</Link>}
              {canUseProtectedFeatures && <Link to="/market" className="text-gray-600 hover:text-blue-600 whitespace-nowrap">Market</Link>}
              {canUseProtectedFeatures && <Link to="/news" className="text-gray-600 hover:text-blue-600 whitespace-nowrap">News</Link>}
              {canUseProtectedFeatures && <Link to="/maps" className="text-gray-600 hover:text-blue-600 whitespace-nowrap">Maps</Link>}
              <div
                className="relative"
                data-testid="features-menu"
                ref={featuresMenuRef}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setIsFeaturesMenuOpen(false);
                  }
                }}
              >
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isFeaturesMenuOpen}
                  aria-controls="features-menu-panel"
                  onClick={() => setIsFeaturesMenuOpen((prev) => !prev)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      if (!isFeaturesMenuOpen) {
                        setIsFeaturesMenuOpen(true);
                      } else if (firstFeatureItemRef.current) {
                        firstFeatureItemRef.current.focus();
                      }
                    }
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      if (!isFeaturesMenuOpen) {
                        setIsFeaturesMenuOpen(true);
                      } else if (lastFeatureItemRef.current) {
                        lastFeatureItemRef.current.focus();
                      }
                    }
                  }}
                  className="flex items-center gap-1 text-gray-600 hover:text-blue-600 whitespace-nowrap"
                >
                  Features
                  <span aria-hidden="true">▾</span>
                </button>
                {isFeaturesMenuOpen ? (
                  <div
                    id="features-menu-panel"
                    role="menu"
                    className="absolute right-0 top-full z-20 mt-2 min-w-40 max-w-[calc(100vw-2rem)] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                  >
                    {canUseProtectedFeatures && (
                      <Link ref={firstFeatureItemRef} to="/discover" role="menuitem" onClick={() => setIsFeaturesMenuOpen(false)} className="block px-4 py-2 text-gray-600 hover:bg-blue-50 hover:text-blue-600 whitespace-nowrap">
                        Discover
                      </Link>
                    )}
                    <Link
                      ref={(node) => {
                        if (!canUseProtectedFeatures) {
                          firstFeatureItemRef.current = node;
                          lastFeatureItemRef.current = node;
                        }
                      }}
                      to="/calendar"
                      role="menuitem"
                      onClick={() => setIsFeaturesMenuOpen(false)}
                      className="block px-4 py-2 text-gray-600 hover:bg-blue-50 hover:text-blue-600 whitespace-nowrap"
                    >
                      Calendar
                    </Link>
                    {canUseProtectedFeatures && (
                      <Link ref={lastFeatureItemRef} to="/resume" role="menuitem" onClick={() => setIsFeaturesMenuOpen(false)} className="block px-4 py-2 text-gray-600 hover:bg-blue-50 hover:text-blue-600 whitespace-nowrap">
                        Resume
                      </Link>
                    )}
                  </div>
                ) : null}
              </div>
              {canUseProtectedFeatures && user?.isAdmin && <Link to="/control-panel" className="text-gray-600 hover:text-blue-600 whitespace-nowrap">Control Panel</Link>}
              {canUseProtectedFeatures && <Link to="/refer" className="text-gray-600 hover:text-blue-600 whitespace-nowrap">Refer Friend</Link>}
              {canUseProtectedFeatures && (
                <NotificationCenter
                  unreadCount={unreadNotificationCount}
                  onUnreadCountChange={setUnreadNotificationCount}
                  incomingNotification={incomingNotification}
                />
              )}
              {isAuthenticated && onboardingRequired && <Link to="/onboarding" className="text-blue-600 font-medium whitespace-nowrap">Onboarding</Link>}
              {isAuthenticated ? (
                <>
                  <Link to="/settings" className="text-gray-600 hover:text-blue-600 whitespace-nowrap">User Settings</Link>
                  <button onClick={handleLogout} className="text-red-600 font-medium whitespace-nowrap">Logout</button>
                </>
              ) : (
                <>
                  <Link to="/login" className="text-blue-600 font-medium whitespace-nowrap">Login</Link>
                  <Link to="/register" className="text-blue-600 font-medium whitespace-nowrap">Register</Link>
                </>
              )}
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
            <Route path="/profile" element={<Navigate to="/settings" replace />} />
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
                  {user?.isAdmin ? <ModerationDashboard /> : <Navigate to="/social" replace />}
                </ProtectedRoute>
              )}
            />
            <Route path="/moderation" element={<Navigate to="/control-panel" replace />} />
            <Route
              path="/discover"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <Discovery />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/social"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <Social />
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
            <Route path="/feed" element={<Navigate to="/social" replace />} />
            <Route
              path="/chat"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <Chat />
                </ProtectedRoute>
              )}
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
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                  passwordResetRequired={passwordResetRequired}
                >
                  <News />
                </ProtectedRoute>
              )}
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
            <Route path="*" element={<Navigate to={isAuthenticated ? (passwordResetRequired ? '/settings#account' : '/social') : '/'} replace />} />
          </Routes>
        </RouteMain>
        
        <Toaster position="bottom-right" />
      </div>
    </Router>
  );
}

export default App;
