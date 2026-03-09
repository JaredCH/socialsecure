import React, { useMemo, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authAPI, evaluateRegisterPassword } from '../utils/api';
import { COUNTRY_CODE_OPTIONS } from '../utils/countryCodes';

const inputClassName = 'mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';
const sectionClassName = 'space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5';
const sectionTitleClassName = 'text-base font-semibold text-gray-900';
const primaryButtonClassName = 'min-h-[44px] w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50';
const visibilitySelectClassName = 'mt-1 min-h-[40px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';

const PROFILE_VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'social', label: 'Social friends only' },
  { value: 'secure', label: 'Secure friends only' }
];
const AGE_OPTIONS = ['18-24', '25-34', '35-44', '45-54', '55+', 'Other'];
const SEX_OPTIONS = ['Female', 'Male', 'Non-binary', 'Prefer not to say', 'Other'];
const RACE_OPTIONS = ['Asian', 'Black', 'Hispanic or Latino', 'Middle Eastern', 'White', 'Prefer not to say', 'Other'];
const HOBBY_OPTIONS = ['Music', 'Gaming', 'Fitness', 'Reading', 'Travel', 'Cooking', 'Other'];
const SOCIAL_SECURE_FLASH_CARDS = [
  {
    title: 'Social mode',
    body: 'Use Social for everyday profile details you are happy to share with your social circle.'
  },
  {
    title: 'Secure mode',
    body: 'Use Secure for trusted-friends-only details. Great for private contact details and close-circle info.'
  },
  {
    title: 'Public mode',
    body: 'Use Public only when you want details to help discovery and search for everyone on SocialSecure.'
  }
];

function Register({ onSuccess, onWelcomeRequired }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token'), [searchParams]);

  const [form, setForm] = useState({
    realName: '',
    username: '',
    email: '',
    password: '',
    encryptionPassword: '',
    confirmEncryptionPassword: '',
    country: '',
    zipCode: '',
    homeAddressMode: '',
    homeAddress: '',
    worksAtMode: '',
    worksAt: '',
    ageGroup: '',
    ageOther: '',
    sex: '',
    sexOther: '',
    race: '',
    raceOther: '',
    hobbies: [],
    hobbyOther: '',
    profileFieldVisibility: {
      streetAddress: 'social',
      worksAt: 'social',
      ageGroup: 'social',
      hobbies: 'social',
      sex: 'social',
      race: 'social'
    },
    referralCode: token || ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [showPrivacyPrimer, setShowPrivacyPrimer] = useState(false);
  const [flashCardIndex, setFlashCardIndex] = useState(0);
  const passwordEvaluation = useMemo(
    () => evaluateRegisterPassword(form.password),
    [form.password]
  );
  const encryptionPasswordEvaluation = useMemo(
    () => evaluateRegisterPassword(form.encryptionPassword),
    [form.encryptionPassword]
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleVisibilityChange = (fieldName, value) => {
    setForm((prev) => ({
      ...prev,
      profileFieldVisibility: {
        ...prev.profileFieldVisibility,
        [fieldName]: value
      }
    }));
  };

  const handleHobbyToggle = (hobby) => {
    setForm((prev) => {
      const exists = prev.hobbies.includes(hobby);
      return {
        ...prev,
        hobbies: exists
          ? prev.hobbies.filter((entry) => entry !== hobby)
          : [...prev.hobbies, hobby]
      };
    });
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
    if (!encryptionPasswordEvaluation.allRequirementsMet) {
      toast.error('Please complete all encryption password requirements.');
      return;
    }
    if (form.encryptionPassword !== form.confirmEncryptionPassword) {
      toast.error('Encryption password confirmation does not match.');
      return;
    }

    setSubmitting(true);

    try {
      const normalizedAgeGroup = form.ageGroup === 'Other' ? form.ageOther.trim() : form.ageGroup;
      const normalizedSex = form.sex === 'Other' ? form.sexOther.trim() : form.sex;
      const normalizedRace = form.race === 'Other' ? form.raceOther.trim() : form.race;
      const normalizedHobbies = [
        ...form.hobbies.filter((entry) => entry !== 'Other'),
        ...(form.hobbies.includes('Other') && form.hobbyOther.trim() ? [form.hobbyOther.trim()] : [])
      ];
      const normalizedHomeAddress = ['city_state', 'full_address', 'other'].includes(form.homeAddressMode)
        ? form.homeAddress.trim()
        : '';
      const normalizedWorksAt = form.worksAtMode === 'student'
        ? 'Student'
        : form.worksAtMode === 'self_employed'
          ? 'Self-employed'
          : ['employed', 'other'].includes(form.worksAtMode)
            ? form.worksAt.trim()
            : '';
      const payload = {
        realName: form.realName,
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        countryCode: selectedCountry.code,
        zipCode,
        streetAddress: normalizedHomeAddress || undefined,
        worksAt: normalizedWorksAt || undefined,
        ageGroup: normalizedAgeGroup || undefined,
        hobbies: normalizedHobbies,
        sex: normalizedSex || undefined,
        race: normalizedRace || undefined,
        profileFieldVisibility: form.profileFieldVisibility,
        referralCode: form.referralCode || undefined
      };

      const { data } = await authAPI.register(payload);
      onSuccess(data);
      await authAPI.setEncryptionPassword({
        encryptionPassword: form.encryptionPassword,
        confirmEncryptionPassword: form.confirmEncryptionPassword
      });
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
            Start with your identity, choose secure credentials, then add optional profile details for discovery.
          </p>
          <button
            type="button"
            onClick={() => setShowPrivacyPrimer(true)}
            className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            Social vs Secure in 30 seconds
          </button>
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

          <section className={sectionClassName} aria-labelledby="register-encryption-section">
            <div>
              <h3 id="register-encryption-section" className={sectionTitleClassName}>Encryption setup (single step)</h3>
              <p className="mt-1 text-sm text-gray-600">
                Create your encryption password now so secure features are ready immediately after sign up.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Encryption Password</label>
                <input
                  type="password"
                  name="encryptionPassword"
                  value={form.encryptionPassword}
                  onChange={handleChange}
                  className={inputClassName}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Confirm Encryption Password</label>
                <input
                  type="password"
                  name="confirmEncryptionPassword"
                  value={form.confirmEncryptionPassword}
                  onChange={handleChange}
                  className={inputClassName}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Strength: {encryptionPasswordEvaluation.strengthLabel}. Use this password to unlock secure friend-only features.
            </p>
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

          <section className={sectionClassName} aria-labelledby="register-optional-life-section">
            <div>
              <h3 id="register-optional-life-section" className={sectionTitleClassName}>Optional panel: Home & work</h3>
              <p className="mt-1 text-sm text-gray-600">
                Optional details for better friend discovery and homepage search matches.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Home address detail</label>
                <select name="homeAddressMode" value={form.homeAddressMode} onChange={handleChange} className={inputClassName}>
                  <option value="">Skip for now</option>
                  <option value="city_state">City + state only</option>
                  <option value="full_address">Full address</option>
                  <option value="other">Other</option>
                </select>
                {['city_state', 'full_address', 'other'].includes(form.homeAddressMode) && (
                  <input
                    name="homeAddress"
                    value={form.homeAddress}
                    onChange={handleChange}
                    className={inputClassName}
                    placeholder="Enter the address detail you want to share"
                    maxLength={200}
                  />
                )}
                <label className="block text-xs font-medium text-gray-600 mt-2">Who can see this?</label>
                <select
                  value={form.profileFieldVisibility.streetAddress}
                  onChange={(event) => handleVisibilityChange('streetAddress', event.target.value)}
                  className={visibilitySelectClassName}
                >
                  {PROFILE_VISIBILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Place of employment</label>
                <select name="worksAtMode" value={form.worksAtMode} onChange={handleChange} className={inputClassName}>
                  <option value="">Skip for now</option>
                  <option value="student">Student</option>
                  <option value="self_employed">Self-employed</option>
                  <option value="employed">Employed at a company</option>
                  <option value="other">Other</option>
                </select>
                {['employed', 'other'].includes(form.worksAtMode) && (
                  <input
                    name="worksAt"
                    value={form.worksAt}
                    onChange={handleChange}
                    className={inputClassName}
                    placeholder={form.worksAtMode === 'employed' ? 'Company name' : 'Other employment detail'}
                    maxLength={120}
                  />
                )}
                <label className="block text-xs font-medium text-gray-600 mt-2">Who can see this?</label>
                <select
                  value={form.profileFieldVisibility.worksAt}
                  onChange={(event) => handleVisibilityChange('worksAt', event.target.value)}
                  className={visibilitySelectClassName}
                >
                  {PROFILE_VISIBILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className={sectionClassName} aria-labelledby="register-optional-identity-section">
            <div>
              <h3 id="register-optional-identity-section" className={sectionTitleClassName}>Optional panel: Identity details</h3>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Age group</label>
                <select name="ageGroup" value={form.ageGroup} onChange={handleChange} className={inputClassName}>
                  <option value="">Skip for now</option>
                  {AGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                {form.ageGroup === 'Other' && (
                  <input name="ageOther" value={form.ageOther} onChange={handleChange} className={inputClassName} placeholder="Your age group" maxLength={40} />
                )}
                <label className="block text-xs font-medium text-gray-600 mt-2">Who can see this?</label>
                <select value={form.profileFieldVisibility.ageGroup} onChange={(event) => handleVisibilityChange('ageGroup', event.target.value)} className={visibilitySelectClassName}>
                  {PROFILE_VISIBILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Sex</label>
                <select name="sex" value={form.sex} onChange={handleChange} className={inputClassName}>
                  <option value="">Skip for now</option>
                  {SEX_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                {form.sex === 'Other' && (
                  <input name="sexOther" value={form.sexOther} onChange={handleChange} className={inputClassName} placeholder="Your value" maxLength={40} />
                )}
                <label className="block text-xs font-medium text-gray-600 mt-2">Who can see this?</label>
                <select value={form.profileFieldVisibility.sex} onChange={(event) => handleVisibilityChange('sex', event.target.value)} className={visibilitySelectClassName}>
                  {PROFILE_VISIBILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Race</label>
                <select name="race" value={form.race} onChange={handleChange} className={inputClassName}>
                  <option value="">Skip for now</option>
                  {RACE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                {form.race === 'Other' && (
                  <input name="raceOther" value={form.raceOther} onChange={handleChange} className={inputClassName} placeholder="Your value" maxLength={60} />
                )}
                <label className="block text-xs font-medium text-gray-600 mt-2">Who can see this?</label>
                <select value={form.profileFieldVisibility.race} onChange={(event) => handleVisibilityChange('race', event.target.value)} className={visibilitySelectClassName}>
                  {PROFILE_VISIBILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className={sectionClassName} aria-labelledby="register-optional-hobbies-section">
            <div>
              <h3 id="register-optional-hobbies-section" className={sectionTitleClassName}>Optional panel: Hobbies</h3>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {HOBBY_OPTIONS.map((hobby) => (
                <label key={hobby} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.hobbies.includes(hobby)}
                    onChange={() => handleHobbyToggle(hobby)}
                  />
                  <span>{hobby}</span>
                </label>
              ))}
            </div>
            {form.hobbies.includes('Other') && (
              <input
                name="hobbyOther"
                value={form.hobbyOther}
                onChange={handleChange}
                className={inputClassName}
                placeholder="Your hobby"
                maxLength={60}
              />
            )}
            <label className="block text-xs font-medium text-gray-600 mt-2">Who can see this?</label>
            <select value={form.profileFieldVisibility.hobbies} onChange={(event) => handleVisibilityChange('hobbies', event.target.value)} className={visibilitySelectClassName}>
              {PROFILE_VISIBILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
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
              disabled={
                submitting
                || !passwordEvaluation.allRequirementsMet
                || !encryptionPasswordEvaluation.allRequirementsMet
                || form.encryptionPassword !== form.confirmEncryptionPassword
              }
              aria-describedby="password-submit-hint"
              className={primaryButtonClassName}
            >
              {submitting ? 'Creating account...' : 'Create Account'}
            </button>
            <p id="password-submit-hint" className="mt-3 text-sm text-gray-600" aria-live="polite">
              {passwordEvaluation.allRequirementsMet
                ? encryptionPasswordEvaluation.allRequirementsMet
                  ? form.encryptionPassword === form.confirmEncryptionPassword
                    ? 'Password and encryption setup requirements satisfied.'
                    : 'Encryption password confirmation must match.'
                  : 'Complete encryption password requirements to continue.'
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
      {showPrivacyPrimer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Social vs Secure, quick tour</h3>
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4" data-testid="social-secure-flash-card">
              <p className="text-sm font-semibold text-blue-900">{SOCIAL_SECURE_FLASH_CARDS[flashCardIndex].title}</p>
              <p className="mt-2 text-sm text-blue-800">{SOCIAL_SECURE_FLASH_CARDS[flashCardIndex].body}</p>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button type="button" onClick={() => setFlashCardIndex((prev) => (prev > 0 ? prev - 1 : prev))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">Back</button>
              <span className="text-xs text-gray-500">{flashCardIndex + 1} / {SOCIAL_SECURE_FLASH_CARDS.length}</span>
              <button type="button" onClick={() => setFlashCardIndex((prev) => (prev < SOCIAL_SECURE_FLASH_CARDS.length - 1 ? prev + 1 : prev))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">Next</button>
            </div>
            <button type="button" onClick={() => setShowPrivacyPrimer(false)} className="mt-4 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Register;
