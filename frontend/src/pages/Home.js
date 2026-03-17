import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, useScroll, useTransform, useInView, useReducedMotion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

/* ─── US map simplified SVG path ───────────────────────────────────────────── */
const US_MAP_PATH =
  /* Pacific Northwest */
  'M 155 82 L 160 80 L 175 78 L 190 80 ' +
  /* Northern border (MT, ND, MN, WI, MI) */
  'L 210 78 L 250 76 L 290 75 L 330 76 L 370 75 L 400 76 L 430 78 ' +
  /* Great Lakes region (MI, NY, New England) */
  'L 450 80 L 465 78 L 475 82 L 490 78 L 505 76 L 520 80 L 540 82 ' +
  'L 555 78 L 568 82 L 575 88 ' +
  /* Northeast coast (ME down to VA) */
  'L 578 95 L 582 100 L 580 108 L 575 115 L 578 120 L 582 125 ' +
  'L 578 132 L 572 138 L 568 145 L 570 152 L 575 158 ' +
  /* Mid-Atlantic / Southeast coast */
  'L 572 165 L 565 172 L 555 180 L 548 190 L 540 200 ' +
  /* Southeast (SC, GA) */
  'L 535 210 L 540 218 L 545 225 L 540 235 ' +
  /* Florida */
  'L 535 240 L 540 248 L 548 258 L 555 270 L 552 280 L 545 288 ' +
  'L 535 282 L 530 272 L 525 260 L 520 250 ' +
  /* Gulf coast (AL, MS, LA) */
  'L 510 248 L 500 252 L 488 250 L 478 255 L 468 252 L 455 256 ' +
  'L 440 254 L 425 258 L 410 256 ' +
  /* Texas Gulf coast */
  'L 395 260 L 380 268 L 365 275 L 355 282 L 345 278 L 338 270 ' +
  /* Texas-Mexico border */
  'L 330 262 L 320 258 L 305 260 L 295 265 L 280 262 L 268 258 ' +
  /* Southwest border (NM, AZ) */
  'L 255 260 L 240 262 L 220 260 L 200 258 L 180 260 ' +
  /* Southern California */
  'L 168 255 L 158 248 L 150 238 ' +
  /* California coast north */
  'L 148 225 L 145 210 L 142 195 L 140 180 L 138 165 L 140 150 ' +
  'L 142 135 L 145 120 L 148 105 L 150 95 L 155 82 Z';

/* ─── City data for heatmap markers ────────────────────────────────────────── */
const CITIES = [
  { name: 'New York', x: 555, y: 110, population: 1.0 },
  { name: 'Los Angeles', x: 165, y: 220, population: 0.85 },
  { name: 'Chicago', x: 430, y: 115, population: 0.75 },
  { name: 'Houston', x: 370, y: 270, population: 0.7 },
  { name: 'Phoenix', x: 215, y: 235, population: 0.55 },
  { name: 'Philadelphia', x: 555, y: 125, population: 0.55 },
  { name: 'San Antonio', x: 340, y: 275, population: 0.5 },
  { name: 'San Diego', x: 170, y: 240, population: 0.5 },
  { name: 'Dallas', x: 360, y: 250, population: 0.65 },
  { name: 'Miami', x: 545, y: 275, population: 0.6 },
  { name: 'Atlanta', x: 500, y: 220, population: 0.5 },
  { name: 'Seattle', x: 165, y: 90, population: 0.45 },
  { name: 'Denver', x: 280, y: 170, population: 0.45 },
  { name: 'Boston', x: 570, y: 95, population: 0.45 },
  { name: 'Detroit', x: 460, y: 110, population: 0.4 },
];

/* ─── Encrypted message animation data ─────────────────────────────────────── */
const ENCRYPTED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
const MESSAGES = [
  { plain: 'Hey, are we still meeting at 3pm?', sender: 'Alice' },
  { plain: "Yes! I'll send the location securely.", sender: 'Bob' },
];

/* ─── News source labels ───────────────────────────────────────────────────── */
const NEWS_SOURCES = [
  { label: 'Local Reports', color: 'from-blue-500 to-cyan-400' },
  { label: 'National Wire', color: 'from-purple-500 to-pink-400' },
  { label: 'Community Feed', color: 'from-emerald-500 to-teal-400' },
  { label: 'Breaking News', color: 'from-red-500 to-orange-400' },
  { label: 'Tech Updates', color: 'from-indigo-500 to-blue-400' },
  { label: 'Weather Alerts', color: 'from-yellow-500 to-amber-400' },
];

/* ─── Generate scrambled text ──────────────────────────────────────────────── */
function scrambleText(text) {
  return text
    .split('')
    .map((ch) =>
      ch === ' ' ? ' ' : ENCRYPTED_CHARS[Math.floor(Math.random() * ENCRYPTED_CHARS.length)]
    )
    .join('');
}

/* ─── Particle Canvas Background ───────────────────────────────────────────── */
const PARTICLE_COUNT = 60;
const GRID_SPACING = 60;
const MAX_CONNECTION_DISTANCE = 120;

function ParticleGrid({ className }) {
  const canvasRef = useRef(null);
  const prefersReduced = useReducedMotion();
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReduced) return;
    const ctx = canvas.getContext('2d');
    let w = (canvas.width = canvas.offsetWidth);
    let h = (canvas.height = canvas.offsetHeight);

    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.5 + 0.5,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      /* grid lines */
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.06)';
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < w; gx += GRID_SPACING) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += GRID_SPACING) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      /* particles */
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(139, 92, 246, 0.5)';
        ctx.fill();
      }

      /* connection lines */
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_CONNECTION_DISTANCE) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(59, 130, 246, ${0.15 * (1 - dist / MAX_CONNECTION_DISTANCE)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    const onResize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, [prefersReduced]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    />
  );
}

/* ─── Heatmap City Blob ────────────────────────────────────────────────────── */
const HEATMAP_BASE_RADIUS = 18;
const HEATMAP_RADIUS_SCALE = 30;

function CityDot({ city, index }) {
  const radius = HEATMAP_BASE_RADIUS + city.population * HEATMAP_RADIUS_SCALE;
  /* Intensity drives both brightness and opacity – denser areas glow hotter */
  const baseOpacity = 0.15 + city.population * 0.55;

  /* Colour ramp: high density → warm red/orange, mid → purple, low → cool blue */
  let r, g, b;
  if (city.population > 0.7) {
    r = 239; g = 68; b = 68;          /* red */
  } else if (city.population > 0.5) {
    r = 168; g = 85; b = 247;         /* purple */
  } else {
    r = 59; g = 130; b = 246;         /* blue */
  }

  const gradientId = `heatblob-${city.name.replace(/\s+/g, '')}`;
  const rgb = `rgb(${r},${g},${b})`;

  return (
    <motion.g data-testid="city-dot">
      <defs>
        <radialGradient id={gradientId}>
          <stop offset="0%" stopColor={rgb} stopOpacity={baseOpacity} />
          <stop offset="50%" stopColor={rgb} stopOpacity={baseOpacity * 0.5} />
          <stop offset="100%" stopColor={rgb} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Soft heatmap glow blob */}
      <motion.circle
        cx={city.x}
        cy={city.y}
        r={radius}
        fill={`url(#${gradientId})`}
        filter="url(#heatmapBlur)"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{
          delay: index * 0.15 + 0.3,
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Bright core – gives the "hot centre" look */}
      <motion.circle
        cx={city.x}
        cy={city.y}
        r={radius * 0.25}
        fill={rgb}
        fillOpacity={Math.min(baseOpacity + 0.25, 1)}
        filter="url(#heatmapBlur)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: index * 0.15 + 0.3, duration: 0.8 }}
      />

      {/* Label */}
      <motion.text
        x={city.x}
        y={city.y - radius - 2}
        textAnchor="middle"
        fill="rgba(209, 213, 219, 0.8)"
        fontSize="9"
        fontFamily="monospace"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: index * 0.15 + 0.8 }}
      >
        {city.name}
      </motion.text>
    </motion.g>
  );
}

/* ─── Encryption Animation Hook ────────────────────────────────────────────── */
function useEncryptionAnim(plain, active) {
  const [display, setDisplay] = useState('');
  const [phase, setPhase] = useState('idle');
  /* phase: idle | encrypting | encrypted | decrypting | plain */
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    let step = 0;
    const totalSteps = 30;

    setPhase('encrypting');
    intervalRef.current = setInterval(() => {
      step++;
      if (step <= totalSteps / 3) {
        setDisplay(scrambleText(plain));
      } else if (step <= (totalSteps * 2) / 3) {
        setPhase('encrypted');
        setDisplay(scrambleText(plain));
      } else if (step <= totalSteps) {
        setPhase('decrypting');
        const ratio = (step - (totalSteps * 2) / 3) / (totalSteps / 3);
        setDisplay(
          plain
            .split('')
            .map((ch, i) =>
              i < plain.length * ratio
                ? ch
                : ENCRYPTED_CHARS[Math.floor(Math.random() * ENCRYPTED_CHARS.length)]
            )
            .join('')
        );
      } else {
        setPhase('plain');
        setDisplay(plain);
        clearInterval(intervalRef.current);
      }
    }, 80);

    return () => clearInterval(intervalRef.current);
  }, [active, plain]);

  return { display, phase };
}

/* ─── Encrypted Message Bubble ─────────────────────────────────────────────── */
function MessageBubble({ message, index, isInView }) {
  const [active, setActive] = useState(false);
  const { display, phase } = useEncryptionAnim(message.plain, active);
  const isSender = index % 2 === 0;

  useEffect(() => {
    if (!isInView) return;
    const timer = setTimeout(() => setActive(true), index * 3500 + 500);
    return () => clearTimeout(timer);
  }, [isInView, index]);

  const bgClass =
    phase === 'encrypted' || phase === 'encrypting'
      ? 'bg-red-900/30 border-red-500/40'
      : phase === 'decrypting'
        ? 'bg-yellow-900/20 border-yellow-500/30'
        : phase === 'plain'
          ? 'bg-emerald-900/20 border-emerald-500/30'
          : 'bg-slate-800/50 border-slate-600/30';

  const phaseLabel =
    phase === 'encrypting'
      ? '\u{1F512} Encrypting...'
      : phase === 'encrypted'
        ? '\u{1F512} Encrypted'
        : phase === 'decrypting'
          ? '\u{1F513} Decrypting...'
          : phase === 'plain'
            ? '\u2713 Delivered'
            : '';

  return (
    <motion.div
      data-testid="message-bubble"
      className={`flex ${isSender ? 'justify-start' : 'justify-end'} mb-4`}
      initial={{ opacity: 0, x: isSender ? -30 : 30 }}
      animate={active ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.5 }}
    >
      <div
        className={`max-w-xs md:max-w-sm rounded-xl border px-4 py-3 ${bgClass} backdrop-blur-sm`}
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isSender ? 'bg-blue-600' : 'bg-purple-600'}`}
          >
            {message.sender[0]}
          </div>
          <span className="text-xs text-slate-400 font-mono">{message.sender}</span>
          {phaseLabel && <span className="text-xs text-slate-500 ml-auto">{phaseLabel}</span>}
        </div>
        <p
          className={`text-sm font-mono break-all ${
            phase === 'plain'
              ? 'text-emerald-300'
              : phase === 'encrypted' || phase === 'encrypting'
                ? 'text-red-300'
                : 'text-yellow-300'
          }`}
        >
          {display || '...'}
        </p>
      </div>
    </motion.div>
  );
}

/* ─── Data Packet Animation (between users) ────────────────────────────────── */
function DataPacketLine({ active }) {
  return (
    <div className="relative h-12 flex items-center justify-center my-2" data-testid="data-packet-line">
      <div className="absolute inset-x-8 h-px bg-gradient-to-r from-blue-500/30 via-purple-500/30 to-blue-500/30" />
      {active && (
        <motion.div
          className="absolute w-3 h-3 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50"
          animate={{ x: [-120, 120] }}
          transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5, ease: 'easeInOut' }}
        />
      )}
      <div className="relative z-10 px-3 py-1 rounded-full bg-slate-800/80 border border-cyan-500/30 text-xs text-cyan-400 font-mono">
        End-to-End Encrypted
      </div>
    </div>
  );
}

/* ─── News Card Component ──────────────────────────────────────────────────── */
function NewsCard({ source, index, merged }) {
  const directions = [
    { x: -200, y: -100 },
    { x: 200, y: -80 },
    { x: -150, y: 100 },
    { x: 200, y: 120 },
    { x: -100, y: -150 },
    { x: 150, y: 80 },
  ];
  const dir = directions[index % directions.length];

  return (
    <motion.div
      data-testid="news-card"
      className="w-full"
      initial={{ opacity: 0, x: dir.x, y: dir.y, scale: 0.8 }}
      animate={
        merged
          ? { opacity: 1, x: 0, y: 0, scale: 1 }
          : { opacity: 0.6, x: dir.x * 0.3, y: dir.y * 0.3, scale: 0.9 }
      }
      transition={{ delay: merged ? index * 0.12 : 0, duration: 0.8, ease: 'easeOut' }}
    >
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-md p-4 hover:border-purple-500/40 transition-colors">
        <div
          className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r ${source.color} text-white mb-2`}
        >
          {source.label}
        </div>
        <div className="h-2 w-3/4 rounded bg-slate-700/50 mb-1.5" />
        <div className="h-2 w-1/2 rounded bg-slate-700/30" />
      </div>
    </motion.div>
  );
}

/* ─── Section wrapper with scroll animations ───────────────────────────────── */
function Section({ children, className = '', id, dark = true }) {
  return (
    <section
      id={id}
      className={`relative py-20 md:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden ${
        dark ? 'bg-slate-950' : 'bg-slate-900'
      } ${className}`}
    >
      {children}
    </section>
  );
}

/* ─── Glassmorphism Card ───────────────────────────────────────────────────── */
function GlassCard({ children, className = '', hover = true, ...rest }) {
  return (
    <motion.div
      className={`rounded-2xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-xl p-6 ${
        hover
          ? 'hover:border-purple-500/40 hover:bg-slate-800/50 transition-all duration-300'
          : ''
      } ${className}`}
      whileHover={hover ? { y: -4 } : {}}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* ─── Privacy Shield Visual ────────────────────────────────────────────────── */
function PrivacyShield() {
  return (
    <motion.div
      data-testid="privacy-shield"
      className="relative w-48 h-48 md:w-64 md:h-64 mx-auto"
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
    >
      {/* Outer glow ring */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-cyan-400/30"
        animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 3, repeat: Infinity }}
      />
      {/* Middle ring */}
      <motion.div
        className="absolute inset-4 rounded-full border border-blue-400/40"
        animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 2.5, repeat: Infinity, delay: 0.3 }}
      />
      {/* Shield icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-6xl md:text-7xl" role="img" aria-label="shield">
          {'\u{1F6E1}\uFE0F'}
        </div>
      </div>
      {/* Labels */}
      {['AES-256', 'PGP', 'E2EE', 'Zero-Knowledge'].map((label, i) => (
        <motion.div
          key={label}
          className="absolute px-2 py-0.5 rounded-full bg-slate-800/80 border border-blue-500/30 text-xs text-blue-400 font-mono"
          style={{
            left: `${50 + 48 * Math.cos((i * Math.PI * 2) / 4 - Math.PI / 4)}%`,
            top: `${50 + 48 * Math.sin((i * Math.PI * 2) / 4 - Math.PI / 4)}%`,
            transform: 'translate(-50%, -50%)',
          }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 + i * 0.15 }}
        >
          {label}
        </motion.div>
      ))}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  HOME COMPONENT                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */
function Home({ isAuthenticated }) {
  const prefersReduced = useReducedMotion();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 100]);

  /* ─── News aggregation section state ─── */
  const newsRef = useRef(null);
  const newsInView = useInView(newsRef, { once: true, margin: '-100px' });
  const [newsMerged, setNewsMerged] = useState(false);

  useEffect(() => {
    if (newsInView) {
      const timer = setTimeout(() => setNewsMerged(true), 600);
      return () => clearTimeout(timer);
    }
  }, [newsInView]);

  /* ─── Encrypted messaging section state ─── */
  const encryptRef = useRef(null);
  const encryptInView = useInView(encryptRef, { once: true, margin: '-100px' });

  /* ─── Heatmap section state ─── */
  const mapRef = useRef(null);
  const mapInView = useInView(mapRef, { once: true, margin: '-100px' });

  /* ─── Platform features ─── */
  const platformFeatures = useMemo(
    () => [
      { icon: '\u{1F4E1}', title: 'Real-Time Data', desc: 'Live updates powered by encrypted streams' },
      { icon: '\u{1F512}', title: 'End-to-End Encryption', desc: 'Every message is encrypted by default' },
      { icon: '\u{1F5FA}\uFE0F', title: 'Local Intelligence', desc: 'Location-aware data without compromising privacy' },
      { icon: '\u{1F4F0}', title: 'News Aggregation', desc: 'Real-time news from multiple verified sources' },
      { icon: '\u{1F465}', title: 'Social Circles', desc: 'Manage connections with granular privacy controls' },
      { icon: '\u{1F6E1}\uFE0F', title: 'Data Sovereignty', desc: 'You own your data. Always.' },
    ],
    []
  );

  return (
    <div className="bg-slate-950 text-white min-h-screen" data-testid="landing-page">
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  HERO SECTION                                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center justify-center overflow-hidden"
        data-testid="hero-section"
      >
        {/* Animated grid + particles */}
        <ParticleGrid className="z-0" />

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-transparent to-slate-950 z-[1]" />
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/10 via-purple-900/10 to-cyan-900/10 z-[1]" />

        {/* US Map background (subtle) */}
        <div className="absolute inset-0 flex items-center justify-center z-[2] opacity-20">
          <svg viewBox="100 60 540 260" className="w-full max-w-4xl h-auto">
            <path
              d={US_MAP_PATH}
              fill="none"
              stroke="rgba(59,130,246,0.3)"
              strokeWidth="1.5"
            />
            {CITIES.slice(0, 8).map((city, i) => (
              <motion.circle
                key={city.name}
                cx={city.x}
                cy={city.y}
                r={4 + city.population * 6}
                fill={
                  city.population > 0.7
                    ? 'rgba(139,92,246,0.4)'
                    : 'rgba(59,130,246,0.3)'
                }
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.2, 0.6, 0.2] }}
                transition={{ duration: 3, repeat: Infinity, delay: i * 0.3 }}
              />
            ))}
          </svg>
        </div>

        {/* Hero content */}
        <motion.div
          className="relative z-10 text-center px-4 max-w-5xl mx-auto"
          style={{
            opacity: prefersReduced ? 1 : heroOpacity,
            y: prefersReduced ? 0 : heroY,
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <span className="inline-block px-4 py-1.5 mb-6 rounded-full border border-blue-500/30 bg-blue-950/50 text-blue-400 text-sm font-mono backdrop-blur-sm">
              {'\u{1F512}'} Privacy-First Social Platform
            </span>
          </motion.div>

          <motion.h1
            className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Real Data.
            </span>{' '}
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              Real Privacy.
            </span>{' '}
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              Real Control.
            </span>
          </motion.h1>

          <motion.p
            className="text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            A social platform built on encrypted communication, real-time local intelligence,
            and transparent data ownership.
          </motion.p>

          <motion.div
            className="flex flex-wrap justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          >
            {isAuthenticated ? (
              <>
                <Link
                  to="/social"
                  className="group relative px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-sm shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-300 hover:-translate-y-0.5"
                >
                  Open Social Feed
                </Link>
                <Link
                  to="/chat"
                  className="px-8 py-3.5 rounded-xl border border-slate-600 text-slate-300 font-semibold text-sm hover:border-purple-500/50 hover:text-white backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5"
                >
                  Open Chat
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/register"
                  className="group relative px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-sm shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-300 hover:-translate-y-0.5"
                >
                  Get Started
                </Link>
                <a
                  href="#heatmap-section"
                  className="px-8 py-3.5 rounded-xl border border-slate-600 text-slate-300 font-semibold text-sm hover:border-purple-500/50 hover:text-white backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5"
                >
                  View Live Demo
                </a>
              </>
            )}
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="w-6 h-10 rounded-full border-2 border-slate-600 flex items-start justify-center p-1.5">
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-blue-400"
                animate={{ y: [0, 16, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  ANIMATION 1 — POPULATION DENSITY HEATMAP                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Section id="heatmap-section" dark>
        <div className="max-w-6xl mx-auto" ref={mapRef}>
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="inline-block px-3 py-1 rounded-full bg-purple-900/40 border border-purple-500/30 text-purple-400 text-xs font-mono mb-4">
              LIVE DATA VISUALIZATION
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Population Density
              </span>{' '}
              Intelligence
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Real-time visualization of community activity across the nation. Watch data come
              alive with our encrypted, privacy-first approach to local intelligence.
            </p>
          </motion.div>

          {/* Interactive US Map */}
          <GlassCard className="p-2 sm:p-4" hover={false}>
            <div className="relative" data-testid="heatmap-visualization">
              <svg
                viewBox="100 60 540 260"
                className="w-full h-auto"
                style={{ filter: 'drop-shadow(0 0 20px rgba(59,130,246,0.1))' }}
              >
                {/* Map base */}
                <defs>
                  <radialGradient id="heatGlow">
                    <stop offset="0%" stopColor="rgba(139,92,246,0.4)" />
                    <stop offset="100%" stopColor="rgba(139,92,246,0)" />
                  </radialGradient>
                  <filter id="heatmapBlur">
                    <feGaussianBlur stdDeviation="4" />
                  </filter>
                </defs>

                <path
                  d={US_MAP_PATH}
                  fill="rgba(30,41,59,0.6)"
                  stroke="rgba(59,130,246,0.4)"
                  strokeWidth="1.5"
                />

                {/* Grid overlay on map */}
                {Array.from({ length: 12 }, (_, i) => (
                  <line
                    key={`vg-${i}`}
                    x1={130 + i * 40}
                    y1="60"
                    x2={130 + i * 40}
                    y2="300"
                    stroke="rgba(59,130,246,0.06)"
                    strokeWidth="0.5"
                  />
                ))}
                {Array.from({ length: 7 }, (_, i) => (
                  <line
                    key={`hg-${i}`}
                    x1="100"
                    y1={70 + i * 35}
                    x2="640"
                    y2={70 + i * 35}
                    stroke="rgba(59,130,246,0.06)"
                    strokeWidth="0.5"
                  />
                ))}

                {/* City dots with heatmap effect */}
                {mapInView &&
                  CITIES.map((city, i) => <CityDot key={city.name} city={city} index={i} />)}
              </svg>

              {/* Live indicator */}
              <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-emerald-500/30 backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-xs text-emerald-400 font-mono">LIVE</span>
              </div>
            </div>
          </GlassCard>

          {/* Map stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {[
              { label: 'Active Regions', value: '48', icon: '\u{1F5FA}\uFE0F' },
              { label: 'Live Connections', value: '2.4M', icon: '\u{1F517}' },
              { label: 'Data Points', value: '18.7B', icon: '\u{1F4CA}' },
              { label: 'Encrypted Streams', value: '100%', icon: '\u{1F512}' },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                className="rounded-xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm p-4 text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="text-2xl mb-1">{stat.icon}</div>
                <div className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <div className="text-xs text-slate-500 font-mono mt-1">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  ANIMATION 2 — ENCRYPTED COMMUNICATION                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Section dark={false}>
        <div className="max-w-4xl mx-auto" ref={encryptRef}>
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="inline-block px-3 py-1 rounded-full bg-emerald-900/40 border border-emerald-500/30 text-emerald-400 text-xs font-mono mb-4">
              ENCRYPTED COMMUNICATION
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Messages That{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Only You
              </span>{' '}
              Can Read
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Watch encryption in action. Every message is scrambled before it leaves your
              device and only decrypted on the recipient's side.
            </p>
          </motion.div>

          {/* Encryption demo */}
          <GlassCard hover={false} className="overflow-hidden" data-testid="encryption-demo">
            {/* Header bar */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400 font-mono">
                <span>{'\u{1F512}'}</span>
                <span>End-to-End Encrypted</span>
              </div>
            </div>

            {/* User avatars and connection */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center font-bold text-sm">
                  A
                </div>
                <div>
                  <div className="text-sm font-semibold">Alice</div>
                  <div className="text-xs text-emerald-400 font-mono">● Online</div>
                </div>
              </div>
              <div className="flex-1 mx-4">
                <DataPacketLine active={encryptInView} />
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-sm font-semibold text-right">Bob</div>
                  <div className="text-xs text-emerald-400 font-mono text-right">● Online</div>
                </div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center font-bold text-sm">
                  B
                </div>
              </div>
            </div>

            {/* Message bubbles */}
            <div className="space-y-2">
              {MESSAGES.map((msg, i) => (
                <MessageBubble key={i} message={msg} index={i} isInView={encryptInView} />
              ))}
            </div>

            {/* Typing indicator */}
            <motion.div
              className="flex items-center gap-2 mt-4 text-xs text-slate-500"
              initial={{ opacity: 0 }}
              animate={encryptInView ? { opacity: [0, 1, 0] } : {}}
              transition={{ delay: 7, duration: 2, repeat: Infinity }}
            >
              <div className="flex gap-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
              <span className="font-mono">Composing encrypted message...</span>
            </motion.div>
          </GlassCard>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  ANIMATION 3 — NEWS AGGREGATION ENGINE                             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <div className="max-w-5xl mx-auto" ref={newsRef}>
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="inline-block px-3 py-1 rounded-full bg-blue-900/40 border border-blue-500/30 text-blue-400 text-xs font-mono mb-4">
              NEWS AGGREGATION ENGINE
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              All Sources.{' '}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                One Intelligent Feed.
              </span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              News from multiple sources aggregated in real-time into a single, verified, and
              privacy-respecting feed.
            </p>
          </motion.div>

          {/* Aggregation visualization */}
          <div className="relative" data-testid="news-aggregation">
            {/* News cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {NEWS_SOURCES.map((source, i) => (
                <NewsCard key={source.label} source={source} index={i} merged={newsMerged} />
              ))}
            </div>
          </div>

          {/* Merged feed preview */}
          <AnimatePresence>
            {newsMerged && (
              <motion.div
                className="mt-8"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.6 }}
              >
                <GlassCard hover={false}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-sm text-emerald-400 font-mono">
                      Unified Feed — Live
                    </span>
                  </div>
                  {NEWS_SOURCES.slice(0, 4).map((source, i) => (
                    <motion.div
                      key={source.label}
                      className="flex items-center gap-3 py-3 border-b border-slate-700/30 last:border-0"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1 + i * 0.15 }}
                    >
                      <div
                        className={`w-2 h-8 rounded-full bg-gradient-to-b ${source.color}`}
                      />
                      <div className="flex-1">
                        <div className="h-2.5 w-3/4 rounded bg-slate-700/50 mb-1" />
                        <div className="h-2 w-1/2 rounded bg-slate-700/30" />
                      </div>
                      <span className="text-xs text-slate-500 font-mono">{source.label}</span>
                    </motion.div>
                  ))}
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  PRIVACY SHIELD                                                      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Privacy Shield */}
            <div>
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                <span className="inline-block px-3 py-1 rounded-full bg-cyan-900/40 border border-cyan-500/30 text-cyan-400 text-xs font-mono mb-4">
                  PRIVACY SHIELD
                </span>
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                  Your Data,{' '}
                  <span className="bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                    Protected
                  </span>
                </h2>
                <p className="text-slate-400 mb-6">
                  Every piece of your data is wrapped in military-grade encryption. From messages
                  to location data, everything stays under your control with our multi-layered
                  privacy shield.
                </p>
                <ul className="space-y-3">
                  {[
                    'AES-256 encryption at rest',
                    'End-to-end encrypted messaging',
                    'Optional BYO PGP keys',
                    'Zero-knowledge architecture',
                  ].map((item, i) => (
                    <motion.li
                      key={item}
                      className="flex items-center gap-3 text-sm text-slate-300"
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <span className="text-emerald-400">{'\u2713'}</span>
                      {item}
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            </div>

            <PrivacyShield />
          </div>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  PLATFORM FEATURES GRID                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Section dark={false}>
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="inline-block px-3 py-1 rounded-full bg-purple-900/40 border border-purple-500/30 text-purple-400 text-xs font-mono mb-4">
              PLATFORM CAPABILITIES
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Everything You Need.{' '}
              <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                Nothing You Don't.
              </span>
            </h2>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="features-grid">
            {platformFeatures.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <GlassCard className="h-full">
                  <div className="text-3xl mb-3">{feature.icon}</div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-slate-400">{feature.desc}</p>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  FINAL CTA                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-24 px-4 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-96 h-96 rounded-full bg-blue-600/5 blur-3xl" />
        </div>

        <motion.div
          className="relative z-10 max-w-3xl mx-auto text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
            Ready to Take{' '}
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Control
            </span>
            ?
          </h2>
          <p className="text-lg text-slate-400 mb-10 max-w-2xl mx-auto">
            Join a platform where your privacy isn't a feature — it's the foundation. Real
            data, real privacy, real control.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            {isAuthenticated ? (
              <>
                <Link
                  to="/social"
                  className="px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-300 hover:-translate-y-0.5"
                >
                  Go to Social
                </Link>
                <Link
                  to="/calendar"
                  className="px-8 py-4 rounded-xl border border-slate-600 text-slate-300 font-semibold hover:border-purple-500/50 hover:text-white backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5"
                >
                  Open Calendar
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/register"
                  className="px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-300 hover:-translate-y-0.5"
                >
                  Get Started Free
                </Link>
                <Link
                  to="/login"
                  className="px-8 py-4 rounded-xl border border-slate-600 text-slate-300 font-semibold hover:border-purple-500/50 hover:text-white backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  FOOTER                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-slate-800 bg-slate-950 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-slate-500 font-mono">
            © {new Date().getFullYear()} SocialSecure — Privacy-First Social Platform
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span>{'\u{1F512}'} Encrypted</span>
            <span>{'\u{1F6E1}\uFE0F'} Private</span>
            <span>{'\u26A1'} Real-Time</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Home;
