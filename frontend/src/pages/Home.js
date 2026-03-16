import React from 'react';
import { Link } from 'react-router-dom';

const featureHighlights = [
  {
    title: 'Social, secure, and organized in one place',
    description:
      'Move between your social feed, circles, calendar, watch parties, maps, and private messaging without juggling separate apps.'
  },
  {
    title: 'Manage every kind of friend connection',
    description:
      'Use the Social v Secure system to keep casual updates public, close friends in trusted circles, and sensitive conversations locked down.'
  },
  {
    title: 'Encrypted direct messages with optional BYO PGP',
    description:
      'Every direct message is built around encrypted delivery, and advanced users can bring their own PGP keys for extra control.'
  },
  {
    title: 'Local discovery without sacrificing privacy',
    description:
      'See what is happening nearby through maps, heatmaps, and community rooms, then choose exactly when to step into private space.'
  }
];

const friendManagementExamples = [
  {
    title: 'Inner circle planning',
    description:
      'Create a trusted circle for your closest friends, share event plans on the calendar, and move side conversations into encrypted DMs when details matter.'
  },
  {
    title: 'Social vs. secure conversations',
    description:
      'Post updates for everyone in your network, then switch to secure one-to-one messaging for addresses, schedules, and other private details.'
  },
  {
    title: 'Projects, family, and local groups',
    description:
      'Use circles, watch parties, and room chat to stay organized across hobbies, neighborhood groups, family coordination, and collaborative projects.'
  }
];

const privacyDetails = [
  'Direct messages are completely encrypted to protect private conversations.',
  'Bring your own PGP keys if you want to manage personal encryption credentials.',
  'Keep community discovery public while reserving sensitive details for secure channels.',
  'Built to make privacy understandable for everyday users and flexible for security-minded members.'
];

const platformCapabilities = [
  {
    title: 'Social feed and circles',
    description:
      'Share updates broadly or organize people into smaller trusted groups that match how you actually manage friendships.'
  },
  {
    title: 'Encrypted chat and DMs',
    description:
      'Jump from community rooms into private, encrypted direct messages whenever a conversation needs stronger protection.'
  },
  {
    title: 'Maps and heatmaps',
    description:
      'Explore activity by place, discover what is happening nearby, and connect local conversations to real communities.'
  },
  {
    title: 'Calendars and event planning',
    description:
      'Coordinate gatherings, reminders, and shared plans without leaving the same platform where your friends already talk.'
  },
  {
    title: 'Watch parties and shared moments',
    description:
      'Turn passive scrolling into real interaction with watch parties and group experiences that keep people engaged together.'
  },
  {
    title: 'Profiles, resumes, and blogs',
    description:
      'Present who you are with custom profiles, professional highlights, and longer-form posts that live alongside your social presence.'
  }
];

function Home({ isAuthenticated = false }) {
  return (
    <div className="space-y-10 pb-10">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(96,165,250,0.35)_0%,_transparent_42%),radial-gradient(circle_at_bottom_left,_rgba(129,140,248,0.35)_0%,_transparent_46%)]" />
        <div className="relative px-6 py-10 md:px-10 md:py-14 lg:px-16 lg:py-16">
            <p className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.2em] text-blue-100">
              One platform • Social v Secure made simple
          </p>

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7">
              <h1 className="text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">
                One secure home for your people, plans, and private conversations.
              </h1>
              <p className="mt-4 max-w-2xl text-base text-blue-100 sm:text-lg">
                SocialSecure brings your feed, circles, maps, watch parties, calendar, and encrypted direct messages
                into one platform so you can manage friendships without trading away privacy.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                {isAuthenticated ? (
                  <>
                    <Link
                      to="/social"
                      className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      Open Social Feed
                    </Link>
                    <Link
                      to="/chat"
                      className="rounded-lg border border-white/40 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      Open Chat
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      to="/register"
                      className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
                  href="#platform-overview"
                  className="rounded-lg border border-transparent px-5 py-3 text-sm font-semibold text-blue-100 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Explore the platform
                </a>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-blue-100">
                <span>✓ Completely encrypted direct messages</span>
                <span>✓ Bring your own PGP support</span>
                <span>✓ Circles, calendars, maps, and watch parties</span>
                <span>✓ Social v Secure friend management</span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-3xl border border-white/20 bg-white/10 p-6 backdrop-blur">
                <h2 className="text-xl font-semibold">Why SocialSecure stands out</h2>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/15 bg-slate-950/30 p-4">
                    <p className="text-3xl font-bold">1</p>
                    <p className="mt-2 text-sm text-blue-100">One platform for feed, chat, maps, events, and profiles.</p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-slate-950/30 p-4">
                    <p className="text-3xl font-bold">2</p>
                    <p className="mt-2 text-sm text-blue-100">Two modes of connection: social sharing and secure messaging.</p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-slate-950/30 p-4 sm:col-span-2">
                    <p className="text-sm font-semibold uppercase tracking-wide text-blue-100">Built for trust</p>
                    <p className="mt-2 text-sm text-blue-50">
                      Start in public community spaces, then move private details into protected conversations with encryption and optional personal PGP keys.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="platform-overview" className="space-y-5" aria-labelledby="feature-heading">
        <div className="text-center">
          <h2 id="feature-heading" className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Everything users need to feel connected and protected
          </h2>
          <p className="mx-auto mt-3 max-w-3xl text-sm text-slate-600 sm:text-base">
            SocialSecure is built to show visitors why staying on one platform is useful: fewer fragmented apps,
            clearer privacy choices, and better control over how every friendship is managed.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featureHighlights.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-3 text-sm text-slate-600">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold text-slate-900">Manage friends with the Social v Secure system</h2>
          <p className="mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
            Not every relationship needs the same visibility. SocialSecure helps you decide what stays social and what
            moves into secure space so your platform matches real life.
          </p>
          <div className="mt-6 space-y-4">
            {friendManagementExamples.map((example) => (
              <div key={example.title} className="rounded-2xl border border-blue-100 bg-white p-5">
                <h3 className="text-lg font-semibold text-slate-900">{example.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{example.description}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold">Direct messages built for privacy-first communication</h2>
          <p className="mt-3 text-sm text-slate-300 sm:text-base">
            Private conversations should feel private by default. SocialSecure keeps direct messaging encrypted and
            gives advanced users a bring your own PGP path when they want deeper control over key ownership.
          </p>
          <ul className="mt-6 space-y-3">
            {privacyDetails.map((detail) => (
              <li key={detail} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                {detail}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="space-y-5" aria-labelledby="capabilities-heading">
        <div className="text-center">
          <h2 id="capabilities-heading" className="text-2xl font-bold text-slate-900 sm:text-3xl">
            All the core features of your network, under one roof
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
            Every feature is designed to reinforce the same promise: easy social connection when you want it, stronger
            protection when you need it.
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

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">A better first impression for a useful platform</h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
              SocialSecure is more than one feature. It is a complete place to keep up with friends, plan together,
              explore your community, and protect sensitive conversations without leaving the same experience.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Platform promise</p>
            <p className="mt-3 text-sm text-slate-600">
              From public updates to encrypted DMs with bring your own PGP support, SocialSecure helps users control
              how every connection is handled.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <h2 className="text-2xl font-bold text-slate-900">Ready for a more secure social experience?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
          Join one platform where you can manage friends, host shared moments, plan events, and keep private
          conversations completely encrypted.
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
                className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
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
                className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
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
