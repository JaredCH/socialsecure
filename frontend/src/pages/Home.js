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
    title: 'User convergence',
    description: 'Ten glowing circles spread across the city grid drift inward; each collision multiplies glow size by 1.5× the number of merging circles.'
  },
  {
    title: 'Center convergence',
    description: 'Each new arrival scales the cluster\u2019s glow using (diameter\u00a0×\u00a01.5)\u00a0×\u00a0N—brightness cascades upward and holds until a circle breaks away.'
  },
  {
    title: 'Transparent heat overlay',
    description: 'The semi-transparent red overlay lets the city grid remain visible, showing density without hiding geography.'
  }
];

// Animation duration for one full convergence cycle (seconds).
const DENSITY_DURATION = 9;
const DENSITY_CENTER = { x: 50, y: 50 };
const DENSITY_MERGE_POINT = { x: 22, y: 49 };
// Diameter in px for each circle – with the radial-gradient glow the visible
// footprint is roughly 100 ft at the city-block scale shown in the background.
const DENSITY_GLOW_SIZE = 28;

// Ten user-density circles with roles that drive the multi-phase animation.
// 'normal'     – drifts to center and fades into the cluster.
// 'merge-keep' – collides with the merge-fade circle, absorbs it, then continues.
// 'merge-fade' – travels to the merge point and disappears into merge-keep.
// 'break-off'  – converges to center then drifts back outward at the end.
const densityCircles = [
  { id: 'glow-0', startX: 12, startY: 15, role: 'break-off', breakX: 15, breakY: 8, convergeFrac: 0.58 },
  { id: 'glow-1', startX: 82, startY: 12, role: 'normal', convergeFrac: 0.62 },
  { id: 'glow-2', startX: 15, startY: 62, role: 'merge-keep', convergeFrac: 0.55 },
  { id: 'glow-3', startX: 78, startY: 68, role: 'normal', convergeFrac: 0.70 },
  { id: 'glow-4', startX: 42, startY: 22, role: 'normal', convergeFrac: 0.53 },
  { id: 'glow-5', startX: 65, startY: 80, role: 'normal', convergeFrac: 0.68 },
  { id: 'glow-6', startX: 30, startY: 35, role: 'merge-fade', convergeFrac: 0.38 },
  { id: 'glow-7', startX: 72, startY: 35, role: 'normal', convergeFrac: 0.65 },
  { id: 'glow-8', startX: 88, startY: 52, role: 'normal', convergeFrac: 0.72 },
  { id: 'glow-9', startX: 50, startY: 88, role: 'break-off', breakX: 78, breakY: 85, convergeFrac: 0.60 }
];

// Pre-compute how many glows are at the center at each convergeFrac so we can
// apply the collision formula: NewTotalDiameter = (currentDiameter × 1.5) × N.
// merge-fade never reaches center (absorbed at the merge point) so it is excluded.
const _centerConvergeFracs = densityCircles
  .filter(c => c.role !== 'merge-fade')
  .map(c => c.convergeFrac)
  .sort((a, b) => a - b);

function _glowsAtCenter(convergeFrac) {
  return _centerConvergeFracs.filter(f => f <= convergeFrac).length;
}

function getDensityAnimation(circle, reducedMotion) {
  if (reducedMotion) {
    return {
      animate: { left: `${DENSITY_CENTER.x}%`, top: `${DENSITY_CENTER.y}%`, opacity: 0.6, scale: 1 },
      transition: { duration: 0.01 }
    };
  }

  const { startX, startY, role, convergeFrac, breakX = 0, breakY = 0 } = circle;
  const cx = DENSITY_CENTER.x;
  const cy = DENSITY_CENTER.y;
  const mx = DENSITY_MERGE_POINT.x;
  const my = DENSITY_MERGE_POINT.y;

  // Collision formula: peakScale = (1 × 1.5) × N  where N = glows at center.
  const N = _glowsAtCenter(convergeFrac);
  const peakScale = 1.5 * N;

  switch (role) {
    case 'merge-keep': {
      // Absorbs merge-fade at the merge point (2 combining) → scale = 1.5 × 2.
      // Then continues to center where it joins the cluster at the full formula.
      // Maintains its peak size for the rest of the cycle (no decay).
      const mergeScale = 1.5 * 2;
      const centerScale = Math.max(mergeScale, peakScale);
      return {
        animate: {
          left: [`${startX}%`, `${startX}%`, `${mx}%`, `${cx}%`, `${cx}%`],
          top: [`${startY}%`, `${startY}%`, `${my}%`, `${cy}%`, `${cy}%`],
          opacity: [0.5, 0.55, 1.0, 1.0, 1.0],
          scale: [1, 1, mergeScale, centerScale, centerScale]
        },
        transition: {
          duration: DENSITY_DURATION,
          times: [0, 0.11, 0.36, convergeFrac, 1],
          repeat: Infinity,
          ease: 'easeInOut'
        }
      };
    }
    case 'merge-fade':
      // Shrinks into merge-keep at the merge point and disappears.
      return {
        animate: {
          left: [`${startX}%`, `${startX}%`, `${mx}%`, `${mx}%`, `${mx}%`],
          top: [`${startY}%`, `${startY}%`, `${my}%`, `${my}%`, `${my}%`],
          opacity: [0.5, 0.55, 0.1, 0, 0],
          scale: [1, 1, 0.3, 0, 0]
        },
        transition: {
          duration: DENSITY_DURATION,
          times: [0, 0.11, 0.36, 0.42, 1],
          repeat: Infinity,
          ease: 'easeInOut'
        }
      };
    case 'break-off': {
      // Converges to center at full formula scale, HOLDS that size, then
      // shrinks sharply only at the instant it breaks away from the cluster.
      const holdFrac = 0.83;   // hold peak until just before break-away
      const breakFrac = 0.84;  // the instant the glow detaches
      return {
        animate: {
          left:    [`${startX}%`, `${startX}%`, `${cx}%`,   `${cx}%`,   `${breakX}%`, `${breakX}%`],
          top:     [`${startY}%`, `${startY}%`, `${cy}%`,   `${cy}%`,   `${breakY}%`, `${breakY}%`],
          opacity: [0.5,          0.55,          1.0,         1.0,         0.3,           0.3],
          scale:   [1,            1,             peakScale,   peakScale,   0.65,          0.65]
        },
        transition: {
          duration: DENSITY_DURATION,
          times: [0, 0.11, convergeFrac, holdFrac, breakFrac, 1],
          repeat: Infinity,
          ease: 'easeInOut'
        }
      };
    }
    default: {
      // Normal circles grow using the collision formula when they reach center.
      // Size is maintained for the rest of the cycle – no shrinkage.
      const peakOpacity = Math.min(0.82 + ((convergeFrac - 0.5) * 4) * 0.2, 1.0);
      return {
        animate: {
          left: [`${startX}%`, `${startX}%`, `${cx}%`, `${cx}%`],
          top: [`${startY}%`, `${startY}%`, `${cy}%`, `${cy}%`],
          opacity: [0.5, 0.55, peakOpacity, peakOpacity],
          scale: [1, 1, peakScale, peakScale]
        },
        transition: {
          duration: DENSITY_DURATION,
          times: [0, 0.11, convergeFrac, 1],
          repeat: Infinity,
          ease: 'easeInOut'
        }
      };
    }
  }
}

const messagePreview = {
  plainText: 'Meet me at the center marker at 7:30. I will share the final route here.',
  encryptedText: '7F-A91C / 4D-223B / 88-LOCK / 2A-77C1',
  sendCipherRows: ['8X4A 1F77 23CC 9D0E', 'L0CK 77AA 91C2 E4F8', '2C91 A7FF 0E1D 6B20'],
  unlockCipherRows: ['94AF 00C1 7E22 D4B8', 'KEY? 19AD 44C0 7F10', 'D3CR 7A91 55EF 0AA2']
};

const dmFlowSteps = ['Type private text', 'Encrypt locally', 'Transmit cipher payload', 'Enter password to decrypt'];

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
                Watch ten user glows drift across a city grid and converge into a shared red heat cluster, then follow a
                direct message as it encrypts, sends, and unlocks on the other side.
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
                    10 users • Heat cluster
                  </div>
                </div>

                <div
                  data-testid="hero-map-system"
                  className="relative mt-5 h-[22rem] overflow-hidden rounded-[1.75rem] border border-white/10"
                  style={{
                    backgroundColor: 'rgb(26, 32, 44)',
                    backgroundImage: [
                      'linear-gradient(to right, rgba(100,116,139,0.22) 1px, transparent 1px)',
                      'linear-gradient(to bottom, rgba(100,116,139,0.22) 1px, transparent 1px)',
                      'linear-gradient(to right, rgba(120,133,150,0.38) 2px, transparent 2px)',
                      'linear-gradient(to bottom, rgba(120,133,150,0.38) 2px, transparent 2px)'
                    ].join(', '),
                    backgroundSize: '8.33% 8.33%, 8.33% 8.33%, 33.33% 33.33%, 33.33% 33.33%'
                  }}
                >
                  {/* NYC block-grid map overlay with subtle block shading */}
                  <svg
                    viewBox="0 0 12 12"
                    className="absolute inset-0 h-full w-full"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="New York City block grid with ten user density points converging into a red heat cluster"
                  >
                    <rect x="1" y="0" width="1" height="1" fill="rgba(40,48,62,0.45)" />
                    <rect x="3" y="2" width="1" height="1" fill="rgba(45,53,67,0.35)" />
                    <rect x="5" y="3" width="2" height="1" fill="rgba(40,60,48,0.2)" />
                    <rect x="8" y="1" width="1" height="1" fill="rgba(45,53,67,0.3)" />
                    <rect x="10" y="5" width="1" height="1" fill="rgba(40,48,62,0.35)" />
                    <rect x="2" y="7" width="1" height="1" fill="rgba(45,53,67,0.3)" />
                    <rect x="7" y="9" width="1" height="1" fill="rgba(40,48,62,0.4)" />
                    <rect x="0" y="5" width="1" height="1" fill="rgba(45,53,67,0.3)" />
                    <rect x="9" y="3" width="1" height="1" fill="rgba(40,48,62,0.35)" />
                    <rect x="4" y="10" width="2" height="1" fill="rgba(40,60,48,0.18)" />
                    <rect x="11" y="7" width="1" height="1" fill="rgba(45,53,67,0.25)" />
                    <rect x="6" y="0" width="1" height="1" fill="rgba(40,48,62,0.3)" />
                  </svg>

                  {/* Central convergence glow – grows as circles arrive */}
                  <motion.div
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      width: 180,
                      height: 180,
                      background:
                        'radial-gradient(circle, rgba(239,68,68,0.7) 0%, rgba(239,68,68,0.35) 28%, rgba(239,68,68,0.12) 55%, transparent 78%)',
                      filter: 'blur(10px)',
                      willChange: 'transform, opacity'
                    }}
                    initial={prefersReducedMotion ? false : { opacity: 0.02, scale: 0.1 }}
                    animate={
                      prefersReducedMotion
                        ? { opacity: 0.5, scale: 1 }
                        : {
                            opacity: [0.02, 0.06, 0.5, 1.0, 1.0, 0.45],
                            scale: [0.1, 0.2, 1.8, 4.2, 4.2, 2.5]
                          }
                    }
                    transition={
                      prefersReducedMotion
                        ? { duration: 0.01 }
                        : {
                            duration: DENSITY_DURATION,
                            times: [0, 0.2, 0.52, 0.82, 0.84, 1],
                            repeat: Infinity,
                            ease: 'easeInOut'
                          }
                    }
                  />

                  {/* 10 glowing user-density circles */}
                  {densityCircles.map((circle) => {
                    const anim = getDensityAnimation(circle, prefersReducedMotion);
                    return (
                      <motion.div
                        key={circle.id}
                        data-testid="hero-map-dot"
                        className="absolute rounded-full"
                        style={{
                          left: `${circle.startX}%`,
                          top: `${circle.startY}%`,
                          width: DENSITY_GLOW_SIZE,
                          height: DENSITY_GLOW_SIZE,
                          marginLeft: -DENSITY_GLOW_SIZE / 2,
                          marginTop: -DENSITY_GLOW_SIZE / 2,
                          background:
                            'radial-gradient(circle, rgba(239,68,68,0.8) 0%, rgba(248,113,113,0.45) 38%, rgba(248,113,113,0.12) 68%, transparent 100%)',
                          boxShadow: '0 0 20px 6px rgba(239,68,68,0.4)',
                          willChange: 'transform, opacity'
                        }}
                        initial={prefersReducedMotion ? false : { scale: 0.8, opacity: 0.3 }}
                        animate={anim.animate}
                        transition={anim.transition}
                      />
                    );
                  })}

                  <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-200">Converging user density</p>
                    <p className="mt-2 text-sm text-blue-50">
                      Ten user glows travel across the city grid—each collision scales glow size by 1.5× the merging count.
                      As circles converge the cluster grows dramatically, holding peak size until a glow breaks away.
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

            <div className="relative mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {dmFlowSteps.map((step, index) => (
                  <div
                    key={step}
                    data-testid="dm-flow-step"
                    className="rounded-2xl border border-white/10 bg-slate-950/65 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200"
                  >
                    {index + 1}. {step}
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <motion.div
                data-testid="dm-flow-stage"
                className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-lg"
                initial={prefersReducedMotion ? false : { opacity: 0, x: -18 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                transition={{ duration: prefersReducedMotion ? 0.01 : 0.6 }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Sender perspective</p>
                <p className="mt-2 text-sm text-white">Computer A</p>
                <div className="mt-3 rounded-2xl border border-sky-400/25 bg-sky-400/10 px-4 py-3 text-sm text-sky-50">
                  {messagePreview.plainText}
                </div>
                <motion.div
                  className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100"
                  initial={prefersReducedMotion ? false : { opacity: 0.3 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: [0.25, 0.25, 1, 1, 0.45] }}
                  transition={{
                    duration: prefersReducedMotion ? 0.01 : 7,
                    times: [0, 0.2, 0.36, 0.62, 1],
                    repeat: prefersReducedMotion ? 0 : Infinity,
                    ease: 'easeInOut'
                  }}
                >
                  Encrypting before send...
                </motion.div>
                <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-200">Encrypted payload</p>
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

              <div className="relative hidden h-full items-center justify-center lg:flex">
                <motion.div
                  className="h-0.5 w-24 rounded-full bg-white/20"
                  initial={prefersReducedMotion ? false : { opacity: 0.4 }}
                  animate={prefersReducedMotion ? { opacity: 0.7 } : { opacity: [0.3, 0.9, 0.3] }}
                  transition={{ duration: prefersReducedMotion ? 0.01 : 3.2, repeat: prefersReducedMotion ? 0 : Infinity }}
                />
                <motion.div
                  aria-hidden="true"
                  className="absolute rounded-full border border-rose-300/30 bg-rose-400/20 px-3 py-1 font-mono text-[10px] text-rose-100"
                  initial={prefersReducedMotion ? false : { x: -40, opacity: 0 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { x: [-40, -40, 40, 40], opacity: [0, 0, 1, 0] }}
                  transition={{
                    duration: prefersReducedMotion ? 0.01 : 7.6,
                    times: [0, 0.35, 0.72, 1],
                    repeat: prefersReducedMotion ? 0 : Infinity,
                    ease: 'easeInOut'
                  }}
                >
                  {messagePreview.encryptedText}
                </motion.div>
              </div>

              <motion.div
                data-testid="dm-flow-stage"
                className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-lg"
                initial={prefersReducedMotion ? false : { opacity: 0, x: 18 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                transition={{ duration: prefersReducedMotion ? 0.01 : 0.6, delay: prefersReducedMotion ? 0 : 0.08 }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Receiver perspective</p>
                    <p className="mt-1 text-sm text-white">Computer B</p>
                  </div>
                  <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs font-semibold text-rose-100">
                    Incoming encrypted message
                  </span>
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">New message</p>
                  <p className="mt-2 font-mono text-xs text-rose-100">{messagePreview.encryptedText}</p>
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
                <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Decrypting after password entry</p>
                  <div className="mt-2 space-y-2 font-mono text-xs text-emerald-200/90">
                    {messagePreview.unlockCipherRows.map((row, index) => (
                      <motion.p
                        key={row}
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
                <motion.div
                  className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3"
                  initial={prefersReducedMotion ? false : { opacity: 0.35 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: [0.35, 0.35, 0.5, 1, 0.85] }}
                  transition={{
                    duration: prefersReducedMotion ? 0.01 : 7.6,
                    times: [0, 0.58, 0.72, 0.88, 1],
                    repeat: prefersReducedMotion ? 0 : Infinity,
                    ease: 'easeInOut'
                  }}
                >
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Plain readable text</p>
                    <p className="mt-2 text-sm text-emerald-50">{messagePreview.plainText}</p>
                  </div>
                </motion.div>
              </motion.div>
            </div>
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
