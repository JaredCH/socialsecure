import React, { useState, useEffect } from 'react';
import { authAPI } from '../utils/api';
import toast from 'react-hot-toast';

function EncryptionUnlockModal({ isOpen, onUnlock, onClose, showCloseButton = true }) {
  const durationOptions = [
    { value: 2, label: '2 minutes' },
    { value: 10, label: '10 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 60, label: '60 minutes' },
    { value: 720, label: '12 hours' },
    { value: 1440, label: '24 hours' },
    { value: 10080, label: '7 days' }
  ];
  const [password, setPassword] = useState('');
  const [unlockDurationMinutes, setUnlockDurationMinutes] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setUnlockDurationMinutes(30);
      setError('');
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter your encryption password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authAPI.verifyEncryptionPassword(password, unlockDurationMinutes);
      toast.success('Encryption unlocked');
      // Pass the password back to the parent so it can unlock local vault
      onUnlock(password);
      setPassword('');
    } catch (err) {
      const message = err.response?.data?.error || 'Incorrect password';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={showCloseButton ? handleClose : undefined}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="text-center mb-4">
          <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            Unlock Encryption
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Enter your encryption password to access encrypted chat
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Encryption Password"
              autoFocus
              autoComplete="current-password"
            />
            {error && (
              <p className="text-sm text-red-600 mt-2">{error}</p>
            )}
            <label className="mt-3 mb-1 block text-xs font-semibold text-left" htmlFor="unlock-duration-select">
              Unlock duration
            </label>
            <select
              id="unlock-duration-select"
              value={String(unlockDurationMinutes)}
              onChange={(e) => setUnlockDurationMinutes(Number(e.target.value) || 30)}
              className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {durationOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            {showCloseButton && (
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Unlocking...' : 'Unlock'}
            </button>
          </div>
        </form>

        <p className="text-xs text-gray-500 text-center mt-4">
          Unlock duration is configurable per session. You can manually lock from the chat header.
        </p>
      </div>
    </div>
  );
}

export default EncryptionUnlockModal;
