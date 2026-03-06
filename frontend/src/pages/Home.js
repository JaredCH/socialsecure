import React from 'react';
import { Link } from 'react-router-dom';

function Home({ isAuthenticated = false }) {
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
