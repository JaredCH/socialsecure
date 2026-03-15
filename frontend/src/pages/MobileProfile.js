import React, { useEffect, useMemo, useRef, useState } from 'react';
import './MobileProfile.css';

const DIRECTORY_ITEMS = [
  { key: 'resume', label: 'Resume', eyebrow: 'Career dossier' },
  { key: 'blog', label: 'Blog', eyebrow: 'Long-form notes' },
  { key: 'pgp', label: 'PGP', eyebrow: 'Security identity' },
  { key: 'about', label: 'About', eyebrow: 'Personal context' },
  { key: 'accomplishments', label: 'Accomplishments', eyebrow: 'Milestones' }
];

const SECTION_ITEMS = [
  { key: 'gallery', label: 'Gallery' },
  { key: 'chat', label: 'Chat' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'friends', label: 'Friends' }
];

const FEED_POSTS = [
  {
    id: 'feed-1',
    type: 'Field note',
    title: 'Street-level prototypes are finally feeling humane.',
    body: 'Spent the afternoon tuning how movement, texture, and typography work together on mobile. The result feels quieter, faster, and much more deliberate.',
    author: 'Avery Stone',
    timestamp: '8m ago',
    metrics: ['142 reacts', '18 replies', '9 saves'],
    tag: 'Design systems'
  },
  {
    id: 'feed-2',
    type: 'Dispatch',
    title: 'Weekend build log: secure community tools, less visual noise.',
    body: 'Reducing chrome around the essentials keeps the profile expressive without turning the screen into an obstacle course. Feed cards now carry more tone with fewer elements.',
    author: 'Avery Stone',
    timestamp: '1h ago',
    metrics: ['89 reacts', '11 replies', '4 shares'],
    tag: 'Product journal'
  },
  {
    id: 'feed-3',
    type: 'Pinned thought',
    title: 'Good mobile UI should feel edited, not merely compressed.',
    body: 'The best profile surfaces keep identity, utility, and conversation close together. That is the direction here: one-handed, layered, and calm.',
    author: 'Avery Stone',
    timestamp: 'Yesterday',
    metrics: ['203 reacts', '27 replies', '22 saves'],
    tag: 'Craft'
  }
];

const GALLERY_ITEMS = [
  { id: 'gallery-1', title: 'City shadows', caption: 'Late afternoon study', palette: 'linear-gradient(150deg, #1f2937 0%, #475569 36%, #f59e0b 100%)' },
  { id: 'gallery-2', title: 'Studio table', caption: 'Prototype materials', palette: 'linear-gradient(160deg, #fff7ed 0%, #fdba74 55%, #7c2d12 100%)' },
  { id: 'gallery-3', title: 'Signal wall', caption: 'PGP notes and routing', palette: 'linear-gradient(150deg, #0f172a 0%, #155e75 48%, #67e8f9 100%)' },
  { id: 'gallery-4', title: 'Quiet morning', caption: 'Coffee and wireframes', palette: 'linear-gradient(165deg, #422006 0%, #9a3412 42%, #fed7aa 100%)' }
];

const CHAT_THREADS = [
  { id: 'chat-1', name: 'Nora', preview: 'The profile directory feels much easier to scan now.', time: 'Now', unread: 2 },
  { id: 'chat-2', name: 'Micah', preview: 'Shared the month view update with the planning circle.', time: '18m', unread: 0 },
  { id: 'chat-3', name: 'Core Team', preview: 'Pinned the updated hero motion notes.', time: '42m', unread: 5 }
];

const FRIENDS = [
  { id: 'friend-1', name: 'Nora Hale', detail: 'Calendar collaborator', status: 'Nearby' },
  { id: 'friend-2', name: 'Micah Reed', detail: 'Encryption reviewer', status: 'Online' },
  { id: 'friend-3', name: 'Sana Park', detail: 'Gallery curator', status: '2 km away' },
  { id: 'friend-4', name: 'Leo Hart', detail: 'Watch party host', status: 'Available' }
];

const CALENDAR_DAY = [
  { time: '09:00', title: 'Mobile polish review', place: 'Studio A' },
  { time: '12:30', title: 'Lunch walk + voice notes', place: 'Riverside' },
  { time: '18:00', title: 'Friends planning sync', place: 'Encrypted room' }
];

const CALENDAR_WEEK = [
  { day: 'Mon', focus: 'Gallery publish', state: 'done' },
  { day: 'Tue', focus: 'Hero motion tuning', state: 'current' },
  { day: 'Wed', focus: 'PGP key rotation', state: 'upcoming' },
  { day: 'Thu', focus: 'Community office hours', state: 'upcoming' },
  { day: 'Fri', focus: 'Month view QA', state: 'upcoming' }
];

const CALENDAR_MONTH = [
  ['', '', '', '1', '2', '3', '4'],
  ['5', '6', '7', '8', '9', '10', '11'],
  ['12', '13', '14', '15', '16', '17', '18'],
  ['19', '20', '21', '22', '23', '24', '25'],
  ['26', '27', '28', '29', '30', '31', '']
];

const RESUME_ITEMS = [
  { role: 'Lead Product Designer', company: 'Signal Harbor', period: '2023 - Present', note: 'Mobile systems, privacy UX, component governance' },
  { role: 'Interaction Designer', company: 'Northline Labs', period: '2020 - 2023', note: 'Prototype direction, information architecture, design ops' }
];

const BLOG_ITEMS = [
  { id: 'blog-1', title: 'Designing for trust on a five-inch screen', excerpt: 'Trust is built with pacing, hierarchy, and very few surprises in the wrong places.' },
  { id: 'blog-2', title: 'Why profile pages need stronger utility again', excerpt: 'A profile should do more than decorate identity. It should route people into meaningful action.' }
];

const ACCOMPLISHMENTS = [
  { id: 'acc-1', title: 'Privacy by Design Award', detail: 'Recognized for leading a zero-trust messaging interface.' },
  { id: 'acc-2', title: 'Community Builder 2025', detail: 'Hosted 48 secure planning sessions across local circles.' },
  { id: 'acc-3', title: 'Top Mentor', detail: 'Guided five junior designers into product leadership tracks.' }
];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const IconGallery = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true">
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <path d="M7.5 14.5l2.8-2.8a1 1 0 0 1 1.4 0l2.3 2.3 1.8-1.8a1 1 0 0 1 1.4 0l2.8 2.8" />
    <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

const IconChat = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true">
    <path d="M5.5 6.5h13a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H11l-4.2 3v-3H5.5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
    <path d="M8 11.25h8" />
    <path d="M8 14.25h5" />
  </svg>
);

const IconCalendar = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M7.5 3.5v3" />
    <path d="M16.5 3.5v3" />
    <path d="M3.5 9h17" />
    <path d="M8 12.5h3v3H8z" />
  </svg>
);

const IconFriends = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true">
    <circle cx="9" cy="9" r="3" />
    <circle cx="16.5" cy="10.5" r="2.5" />
    <path d="M4.5 18.5c.8-2.8 3-4.5 5.8-4.5s5 1.7 5.8 4.5" />
    <path d="M14.2 18.5c.4-1.7 1.7-2.9 3.6-3.3" />
  </svg>
);

const SECTION_ICONS = {
  gallery: IconGallery,
  chat: IconChat,
  calendar: IconCalendar,
  friends: IconFriends
};

const getInitials = (value) => String(value || '')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase() || '')
  .join('') || 'AS';

function MobileProfile({ user }) {
  const rootRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sectionsExpanded, setSectionsExpanded] = useState(true);
  const [activeView, setActiveView] = useState('feed');
  const [calendarView, setCalendarView] = useState('month');
  const [scrollDepth, setScrollDepth] = useState(0);

  const profile = useMemo(() => {
    const displayName = String(user?.realName || user?.username || 'Avery Stone').trim();
    const handle = String(user?.username || 'avery').trim() || 'avery';
    const location = [user?.city, user?.state].filter(Boolean).join(', ') || 'Portland, OR';
    return {
      displayName,
      handle,
      location,
      bio: 'Designing privacy-first community tools with a bias toward clear mobile flows, sturdy systems, and friendlier defaults.',
      initials: getInitials(displayName)
    };
  }, [user?.city, user?.realName, user?.state, user?.username]);

  useEffect(() => {
    const host = rootRef.current?.parentElement;
    const target = host || window;

    const syncScrollDepth = () => {
      const nextDepth = host ? host.scrollTop : window.scrollY;
      setScrollDepth(nextDepth);
    };

    syncScrollDepth();
    target.addEventListener('scroll', syncScrollDepth, { passive: true });

    return () => {
      target.removeEventListener('scroll', syncScrollDepth);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const closeOnOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [menuOpen]);

  const heroHeight = Math.max(176, 284 - (scrollDepth * 0.28));
  const avatarSize = Math.max(72, 108 - (scrollDepth * 0.1));
  const heroOffset = Math.min(scrollDepth * 0.34, 72);
  const avatarOffset = Math.min(scrollDepth * 0.18, 20);
  const heroTopPadding = Math.max(16, 24 - (scrollDepth * 0.04));
  const sectionTopOffset = Math.max(116, heroHeight - 12);

  const activeLabel = useMemo(() => {
    if (activeView === 'feed') return 'Feed';
    return DIRECTORY_ITEMS.find((item) => item.key === activeView)?.label
      || SECTION_ITEMS.find((item) => item.key === activeView)?.label
      || 'Feed';
  }, [activeView]);

  const openDirectoryView = (key) => {
    setActiveView(key);
    setMenuOpen(false);
  };

  const openSectionView = (key) => {
    setActiveView((current) => (current === key ? 'feed' : key));
  };

  const renderFeed = () => (
    <div className="space-y-4" data-testid="mobile-profile-feed-view">
      <div className="mobile-profile-card rounded-[1.7rem] p-4">
        <p className="mobile-profile-sans text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[var(--profile-accent-deep)]">Feed highlights</p>
        <h2 className="mobile-profile-type-heading mt-2 text-[1.6rem] font-semibold leading-tight">A calm social layer built for mobile first reading.</h2>
        <p className="mobile-profile-sans mt-2 text-sm leading-6 text-[var(--profile-muted)]">The feed stays editorial and card-based, with lighter chrome and sharper type so the profile still feels like a place instead of a control panel.</p>
      </div>
      {FEED_POSTS.map((post) => (
        <article key={post.id} className="mobile-profile-card mobile-profile-feed-card rounded-[1.7rem] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="mobile-profile-sans text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--profile-accent-deep)]">{post.type}</p>
              <h3 className="mobile-profile-type-heading mt-2 text-xl font-semibold leading-tight">{post.title}</h3>
            </div>
            <span className="mobile-profile-sans rounded-full bg-[var(--profile-accent-soft)] px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--profile-accent-deep)]">{post.tag}</span>
          </div>
          <p className="mobile-profile-sans mt-3 text-sm leading-6 text-[var(--profile-muted)]">{post.body}</p>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[rgba(132,59,29,0.1)] pt-3">
            <div>
              <p className="mobile-profile-sans text-sm font-semibold text-[var(--profile-ink)]">{post.author}</p>
              <p className="mobile-profile-sans text-xs uppercase tracking-[0.16em] text-[var(--profile-muted)]">{post.timestamp}</p>
            </div>
            <div className="text-right">
              {post.metrics.map((metric) => (
                <p key={metric} className="mobile-profile-sans text-xs text-[var(--profile-muted)]">{metric}</p>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );

  const renderGallery = () => (
    <div className="space-y-4" data-testid="mobile-profile-gallery-view">
      <div className="mobile-profile-card rounded-[1.7rem] p-4">
        <p className="mobile-profile-sans text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[var(--profile-teal)]">Gallery</p>
        <h2 className="mobile-profile-type-heading mt-2 text-[1.55rem] font-semibold">Visual notes from the last few weeks.</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {GALLERY_ITEMS.map((item) => (
          <article key={item.id} className="mobile-profile-gallery-tile mobile-profile-card" style={{ background: item.palette }}>
            <div className="absolute inset-0 opacity-30 mix-blend-screen" style={{ background: 'radial-gradient(circle at top left, rgba(255,255,255,0.85), transparent 38%)' }} />
            <div className="relative z-10 flex h-full flex-col justify-end p-3 text-white">
              <p className="mobile-profile-type-heading text-lg font-semibold">{item.title}</p>
              <p className="mobile-profile-sans text-xs uppercase tracking-[0.18em] text-white/78">{item.caption}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );

  const renderChat = () => (
    <div className="space-y-4" data-testid="mobile-profile-chat-view">
      <div className="mobile-profile-card rounded-[1.7rem] p-4">
        <p className="mobile-profile-sans text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[var(--profile-teal)]">Chat</p>
        <h2 className="mobile-profile-type-heading mt-2 text-[1.55rem] font-semibold">Clean thread previews and a low-noise composer.</h2>
      </div>
      <div className="space-y-3">
        {CHAT_THREADS.map((thread) => (
          <article key={thread.id} className="mobile-profile-card rounded-[1.5rem] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="mobile-profile-sans text-sm font-semibold text-[var(--profile-ink)]">{thread.name}</p>
                <p className="mobile-profile-sans mt-1 text-sm leading-6 text-[var(--profile-muted)]">{thread.preview}</p>
              </div>
              <div className="text-right">
                <p className="mobile-profile-sans text-xs uppercase tracking-[0.16em] text-[var(--profile-muted)]">{thread.time}</p>
                {thread.unread > 0 ? <span className="mt-2 inline-flex rounded-full bg-[var(--profile-accent)] px-2 py-1 text-[0.65rem] font-semibold text-white">{thread.unread} new</span> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="mobile-profile-card rounded-[1.5rem] p-4">
        <p className="mobile-profile-sans text-xs uppercase tracking-[0.18em] text-[var(--profile-muted)]">Encrypted composer</p>
        <div className="mt-3 rounded-[1.2rem] border border-[rgba(132,59,29,0.12)] bg-white/70 px-4 py-3 text-sm text-[var(--profile-muted)]">Write a message, attach a voice note, or jump into the secure thread.</div>
      </div>
    </div>
  );

  const renderCalendarDay = () => (
    <div className="space-y-3" data-testid="mobile-profile-calendar-day">
      {CALENDAR_DAY.map((entry) => (
        <article key={entry.time} className="mobile-profile-card rounded-[1.35rem] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="mobile-profile-type-heading text-lg font-semibold">{entry.title}</p>
              <p className="mobile-profile-sans mt-1 text-sm text-[var(--profile-muted)]">{entry.place}</p>
            </div>
            <span className="mobile-profile-sans rounded-full bg-[var(--profile-accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--profile-accent-deep)]">{entry.time}</span>
          </div>
        </article>
      ))}
    </div>
  );

  const renderCalendarWeek = () => (
    <div className="grid grid-cols-1 gap-3" data-testid="mobile-profile-calendar-week">
      {CALENDAR_WEEK.map((entry) => (
        <article key={entry.day} className="mobile-profile-card rounded-[1.35rem] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="mobile-profile-sans text-xs uppercase tracking-[0.18em] text-[var(--profile-muted)]">{entry.day}</p>
              <p className="mobile-profile-type-heading mt-2 text-lg font-semibold">{entry.focus}</p>
            </div>
            <span className={`mobile-profile-sans rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${entry.state === 'current' ? 'bg-[var(--profile-accent)] text-white' : 'bg-[rgba(23,32,51,0.08)] text-[var(--profile-ink)]'}`}>{entry.state}</span>
          </div>
        </article>
      ))}
    </div>
  );

  const renderCalendarMonth = () => (
    <div data-testid="mobile-profile-calendar-month">
      <div className="mobile-profile-calendar-grid mb-2 px-1">
        {WEEKDAY_LABELS.map((label) => (
          <p key={label} className="mobile-profile-sans text-center text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--profile-muted)]">{label}</p>
        ))}
      </div>
      <div className="mobile-profile-calendar-grid">
        {CALENDAR_MONTH.flat().map((day, index) => (
          <div key={`${day}-${index}`} className={`mobile-profile-calendar-cell mobile-profile-card rounded-[1.1rem] p-2 ${day === '15' || day === '18' ? 'bg-[rgba(203,98,49,0.12)]' : ''}`}>
            <p className="mobile-profile-sans text-sm font-semibold text-[var(--profile-ink)]">{day}</p>
            {day === '15' ? <p className="mobile-profile-sans mt-2 text-[0.65rem] uppercase tracking-[0.16em] text-[var(--profile-accent-deep)]">Launch review</p> : null}
            {day === '18' ? <p className="mobile-profile-sans mt-2 text-[0.65rem] uppercase tracking-[0.16em] text-[var(--profile-teal)]">Circle meetup</p> : null}
          </div>
        ))}
      </div>
    </div>
  );

  const renderCalendar = () => (
    <div className="space-y-4" data-testid="mobile-profile-calendar-view">
      <div className="mobile-profile-card rounded-[1.7rem] p-4">
        <p className="mobile-profile-sans text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[var(--profile-teal)]">Calendar</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <h2 className="mobile-profile-type-heading text-[1.55rem] font-semibold">Three clean views for the same schedule.</h2>
          <span className="mobile-profile-sans rounded-full bg-[rgba(31,122,115,0.12)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--profile-teal)]">{calendarView}</span>
        </div>
        <div className="mt-4 flex gap-2" role="tablist" aria-label="Calendar views">
          {['day', 'week', 'month'].map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={calendarView === view}
              onClick={() => setCalendarView(view)}
              className={`mobile-profile-sans rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${calendarView === view ? 'bg-[var(--profile-accent)] text-white' : 'bg-[rgba(23,32,51,0.08)] text-[var(--profile-ink)]'}`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>
      {calendarView === 'day' ? renderCalendarDay() : null}
      {calendarView === 'week' ? renderCalendarWeek() : null}
      {calendarView === 'month' ? renderCalendarMonth() : null}
    </div>
  );

  const renderFriends = () => (
    <div className="space-y-4" data-testid="mobile-profile-friends-view">
      <div className="mobile-profile-card rounded-[1.7rem] p-4">
        <p className="mobile-profile-sans text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[var(--profile-teal)]">Friends</p>
        <h2 className="mobile-profile-type-heading mt-2 text-[1.55rem] font-semibold">Trusted people, visible presence, lighter cards.</h2>
      </div>
      <div className="space-y-3">
        {FRIENDS.map((friend) => (
          <article key={friend.id} className="mobile-profile-card rounded-[1.4rem] p-4">
            <div className="flex items-center gap-3">
              <div className="mobile-profile-avatar mobile-profile-avatar__ring flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-[var(--profile-accent-deep)]">{getInitials(friend.name)}</div>
              <div className="flex-1">
                <p className="mobile-profile-sans text-sm font-semibold text-[var(--profile-ink)]">{friend.name}</p>
                <p className="mobile-profile-sans text-sm text-[var(--profile-muted)]">{friend.detail}</p>
              </div>
              <span className="mobile-profile-sans rounded-full bg-[rgba(31,122,115,0.12)] px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--profile-teal)]">{friend.status}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );

  const renderResume = () => (
    <div className="space-y-4" data-testid="mobile-profile-resume-view">
      <div className="mobile-profile-card rounded-[1.7rem] p-4">
        <p className="mobile-profile-sans text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[var(--profile-accent-deep)]">Resume</p>
        <h2 className="mobile-profile-type-heading mt-2 text-[1.55rem] font-semibold">Compact career story with room for depth.</h2>
      </div>
      {RESUME_ITEMS.map((item) => (
        <article key={item.role} className="mobile-profile-card rounded-[1.45rem] p-4">
          <p className="mobile-profile-sans text-xs uppercase tracking-[0.18em] text-[var(--profile-muted)]">{item.period}</p>
          <h3 className="mobile-profile-type-heading mt-2 text-xl font-semibold">{item.role}</h3>
          <p className="mobile-profile-sans mt-1 text-sm font-semibold text-[var(--profile-accent-deep)]">{item.company}</p>
          <p className="mobile-profile-sans mt-3 text-sm leading-6 text-[var(--profile-muted)]">{item.note}</p>
        </article>
      ))}
    </div>
  );

  const renderBlog = () => (
    <div className="space-y-4" data-testid="mobile-profile-blog-view">
      <div className="mobile-profile-card rounded-[1.7rem] p-4">
        <p className="mobile-profile-sans text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[var(--profile-accent-deep)]">Blog</p>
        <h2 className="mobile-profile-type-heading mt-2 text-[1.55rem] font-semibold">Long-form posts, trimmed for mobile reading.</h2>
      </div>
      {BLOG_ITEMS.map((item) => (
        <article key={item.id} className="mobile-profile-card rounded-[1.45rem] p-4">
          <h3 className="mobile-profile-type-heading text-xl font-semibold">{item.title}</h3>
          <p className="mobile-profile-sans mt-3 text-sm leading-6 text-[var(--profile-muted)]">{item.excerpt}</p>
        </article>
      ))}
    </div>
  );

  const renderPgp = () => (
    <div className="space-y-4" data-testid="mobile-profile-pgp-view">
      <div className="mobile-profile-card rounded-[1.7rem] p-4">
        <p className="mobile-profile-sans text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[var(--profile-accent-deep)]">PGP</p>
        <h2 className="mobile-profile-type-heading mt-2 text-[1.55rem] font-semibold">Security identity without the usual visual clutter.</h2>
      </div>
      <article className="mobile-profile-card rounded-[1.45rem] p-4">
        <p className="mobile-profile-sans text-xs uppercase tracking-[0.18em] text-[var(--profile-muted)]">Fingerprint</p>
        <p className="mobile-profile-type-heading mt-3 text-lg font-semibold">A43D 91EF 2180 7C2E</p>
        <p className="mobile-profile-type-heading text-lg font-semibold">F7B1 6A0D 2C4F 91BB</p>
        <p className="mobile-profile-sans mt-3 text-sm leading-6 text-[var(--profile-muted)]">Public key is live, pinned, and rotated on a quarterly cadence. Session proofs remain visible for trusted contacts.</p>
      </article>
    </div>
  );

  const renderAbout = () => (
    <div className="space-y-4" data-testid="mobile-profile-about-view">
      <div className="mobile-profile-card rounded-[1.7rem] p-4">
        <p className="mobile-profile-sans text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[var(--profile-accent-deep)]">About</p>
        <h2 className="mobile-profile-type-heading mt-2 text-[1.55rem] font-semibold">Personal context with better hierarchy.</h2>
      </div>
      <article className="mobile-profile-card rounded-[1.45rem] p-4">
        <p className="mobile-profile-sans text-sm leading-7 text-[var(--profile-muted)]">{profile.bio}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-[1.15rem] bg-white/70 p-3">
            <p className="mobile-profile-sans text-xs uppercase tracking-[0.16em] text-[var(--profile-muted)]">Base</p>
            <p className="mobile-profile-type-heading mt-2 text-lg font-semibold">{profile.location}</p>
          </div>
          <div className="rounded-[1.15rem] bg-white/70 p-3">
            <p className="mobile-profile-sans text-xs uppercase tracking-[0.16em] text-[var(--profile-muted)]">Focus</p>
            <p className="mobile-profile-type-heading mt-2 text-lg font-semibold">Secure social products</p>
          </div>
        </div>
      </article>
    </div>
  );

  const renderAccomplishments = () => (
    <div className="space-y-4" data-testid="mobile-profile-accomplishments-view">
      <div className="mobile-profile-card rounded-[1.7rem] p-4">
        <p className="mobile-profile-sans text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[var(--profile-accent-deep)]">Accomplishments</p>
        <h2 className="mobile-profile-type-heading mt-2 text-[1.55rem] font-semibold">Milestones collected into a sharper mobile stack.</h2>
      </div>
      {ACCOMPLISHMENTS.map((item) => (
        <article key={item.id} className="mobile-profile-card rounded-[1.45rem] p-4">
          <h3 className="mobile-profile-type-heading text-xl font-semibold">{item.title}</h3>
          <p className="mobile-profile-sans mt-3 text-sm leading-6 text-[var(--profile-muted)]">{item.detail}</p>
        </article>
      ))}
    </div>
  );

  const renderActiveView = () => {
    switch (activeView) {
      case 'gallery':
        return renderGallery();
      case 'chat':
        return renderChat();
      case 'calendar':
        return renderCalendar();
      case 'friends':
        return renderFriends();
      case 'resume':
        return renderResume();
      case 'blog':
        return renderBlog();
      case 'pgp':
        return renderPgp();
      case 'about':
        return renderAbout();
      case 'accomplishments':
        return renderAccomplishments();
      default:
        return renderFeed();
    }
  };

  return (
    <div ref={rootRef} className="mobile-profile-page pb-16">
      <div className="mobile-profile-shell">
        <header
          className="mobile-profile-hero sticky top-0 z-20"
          style={{ height: `${heroHeight}px` }}
          data-testid="mobile-profile-hero"
        >
          <div
            className="mobile-profile-hero__backdrop absolute inset-0"
            style={{ transform: `translateY(${heroOffset}px) scale(${1 + Math.min(scrollDepth * 0.0007, 0.08)})` }}
          />
          <div className="mobile-profile-hero__mesh absolute inset-0 opacity-50" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[rgba(18,12,10,0.22)] to-transparent" />
          <div className="relative flex h-full flex-col justify-between px-4 pb-4" style={{ paddingTop: `${heroTopPadding}px` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((current) => !current)}
                  aria-expanded={menuOpen}
                  aria-label="Open profile directory"
                  className="mobile-profile-glass mobile-profile-sans inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white"
                >
                  Profile Directory
                  <span aria-hidden="true">{menuOpen ? '-' : '+'}</span>
                </button>
                {menuOpen ? (
                  <div className="mobile-profile-dropdown absolute left-0 top-[calc(100%+0.65rem)] z-30 w-64 rounded-[1.5rem] p-2" data-testid="mobile-profile-directory-menu">
                    {DIRECTORY_ITEMS.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => openDirectoryView(item.key)}
                        className="flex w-full items-start justify-between rounded-[1.1rem] px-3 py-3 text-left hover:bg-[rgba(203,98,49,0.08)]"
                      >
                        <span>
                          <span className="mobile-profile-sans block text-sm font-semibold text-[var(--profile-ink)]">{item.label}</span>
                          <span className="mobile-profile-sans block text-xs uppercase tracking-[0.14em] text-[var(--profile-muted)]">{item.eyebrow}</span>
                        </span>
                        <span className="mobile-profile-sans text-sm text-[var(--profile-accent-deep)]">Go</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <span className="mobile-profile-glass mobile-profile-sans inline-flex rounded-full px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white">Public profile</span>
            </div>

            <div className="flex items-end justify-between gap-4">
              <div className="flex items-end gap-3">
                <div
                  className="mobile-profile-avatar mobile-profile-avatar__ring flex shrink-0 items-center justify-center rounded-full text-2xl font-semibold text-[var(--profile-accent-deep)]"
                  style={{ width: `${avatarSize}px`, height: `${avatarSize}px`, transform: `translateY(${avatarOffset}px)` }}
                  aria-label={`${profile.displayName} avatar`}
                >
                  {profile.initials}
                </div>
                <div className="pb-1 text-white">
                  <p className="mobile-profile-sans text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-white/72">Local creative technologist</p>
                  <h1 className="mobile-profile-type-heading mt-2 text-[2rem] font-semibold leading-none">{profile.displayName}</h1>
                  <p className="mobile-profile-sans mt-2 text-sm text-white/80">@{profile.handle} · {profile.location}</p>
                </div>
              </div>
              <div className="mobile-profile-glass hidden rounded-[1.2rem] px-3 py-3 text-right text-white sm:block">
                <p className="mobile-profile-sans text-[0.65rem] uppercase tracking-[0.18em] text-white/70">Active surface</p>
                <p className="mobile-profile-type-heading mt-1 text-lg font-semibold">{activeLabel}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="sticky z-30 px-4 pt-3" style={{ top: `${sectionTopOffset}px` }}>
          <section className="mobile-profile-card mobile-profile-card-strong rounded-[1.6rem] p-3" data-testid="mobile-profile-sections-bar">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="mobile-profile-sans text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--profile-muted)]">Sections</p>
                <p className="mobile-profile-type-heading text-lg font-semibold">{activeLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setSectionsExpanded((current) => !current)}
                aria-expanded={sectionsExpanded}
                className="mobile-profile-sans rounded-full border border-[rgba(132,59,29,0.14)] px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--profile-ink)]"
              >
                {sectionsExpanded ? 'Collapse' : 'Expand'}
              </button>
            </div>
            {sectionsExpanded ? (
              <div className="mt-3 grid grid-cols-4 gap-2" data-testid="mobile-profile-sections-grid">
                {SECTION_ITEMS.map((item) => {
                  const Icon = SECTION_ICONS[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={activeView === item.key}
                      onClick={() => openSectionView(item.key)}
                      className="mobile-profile-section-button mobile-profile-sans flex flex-col items-center gap-2 rounded-[1.1rem] border border-[rgba(132,59,29,0.14)] bg-white/60 px-2 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--profile-muted)]"
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>

        <main className="px-4 pb-8 pt-4">
          {activeView !== 'feed' ? (
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="mobile-profile-sans text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--profile-muted)]">Selected view</p>
                <p className="mobile-profile-type-heading text-xl font-semibold">{activeLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveView('feed')}
                className="mobile-profile-sans rounded-full bg-[var(--profile-accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white"
              >
                Back to feed
              </button>
            </div>
          ) : null}
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
}

export default MobileProfile;