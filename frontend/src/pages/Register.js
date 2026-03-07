import React, { useMemo, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authAPI, evaluateRegisterPassword } from '../utils/api';
import { COUNTRY_CODE_OPTIONS } from '../utils/countryCodes';

const inputClassName = 'mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';
const sectionClassName = 'space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5';
const sectionTitleClassName = 'text-base font-semibold text-gray-900';
const primaryButtonClassName = 'min-h-[44px] w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50';

function Register({ onSuccess, onWelcomeRequired }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token'), [searchParams]);

  const [form, setForm] = useState({
    realName: '',
    username: '',
    email: '',
    password: '',
    country: '',
    zipCode: '',
    referralCode: token || ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const passwordEvaluation = useMemo(
    () => evaluateRegisterPassword(form.password),
    [form.password]
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const zipCode = form.zipCode.trim().toUpperCase().replace(/\s+/g, '');
    const selectedCountry = COUNTRY_CODE_OPTIONS.find((option) => option.code === form.country);

    if (!selectedCountry) {
      toast.error('Please select a valid country');
      return;
    }

    const zipPattern = /^(?:\d{5}(?:-\d{4})?|[A-Z]\d[A-Z]\d[A-Z]\d)$/;
    if (!zipPattern.test(zipCode)) {
      toast.error('Zip Code must be a valid US ZIP (12345 or 12345-6789) or postal format');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        realName: form.realName,
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        countryCode: selectedCountry.code,
        zipCode,
        referralCode: form.referralCode || undefined
      };

      const { data } = await authAPI.register(payload);
      onSuccess(data);
      onWelcomeRequired?.(data.user || null);
      toast.success('Registration successful');
      navigate('/welcome');
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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 md:py-8">
      <div className="space-y-4 rounded-3xl border border-gray-200 bg-slate-50/80 p-4 shadow-sm sm:space-y-5 sm:p-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-gray-900">Create your SocialSecure account</h2>
          <p className="text-sm leading-6 text-gray-600">
            Start with your identity, choose secure credentials, then add your location for nearby social discovery.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          <section className={sectionClassName} aria-labelledby="register-profile-section">
            <div>
              <h3 id="register-profile-section" className={sectionTitleClassName}>Profile details</h3>
              <p className="mt-1 text-sm text-gray-600">
                Real name is required for registration. Your username is your public identity.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Real Name</label>
              <input
                name="realName"
                value={form.realName}
                onChange={handleChange}
                className={inputClassName}
                placeholder="Jane Doe"
                autoComplete="name"
                required
              />
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
            </div>
          </section>

          <section className={sectionClassName} aria-labelledby="register-credentials-section">
            <div>
              <h3 id="register-credentials-section" className={sectionTitleClassName}>Sign-in details</h3>
              <p className="mt-1 text-sm text-gray-600">
                Use a strong password so your account is ready for encrypted messaging and secure recovery.
              </p>
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
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                className={inputClassName}
                placeholder="At least 8 chars, upper/lower/number"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <details className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3" data-testid="password-requirements">
                <summary className="cursor-pointer list-none text-sm font-medium text-gray-700">
                  <span className="flex items-center justify-between gap-3">
                    <span>Show password rules</span>
                    <span className="text-xs text-gray-500">Strength: {passwordEvaluation.strengthLabel}</span>
                  </span>
                </summary>
                <ul className="mt-3 space-y-2 text-sm">
                  {passwordEvaluation.requirementChecks.map((requirement) => (
                    <li
                      key={requirement.id}
                      className={`flex items-center justify-between gap-2 ${
                        requirement.met ? 'text-green-700' : 'text-gray-600'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true">{requirement.met ? '✓' : '○'}</span>
                        <span>{requirement.label}</span>
                      </span>
                      <span className="text-xs">{requirement.met ? 'Met' : 'Not met'}</span>
                    </li>
                  ))}
                </ul>
                <p
                  className="mt-3 text-sm text-gray-700"
                  aria-live="polite"
                  role="status"
                >
                  Strength: <span className="font-medium">{passwordEvaluation.strengthLabel}</span>
                </p>
                {fieldErrors.password && (
                  <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>
                )}
              </details>
            </div>
          </section>

          <section className={sectionClassName} aria-labelledby="register-location-section">
            <div>
              <h3 id="register-location-section" className={sectionTitleClassName}>Location</h3>
              <p className="mt-1 text-sm text-gray-600">
                Your country and ZIP/postal code help personalize local discovery and matching.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="location-grid">
              <div>
                <label className="block text-sm font-medium text-gray-700">Country</label>
                <select
                  name="country"
                  value={form.country}
                  onChange={handleChange}
                  className={inputClassName}
                  required
                >
                  <option value="">Select country</option>
                  {COUNTRY_CODE_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Top 20 population countries are pinned first.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Zip Code</label>
                <input
                  name="zipCode"
                  value={form.zipCode}
                  onChange={handleChange}
                  className={inputClassName}
                  placeholder="12345 or A1A 1A1"
                  maxLength={10}
                  required
                />
                <p className="mt-1 text-xs text-gray-500">Used as the primary location key for chat matching.</p>
              </div>
            </div>
          </section>

          <section className={sectionClassName} aria-labelledby="register-referral-section">
            <div>
              <h3 id="register-referral-section" className={sectionTitleClassName}>Referral</h3>
              <p className="mt-1 text-sm text-gray-600">
                Add a referral code if a friend invited you. You can leave this blank and continue.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Referral Code (optional)</label>
              <input
                name="referralCode"
                value={form.referralCode}
                onChange={handleChange}
                className={inputClassName}
                placeholder="Referral token or code"
              />
            </div>
          </section>

          <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-slate-50/95 px-4 pb-4 pt-3 backdrop-blur sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0" data-testid="register-submit-footer">
            <button
              type="submit"
              disabled={submitting || !passwordEvaluation.allRequirementsMet}
              aria-describedby="password-submit-hint"
              className={primaryButtonClassName}
            >
              {submitting ? 'Creating account...' : 'Create Account'}
            </button>
            <p id="password-submit-hint" className="mt-3 text-sm text-gray-600" aria-live="polite">
              {passwordEvaluation.allRequirementsMet
                ? 'Password requirements satisfied.'
                : 'Complete all password requirements to enable account creation.'}
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
