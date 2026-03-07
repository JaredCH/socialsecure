import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authAPI, evaluateRegisterPassword } from '../utils/api';

const inputClassName = 'mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';
const primaryButtonClassName = 'min-h-[44px] w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50';

function Login({ onSuccess }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const passwordEvaluation = useMemo(
    () => evaluateRegisterPassword(form.password),
    [form.password]
  );

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data } = await authAPI.login(form);
      onSuccess(data);
      toast.success('Logged in successfully');
      navigate('/');
    } catch (error) {
      const message = error.response?.data?.error || 'Login failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-4 sm:px-6 md:py-8">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="px-4 py-5 sm:px-6 sm:py-6">
          <h2 className="text-2xl font-semibold text-gray-900">Login</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Sign in with your email or username to get back to your secure conversations and settings.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 border-t border-gray-100 px-4 py-5 sm:px-6 sm:py-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email or Username</label>
            <input
              name="identifier"
              value={form.identifier}
              onChange={handleChange}
              className={inputClassName}
              placeholder="you@example.com or your_username"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              className={inputClassName}
              placeholder="Your password"
              autoComplete="current-password"
              required
            />
            <p className="mt-2 hidden text-xs text-gray-600 sm:block">
              Password quality indicator (advisory only).
            </p>
            <p className="mt-2 text-sm text-gray-700" aria-live="polite" role="status">
              Strength: <span className="font-medium">{passwordEvaluation.strengthLabel}</span>
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className={primaryButtonClassName}
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="border-t border-gray-100 px-4 py-4 sm:px-6">
          <p className="text-sm text-gray-600">
            No account yet?{' '}
            <Link className="font-medium text-blue-600 hover:text-blue-700" to="/register">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
