import React from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
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

const floatingEncryptionIcons = [
  {
    icon: '🔐',
    label: 'Encrypted DM',
    conversation: 'msg.enc',
    className: '-left-2 top-12 md:left-0 md:top-10'
  },
  {
    icon: '🛡️',
    label: 'Trust circle',
    conversation: 'friends-only',
    className: 'right-3 top-3 md:right-6 md:top-8'
  },
  {
    icon: '🗝️',
    label: 'PGP key',
    conversation: 'BYO key',
    className: 'left-8 bottom-12 md:left-12 md:bottom-16'
  },
  {
    icon: '💬',
    label: 'Secure reply',
    conversation: 'route locked',
    className: 'right-0 bottom-4 md:right-4 md:bottom-10'
  }
];

const networkNodes = [
  { id: 'u1', x: 16, y: 70, size: 'lg', label: 'You' },
  { id: 'u2', x: 36, y: 48, size: 'md', label: 'Friend' },
  { id: 'u3', x: 55, y: 32, size: 'md', label: 'Circle A' },
  { id: 'u4', x: 55, y: 66, size: 'md', label: 'Circle B' },
  { id: 'u5', x: 76, y: 14, size: 'sm', label: 'Node 1' },
  { id: 'u6', x: 82, y: 26, size: 'sm', label: 'Node 2' },
  { id: 'u7', x: 86, y: 40, size: 'sm', label: 'Node 3' },
  { id: 'u8', x: 84, y: 56, size: 'sm', label: 'Node 4' },
  { id: 'u9', x: 78, y: 72, size: 'sm', label: 'Node 5' },
  { id: 'u10', x: 71, y: 86, size: 'sm', label: 'Node 6' },
  { id: 'u11', x: 92, y: 58, size: 'sm', label: 'Node 7' },
  { id: 'u12', x: 92, y: 80, size: 'sm', label: 'Node 8' }
];

const networkLinks = [
  { from: 'u1', to: 'u2', stage: 0, curve: 10 },
  { from: 'u2', to: 'u3', stage: 1, curve: 8 },
  { from: 'u2', to: 'u4', stage: 1, curve: -6 },
  { from: 'u3', to: 'u5', stage: 2, curve: 7 },
  { from: 'u3', to: 'u6', stage: 2, curve: 2 },
  { from: 'u3', to: 'u7', stage: 2, curve: -4 },
  { from: 'u3', to: 'u8', stage: 2, curve: -9 },
  { from: 'u4', to: 'u9', stage: 2, curve: -4 },
  { from: 'u4', to: 'u10', stage: 2, curve: -9 },
  { from: 'u4', to: 'u11', stage: 2, curve: 3 },
  { from: 'u4', to: 'u12', stage: 2, curve: -2 }
];

const nodeRadius = {
  lg: 4.5,
  md: 3.4,
  sm: 2.5
};

function buildCurvePath(start, end, curve = 0) {
  const controlX = (start.x + end.x) / 2;
  const controlY = (start.y + end.y) / 2 - curve;

  return `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`;
}

function Home({ isAuthenticated = false }) {
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const backgroundLayerY = useTransform(scrollYProgress, [0, 0.45], [0, prefersReducedMotion ? 0 : -90]);
  const middleLayerY = useTransform(scrollYProgress, [0, 0.45], [0, prefersReducedMotion ? 0 : 55]);
  const foregroundLayerY = useTransform(scrollYProgress, [0, 0.45], [0, prefersReducedMotion ? 0 : -35]);

  return (
    <div className="space-y-10 pb-10">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 text-white shadow-xl">
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(96,165,250,0.3)_0%,_transparent_42%),radial-gradient(circle_at_bottom_left,_rgba(129,140,248,0.28)_0%,_transparent_46%)]"
          style={{ y: backgroundLayerY }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.28)_0%,_transparent_65%)] blur-3xl"
          style={{ y: middleLayerY }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 opacity-20"
          style={{ y: foregroundLayerY }}
        >
          <div className="h-full w-full bg-[linear-gradient(rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.16)_1px,transparent_1px)] bg-[size:72px_72px]" />
        </motion.div>

        <div className="relative px-6 py-10 md:px-10 md:py-14 lg:px-16 lg:py-16">
          <motion.p
            initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
            animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.2em] text-blue-100"
          >
            One platform • Social v Secure made simple
          </motion.p>

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <motion.div
              className="lg:col-span-7"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.08 }}
            >
              <h1 className="text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">
                One secure home for your people, plans, and private conversations.
              </h1>
              <p className="mt-4 max-w-2xl text-base text-blue-100 sm:text-lg">
                SocialSecure brings your feed, circles, maps, watch parties, calendar, and encrypted direct messages
                into one platform so you can manage friendships without trading away privacy.
              </p>
              <p className="mt-4 max-w-2xl text-sm text-blue-200 sm:text-base">
                Scroll through parallax layers, see encrypted conversations floating in motion, and watch a secure
                connection map grow from one trusted person into a wider network.
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
            </motion.div>

            <motion.div
              className="relative lg:col-span-5"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 26 }}
              animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.18 }}
            >
              <div className="rounded-[2rem] border border-white/20 bg-slate-950/35 p-5 shadow-2xl backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-200">Live secure growth</p>
                    <h2 className="mt-2 text-xl font-semibold">Parallax connection map</h2>
                  </div>
                  <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                    1 → 2 → 8 secure hops
                  </div>
                </div>

                <div
                  data-testid="hero-network-map"
                  className="relative mt-5 h-[22rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),transparent_45%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(15,23,42,0.75))]"
                >
                  <motion.div
                    aria-hidden="true"
                    className="absolute inset-0 opacity-30"
                    animate={prefersReducedMotion ? {} : { opacity: [0.2, 0.35, 0.22], scale: [1, 1.03, 1] }}
                    transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                      backgroundImage:
                        'linear-gradient(rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.18) 1px, transparent 1px)',
                      backgroundSize: '42px 42px'
                    }}
                  />
                  <motion.div
                    aria-hidden="true"
                    className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(59,130,246,0.22),transparent_28%),radial-gradient(circle_at_78%_65%,rgba(16,185,129,0.18),transparent_26%),radial-gradient(circle_at_92%_30%,rgba(129,140,248,0.18),transparent_24%)]"
                    style={{ y: middleLayerY }}
                  />

                  {floatingEncryptionIcons.map((item, index) => (
                    <motion.div
                      key={item.label}
                      data-testid="floating-encryption-icon"
                      className={`absolute w-28 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 shadow-lg backdrop-blur ${item.className}`}
                      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.94 }}
                      animate={
                        prefersReducedMotion
                          ? { opacity: 1 }
                          : {
                              opacity: 1,
                              y: [0, index % 2 === 0 ? -14 : 12, 0]
                            }
                      }
                      transition={{
                        duration: prefersReducedMotion ? 0 : 5 + index,
                        delay: prefersReducedMotion ? 0 : 0.45 + index * 0.15,
                        repeat: prefersReducedMotion ? 0 : Infinity,
                        ease: 'easeInOut'
                      }}
                    >
                      <p className="text-sm font-semibold text-white">
                        <span className="mr-1" aria-hidden="true">
                          {item.icon}
                        </span>
                        {item.label}
                      </p>
                      <p className="mt-1 text-xs text-blue-100">{item.conversation}</p>
                    </motion.div>
                  ))}

                  <svg
                    viewBox="0 0 100 100"
                    className="absolute inset-0 h-full w-full"
                    role="img"
                    aria-label="Animated map background showing secure connections expanding from one person to more trusted contacts"
                  >
                    <defs>
                      <linearGradient id="network-line-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="50%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#34d399" />
                      </linearGradient>
                    </defs>

                    {networkLinks.map((link, index) => {
                      const start = networkNodes.find((node) => node.id === link.from);
                      const end = networkNodes.find((node) => node.id === link.to);
                      const delay = link.stage * 0.6 + index * 0.08;

                      return (
                        <motion.path
                          key={`${link.from}-${link.to}`}
                          d={buildCurvePath(start, end, link.curve)}
                          fill="none"
                          stroke="url(#network-line-gradient)"
                          strokeWidth="0.65"
                          strokeLinecap="round"
                          initial={prefersReducedMotion ? false : { pathLength: 0, opacity: 0.35 }}
                          animate={prefersReducedMotion ? { pathLength: 1, opacity: 0.9 } : { pathLength: 1, opacity: [0.4, 1, 0.8] }}
                          transition={{
                            duration: prefersReducedMotion ? 0.01 : 0.95,
                            delay,
                            repeat: prefersReducedMotion ? 0 : Infinity,
                            repeatDelay: prefersReducedMotion ? 0 : 3.2,
                            ease: 'easeInOut'
                          }}
                        />
                      );
                    })}

                    {networkNodes.map((node, index) => (
                      <motion.g
                        key={node.id}
                        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.7 }}
                        animate={prefersReducedMotion ? { opacity: 1, scale: 1 } : { opacity: 1, scale: [1, 1.08, 1] }}
                        transition={{
                          duration: prefersReducedMotion ? 0.01 : 1.1,
                          delay: prefersReducedMotion ? 0 : 0.18 + index * 0.08,
                          repeat: prefersReducedMotion ? 0 : Infinity,
                          repeatDelay: prefersReducedMotion ? 0 : 2.8,
                          ease: 'easeInOut'
                        }}
                      >
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={nodeRadius[node.size] * 1.8}
                          fill="rgba(96, 165, 250, 0.14)"
                        />
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={nodeRadius[node.size]}
                          fill={node.id === 'u1' ? '#34d399' : '#e0f2fe'}
                          stroke={node.id === 'u1' ? '#6ee7b7' : '#93c5fd'}
                          strokeWidth="0.45"
                        />
                      </motion.g>
                    ))}
                  </svg>

                  <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-200">Encryption in motion</p>
                    <p className="mt-2 text-sm text-blue-50">
                      One trusted connection becomes two shared circles, then grows into a wider protected community with
                      every line drawn in sequence.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-2xl font-bold">1</p>
                    <p className="mt-2 text-sm text-blue-100">Start with one secure conversation.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-2xl font-bold">2</p>
                    <p className="mt-2 text-sm text-blue-100">Branch into trusted circles with smooth fades.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-2xl font-bold">8</p>
                    <p className="mt-2 text-sm text-blue-100">Grow the network without losing privacy controls.</p>
                  </div>
                </div>
              </div>
            </motion.div>
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
