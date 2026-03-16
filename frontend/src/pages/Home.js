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

const mapDensityStats = [
  {
    title: 'Hundreds of users',
    description: 'Dots begin spread across the map, then drift inward to show how a community gathers around shared places.'
  },
  {
    title: 'Center convergence',
    description: 'Every red glow eases toward the middle until individual users visually compress into one denser field.'
  },
  {
    title: 'Transparent heat overlay',
    description: 'The darkest red shows the heaviest concentration while lower-density areas stay softly faded at the edges.'
  }
];

// These values spread the initial dots across most of the map while keeping the
// pattern deterministic, so the homepage animation looks dense without relying
// on runtime randomness.
const INITIAL_DOT_X_MULTIPLIER = 37;
const INITIAL_DOT_Y_MULTIPLIER = 29;
const INITIAL_DOT_Y_OFFSET_MULTIPLIER = 5;
const INITIAL_DOT_X_RANGE = 84;
const INITIAL_DOT_Y_RANGE = 76;

function getDotSize(index) {
  if (index % 9 === 0) {
    return 8;
  }

  if (index % 3 === 0) {
    return 6;
  }

  return 5;
}

const convergingUserDots = Array.from({ length: 180 }, (_, index) => {
  const startX = 8 + ((index * INITIAL_DOT_X_MULTIPLIER) % INITIAL_DOT_X_RANGE);
  const startY = 10 + ((index * INITIAL_DOT_Y_MULTIPLIER + (index % 7) * INITIAL_DOT_Y_OFFSET_MULTIPLIER) % INITIAL_DOT_Y_RANGE);
  const angle = (((index * 19) % 360) * Math.PI) / 180;
  const targetX = 50 + Math.cos(angle) * (4 + (index % 5) * 1.4);
  const targetY = 50 + Math.sin(angle) * (3 + (index % 4) * 1.1);

  return {
    id: `user-dot-${index}`,
    startX,
    startY,
    targetX: Number(targetX.toFixed(2)),
    targetY: Number(targetY.toFixed(2)),
    size: getDotSize(index),
    delay: (index % 24) * 0.08,
    duration: 6 + (index % 7) * 0.35
  };
});

const messagePreview = {
  plainText: 'Meet me at the center marker at 7:30. I will share the final route here.',
  encryptedText: '7F-A91C / 4D-223B / 88-LOCK / 2A-77C1',
  sendCipherRows: ['8X4A 1F77 23CC 9D0E', 'L0CK 77AA 91C2 E4F8', '2C91 A7FF 0E1D 6B20'],
  unlockCipherRows: ['94AF 00C1 7E22 D4B8', 'KEY? 19AD 44C0 7F10', 'D3CR 7A91 55EF 0AA2']
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
                Watch hundreds of users drift across a generic map into a shared red density glow, then follow a direct
                message as it encrypts, sends, and unlocks on the other side.
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
                    <h2 className="mt-2 text-xl font-semibold">Community density map</h2>
                  </div>
                  <div className="rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1 text-xs font-semibold text-rose-100">
                    Hundreds of users • Center glow
                  </div>
                </div>

                <div
                  data-testid="hero-map-system"
                  className="relative mt-5 h-[22rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(248,113,113,0.08),transparent_45%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.82))]"
                >
                  <motion.div
                    aria-hidden="true"
                    className="absolute inset-0 opacity-25"
                    animate={prefersReducedMotion ? {} : { opacity: [0.18, 0.3, 0.2], scale: [1, 1.02, 1] }}
                    transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                      backgroundImage:
                        'linear-gradient(rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.18) 1px, transparent 1px)',
                      backgroundSize: '42px 42px'
                    }}
                  />
                  <motion.div
                    aria-hidden="true"
                    className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(248,113,113,0.2),transparent_24%),radial-gradient(circle_at_50%_50%,rgba(239,68,68,0.12),transparent_38%),radial-gradient(circle_at_22%_26%,rgba(248,113,113,0.08),transparent_26%),radial-gradient(circle_at_80%_72%,rgba(248,113,113,0.08),transparent_24%)]"
                    style={{ y: middleLayerY }}
                  />

                  <svg
                    viewBox="0 0 100 100"
                    className="absolute inset-0 h-full w-full"
                    role="img"
                    aria-label="Generic community map with hundreds of users converging into a dense red center overlay"
                  >
                    <path
                      d="M 9 28 C 14 18 24 16 33 20 C 43 24 53 20 57 26 C 61 33 58 40 48 44 C 38 48 23 47 16 41 C 10 36 7 33 9 28 Z"
                      fill="rgba(226,232,240,0.08)"
                      stroke="rgba(248,250,252,0.12)"
                      strokeWidth="0.45"
                    />
                    <path
                      d="M 58 23 C 66 16 79 18 86 26 C 92 33 93 43 87 50 C 80 58 67 60 60 53 C 53 47 51 31 58 23 Z"
                      fill="rgba(226,232,240,0.07)"
                      stroke="rgba(248,250,252,0.1)"
                      strokeWidth="0.45"
                    />
                    <path
                      d="M 22 58 C 29 52 40 54 46 61 C 52 68 50 77 43 82 C 35 87 22 85 16 77 C 11 70 14 63 22 58 Z"
                      fill="rgba(226,232,240,0.08)"
                      stroke="rgba(248,250,252,0.1)"
                      strokeWidth="0.45"
                    />
                    <path
                      d="M 60 61 C 69 55 82 57 88 65 C 94 73 90 84 80 88 C 71 91 59 88 54 79 C 49 70 52 66 60 61 Z"
                      fill="rgba(226,232,240,0.07)"
                      stroke="rgba(248,250,252,0.1)"
                      strokeWidth="0.45"
                    />
                    <circle cx="50" cy="50" r="10" fill="rgba(248,113,113,0.16)" />
                    <circle cx="50" cy="50" r="6.5" fill="rgba(239,68,68,0.16)" />
                  </svg>

                  <motion.div
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(239,68,68,0.5)_0%,_rgba(239,68,68,0.22)_30%,_rgba(239,68,68,0.08)_58%,_transparent_78%)] blur-2xl"
                    initial={prefersReducedMotion ? false : { opacity: 0.16, scale: 0.72 }}
                    animate={prefersReducedMotion ? { opacity: 0.35, scale: 1 } : { opacity: [0.2, 0.42, 0.28], scale: [0.78, 1.1, 0.92] }}
                    transition={{ duration: prefersReducedMotion ? 0.01 : 6.5, repeat: prefersReducedMotion ? 0 : Infinity, ease: 'easeInOut' }}
                  />
                  <motion.div
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(127,29,29,0.32)_0%,_rgba(220,38,38,0.2)_22%,_rgba(248,113,113,0.12)_45%,_rgba(248,113,113,0.06)_62%,_transparent_82%)] blur-3xl"
                    initial={prefersReducedMotion ? false : { opacity: 0.1, scale: 0.68 }}
                    animate={prefersReducedMotion ? { opacity: 0.28, scale: 1 } : { opacity: [0.14, 0.3, 0.2], scale: [0.72, 1.08, 0.9] }}
                    transition={{ duration: prefersReducedMotion ? 0.01 : 7.5, delay: prefersReducedMotion ? 0 : 0.4, repeat: prefersReducedMotion ? 0 : Infinity, ease: 'easeInOut' }}
                  />

                  {convergingUserDots.map((dot) => (
                    <motion.div
                      key={dot.id}
                      data-testid="hero-map-dot"
                      className="absolute rounded-full bg-rose-400"
                      style={{
                        left: `${dot.startX}%`,
                        top: `${dot.startY}%`,
                        width: dot.size,
                        height: dot.size,
                        boxShadow: '0 0 12px rgba(248, 113, 113, 0.95)',
                        opacity: 0.7
                      }}
                      initial={prefersReducedMotion ? false : { scale: 0.72, opacity: 0.35 }}
                      animate={
                        prefersReducedMotion
                          ? { left: `${dot.targetX}%`, top: `${dot.targetY}%`, scale: 1, opacity: 0.85 }
                          : {
                              left: [`${dot.startX}%`, `${dot.targetX}%`],
                              top: [`${dot.startY}%`, `${dot.targetY}%`],
                              scale: [0.75, 1.15, 0.95],
                              opacity: [0.4, 0.88, 0.7]
                            }
                      }
                      transition={{
                        duration: prefersReducedMotion ? 0.01 : dot.duration,
                        delay: prefersReducedMotion ? 0 : dot.delay,
                        repeat: prefersReducedMotion ? 0 : Infinity,
                        repeatType: 'reverse',
                        ease: 'easeInOut'
                      }}
                    />
                  ))}

                  <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-200">Converging user density</p>
                    <p className="mt-2 text-sm text-blue-50">
                      Hundreds of glowing user dots travel toward the center until they visually merge into a single red
                      density field with a darker core and softly faded edges.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {mapDensityStats.map((item) => (
                    <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-rose-200">{item.title}</p>
                      <p className="mt-2 text-sm text-blue-100">{item.description}</p>
                    </div>
                  ))}
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
              After the map draws people together, the conversation moves into a private channel. This preview now
              shows the full send-and-open flow: a message is typed, matrix-style ciphering takes over during
              encryption, the payload arrives, and the receiving user unlocks it back into readable text.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">Matrix-style ciphering</p>
                <p className="mt-2 text-sm text-slate-300">Submission animates through red cipher glyphs so visitors can see readable text turn into an encrypted payload.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">Unlock on the other side</p>
                <p className="mt-2 text-sm text-slate-300">The receiving user sees a new message prompt, enters an encryption password, and watches the text decode in reverse.</p>
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
                Message in motion
              </div>
            </div>

            <div className="relative mt-5 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
              <motion.div
                data-testid="dm-flow-stage"
                className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-lg"
                initial={prefersReducedMotion ? false : { opacity: 0, x: -18 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                transition={{ duration: prefersReducedMotion ? 0.01 : 0.6 }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">You type</p>
                <div className="mt-3 rounded-2xl border border-sky-400/25 bg-sky-400/10 px-4 py-3 text-sm text-sky-50">
                  {messagePreview.plainText}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">Submit securely</span>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                    Sending…
                  </span>
                </div>
                <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-200">During submission</p>
                  <div className="mt-3 space-y-2 font-mono text-xs text-rose-100/90">
                    {messagePreview.sendCipherRows.map((row, index) => (
                      <motion.p
                        key={row}
                        data-testid="dm-cipher-row"
                        initial={prefersReducedMotion ? false : { opacity: 0.25, x: -10 }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: [0.3, 1, 0.55], x: [0, 4, 0] }}
                        transition={{
                          duration: prefersReducedMotion ? 0.01 : 1.8,
                          delay: prefersReducedMotion ? 0 : index * 0.2,
                          repeat: prefersReducedMotion ? 0 : Infinity,
                          ease: 'easeInOut'
                        }}
                      >
                        {row}
                      </motion.p>
                    ))}
                  </div>
                  <p className="mt-3 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-xs text-rose-100">
                    {messagePreview.encryptedText}
                  </p>
                </div>
              </motion.div>

              <motion.div
                data-testid="dm-flow-stage"
                className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-lg"
                initial={prefersReducedMotion ? false : { opacity: 0, x: 18 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                transition={{ duration: prefersReducedMotion ? 0.01 : 0.6, delay: prefersReducedMotion ? 0 : 0.08 }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Other user</p>
                    <p className="mt-1 text-sm text-white">New message</p>
                  </div>
                  <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs font-semibold text-rose-100">
                    Incoming secure payload
                  </span>
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">Encryption password required</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 font-mono text-sm text-slate-200">
                      ••••••••
                    </div>
                    <button type="button" className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
                      Unlock
                    </button>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Encrypted text</p>
                    <p className="mt-2 font-mono text-xs text-rose-100">{messagePreview.encryptedText}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Matrix cipher</p>
                    <div className="mt-2 space-y-2 font-mono text-xs text-emerald-200/90">
                      {messagePreview.unlockCipherRows.map((row, index) => (
                        <motion.p
                          key={row}
                          data-testid="dm-cipher-row"
                          initial={prefersReducedMotion ? false : { opacity: 0.25, x: 10 }}
                          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: [0.3, 1, 0.6], x: [0, -4, 0] }}
                          transition={{
                            duration: prefersReducedMotion ? 0.01 : 1.9,
                            delay: prefersReducedMotion ? 0 : 0.25 + index * 0.2,
                            repeat: prefersReducedMotion ? 0 : Infinity,
                            ease: 'easeInOut'
                          }}
                        >
                          {row}
                        </motion.p>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Plain readable text</p>
                    <p className="mt-2 text-sm text-emerald-50">{messagePreview.plainText}</p>
                  </div>
                </div>
              </motion.div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">🔒 Encrypted by default</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">⌘ Matrix-style encryption preview</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">🗝️ Password-gated message reveal</span>
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
