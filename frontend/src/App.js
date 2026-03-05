import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
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
import OnboardingPage from './pages/OnboardingPage';
import { authAPI } from './utils/api';

const ProtectedRoute = ({
  isAuthenticated,
  onboardingRequired = false,
  allowWhenOnboardingRequired = false,
  encryptionPasswordRequired = false,
  allowWhenEncryptionRequired = false,
  children
}) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (onboardingRequired && !allowWhenOnboardingRequired) {
    return <Navigate to="/onboarding" replace />;
  }

  if (encryptionPasswordRequired && !allowWhenEncryptionRequired) {
    return <Navigate to="/settings" replace />;
  }

  return children;
};

function App() {
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

  const isAuthenticated = useMemo(() => Boolean(localStorage.getItem('token') && user), [user]);
  const onboardingRequired = isAuthenticated && onboardingStatus.status !== 'completed';
  const encryptionPasswordRequired = isAuthenticated && !encryptionPasswordStatus.hasEncryptionPassword;

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

  const handleAuthSuccess = (payload) => {
    localStorage.setItem('token', payload.token);
    setUser(payload.user);
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
    setUser(null);
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

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <nav className="bg-white shadow-md p-4">
          <div className="container mx-auto flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">SocialSecure</h1>
            <div className="space-x-4">
              {!encryptionPasswordRequired && <Link to="/" className="text-gray-600 hover:text-blue-600">Home</Link>}
              {isAuthenticated && !encryptionPasswordRequired && !onboardingRequired && <Link to="/social" className="text-gray-600 hover:text-blue-600">Social</Link>}
              {isAuthenticated && !encryptionPasswordRequired && !onboardingRequired && <Link to="/chat" className="text-gray-600 hover:text-blue-600">Chat</Link>}
              {isAuthenticated && !encryptionPasswordRequired && !onboardingRequired && <Link to="/market" className="text-gray-600 hover:text-blue-600">Market</Link>}
              {isAuthenticated && !encryptionPasswordRequired && !onboardingRequired && <Link to="/news" className="text-gray-600 hover:text-blue-600">News</Link>}
              {isAuthenticated && !encryptionPasswordRequired && !onboardingRequired && <Link to="/maps" className="text-gray-600 hover:text-blue-600">Maps</Link>}
              {isAuthenticated && !encryptionPasswordRequired && !onboardingRequired && <Link to="/refer" className="text-gray-600 hover:text-blue-600">Refer Friend</Link>}
              {isAuthenticated && onboardingRequired && <Link to="/onboarding" className="text-blue-600 font-medium">Onboarding</Link>}
              {isAuthenticated ? (
                <>
                  <Link to="/settings" className="text-gray-600 hover:text-blue-600">User Settings</Link>
                  <button onClick={handleLogout} className="text-red-600 font-medium">Logout</button>
                </>
              ) : (
                <>
                  <Link to="/login" className="text-blue-600 font-medium">Login</Link>
                  <Link to="/register" className="text-blue-600 font-medium">Register</Link>
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

        <main className="container mx-auto mt-8">
          <Routes>
            <Route
              path="/"
              element={
                isAuthenticated
                  ? onboardingRequired
                    ? <Navigate to="/onboarding" replace />
                    : encryptionPasswordRequired
                      ? <Navigate to="/settings" replace />
                      : <Home />
                  : <Home />
              }
            />
            <Route path="/login" element={<Login onSuccess={handleAuthSuccess} />} />
            <Route path="/register" element={<Register onSuccess={handleAuthSuccess} />} />
            <Route
              path="/onboarding"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  allowWhenOnboardingRequired
                  encryptionPasswordRequired={false}
                  allowWhenEncryptionRequired
                >
                  {onboardingRequired ? (
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
              >
                <UserSettings
                  user={user}
                  setUser={setUser}
                  encryptionPasswordStatus={encryptionPasswordStatus}
                  refreshEncryptionPasswordStatus={refreshEncryptionPasswordStatus}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                />
              </ProtectedRoute>
            )} />
            <Route path="/profile" element={<Navigate to="/settings" replace />} />
            <Route
              path="/social"
              element={(
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  onboardingRequired={onboardingRequired}
                  encryptionPasswordRequired={encryptionPasswordRequired}
                >
                  <Social />
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
                >
                  <ReferFriend />
                </ProtectedRoute>
              )}
            />
            <Route path="/pgp" element={<Navigate to="/settings?deprecated=pgp" replace />} />
          </Routes>
        </main>
        
        <Toaster position="bottom-right" />
      </div>
    </Router>
  );
}

export default App;
