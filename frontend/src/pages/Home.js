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

const floatingMapBadges = [
  {
    icon: '📍',
    label: 'Location sharing',
    conversation: 'Live pin sync',
    className: '-left-2 top-12 md:left-0 md:top-10'
  },
  {
    icon: '🔥',
    label: 'Density overlay',
    conversation: 'Heatmap live',
    className: 'right-3 top-3 md:right-6 md:top-8'
  },
  {
    icon: '🧭',
    label: 'Nearby activity',
    conversation: 'Local view',
    className: 'left-8 bottom-12 md:left-12 md:bottom-16'
  },
  {
    icon: '👥',
    label: 'Population trend',
    conversation: 'Cluster alert',
    className: 'right-0 bottom-4 md:right-4 md:bottom-10'
  }
];

const sharedLocations = [
  { id: 'loc1', x: 22, y: 68, size: 'lg', label: 'Shared location' },
  { id: 'loc2', x: 39, y: 44, size: 'md', label: 'City meetup' },
  { id: 'loc3', x: 57, y: 28, size: 'md', label: 'Downtown pulse' },
  { id: 'loc4', x: 64, y: 60, size: 'md', label: 'Neighborhood check-in' },
  { id: 'loc5', x: 79, y: 21, size: 'sm', label: 'North cluster' },
  { id: 'loc6', x: 83, y: 41, size: 'sm', label: 'Market density' },
  { id: 'loc7', x: 76, y: 75, size: 'sm', label: 'Event hotspot' }
];

const densityHotspots = [
  { id: 'heat1', x: '14%', y: '18%', size: 120, color: 'rgba(56, 189, 248, 0.25)' },
  { id: 'heat2', x: '48%', y: '14%', size: 150, color: 'rgba(249, 115, 22, 0.22)' },
  { id: 'heat3', x: '62%', y: '42%', size: 170, color: 'rgba(239, 68, 68, 0.22)' },
  { id: 'heat4', x: '28%', y: '58%', size: 135, color: 'rgba(16, 185, 129, 0.2)' },
  { id: 'heat5', x: '72%', y: '70%', size: 120, color: 'rgba(168, 85, 247, 0.18)' }
];

const directMessageMoments = [
  { sender: 'Ava', text: 'Heading your way — sending the exact pin in DM.', align: 'left' },
  { sender: 'You', text: 'Got it. The route and meetup details stay encrypted.', align: 'right' },
  { sender: 'Marcus', text: 'Switching from the public room to a locked conversation now.', align: 'left' },
  { sender: 'You', text: 'Perfect. Keep the plan private, share the update when we arrive.', align: 'right' }
];

const nodeRadius = {
  lg: 4.5,
  md: 3.4,
  sm: 2.5
};

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
                Scroll through parallax layers, preview the live map system with location sharing and density overlays,
                then drop into encrypted direct messages when a conversation needs to stay private.
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
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-200">Map intelligence</p>
                    <h2 className="mt-2 text-xl font-semibold">Parallax community map</h2>
                  </div>
                  <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                    Live pins • Heat overlays
                  </div>
                </div>

                <div
                  data-testid="hero-map-system"
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

                  {densityHotspots.map((hotspot, index) => (
                    <motion.div
                      key={hotspot.id}
                      aria-hidden="true"
                      className="absolute rounded-full blur-3xl"
                      style={{
                        left: hotspot.x,
                        top: hotspot.y,
                        width: hotspot.size,
                        height: hotspot.size,
                        backgroundColor: hotspot.color
                      }}
                      animate={prefersReducedMotion ? {} : { scale: [0.92, 1.08, 0.98], opacity: [0.55, 0.92, 0.65] }}
                      transition={{
                        duration: prefersReducedMotion ? 0 : 6 + index,
                        repeat: prefersReducedMotion ? 0 : Infinity,
                        ease: 'easeInOut',
                        delay: prefersReducedMotion ? 0 : index * 0.4
                      }}
                    />
                  ))}

                  {floatingMapBadges.map((item, index) => (
                    <motion.div
                      key={item.label}
                      data-testid="floating-map-badge"
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
                    aria-label="Map diagram showing shared locations, activity routes, and population density overlays"
                  >
                    <defs>
                      <linearGradient id="map-route-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="50%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#f97316" />
                      </linearGradient>
                    </defs>

                    <motion.path
                      d="M 18 72 Q 30 56 42 46 T 60 30 T 81 22"
                      fill="none"
                      stroke="url(#map-route-gradient)"
                      strokeWidth="0.85"
                      strokeLinecap="round"
                      strokeDasharray="1.8 1.8"
                      initial={prefersReducedMotion ? false : { pathLength: 0, opacity: 0.45 }}
                      animate={prefersReducedMotion ? { pathLength: 1, opacity: 0.8 } : { pathLength: 1, opacity: [0.5, 1, 0.7] }}
                      transition={{
                        duration: prefersReducedMotion ? 0.01 : 1.05,
                        repeat: prefersReducedMotion ? 0 : Infinity,
                        repeatDelay: prefersReducedMotion ? 0 : 2.8,
                        ease: 'easeInOut'
                      }}
                    />
                    <motion.path
                      d="M 40 46 Q 54 50 66 62 T 78 76"
                      fill="none"
                      stroke="rgba(52, 211, 153, 0.9)"
                      strokeWidth="0.75"
                      strokeLinecap="round"
                      strokeDasharray="1.4 2"
                      initial={prefersReducedMotion ? false : { pathLength: 0, opacity: 0.35 }}
                      animate={prefersReducedMotion ? { pathLength: 1, opacity: 0.75 } : { pathLength: 1, opacity: [0.35, 0.95, 0.55] }}
                      transition={{
                        duration: prefersReducedMotion ? 0.01 : 0.95,
                        delay: prefersReducedMotion ? 0 : 0.2,
                        repeat: prefersReducedMotion ? 0 : Infinity,
                        repeatDelay: prefersReducedMotion ? 0 : 3.1,
                        ease: 'easeInOut'
                      }}
                    />

                    {sharedLocations.map((node, index) => (
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
                          fill={node.id === 'loc1' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(249, 115, 22, 0.12)'}
                        />
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={nodeRadius[node.size]}
                          fill={node.id === 'loc1' ? '#34d399' : '#fde68a'}
                          stroke={node.id === 'loc1' ? '#6ee7b7' : '#fdba74'}
                          strokeWidth="0.45"
                        />
                      </motion.g>
                    ))}
                  </svg>

                  <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-200">Map layers in motion</p>
                    <p className="mt-2 text-sm text-blue-50">
                      Shared locations, local activity, and population density heatmap overlays animate together so the
                      map system feels alive before users ever open the full feature.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-200">Location sharing</p>
                    <p className="mt-2 text-sm text-blue-100">Drop precise meetup points onto the map without leaving the platform.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-200">Heatmap overlays</p>
                    <p className="mt-2 text-sm text-blue-100">Visualize population density and activity pockets with layered color intensity.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200">Local awareness</p>
                    <p className="mt-2 text-sm text-blue-100">Track neighborhood trends and nearby activity with motion-rich layers.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section
        data-testid="encrypted-dm-showcase"
        className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 text-white shadow-sm"
      >
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18)_0%,_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.2)_0%,_transparent_38%)]"
          style={{ y: foregroundLayerY }}
        />
        <div className="relative grid grid-cols-1 gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:px-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">Animated privacy showcase</p>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">Encrypted direct messaging, presented as a living conversation</h2>
            <p className="mt-4 max-w-2xl text-sm text-slate-300 sm:text-base">
              After users discover people and places on the map, the next step is a private channel. This section shows
              encrypted direct messages moving in real time, with lock-state visuals and copy that reinforces private-by-default communication.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">Locked delivery</p>
                <p className="mt-2 text-sm text-slate-300">Every DM is encrypted so meetup details, addresses, and plans stay between participants.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">Bring your own PGP</p>
                <p className="mt-2 text-sm text-slate-300">Advanced users can layer in their own keys while everyday users still get simple protection.</p>
              </div>
            </div>
          </div>

          <motion.div
            className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12 }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-sm font-semibold text-white">Direct message preview</p>
                <p className="mt-1 text-xs uppercase tracking-[0.22em] text-emerald-200">End-to-end encrypted</p>
              </div>
              <div className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                Keys verified
              </div>
            </div>

            <div className="relative mt-5 space-y-3">
              {directMessageMoments.map((message, index) => (
                <motion.div
                  key={`${message.sender}-${index}`}
                  data-testid="animated-dm-bubble"
                  className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm shadow-lg ${
                    message.align === 'right'
                      ? 'ml-auto border-sky-400/25 bg-sky-400/10 text-sky-50'
                      : 'border-white/10 bg-slate-900/80 text-slate-100'
                  }`}
                  initial={prefersReducedMotion ? false : { opacity: 0, x: message.align === 'right' ? 18 : -18 }}
                  animate={
                    prefersReducedMotion
                      ? { opacity: 1 }
                      : {
                          opacity: 1,
                          x: 0,
                          y: [0, index % 2 === 0 ? -6 : 6, 0]
                        }
                  }
                  transition={{
                    duration: prefersReducedMotion ? 0.01 : 0.65,
                    delay: prefersReducedMotion ? 0 : index * 0.16,
                    repeat: prefersReducedMotion ? 0 : Infinity,
                    repeatDelay: prefersReducedMotion ? 0 : 4.8,
                    ease: 'easeInOut'
                  }}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">{message.sender}</p>
                  <p className="mt-2">{message.text}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">🔒 Encrypted by default</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">🗝️ Optional BYO PGP</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">📨 Private meetup coordination</span>
            </div>
          </motion.div>
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
