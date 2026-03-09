import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { userAPI } from '../utils/api';

export const SEARCH_DEBOUNCE_MS = 250;
const AGE_FILTER_DEFAULT = 35;
const AGE_FILTER_MIN = 18;
const AGE_FILTER_MAX = 100;
const US_STATE_OPTIONS = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];
const SEX_OPTIONS = ['Female', 'Male', 'Non-binary', 'Intersex', 'Other', 'Prefer not to say'];
const RACE_OPTIONS = [
  'American Indian or Alaska Native',
  'Asian',
  'Black or African American',
  'Native Hawaiian or Other Pacific Islander',
  'White',
  'Other',
  'Prefer not to say'
];
const buildSuggestions = (values = []) => (
  Array.from(new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )).slice(0, 25)
);

function Home({ isAuthenticated = false }) {
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchNotice, setSearchNotice] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchForm, setSearchForm] = useState({
    firstName: '',
    lastName: '',
    city: '',
    state: '',
    zip: '',
    county: '',
    phone: '',
    streetAddress: '',
    friendsOfUser: '',
    worksAt: '',
    hobbies: '',
    ageFilters: '',
    sex: '',
    race: ''
  });
  const activeSearchRequestRef = useRef(0);
  const citySuggestions = useMemo(
    () => buildSuggestions(searchResults.map((user) => user.city)),
    [searchResults]
  );
  const countySuggestions = useMemo(
    () => buildSuggestions(searchResults.map((user) => user.county)),
    [searchResults]
  );
  const zipSuggestions = useMemo(
    () => buildSuggestions(searchResults.map((user) => user.zipCode)),
    [searchResults]
  );
  const ageFilterEnabled = (searchForm.ageFilters || '').trim().length > 0;
  const parsedAgeFilter = Number.parseInt(searchForm.ageFilters, 10);
  const ageFilterValue = Number.isFinite(parsedAgeFilter)
    ? Math.min(Math.max(parsedAgeFilter, AGE_FILTER_MIN), AGE_FILTER_MAX)
    : AGE_FILTER_DEFAULT;

  const onSearchFieldChange = (event) => {
    const { name, value } = event.target;
    setSearchForm((prev) => ({ ...prev, [name]: value }));
  };

  const runSearch = async (criteria) => {
    setSearchError('');
    setSearchNotice('');

    const normalizedCriteria = Object.entries(criteria || {}).reduce((acc, [key, value]) => {
      acc[key] = String(value || '').trim();
      return acc;
    }, {});

    const requestId = activeSearchRequestRef.current + 1;
    activeSearchRequestRef.current = requestId;
    setSearching(true);
    try {
      const { data } = await userAPI.search(normalizedCriteria);
      if (requestId !== activeSearchRequestRef.current) {
        return;
      }
      setSearchResults(Array.isArray(data?.users) ? data.users : []);
      if (Array.isArray(data?.unsupportedCriteria) && data.unsupportedCriteria.length > 0) {
        setSearchNotice(`Some criteria are accepted but not yet directly rankable: ${data.unsupportedCriteria.join(', ')}.`);
      } else {
        setSearchNotice('');
      }
    } catch (error) {
      if (requestId !== activeSearchRequestRef.current) {
        return;
      }
      setSearchError(error.response?.data?.error || 'Search session failed. Please try again.');
      setSearchResults([]);
      setSearchNotice('');
    } finally {
      if (requestId === activeSearchRequestRef.current) {
        setSearching(false);
      }
    }
  };

  const handleSearch = (event) => {
    event.preventDefault();
    runSearch(searchForm);
  };

  useEffect(() => {
    const hasAnyCriteria = Object.values(searchForm).some((value) => value.trim().length > 0);
    if (!hasAnyCriteria) {
      runSearch(searchForm);
      return undefined;
    }

    const timer = setTimeout(() => {
      runSearch(searchForm);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchForm]);

  const featureHighlights = [
    {
      title: 'Interactive maps with population density heatmaps',
      description:
        'Explore local activity through map views and density overlays that help communities understand where conversations are happening.'
    },
    {
      title: 'Geo chat rooms plus encrypted direct messaging',
      description:
        'Join location-based chat rooms, then move to private end-to-end encrypted chats when conversations need stronger privacy.'
    },
    {
      title: 'Calendars, circles, and watch parties',
      description:
        'Coordinate events with shared calendars, organize trusted circles, and host watch parties that keep your group connected.'
    },
    {
      title: 'Custom profiles with resume and blog support',
      description:
        'Build a personalized profile page, publish blog-style updates, and share resume-ready experience highlights in one place.'
    }
  ];

  const trustSignals = [
    'Security-forward architecture with E2EE messaging',
    'Account-level controls for encryption setup',
    'No sensitive message content exposed in the UI layer'
  ];

  const socialProof = [
    {
      quote:
        'SocialSecure feels like a social platform that actually respects privacy from day one.',
      role: 'Early community member'
    },
    {
      quote:
        'The experience is simple enough for daily use while keeping security messaging clear and reassuring.',
      role: 'Security-minded tester'
    }
  ];

  const platformCapabilities = [
    {
      title: 'Maps and heatmaps',
      description:
        'Switch between map views and density overlays to discover what is trending around your community.'
    },
    {
      title: 'Chat rooms and DMs',
      description:
        'Keep up with regional chat rooms, circles, and private conversations secured with modern encryption.'
    },
    {
      title: 'Calendar planning',
      description:
        'Plan events, share schedules, and keep your community aligned with integrated calendar tools.'
    },
    {
      title: 'Circles and watch parties',
      description:
        'Create smaller trusted groups and watch together in real time for a more social, less noisy experience.'
    },
    {
      title: 'Custom profile pages',
      description:
        'Showcase who you are with profile customization, featured interests, and community-facing identity controls.'
    },
    {
      title: 'Resume and blog support',
      description:
        'Share career experience with resume tools and publish longer-form blog content without leaving SocialSecure.'
    }
  ];

  return (
    <div className="space-y-10 pb-10">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white shadow-xl">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top_right,_#60a5fa_0%,_transparent_45%),radial-gradient(circle_at_bottom_left,_#818cf8_0%,_transparent_50%)]" />
        <div className="relative px-6 py-10 md:px-10 md:py-14 lg:px-16 lg:py-16">
          <p className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-medium tracking-wider uppercase">
            Private by default • E2EE-first social platform
          </p>

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7">
              <h1 className="text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">
                Build real connections on a social network designed around trust.
              </h1>
              <p className="mt-4 max-w-2xl text-base text-blue-100 sm:text-lg">
                SocialSecure combines maps, heatmaps, chat rooms, circles, watch parties, calendars, custom profiles, and encrypted messaging in one trusted network.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                {isAuthenticated ? (
                  <>
                    <Link
                      to="/social"
                      className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      Open Social Feed
                    </Link>
                    <Link
                      to="/maps"
                      className="rounded-lg border border-white/40 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      Explore Maps
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      to="/register"
                      className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      Sign Up Free
                    </Link>
                    <Link
                      to="/login"
                      className="rounded-lg border border-white/40 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      Login
                    </Link>
                  </>
                )}
                <a
                  href="#why-socialsecure"
                  className="rounded-lg border border-transparent px-5 py-3 text-sm font-semibold text-blue-100 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Learn More
                </a>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-blue-100">
                <span>✓ End-to-end encrypted chats</span>
                <span>✓ Location maps + heatmaps</span>
                <span>✓ Circles, calendars, and watch parties</span>
                <span>✓ Custom profiles, resumes, and blogs</span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
                <h2 className="text-xl font-semibold">Why people choose SocialSecure</h2>
                <ul className="mt-4 space-y-3 text-sm text-blue-100">
                  <li className="rounded-lg border border-white/15 bg-slate-900/20 px-3 py-2">
                    Privacy and security are core features, not hidden settings.
                  </li>
                  <li className="rounded-lg border border-white/15 bg-slate-900/20 px-3 py-2">
                    Clean onboarding paths for new users and returning members.
                  </li>
                  <li className="rounded-lg border border-white/15 bg-slate-900/20 px-3 py-2">
                    Designed to communicate trust in seconds, especially on mobile.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="search-session-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="search-session-heading" className="text-xl font-bold text-slate-900 sm:text-2xl">Start a Search Session</h2>
            <p className="mt-1 text-sm text-slate-600">
              All fields are optional. SocialSecure ranks results by how closely each profile matches your criteria.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            Focus: accurate people search
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          <form onSubmit={handleSearch} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4 xl:col-span-7">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Name First</span>
                <input name="firstName" value={searchForm.firstName} onChange={onSearchFieldChange} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Name Last</span>
                <input name="lastName" value={searchForm.lastName} onChange={onSearchFieldChange} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">City</span>
                <input name="city" list="home-city-suggestions" value={searchForm.city} onChange={onSearchFieldChange} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">State</span>
                <select name="state" value={searchForm.state} onChange={onSearchFieldChange} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="">Any state</option>
                  {US_STATE_OPTIONS.map((stateCode) => (
                    <option key={stateCode} value={stateCode}>{stateCode}</option>
                  ))}
                </select>
              </label>
            </div>
            <datalist id="home-city-suggestions">
              {citySuggestions.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>

            <details className="rounded-xl border border-slate-200 bg-white p-3" open>
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">More filters</summary>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Zip</span>
                  <input name="zip" list="home-zip-suggestions" value={searchForm.zip} onChange={onSearchFieldChange} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">County</span>
                  <input name="county" list="home-county-suggestions" value={searchForm.county} onChange={onSearchFieldChange} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Phone</span>
                  <input name="phone" value={searchForm.phone} onChange={onSearchFieldChange} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Street Address</span>
                  <input name="streetAddress" value={searchForm.streetAddress} onChange={onSearchFieldChange} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Friends of User</span>
                  <input name="friendsOfUser" value={searchForm.friendsOfUser} onChange={onSearchFieldChange} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Works At</span>
                  <input name="worksAt" value={searchForm.worksAt} onChange={onSearchFieldChange} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Hobbies</span>
                  <input name="hobbies" value={searchForm.hobbies} onChange={onSearchFieldChange} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Sex</span>
                  <select name="sex" value={searchForm.sex} onChange={onSearchFieldChange} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">Any</option>
                    {SEX_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Race</span>
                  <select name="race" value={searchForm.race} onChange={onSearchFieldChange} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">Any</option>
                    {RACE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-700 sm:col-span-2 lg:col-span-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-medium">Age Filters</span>
                    <span id="age-filter-status" aria-live="polite" className="text-xs text-slate-500">
                      {ageFilterEnabled ? `Minimum ${ageFilterValue}` : 'Minimum age (optional)'}
                    </span>
                  </div>
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        name="ageFiltersEnabled"
                        aria-label="Enable age filter"
                        checked={ageFilterEnabled}
                        onChange={(event) => {
                          const nextValue = event.target.checked ? String(ageFilterValue) : '';
                          setSearchForm((prev) => ({ ...prev, ageFilters: nextValue }));
                        }}
                      />
                      Enable age filter
                    </label>
                    <input
                      type="range"
                      min={AGE_FILTER_MIN}
                      max={AGE_FILTER_MAX}
                      step="1"
                      name="ageFilters"
                      aria-describedby="age-filter-status"
                      disabled={!ageFilterEnabled}
                      value={ageFilterValue}
                      onChange={onSearchFieldChange}
                      className="h-2 w-full cursor-pointer accent-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </div>
                </label>
              </div>
            </details>
            <datalist id="home-county-suggestions">
              {countySuggestions.map((county) => (
                <option key={county} value={county} />
              ))}
            </datalist>
            <datalist id="home-zip-suggestions">
              {zipSuggestions.map((zip) => (
                <option key={zip} value={zip} />
              ))}
            </datalist>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="submit" disabled={searching} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">
                {searching ? 'Searching…' : 'Search'}
              </button>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">Live results as you type</span>
              {searchError ? <p className="text-sm text-red-600">{searchError}</p> : null}
              {!searchError && searchNotice ? <p className="text-sm text-amber-700">{searchNotice}</p> : null}
            </div>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 lg:col-span-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Search Results</h3>
              <span className="text-xs text-slate-500">{searchResults.length} shown</span>
            </div>
            {searchResults.length > 0 ? (
              <ul className="max-h-[36rem] space-y-3 overflow-y-auto pr-1">
              {searchResults.map((user) => (
                <li key={user._id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {user.bannerUrl ? (
                    <img src={user.bannerUrl} alt={`${user.realName || user.username} hero`} className="h-20 w-full object-cover" />
                  ) : (
                    <div className="h-20 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-slate-700" />
                  )}
                  <div className="flex items-center gap-3 p-3">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={`${user.realName || user.username} profile`} className="h-12 w-12 rounded-full border border-white object-cover shadow-sm" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                        {String(user.realName || user.username || '?')
                          .split(' ')
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => part[0]?.toUpperCase() || '')
                          .join('')}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{user.realName || user.username}</p>
                      <p className="truncate text-xs text-slate-600">@{user.username} · {user.city || 'N/A'}{user.state ? `, ${user.state}` : ''}</p>
                    </div>
                  </div>
                </li>
              ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No profiles available yet.</p>
            )}
          </div>
        </div>
      </section>

      <section id="why-socialsecure" className="space-y-5" aria-labelledby="feature-heading">
        <div className="text-center">
          <h2 id="feature-heading" className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Security, usability, and community in one platform
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-600 sm:text-base">
            Everything on the home experience is built to reduce hesitation and make it easy to start safely.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {featureHighlights.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900">{feature.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="planned-features-heading">
        <div className="text-center">
          <h2 id="planned-features-heading" className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Everything you can do on SocialSecure
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-600 sm:text-base">
            From discovery to private messaging and professional presence, SocialSecure keeps community and privacy in
            the same experience.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {platformCapabilities.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-3 text-sm text-slate-600">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <article className="rounded-2xl border border-blue-100 bg-blue-50 p-6 lg:col-span-3">
          <h2 className="text-xl font-semibold text-slate-900">Trust indicators that lower signup friction</h2>
          <p className="mt-2 text-sm text-slate-700">
            Visitors should understand the platform promise at a glance: secure communication, transparent controls, and a respectful social environment.
          </p>

          <ul className="mt-4 space-y-2 text-sm text-slate-800">
            {trustSignals.map((signal) => (
              <li key={signal} className="flex items-start gap-2">
                <span className="mt-0.5 text-blue-600">✓</span>
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-xl font-semibold text-slate-900">What early users notice</h2>
          <div className="mt-4 space-y-4">
            {socialProof.map((proof) => (
              <figure key={proof.quote} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <blockquote className="text-sm text-gray-700">“{proof.quote}”</blockquote>
                <figcaption className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                  {proof.role}
                </figcaption>
              </figure>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <h2 className="text-2xl font-bold text-slate-900">Ready for a more secure social experience?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-600 sm:text-base">
          Connect with your community across maps, circles, chat, calendars, watch parties, and profile tools while
          keeping privacy and end-to-end encryption front and center.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {isAuthenticated ? (
            <>
              <Link
                to="/social"
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Go to Social
              </Link>
              <Link
                to="/calendar"
                className="rounded-lg border border-gray-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
              >
                Open Calendar
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/register"
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Register
              </Link>
              <Link
                to="/login"
                className="rounded-lg border border-gray-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
              >
                Login
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default Home;
