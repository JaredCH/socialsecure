import React, { useState } from 'react';

function EyeIcon({ crossed = false }) {
  if (crossed) {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M10.58 10.58a2 2 0 102.83 2.83M16.68 16.67A9.72 9.72 0 0112 18c-7 0-10-6-10-6a18.13 18.13 0 014.08-4.93m3.42-1.94A10.77 10.77 0 0112 5c7 0 10 7 10 7a18.1 18.1 0 01-2.17 3.19" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.732 16.057 2.458 12z" />
      <circle cx="12" cy="12" r="3" strokeWidth={2} />
    </svg>
  );
}

export default function PasswordField({ className = '', ...props }) {
  const [showPassword, setShowPassword] = useState(false);
  const type = showPassword ? 'text' : 'password';

  return (
    <div className="relative">
      <input
        {...props}
        type={type}
        className={`${className} pr-11`}
      />
      <button
        type="button"
        onClick={() => setShowPassword((prev) => !prev)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
        aria-label={showPassword ? 'Hide password' : 'View password'}
        title={showPassword ? 'Hide password' : 'View password'}
      >
        <EyeIcon crossed={showPassword} />
      </button>
    </div>
  );
}
