import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import PGPTools from './pages/PGPTools';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import ReferFriend from './pages/ReferFriend';
import Feed from './pages/Feed';
import Chat from './pages/Chat';
import Market from './pages/Market';
import { authAPI } from './utils/api';

const ProtectedRoute = ({ isAuthenticated, children }) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const isAuthenticated = useMemo(() => Boolean(localStorage.getItem('token') && user), [user]);

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
      } catch {
        localStorage.removeItem('token');
        setUser(null);
      } finally {
        setCheckingAuth(false);
      }
    };

    bootstrap();
  }, []);

  const handleAuthSuccess = (payload) => {
    localStorage.setItem('token', payload.token);
    setUser(payload.user);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  if (checkingAuth) {
    return <div className="min-h-screen grid place-items-center">Loading...</div>;
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <nav className="bg-white shadow-md p-4">
          <div className="container mx-auto flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">SocialSecure</h1>
            <div className="space-x-4">
              <Link to="/" className="text-gray-600 hover:text-blue-600">Home</Link>
              {isAuthenticated && <Link to="/feed" className="text-gray-600 hover:text-blue-600">Feed</Link>}
              {isAuthenticated && <Link to="/chat" className="text-gray-600 hover:text-blue-600">Chat</Link>}
              {isAuthenticated && <Link to="/market" className="text-gray-600 hover:text-blue-600">Market</Link>}
              {isAuthenticated && <Link to="/refer" className="text-gray-600 hover:text-blue-600">Refer Friend</Link>}
              <Link to="/pgp" className="text-gray-600 hover:text-blue-600">PGP Tools</Link>
              {isAuthenticated ? (
                <>
                  <Link to="/profile" className="text-gray-600 hover:text-blue-600">Profile</Link>
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

        <main className="container mx-auto mt-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login onSuccess={handleAuthSuccess} />} />
            <Route path="/register" element={<Register onSuccess={handleAuthSuccess} />} />
            <Route path="/profile" element={(
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <Profile user={user} setUser={setUser} />
              </ProtectedRoute>
            )} />
            <Route path="/feed" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Feed /></ProtectedRoute>} />
            <Route path="/chat" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Chat /></ProtectedRoute>} />
            <Route path="/market" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Market /></ProtectedRoute>} />
            <Route path="/refer" element={<ProtectedRoute isAuthenticated={isAuthenticated}><ReferFriend /></ProtectedRoute>} />
            <Route path="/pgp" element={<PGPTools />} />
          </Routes>
        </main>
        
        <Toaster position="bottom-right" />
      </div>
    </Router>
  );
}

export default App;
