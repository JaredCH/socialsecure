import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

function PostRegistrationWelcome({ user, onConfirm }) {
  const navigate = useNavigate();
  const beginButtonRef = useRef(null);
  const displayName = user?.realName || user?.username || 'there';

  useEffect(() => {
    beginButtonRef.current?.focus();
  }, []);

  const handleKeyDown = (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      beginButtonRef.current?.focus();
    }
  };

  const handleBegin = () => {
    onConfirm?.();
    navigate('/settings', { replace: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-registration-welcome-title"
        aria-describedby="post-registration-welcome-description"
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-4"
        onKeyDown={handleKeyDown}
      >
        <h2 id="post-registration-welcome-title" className="text-2xl font-bold text-gray-900">
          Welcome to SocialSecure, {displayName}!
        </h2>
        <p id="post-registration-welcome-description" className="text-sm text-gray-700">
          Your account is ready. Here’s what you can do right away:
        </p>
        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
          <li>Share updates and connect through your social feed.</li>
          <li>Explore a fresh news experience tailored to your interests.</li>
          <li>Join secure chat and location-based conversations.</li>
          <li>Manage privacy-first controls built to keep you in charge.</li>
        </ul>
        <button
          ref={beginButtonRef}
          type="button"
          onClick={handleBegin}
          className="w-full rounded bg-blue-600 py-2 text-white font-medium hover:bg-blue-700 transition-colors"
        >
          Begin
        </button>
      </div>
    </div>
  );
}

export default PostRegistrationWelcome;
