import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authAPI } from '../utils/api';

const inputClassName = 'mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';
const sectionClassName = 'space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5';
const sectionTitleClassName = 'text-base font-semibold text-gray-900';
const primaryButtonClassName = 'min-h-[44px] w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50';

const USERNAME_REGEX = /^[a-zA-Z0-9_.]+$/;
const USERNAME_CHECK_DEBOUNCE_MS = 350;

function Register({ onSuccess }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token'), [searchParams]);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    zipCode: '',
    referralCode: token || ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [usernameStatus, setUsernameStatus] = useState({
    state: 'idle',
    message: ''
  });

  useEffect(() => {
    let cancelled = false;
    const rawUsername = String(form.username || '').trim();
    const normalizedUsername = rawUsername.toLowerCase();

    if (!normalizedUsername) {
      setUsernameStatus({ state: 'idle', message: '' });
      return () => {
        cancelled = true;
      };
    }

    if (normalizedUsername.length < 3) {
      setUsernameStatus({ state: 'invalid', message: 'Username must be at least 3 characters.' });
      return () => {
        cancelled = true;
      };
    }

    if (!USERNAME_REGEX.test(normalizedUsername)) {
      setUsernameStatus({ state: 'invalid', message: 'Only letters, numbers, underscores, and dots are allowed.' });
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(() => {
      const checkAvailability = async () => {
        try {
          setUsernameStatus({ state: 'checking', message: 'Checking availability…' });
          const { data } = await authAPI.checkUsernameAvailability(normalizedUsername);

          if (cancelled) return;
          setUsernameStatus(
            data?.available
              ? { state: 'available', message: 'Username is available.' }
              : { state: 'taken', message: 'Username is already taken.' }
          );
        } catch (error) {
          if (cancelled) return;
          const message = error.response?.data?.error || 'Unable to check username availability right now.';
          setUsernameStatus({ state: 'error', message });
        }
      };

      void checkAvailability();
    }, USERNAME_CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.username]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error('First and last name are required.');
      return;
    }

    const trimmedZip = form.zipCode.trim();
    if (!trimmedZip || !/^\d{5}(?:-\d{4})?$/.test(trimmedZip)) {
      toast.error('A valid US ZIP code is required (e.g. 12345 or 12345-6789).');
      return;
    }

    if (usernameStatus.state !== 'available') {
      toast.error('Please choose an available username before continuing.');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        zipCode: trimmedZip,
        referralCode: form.referralCode || undefined
      };

      const { data } = await authAPI.register(payload);
      onSuccess(data);
      toast.success('Registration successful');
      navigate('/onboarding');
    } catch (error) {
      const apiError = error.response?.data;
      const nextFieldErrors = (apiError?.errors || []).reduce((acc, currentError) => {
        if (currentError?.path && !acc[currentError.path]) {
          acc[currentError.path] = currentError.msg;
        }
        return acc;
      }, {});
      setFieldErrors(nextFieldErrors);
      const message = apiError?.error || apiError?.errors?.[0]?.msg || 'Registration failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const usernameStatusClassName = usernameStatus.state === 'available'
    ? 'text-green-700'
    : usernameStatus.state === 'taken' || usernameStatus.state === 'invalid' || usernameStatus.state === 'error'
      ? 'text-red-600'
      : 'text-gray-500';

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6 md:py-8">
      <div className="space-y-4 rounded-3xl border border-gray-200 bg-slate-50/80 p-4 shadow-sm sm:space-y-5 sm:p-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-gray-900">Create your SocialSecure account</h2>
          <p className="text-sm leading-6 text-gray-600">
            We only need your name, username, and email to get started. You&apos;ll complete encryption onboarding immediately after registration.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          <section className={sectionClassName} aria-labelledby="register-basic-section">
            <div>
              <h3 id="register-basic-section" className={sectionTitleClassName}>Basic details</h3>
              <p className="mt-1 text-sm text-gray-600">
                Enter your legal first/last name and choose your desired username.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">First name</label>
                <input
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  className={inputClassName}
                  placeholder="Jane"
                  autoComplete="given-name"
                  maxLength={50}
                  required
                />
                {fieldErrors.firstName && <p className="mt-1 text-sm text-red-600">{fieldErrors.firstName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Last name</label>
                <input
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  className={inputClassName}
                  placeholder="Doe"
                  autoComplete="family-name"
                  maxLength={50}
                  required
                />
                {fieldErrors.lastName && <p className="mt-1 text-sm text-red-600">{fieldErrors.lastName}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Username</label>
              <input
                name="username"
                value={form.username}
                onChange={handleChange}
                className={inputClassName}
                placeholder="jane_doe"
                autoComplete="username"
                minLength={3}
                maxLength={30}
                required
              />
              <p className={`mt-1 text-sm ${usernameStatusClassName}`} role="status" aria-live="polite">
                {usernameStatus.message || 'Your username will be checked as you type.'}
              </p>
              {fieldErrors.username && <p className="mt-1 text-sm text-red-600">{fieldErrors.username}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className={inputClassName}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
              {fieldErrors.email && <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">ZIP Code</label>
              <input
                name="zipCode"
                value={form.zipCode}
                onChange={handleChange}
                className={inputClassName}
                placeholder="12345"
                autoComplete="postal-code"
                inputMode="numeric"
                maxLength={10}
                required
              />
              <p className="mt-1 text-xs text-gray-500">Required. Powers your local news and weather.</p>
              {fieldErrors.zipCode && <p className="mt-1 text-sm text-red-600">{fieldErrors.zipCode}</p>}
            </div>
          </section>

          <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-slate-50/95 px-4 pb-4 pt-3 backdrop-blur sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0" data-testid="register-submit-footer">
            <button
              type="submit"
              disabled={submitting || usernameStatus.state !== 'available'}
              className={primaryButtonClassName}
            >
              {submitting ? 'Creating account...' : 'Create Account'}
            </button>
            <p className="mt-3 text-sm text-gray-600" aria-live="polite">
              {usernameStatus.state === 'available'
                ? 'Looks good. Continue to encryption onboarding.'
                : 'Choose an available username to continue.'}
            </p>
          </div>
        </form>

        <p className="text-sm text-gray-600">
          Already have an account?{' '}
          <Link className="font-medium text-blue-600 hover:text-blue-700" to="/login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
