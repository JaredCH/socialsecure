import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authAPI, blogAPI, calendarAPI, chatAPI, circlesAPI, discoveryAPI, feedAPI, friendsAPI, galleryAPI, getAuthToken, moderationAPI, notificationAPI, resolveUploadMediaUrl, resumeAPI, socialPageAPI } from '../utils/api';
import CircleManager from '../components/CircleManager';
import ReportModal from '../components/ReportModal';
import BlockButton from '../components/BlockButton';
import TypingIndicator from '../components/TypingIndicator';
import PresenceIndicator from '../components/PresenceIndicator';
import GuestPreviewNotice from '../components/social/GuestPreviewNotice';
import SocialHero from '../components/social/SocialHero';
import SocialStageSettingsSidebar from '../components/social/SocialStageSettingsSidebar';
import CircleSpiderDiagram from '../components/social/CircleSpiderDiagram';
import {
  getFontSizeClass,
  mergeDesignPatch,
  normalizeSocialPreferences as normalizePageDesign,
  SOCIAL_DESIGN_TEMPLATES,
  SOCIAL_LAYOUT_PRESETS,
  SOCIAL_PANEL_LABELS,
  SOCIAL_HERO_TABS,
  SOCIAL_FONT_FAMILIES,
  SOCIAL_THEME_PRESETS
} from '../utils/socialPagePreferences';
import {
  emitTypingStart,
  emitTypingStop,
  getRealtimeSocket,
  onFeedInteraction,
  onFeedPost,
  onFriendPresence,
  onTyping,
  subscribeToPost,
  unsubscribeFromPost
} from '../utils/realtime';

const MEDIA_URL_MAX_ITEMS = 8;
const MEDIA_URL_MAX_LENGTH = 2048;
const COMPOSER_CONTENT_TYPES = ['standard', 'poll', 'quiz', 'countdown'];
const COMPOSER_EDITOR_MODES = ['design', 'code'];
const INTERACTION_MAX_OPTIONS = 6;
const GALLERY_MAX_ITEMS = 50;
const GALLERY_MAX_IMAGE_SIZE_BYTES = 3 * 1024 * 1024;
const HERO_IMAGE_HISTORY_LIMIT = 3;
const HERO_RANDOM_BACKGROUND_ROTATION_INTERVAL_MS = 12000;
const FEED_POLL_INTERVAL_MS = 30000;
const TOP_FRIENDS_LIMIT = 5;
const DESKTOP_LAYOUT_BREAKPOINT_PX = 1024;
const MINI_CHAT_MIN_VIEWPORT_HEIGHT_PX = 288;
const MAX_HOBBIES = 10;
const TYPING_TIMEOUT_MS = 900;
const REMOTE_TYPING_TTL_MS = 3000;
const MAX_UPCOMING_CALENDAR_ITEMS = 6;
const GENTLE_PROFILE_HINT_STORAGE_KEY = 'socialsecure:social-profile-hints-disabled';
const GENTLE_PROFILE_HINT_CHANCE = 0.15;
const CODE_MODE_SNIPPETS = [
  { label: 'Bold', value: '**bold**', syntax: '**text**', description: 'Bold text', icon: 'B', requiresSelection: false },
  { label: 'Italic', value: '*italic*', syntax: '*text*', description: 'Italic text', icon: 'I', requiresSelection: false },
  { label: 'Code', value: '`inline code`', syntax: '`code`', description: 'Inline code snippet', icon: '<>', requiresSelection: false },
  { label: 'Heading', value: '\n# Heading\n', syntax: '# Heading', description: 'Large heading (H1) — toolbar inserts with surrounding newlines', icon: 'H1', requiresSelection: false },
  { label: 'Sub heading', value: '\n## Sub heading\n', syntax: '## Sub heading', description: 'Medium heading (H2) — toolbar inserts with surrounding newlines', icon: 'H2', requiresSelection: false },
  { label: 'List', value: '\n- List item\n', syntax: '- item', description: 'Unordered list item — toolbar inserts with surrounding newlines', icon: '•—', requiresSelection: false },
  { label: 'Quote', value: '\n> Quoted text\n', syntax: '> quote', description: 'Blockquote — toolbar inserts with surrounding newlines', icon: '❝', requiresSelection: false },
  { label: 'Link', value: '[Label](https://example.com)', syntax: '[Label](url)', description: 'Hyperlink', icon: '🔗', requiresSelection: false },
  { label: 'Image', value: '![Alt text](https://example.com/image.jpg)', syntax: '![alt](url)', description: 'Embed image via URL', icon: '⬛', requiresSelection: false },
  { label: 'Color', value: '[color=red]Red text[/color]', syntax: '[color=red]…[/color]', description: 'Colored text — highlight text first', icon: 'A', requiresSelection: true },
  { label: 'Highlight', value: '[bg=yellow]Highlighted[/bg]', syntax: '[bg=yellow]…[/bg]', description: 'Background highlight — highlight text first', icon: 'BG', requiresSelection: true },
  { label: 'V-Line', value: '[vline=4]Callout text[/vline]', syntax: '[vline=4]…[/vline]', description: 'Vertical callout line — highlight text first', icon: '|', requiresSelection: true }
];
const CODE_MODE_HAS_SELECTION_ITEMS = CODE_MODE_SNIPPETS.some((s) => s.requiresSelection);
const PANEL_WIDTH_UNITS_BY_SIZE = {
  halfCol: 1,
  oneCol: 2,
  twoCols: 4,
  threeCols: 6,
  fourCols: 8
};
const PANEL_HEIGHT_UNITS_BY_SIZE = {
  halfRow: 1,
  fullRow: 2,
  twoRows: 4,
  threeRows: 6,
  fourRows: 8
};

const PRIVACY_BADGE_LABELS = {
  public: 'Public',
  friends: 'Friends',
  circles: 'Circles',
  specific_users: 'Specific Users',
  private: 'Private'
};
const RELATIONSHIP_AUDIENCE_LABELS = {
  public: 'Public',
  social: 'Social',
  secure: 'Secure'
};
const RELATIONSHIP_AUDIENCE_COLORS = {
  social: '#0284c7',
  secure: '#d97706',
  public: '#16a34a'
};
const RELATIONSHIP_AUDIENCE_ICONS = {
  social: 'S',
  secure: '🔒',
  public: '🌐'
};
const PROFILE_CHAT_ROLE_OPTIONS = [
  { value: 'friends', label: 'Friends' },
  { value: 'circles', label: 'Circles' },
  { value: 'guests', label: 'Guests' }
];
const PROFILE_CHAT_ROLE_ICONS = {
  friends: '👥',
  circles: '⭕',
  guests: '🌐'
};
const PERSONAL_INFO_FIELDS = [
  { id: 'phone', label: 'Phone', inputType: 'text' },
  { id: 'worksAt', label: 'Works At', inputType: 'text' },
  { id: 'hobbies', label: 'Hobbies', inputType: 'text' },
  { id: 'ageGroup', label: 'Age Group', inputType: 'text' },
  { id: 'sex', label: 'Sex', inputType: 'text' },
  { id: 'race', label: 'Race', inputType: 'text' },
  { id: 'streetAddress', label: 'Street Address', inputType: 'text' }
];

const SOCIAL_MODULE_IDS = ['marketplaceShortcut', 'calendarShortcut', 'settingsShortcut', 'referShortcut', 'chatPanel', 'communityNotes'];
const THEME_ACCENT_TO_HEADER_CLASS = {
  blue: 'from-blue-700 via-indigo-700 to-violet-700',
  violet: 'from-violet-700 via-fuchsia-700 to-purple-700',
  emerald: 'from-emerald-700 via-teal-700 to-cyan-700',
  rose: 'from-rose-700 via-pink-700 to-orange-600',
  amber: 'from-amber-700 via-orange-700 to-red-700'
};
const THEME_TO_PAGE_CLASS = {
  default: 'bg-slate-50 text-gray-900',
  light: 'bg-white text-gray-900',
  dark: 'bg-slate-900 text-slate-100',
  sunset: 'bg-orange-50 text-gray-900',
  forest: 'bg-emerald-50 text-gray-900'
};
const STAGE_THEME_LABELS = {
  default: 'Default',
  light: 'Light',
  dark: 'Dark',
  sunset: 'Sunset',
  forest: 'Forest'
};
const STAGE_THEME_OPTIONS = SOCIAL_THEME_PRESETS.map((value) => ({
  value,
  label: STAGE_THEME_LABELS[value] || value
}));
const STAGE_THEME_STYLE_PATCH = {
  default: {
    accentColorToken: 'blue',
    globalStyles: { pageBackgroundColor: '#f8fafc', panelColor: '#ffffff', fontColor: '#0f172a', headerColor: '#1d4ed8' },
    heroColor: '#2563eb'
  },
  light: {
    accentColorToken: 'blue',
    globalStyles: { pageBackgroundColor: '#ffffff', panelColor: '#ffffff', fontColor: '#0f172a', headerColor: '#2563eb' },
    heroColor: '#3b82f6'
  },
  dark: {
    accentColorToken: 'emerald',
    globalStyles: { pageBackgroundColor: '#020617', panelColor: '#0f172a', fontColor: '#e2e8f0', headerColor: '#10b981' },
    heroColor: '#10b981'
  },
  sunset: {
    accentColorToken: 'rose',
    globalStyles: { pageBackgroundColor: '#fff7ed', panelColor: '#ffedd5', fontColor: '#7c2d12', headerColor: '#f97316' },
    heroColor: '#f97316'
  },
  forest: {
    accentColorToken: 'emerald',
    globalStyles: { pageBackgroundColor: '#ecfdf5', panelColor: '#d1fae5', fontColor: '#14532d', headerColor: '#059669' },
    heroColor: '#059669'
  }
};

const SURFACE_TONE_STYLES = {
  blue: {
    ring: 'border-sky-200/80',
    glow: 'shadow-[0_0_0_1px_rgba(186,230,253,0.8),0_18px_45px_rgba(14,165,233,0.14)]',
    badge: 'bg-sky-100 text-sky-700',
    button: 'border-sky-200 text-sky-700 hover:bg-sky-50',
    iconBg: 'bg-sky-50',
    iconStroke: '#0284c7',
    primaryButton: 'bg-sky-600 text-white hover:bg-sky-700',
  },
  amber: {
    ring: 'border-amber-200/80',
    glow: 'shadow-[0_0_0_1px_rgba(253,230,138,0.8),0_18px_45px_rgba(245,158,11,0.16)]',
    badge: 'bg-amber-100 text-amber-700',
    button: 'border-amber-200 text-amber-700 hover:bg-amber-50',
    iconBg: 'bg-amber-50',
    iconStroke: '#d97706',
    primaryButton: 'bg-amber-600 text-white hover:bg-amber-700',
  },
  emerald: {
    ring: 'border-emerald-200/80',
    glow: 'shadow-[0_0_0_1px_rgba(167,243,208,0.8),0_18px_45px_rgba(16,185,129,0.15)]',
    badge: 'bg-emerald-100 text-emerald-700',
    button: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
    iconBg: 'bg-emerald-50',
    iconStroke: '#059669',
    primaryButton: 'bg-emerald-600 text-white hover:bg-emerald-700',
  }
};

const normalizeSocialPreferences = (input, profileTheme = 'default') => normalizePageDesign(input, profileTheme);

const isRenderableMediaUrl = (value) => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MEDIA_URL_MAX_LENGTH) return false;

  if (/^\/uploads\/\S+/i.test(trimmed)) return true;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const SAFE_COLOR_REGEX = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\((\s*\d+\s*,){2,3}\s*[\d.]+\s*\)|hsla?\([\d.\s,%]+\))$/i;
const sanitizeStyleColor = (value) => {
  const candidate = String(value || '').trim();
  return SAFE_COLOR_REGEX.test(candidate) ? candidate : '';
};

const normalizeMediaUrls = (mediaUrls) => {
  if (!Array.isArray(mediaUrls)) return [];

  const seen = new Set();
  const normalized = [];

  for (const rawUrl of mediaUrls) {
    if (typeof rawUrl !== 'string') continue;
    const trimmed = rawUrl.trim();
    if (!isRenderableMediaUrl(trimmed)) continue;

    const dedupeKey = trimmed.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    normalized.push(trimmed);
    if (normalized.length >= MEDIA_URL_MAX_ITEMS) break;
  }

  return normalized;
};

const parseInlineFormat = (text, keyPrefix) => {
  const source = String(text || '');
  const regex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[color=([a-z0-9#(),.%\s-]+)\]([\s\S]*?)\[\/color\]|\[bg=([a-z0-9#(),.%\s-]+)\]([\s\S]*?)\[\/bg\]|\[vline=(\d|10)\]([\s\S]*?)\[\/vline\]/gi;
  const nodes = [];
  let cursor = 0;
  let index = 0;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const [full] = match;
    if (match.index > cursor) {
      nodes.push(<React.Fragment key={`${keyPrefix}-text-${index}`}>{source.slice(cursor, match.index)}</React.Fragment>);
      index += 1;
    }
    if (match[1] && match[2]) {
      const imageUrl = String(match[2]).trim();
      if (isRenderableMediaUrl(imageUrl)) {
        const altText = String(match[1] || '').trim() || 'User uploaded image';
        nodes.push(<img key={`${keyPrefix}-img-${index}`} src={imageUrl} alt={altText} className="my-1 max-h-64 rounded-xl border object-cover" />);
      } else {
        nodes.push(<React.Fragment key={`${keyPrefix}-img-fallback-${index}`}>{full}</React.Fragment>);
      }
    } else if (match[3] && match[4]) {
      const linkUrl = String(match[4]).trim();
      if (isRenderableMediaUrl(linkUrl)) {
        nodes.push(<a key={`${keyPrefix}-link-${index}`} href={linkUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">{match[3]}</a>);
      } else {
        nodes.push(<React.Fragment key={`${keyPrefix}-link-fallback-${index}`}>{full}</React.Fragment>);
      }
    } else if (match[5]) {
      nodes.push(<strong key={`${keyPrefix}-strong-${index}`}>{match[5]}</strong>);
    } else if (match[6]) {
      nodes.push(<em key={`${keyPrefix}-em-${index}`}>{match[6]}</em>);
    } else if (match[7]) {
      nodes.push(<code key={`${keyPrefix}-code-${index}`} className="rounded bg-slate-100 px-1">{match[7]}</code>);
    } else if (match[8] && match[9]) {
      const colorValue = sanitizeStyleColor(match[8]);
      nodes.push(<span key={`${keyPrefix}-color-${index}`} style={colorValue ? { color: colorValue } : undefined}>{match[9]}</span>);
    } else if (match[10] && match[11]) {
      const bgColorValue = sanitizeStyleColor(match[10]);
      nodes.push(<span key={`${keyPrefix}-bg-${index}`} style={bgColorValue ? { backgroundColor: bgColorValue } : undefined}>{match[11]}</span>);
    } else if (match[12] !== undefined && match[13] !== undefined) {
      const thickness = Math.min(10, Math.max(0, Number(match[12])));
      nodes.push(
        <span key={`${keyPrefix}-vline-${index}`} className="my-1 inline-flex items-stretch gap-2 align-middle">
          <span className="rounded bg-slate-500" style={{ width: `${Math.max(1, thickness)}px` }} />
          <span>{match[13]}</span>
        </span>
      );
    }
    index += 1;
    cursor = match.index + full.length;
  }
  if (cursor < source.length) {
    nodes.push(<React.Fragment key={`${keyPrefix}-tail`}>{source.slice(cursor)}</React.Fragment>);
  }
  return nodes.length > 0 ? nodes : source;
};

const renderFormattedPostContent = (content) => {
  const lines = String(content || '').split('\n');
  return lines.map((line, lineIndex) => {
    if (/^###\s+/.test(line)) return <h3 key={`line-${lineIndex}`} className="text-base font-semibold">{parseInlineFormat(line.replace(/^###\s+/, ''), `h3-${lineIndex}`)}</h3>;
    if (/^##\s+/.test(line)) return <h2 key={`line-${lineIndex}`} className="text-lg font-semibold">{parseInlineFormat(line.replace(/^##\s+/, ''), `h2-${lineIndex}`)}</h2>;
    if (/^#\s+/.test(line)) return <h1 key={`line-${lineIndex}`} className="text-xl font-bold">{parseInlineFormat(line.replace(/^#\s+/, ''), `h1-${lineIndex}`)}</h1>;
    if (/^>\s+/.test(line)) return <blockquote key={`line-${lineIndex}`} className="border-l-4 border-slate-300 pl-3 italic text-slate-700">{parseInlineFormat(line.replace(/^>\s+/, ''), `quote-${lineIndex}`)}</blockquote>;
    if (/^[-*]\s+/.test(line)) return <p key={`line-${lineIndex}`} className="ml-4">{'\u2022 '}{parseInlineFormat(line.replace(/^[-*]\s+/, ''), `ul-${lineIndex}`)}</p>;
    if (/^\d+\.\s+/.test(line)) return <p key={`line-${lineIndex}`} className="ml-4">{parseInlineFormat(line, `ol-${lineIndex}`)}</p>;
    return <p key={`line-${lineIndex}`} className="whitespace-pre-wrap">{parseInlineFormat(line, `p-${lineIndex}`)}</p>;
  });
};

const getDisplayContent = (content, contentCensored, censorEnabled) => (
  censorEnabled && typeof contentCensored === 'string' ? contentCensored : content
);

const buildRecentImageHistory = (previousValue, nextValue, existing = []) => {
  const normalizedPrevious = typeof previousValue === 'string' ? previousValue.trim() : '';
  const normalizedNext = typeof nextValue === 'string' ? nextValue.trim() : '';
  const seen = new Set();
  const history = [];
  const append = (url) => {
    if (!isRenderableMediaUrl(url)) return;
    const key = url.toLowerCase();
    if (key === normalizedNext.toLowerCase() || seen.has(key)) return;
    seen.add(key);
    history.push(url);
  };

  if (normalizedPrevious) {
    append(normalizedPrevious);
  }
  existing.forEach((url) => append(typeof url === 'string' ? url.trim() : ''));
  return history.slice(0, HERO_IMAGE_HISTORY_LIMIT);
};

const renderMediaItem = (url, key) => {
  const safeKey = `${key}-${url}`;

  return (
    <a
      key={safeKey}
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block rounded overflow-hidden border bg-gray-50"
    >
      <img
        src={url}
        alt="Post media"
        loading="lazy"
        className="w-full h-56 object-cover"
        onError={(event) => {
          event.currentTarget.style.display = 'none';
          const fallback = event.currentTarget.nextElementSibling;
          if (fallback) fallback.style.display = 'block';
        }}
      />
      <span
        className="hidden text-blue-600 text-sm break-all hover:underline p-3"
      >
        {url}
      </span>
    </a>
  );
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

const getInteractionStatus = (interaction) => {
  if (!interaction?.type) return null;
  if (interaction.status === 'closed') return 'closed';

  const now = Date.now();
  if (interaction.expiresAt && new Date(interaction.expiresAt).getTime() <= now) {
    return 'expired';
  }
  if (
    interaction.type === 'countdown'
    && interaction.countdown?.targetAt
    && new Date(interaction.countdown.targetAt).getTime() <= now
  ) {
    return 'expired';
  }
  return interaction.status || 'active';
};

const formatRemainingTime = (targetAt, nowMs) => {
  const target = new Date(targetAt).getTime();
  if (!Number.isFinite(target)) return 'Unknown';
  const diffMs = Math.max(0, target - nowMs);
  if (diffMs === 0) return 'Expired';

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
};

const CALENDAR_PREVIEW_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getCalendarWeekStart = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const buildCalendarPreviewMonthGrid = (anchorDate) => {
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const gridStart = getCalendarWeekStart(monthStart);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
};

const buildCalendarWeekDays = (anchorDate) => {
  const weekStart = getCalendarWeekStart(anchorDate);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });
};

const CALENDAR_HOUR_LABELS = Array.from({ length: 24 }, (_, index) => {
  const hour = index % 12 || 12;
  const period = index < 12 ? 'AM' : 'PM';
  return `${hour}:00 ${period}`;
});

const MINI_CHAT_MESSAGE_GROUP_THRESHOLD_MS = 5 * 60 * 1000;

const toCalendarDateTimeLocalString = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatCalendarDayKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createHolidayEntry = (year, monthIndex, day, name, category) => {
  const date = new Date(year, monthIndex, day);
  return {
    id: `${category}-${name}-${formatCalendarDayKey(date)}`,
    name,
    category,
    date,
    dayKey: formatCalendarDayKey(date),
  };
};

const nthWeekdayOfMonth = (year, monthIndex, weekday, occurrence) => {
  const firstDay = new Date(year, monthIndex, 1);
  const dayOffset = (weekday - firstDay.getDay() + 7) % 7;
  return 1 + dayOffset + ((occurrence - 1) * 7);
};

const lastWeekdayOfMonth = (year, monthIndex, weekday) => {
  const lastDay = new Date(year, monthIndex + 1, 0);
  const dayOffset = (lastDay.getDay() - weekday + 7) % 7;
  return lastDay.getDate() - dayOffset;
};

const buildHolidayEntriesForYear = (year) => {
  const international = [
    createHolidayEntry(year, 0, 1, 'New Year\'s Day', 'international'),
    createHolidayEntry(year, 2, 8, 'International Women\'s Day', 'international'),
    createHolidayEntry(year, 3, 22, 'Earth Day', 'international'),
    createHolidayEntry(year, 4, 1, 'International Workers\' Day', 'international'),
    createHolidayEntry(year, 9, 24, 'United Nations Day', 'international'),
    createHolidayEntry(year, 11, 10, 'Human Rights Day', 'international'),
  ];

  const usFederal = [
    createHolidayEntry(year, 0, 1, 'US: New Year\'s Day', 'government'),
    createHolidayEntry(year, 0, nthWeekdayOfMonth(year, 0, 1, 3), 'US: Martin Luther King Jr. Day', 'government'),
    createHolidayEntry(year, 1, nthWeekdayOfMonth(year, 1, 1, 3), 'US: Presidents\' Day', 'government'),
    createHolidayEntry(year, 4, lastWeekdayOfMonth(year, 4, 1), 'US: Memorial Day', 'government'),
    createHolidayEntry(year, 5, 19, 'US: Juneteenth', 'government'),
    createHolidayEntry(year, 6, 4, 'US: Independence Day', 'government'),
    createHolidayEntry(year, 8, nthWeekdayOfMonth(year, 8, 1, 1), 'US: Labor Day', 'government'),
    createHolidayEntry(year, 9, nthWeekdayOfMonth(year, 9, 1, 2), 'US: Columbus Day', 'government'),
    createHolidayEntry(year, 10, 11, 'US: Veterans Day', 'government'),
    createHolidayEntry(year, 10, nthWeekdayOfMonth(year, 10, 4, 4), 'US: Thanksgiving Day', 'government'),
    createHolidayEntry(year, 11, 25, 'US: Christmas Day', 'government'),
  ];

  return [...international, ...usFederal];
};

const normalizePost = (post) => {
  const normalizedLikes = Array.isArray(post.likes)
    ? post.likes.map((like) => (typeof like === 'string' ? like : String(like?._id || like)))
    : [];

  const normalizedComments = Array.isArray(post.comments)
    ? post.comments.map((comment) => ({
      ...comment,
      userId:
        typeof comment.userId === 'string'
          ? comment.userId
          : String(comment.userId?._id || comment.userId || ''),
      username:
        typeof comment.userId === 'object' && comment.userId?.username
          ? comment.userId.username
          : comment.username || null,
    }))
    : [];

  return {
    ...post,
    likes: normalizedLikes,
    comments: normalizedComments,
    likesCount:
      typeof post.likesCount === 'number'
        ? post.likesCount
        : normalizedLikes.length,
    commentsCount:
      typeof post.commentsCount === 'number'
        ? post.commentsCount
        : normalizedComments.length,
    relationshipAudience: post.relationshipAudience === 'secure'
      ? 'secure'
      : (post.relationshipAudience === 'public' ? 'public' : 'social'),
    mediaUrls: normalizeMediaUrls(post.mediaUrls),
    interaction: post.interaction
      ? {
        ...post.interaction,
        status: getInteractionStatus(post.interaction),
      }
      : null,
  };
};

const normalizeGalleryItem = (item) => ({
  ...item,
  likesCount: typeof item?.likesCount === 'number' ? item.likesCount : 0,
  dislikesCount: typeof item?.dislikesCount === 'number' ? item.dislikesCount : 0,
  viewerReaction: item?.viewerReaction || null,
  title: item?.title || '',
  caption: item?.caption || '',
  mediaUrl: resolveUploadMediaUrl(item?.mediaUrl || ''),
  mediaType: item?.mediaType || 'url',
  comments: Array.isArray(item?.comments)
    ? item.comments.map((comment) => ({
      ...comment,
      userId: typeof comment?.userId === 'string'
        ? comment.userId
        : String(comment?.userId?._id || comment?.userId || ''),
      username: typeof comment?.userId === 'object' && comment?.userId?.username
        ? comment.userId.username
        : (comment?.username || null),
      content: comment?.content || '',
      createdAt: comment?.createdAt || null
    }))
    : [],
  commentsCount: typeof item?.commentsCount === 'number'
    ? item.commentsCount
    : (Array.isArray(item?.comments) ? item.comments.length : 0),
  relationshipAudience: item?.relationshipAudience === 'secure'
    ? 'secure'
    : (item?.relationshipAudience === 'public' ? 'public' : 'social'),
});

const normalizePersonalInfoFieldValue = (profileSource = {}, fieldId) => (
  fieldId === 'hobbies'
    ? (Array.isArray(profileSource?.hobbies) ? profileSource.hobbies.join(', ') : '')
    : String(profileSource?.[fieldId] || '').trim()
);

const resolveInitialHeroTab = (pathname = '', search = '') => {
  const requestedTab = new URLSearchParams(search).get('tab');
  if (SOCIAL_HERO_TABS.some((tab) => tab.id === requestedTab)) {
    return requestedTab;
  }
  if (pathname === '/friends') {
    return 'friends';
  }
  return 'main';
};

const Social = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const initialGuestUser = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('user') || '';
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getAuthToken()));
  const [currentUser, setCurrentUser] = useState(null);
  const [heroOverlayOpen, setHeroOverlayOpen] = useState(false);
  const [heroOverlayActivity, setHeroOverlayActivity] = useState({
    unreadNotificationCount: 0,
    unreadMessageCount: 0,
    notifications: [],
    messages: []
  });
  const [isGuestPreview, setIsGuestPreview] = useState(false);
  const [guestUser, setGuestUser] = useState(initialGuestUser);
  const [guestProfile, setGuestProfile] = useState(null);
  const [ownerResumeMeta, setOwnerResumeMeta] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [submittingPost, setSubmittingPost] = useState(false);
  const [postForm, setPostForm] = useState({
    content: '',
    codeContent: '',
    editorMode: 'design',
    mediaUrlInput: '',
    mediaUrls: [],
    visibility: 'friends',
    relationshipAudience: 'secure',
    visibleToCircles: [],
    visibleToUsers: [],
    excludeUsers: [],
    locationRadius: '',
    expirationPreset: 'none',
    contentType: 'standard',
    interaction: {
      poll: {
        question: '',
        options: ['', ''],
        allowMultiple: false,
        expiresAt: '',
      },
      quiz: {
        question: '',
        options: ['', ''],
        correctOptionIndex: 0,
        explanation: '',
        expiresAt: '',
      },
      countdown: {
        label: '',
        targetAt: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        linkUrl: '',
      },
    },
    imageDescriptions: {},
    imageAudienceOverrides: {},
  });
  const [composerMdGuideOpen, setComposerMdGuideOpen] = useState(false);
  const [composerMdMobileOpen, setComposerMdMobileOpen] = useState(false);
  const [copiedMd, setCopiedMd] = useState('');
  const [composerImageUploading, setComposerImageUploading] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [circles, setCircles] = useState([]);
  const [friends, setFriends] = useState([]);
  const [topFriends, setTopFriends] = useState([]);
  const [commentInputs, setCommentInputs] = useState({});
  const [typingByPost, setTypingByPost] = useState({});
  const [actionLoadingByPost, setActionLoadingByPost] = useState({});
  const [galleryItems, setGalleryItems] = useState([]);
  const [galleryTargetInput, setGalleryTargetInput] = useState(initialGuestUser);
  const [galleryTarget, setGalleryTarget] = useState(initialGuestUser.trim());
  const [galleryError, setGalleryError] = useState('');
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryActionLoadingByImage, setGalleryActionLoadingByImage] = useState({});
  const [galleryCommentSubmittingByImage, setGalleryCommentSubmittingByImage] = useState({});
  const [galleryCommentInputs, setGalleryCommentInputs] = useState({});
  const [galleryEditById, setGalleryEditById] = useState({});
  const [activeGalleryImageId, setActiveGalleryImageId] = useState(null);
  const [showGalleryUploadModal, setShowGalleryUploadModal] = useState(false);
  const [galleryUploadPreviews, setGalleryUploadPreviews] = useState([]);
  const [galleryUploadDescriptions, setGalleryUploadDescriptions] = useState({});
  const [galleryUploadAudienceOverrides, setGalleryUploadAudienceOverrides] = useState({});
  const [galleryUploadDefaultAudience, setGalleryUploadDefaultAudience] = useState('social');
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [heroRandomBackgroundImage, setHeroRandomBackgroundImage] = useState('');
  const [blockedUserIds, setBlockedUserIds] = useState([]);
  const [mutedUserIds, setMutedUserIds] = useState([]);
  const [myReports, setMyReports] = useState([]);
  const [reportModalState, setReportModalState] = useState({
    isOpen: false,
    targetType: 'post',
    targetId: null,
    targetUserId: null
  });
  const [commentTypingByPostId, setCommentTypingByPostId] = useState({});
  const [designStudioOpen, setDesignStudioOpen] = useState(false);
  const [draftTopFriendIds, setDraftTopFriendIds] = useState([]);
  const [inlineEditingPanelId, setInlineEditingPanelId] = useState('');
  const [activeHeroTab, setActiveHeroTab] = useState(() => resolveInitialHeroTab(window.location.pathname, window.location.search));
  const [heroEditingOpen, setHeroEditingOpen] = useState(false);
  const [draftSocialPreferences, setDraftSocialPreferences] = useState(null);
  const [socialConfigs, setSocialConfigs] = useState([]);
  const [favoriteDesigns, setFavoriteDesigns] = useState([]);
  const [sharedDesigns, setSharedDesigns] = useState([]);
  const [socialTemplates, setSocialTemplates] = useState(SOCIAL_DESIGN_TEMPLATES);
  const [layoutPresets, setLayoutPresets] = useState(SOCIAL_LAYOUT_PRESETS);
  const [designBusy, setDesignBusy] = useState(false);
  const [designError, setDesignError] = useState('');
  const [designSuccessMessage, setDesignSuccessMessage] = useState('');
  const [hasUnsavedDesignChanges, setHasUnsavedDesignChanges] = useState(false);
  const [activeDesignConfigId, setActiveDesignConfigId] = useState(null);
  const [viewportLayoutMode, setViewportLayoutMode] = useState(() => (window.innerWidth < 1024 ? 'mobile' : 'desktop'));
  const [editorLayoutMode, setEditorLayoutMode] = useState(() => (window.innerWidth < 1024 ? 'mobile' : 'desktop'));
  const [profileChatThreadId, setProfileChatThreadId] = useState('');
  const [profileChatMessages, setProfileChatMessages] = useState([]);
  const [profileChatLoading, setProfileChatLoading] = useState(false);
  const [profileChatError, setProfileChatError] = useState('');
  const [profileChatInput, setProfileChatInput] = useState('');
  const [profileChatSending, setProfileChatSending] = useState(false);
  const [profileChatPermissions, setProfileChatPermissions] = useState({ isOwner: false, canRead: false, canWrite: false });
  const [profileChatAccess, setProfileChatAccess] = useState({ readRoles: ['friends', 'circles'], writeRoles: ['friends', 'circles'] });
  const [profileChatAccessDraft, setProfileChatAccessDraft] = useState({ readRoles: ['friends', 'circles'], writeRoles: ['friends', 'circles'] });
  const [profileChatSavingAccess, setProfileChatSavingAccess] = useState(false);
  const [profileChatControlsExpanded, setProfileChatControlsExpanded] = useState(false);
  const [miniChatDesktopViewportMaxHeight, setMiniChatDesktopViewportMaxHeight] = useState(null);
  const [calendarPreviewEvents, setCalendarPreviewEvents] = useState([]);
  const [calendarPreviewLoading, setCalendarPreviewLoading] = useState(false);
  const [calendarPreviewError, setCalendarPreviewError] = useState('');
  const [calendarPreviewOwnerVisibility, setCalendarPreviewOwnerVisibility] = useState('private');
  const [calendarPreviewShowsOwnerEvents, setCalendarPreviewShowsOwnerEvents] = useState(false);
  const [calendarPreviewAnchorDate, setCalendarPreviewAnchorDate] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [calendarViewType, setCalendarViewType] = useState('monthly');
  const [calendarEventModal, setCalendarEventModal] = useState(null);
  const [calendarEventBusy, setCalendarEventBusy] = useState(false);
  const [partnerActionBusyFriendshipId, setPartnerActionBusyFriendshipId] = useState('');
  const [partnerActionError, setPartnerActionError] = useState('');
  const [partnerSearchOpen, setPartnerSearchOpen] = useState(false);
  const [partnerSearchQuery, setPartnerSearchQuery] = useState('');
  const [partnerConfirmFriend, setPartnerConfirmFriend] = useState(null);
  const [personalInfoModalOpen, setPersonalInfoModalOpen] = useState(false);
  const [personalInfoDraft, setPersonalInfoDraft] = useState({ values: {}, visibility: {} });
  const [personalInfoSaveBusy, setPersonalInfoSaveBusy] = useState(false);
  const [personalInfoSaveError, setPersonalInfoSaveError] = useState('');
  const [composerVisible, setComposerVisible] = useState(false);
  const [showProfileCompletionHint, setShowProfileCompletionHint] = useState(false);
  const [showSlimHeader, setShowSlimHeader] = useState(false);
  const [enabledSections, setEnabledSections] = useState({ blog: false, resume: false, aboutme: false });
  const [blogPosts, setBlogPosts] = useState([]);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogError, setBlogError] = useState('');
  const [blogEditing, setBlogEditing] = useState(null);
  const [blogViewingPost, setBlogViewingPost] = useState(null);
  const [blogForm, setBlogForm] = useState({ title: '', content: '', excerpt: '', category: 'General', tags: [], audience: 'social', status: 'draft', backgroundImage: '', backgroundColor: '', fontFamily: '', fontSize: 16, fontColor: '' });
  const [blogFormBusy, setBlogFormBusy] = useState(false);
  const [blogIndexStyle, setBlogIndexStyle] = useState('date');
  const [blogCategories, setBlogCategories] = useState([]);
  const [aboutMeContent, setAboutMeContent] = useState('');
  const [aboutMeEditing, setAboutMeEditing] = useState(false);
  const [aboutMeSaving, setAboutMeSaving] = useState(false);
  const [resumeData, setResumeData] = useState(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeEditing, setResumeEditing] = useState(false);
  const localTypingTimeoutsRef = useRef({});
  const remoteTypingTimeoutsRef = useRef({});
  const designDirtyRef = useRef(false);
  const composerDesignTextareaRef = useRef(null);
  const composerCodeTextareaRef = useRef(null);
  const miniChatViewportRef = useRef(null);
  const miniChatPanelRef = useRef(null);
  const socialSidebarRef = useRef(null);

  const realtimeEnabled = currentUser?.realtimePreferences?.enabled !== false;

  const requestedProfileIdentifier = guestUser.trim();
  const normalizedRequestedProfileIdentifier = requestedProfileIdentifier.toLowerCase();
  const normalizedCurrentUserId = String(currentUser?._id || '').trim().toLowerCase();
  const normalizedCurrentUsername = String(currentUser?.username || '').trim().toLowerCase();
  const isViewingAnotherProfile = Boolean(
    isAuthenticated
      && currentUser
      && normalizedRequestedProfileIdentifier
      && normalizedRequestedProfileIdentifier !== normalizedCurrentUserId
      && normalizedRequestedProfileIdentifier !== normalizedCurrentUsername
  );
  const isOwnSocialContext = isAuthenticated && !isViewingAnotherProfile;
  const activeProfile = isAuthenticated && !isViewingAnotherProfile
    ? currentUser
    : guestProfile;
  const activeLayoutMode = designStudioOpen ? editorLayoutMode : viewportLayoutMode;
  const socialPreferences = useMemo(
    () => normalizeSocialPreferences(
      draftSocialPreferences || activeProfile?.socialPagePreferences,
      activeProfile?.profileTheme,
      activeLayoutMode
    ),
    [draftSocialPreferences, activeProfile?.socialPagePreferences, activeProfile?.profileTheme, activeLayoutMode]
  );

  useEffect(() => {
    const sections = activeProfile?.socialPagePreferences?.enabledSections;
    if (sections && typeof sections === 'object') {
      setEnabledSections({
        blog: Boolean(sections.blog),
        resume: Boolean(sections.resume),
        aboutme: Boolean(sections.aboutme)
      });
    } else {
      setEnabledSections({ blog: false, resume: false, aboutme: false });
    }
  }, [activeProfile?.socialPagePreferences?.enabledSections]);

  useEffect(() => {
    if (!enabledSections.blog) { setBlogPosts([]); return; }
    const username = activeProfile?.username;
    if (!username) return;
    setBlogLoading(true);
    setBlogError('');
    const loadBlog = isOwnSocialContext && !isGuestPreview
      ? blogAPI.getMyPosts()
      : blogAPI.getUserPosts(username);
    loadBlog.then(({ data }) => {
      setBlogPosts(Array.isArray(data?.posts) ? data.posts : []);
      if (data?.indexStyle) setBlogIndexStyle(data.indexStyle);
      if (Array.isArray(data?.categories)) setBlogCategories(data.categories);
    }).catch(() => setBlogError('Failed to load blog posts.')).finally(() => setBlogLoading(false));
  }, [enabledSections.blog, activeProfile?.username, isOwnSocialContext, isGuestPreview]);

  useEffect(() => {
    if (!enabledSections.resume) { setResumeData(null); return; }
    const username = activeProfile?.username;
    if (!username) return;
    setResumeLoading(true);
    resumeAPI.getPublicResume(username).then(({ data }) => {
      setResumeData(data?.resume || null);
    }).catch(() => setResumeData(null)).finally(() => setResumeLoading(false));
  }, [enabledSections.resume, activeProfile?.username]);

  useEffect(() => {
    const aboutMe = activeProfile?.socialPagePreferences?.aboutMeContent || '';
    setAboutMeContent(aboutMe);
  }, [activeProfile?.socialPagePreferences?.aboutMeContent]);

  const visibleHeroTabs = useMemo(() => {
    return SOCIAL_HERO_TABS.filter((tab) => {
      if (!tab.optional) return true;
      if (isOwnSocialContext && !isGuestPreview) return true; // Owner sees all tabs
      return enabledSections[tab.id] === true; // Guest only sees enabled tabs
    });
  }, [isOwnSocialContext, isGuestPreview, enabledSections]);

  const handleToggleSection = useCallback(async (sectionId, options = {}) => {
    if (!isOwnSocialContext) return;
    const enabling = !enabledSections[sectionId];
    let audienceChoice = options.audience || null;

    // Ask for Social/Secure audience when enabling resume
    if (enabling && sectionId === 'resume' && !audienceChoice) {
      const choice = window.prompt('Should your resume be visible under Social or Secure?\n\nType "social" or "secure":', 'social');
      if (!choice) return;
      audienceChoice = choice.trim().toLowerCase() === 'secure' ? 'secure' : 'social';
    }

    const prev = { ...enabledSections };
    const next = { ...enabledSections, [sectionId]: enabling };
    setEnabledSections(next);
    try {
      const currentPrefs = draftSocialPreferences || activeProfile?.socialPagePreferences || {};
      const updates = { ...currentPrefs, enabledSections: next };
      if (audienceChoice) {
        updates.sectionAudience = { ...(currentPrefs.sectionAudience || {}), [sectionId]: audienceChoice };
      }
      await socialPageAPI.savePreferences(updates);
      setCurrentUser((prev) => prev ? { ...prev, socialPagePreferences: { ...prev.socialPagePreferences, enabledSections: next, ...(audienceChoice ? { sectionAudience: { ...prev.socialPagePreferences?.sectionAudience, [sectionId]: audienceChoice } } : {}) } } : prev);
    } catch (error) {
      setEnabledSections(prev);
    }
  }, [isOwnSocialContext, enabledSections, draftSocialPreferences, activeProfile?.socialPagePreferences]);

  const handleBlogSubmit = useCallback(async () => {
    if (!blogForm.title.trim() || !blogForm.content.trim()) return;
    setBlogFormBusy(true);
    try {
      if (blogEditing) {
        const { data } = await blogAPI.updatePost(blogEditing, blogForm);
        setBlogPosts((prev) => prev.map((p) => String(p._id) === String(blogEditing) ? data.post : p));
      } else {
        const { data } = await blogAPI.createPost(blogForm);
        setBlogPosts((prev) => [data.post, ...prev]);
      }
      setBlogEditing(null);
      setBlogForm({ title: '', content: '', excerpt: '', category: 'General', tags: [], audience: 'social', status: 'draft', backgroundImage: '', backgroundColor: '', fontFamily: '', fontSize: 16, fontColor: '' });
    } catch (error) {
      setBlogError(error.response?.data?.error || 'Failed to save blog post.');
    } finally {
      setBlogFormBusy(false);
    }
  }, [blogForm, blogEditing]);

  const handleBlogDelete = useCallback(async (postId) => {
    if (!window.confirm('Delete this blog post?')) return;
    try {
      await blogAPI.deletePost(postId);
      setBlogPosts((prev) => prev.filter((p) => String(p._id) !== String(postId)));
    } catch (error) {
      setBlogError('Failed to delete post.');
    }
  }, []);

  const handleBlogReact = useCallback(async (postId, reaction) => {
    try {
      const { data } = await blogAPI.reactToPost(postId, reaction);
      setBlogPosts((prev) => prev.map((p) => String(p._id) === String(postId) ? { ...p, reactionCounts: data.reactions } : p));
    } catch (error) { /* ignore */ }
  }, []);

  const handleAboutMeSave = useCallback(async () => {
    if (!isOwnSocialContext) return;
    setAboutMeSaving(true);
    try {
      const currentPrefs = draftSocialPreferences || activeProfile?.socialPagePreferences || {};
      await socialPageAPI.savePreferences({ ...currentPrefs, aboutMeContent });
      setCurrentUser((prev) => prev ? { ...prev, socialPagePreferences: { ...prev.socialPagePreferences, aboutMeContent } } : prev);
      setAboutMeEditing(false);
    } catch (error) { /* ignore */ } finally {
      setAboutMeSaving(false);
    }
  }, [isOwnSocialContext, aboutMeContent, draftSocialPreferences, activeProfile?.socialPagePreferences]);

  const isSectionVisible = useCallback(
    (sectionId) => socialPreferences.effective?.panels?.[sectionId]?.visible !== false,
    [socialPreferences]
  );
  const isModuleVisible = useCallback(
    (moduleId) => !socialPreferences.hiddenModules.includes(moduleId),
    [socialPreferences.hiddenModules]
  );
  const headerGradientClass = THEME_ACCENT_TO_HEADER_CLASS[socialPreferences.accentColorToken] || THEME_ACCENT_TO_HEADER_CLASS.blue;
  const pageThemeClass = THEME_TO_PAGE_CLASS[socialPreferences.themePreset] || THEME_TO_PAGE_CLASS.default;
  const galleryImageUrls = useMemo(
    () => galleryItems.map((item) => item.mediaUrl).filter((url) => isRenderableMediaUrl(url)),
    [galleryItems]
  );
  const isHeroRandomGalleryEnabled = Boolean(socialPreferences.hero?.backgroundImageUseRandomGallery);
  const resolvedHeroBackgroundImage = useMemo(() => {
    if (isHeroRandomGalleryEnabled && galleryImageUrls.length > 0) {
      return heroRandomBackgroundImage || galleryImageUrls[0];
    }
    return resolveUploadMediaUrl(socialPreferences.hero?.backgroundImage || '');
  }, [isHeroRandomGalleryEnabled, galleryImageUrls, heroRandomBackgroundImage, socialPreferences.hero?.backgroundImage]);
  const heroConfig = useMemo(
    () => ({ ...(socialPreferences.hero || {}), backgroundImage: resolvedHeroBackgroundImage || null }),
    [socialPreferences.hero, resolvedHeroBackgroundImage]
  );

  useEffect(() => {
    if (!isHeroRandomGalleryEnabled || galleryImageUrls.length === 0) {
      setHeroRandomBackgroundImage('');
      return undefined;
    }

    setHeroRandomBackgroundImage((prev) => {
      if (galleryImageUrls.length === 1) return galleryImageUrls[0];
      if (galleryImageUrls.includes(prev)) return prev;
      return galleryImageUrls[Math.floor(Math.random() * galleryImageUrls.length)];
    });

    const intervalId = window.setInterval(() => {
      setHeroRandomBackgroundImage((prev) => {
        if (galleryImageUrls.length === 1) return galleryImageUrls[0];
        const options = galleryImageUrls.filter((url) => url !== prev);
        const pool = options.length > 0 ? options : galleryImageUrls;
        return pool[Math.floor(Math.random() * pool.length)];
      });
    }, HERO_RANDOM_BACKGROUND_ROTATION_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isHeroRandomGalleryEnabled, galleryImageUrls]);

  const heroProfile = useMemo(() => {
    const profileSource = activeProfile || currentUser || {};
    const locationLabel = [profileSource?.city, profileSource?.state, profileSource?.country]
      .filter(Boolean)
      .join(', ');
    const matchingFriend = friends.find((friend) => String(friend?._id || '') === String(profileSource?._id || ''));
    const presence = isOwnSocialContext
      ? { status: 'online', lastSeen: null }
      : (matchingFriend?.presence || { status: 'offline', lastSeen: profileSource?.lastActive || null });

    return {
      name: profileSource?.realName || profileSource?.name || profileSource?.username || 'User',
      location: locationLabel || profileSource?.location || '',
      avatarUrl: socialPreferences.hero?.profileImage || profileSource?.avatarUrl || '',
      presence,
      isOnline: Boolean(isOwnSocialContext),
      lastActive: presence.lastSeen || profileSource?.lastActive || null
    };
  }, [activeProfile, currentUser, friends, isOwnSocialContext, socialPreferences.hero?.profileImage]);
  const isPrivateGuestLock = !isOwnSocialContext && Boolean(activeProfile?.isPrivateProfile);
  const socialCalendarPath = useMemo(() => {
    const calendarUsername = activeProfile?.username || requestedProfileIdentifier;
    if (!calendarUsername || isOwnSocialContext) {
      return '/calendar';
    }
    return `/calendar?user=${encodeURIComponent(calendarUsername)}`;
  }, [activeProfile?.username, requestedProfileIdentifier, isOwnSocialContext]);
  const handleHeroTabChange = useCallback((tabId) => {
    if (tabId === 'calendar' && !isOwnSocialContext) {
      navigate(socialCalendarPath);
      return;
    }
    setActiveHeroTab(tabId);
  }, [isOwnSocialContext, navigate, socialCalendarPath]);
  const socialChatPath = useMemo(() => {
    if (isAuthenticated && !isOwnSocialContext && activeProfile?._id) {
      return `/chat?profile=${encodeURIComponent(String(activeProfile._id))}`;
    }
    return '/chat';
  }, [isAuthenticated, isOwnSocialContext, activeProfile?._id]);
  const resolvedProfileUsername = activeProfile?.username || currentUser?.username || requestedProfileIdentifier;
  const socialProfilePath = useMemo(() => {
    if (!resolvedProfileUsername) {
      return '/social';
    }
    return `/social?user=${encodeURIComponent(resolvedProfileUsername)}`;
  }, [resolvedProfileUsername]);
  const socialFriendsPath = useMemo(() => {
    const friendsUsername = resolvedProfileUsername;
    if (!friendsUsername || isOwnSocialContext) {
      return '/friends';
    }
    return `/friends?user=${encodeURIComponent(friendsUsername)}`;
  }, [resolvedProfileUsername, isOwnSocialContext]);
  const handleProfileCompletionAction = useCallback((actionId) => {
    if (actionId === 'details') {
      setPersonalInfoModalOpen(true);
      setShowProfileCompletionHint(false);
      return;
    }

    if (actionId === 'gallery') {
      setActiveHeroTab('gallery');
      setGalleryComposerPanels((prev) => ({ ...prev, details: true }));
      setShowProfileCompletionHint(false);
      return;
    }

    if (actionId === 'post') {
      setActiveHeroTab('main');
      setComposerVisible(true);
      setShowProfileCompletionHint(false);
    }
  }, []);
  const dismissProfileCompletionHint = useCallback((persist = false) => {
    setShowProfileCompletionHint(false);
    if (persist && typeof window !== 'undefined') {
      window.localStorage.setItem(GENTLE_PROFILE_HINT_STORAGE_KEY, '1');
    }
  }, []);
  const socialChatLabel = !isOwnSocialContext && activeProfile?.username
    ? `Message @${activeProfile.username}`
    : 'Open chat';
  const profileChatAccessSummary = useMemo(() => {
    const readLabels = profileChatAccess.readRoles.map((role) => PROFILE_CHAT_ROLE_OPTIONS.find((option) => option.value === role)?.label || role);
    const writeLabels = profileChatAccess.writeRoles.map((role) => PROFILE_CHAT_ROLE_OPTIONS.find((option) => option.value === role)?.label || role);
    return {
      read: readLabels.join(', ') || 'Friends, Circles',
      write: writeLabels.join(', ') || 'Friends, Circles'
    };
  }, [profileChatAccess]);
  const isProfileChatOwnMessage = useCallback((message) => Boolean(
    isAuthenticated
    && message?.userId?._id
    && currentUser?._id
    && String(message.userId._id) === String(currentUser._id)
  ), [isAuthenticated, currentUser?._id]);

  const toggleProfileChatRole = useCallback((field, role) => {
    setProfileChatAccessDraft((prev) => {
      const current = Array.isArray(prev[field]) ? prev[field] : [];
      const hasRole = current.includes(role);
      const nextRoles = hasRole ? current.filter((entry) => entry !== role) : [...current, role];
      return {
        ...prev,
        [field]: nextRoles.length > 0 ? nextRoles : current
      };
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated || location.pathname !== '/social') {
      return;
    }

    const username = String(currentUser?.username || '').trim();
    if (!username) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const currentUserParam = String(params.get('user') || '').trim();
    if (currentUserParam === username) {
      return;
    }

    params.set('user', username);
    navigate(`/social?${params.toString()}`, { replace: true });
  }, [isAuthenticated, currentUser?.username, location.pathname, location.search, navigate]);

  useEffect(() => {
    const loadProfileChatThread = async () => {
      setProfileChatControlsExpanded(false);
      if (!activeProfile?._id) {
        setProfileChatThreadId('');
        setProfileChatMessages([]);
        setProfileChatPermissions({ isOwner: false, canRead: false, canWrite: false });
        setProfileChatError('');
        return;
      }

      setProfileChatLoading(true);
      setProfileChatError('');
      try {
        const { data } = await chatAPI.getProfileThread(activeProfile._id);
        const thread = data?.conversation || {};
        const threadId = thread?._id ? String(thread._id) : '';
        const nextAccess = {
          readRoles: Array.isArray(thread?.profileThreadAccess?.readRoles) ? thread.profileThreadAccess.readRoles : ['friends', 'circles'],
          writeRoles: Array.isArray(thread?.profileThreadAccess?.writeRoles) ? thread.profileThreadAccess.writeRoles : ['friends', 'circles']
        };
        setProfileChatThreadId(threadId);
        setProfileChatAccess(nextAccess);
        setProfileChatAccessDraft(nextAccess);
        setProfileChatPermissions({
          isOwner: Boolean(thread?.permissions?.isOwner),
          canRead: Boolean(thread?.permissions?.canRead),
          canWrite: Boolean(thread?.permissions?.canWrite)
        });

        if (!threadId || !thread?.permissions?.canRead) {
          setProfileChatMessages([]);
          return;
        }

        const { data: messageData } = await chatAPI.getConversationMessages(threadId, 1, 25);
        setProfileChatMessages(Array.isArray(messageData?.messages) ? messageData.messages : []);
      } catch (error) {
        setProfileChatThreadId('');
        setProfileChatMessages([]);
        setProfileChatPermissions({ isOwner: false, canRead: false, canWrite: false });
        setProfileChatError(error.response?.data?.error || 'Unable to load profile chat room.');
      } finally {
        setProfileChatLoading(false);
      }
    };

    loadProfileChatThread();
  }, [activeProfile?._id]);

  useEffect(() => {
    if (!heroOverlayOpen || !isAuthenticated || !currentUser?._id) {
      if (!isAuthenticated) {
        setHeroOverlayActivity({
          unreadNotificationCount: 0,
          unreadMessageCount: 0,
          notifications: [],
          messages: []
        });
      }
      return undefined;
    }

    let isCancelled = false;

    const loadHeroOverlayActivity = async () => {
      const [notificationCountResponse, notificationsResponse, conversationsResponse] = await Promise.all([
        notificationAPI.getUnreadCount().catch(() => ({ data: { count: Number(currentUser?.unreadNotificationCount || 0) } })),
        notificationAPI.getNotifications(1, 3).catch(() => ({ data: { notifications: [] } })),
        chatAPI.getConversations().catch(() => ({ data: { conversations: { zip: { current: null, nearby: [] }, dm: [], profile: [] } } }))
      ]);

      if (isCancelled) {
        return;
      }

      const notifications = Array.isArray(notificationsResponse.data?.notifications)
        ? notificationsResponse.data.notifications.filter((item) => !item?.isRead).slice(0, 2)
        : [];

      const conversations = conversationsResponse.data?.conversations || {};
      const threadedMessages = [
        ...(Array.isArray(conversations.dm) ? conversations.dm : []),
        ...(Array.isArray(conversations.profile) ? conversations.profile : [])
      ];

      const unreadMessageCount = threadedMessages.reduce(
        (total, conversation) => total + Number(conversation?.unreadCount || conversation?.unreadMessages || 0),
        0
      );

      const messageItems = threadedMessages
        .filter((conversation) => Boolean(conversation?.lastMessageAt || conversation?.messageCount))
        .sort((left, right) => new Date(right?.lastMessageAt || 0).getTime() - new Date(left?.lastMessageAt || 0).getTime())
        .slice(0, 2)
        .map((conversation) => {
          const title = conversation?.type === 'dm'
            ? (conversation?.peer?.realName || conversation?.peer?.username || 'Direct message')
            : (conversation?.profileUser?.realName
              ? `${conversation.profileUser.realName}'s thread`
              : (conversation?.profileUser?.username ? `${conversation.profileUser.username}'s thread` : (conversation?.title || 'Profile thread')));

          return {
            id: conversation?._id || title,
            title,
            summary: unreadMessageCount > 0
              ? `${Number(conversation?.unreadCount || conversation?.unreadMessages || 0) || 0} unread messages`
              : `${Number(conversation?.messageCount || 0)} total messages`,
            timestamp: conversation?.lastMessageAt || null
          };
        });

      setHeroOverlayActivity({
        unreadNotificationCount: Number(notificationCountResponse.data?.count ?? currentUser?.unreadNotificationCount ?? 0),
        unreadMessageCount,
        notifications,
        messages: messageItems
      });
    };

    loadHeroOverlayActivity();
    return () => {
      isCancelled = true;
    };
  }, [heroOverlayOpen, isAuthenticated, currentUser?._id, currentUser?.unreadNotificationCount]);

  useEffect(() => {
    const loadCalendarPreview = async () => {
      if (activeHeroTab !== 'calendar' || isPrivateGuestLock) {
        return;
      }

      const calendarUsername = isOwnSocialContext
        ? currentUser?.username
        : (activeProfile?.username || requestedProfileIdentifier);
      if (!calendarUsername) {
        setCalendarPreviewEvents([]);
        setCalendarPreviewError('');
        setCalendarPreviewOwnerVisibility('private');
        setCalendarPreviewShowsOwnerEvents(false);
        return;
      }

      const monthGrid = buildCalendarPreviewMonthGrid(calendarPreviewAnchorDate);
      const rangeStart = monthGrid[0];
      const rangeEnd = new Date(monthGrid[monthGrid.length - 1]);
      rangeEnd.setDate(rangeEnd.getDate() + 1);

      setCalendarPreviewLoading(true);
      setCalendarPreviewError('');
      try {
        const params = { from: rangeStart.toISOString(), to: rangeEnd.toISOString() };
        let response = null;

        if (isOwnSocialContext && isAuthenticated) {
          setCalendarPreviewOwnerVisibility('private');
          setCalendarPreviewShowsOwnerEvents(true);
          response = await calendarAPI.getMyEvents(params);
        } else {
          const { data: calendarMeta } = await calendarAPI.getUserCalendar(calendarUsername);
          const ownerGuestVisibility = calendarMeta?.calendar?.guestVisibility || 'private';
          const viewerIsOwner = Boolean(calendarMeta?.isOwner);
          setCalendarPreviewOwnerVisibility(ownerGuestVisibility);
          setCalendarPreviewShowsOwnerEvents(viewerIsOwner || ownerGuestVisibility !== 'private');
          response = await calendarAPI.getUserCalendarEvents(calendarUsername, params);
        }

        const nextEvents = Array.isArray(response.data?.events) ? response.data.events : [];
        setCalendarPreviewEvents(nextEvents);
      } catch (error) {
        setCalendarPreviewEvents([]);
        setCalendarPreviewShowsOwnerEvents(false);
        const statusCode = Number(error?.response?.status || 0);
        if (statusCode === 403) {
          setCalendarPreviewError('This owner has hidden calendar events for your current access level.');
        } else {
          setCalendarPreviewError(error.response?.data?.error || 'Unable to load calendar preview.');
        }
      } finally {
        setCalendarPreviewLoading(false);
      }
    };

    loadCalendarPreview();
  }, [
    activeHeroTab,
    isPrivateGuestLock,
    isOwnSocialContext,
    isAuthenticated,
    currentUser?.username,
    activeProfile?.username,
    requestedProfileIdentifier,
    calendarPreviewAnchorDate
  ]);

  const handleSendProfileChatMessage = useCallback(async () => {
    const content = profileChatInput.trim();
    if (!content || !profileChatThreadId || profileChatSending || !profileChatPermissions.canWrite) return;
    // Enforce max 2 consecutive messages from same user (client-side check)
    if (!profileChatPermissions.isOwner && profileChatMessages.length >= 2) {
      const lastTwo = profileChatMessages.slice(-2);
      const currentUserId = String(currentUser?._id || '');
      if (currentUserId && lastTwo.every(m => String(m?.userId?._id || m?.userId) === currentUserId)) {
        setProfileChatError('You may only send 2 consecutive messages. Please wait for others to interact before continuing.');
        return;
      }
    }
    setProfileChatSending(true);
    setProfileChatError('');
    try {
      const { data } = await chatAPI.sendConversationMessage(profileChatThreadId, { content });
      if (data?.message) {
        setProfileChatMessages((prev) => [...prev, data.message]);
      }
      setProfileChatInput('');
    } catch (error) {
      setProfileChatError(error.response?.data?.error || 'Failed to send message.');
    } finally {
      setProfileChatSending(false);
    }
  }, [profileChatInput, profileChatThreadId, profileChatSending, profileChatPermissions.canWrite, profileChatPermissions.isOwner, profileChatMessages, currentUser?._id]);

  const handleDeleteProfileChatMessage = useCallback(async (messageId) => {
    if (!profileChatPermissions.isOwner || !profileChatThreadId || !messageId) return;
    try {
      await chatAPI.deleteConversationMessage(profileChatThreadId, messageId);
      setProfileChatMessages((prev) => prev.filter((m) => String(m._id) !== String(messageId)));
    } catch (error) {
      setProfileChatError(error.response?.data?.error || 'Failed to delete message.');
    }
  }, [profileChatPermissions.isOwner, profileChatThreadId]);

  useEffect(() => {
    const el = miniChatViewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [profileChatMessages]);

  const handleSaveProfileChatAccess = useCallback(async () => {
    if (!profileChatPermissions.isOwner || !activeProfile?._id) return;
    setProfileChatSavingAccess(true);
    setProfileChatError('');
    try {
      const payload = {
        readRoles: profileChatAccessDraft.readRoles,
        writeRoles: profileChatAccessDraft.writeRoles
      };
      const { data } = await chatAPI.updateProfileThreadSettings(activeProfile._id, payload);
      const savedAccess = {
        readRoles: Array.isArray(data?.conversation?.profileThreadAccess?.readRoles) ? data.conversation.profileThreadAccess.readRoles : payload.readRoles,
        writeRoles: Array.isArray(data?.conversation?.profileThreadAccess?.writeRoles) ? data.conversation.profileThreadAccess.writeRoles : payload.writeRoles
      };
      setProfileChatAccess(savedAccess);
      setProfileChatAccessDraft(savedAccess);
      setProfileChatPermissions((prev) => ({
        ...prev,
        isOwner: data?.conversation?.permissions?.isOwner ?? true,
        canRead: data?.conversation?.permissions?.canRead ?? true,
        canWrite: data?.conversation?.permissions?.canWrite ?? true
      }));
    } catch (error) {
      setProfileChatError(error.response?.data?.error || 'Failed to save chat access settings.');
    } finally {
      setProfileChatSavingAccess(false);
    }
  }, [profileChatPermissions.isOwner, activeProfile?._id, profileChatAccessDraft]);

  const galleryOwnerIdentifier = useMemo(() => {
    // Profile context (/social?user=...) uses target user gallery
    if (isViewingAnotherProfile) {
      if (guestProfile?._id) {
        return String(guestProfile._id);
      }
      return requestedProfileIdentifier;
    }

    // Authenticated users on own /social always see only their own gallery
    if (isAuthenticated && currentUser?._id) {
      return String(currentUser._id);
    }

    // Guest mode: browse by explicit galleryTarget input
    if (galleryTarget) {
      return galleryTarget;
    }

    if (guestProfile?._id) {
      return String(guestProfile._id);
    }

    return requestedProfileIdentifier;
  }, [
    isViewingAnotherProfile,
    guestProfile?._id,
    requestedProfileIdentifier,
    isAuthenticated,
    currentUser?._id,
    galleryTarget
  ]);

  const viewerCanReact = isAuthenticated && !isGuestPreview && Boolean(currentUser?._id);
  const normalizedGalleryOwnerIdentifier = String(galleryOwnerIdentifier || '').trim().toLowerCase();

  const canManageGallery =
    viewerCanReact
    && !isGuestPreview
    && Boolean(galleryOwnerIdentifier)
    && (
      normalizedGalleryOwnerIdentifier === normalizedCurrentUserId
      || normalizedGalleryOwnerIdentifier === normalizedCurrentUsername
    );
  const activeGalleryImage = useMemo(
    () => galleryItems.find((item) => item._id === activeGalleryImageId) || null,
    [galleryItems, activeGalleryImageId]
  );
  const topFriendIdSet = useMemo(
    () => new Set(topFriends.map((friend) => String(friend._id))),
    [topFriends]
  );
  const draftTopFriends = useMemo(() => {
    const lookup = new Map();
    [...topFriends, ...friends].forEach((friend) => {
      if (friend?._id) {
        lookup.set(String(friend._id), friend);
      }
    });
    return draftTopFriendIds
      .map((friendId) => lookup.get(String(friendId)))
      .filter(Boolean);
  }, [draftTopFriendIds, topFriends, friends]);

  useEffect(() => {
    setDraftTopFriendIds(topFriends.slice(0, TOP_FRIENDS_LIMIT).map((friend) => String(friend._id)));
  }, [topFriends]);

  const trackSocialEvent = useCallback((eventType, metadata = {}) => {
    if (!isAuthenticated) return;
    discoveryAPI.trackEvent(eventType, metadata).catch(() => {});
  }, [isAuthenticated]);

  const handleGuestPreviewToggle = (enabled) => {
    setIsGuestPreview(enabled);
    trackSocialEvent('social_guest_preview_toggled', { enabled });
  };

  const handlePartnerListingAction = async (friendshipId, action) => {
    const normalizedFriendshipId = String(friendshipId || '').trim();
    if (!normalizedFriendshipId || !isOwnSocialContext || isGuestPreview) return;
    setPartnerActionBusyFriendshipId(normalizedFriendshipId);
    setPartnerActionError('');
    try {
      const response = await friendsAPI.updatePartnerStatus(normalizedFriendshipId, action);
      const partner = response.data?.partner || {};
      const nextStatus = ['none', 'pending', 'accepted'].includes(partner.status) ? partner.status : 'none';
      const requestedByViewer = Boolean(partner.requestedByViewer);
      const requestedAt = partner.requestedAt || null;
      setFriends((prev) => prev.map((friend) => {
        if (String(friend.friendshipId || '') !== normalizedFriendshipId) {
          return friend;
        }
        return {
          ...friend,
          partnerStatus: nextStatus,
          partnerRequestedByViewer: requestedByViewer,
          partnerCanRespond: nextStatus === 'pending' && !requestedByViewer,
          partnerRequestedAt: requestedAt
        };
      }));
    } catch (error) {
      setPartnerActionError(error.response?.data?.error || 'Failed to update partner listing.');
    } finally {
      setPartnerActionBusyFriendshipId('');
    }
  };

  const buildPersonalInfoDraftFromProfile = useCallback((profileSource) => {
    const nextValues = {};
    const nextVisibility = {};
    PERSONAL_INFO_FIELDS.forEach((field) => {
      nextValues[field.id] = normalizePersonalInfoFieldValue(profileSource, field.id);
      const rawVisibility = profileSource?.profileFieldVisibility?.[field.id];
      nextVisibility[field.id] = rawVisibility === 'secure' ? 'secure' : 'social';
    });
    return { values: nextValues, visibility: nextVisibility };
  }, []);

  const openPersonalInfoModal = useCallback(() => {
    setPersonalInfoDraft(buildPersonalInfoDraftFromProfile(currentUser || {}));
    setPersonalInfoSaveError('');
    setPersonalInfoModalOpen(true);
  }, [buildPersonalInfoDraftFromProfile, currentUser]);

  const handlePersonalInfoDraftValueChange = useCallback((fieldId, value) => {
    setPersonalInfoDraft((prev) => ({
      ...prev,
      values: {
        ...(prev.values || {}),
        [fieldId]: value
      }
    }));
  }, []);

  const handlePersonalInfoDraftVisibilityChange = useCallback((fieldId, visibility) => {
    setPersonalInfoDraft((prev) => ({
      ...prev,
      visibility: {
        ...(prev.visibility || {}),
        [fieldId]: visibility === 'secure' ? 'secure' : 'social'
      }
    }));
  }, []);

  const handleSavePersonalInfo = useCallback(async () => {
    if (!isOwnSocialContext || isGuestPreview) return;
    setPersonalInfoSaveBusy(true);
    setPersonalInfoSaveError('');
    try {
      const payload = {
        profileFieldVisibility: {}
      };
      PERSONAL_INFO_FIELDS.forEach((field) => {
        const rawValue = personalInfoDraft?.values?.[field.id];
        if (field.id === 'hobbies') {
          payload.hobbies = String(rawValue || '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .slice(0, MAX_HOBBIES);
        } else {
          payload[field.id] = String(rawValue || '').trim();
        }
        payload.profileFieldVisibility[field.id] = personalInfoDraft?.visibility?.[field.id] === 'secure' ? 'secure' : 'social';
      });
      const response = await authAPI.updateProfile(payload);
      const updatedUser = response.data?.user || null;
      if (updatedUser) {
        setCurrentUser(updatedUser);
      }
      setPersonalInfoModalOpen(false);
    } catch (error) {
      setPersonalInfoSaveError(error.response?.data?.error || 'Failed to save personal information.');
    } finally {
      setPersonalInfoSaveBusy(false);
    }
  }, [isOwnSocialContext, isGuestPreview, personalInfoDraft]);

  const setGalleryActionLoading = (imageId, value) => {
    setGalleryActionLoadingByImage((prev) => {
      if (!value) {
        const next = { ...prev };
        delete next[imageId];
        return next;
      }
      return { ...prev, [imageId]: true };
    });
  };

  const loadGallery = useCallback(async () => {
    if (!galleryOwnerIdentifier) {
      setGalleryItems([]);
      setGalleryError('');
      return;
    }

    if (isPrivateGuestLock) {
      setGalleryItems([]);
      setGalleryError('');
      return;
    }

    setGalleryLoading(true);
    setGalleryError('');
    try {
      const response = await galleryAPI.getGallery(galleryOwnerIdentifier, 1, GALLERY_MAX_ITEMS);
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      setGalleryItems(items.map(normalizeGalleryItem));
    } catch (error) {
      setGalleryItems([]);
      setGalleryError(error.response?.data?.error || 'Failed to load gallery.');
    } finally {
      setGalleryLoading(false);
    }
  }, [galleryOwnerIdentifier, isPrivateGuestLock]);

  const setPostActionLoading = (postId, value) => {
    setActionLoadingByPost((prev) => {
      if (!value) {
        const next = { ...prev };
        delete next[postId];
        return next;
      }
      return { ...prev, [postId]: true };
    });
  };

  const hydrateInteractionsForPosts = useCallback(async (normalizedPosts) => {
    const interactivePosts = normalizedPosts.filter((post) => post.interaction?.type);
    if (interactivePosts.length === 0) {
      return normalizedPosts;
    }

    const interactionResults = await Promise.all(
      interactivePosts.map(async (post) => {
        try {
          const response = await feedAPI.getInteraction(post._id);
          return { postId: post._id, interaction: response.data?.interaction || null };
        } catch {
          return { postId: post._id, interaction: post.interaction };
        }
      })
    );

    const byPostId = new Map(interactionResults.map((entry) => [entry.postId, entry.interaction]));
    return normalizedPosts.map((post) => (
      byPostId.has(post._id)
        ? { ...post, interaction: byPostId.get(post._id) }
        : post
    ));
  }, []);

  const fetchTimelineWithRetry = useCallback(async () => {
    try {
      return await feedAPI.getTimeline();
    } catch (firstError) {
      const statusCode = Number(firstError?.response?.status || 0);
      const shouldRetry = !statusCode || statusCode >= 500;
      if (!shouldRetry) {
        throw firstError;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 500));
      return feedAPI.getTimeline();
    }
  }, []);

  const loadAuthenticatedFeed = useCallback(async () => {
    const [profileResponse, resumeMetaResponse] = await Promise.all([
      authAPI.getProfile(),
      resumeAPI.getMyResume().catch(() => null)
    ]);
    const user = profileResponse.data?.user;
    setCurrentUser(user || null);
    setOwnerResumeMeta(resumeMetaResponse?.data?.resume || null);

    const [circlesResponse, friendsResponse] = await Promise.all([
      circlesAPI.getCircles().catch(() => ({ data: { circles: [] } })),
      friendsAPI.getFriends().catch(() => ({ data: { friends: [] } }))
    ]);
    setCircles(Array.isArray(circlesResponse.data?.circles) ? circlesResponse.data.circles : []);
    const nextFriends = Array.isArray(friendsResponse.data?.friends) ? friendsResponse.data.friends : [];
    setFriends(nextFriends);

    const topFriendsResponse = await friendsAPI
      .getTopFriends(user?.username || user?._id)
      .catch(() => ({ data: { topFriends: [] } }));
    setTopFriends(Array.isArray(topFriendsResponse.data?.topFriends) ? topFriendsResponse.data.topFriends : []);

    const [blocksResponse, mutesResponse, reportsResponse] = await Promise.all([
      moderationAPI.getBlocks().catch(() => ({ data: { blockedUsers: [] } })),
      moderationAPI.getMutes().catch(() => ({ data: { mutedUsers: [] } })),
      moderationAPI.getMyReports().catch(() => ({ data: { reports: [] } }))
    ]);

    setBlockedUserIds((blocksResponse.data?.blockedUsers || []).map((entry) => String(entry._id)));
    setMutedUserIds((mutesResponse.data?.mutedUsers || []).map((entry) => String(entry._id)));
    setMyReports(Array.isArray(reportsResponse.data?.reports) ? reportsResponse.data.reports : []);

    const timelineResponse = await fetchTimelineWithRetry();
    const timelinePosts = Array.isArray(timelineResponse.data?.posts)
      ? timelineResponse.data.posts
      : [];
    const normalizedPosts = timelinePosts.map(normalizePost);
    const hydratedPosts = await hydrateInteractionsForPosts(normalizedPosts);
    setPosts(hydratedPosts);
    setGuestProfile(null);
  }, [fetchTimelineWithRetry, hydrateInteractionsForPosts]);

  const loadGuestFeed = useCallback(async () => {
    if (!guestUser.trim()) {
      setPosts([]);
      setGuestProfile(null);
      setOwnerResumeMeta(null);
      setCircles([]);
      setFriends([]);
      setFeedError('Enter a username or user ID in Guest mode to view a public feed.');
      return;
    }

    const [response, circlesResponse] = await Promise.all([
      feedAPI.getPublicUserFeed(guestUser.trim()),
      friendsAPI.getPublicCircles(guestUser.trim()).catch(() => ({ data: { circles: [] } }))
    ]);
    const publicPosts = Array.isArray(response.data?.posts) ? response.data.posts : [];
    setPosts(publicPosts.map(normalizePost));
    setGuestProfile(response.data?.user || null);
    setCircles(Array.isArray(circlesResponse.data?.circles) ? circlesResponse.data.circles : []);
    setFriends([]);
    setOwnerResumeMeta(null);
  }, [guestUser]);

  const visibleResumeInfo = useMemo(() => {
    if (isOwnSocialContext && currentUser?.username && ownerResumeMeta?.hasResume) {
      return {
        username: currentUser.username,
        resumeUrl: ownerResumeMeta.resumeUrl || `/resume/${encodeURIComponent(currentUser.username)}`,
        resumeHeadline: ownerResumeMeta.resumeHeadline || null,
        canManage: true
      };
    }

    if (guestProfile?.hasPublicResume && guestProfile?.username && guestProfile?.resumeUrl) {
      return {
        username: guestProfile.username,
        resumeUrl: guestProfile.resumeUrl,
        resumeHeadline: guestProfile.resumeHeadline || null,
        canManage: false
      };
    }

    return null;
  }, [isOwnSocialContext, currentUser?.username, ownerResumeMeta, guestProfile]);

  const handleResumeProfileLinkClick = useCallback((resumeUsername) => {
    if (!resumeUsername) return;
    resumeAPI.trackProfileLinkClick(resumeUsername, 'social_page').catch(() => {});
  }, []);

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    setFeedError('');

    const token = getAuthToken();
    if (!token) {
      setIsAuthenticated(false);
      try {
        await loadGuestFeed();
      } catch (error) {
        setFeedError(error.response?.data?.error || 'Failed to load public feed.');
      } finally {
        setLoadingFeed(false);
      }
      return;
    }

    setIsAuthenticated(true);
    try {
      if (isViewingAnotherProfile) {
        await loadGuestFeed();
      } else {
        await loadAuthenticatedFeed();
      }
    } catch (error) {
      setFeedError(error.response?.data?.error || (isViewingAnotherProfile
        ? 'Failed to load public feed.'
        : 'Failed to load timeline.'));
      setPosts([]);
    } finally {
      setLoadingFeed(false);
    }
  }, [loadAuthenticatedFeed, loadGuestFeed, isViewingAnotherProfile]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  useEffect(() => {
    if (!isAuthenticated || !galleryOwnerIdentifier || isPrivateGuestLock) {
      setTopFriends([]);
      return;
    }

    friendsAPI.getTopFriends(galleryOwnerIdentifier)
      .then((response) => {
        setTopFriends(Array.isArray(response.data?.topFriends) ? response.data.topFriends : []);
      })
      .catch(() => {
        setTopFriends([]);
      });
  }, [isAuthenticated, galleryOwnerIdentifier, isPrivateGuestLock]);

  useEffect(() => {
    if (!isAuthenticated || !galleryOwnerIdentifier) return;
    trackSocialEvent('social_gallery_opened', { profile: galleryOwnerIdentifier });
  }, [isAuthenticated, galleryOwnerIdentifier, trackSocialEvent]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser?._id || realtimeEnabled) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      loadAuthenticatedFeed().catch(() => {
        // keep polling fallback resilient
      });
    }, FEED_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isAuthenticated, currentUser?._id, realtimeEnabled, loadAuthenticatedFeed]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser?._id || !realtimeEnabled) {
      return undefined;
    }

    const token = getAuthToken();
    if (!token) {
      return undefined;
    }

    const socket = getRealtimeSocket({ token, userId: currentUser._id });
    const subscribedPostIds = posts.map((post) => String(post._id || '')).filter(Boolean);
    subscribedPostIds.forEach((postId) => subscribeToPost(postId));

    const offFeedPost = onFeedPost((payload) => {
      const incomingPost = payload?.post ? normalizePost(payload.post) : null;
      if (!incomingPost?._id) return;

      setPosts((prev) => {
        const existingIndex = prev.findIndex((item) => String(item._id) === String(incomingPost._id));
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = { ...next[existingIndex], ...incomingPost };
          return next;
        }
        return [incomingPost, ...prev];
      });

      subscribeToPost(incomingPost._id);
    });

    const offFeedInteraction = onFeedInteraction((payload) => {
      const postId = String(payload?.postId || '').trim();
      if (!postId) return;

      setPosts((prev) => prev.map((item) => {
        if (String(item._id) !== postId) return item;

        const next = {
          ...item,
          likesCount: typeof payload?.likesCount === 'number' ? payload.likesCount : item.likesCount,
          commentsCount: typeof payload?.commentsCount === 'number' ? payload.commentsCount : item.commentsCount
        };

        if (payload?.type === 'comment' && payload?.comment?._id) {
          const alreadyExists = next.comments.some((comment) => String(comment._id) === String(payload.comment._id));
          if (!alreadyExists) {
            next.comments = [...next.comments, payload.comment];
          }
        }

        return next;
      }));
    });

    const offFriendPresence = onFriendPresence((payload) => {
      const userId = String(payload?.userId || '').trim();
      if (!userId) return;

      setFriends((prev) => prev.map((friend) => (
        String(friend?._id || '') === userId
          ? { ...friend, presence: { status: payload.status, lastSeen: payload.lastSeen || null } }
          : friend
      )));
    });

    const offTyping = onTyping((payload) => {
      if (payload?.scope !== 'comment' || !payload?.targetId || !payload?.userId) return;

      const postId = String(payload.targetId);
      const userId = String(payload.userId);
      const timeoutKey = `${postId}:${userId}`;

      if (payload.status === 'stop') {
        const existingTimeout = remoteTypingTimeoutsRef.current[timeoutKey];
        if (existingTimeout) {
          window.clearTimeout(existingTimeout);
          delete remoteTypingTimeoutsRef.current[timeoutKey];
        }

        setCommentTypingByPostId((prev) => {
          const next = { ...prev };
          const postTyping = { ...(next[postId] || {}) };
          delete postTyping[userId];
          if (Object.keys(postTyping).length === 0) {
            delete next[postId];
          } else {
            next[postId] = postTyping;
          }
          return next;
        });
        return;
      }

      setCommentTypingByPostId((prev) => ({
        ...prev,
        [postId]: {
          ...(prev[postId] || {}),
          [userId]: payload.label || 'Someone'
        }
      }));

      const existingTimeout = remoteTypingTimeoutsRef.current[timeoutKey];
      if (existingTimeout) {
        window.clearTimeout(existingTimeout);
      }

      remoteTypingTimeoutsRef.current[timeoutKey] = window.setTimeout(() => {
        setCommentTypingByPostId((prev) => {
          const next = { ...prev };
          const postTyping = { ...(next[postId] || {}) };
          delete postTyping[userId];
          if (Object.keys(postTyping).length === 0) {
            delete next[postId];
          } else {
            next[postId] = postTyping;
          }
          return next;
        });
        delete remoteTypingTimeoutsRef.current[timeoutKey];
      }, REMOTE_TYPING_TTL_MS);
    });

    return () => {
      subscribedPostIds.forEach((postId) => unsubscribeFromPost(postId));
      offFeedPost();
      offFeedInteraction();
      offFriendPresence();
      offTyping();
      void socket;
    };
  }, [isAuthenticated, currentUser?._id, realtimeEnabled, posts]);

  useEffect(() => () => {
    Object.values(localTypingTimeoutsRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId));
    Object.values(remoteTypingTimeoutsRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setViewportLayoutMode(window.innerWidth < 1024 ? 'mobile' : 'desktop');
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!designStudioOpen) {
      setEditorLayoutMode(viewportLayoutMode);
    }
  }, [designStudioOpen, viewportLayoutMode]);

  useEffect(() => {
    if (activeHeroTab !== 'chat') {
      setMiniChatDesktopViewportMaxHeight(null);
      return undefined;
    }

    const updateMiniChatHeight = () => {
      if (window.innerWidth < DESKTOP_LAYOUT_BREAKPOINT_PX) {
        setMiniChatDesktopViewportMaxHeight(null);
        return;
      }
      const sidebarRect = socialSidebarRef.current?.getBoundingClientRect();
      const panelRect = miniChatPanelRef.current?.getBoundingClientRect();
      const viewportRect = miniChatViewportRef.current?.getBoundingClientRect();
      if (!sidebarRect || !panelRect || !viewportRect) {
        setMiniChatDesktopViewportMaxHeight(null);
        return;
      }
      const panelChromeHeight = Math.max(0, panelRect.height - viewportRect.height);
      const availablePanelHeight = sidebarRect.bottom - panelRect.top;
      const availableViewportHeight = Math.floor(availablePanelHeight - panelChromeHeight);
      if (!Number.isFinite(availableViewportHeight)) {
        setMiniChatDesktopViewportMaxHeight(null);
        return;
      }
      const nextHeight = Math.max(MINI_CHAT_MIN_VIEWPORT_HEIGHT_PX, availableViewportHeight);
      setMiniChatDesktopViewportMaxHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    updateMiniChatHeight();
    window.addEventListener('resize', updateMiniChatHeight);

    let resizeObserver;
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(updateMiniChatHeight);
      if (socialSidebarRef.current) resizeObserver.observe(socialSidebarRef.current);
      if (miniChatPanelRef.current) resizeObserver.observe(miniChatPanelRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateMiniChatHeight);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [activeHeroTab]);

  useEffect(() => {
    if (isGuestPreview || !isOwnSocialContext || activeHeroTab !== 'main') {
      setComposerVisible(false);
    }
  }, [activeHeroTab, isGuestPreview, isOwnSocialContext]);

  useEffect(() => {
    const handleScroll = () => {
      const shouldShow = window.innerWidth >= 1024 && window.scrollY > 240;
      setShowSlimHeader((prev) => (prev === shouldShow ? prev : shouldShow));
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  const loadDesignData = useCallback(async () => {
    if (!isOwnSocialContext) {
      setSocialConfigs([]);
      setFavoriteDesigns([]);
      return;
    }

    try {
      const response = await socialPageAPI.getConfigs();
      setSocialConfigs(Array.isArray(response.data?.configs) ? response.data.configs : []);
      setFavoriteDesigns(Array.isArray(response.data?.favorites) ? response.data.favorites : []);
      setSocialTemplates(Array.isArray(response.data?.templates) && response.data.templates.length > 0
        ? response.data.templates
        : SOCIAL_DESIGN_TEMPLATES);
      setLayoutPresets(SOCIAL_LAYOUT_PRESETS);
      setActiveDesignConfigId(response.data?.activeConfigId || null);
      setHasUnsavedDesignChanges(false);
      designDirtyRef.current = false;
      if (response.data?.currentPreferences) {
        setCurrentUser((prev) => (prev ? {
          ...prev,
          socialPagePreferences: response.data.currentPreferences
        } : prev));
      }
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to load social page designs.');
    }
  }, [isOwnSocialContext]);

  const loadSharedDesigns = useCallback(async () => {
    if (!requestedProfileIdentifier || isOwnSocialContext) {
      setSharedDesigns([]);
      return;
    }

    try {
      const response = await socialPageAPI.getSharedByUser(requestedProfileIdentifier);
      const configs = Array.isArray(response.data?.configs) ? response.data.configs : [];
      const activeSharedConfigId = response.data?.activeConfigId ? String(response.data.activeConfigId) : '';
      const ordered = [...configs].sort((left, right) => {
        if (String(left._id) === activeSharedConfigId) return -1;
        if (String(right._id) === activeSharedConfigId) return 1;
        return 0;
      });
      setSharedDesigns(ordered);
    } catch {
      setSharedDesigns([]);
    }
  }, [requestedProfileIdentifier, isOwnSocialContext]);

  useEffect(() => {
    loadDesignData();
  }, [loadDesignData]);

  useEffect(() => {
    loadSharedDesigns();
  }, [loadSharedDesigns]);

  const patchDraftPreferences = useCallback((updater) => {
    setDesignError('');
    setDesignSuccessMessage('');
    setDraftSocialPreferences((prev) => {
      const base = prev || socialPreferences;
      const nextValue = typeof updater === 'function' ? updater(base) : updater;
      return normalizeSocialPreferences(
        nextValue,
        currentUser?.profileTheme || activeProfile?.profileTheme || 'default',
        activeLayoutMode
      );
    });
    designDirtyRef.current = true;
    setHasUnsavedDesignChanges(true);
  }, [socialPreferences, currentUser?.profileTheme, activeProfile?.profileTheme, activeLayoutMode]);

  const markCustomizerDirty = useCallback(() => {
    setDesignError('');
    setDesignSuccessMessage('');
    designDirtyRef.current = true;
    setHasUnsavedDesignChanges(true);
  }, []);

  const toggleDraftTopFriend = useCallback((friendId) => {
    const normalizedId = String(friendId || '');
    if (!normalizedId) return;

    setDraftTopFriendIds((prev) => {
      if (prev.includes(normalizedId)) {
        markCustomizerDirty();
        return prev.filter((id) => id !== normalizedId);
      }
      if (prev.length >= TOP_FRIENDS_LIMIT) {
        setDesignError(`Select up to ${TOP_FRIENDS_LIMIT} Top Friends.`);
        return prev;
      }
      markCustomizerDirty();
      return [...prev, normalizedId];
    });
  }, [markCustomizerDirty]);

  const moveDraftTopFriend = useCallback((index, direction) => {
    setDraftTopFriendIds((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (index < 0 || index >= next.length || targetIndex < 0 || targetIndex >= next.length) {
        return prev;
      }
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      markCustomizerDirty();
      return next;
    });
  }, [markCustomizerDirty]);

  const saveDraftPreferences = useCallback(async () => {
    if (!isOwnSocialContext || !designDirtyRef.current) return;
    const currentTopFriendIds = topFriends.slice(0, TOP_FRIENDS_LIMIT).map((friend) => String(friend._id));
    const topFriendsChanged = JSON.stringify(currentTopFriendIds) !== JSON.stringify(draftTopFriendIds);
    if (!draftSocialPreferences && !topFriendsChanged) return;
    setDesignBusy(true);
    setDesignError('');
    try {
      let savedPreferences = draftSocialPreferences;

      if (draftSocialPreferences) {
        const response = await socialPageAPI.savePreferences(draftSocialPreferences, true);
        savedPreferences = normalizeSocialPreferences(
          response.data?.preferences || draftSocialPreferences,
          currentUser?.profileTheme || activeProfile?.profileTheme || 'default',
          activeLayoutMode
        );
        setCurrentUser((prev) => (prev ? { ...prev, socialPagePreferences: savedPreferences } : prev));
        setDraftSocialPreferences(savedPreferences);
        setActiveDesignConfigId(savedPreferences.activeConfigId || null);
      }

      if (topFriendsChanged) {
        const topFriendsResponse = await friendsAPI.updateTopFriends(draftTopFriendIds);
        setTopFriends(Array.isArray(topFriendsResponse.data?.topFriends) ? topFriendsResponse.data.topFriends : []);
      }

      setDesignSuccessMessage('Stage settings saved');
      designDirtyRef.current = false;
      setHasUnsavedDesignChanges(false);
      setDesignStudioOpen(false);
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to save social page customization.');
    } finally {
      setDesignBusy(false);
    }
  }, [
    isOwnSocialContext,
    draftSocialPreferences,
    draftTopFriendIds,
    topFriends,
    currentUser?.profileTheme,
    activeProfile?.profileTheme,
    activeLayoutMode
  ]);

  const cancelDraftPreferences = useCallback(() => {
    const restored = normalizeSocialPreferences(
      activeProfile?.socialPagePreferences,
      activeProfile?.profileTheme || 'default',
      activeLayoutMode
    );
    setDraftSocialPreferences(restored);
    setDraftTopFriendIds(topFriends.slice(0, TOP_FRIENDS_LIMIT).map((friend) => String(friend._id)));
    setDesignError('');
    setDesignSuccessMessage('Draft changes discarded');
    designDirtyRef.current = false;
    setHasUnsavedDesignChanges(false);
  }, [activeProfile?.socialPagePreferences, activeProfile?.profileTheme, activeLayoutMode, topFriends]);

  const updateGlobalStyles = useCallback((patch) => {
    patchDraftPreferences((prev) => mergeDesignPatch(prev, { globalStyles: patch }));
  }, [patchDraftPreferences]);

  const updateHeroConfig = useCallback((patch) => {
    patchDraftPreferences((prev) => mergeDesignPatch(prev, { hero: patch }));
  }, [patchDraftPreferences]);
  const updateHeroMediaPreference = useCallback((field, rawValue) => {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (value && !isRenderableMediaUrl(value)) {
      setDesignError('Hero images must use a valid http/https URL.');
      return;
    }
    const historyField = field === 'backgroundImage' ? 'backgroundImageHistory' : 'profileImageHistory';
    patchDraftPreferences((prev) => {
      const currentHero = prev?.hero || {};
      const previousValue = typeof currentHero[field] === 'string' ? currentHero[field].trim() : '';
      const existingHistory = Array.isArray(currentHero[historyField]) ? currentHero[historyField] : [];
      return mergeDesignPatch(prev, {
        hero: {
          [field]: value || null,
          [historyField]: buildRecentImageHistory(previousValue, value, existingHistory)
        }
      });
    });
  }, [patchDraftPreferences]);
  const uploadHeroMediaPreference = useCallback(async (event, field) => {
    if (!isOwnSocialContext || !galleryOwnerIdentifier) return;
    const [file] = Array.from(event.target.files || []);
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setDesignError('Only image files are supported.');
      return;
    }

    if (file.size > GALLERY_MAX_IMAGE_SIZE_BYTES) {
      setDesignError('Image file is too large (max 3MB).');
      return;
    }

    setDesignBusy(true);
    setDesignError('');
    try {
      const response = await galleryAPI.uploadGalleryItem(galleryOwnerIdentifier, file, `Hero ${field === 'backgroundImage' ? 'background' : 'profile'} image`, 'social');
      const created = response.data?.item ? normalizeGalleryItem(response.data.item) : null;
      if (created) {
        setGalleryItems((prev) => [created, ...prev]);
        updateHeroMediaPreference(field, created.mediaUrl || '');
      } else {
        await loadGallery();
      }
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to upload image.');
    } finally {
      setDesignBusy(false);
    }
  }, [isOwnSocialContext, galleryOwnerIdentifier, updateHeroMediaPreference, loadGallery]);
  const updateThemePreset = useCallback((themePreset) => {
    const resolvedPreset = SOCIAL_THEME_PRESETS.includes(themePreset) ? themePreset : 'default';
    const themeStylePatch = STAGE_THEME_STYLE_PATCH[resolvedPreset] || STAGE_THEME_STYLE_PATCH.default;
    patchDraftPreferences((prev) => mergeDesignPatch(prev, {
      themePreset: resolvedPreset,
      accentColorToken: themeStylePatch.accentColorToken,
      globalStyles: themeStylePatch.globalStyles,
      hero: {
        menuActiveColor: themeStylePatch.heroColor,
        locationColor: themeStylePatch.heroColor
      }
    }));
  }, [patchDraftPreferences]);

  const updatePanelPreferences = useCallback((panelId, patch, mode) => {
    const resolvedMode = mode || activeLayoutMode;
    const scopedPatch = {
      layouts: {
        activeMode: resolvedMode,
        [resolvedMode]: {
          panels: {
            [panelId]: patch
          }
        }
      }
    };
    if (resolvedMode === 'desktop') {
      scopedPatch.panels = { [panelId]: patch };
    }
    patchDraftPreferences((prev) => mergeDesignPatch(prev, {
      ...scopedPatch
    }));
  }, [patchDraftPreferences, activeLayoutMode]);

  const buildPanelOverridePatch = useCallback((enabled) => (
    enabled ? { useCustomStyles: true } : { useCustomStyles: false, styles: {} }
  ), []);

  const movePanel = useCallback((panelId, direction, mode) => {
    const resolvedMode = mode || activeLayoutMode;
    patchDraftPreferences((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const panelCollection = resolvedMode === 'desktop'
        ? (next.layouts?.desktop?.panels || next.panels || {})
        : (next.layouts?.mobile?.panels || {});
      const panel = panelCollection?.[panelId];
      if (!panel) return next;
      const siblings = Object.entries(panelCollection)
        .filter(([, value]) => value.area === panel.area)
        .sort((left, right) => (left[1].order || 0) - (right[1].order || 0));
      const index = siblings.findIndex(([id]) => id === panelId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return next;
      const [currentId] = siblings[index];
      const [targetId] = siblings[targetIndex];
      const currentOrder = panelCollection[currentId].order;
      panelCollection[currentId].order = panelCollection[targetId].order;
      panelCollection[targetId].order = currentOrder;
      if (resolvedMode === 'desktop') {
        next.panels = {
          ...(next.panels || {}),
          [currentId]: panelCollection[currentId],
          [targetId]: panelCollection[targetId]
        };
      }
      next.layouts = {
        ...(next.layouts || {}),
        activeMode: resolvedMode,
        [resolvedMode]: {
          ...((next.layouts && next.layouts[resolvedMode]) || {}),
          panels: panelCollection
        }
      };
      return next;
    });
  }, [patchDraftPreferences, activeLayoutMode]);

  const applyTemplate = useCallback((template) => {
    if (!template?.design) return;
    patchDraftPreferences((prev) => mergeDesignPatch(prev, template.design));
  }, [patchDraftPreferences]);

  const applyLayoutPreset = useCallback((preset, mode) => {
    const resolvedMode = mode || activeLayoutMode;
    if (!preset?.panels) return;
    patchDraftPreferences((prev) => mergeDesignPatch(prev, {
      ...(resolvedMode === 'desktop' ? { panels: preset.panels } : {}),
      layouts: {
        activeMode: resolvedMode,
        [resolvedMode]: { panels: preset.panels }
      }
    }));
  }, [patchDraftPreferences, activeLayoutMode]);

  const saveNewConfig = useCallback(async (name) => {
    setDesignBusy(true);
    setDesignError('');
    try {
      const response = await socialPageAPI.createConfig({
        name,
        design: draftSocialPreferences || socialPreferences,
        apply: false
      });
      const created = response.data?.config;
      if (created) {
        setSocialConfigs((prev) => [created, ...prev]);
      }
      setDesignSuccessMessage('Saved configuration created');
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to create saved configuration.');
    } finally {
      setDesignBusy(false);
    }
  }, [draftSocialPreferences, socialPreferences]);

  const saveConfigUpdate = useCallback(async (configId, payload) => {
    setDesignBusy(true);
    setDesignError('');
    try {
      const response = await socialPageAPI.updateConfig(configId, payload);
      const updated = response.data?.config;
      if (updated) {
        setSocialConfigs((prev) => prev.map((config) => (config._id === configId ? updated : config)));
      }
      setDesignSuccessMessage('Configuration updated');
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to update configuration.');
    } finally {
      setDesignBusy(false);
    }
  }, []);

  const applySavedConfig = useCallback(async (configId) => {
    setDesignBusy(true);
    setDesignError('');
    try {
      const response = await socialPageAPI.applyConfig(configId);
      const preferences = normalizeSocialPreferences(
        response.data?.preferences || socialPreferences,
        currentUser?.profileTheme || 'default',
        activeLayoutMode
      );
      setCurrentUser((prev) => (prev ? { ...prev, socialPagePreferences: preferences } : prev));
      setDraftSocialPreferences(preferences);
      setActiveDesignConfigId(response.data?.activeConfigId || configId);
      setInlineEditingPanelId('');
      setDesignSuccessMessage('Configuration applied');
      setHasUnsavedDesignChanges(false);
      designDirtyRef.current = false;
      await loadDesignData();
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to apply configuration.');
    } finally {
      setDesignBusy(false);
    }
  }, [socialPreferences, currentUser?.profileTheme, loadDesignData, activeLayoutMode]);

  const duplicateConfig = useCallback(async (configId, name) => {
    setDesignBusy(true);
    try {
      const response = await socialPageAPI.duplicateConfig(configId, { name, apply: false });
      if (response.data?.config) {
        setSocialConfigs((prev) => [response.data.config, ...prev]);
      }
      setDesignSuccessMessage('Configuration duplicated');
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to duplicate configuration.');
    } finally {
      setDesignBusy(false);
    }
  }, []);

  const deleteConfig = useCallback(async (configId) => {
    setDesignBusy(true);
    try {
      const response = await socialPageAPI.deleteConfig(configId);
      setSocialConfigs((prev) => prev.filter((config) => config._id !== configId));
      setActiveDesignConfigId(response.data?.activeConfigId || null);
      await loadDesignData();
      setDesignSuccessMessage('Configuration deleted');
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to delete configuration.');
    } finally {
      setDesignBusy(false);
    }
  }, [loadDesignData]);

  const toggleFavoriteSharedDesign = useCallback(async (config) => {
    try {
      if (config.isFavorite) {
        await socialPageAPI.unfavoriteShared(config._id);
      } else {
        await socialPageAPI.favoriteShared(config._id);
      }
      await Promise.all([loadSharedDesigns(), loadDesignData()]);
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to update favorite design.');
    }
  }, [loadDesignData, loadSharedDesigns]);

  const cloneSharedDesign = useCallback(async (config, name, apply = false) => {
    setDesignBusy(true);
    try {
      const response = await socialPageAPI.cloneShared(config._id, { name, apply });
      if (response.data?.config) {
        setSocialConfigs((prev) => [response.data.config, ...prev]);
      }
      await loadDesignData();
      if (apply && response.data?.config?._id) {
        await applySavedConfig(response.data.config._id);
      }
      setDesignSuccessMessage(apply ? 'Shared design cloned and applied' : 'Shared design cloned');
    } catch (error) {
      setDesignError(error.response?.data?.error || 'Failed to clone shared design.');
    } finally {
      setDesignBusy(false);
    }
  }, [applySavedConfig, loadDesignData]);

  const handleCommentInputChange = (postId, value) => {
    setCommentInputs((prev) => ({ ...prev, [postId]: value }));

    if (!isAuthenticated || !realtimeEnabled || !currentUser?._id) {
      return;
    }

    subscribeToPost(postId);

    if (!value.trim()) {
      emitTypingStop({ scope: 'comment', targetId: postId });
      if (localTypingTimeoutsRef.current[postId]) {
        window.clearTimeout(localTypingTimeoutsRef.current[postId]);
        delete localTypingTimeoutsRef.current[postId];
      }
      return;
    }

    emitTypingStart({ scope: 'comment', targetId: postId });

    if (localTypingTimeoutsRef.current[postId]) {
      window.clearTimeout(localTypingTimeoutsRef.current[postId]);
    }

    localTypingTimeoutsRef.current[postId] = window.setTimeout(() => {
      emitTypingStop({ scope: 'comment', targetId: postId });
      delete localTypingTimeoutsRef.current[postId];
    }, TYPING_TIMEOUT_MS);
  };

  const appendMediaUrl = useCallback((rawValue) => {
    const value = String(rawValue || '').trim();
    if (!value) return true;
    if (!isRenderableMediaUrl(value)) {
      setFeedError('Media URL must be a valid http/https URL.');
      return false;
    }
    if (value.length > MEDIA_URL_MAX_LENGTH) {
      setFeedError(`Media URL exceeds max length (${MEDIA_URL_MAX_LENGTH}).`);
      return false;
    }
    if (postForm.mediaUrls.length >= MEDIA_URL_MAX_ITEMS) {
      setFeedError(`You can attach up to ${MEDIA_URL_MAX_ITEMS} media URLs per post.`);
      setPostForm((prev) => ({ ...prev, mediaUrlInput: '' }));
      return false;
    }
    if (postForm.mediaUrls.includes(value)) {
      setPostForm((prev) => ({ ...prev, mediaUrlInput: '' }));
      return true;
    }

    setPostForm((prev) => ({
      ...prev,
      mediaUrls: [...prev.mediaUrls, value],
      mediaUrlInput: '',
    }));
    setFeedError('');
    return true;
  }, [postForm.mediaUrls]);

  const handleAddMediaUrl = () => {
    appendMediaUrl(postForm.mediaUrlInput);
  };

  const handleComposerImageUpload = async (event) => {
    if (!currentUser?._id) return;
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    const remainingSlots = MEDIA_URL_MAX_ITEMS - postForm.mediaUrls.length;
    const maxFiles = Math.min(6, remainingSlots);
    if (maxFiles <= 0) {
      setFeedError(`You can attach up to ${MEDIA_URL_MAX_ITEMS} media items per post.`);
      return;
    }
    const filesToUpload = files.slice(0, maxFiles);
    for (const file of filesToUpload) {
      if (!file.type.startsWith('image/')) {
        setFeedError('Only image files are supported.');
        return;
      }
      if (file.size > GALLERY_MAX_IMAGE_SIZE_BYTES) {
        setFeedError('Image file is too large (max 3MB each).');
        return;
      }
    }
    setComposerImageUploading(true);
    setFeedError('');
    try {
      const audience = postForm.relationshipAudience || 'secure';
      for (const file of filesToUpload) {
        const response = await galleryAPI.uploadGalleryItem(currentUser._id, file, '', audience);
        const uploadedUrl = response.data?.item?.mediaUrl;
        if (!appendMediaUrl(uploadedUrl)) {
          setFeedError('Image uploaded but could not be attached to post.');
        }
      }
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to upload image.');
    } finally {
      setComposerImageUploading(false);
    }
  };

  const handleRemoveMediaUrl = (index) => {
    setPostForm((prev) => ({
      ...prev,
      mediaUrls: prev.mediaUrls.filter((_, i) => i !== index),
    }));
  };

  const updateInteractionField = (type, field, value) => {
    setPostForm((prev) => ({
      ...prev,
      interaction: {
        ...prev.interaction,
        [type]: {
          ...prev.interaction[type],
          [field]: value,
        },
      },
    }));
  };

  const updateInteractionOption = (type, index, value) => {
    setPostForm((prev) => {
      const existingOptions = prev.interaction[type].options || [];
      const nextOptions = existingOptions.map((entry, i) => (i === index ? value : entry));
      return {
        ...prev,
        interaction: {
          ...prev.interaction,
          [type]: {
            ...prev.interaction[type],
            options: nextOptions,
          },
        },
      };
    });
  };

  const addInteractionOption = (type) => {
    setPostForm((prev) => {
      const existingOptions = prev.interaction[type].options || [];
      if (existingOptions.length >= INTERACTION_MAX_OPTIONS) {
        return prev;
      }
      return {
        ...prev,
        interaction: {
          ...prev.interaction,
          [type]: {
            ...prev.interaction[type],
            options: [...existingOptions, ''],
          },
        },
      };
    });
  };

  const removeInteractionOption = (type, index) => {
    setPostForm((prev) => {
      const existingOptions = prev.interaction[type].options || [];
      if (existingOptions.length <= 2) {
        return prev;
      }
      return {
        ...prev,
        interaction: {
          ...prev.interaction,
          [type]: {
            ...prev.interaction[type],
            options: existingOptions.filter((_, i) => i !== index),
          },
        },
      };
    });
  };

  const handlePostFormField = (field, value) => {
    setPostForm((prev) => {
      if (field === 'relationshipAudience') {
        const relationshipAudience = value === 'secure'
          ? 'secure'
          : (value === 'public' ? 'public' : 'social');
        return {
          ...prev,
          relationshipAudience,
          visibility: relationshipAudience === 'public' ? 'public' : 'friends',
        };
      }
      if (field === 'visibility') {
        let relationshipAudience = prev.relationshipAudience;
        if (value === 'public') {
          relationshipAudience = 'public';
        } else if (value === 'friends' && prev.relationshipAudience === 'public') {
          relationshipAudience = 'social';
        }
        return {
          ...prev,
          visibility: value,
          relationshipAudience,
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const applyComposerSnippet = (snippet) => {
    const mode = postForm.editorMode || 'design';
    const targetRef = mode === 'code' ? composerCodeTextareaRef.current : composerDesignTextareaRef.current;
    const key = mode === 'code' ? 'codeContent' : 'content';
    const currentValue = postForm[key] || '';
    const start = targetRef?.selectionStart ?? currentValue.length;
    const end = targetRef?.selectionEnd ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, start)}${snippet}${currentValue.slice(end)}`;
    setPostForm((prev) => ({ ...prev, [key]: nextValue }));
    window.setTimeout(() => {
      if (!targetRef) return;
      const cursor = start + snippet.length;
      targetRef.focus();
      targetRef.selectionStart = cursor;
      targetRef.selectionEnd = cursor;
    }, 0);
  };

  const applyDesignWrapper = (prefix, suffix = prefix, placeholder = 'text') => {
    const targetRef = composerDesignTextareaRef.current;
    const currentValue = postForm.content || '';
    const start = targetRef?.selectionStart ?? currentValue.length;
    const end = targetRef?.selectionEnd ?? currentValue.length;
    const selectedText = currentValue.slice(start, end) || placeholder;
    const wrapped = `${prefix}${selectedText}${suffix}`;
    const nextValue = `${currentValue.slice(0, start)}${wrapped}${currentValue.slice(end)}`;
    setPostForm((prev) => ({ ...prev, content: nextValue }));
    window.setTimeout(() => {
      if (!targetRef) return;
      targetRef.focus();
      targetRef.selectionStart = start + prefix.length;
      targetRef.selectionEnd = start + prefix.length + selectedText.length;
    }, 0);
  };

  const handleCopyMdSyntax = (syntax) => {
    navigator.clipboard?.writeText(syntax).then(() => {
      setCopiedMd(syntax);
      window.setTimeout(() => setCopiedMd(''), 1500);
    }).catch(() => {});
  };

  const refreshCircles = async () => {
    try {
      const response = await circlesAPI.getCircles();
      setCircles(Array.isArray(response.data?.circles) ? response.data.circles : []);
    } catch {
      setCircles([]);
    }
  };

  const handleCreateCircle = async (payload) => {
    try {
      await circlesAPI.createCircle(payload);
      await refreshCircles();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to create circle.');
    }
  };

  const handleDeleteCircle = async (circleName) => {
    try {
      await circlesAPI.deleteCircle(circleName);
      await refreshCircles();
      setPostForm((prev) => ({
        ...prev,
        visibleToCircles: prev.visibleToCircles.filter((entry) => entry !== circleName)
      }));
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to delete circle.');
    }
  };

  const handleUpdateCircle = async (circleName, payload) => {
    try {
      await circlesAPI.updateCircle(circleName, payload);
      await refreshCircles();
      if (payload?.name && payload.name !== circleName) {
        setPostForm((prev) => ({
          ...prev,
          visibleToCircles: prev.visibleToCircles.map((entry) => (entry === circleName ? payload.name : entry))
        }));
      }
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to update circle.');
    }
  };

  const handleAddCircleMember = async (circleName, userId) => {
    try {
      await circlesAPI.addMember(circleName, userId);
      await refreshCircles();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to add circle member.');
    }
  };

  const handleRemoveCircleMember = async (circleName, userId) => {
    try {
      await circlesAPI.removeMember(circleName, userId);
      await refreshCircles();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to remove circle member.');
    }
  };

  const handleMoveCircleMember = async (fromCircle, toCircle, userId) => {
    try {
      await circlesAPI.addMember(toCircle, userId);
      await circlesAPI.removeMember(fromCircle, userId);
      await refreshCircles();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to move circle member.');
    }
  };

  const refreshModerationState = async () => {
    const [blocksResponse, mutesResponse, reportsResponse] = await Promise.all([
      moderationAPI.getBlocks().catch(() => ({ data: { blockedUsers: [] } })),
      moderationAPI.getMutes().catch(() => ({ data: { mutedUsers: [] } })),
      moderationAPI.getMyReports().catch(() => ({ data: { reports: [] } }))
    ]);

    setBlockedUserIds((blocksResponse.data?.blockedUsers || []).map((entry) => String(entry._id)));
    setMutedUserIds((mutesResponse.data?.mutedUsers || []).map((entry) => String(entry._id)));
    setMyReports(Array.isArray(reportsResponse.data?.reports) ? reportsResponse.data.reports : []);
  };

  const handleBlockUser = async (userId, reason = '') => {
    try {
      await moderationAPI.blockUser(userId, reason);
      await refreshModerationState();
      await loadFeed();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to block user.');
    }
  };

  const handleUnblockUser = async (userId) => {
    try {
      await moderationAPI.unblockUser(userId);
      await refreshModerationState();
      await loadFeed();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to unblock user.');
    }
  };

  const handleToggleMuteUser = async (userId) => {
    try {
      if (mutedUserIds.includes(String(userId))) {
        await moderationAPI.unmuteUser(userId);
      } else {
        await moderationAPI.muteUser(userId);
      }
      await refreshModerationState();
      await loadFeed();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to update mute state.');
    }
  };

  const openReportModal = (targetType, targetId, targetUserId) => {
    setReportModalState({
      isOpen: true,
      targetType,
      targetId,
      targetUserId
    });
  };

  const closeReportModal = () => {
    setReportModalState({
      isOpen: false,
      targetType: 'post',
      targetId: null,
      targetUserId: null
    });
  };

  const submitReport = async (payload) => {
    try {
      await moderationAPI.report(payload);
      await refreshModerationState();
      closeReportModal();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to submit report.');
    }
  };

  const handleSubmitPost = async (event) => {
    event.preventDefault();
    if (!currentUser?._id) return;

    const editorMode = postForm.editorMode === 'code' ? 'code' : 'design';
    const content = (editorMode === 'code' ? postForm.codeContent : postForm.content).trim();
    const contentType = postForm.contentType;
    const hasStandardContent = content || postForm.mediaUrls.length > 0;
    let interactionPayload = null;

    if (contentType === 'standard' && !hasStandardContent) {
      setFeedError('Add post content or at least one image/link before publishing.');
      return;
    }
    if ((postForm.relationshipAudience || 'social') === 'secure' && postForm.visibility !== 'friends') {
      setFeedError('Secure audience currently supports only Friends visibility.');
      return;
    }
    if (postForm.relationshipAudience === 'public' && postForm.visibility !== 'public') {
      setFeedError('Public audience currently supports only Public visibility.');
      return;
    }
    if (postForm.visibility === 'public' && postForm.relationshipAudience !== 'public') {
      setFeedError('Public visibility currently supports only Public audience.');
      return;
    }

    if (contentType === 'poll') {
      const poll = postForm.interaction.poll;
      const options = (poll.options || []).map((option) => option.trim()).filter(Boolean);
      if (!poll.question.trim()) {
        setFeedError('Poll question is required.');
        return;
      }
      if (options.length < 2) {
        setFeedError('Poll needs at least two options.');
        return;
      }
      if (!poll.expiresAt) {
        setFeedError('Poll expiration is required.');
        return;
      }
      interactionPayload = {
        type: 'poll',
        question: poll.question.trim(),
        options,
        allowMultiple: Boolean(poll.allowMultiple),
        expiresAt: poll.expiresAt,
      };
    } else if (contentType === 'quiz') {
      const quiz = postForm.interaction.quiz;
      const options = (quiz.options || []).map((option) => option.trim()).filter(Boolean);
      const correctOptionIndex = Number(quiz.correctOptionIndex);
      if (!quiz.question.trim()) {
        setFeedError('Quiz question is required.');
        return;
      }
      if (options.length < 2) {
        setFeedError('Quiz needs at least two options.');
        return;
      }
      if (!Number.isInteger(correctOptionIndex) || correctOptionIndex < 0 || correctOptionIndex >= options.length) {
        setFeedError('Quiz correct option must match an existing option.');
        return;
      }
      if (!quiz.expiresAt) {
        setFeedError('Quiz expiration is required.');
        return;
      }
      interactionPayload = {
        type: 'quiz',
        question: quiz.question.trim(),
        options,
        correctOptionIndex,
        explanation: quiz.explanation.trim(),
        expiresAt: quiz.expiresAt,
      };
    } else if (contentType === 'countdown') {
      const countdown = postForm.interaction.countdown;
      if (!countdown.label.trim()) {
        setFeedError('Countdown label is required.');
        return;
      }
      if (!countdown.targetAt) {
        setFeedError('Countdown target time is required.');
        return;
      }
      if (!countdown.timezone.trim()) {
        setFeedError('Countdown timezone is required.');
        return;
      }
      interactionPayload = {
        type: 'countdown',
        label: countdown.label.trim(),
        targetAt: countdown.targetAt,
        timezone: countdown.timezone.trim(),
        linkUrl: countdown.linkUrl.trim(),
      };
    }

    setSubmittingPost(true);
    setFeedError('');
    try {
      let expiresAt = null;
      if (postForm.expirationPreset === '24h') {
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      } else if (postForm.expirationPreset === '7d') {
        expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (postForm.expirationPreset === '30d') {
        expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      const response = await feedAPI.createPost({
        content,
        mediaUrls: postForm.mediaUrls,
        visibility: postForm.visibility,
        relationshipAudience: postForm.relationshipAudience,
        visibleToCircles: postForm.visibleToCircles,
        visibleToUsers: postForm.visibleToUsers,
        excludeUsers: postForm.excludeUsers,
        locationRadius: postForm.locationRadius ? Number(postForm.locationRadius) : null,
        expiresAt,
        targetFeedId: currentUser._id,
        interaction: interactionPayload,
      });

      const created = response.data?.post ? normalizePost(response.data.post) : null;
      if (created) {
        let createdPost = created;
        if (created.interaction?.type) {
          try {
            const interactionResponse = await feedAPI.getInteraction(created._id);
            createdPost = {
              ...created,
              interaction: interactionResponse.data?.interaction || created.interaction,
            };
          } catch {
            createdPost = created;
          }
        }
        setPosts((prev) => [createdPost, ...prev]);
      } else {
        await loadAuthenticatedFeed();
      }

      setPostForm({
        content: '',
        codeContent: '',
        editorMode: 'design',
        mediaUrlInput: '',
        mediaUrls: [],
        visibility: 'friends',
        relationshipAudience: 'secure',
        visibleToCircles: [],
        visibleToUsers: [],
        excludeUsers: [],
        locationRadius: '',
        expirationPreset: 'none',
        contentType: 'standard',
        interaction: {
          poll: {
            question: '',
            options: ['', ''],
            allowMultiple: false,
            expiresAt: '',
          },
          quiz: {
            question: '',
            options: ['', ''],
            correctOptionIndex: 0,
            explanation: '',
            expiresAt: '',
          },
          countdown: {
            label: '',
            targetAt: '',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            linkUrl: '',
          },
        },
        imageDescriptions: {},
        imageAudienceOverrides: {},
      });
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to publish post.');
    } finally {
      setSubmittingPost(false);
    }
  };

  const handleToggleLike = async (post) => {
    if (!currentUser?._id) return;
    const postId = post._id;
    const hasLiked = post.likes.includes(currentUser._id);

    setPostActionLoading(postId, true);
    try {
      if (hasLiked) {
        await feedAPI.unlikePost(postId);
      } else {
        await feedAPI.likePost(postId);
      }

      setPosts((prev) =>
        prev.map((item) => {
          if (item._id !== postId) return item;

          const nextLikes = hasLiked
            ? item.likes.filter((id) => id !== currentUser._id)
            : Array.from(new Set([...item.likes, currentUser._id]));

          return {
            ...item,
            likes: nextLikes,
            likesCount: nextLikes.length,
          };
        })
      );
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to update like.');
    } finally {
      setPostActionLoading(postId, false);
    }
  };

  const handleAddComment = async (postId) => {
    if (!currentUser?._id) return;
    const content = (commentInputs[postId] || '').trim();
    if (!content) return;

    setPostActionLoading(postId, true);
    try {
      const response = await feedAPI.addComment(postId, content);
      const addedComment = response.data?.comment;

      setPosts((prev) =>
        prev.map((item) => {
          if (item._id !== postId) return item;

          const nextComments = addedComment
            ? [
                ...item.comments,
                {
                  ...addedComment,
                  userId: String(addedComment.userId || currentUser._id),
                  username: currentUser.username,
                },
              ]
            : item.comments;

          return {
            ...item,
            comments: nextComments,
            commentsCount: nextComments.length,
          };
        })
      );

      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
      emitTypingStop({ scope: 'comment', targetId: postId });
      if (localTypingTimeoutsRef.current[postId]) {
        window.clearTimeout(localTypingTimeoutsRef.current[postId]);
        delete localTypingTimeoutsRef.current[postId];
      }
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to add comment.');
    } finally {
      setPostActionLoading(postId, false);
    }
  };

  const applyInteractionState = (postId, interactionState) => {
    if (!interactionState) return;
    setPosts((prev) =>
      prev.map((item) => (item._id === postId ? { ...item, interaction: interactionState } : item))
    );
  };

  const handleVotePoll = async (postId, optionIndex) => {
    if (!currentUser?._id || isGuestPreview) return;
    setPostActionLoading(postId, true);
    try {
      const response = await feedAPI.votePoll(postId, [optionIndex]);
      applyInteractionState(postId, response.data?.interaction || null);
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to submit poll vote.');
      if (error.response?.status === 409) {
        const interactionResponse = await feedAPI.getInteraction(postId);
        applyInteractionState(postId, interactionResponse.data?.interaction || null);
      }
    } finally {
      setPostActionLoading(postId, false);
    }
  };

  const handleSubmitQuizAnswer = async (postId, optionIndex) => {
    if (!currentUser?._id || isGuestPreview) return;
    setPostActionLoading(postId, true);
    try {
      const response = await feedAPI.submitQuizAnswer(postId, optionIndex);
      applyInteractionState(postId, response.data?.interaction || null);
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to submit quiz answer.');
      if (error.response?.status === 409) {
        const interactionResponse = await feedAPI.getInteraction(postId);
        applyInteractionState(postId, interactionResponse.data?.interaction || null);
      }
    } finally {
      setPostActionLoading(postId, false);
    }
  };

  const handleFollowCountdown = async (postId) => {
    if (!currentUser?._id || isGuestPreview) return;
    setPostActionLoading(postId, true);
    try {
      const response = await feedAPI.followCountdown(postId);
      applyInteractionState(postId, response.data?.interaction || null);
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to follow countdown.');
      if (error.response?.status === 409) {
        const interactionResponse = await feedAPI.getInteraction(postId);
        applyInteractionState(postId, interactionResponse.data?.interaction || null);
      }
    } finally {
      setPostActionLoading(postId, false);
    }
  };

  const handleDeletePost = async (postId) => {
    if (!postId || !window.confirm('Are you sure you want to delete this?')) return;
    setPostActionLoading(postId, true);
    setFeedError('');
    try {
      await feedAPI.deletePost(postId);
      setPosts((prev) => prev.filter((post) => post._id !== postId));
      setCommentInputs((prev) => {
        const next = { ...prev };
        delete next[postId];
        return next;
      });
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to delete post.');
    } finally {
      setPostActionLoading(postId, false);
    }
  };

  const handleDeleteCalendarEvent = async (eventId) => {
    if (!eventId || !window.confirm('Are you sure you want to delete this?')) return;
    setCalendarPreviewError('');
    try {
      await calendarAPI.deleteEvent(eventId);
      setCalendarPreviewEvents((prev) => prev.filter((event) => String(event?._id || '') !== String(eventId)));
    } catch (error) {
      setCalendarPreviewError(error.response?.data?.error || 'Failed to delete event.');
    }
  };

  const handleStartEditGalleryItem = (item) => {
    setGalleryEditById((prev) => ({
      ...prev,
      [item._id]: {
        mediaUrl: item.mediaType === 'url' ? item.mediaUrl || '' : '',
        title: item.title || '',
        caption: item.caption || '',
      },
    }));
  };

  const handleCancelEditGalleryItem = (imageId) => {
    setGalleryEditById((prev) => {
      const next = { ...prev };
      delete next[imageId];
      return next;
    });
  };

  const handleEditGalleryField = (imageId, field, value) => {
    setGalleryEditById((prev) => ({
      ...prev,
      [imageId]: {
        mediaUrl: prev[imageId]?.mediaUrl || '',
        title: prev[imageId]?.title || '',
        caption: prev[imageId]?.caption || '',
        [field]: value,
      },
    }));
  };

  const handleSaveGalleryItem = async (item) => {
    if (!canManageGallery || !galleryOwnerIdentifier) return;

    const editState = galleryEditById[item._id];
    if (!editState) return;

    setGalleryActionLoading(item._id, true);
    setGalleryError('');
    try {
      const payload = {
        title: editState.title || '',
        caption: editState.caption || ''
      };
      if (item.mediaType === 'url') {
        payload.mediaUrl = editState.mediaUrl || '';
      }

      const response = await galleryAPI.updateGalleryItem(galleryOwnerIdentifier, item._id, payload);
      const updated = response.data?.item ? normalizeGalleryItem(response.data.item) : null;

      if (updated) {
        setGalleryItems((prev) => prev.map((image) => (image._id === item._id ? updated : image)));
      } else {
        await loadGallery();
      }

      handleCancelEditGalleryItem(item._id);
    } catch (error) {
      setGalleryError(error.response?.data?.error || 'Failed to update gallery image.');
    } finally {
      setGalleryActionLoading(item._id, false);
    }
  };

  const handleRemoveGalleryImage = async (imageId) => {
    if (!canManageGallery || !galleryOwnerIdentifier) return;
    if (!window.confirm('Are you sure you want to delete this image?')) return;

    setGalleryActionLoading(imageId, true);
    setGalleryError('');
    try {
      await galleryAPI.deleteGalleryItem(galleryOwnerIdentifier, imageId);
      setGalleryItems((prev) => prev.filter((item) => item._id !== imageId));
      if (activeGalleryImageId === imageId) {
        setActiveGalleryImageId(null);
      }
      handleCancelEditGalleryItem(imageId);
    } catch (error) {
      setGalleryError(error.response?.data?.error || 'Failed to remove gallery image.');
    } finally {
      setGalleryActionLoading(imageId, false);
    }
  };

  const handleGalleryReaction = async (imageId, reactionType) => {
    if (!viewerCanReact || !galleryOwnerIdentifier) return;

    setGalleryActionLoading(imageId, true);
    setGalleryError('');
    try {
      const response = await galleryAPI.reactToGalleryImage(galleryOwnerIdentifier, imageId, reactionType);
      const viewerReaction = response.data?.reaction || null;
      const likesCount = typeof response.data?.likesCount === 'number' ? response.data.likesCount : 0;
      const dislikesCount = typeof response.data?.dislikesCount === 'number' ? response.data.dislikesCount : 0;

      setGalleryItems((prev) =>
        prev.map((item) =>
          item._id === imageId
            ? {
                ...item,
                viewerReaction,
                likesCount,
                dislikesCount,
              }
            : item
        )
      );
    } catch (error) {
      setGalleryError(error.response?.data?.error || 'Failed to update gallery reaction.');
    } finally {
      setGalleryActionLoading(imageId, false);
    }
  };
  const handleOpenGalleryImage = (imageId) => {
    setActiveGalleryImageId(imageId);
  };
  const handleCloseGalleryImage = () => {
    setActiveGalleryImageId(null);
  };
  const handleGalleryCommentInputChange = (imageId, value) => {
    setGalleryCommentInputs((prev) => ({
      ...prev,
      [imageId]: value
    }));
  };
  const handleGalleryCommentSubmit = async (imageId) => {
    if (!viewerCanReact || !galleryOwnerIdentifier) return;
    const content = (galleryCommentInputs[imageId] || '').trim();
    if (!content) return;

    setGalleryCommentSubmittingByImage((prev) => ({ ...prev, [imageId]: true }));
    setGalleryError('');
    try {
      const response = await galleryAPI.addGalleryComment(galleryOwnerIdentifier, imageId, content);
      const comment = response.data?.comment || null;
      const commentsCount = typeof response.data?.commentsCount === 'number' ? response.data.commentsCount : null;

      setGalleryItems((prev) => prev.map((item) => {
        if (item._id !== imageId) return item;
        const nextComments = comment ? [...(item.comments || []), comment] : (item.comments || []);
        return {
          ...item,
          comments: nextComments,
          commentsCount: commentsCount !== null ? commentsCount : nextComments.length
        };
      }));
      setGalleryCommentInputs((prev) => ({ ...prev, [imageId]: '' }));
    } catch (error) {
      setGalleryError(error.response?.data?.error || 'Failed to add gallery comment.');
    } finally {
      setGalleryCommentSubmittingByImage((prev) => ({ ...prev, [imageId]: false }));
    }
  };

  const ownerEditingEnabled = isOwnSocialContext && !isGuestPreview;

  const GALLERY_UPLOAD_MAX_FILES = 6;

  const galleryUploadMaxSlots = Math.min(GALLERY_UPLOAD_MAX_FILES, GALLERY_MAX_ITEMS - galleryItems.length);

  const reindexAfterRemoval = (map, removedIndex) => {
    const next = {};
    Object.keys(map).forEach((k) => {
      const ki = Number(k);
      if (ki < removedIndex) next[ki] = map[ki];
      else if (ki > removedIndex) next[ki - 1] = map[ki];
    });
    return next;
  };

  const handleGalleryUploadOpen = () => {
    setGalleryUploadPreviews([]);
    setGalleryUploadDescriptions({});
    setGalleryUploadAudienceOverrides({});
    setGalleryUploadDefaultAudience('social');
    setGalleryUploading(false);
    setShowGalleryUploadModal(true);
  };

  const handleGalleryUploadClose = () => {
    galleryUploadPreviews.forEach((p) => { if (p.objectUrl) URL.revokeObjectURL(p.objectUrl); });
    setShowGalleryUploadModal(false);
    setGalleryUploadPreviews([]);
    setGalleryUploadDescriptions({});
    setGalleryUploadAudienceOverrides({});
    setGalleryUploading(false);
  };

  const handleGalleryUploadFileSelect = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    const remainingSlots = galleryUploadMaxSlots - galleryUploadPreviews.length;
    if (remainingSlots <= 0) return;
    const accepted = [];
    for (const file of files.slice(0, remainingSlots)) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > GALLERY_MAX_IMAGE_SIZE_BYTES) continue;
      accepted.push({ file, objectUrl: URL.createObjectURL(file) });
    }
    if (accepted.length > 0) {
      setGalleryUploadPreviews((prev) => [...prev, ...accepted]);
    }
  };

  const handleGalleryUploadRemoveFile = (index) => {
    setGalleryUploadPreviews((prev) => {
      const item = prev[index];
      if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
      return prev.filter((_, i) => i !== index);
    });
    setGalleryUploadDescriptions((prev) => reindexAfterRemoval(prev, index));
    setGalleryUploadAudienceOverrides((prev) => reindexAfterRemoval(prev, index));
  };

  const handleGalleryUploadSubmit = async () => {
    if (!currentUser?._id || galleryUploadPreviews.length === 0) return;
    setGalleryUploading(true);
    setGalleryError('');
    const uploaded = [];
    try {
      for (let i = 0; i < galleryUploadPreviews.length; i++) {
        const { file } = galleryUploadPreviews[i];
        const caption = (galleryUploadDescriptions[i] || '').trim();
        const audience = galleryUploadAudienceOverrides[i] || galleryUploadDefaultAudience;
        const response = await galleryAPI.uploadGalleryItem(currentUser._id, file, caption, audience);
        const created = response.data?.item ? normalizeGalleryItem(response.data.item) : null;
        if (created) uploaded.push(created);
      }
      if (uploaded.length > 0) {
        setGalleryItems((prev) => [...uploaded, ...prev]);
      }
      handleGalleryUploadClose();
    } catch (error) {
      setGalleryError(error.response?.data?.error || 'Failed to upload gallery images.');
    } finally {
      setGalleryUploading(false);
    }
  };

  const renderPanelBody = (panelId) => {
    switch (panelId) {
      case 'profile_header':
        return (
          <div className={`rounded-2xl bg-gradient-to-r ${headerGradientClass} p-4 text-white shadow-sm`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Social</h2>
                {isViewingAnotherProfile ? <p className={`${getFontSizeClass(socialPreferences.globalStyles.fontSizes?.small)} text-white/90`}>Viewing @${requestedProfileIdentifier}</p> : null}
              </div>
              {isOwnSocialContext ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleGuestPreviewToggle(!isGuestPreview)}
                    className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
                  >
                    {isGuestPreview ? 'Exit guest preview' : 'View as guest'}
                  </button>
                  {!isGuestPreview ? (
                    <button
                      type="button"
                      onClick={() => setDesignStudioOpen(true)}
                      className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                    >
                      Design studio
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      case 'guest_preview_notice':
        return isOwnSocialContext ? (
          <div className={`rounded-xl border px-4 py-4 ${isGuestPreview ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            <p className="font-semibold">{isGuestPreview ? 'Guest preview is on' : 'Owner view is active'}</p>
            <p className="mt-1 text-sm">
              {isGuestPreview
                ? 'Your visitors do not see edit controls, inline panel tools, or the global design studio.'
                : 'Use the floating edit button or any panel edit icon to customize the page in place.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            Guest viewers always see a clean, read-only version of the social page.
          </div>
        );
      case 'shortcuts':
        return (
          <ul className="space-y-2 text-sm">
            <li><Link to={socialProfilePath} className="block rounded-xl bg-blue-50 px-3 py-2 font-medium text-blue-700">Social Stream</Link></li>
            {isModuleVisible('marketplaceShortcut') ? <li><Link to="/market" className="block rounded-xl px-3 py-2 hover:bg-slate-50">Marketplace</Link></li> : null}
            {isModuleVisible('calendarShortcut') ? <li><Link to={socialCalendarPath} className="block rounded-xl px-3 py-2 hover:bg-slate-50">Calendar</Link></li> : null}
            {isModuleVisible('settingsShortcut') ? <li><Link to="/settings" className="block rounded-xl px-3 py-2 hover:bg-slate-50">User Settings</Link></li> : null}
            {isModuleVisible('referShortcut') ? <li><Link to="/refer" className="block rounded-xl px-3 py-2 hover:bg-slate-50">Refer Friend</Link></li> : null}
          </ul>
        );
      case 'snapshot':
        return (
          <div className="space-y-3 text-sm">
            <p>Active profile: <span className="font-semibold">{activeProfile?.username ? `@${activeProfile.username}` : 'Guest'}</span></p>
            <p>Loaded posts: <span className="font-semibold">{posts.length}</span></p>
            <p>Friends loaded: <span className="font-semibold">{friends.length}</span></p>
            <p>Top friends: <span className="font-semibold">{topFriends.length}</span></p>
            {visibleResumeInfo ? (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Resume</p>
                {visibleResumeInfo.resumeHeadline ? <p className="mt-1 text-sm text-blue-900">{visibleResumeInfo.resumeHeadline}</p> : null}
                <Link to={visibleResumeInfo.resumeUrl} onClick={() => handleResumeProfileLinkClick(visibleResumeInfo.username)} className="mt-2 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-800">View hosted resume</Link>
              </div>
            ) : null}
            {!isOwnSocialContext && isAuthenticated && sharedDesigns.length > 0 ? (
              <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Shared design</p>
                <p className="mt-1 text-sm text-violet-900">Favorite or clone @{requestedProfileIdentifier}'s shared social page design.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => toggleFavoriteSharedDesign(sharedDesigns[0])} className="rounded-lg border border-violet-200 px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-white">{sharedDesigns[0]?.isFavorite ? 'Unfavorite' : 'Favorite'}</button>
                  <button type="button" onClick={() => cloneSharedDesign(sharedDesigns[0], `${sharedDesigns[0]?.name || 'Shared design'} Clone`, false)} className="rounded-lg border border-violet-200 px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-white">Clone</button>
                </div>
              </div>
            ) : null}
          </div>
        );
      case 'guest_lookup':
        return !isAuthenticated ? (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--social-text-secondary)' }}>Enter a username or user ID to load a public feed.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input type="text" value={guestUser} onChange={(event) => setGuestUser(event.target.value)} placeholder="username or user ID" className="flex-1 rounded-xl border px-3 py-2" style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 25%, transparent)', background: 'var(--social-surface-soft)', color: 'var(--social-text-primary)' }} />
              <button type="button" onClick={loadFeed} className="rounded-xl px-4 py-2 text-white" style={{ background: 'var(--accent)' }} disabled={loadingFeed}>{loadingFeed ? 'Loading…' : 'Load profile'}</button>
            </div>
            {guestProfile ? (
              <div className="text-sm" style={{ color: 'var(--social-text-secondary)' }}>
                Viewing public posts for <span className="font-semibold">@{guestProfile.username}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm" style={{ color: 'var(--social-text-muted)' }}>Guest lookup is hidden for signed-in owners and guest profile viewers.</div>
        );
      case 'composer':
        return isOwnSocialContext && !isGuestPreview ? (
          <form onSubmit={handleSubmitPost} className="overflow-hidden rounded-2xl border shadow-md" style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)' }}>
            {/* ── Header row: Post type + audience toggle + editor mode tabs ── */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid color-mix(in srgb, var(--social-text-muted) 15%, transparent)', background: 'var(--social-surface-muted)' }}>
              {/* Post Type dropdown */}
              <div className="relative">
                <select
                  data-testid="composer-post-type"
                  value={postForm.contentType}
                  onChange={(event) => setPostForm((prev) => ({ ...prev, contentType: event.target.value }))}
                  className="appearance-none rounded-xl py-1.5 pl-3 pr-8 text-xs font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2"
                  style={{ background: 'var(--bg-panel)', color: 'var(--social-text-primary)', borderColor: 'color-mix(in srgb, var(--social-text-muted) 25%, transparent)', border: '1px solid', '--tw-ring-color': 'var(--accent)' }}
                >
                  {COMPOSER_CONTENT_TYPES.map((option) => <option key={option} value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--social-text-muted)' }} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
              </div>

              {/* Social / Secure / Public toggle */}
              <div className="flex rounded-xl p-0.5 shadow-sm" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 25%, transparent)', background: 'var(--bg-panel)' }}>
                <button
                  type="button"
                  data-testid="composer-audience-social"
                  onClick={() => handlePostFormField('relationshipAudience', 'social')}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${postForm.relationshipAudience === 'social' ? 'text-white shadow-sm' : 'hover:opacity-80'}`}
                  style={postForm.relationshipAudience === 'social' ? { backgroundColor: '#0284c7', color: '#fff' } : { color: 'var(--social-text-muted)' }}
                >
                  Social
                </button>
                <button
                  type="button"
                  data-testid="composer-audience-secure"
                  onClick={() => handlePostFormField('relationshipAudience', 'secure')}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${postForm.relationshipAudience === 'secure' ? 'text-white shadow-sm' : 'hover:opacity-80'}`}
                  style={postForm.relationshipAudience === 'secure' ? { backgroundColor: '#d97706', color: '#fff' } : { color: 'var(--social-text-muted)' }}
                >
                  Secure
                </button>
                <button
                  type="button"
                  data-testid="composer-audience-public"
                  onClick={() => handlePostFormField('relationshipAudience', 'public')}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${postForm.relationshipAudience === 'public' ? 'text-white shadow-sm' : 'hover:opacity-80'}`}
                  style={postForm.relationshipAudience === 'public' ? { backgroundColor: '#16a34a', color: '#fff' } : { color: 'var(--social-text-muted)' }}
                >
                  Public
                </button>
              </div>

              {/* Editor mode tabs */}
              <div className="ml-auto flex rounded-xl p-0.5 shadow-sm" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 25%, transparent)', background: 'var(--bg-panel)' }}>
                {COMPOSER_EDITOR_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handlePostFormField('editorMode', mode)}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${postForm.editorMode === mode ? 'shadow-sm' : ''}`}
                    style={postForm.editorMode === mode ? { backgroundColor: 'var(--accent)', color: '#fff' } : { color: 'var(--social-text-muted)' }}
                  >
                    {mode === 'design' ? '✦ Design' : '</> Code'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-0">
              {/* ── Code Mode: quick action toolbar ── */}
              {postForm.editorMode === 'code' ? (
                <div className="px-3 py-2" style={{ borderBottom: '1px solid color-mix(in srgb, var(--social-text-muted) 12%, transparent)', background: 'var(--social-surface-soft)' }}>
                  <div className="flex flex-wrap items-center gap-1">
                    {CODE_MODE_SNIPPETS.map((snippet) => (
                      <button
                        key={snippet.label}
                        type="button"
                        title={snippet.requiresSelection ? `${snippet.description} — highlight text first` : snippet.description}
                        onClick={() => applyComposerSnippet(snippet.value)}
                        className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md px-1.5 text-[11px] font-semibold transition-colors"
                        style={snippet.requiresSelection ? { border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)' } : { border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-secondary)' }}
                      >
                        {snippet.icon}
                      </button>
                    ))}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setComposerMdGuideOpen((v) => !v)}
                        title="Toggle Markdown reference guide"
                        className="hidden rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors lg:inline-flex"
                        style={composerMdGuideOpen ? { backgroundColor: 'var(--accent)', color: '#fff' } : { border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', color: 'var(--social-text-muted)' }}
                      >
                        {composerMdGuideOpen ? '✕ Hide Guide' : '? MD Guide'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setComposerMdMobileOpen(true)}
                        title="Open Markdown reference"
                        className="inline-flex rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors lg:hidden"
                        style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', color: 'var(--social-text-muted)' }}
                      >
                        ? MD Guide
                      </button>
                    </div>
                  </div>
                  {CODE_MODE_HAS_SELECTION_ITEMS ? (
                    <p className="mt-1.5 text-[10px]" style={{ color: 'var(--accent)' }}>
                      <span className="rounded px-1 py-0.5" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>accent</span> = highlight text in editor first
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* ── Design Studio: formatting toolbar ── */}
              {postForm.editorMode === 'design' ? (
                <div className="px-3 py-2" style={{ borderBottom: '1px solid color-mix(in srgb, var(--social-text-muted) 12%, transparent)', background: 'var(--social-surface-soft)' }}>
                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      { title: 'Bold', icon: 'B', action: () => applyDesignWrapper('**'), bold: true },
                      { title: 'Italic', icon: 'I', action: () => applyDesignWrapper('*'), italic: true },
                      { title: 'Code', icon: '<>', action: () => applyDesignWrapper('`'), mono: true },
                    ].map((btn) => (
                      <button key={btn.title} type="button" title={`${btn.title} — highlight text first`} onClick={btn.action} className={`inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md px-1.5 text-[11px] font-semibold transition-colors ${btn.bold ? 'font-bold' : ''} ${btn.italic ? 'italic' : ''} ${btn.mono ? 'font-mono' : ''}`} style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-secondary)' }}>{btn.icon}</button>
                    ))}
                    <button type="button" title="Text color — highlight text first" onClick={() => applyDesignWrapper('[color=red]', '[/color]')} className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[11px] font-semibold transition-colors" style={{ border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)' }}>A</button>
                    <button type="button" title="Highlight — highlight text first" onClick={() => applyDesignWrapper('[bg=yellow]', '[/bg]')} className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[11px] font-semibold transition-colors" style={{ border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)' }}>BG</button>
                    <button type="button" title="Vertical callout line — highlight text first" onClick={() => applyDesignWrapper('[vline=4]', '[/vline]')} className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[11px] font-semibold transition-colors" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-secondary)' }}>|—</button>
                    <span className="mx-1 h-4 w-px" style={{ background: 'color-mix(in srgb, var(--social-text-muted) 25%, transparent)' }} />
                    <button type="button" title="Heading H1" onClick={() => applyComposerSnippet('\n# Heading\n')} className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[11px] font-bold transition-colors" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-secondary)' }}>H1</button>
                    <button type="button" title="Heading H2" onClick={() => applyComposerSnippet('\n## Sub heading\n')} className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[11px] font-semibold transition-colors" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-secondary)' }}>H2</button>
                    <button type="button" title="Unordered list item" onClick={() => applyComposerSnippet('\n- List item\n')} className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[11px] transition-colors" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-secondary)' }}>•—</button>
                    <button type="button" title="Blockquote" onClick={() => applyComposerSnippet('\n> Quote\n')} className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[11px] transition-colors" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-secondary)' }}>❝</button>
                    <button type="button" title="Insert link" onClick={() => applyComposerSnippet('[Label](https://example.com)')} className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[11px] transition-colors" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-secondary)' }}>🔗</button>
                  </div>
                  <p className="mt-1 text-[10px]" style={{ color: 'var(--social-text-muted)' }}>Tip: select text before clicking a formatting button to wrap it</p>
                </div>
              ) : null}

              {/* ── Main editor area ── */}
              <div className={`flex gap-0 ${postForm.editorMode === 'code' && composerMdGuideOpen ? 'lg:flex-row' : 'flex-col'}`}>
                <div className="flex-1 p-3">
                  {postForm.editorMode === 'code' ? (
                    <textarea
                      ref={composerCodeTextareaRef}
                      value={postForm.codeContent}
                      onChange={(event) => setPostForm((prev) => ({ ...prev, codeContent: event.target.value }))}
                      placeholder={"Write with markdown + custom blocks\n\nExample: **bold**, *italic*, [color=red]colored text[/color]"}
                      className="min-h-40 w-full resize-y rounded-xl px-3 py-2.5 font-mono text-sm focus:outline-none focus:ring-2"
                      style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--social-surface-soft)', color: 'var(--social-text-primary)', '--tw-ring-color': 'var(--accent)' }}
                      maxLength={5000}
                    />
                  ) : (
                    <textarea
                      ref={composerDesignTextareaRef}
                      value={postForm.content}
                      onChange={(event) => setPostForm((prev) => ({ ...prev, content: event.target.value }))}
                      placeholder="What's on your mind?"
                      className="min-h-40 w-full resize-y rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--social-surface-soft)', color: 'var(--social-text-primary)', '--tw-ring-color': 'var(--accent)' }}
                      maxLength={5000}
                    />
                  )}
                  <div className="mt-1.5 flex justify-end">
                    <span className="text-[10px]" style={{ color: 'var(--social-text-muted)' }}>
                      {(postForm.editorMode === 'code' ? postForm.codeContent : postForm.content).length} / 5000
                    </span>
                  </div>
                </div>

                {postForm.editorMode === 'code' && composerMdGuideOpen ? (
                  <div className="hidden w-72 shrink-0 p-3 lg:flex lg:flex-col" style={{ borderLeft: '1px solid color-mix(in srgb, var(--social-text-muted) 12%, transparent)', background: 'var(--social-surface-soft)' }}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--social-text-muted)' }}>Markdown Reference</p>
                    <div className="flex-1 overflow-y-auto">
                      <ul className="space-y-1.5">
                        {CODE_MODE_SNIPPETS.map((snippet) => (
                          <li key={snippet.label} className="group flex items-start gap-2 rounded-lg p-1.5" style={{ '--hover-bg': 'var(--bg-panel)' }}>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold" style={{ color: 'var(--social-text-primary)' }}>{snippet.label}</p>
                              <code className="block text-[10px] break-all" style={{ color: 'var(--accent)' }}>{snippet.syntax}</code>
                              {snippet.requiresSelection ? (
                                <p className="text-[10px]" style={{ color: 'var(--accent)' }}>⚠ Highlight text first</p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              title={`Copy: ${snippet.syntax}`}
                              onClick={() => handleCopyMdSyntax(snippet.syntax)}
                              className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors"
                              style={{ color: 'var(--social-text-muted)' }}
                            >
                              {copiedMd === snippet.syntax ? '✓' : 'copy'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className="mt-2 text-[10px]" style={{ color: 'var(--social-text-muted)' }}>Click any toolbar button above to insert at cursor</p>
                  </div>
                ) : null}
              </div>

              {/* ── Image gallery section ── */}
              <div className="px-3 py-2" style={{ borderTop: '1px solid color-mix(in srgb, var(--social-text-muted) 12%, transparent)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors" style={{ border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-panel))', color: 'var(--accent)' }}>
                    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="4" width="16" height="12" rx="2" /><circle cx="7" cy="9" r="1.5" /><path d="M2 14l4-4 4 4 3-3 5 4" /></svg>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleComposerImageUpload} />
                    {composerImageUploading ? 'Uploading…' : 'Add images'}
                  </label>
                  {postForm.mediaUrls.length > 0 ? (
                    <span className="text-[11px] font-medium" style={{ color: 'var(--social-text-muted)' }}>
                      {postForm.mediaUrls.length} / {MEDIA_URL_MAX_ITEMS} images
                    </span>
                  ) : (
                    <span className="text-[11px]" style={{ color: 'var(--social-text-muted)' }}>Up to 6 images at once (max 3MB each)</span>
                  )}
                  {/* All images audience selector */}
                  {postForm.mediaUrls.length > 0 ? (() => {
                    const overrideValues = Object.values(postForm.imageAudienceOverrides);
                    const allSocial = overrideValues.length > 0 && overrideValues.every((v) => v === 'social');
                    const allSecure = overrideValues.length > 0 && overrideValues.every((v) => v === 'secure');
                    return (
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-[10px] font-medium" style={{ color: 'var(--social-text-muted)' }}>All images:</span>
                      <div className="flex rounded-lg p-0.5" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--social-surface-soft)' }}>
                        <button
                          type="button"
                          onClick={() => setPostForm((prev) => {
                            const overrides = {};
                            prev.mediaUrls.forEach((_, i) => { overrides[i] = 'social'; });
                            return { ...prev, imageAudienceOverrides: overrides };
                          })}
                          className="rounded-md px-2 py-0.5 text-[10px] font-semibold transition-all"
                          style={allSocial ? { backgroundColor: '#0284c7', color: '#fff' } : { color: 'var(--social-text-muted)' }}
                        >
                          Social
                        </button>
                        <button
                          type="button"
                          onClick={() => setPostForm((prev) => {
                            const overrides = {};
                            prev.mediaUrls.forEach((_, i) => { overrides[i] = 'secure'; });
                            return { ...prev, imageAudienceOverrides: overrides };
                          })}
                          className="rounded-md px-2 py-0.5 text-[10px] font-semibold transition-all"
                          style={allSecure ? { backgroundColor: '#d97706', color: '#fff' } : { color: 'var(--social-text-muted)' }}
                        >
                          Secure
                        </button>
                      </div>
                    </div>
                    );
                  })() : null}
                </div>

                {/* Image previews grid */}
                {postForm.mediaUrls.length > 0 ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {postForm.mediaUrls.map((url, index) => (
                      <div key={`${url}-${index}`} className="group relative overflow-hidden rounded-xl" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 15%, transparent)', background: 'var(--social-surface-soft)' }}>
                        <img
                          src={url}
                          alt={postForm.imageDescriptions?.[index] || `Image ${index + 1}`}
                          className="h-28 w-full object-cover"
                          loading="lazy"
                        />
                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => {
                            setPostForm((prev) => {
                              const newDescs = { ...prev.imageDescriptions };
                              const newOverrides = { ...prev.imageAudienceOverrides };
                              delete newDescs[index];
                              delete newOverrides[index];
                              const reindexDescs = {};
                              const reindexOverrides = {};
                              const newMediaUrls = prev.mediaUrls.filter((_, i) => i !== index);
                              newMediaUrls.forEach((_, newIdx) => {
                                const oldIdx = newIdx >= index ? newIdx + 1 : newIdx;
                                if (newDescs[oldIdx] !== undefined) reindexDescs[newIdx] = newDescs[oldIdx];
                                if (newOverrides[oldIdx] !== undefined) reindexOverrides[newIdx] = newOverrides[oldIdx];
                              });
                              return { ...prev, mediaUrls: newMediaUrls, imageDescriptions: reindexDescs, imageAudienceOverrides: reindexOverrides };
                            });
                          }}
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                          style={{ background: 'rgba(0,0,0,0.6)' }}
                        >
                          ✕
                        </button>
                        {/* Per-image audience override */}
                        <div className="absolute left-1 top-1 flex rounded-md p-px opacity-0 transition-opacity group-hover:opacity-100" style={{ background: 'rgba(0,0,0,0.5)' }}>
                          <button
                            type="button"
                            onClick={() => setPostForm((prev) => ({ ...prev, imageAudienceOverrides: { ...prev.imageAudienceOverrides, [index]: 'social' } }))}
                            className="rounded-l-md px-1.5 py-px text-[9px] font-semibold"
                            style={(postForm.imageAudienceOverrides[index] || postForm.relationshipAudience) === 'social' ? { backgroundColor: '#0284c7', color: '#fff' } : { color: 'rgba(255,255,255,0.7)' }}
                          >
                            S
                          </button>
                          <button
                            type="button"
                            onClick={() => setPostForm((prev) => ({ ...prev, imageAudienceOverrides: { ...prev.imageAudienceOverrides, [index]: 'secure' } }))}
                            className="rounded-r-md px-1.5 py-px text-[9px] font-semibold"
                            style={(postForm.imageAudienceOverrides[index] || postForm.relationshipAudience) === 'secure' ? { backgroundColor: '#d97706', color: '#fff' } : { color: 'rgba(255,255,255,0.7)' }}
                          >
                            🔒
                          </button>
                        </div>
                        {/* Description input */}
                        <input
                          type="text"
                          value={postForm.imageDescriptions?.[index] || ''}
                          onChange={(event) => setPostForm((prev) => ({ ...prev, imageDescriptions: { ...prev.imageDescriptions, [index]: event.target.value } }))}
                          placeholder="Add description…"
                          maxLength={140}
                          className="w-full px-2 py-1.5 text-[11px] focus:outline-none"
                          style={{ background: 'var(--social-surface-soft)', color: 'var(--social-text-secondary)', borderTop: '1px solid color-mix(in srgb, var(--social-text-muted) 10%, transparent)' }}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* ── Interaction settings (shown for interactive post types) ── */}
              {postForm.contentType !== 'standard' ? (
                <div className="mx-3 mb-3 mt-2 space-y-3 rounded-xl p-3" style={{ border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', background: 'color-mix(in srgb, var(--accent) 5%, var(--bg-panel))' }}>
                    {postForm.contentType === 'poll' ? (
                      <div className="space-y-3 rounded-xl p-3" style={{ border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)', background: 'color-mix(in srgb, var(--accent) 5%, transparent)' }}>
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--social-text-primary)' }}>Poll Settings</h4>
                        <input type="text" value={postForm.interaction.poll.question} onChange={(event) => updateInteractionField('poll', 'question', event.target.value)} placeholder="Poll question" className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-primary)', '--tw-ring-color': 'var(--accent)' }} />
                        <div className="space-y-2">
                          {postForm.interaction.poll.options.map((option, index) => (
                            <div key={`poll-option-${index}`} className="flex gap-2">
                              <input type="text" value={option} onChange={(event) => updateInteractionOption('poll', index, event.target.value)} placeholder={`Option ${index + 1}`} className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-primary)', '--tw-ring-color': 'var(--accent)' }} />
                              <button type="button" onClick={() => removeInteractionOption('poll', index)} className="px-2" style={{ color: '#ef4444' }} disabled={postForm.interaction.poll.options.length <= 2}>Remove</button>
                            </div>
                          ))}
                          <button type="button" onClick={() => addInteractionOption('poll')} className="text-sm hover:underline" style={{ color: 'var(--accent)' }} disabled={postForm.interaction.poll.options.length >= INTERACTION_MAX_OPTIONS}>Add poll option</button>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--social-text-secondary)' }}><input type="checkbox" checked={postForm.interaction.poll.allowMultiple} onChange={(event) => updateInteractionField('poll', 'allowMultiple', event.target.checked)} />Allow multiple selections</label>
                          <input type="datetime-local" value={postForm.interaction.poll.expiresAt} onChange={(event) => updateInteractionField('poll', 'expiresAt', event.target.value)} className="rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-primary)', '--tw-ring-color': 'var(--accent)' }} />
                        </div>
                      </div>
                    ) : null}

                    {postForm.contentType === 'quiz' ? (
                      <div className="space-y-3 rounded-xl p-3" style={{ border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)', background: 'color-mix(in srgb, var(--accent) 5%, transparent)' }}>
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--social-text-primary)' }}>Quiz Settings</h4>
                        <input type="text" value={postForm.interaction.quiz.question} onChange={(event) => updateInteractionField('quiz', 'question', event.target.value)} placeholder="Quiz question" className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-primary)', '--tw-ring-color': 'var(--accent)' }} />
                        <div className="space-y-2">
                          {postForm.interaction.quiz.options.map((option, index) => (
                            <div key={`quiz-option-${index}`} className="flex gap-2">
                              <input type="text" value={option} onChange={(event) => updateInteractionOption('quiz', index, event.target.value)} placeholder={`Option ${index + 1}`} className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-primary)', '--tw-ring-color': 'var(--accent)' }} />
                              <button type="button" onClick={() => removeInteractionOption('quiz', index)} className="px-2" style={{ color: '#ef4444' }} disabled={postForm.interaction.quiz.options.length <= 2}>Remove</button>
                            </div>
                          ))}
                          <button type="button" onClick={() => addInteractionOption('quiz')} className="text-sm hover:underline" style={{ color: 'var(--accent)' }} disabled={postForm.interaction.quiz.options.length >= INTERACTION_MAX_OPTIONS}>Add quiz option</button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <select value={postForm.interaction.quiz.correctOptionIndex} onChange={(event) => updateInteractionField('quiz', 'correctOptionIndex', Number(event.target.value))} className="rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-primary)', '--tw-ring-color': 'var(--accent)' }}>
                            {postForm.interaction.quiz.options.map((_, index) => <option key={`quiz-correct-${index}`} value={index}>Correct option #{index + 1}</option>)}
                          </select>
                          <input type="datetime-local" value={postForm.interaction.quiz.expiresAt} onChange={(event) => updateInteractionField('quiz', 'expiresAt', event.target.value)} className="rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-primary)', '--tw-ring-color': 'var(--accent)' }} />
                        </div>
                        <textarea value={postForm.interaction.quiz.explanation} onChange={(event) => updateInteractionField('quiz', 'explanation', event.target.value)} placeholder="Explanation shown after answer (optional)" className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2" rows={2} style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-primary)', '--tw-ring-color': 'var(--accent)' }} />
                      </div>
                    ) : null}

                    {postForm.contentType === 'countdown' ? (
                      <div className="space-y-3 rounded-xl p-3" style={{ border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)', background: 'color-mix(in srgb, var(--accent) 5%, transparent)' }}>
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--social-text-primary)' }}>Countdown Settings</h4>
                        <input type="text" value={postForm.interaction.countdown.label} onChange={(event) => updateInteractionField('countdown', 'label', event.target.value)} placeholder="Countdown label" className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-primary)', '--tw-ring-color': 'var(--accent)' }} />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <input type="datetime-local" value={postForm.interaction.countdown.targetAt} onChange={(event) => updateInteractionField('countdown', 'targetAt', event.target.value)} className="rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-primary)', '--tw-ring-color': 'var(--accent)' }} />
                          <input type="text" value={postForm.interaction.countdown.timezone} onChange={(event) => updateInteractionField('countdown', 'timezone', event.target.value)} placeholder="Timezone (e.g. UTC)" className="rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-primary)', '--tw-ring-color': 'var(--accent)' }} />
                        </div>
                        <input type="url" value={postForm.interaction.countdown.linkUrl} onChange={(event) => updateInteractionField('countdown', 'linkUrl', event.target.value)} placeholder="Optional link URL" className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-primary)', '--tw-ring-color': 'var(--accent)' }} />
                      </div>
                    ) : null}
                  </div>
              ) : null}

              {/* ── Live preview ── */}
              {(postForm.editorMode === 'code' ? postForm.codeContent : postForm.content) ? (
                <div className="mx-3 mb-3 rounded-xl px-3 py-2.5 text-sm" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 12%, transparent)', background: 'var(--social-surface-soft)', color: 'var(--social-text-secondary)' }}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--social-text-muted)' }}>Preview</p>
                  {renderFormattedPostContent(postForm.editorMode === 'code' ? postForm.codeContent : postForm.content)}
                </div>
              ) : null}

              {/* ── Footer: submit ── */}
              <div className="px-3 py-2.5" style={{ borderTop: '1px solid color-mix(in srgb, var(--social-text-muted) 12%, transparent)', background: 'var(--social-surface-muted)' }}>
                {feedError ? (
                  <div className="mb-2.5 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'color-mix(in srgb, #ef4444 40%, transparent)', background: 'color-mix(in srgb, #ef4444 10%, var(--bg-panel))', color: '#ef4444' }}>
                    {feedError}
                  </div>
                ) : null}
                <button
                  type="submit"
                  disabled={submittingPost || composerImageUploading}
                  className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-60 sm:w-auto sm:min-w-[140px]"
                  style={{ background: `linear-gradient(135deg, var(--accent), var(--accent2))` }}
                >
                  {composerImageUploading ? 'Uploading image…' : submittingPost ? 'Publishing…' : 'Publish Post'}
                </button>
              </div>
            </div>

            {/* ── Mobile MD Guide popup ── */}
            {composerMdMobileOpen ? (
              <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:hidden" onClick={() => setComposerMdMobileOpen(false)}>
                <div className="w-full max-w-lg rounded-t-2xl shadow-2xl" style={{ background: 'var(--bg-panel)' }} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid color-mix(in srgb, var(--social-text-muted) 15%, transparent)' }}>
                    <p className="font-semibold" style={{ color: 'var(--social-text-primary)' }}>Markdown Quick Reference</p>
                    <button type="button" onClick={() => setComposerMdMobileOpen(false)} style={{ color: 'var(--social-text-muted)' }}>✕</button>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto p-4">
                    <ul className="space-y-2">
                      {CODE_MODE_SNIPPETS.map((snippet) => (
                        <li key={snippet.label} className="flex items-center gap-3 rounded-xl p-2.5" style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 12%, transparent)' }}>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold" style={{ color: 'var(--social-text-primary)' }}>{snippet.label}</p>
                            <code className="text-[11px] break-all" style={{ color: 'var(--accent)' }}>{snippet.syntax}</code>
                            <p className="text-[11px]" style={{ color: 'var(--social-text-muted)' }}>{snippet.description}{snippet.requiresSelection ? ' · ⚠ highlight text first' : ''}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyMdSyntax(snippet.syntax)}
                            className="shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition-colors"
                            style={{ border: '1px solid color-mix(in srgb, var(--social-text-muted) 20%, transparent)', background: 'var(--social-surface-soft)', color: 'var(--social-text-secondary)' }}
                          >
                            {copiedMd === snippet.syntax ? '✓ Copied' : 'Copy'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}
          </form>
        ) : <p className="text-sm text-slate-500">Post publishing is available only in owner view.</p>;
      case 'circles':
        return isOwnSocialContext && !isGuestPreview ? (
          <CircleManager circles={circles} friends={friends} onCreateCircle={handleCreateCircle} onUpdateCircle={handleUpdateCircle} onDeleteCircle={handleDeleteCircle} onAddMember={handleAddCircleMember} onRemoveMember={handleRemoveCircleMember} onMoveMember={handleMoveCircleMember} />
        ) : (
          <div className="space-y-4">
            <CircleSpiderDiagram
              circles={circles}
              profileLabel={activeProfile?.username || requestedProfileIdentifier || 'user'}
              accentColor={accentColor}
            />
            {circles.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {circles.map((circle) => (
                  <div key={circle.name} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <div className="flex items-center gap-3">
                      {isRenderableMediaUrl(circle.profileImageUrl) ? <img src={circle.profileImageUrl} alt={circle.name} className="h-10 w-10 rounded-full object-cover" /> : <span className="h-3 w-3 rounded-full" style={{ backgroundColor: circle.color || accentColor }} />}
                      <div>
                        <p className="font-semibold text-slate-900">{circle.name}</p>
                        <p className="text-xs text-slate-500">{circle.memberCount || 0} members</p>
                      </div>
                      <span className={`ml-auto rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${circle.relationshipAudience === 'secure' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>
                        {RELATIONSHIP_AUDIENCE_LABELS[circle.relationshipAudience] || RELATIONSHIP_AUDIENCE_LABELS.social}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      case 'timeline':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm" style={{ color: 'var(--social-text-muted)' }}>Timeline</p>
              <button type="button" onClick={loadFeed} className="rounded-xl border px-3 py-2 text-sm transition-colors" style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 25%, transparent)', color: 'var(--social-text-secondary)', background: 'transparent' }} disabled={loadingFeed}>{loadingFeed ? 'Refreshing…' : 'Refresh'}</button>
            </div>
            {feedError ? <div className="rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: 'color-mix(in srgb, #ef4444 40%, transparent)', background: 'color-mix(in srgb, #ef4444 10%, var(--bg-panel))', color: '#ef4444' }}>{feedError}</div> : null}
            {isAuthenticated && !realtimeEnabled ? <div className="rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: 'color-mix(in srgb, #d97706 30%, transparent)', background: 'color-mix(in srgb, #d97706 8%, var(--bg-panel))', color: 'color-mix(in srgb, #d97706 85%, var(--social-text-primary))' }}>Real-time social updates are disabled for this account. Periodic refresh remains active.</div> : null}
            {loadingFeed ? <div className="rounded-xl border p-6" style={{ background: 'var(--social-surface-soft)', borderColor: 'color-mix(in srgb, var(--social-text-muted) 15%, transparent)', color: 'var(--social-text-muted)' }}>Loading feed…</div> : posts.length === 0 ? renderSoftEmptyState({
              iconType: 'compose',
              title: isOwnSocialContext ? 'Your timeline is empty' : 'Nothing here yet',
              description: isOwnSocialContext
                ? 'Share a thought, a photo, or a quick update to get your feed started.'
                : 'This profile hasn\'t shared any posts visible to you.',
              actionLabel: isOwnSocialContext ? 'Create a post' : null,
              onAction: isOwnSocialContext ? () => setComposerVisible(true) : null,
              tone: 'blue'
            }) : posts.map((post) => {
              const postAuthor = post.authorId?.username || 'unknown';
              const postAuthorId = String(post.authorId?._id || post.authorId || '');
              const postTarget = post.targetFeedId?.username || postAuthor;
              const hasLiked = currentUser ? post.likes.includes(currentUser._id) : false;
              const postBusy = Boolean(actionLoadingByPost[post._id]);
              const isPostOwner = postAuthorId && postAuthorId === String(currentUser?._id || '');
              const isBlocked = blockedUserIds.includes(postAuthorId);
              const isMuted = mutedUserIds.includes(postAuthorId);
              const displayContent = getDisplayContent(
                post.content,
                post.contentCensored,
                currentUser?.enableMaturityWordCensor !== false
              );
              const interaction = post.interaction;
              const interactionStatus = getInteractionStatus(interaction);

              return (
                <article key={post._id} className="space-y-3 rounded-2xl border p-5 shadow-sm" style={{ background: 'var(--bg-panel)', borderColor: 'color-mix(in srgb, var(--social-text-muted) 20%, transparent)' }}>
                  <header className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium" style={{ color: 'var(--social-text-primary)' }}>@{postAuthor} {'→'} @{postTarget}</p>
                      <p className="text-xs" style={{ color: 'var(--social-text-muted)' }}>{formatDate(post.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="rounded-full px-2 py-1 text-xs uppercase tracking-wide" style={{ background: 'var(--social-surface-muted)', color: 'var(--social-text-secondary)' }}>{PRIVACY_BADGE_LABELS[post.visibility] || post.visibility}</span>
                      <span className={`rounded-full px-2 py-1 text-xs uppercase tracking-wide ${post.relationshipAudience === 'secure' ? 'bg-amber-100 text-amber-800' : post.relationshipAudience === 'public' ? 'bg-green-100 text-green-800' : 'bg-sky-100 text-sky-800'}`}>{RELATIONSHIP_AUDIENCE_LABELS[post.relationshipAudience] || RELATIONSHIP_AUDIENCE_LABELS.social}</span>
                      {isAuthenticated && !isGuestPreview && isPostOwner ? (
                        <button type="button" onClick={() => handleDeletePost(post._id)} disabled={postBusy} className="rounded-full border px-2 py-1 text-xs font-semibold disabled:opacity-60" style={{ borderColor: 'color-mix(in srgb, #ef4444 40%, transparent)', color: '#ef4444' }}>
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </header>
                  <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--social-text-secondary)' }}>
                    {Array.isArray(post.visibleToCircles) && post.visibleToCircles.length > 0 ? <span className="rounded-full px-2 py-1" style={{ background: 'var(--social-surface-muted)' }}>Circles: {post.visibleToCircles.join(', ')}</span> : null}
                    {post.locationRadius ? <span className="rounded-full px-2 py-1" style={{ background: 'var(--social-surface-muted)' }}>Radius: {post.locationRadius} mi</span> : null}
                    {post.expiresAt ? <span className="rounded-full px-2 py-1" style={{ background: 'var(--social-surface-muted)' }}>Expires: {formatDate(post.expiresAt)}</span> : null}
                  </div>
                  {displayContent ? <div className="space-y-1" style={{ color: 'var(--social-text-primary)' }}>{renderFormattedPostContent(displayContent)}</div> : null}
                  {post.mediaUrls.length > 0 ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{post.mediaUrls.map((url, index) => renderMediaItem(url, `${post._id}-media-${index}`))}</div> : null}
                  {interaction?.type === 'poll' ? <div className="rounded-xl border p-3" style={{ background: 'var(--social-surface-soft)', borderColor: 'color-mix(in srgb, var(--social-text-muted) 15%, transparent)' }}><p className="text-sm font-medium" style={{ color: 'var(--social-text-primary)' }}>{interaction.poll?.question}</p><p className="text-xs" style={{ color: 'var(--social-text-muted)' }}>Poll status: <span className="font-medium">{interactionStatus}</span></p></div> : null}
                  {interaction?.type === 'quiz' ? <div className="rounded-xl border p-3" style={{ background: 'color-mix(in srgb, #8b5cf6 5%, var(--bg-panel))', borderColor: 'color-mix(in srgb, #8b5cf6 20%, transparent)' }}><p className="text-sm font-medium" style={{ color: 'var(--social-text-primary)' }}>{interaction.quiz?.question}</p><p className="text-xs" style={{ color: 'var(--social-text-muted)' }}>Quiz status: <span className="font-medium">{interactionStatus}</span></p></div> : null}
                  {interaction?.type === 'countdown' ? <div className="rounded-xl border p-3" style={{ background: 'color-mix(in srgb, #059669 5%, var(--bg-panel))', borderColor: 'color-mix(in srgb, #059669 20%, transparent)' }}><p className="text-sm font-medium" style={{ color: 'var(--social-text-primary)' }}>{interaction.countdown?.label}</p><p className="text-xs" style={{ color: 'var(--social-text-secondary)' }}>Timezone: {interaction.countdown?.timezone || 'UTC'} • Status: {interactionStatus}</p><p className="text-lg font-semibold" style={{ color: '#059669' }}>{formatRemainingTime(interaction.countdown?.targetAt, nowMs)}</p></div> : null}
                  <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--social-text-secondary)' }}><span>{post.likesCount} like{post.likesCount === 1 ? '' : 's'}</span><span>{post.commentsCount} comment{post.commentsCount === 1 ? '' : 's'}</span></div>
                  {isAuthenticated && !isGuestPreview && postAuthorId && postAuthorId !== String(currentUser?._id) ? (
                    <div className="flex flex-wrap gap-2">
                      <BlockButton isBlocked={isBlocked} onBlock={(reason) => handleBlockUser(postAuthorId, reason)} onUnblock={() => handleUnblockUser(postAuthorId)} />
                      <button type="button" onClick={() => handleToggleMuteUser(postAuthorId)} className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 35%, transparent)', color: 'var(--social-text-secondary)' }}>{isMuted ? 'Unmute User' : 'Mute User'}</button>
                      <button type="button" onClick={() => openReportModal('post', post._id, postAuthorId)} className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: 'color-mix(in srgb, #ef4444 35%, transparent)', color: '#ef4444' }}>Report</button>
                    </div>
                  ) : null}
                  {isAuthenticated && !isGuestPreview ? (
                    <div className="space-y-3">
                      <button type="button" disabled={postBusy} onClick={() => handleToggleLike(post)} className="rounded-lg border px-3 py-1.5 text-sm transition-colors" style={hasLiked ? { borderColor: 'var(--accent)', background: 'var(--accent)', color: '#fff' } : { borderColor: 'color-mix(in srgb, var(--social-text-muted) 30%, transparent)', color: 'var(--social-text-secondary)' }}>{hasLiked ? 'Unlike' : 'Like'}</button>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium" style={{ color: 'var(--social-text-primary)' }}>Comments</h4>
                        {post.comments.length === 0 ? <p className="text-sm" style={{ color: 'var(--social-text-muted)' }}>No comments yet.</p> : (
                          <ul className="space-y-2">
                            {post.comments.map((comment, index) => (
                              <li key={comment._id || `${post._id}-comment-${index}`} className="rounded-xl border p-2 text-sm" style={{ background: 'var(--social-surface-soft)', borderColor: 'color-mix(in srgb, var(--social-text-muted) 15%, transparent)' }}>
                                <p className="font-medium" style={{ color: 'var(--social-text-secondary)' }}>@{comment.username || comment.userId || 'user'}</p>
                                <p className="whitespace-pre-wrap" style={{ color: 'var(--social-text-primary)' }}>{comment.content}</p>
                                <p className="text-xs" style={{ color: 'var(--social-text-muted)' }}>{formatDate(comment.createdAt)}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex gap-2">
                          <input type="text" value={commentInputs[post._id] || ''} onChange={(event) => handleCommentInputChange(post._id, event.target.value)} onBlur={() => emitTypingStop({ scope: 'comment', targetId: post._id })} placeholder="Add a comment..." className="flex-1 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 25%, transparent)', background: 'var(--social-surface-soft)', color: 'var(--social-text-primary)' }} maxLength={1000} />
                          <button type="button" onClick={() => handleAddComment(post._id)} disabled={postBusy} className="rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60" style={{ background: 'var(--accent)' }}>Comment</button>
                        </div>
                        <TypingIndicator labels={Object.values(commentTypingByPostId[post._id] || {})} />
                      </div>
                    </div>
                  ) : <p className="text-sm" style={{ color: 'var(--social-text-muted)' }}>Sign in to like or comment on posts.</p>}
                </article>
              );
            })}
          </div>
        );
      case 'moderation_status':
        return isAuthenticated && !isGuestPreview ? (
          <div className="space-y-3">
            {myReports.length === 0 ? <p className="text-sm" style={{ color: 'var(--social-text-muted)' }}>No submitted reports yet.</p> : myReports.slice(0, 10).map((report) => (
              <div key={report.id} className="rounded-xl border p-2 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 20%, transparent)' }}>
                <p className="font-medium" style={{ color: 'var(--social-text-primary)' }}>{report.category} • {report.targetType} • {report.status}</p>
                <p style={{ color: 'var(--social-text-muted)' }}>{formatDate(report.createdAt)}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-sm" style={{ color: 'var(--social-text-muted)' }}>Moderation status is available only in owner view.</p>;
      case 'gallery':
        return (
          <div className="relative space-y-4 pt-5">
            <span className="absolute right-0 top-0 text-[11px] font-medium text-slate-400">{galleryItems.length}/{GALLERY_MAX_ITEMS}</span>
            {canManageGallery && galleryItems.length < GALLERY_MAX_ITEMS ? (
              <button
                type="button"
                onClick={handleGalleryUploadOpen}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors"
                style={{ border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-panel))', color: 'var(--accent)' }}
              >
                <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="4" width="16" height="12" rx="2" /><circle cx="7" cy="9" r="1.5" /><path d="M2 14l4-4 4 4 3-3 5 4" /></svg>
                Add to Gallery
              </button>
            ) : null}
            {!isAuthenticated ? (
              <div className="space-y-2 rounded-xl border p-3" style={{ background: 'var(--social-surface-soft)', borderColor: 'color-mix(in srgb, var(--social-text-muted) 20%, transparent)' }}>
                <p className="text-sm" style={{ color: 'var(--social-text-secondary)' }}>Choose a profile to browse gallery media.</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input type="text" value={galleryTargetInput} onChange={(event) => setGalleryTargetInput(event.target.value)} placeholder="username or user ID" className="flex-1 rounded-xl border px-3 py-2" style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 25%, transparent)', background: 'var(--bg-panel)', color: 'var(--social-text-primary)' }} />
                  <button type="button" onClick={() => setGalleryTarget(galleryTargetInput.trim())} disabled={galleryLoading} className="rounded-xl border px-4 py-2 disabled:opacity-60" style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 30%, transparent)', color: 'var(--social-text-secondary)' }}>Load Gallery</button>
                </div>
              </div>
            ) : null}
            {galleryError ? <div className="rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: 'color-mix(in srgb, #ef4444 40%, transparent)', background: 'color-mix(in srgb, #ef4444 10%, var(--bg-panel))', color: '#ef4444' }}>{galleryError}</div> : null}
            {galleryLoading ? <div className="rounded-xl border p-4 text-sm" style={{ background: 'var(--social-surface-soft)', borderColor: 'color-mix(in srgb, var(--social-text-muted) 15%, transparent)', color: 'var(--social-text-muted)' }}>Loading gallery…</div> : galleryItems.length === 0 ? renderSoftEmptyState({
              iconType: 'image',
              title: isOwnSocialContext ? 'No images yet' : 'Gallery is empty',
              description: isOwnSocialContext
                ? 'No gallery items have been added yet.'
                : 'This profile hasn\'t added any gallery items visible to you.',
              actionLabel: canManageGallery ? 'Add images' : null,
              onAction: canManageGallery ? handleGalleryUploadOpen : null,
              tone: 'amber'
            }) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {galleryItems.map((image) => {
                  const viewerReaction = image.viewerReaction || null;
                  const imageBusy = Boolean(galleryActionLoadingByImage[image._id]);
                  const editState = galleryEditById[image._id] || null;
                  return (
                    <article key={image._id} className="overflow-hidden rounded-[1.5rem] border shadow-sm" style={{ background: 'var(--bg-panel)', borderColor: 'color-mix(in srgb, var(--social-text-muted) 20%, transparent)' }}>
                      <button type="button" onClick={() => handleOpenGalleryImage(image._id)} className="block w-full">
                        <img src={image.mediaUrl} alt="Gallery item" className="h-40 w-full cursor-zoom-in object-cover" />
                      </button>
                      <div className="space-y-2.5 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            {image.title ? <p className="truncate text-sm font-semibold" style={{ color: 'var(--social-text-primary)' }}>{image.title}</p> : <p className="text-sm font-semibold" style={{ color: 'var(--social-text-muted)' }}>Untitled visual</p>}
                            {image.caption ? <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm" style={{ color: 'var(--social-text-secondary)' }}>{image.caption}</p> : null}
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${image.relationshipAudience === 'secure' ? 'bg-amber-100 text-amber-800' : image.relationshipAudience === 'public' ? 'bg-green-100 text-green-800' : 'bg-sky-100 text-sky-800'}`}>
                            {RELATIONSHIP_AUDIENCE_LABELS[image.relationshipAudience] || RELATIONSHIP_AUDIENCE_LABELS.social}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <button type="button" onClick={() => handleGalleryReaction(image._id, 'like')} disabled={!viewerCanReact || imageBusy} className="rounded-lg border px-2 py-1 transition-colors" style={viewerReaction === 'like' ? { borderColor: '#16a34a', background: '#16a34a', color: '#fff' } : { borderColor: 'color-mix(in srgb, var(--social-text-muted) 30%, transparent)', color: 'var(--social-text-secondary)' }}>👍 {image.likesCount || 0}</button>
                          <button type="button" onClick={() => handleGalleryReaction(image._id, 'dislike')} disabled={!viewerCanReact || imageBusy} className="rounded-lg border px-2 py-1 transition-colors" style={viewerReaction === 'dislike' ? { borderColor: '#ef4444', background: '#ef4444', color: '#fff' } : { borderColor: 'color-mix(in srgb, var(--social-text-muted) 30%, transparent)', color: 'var(--social-text-secondary)' }}>👎 {image.dislikesCount || 0}</button>
                          <span className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 20%, transparent)', color: 'var(--social-text-secondary)' }}>💬 {image.commentsCount || 0}</span>
                        </div>
                        {canManageGallery ? (
                          <div className="space-y-2 border-t pt-2" style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 15%, transparent)' }}>
                            {editState ? (
                              <div className="space-y-2">
                                {image.mediaType === 'url' ? <input type="url" value={editState.mediaUrl} onChange={(event) => handleEditGalleryField(image._id, 'mediaUrl', event.target.value)} placeholder="https://example.com/photo.jpg" className="w-full rounded-xl border px-2 py-1 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 25%, transparent)', background: 'var(--social-surface-soft)', color: 'var(--social-text-primary)' }} /> : null}
                                <input type="text" value={editState.title} onChange={(event) => handleEditGalleryField(image._id, 'title', event.target.value)} placeholder="Title" maxLength={140} className="w-full rounded-xl border px-2 py-1 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 25%, transparent)', background: 'var(--social-surface-soft)', color: 'var(--social-text-primary)' }} />
                                <input type="text" value={editState.caption} onChange={(event) => handleEditGalleryField(image._id, 'caption', event.target.value)} placeholder="Caption" maxLength={280} className="w-full rounded-xl border px-2 py-1 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 25%, transparent)', background: 'var(--social-surface-soft)', color: 'var(--social-text-primary)' }} />
                                <div className="flex gap-2">
                                  <button type="button" onClick={() => handleSaveGalleryItem(image)} disabled={imageBusy} className="rounded-lg px-2 py-1 text-xs text-white disabled:opacity-60" style={{ background: 'var(--accent)' }}>Save</button>
                                  <button type="button" onClick={() => handleCancelEditGalleryItem(image._id)} disabled={imageBusy} className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 25%, transparent)', color: 'var(--social-text-secondary)' }}>Cancel</button>
                                </div>
                              </div>
                            ) : <button type="button" onClick={() => handleStartEditGalleryItem(image)} disabled={imageBusy} className="text-xs" style={{ color: 'var(--accent)' }}>Edit image</button>}
                            <button type="button" onClick={() => handleRemoveGalleryImage(image._id)} disabled={imageBusy} className="text-xs disabled:opacity-60" style={{ color: '#ef4444' }}>Remove image</button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        );
      case 'chat_panel':
        {
          const canPostToProfileThread = isAuthenticated && profileChatPermissions.canWrite;
          return (
            <div ref={miniChatPanelRef} className="flex flex-col gap-0 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-[0_16px_40px_rgba(15,23,42,0.35)]">
              {/* Chat header – mirrors main Chat header style */}
              <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900/98 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                  <span className="truncate text-[12px] font-semibold text-slate-100">
                    {activeProfile?.username ? `@${activeProfile.username}` : 'Profile'} room
                  </span>
                  <span className="hidden shrink-0 rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300 sm:inline">Live</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Thread Access</span>
                  {profileChatPermissions.isOwner ? (
                    <button
                      type="button"
                      onClick={() => setProfileChatControlsExpanded((open) => !open)}
                      aria-expanded={profileChatControlsExpanded}
                      aria-label="Toggle chat access controls"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-sm text-slate-300 hover:bg-slate-700"
                    >
                      <span aria-hidden="true">⚙️</span>
                    </button>
                  ) : null}
                  <Link
                    to={socialChatPath}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-700"
                  >
                    {socialChatLabel}
                  </Link>
                </div>
              </div>

              {/* Access summary row */}
              <div className="flex gap-3 border-b border-slate-800 bg-slate-900/90 px-3 py-1.5 text-[11px] text-slate-400">
                <span><span className="font-semibold text-slate-300">Read:</span> {profileChatAccessSummary.read}</span>
                <span><span className="font-semibold text-slate-300">Write:</span> {profileChatAccessSummary.write}</span>
              </div>

              {/* Message viewport */}
              {profileChatLoading ? (
                <div className="px-3 py-4 text-[12px] text-slate-400">Loading chat room…</div>
              ) : profileChatPermissions.canRead ? (
                <>
                  <div
                    ref={miniChatViewportRef}
                    data-testid="social-mini-chat-viewport"
                    className="flex h-72 max-h-72 flex-col overflow-y-auto bg-slate-950/60 px-3 py-2 font-mono text-[13px] leading-5 [scrollbar-gutter:stable] lg:h-[26rem] lg:max-h-none"
                    style={miniChatDesktopViewportMaxHeight ? { maxHeight: `${miniChatDesktopViewportMaxHeight}px` } : undefined}
                  >
                    {profileChatMessages.length === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                        <p className="text-sm font-medium text-slate-500">No messages yet</p>
                        <p className="mt-0.5 text-xs text-slate-600">Start the conversation below.</p>
                      </div>
                    ) : profileChatMessages.map((message) => {
                      const isOwnMessage = isProfileChatOwnMessage(message);
                      const displayName = isOwnMessage ? 'You' : `@${message?.userId?.username || 'user'}`;
                      const timeStr = message?.createdAt
                        ? new Date(message.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                        : '';
                      return (
                        <div
                          key={message._id}
                          data-testid="social-mini-chat-line"
                          className="group flex gap-1.5 border-b border-slate-800/40 px-1 py-[3px] text-slate-100 hover:bg-slate-800/30"
                        >
                          <span className="shrink-0 text-[11px] leading-5 text-slate-500">{timeStr}</span>
                          <span className="shrink-0 font-semibold leading-5" style={{ color: isOwnMessage ? 'var(--accent, #60a5fa)' : '#94a3b8' }}>{displayName}</span>
                          <p data-testid="social-mini-chat-message-content" className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-5">{message?.content || ''}</p>
                          {profileChatPermissions.isOwner ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteProfileChatMessage(message._id)}
                              className="shrink-0 rounded px-1 py-0.5 text-[10px] text-red-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500/20"
                              title="Delete message"
                              aria-label="Delete message"
                            >
                              ✕
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {/* Composer – matches ChatComposerBar styling */}
                  <div className="border-t border-slate-800 bg-slate-900/95 p-2">
                    <div className="relative rounded-xl border border-slate-700 bg-slate-800/90 p-1 shadow-sm">
                      <div className="flex items-end gap-1.5">
                        <button
                          type="button"
                          disabled={!canPostToProfileThread || profileChatSending}
                          onClick={() => {
                            const emoji = '😊';
                            if (canPostToProfileThread) setProfileChatInput((prev) => `${prev}${emoji}`);
                          }}
                          className="rounded border border-slate-700 px-2 py-1.5 text-sm text-slate-400 transition hover:border-slate-600 hover:bg-slate-700 disabled:opacity-40"
                          aria-label="Insert emoji"
                        >
                          😊
                        </button>
                        <textarea
                          value={profileChatInput}
                          onChange={(event) => setProfileChatInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey && canPostToProfileThread && !profileChatSending && profileChatInput.trim()) {
                              event.preventDefault();
                              handleSendProfileChatMessage();
                            }
                          }}
                          aria-label="Profile chat message"
                          placeholder={canPostToProfileThread ? 'Type your message' : (isAuthenticated ? 'You do not have write access' : 'Sign in to send messages')}
                          disabled={!canPostToProfileThread || profileChatSending}
                          rows={1}
                          className="max-h-36 min-h-[40px] flex-1 resize-none rounded border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-sm leading-5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={handleSendProfileChatMessage}
                          disabled={!canPostToProfileThread || profileChatSending || !profileChatInput.trim()}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-95 disabled:opacity-50"
                        >
                          {profileChatSending ? '…' : 'Send'}
                        </button>
                      </div>
                    </div>
                    {!isAuthenticated ? (
                      <p className="mt-1.5 text-center text-[11px] text-slate-500">Sign in to post in this chat room.</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="px-3 py-4 text-sm text-slate-500">
                  This profile chat room is limited by the owner&apos;s access settings.
                </div>
              )}

              {/* Owner access controls (expanded) */}
              {profileChatPermissions.isOwner && profileChatControlsExpanded ? (
                <div className="border-t border-slate-800 bg-slate-900/90 space-y-2 p-2.5">
                  {[
                    { field: 'readRoles', label: 'Read access' },
                    { field: 'writeRoles', label: 'Write access' }
                  ].map((accessConfig) => (
                    <div key={accessConfig.field} className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{accessConfig.label}</p>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {PROFILE_CHAT_ROLE_OPTIONS.map((option) => {
                          const isSelected = profileChatAccessDraft[accessConfig.field].includes(option.value);
                          return (
                            <button
                              key={`${accessConfig.field}-${option.value}`}
                              type="button"
                              onClick={() => toggleProfileChatRole(accessConfig.field, option.value)}
                              aria-label={`${accessConfig.label}: ${option.label}`}
                              aria-pressed={isSelected}
                              title={option.label}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition ${
                                isSelected
                                  ? 'border-blue-500 bg-blue-900/70 text-blue-300'
                                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
                              }`}
                            >
                              <span aria-hidden="true">{PROFILE_CHAT_ROLE_ICONS[option.value] || '•'}</span>
                              <span className="sr-only">{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleSaveProfileChatAccess}
                    disabled={profileChatSavingAccess}
                    title="Save chat access"
                    className="inline-flex w-full items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-60"
                  >
                    {profileChatSavingAccess ? 'Saving…' : '💾 Save'}
                  </button>
                </div>
              ) : null}
              {profileChatError ? <div className="mx-2 mb-2 rounded-xl border border-red-900 bg-red-950/80 px-3 py-2 text-sm text-red-300">{profileChatError}</div> : null}
            </div>
          );
        }
      case 'top_friends':
        return topFriends.length === 0 ? (
          <p className="text-sm text-gray-600">Top friends are private or not set yet.</p>
        ) : (
          <ul className="space-y-3 text-sm text-gray-700">
            {topFriends.slice(0, TOP_FRIENDS_LIMIT).map((friend, index) => (
              <li key={friend._id || friend.username} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">@{friend.username}</p>
                    {friend.realName ? <p className="text-xs text-gray-500">{friend.realName}</p> : null}
                  </div>
                  <span className="rounded-full bg-amber-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900">Top {index + 1}</span>
                </div>
              </li>
            ))}
          </ul>
        );
      case 'community_notes':
        return (
          <div className="space-y-3 text-sm text-gray-700">
            <ul className="list-disc space-y-2 pl-5">
              <li>Keep posts constructive and clear.</li>
              <li>Use visibility settings to control reach.</li>
              <li>Switch to chat for real-time discussion.</li>
            </ul>
            {!isOwnSocialContext && sharedDesigns.length > 0 ? (
              <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Design sharing</p>
                <p className="mt-1 text-sm text-violet-900">This creator shared {sharedDesigns.length} design configuration{sharedDesigns.length === 1 ? '' : 's'}.</p>
              </div>
            ) : null}
          </div>
        );
      case 'blog_panel': {
        const isOwnerBlogView = isOwnSocialContext && !isGuestPreview;
        if (blogLoading) return <div className="p-6 text-center text-sm text-slate-500">Loading blog…</div>;
        if (blogError) return <div className="p-6 text-center text-sm text-red-400">{blogError}</div>;

        if (isOwnerBlogView && (blogEditing !== null || blogPosts.length === 0)) {
          // Blog editor form
          return (
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-300">{blogEditing ? 'Edit Post' : 'New Blog Post'}</h3>
                {blogEditing ? <button type="button" onClick={() => { setBlogEditing(null); setBlogForm({ title: '', content: '', excerpt: '', category: 'General', tags: [], audience: 'social', status: 'draft', backgroundImage: '', backgroundColor: '', fontFamily: '', fontSize: 16, fontColor: '' }); }} className="text-xs text-slate-400 hover:text-white">Cancel</button> : null}
              </div>
              <input type="text" value={blogForm.title} onChange={(e) => setBlogForm(f => ({ ...f, title: e.target.value }))} placeholder="Post title" maxLength={200} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1" style={{ '--tw-ring-color': accentColor }} />
              <textarea value={blogForm.content} onChange={(e) => setBlogForm(f => ({ ...f, content: e.target.value }))} placeholder="Write your blog post content… (supports rich text formatting)" rows={8} maxLength={50000} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 resize-y" style={{ '--tw-ring-color': accentColor }} />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={blogForm.excerpt} onChange={(e) => setBlogForm(f => ({ ...f, excerpt: e.target.value }))} placeholder="Excerpt (optional)" maxLength={500} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none" />
                <input type="text" value={blogForm.category} onChange={(e) => setBlogForm(f => ({ ...f, category: e.target.value }))} placeholder="Category" maxLength={100} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none" />
              </div>
              {/* Appearance controls */}
              <details className="rounded-xl border border-white/10 bg-white/5 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-400">Appearance Settings</summary>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Background Image URL</label>
                    <input type="text" value={blogForm.backgroundImage} onChange={(e) => setBlogForm(f => ({ ...f, backgroundImage: e.target.value }))} placeholder="https://..." maxLength={2048} className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Background Color</label>
                    <input type="text" value={blogForm.backgroundColor} onChange={(e) => setBlogForm(f => ({ ...f, backgroundColor: e.target.value }))} placeholder="#1e293b" maxLength={20} className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Font Family</label>
                    <input type="text" value={blogForm.fontFamily} onChange={(e) => setBlogForm(f => ({ ...f, fontFamily: e.target.value }))} placeholder="Inter" maxLength={60} className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Font Size ({blogForm.fontSize}px)</label>
                    <input type="range" min={12} max={32} value={blogForm.fontSize} onChange={(e) => setBlogForm(f => ({ ...f, fontSize: Number(e.target.value) }))} className="w-full" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Font Color</label>
                    <input type="text" value={blogForm.fontColor} onChange={(e) => setBlogForm(f => ({ ...f, fontColor: e.target.value }))} placeholder="#e2e8f0" maxLength={20} className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none" />
                  </div>
                </div>
              </details>
              {/* Audience and status */}
              <div className="flex flex-wrap items-center gap-3">
                <select value={blogForm.audience} onChange={(e) => setBlogForm(f => ({ ...f, audience: e.target.value }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none">
                  <option value="social">Social</option>
                  <option value="secure">Secure</option>
                </select>
                <select value={blogForm.status} onChange={(e) => setBlogForm(f => ({ ...f, status: e.target.value }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
                <button type="button" onClick={handleBlogSubmit} disabled={blogFormBusy || !blogForm.title.trim() || !blogForm.content.trim()} className="ml-auto rounded-xl px-5 py-2 text-xs font-semibold text-white transition disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})` }}>
                  {blogFormBusy ? 'Saving…' : (blogEditing ? 'Update' : 'Create Post')}
                </button>
              </div>
            </div>
          );
        }

        // Blog list/viewer
        if (blogViewingPost) {
          const post = blogPosts.find(p => String(p._id) === String(blogViewingPost)) || null;
          if (!post) { setBlogViewingPost(null); return null; }
          const postStyle = {
            ...(post.backgroundImage ? { backgroundImage: `url(${post.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
            ...(post.backgroundColor ? { backgroundColor: post.backgroundColor } : {}),
            ...(post.fontFamily ? { fontFamily: post.fontFamily } : {}),
            ...(post.fontSize ? { fontSize: `${Math.max(12, Math.min(32, post.fontSize))}px` } : {}),
            ...(post.fontColor ? { color: post.fontColor } : {})
          };
          const counts = post.reactionCounts || { like: post.reactions?.like?.length || 0, love: post.reactions?.love?.length || 0, insightful: post.reactions?.insightful?.length || 0 };
          return (
            <div className="space-y-4 p-4">
              <button type="button" onClick={() => setBlogViewingPost(null)} className="text-xs text-slate-400 hover:text-white">← Back to posts</button>
              <article className="relative rounded-2xl border border-white/10 p-6" style={postStyle}>
                {post.backgroundImage ? <div className="absolute inset-0 rounded-2xl bg-black/50" /> : null}
                <div className="relative">
                  <h2 className="text-xl font-bold text-white">{post.title}</h2>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                    {post.category ? <span className="rounded-full bg-white/10 px-2 py-0.5">{post.category}</span> : null}
                    <span className={`rounded-full px-2 py-0.5 ${post.audience === 'secure' ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/20 text-sky-300'}`}>{post.audience === 'secure' ? 'Secure' : 'Social'}</span>
                    {post.publishedAt ? <span>{new Date(post.publishedAt).toLocaleDateString()}</span> : null}
                  </div>
                  <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{post.content}</div>
                </div>
              </article>
              {/* Reactions */}
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => handleBlogReact(post._id, 'like')} className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs transition hover:bg-white/5">👍 {counts.like}</button>
                <button type="button" onClick={() => handleBlogReact(post._id, 'love')} className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs transition hover:bg-white/5">❤️ {counts.love}</button>
                <button type="button" onClick={() => handleBlogReact(post._id, 'insightful')} className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs transition hover:bg-white/5">💡 {counts.insightful}</button>
              </div>
            </div>
          );
        }

        // Blog post list with sidebar index
        const publishedPosts = blogPosts.filter(p => p.status === 'published' || isOwnerBlogView);
        const sortedPosts = blogIndexStyle === 'abc'
          ? [...publishedPosts].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
          : blogIndexStyle === 'category'
            ? [...publishedPosts].sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.title || '').localeCompare(b.title || ''))
            : [...publishedPosts].sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));

        const uniqueCategories = [...new Set(sortedPosts.map(p => p.category || 'General'))];

        return (
          <div className="flex gap-4 p-4">
            {/* Sidebar index */}
            <div className="hidden w-40 shrink-0 space-y-1 border-r border-white/10 pr-3 sm:block">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">{blogIndexStyle === 'category' ? 'Categories' : 'Posts'}</p>
              {blogIndexStyle === 'category' ? (
                uniqueCategories.map(cat => (
                  <p key={cat} className="truncate text-xs text-slate-400">{cat} ({sortedPosts.filter(p => p.category === cat).length})</p>
                ))
              ) : (
                sortedPosts.slice(0, 20).map(post => (
                  <button key={post._id} type="button" onClick={() => setBlogViewingPost(post._id)} className="block w-full truncate text-left text-xs text-slate-400 hover:text-white">{post.title}</button>
                ))
              )}
            </div>
            {/* Post cards */}
            <div className="min-w-0 flex-1 space-y-3">
              {isOwnerBlogView ? (
                <button type="button" onClick={() => { setBlogEditing('new'); setBlogForm({ title: '', content: '', excerpt: '', category: 'General', tags: [], audience: 'social', status: 'draft', backgroundImage: '', backgroundColor: '', fontFamily: '', fontSize: 16, fontColor: '' }); }} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-white/10 p-3 text-xs text-slate-400 transition hover:border-white/20 hover:text-white">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full text-white" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})` }}>+</span>
                  New blog post
                </button>
              ) : null}
              {sortedPosts.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No blog posts yet.</p>
              ) : sortedPosts.map(post => {
                const counts = post.reactionCounts || { like: post.reactions?.like?.length || 0, love: post.reactions?.love?.length || 0, insightful: post.reactions?.insightful?.length || 0 };
                return (
                  <div key={post._id} className="rounded-xl border border-white/10 p-4 transition hover:bg-white/[0.02]" style={post.backgroundColor ? { backgroundColor: post.backgroundColor } : {}}>
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" onClick={() => setBlogViewingPost(post._id)} className="min-w-0 flex-1 text-left">
                        <h4 className="font-semibold text-white">{post.title}</h4>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-400">{post.excerpt || post.content?.substring(0, 200)}</p>
                      </button>
                      {isOwnerBlogView ? (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button type="button" onClick={() => { setBlogEditing(post._id); setBlogForm({ title: post.title, content: post.content || '', excerpt: post.excerpt || '', category: post.category || 'General', tags: post.tags || [], audience: post.audience || 'social', status: post.status || 'draft', backgroundImage: post.backgroundImage || '', backgroundColor: post.backgroundColor || '', fontFamily: post.fontFamily || '', fontSize: post.fontSize || 16, fontColor: post.fontColor || '' }); }} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-400 hover:text-white">Edit</button>
                          <button type="button" onClick={() => handleBlogDelete(post._id)} className="rounded border border-red-500/20 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/10">Del</button>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                      {post.category ? <span className="rounded-full bg-white/10 px-2 py-0.5">{post.category}</span> : null}
                      <span className={`rounded-full px-2 py-0.5 ${post.audience === 'secure' ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/20 text-sky-300'}`}>{post.audience === 'secure' ? 'Secure' : 'Social'}</span>
                      {post.status === 'draft' ? <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-slate-400">Draft</span> : null}
                      {post.publishedAt ? <span>{new Date(post.publishedAt).toLocaleDateString()}</span> : null}
                      <span className="ml-auto flex gap-2">👍 {counts.like} ❤️ {counts.love} 💡 {counts.insightful}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
      case 'resume_panel': {
        if (resumeLoading) return <div className="p-6 text-center text-sm text-slate-500">Loading resume…</div>;
        if (!resumeData) {
          return (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <p className="text-sm text-slate-500">No resume available yet.</p>
              {isOwnSocialContext && !isGuestPreview ? (
                <Link to="/settings" className="mt-3 rounded-xl px-5 py-2 text-xs font-semibold text-white transition" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})` }}>
                  Build your resume
                </Link>
              ) : null}
            </div>
          );
        }
        const basics = resumeData.basics || {};
        return (
          <div className="space-y-4 p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">{basics.fullName || activeProfile?.realName || activeProfile?.username}</h2>
                {basics.headline ? <p className="text-sm text-slate-400">{basics.headline}</p> : null}
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                  {basics.email ? <span>{basics.email}</span> : null}
                  {basics.phone ? <span>· {basics.phone}</span> : null}
                  {basics.city || basics.state ? <span>· {[basics.city, basics.state].filter(Boolean).join(', ')}</span> : null}
                </div>
              </div>
              {isOwnSocialContext && !isGuestPreview ? (
                <Link to="/settings" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:text-white" title="Edit resume in settings">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </Link>
              ) : null}
            </div>
            {resumeData.summary ? (
              <div className="rounded-xl border border-white/10 p-4">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Summary</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{resumeData.summary}</p>
              </div>
            ) : null}
            {Array.isArray(resumeData.experience) && resumeData.experience.length > 0 ? (
              <div className="rounded-xl border border-white/10 p-4">
                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Experience</h3>
                <div className="space-y-3">
                  {resumeData.experience.map((exp, i) => (
                    <div key={i} className="border-l-2 border-white/10 pl-3">
                      <p className="font-semibold text-sm text-white">{exp.title}</p>
                      <p className="text-xs text-slate-400">{exp.employer}{exp.location ? ` · ${exp.location}` : ''}</p>
                      <p className="text-[10px] text-slate-500">{exp.startDate ? new Date(exp.startDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''} – {exp.isCurrent ? 'Present' : (exp.endDate ? new Date(exp.endDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '')}</p>
                      {Array.isArray(exp.bullets) ? exp.bullets.map((b, j) => <p key={j} className="mt-1 text-xs text-slate-400">• {b}</p>) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {Array.isArray(resumeData.education) && resumeData.education.length > 0 ? (
              <div className="rounded-xl border border-white/10 p-4">
                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Education</h3>
                <div className="space-y-2">
                  {resumeData.education.map((edu, i) => (
                    <div key={i} className="border-l-2 border-white/10 pl-3">
                      <p className="font-semibold text-sm text-white">{edu.institution}</p>
                      <p className="text-xs text-slate-400">{edu.degree}{edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {Array.isArray(resumeData.skills) && resumeData.skills.length > 0 ? (
              <div className="rounded-xl border border-white/10 p-4">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {resumeData.skills.map((skill, i) => (
                    <span key={i} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-300">{skill}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      }
      case 'aboutme_panel': {
        const isOwnerView = isOwnSocialContext && !isGuestPreview;
        return (
          <div className="space-y-4 p-5">
            {isOwnerView && aboutMeEditing ? (
              <>
                <textarea value={aboutMeContent} onChange={(e) => setAboutMeContent(e.target.value)} placeholder="Tell visitors about yourself…" rows={8} maxLength={5000} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 resize-y" style={{ '--tw-ring-color': accentColor }} />
                <div className="flex gap-2">
                  <button type="button" onClick={handleAboutMeSave} disabled={aboutMeSaving} className="rounded-xl px-5 py-2 text-xs font-semibold text-white transition disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})` }}>{aboutMeSaving ? 'Saving…' : 'Save'}</button>
                  <button type="button" onClick={() => { setAboutMeEditing(false); setAboutMeContent(activeProfile?.socialPagePreferences?.aboutMeContent || ''); }} className="rounded-xl border border-white/10 px-4 py-2 text-xs text-slate-400 hover:text-white">Cancel</button>
                </div>
              </>
            ) : (
              <>
                {aboutMeContent ? (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{aboutMeContent}</div>
                ) : (
                  <p className="py-8 text-center text-sm text-slate-500">{isOwnerView ? 'Click edit to add your about me content.' : 'No about me content shared yet.'}</p>
                )}
                {isOwnerView ? (
                  <button type="button" onClick={() => setAboutMeEditing(true)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:text-white">
                    {aboutMeContent ? 'Edit' : 'Write About Me'}
                  </button>
                ) : null}
              </>
            )}
          </div>
        );
      }
      default:
        return <div className="text-sm text-slate-500">{SOCIAL_PANEL_LABELS[panelId] || panelId}</div>;
    }
  };

  const accentColor = socialPreferences.hero?.menuActiveColor || socialPreferences.globalStyles?.headerColor || '#3b82f6';
  const accentColor2 = socialPreferences.globalStyles?.headerColor || accentColor;
  const globalPageBackground = socialPreferences.globalStyles?.pageBackgroundColor || '#0d0d14';
  const globalPanelColor = socialPreferences.globalStyles?.panelColor || 'rgba(255, 255, 255, 0.06)';
  const globalFontColor = socialPreferences.globalStyles?.fontColor || '#e2e8f0';
  const hubFontFamily = socialPreferences.globalStyles?.fontFamily || socialPreferences.hero?.fontFamily || 'Inter';
  const hubSurfaceStyle = {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.45)',
    fontFamily: `"${hubFontFamily}", sans-serif`
  };
  const onlineFriends = friends.filter((friend) => {
    const status = String(friend?.presence?.status || '').toLowerCase();
    return status === 'online' || status === 'active' || friend?.presence?.isOnline;
  });
  const activePartnerFriend = friends.find((friend) => friend.partnerStatus === 'accepted');
  const incomingPartnerRequests = friends.filter((friend) => friend.partnerStatus === 'pending' && friend.partnerCanRespond);
  const outgoingPartnerRequest = friends.find((friend) => friend.partnerStatus === 'pending' && friend.partnerRequestedByViewer);
  const availablePartnerCandidates = friends.filter((friend) => friend.partnerStatus === 'none');
  const visiblePersonalInfoItems = useMemo(() => {
    if (isOwnSocialContext) {
      return PERSONAL_INFO_FIELDS.reduce((entries, field) => {
        const rawValue = normalizePersonalInfoFieldValue(currentUser, field.id);
        if (!rawValue) return entries;
        const visibility = currentUser?.profileFieldVisibility?.[field.id] === 'secure' ? 'secure' : 'social';
        entries.push({
          id: field.id,
          label: field.label,
          value: rawValue,
          visibility
        });
        return entries;
      }, []);
    }
    return Array.isArray(activeProfile?.personalInfo) ? activeProfile.personalInfo : [];
  }, [isOwnSocialContext, currentUser, activeProfile?.personalInfo]);
  const profileCompletionItems = useMemo(() => {
    if (!isOwnSocialContext || isGuestPreview) return [];

    const items = [];

    if (visiblePersonalInfoItems.length === 0) {
      items.push({
        id: 'details',
        eyebrow: 'Complete profile',
        title: 'Add a few details about yourself',
        description: 'Work, hobbies, or a small personal note will make this page feel more lived in.',
        actionLabel: 'Edit info'
      });
    }

    if (posts.length === 0) {
      items.push({
        id: 'post',
        eyebrow: 'Start the feed',
        title: 'Publish your first update',
        description: 'A short thought, status update, or pinned note is enough to warm up the timeline.',
        actionLabel: 'Open composer'
      });
    }

    if (galleryItems.length === 0) {
      items.push({
        id: 'gallery',
        eyebrow: 'Add visuals',
        title: 'Drop in a cover image or photo',
        description: 'A single image helps the page feel complete and gives the hero something to echo.',
        actionLabel: 'Open gallery'
      });
    }

    return items;
  }, [galleryItems.length, isGuestPreview, isOwnSocialContext, posts.length, visiblePersonalInfoItems.length]);
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hintsDisabled = window.localStorage.getItem(GENTLE_PROFILE_HINT_STORAGE_KEY) === '1';
    if (!isOwnSocialContext || isGuestPreview || profileCompletionItems.length === 0 || hintsDisabled) {
      setShowProfileCompletionHint(false);
      return;
    }

    setShowProfileCompletionHint(Math.random() < GENTLE_PROFILE_HINT_CHANCE);
  }, [activeProfile?._id, isGuestPreview, isOwnSocialContext, profileCompletionItems.length]);
  const liveTypingCount = Object.values(commentTypingByPostId).reduce((total, entry) => total + Object.keys(entry || {}).length, 0);
  const calendarCountdowns = posts.filter((post) => post?.interaction?.type === 'countdown').slice(0, 5);
  const calendarPreviewMonthDays = useMemo(
    () => buildCalendarPreviewMonthGrid(calendarPreviewAnchorDate),
    [calendarPreviewAnchorDate]
  );
  const calendarWeekDays = useMemo(
    () => buildCalendarWeekDays(calendarPreviewAnchorDate),
    [calendarPreviewAnchorDate]
  );
  const calendarPreviewYears = useMemo(
    () => Array.from(new Set(calendarPreviewMonthDays.map((day) => day.getFullYear()))),
    [calendarPreviewMonthDays]
  );
  const calendarPreviewHolidays = useMemo(
    () => calendarPreviewYears.flatMap((year) => buildHolidayEntriesForYear(year)),
    [calendarPreviewYears]
  );
  const calendarPreviewHolidaysByDay = useMemo(() => {
    const holidaysByDay = new Map();
    calendarPreviewHolidays.forEach((holiday) => {
      const list = holidaysByDay.get(holiday.dayKey) || [];
      holidaysByDay.set(holiday.dayKey, [...list, holiday]);
    });
    return holidaysByDay;
  }, [calendarPreviewHolidays]);
  const calendarPreviewEventCountByDay = useMemo(() => {
    const counts = new Map();
    calendarPreviewEvents.forEach((event) => {
      const startAt = new Date(event?.startAt);
      const endAt = new Date(event?.endAt || event?.startAt);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return;

      const cursor = new Date(startAt);
      cursor.setHours(0, 0, 0, 0);
      const endDay = new Date(endAt);
      endDay.setHours(0, 0, 0, 0);

      while (cursor <= endDay) {
        const key = formatCalendarDayKey(cursor);
        counts.set(key, (counts.get(key) || 0) + 1);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return counts;
  }, [calendarPreviewEvents]);
  const upcomingCalendarItems = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const upcomingEvents = calendarPreviewEvents
      .map((event) => {
        const startAt = new Date(event?.startAt);
        if (Number.isNaN(startAt.getTime())) return null;
        return {
          id: `event-${event._id || startAt.toISOString()}`,
          eventId: event?._id ? String(event._id) : '',
          title: event.title || 'Untitled event',
          date: startAt,
          type: 'event',
          location: event.location || '',
          dateLabel: startAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          timeLabel: startAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        };
      })
      .filter((entry) => entry && entry.date >= startOfToday);

    const upcomingHolidays = calendarPreviewHolidays
      .filter((holiday) => holiday.date >= startOfToday)
      .map((holiday) => ({
        id: holiday.id,
        title: holiday.name,
        date: holiday.date,
        type: holiday.category,
        location: '',
        dateLabel: holiday.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        timeLabel: 'All day'
      }));

    return [...upcomingEvents, ...upcomingHolidays]
      .sort((left, right) => left.date - right.date)
      .slice(0, MAX_UPCOMING_CALENDAR_ITEMS);
  }, [calendarPreviewEvents, calendarPreviewHolidays]);
  const navigateCalendarPreviewMonth = useCallback((monthOffset) => {
    setCalendarPreviewAnchorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + monthOffset, 1));
  }, []);

  const navigateCalendarPreviewWeek = useCallback((weekOffset) => {
    setCalendarPreviewAnchorDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + weekOffset * 7);
      return next;
    });
  }, []);

  const navigateCalendarPreviewDay = useCallback((dayOffset) => {
    setCalendarPreviewAnchorDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + dayOffset);
      return next;
    });
  }, []);

  const openCalendarCreateModal = useCallback((defaults = {}) => {
    const now = new Date();
    setCalendarEventModal({
      mode: 'create',
      title: '',
      startAt: toCalendarDateTimeLocalString(defaults.startAt || now),
      endAt: toCalendarDateTimeLocalString(defaults.endAt || new Date(now.getTime() + 60 * 60 * 1000)),
      location: ''
    });
  }, []);

  const openCalendarEditModal = useCallback((event) => {
    setCalendarEventModal({
      mode: 'edit',
      eventId: String(event._id),
      title: event.title || '',
      startAt: toCalendarDateTimeLocalString(event.startAt),
      endAt: toCalendarDateTimeLocalString(event.endAt || event.startAt),
      location: event.location || ''
    });
  }, []);

  const handleCalendarEventModalSave = async () => {
    if (!calendarEventModal) return;
    const { mode, eventId, title, startAt, endAt, location } = calendarEventModal;
    if (!title.trim()) return;
    setCalendarEventBusy(true);
    setCalendarPreviewError('');
    try {
      const payload = {
        title: title.trim(),
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        location: location.trim() || undefined
      };
      if (mode === 'create') {
        const { data } = await calendarAPI.createEvent(payload);
        if (data?.event) setCalendarPreviewEvents((prev) => [...prev, data.event]);
      } else if (mode === 'edit') {
        const { data } = await calendarAPI.updateEvent(eventId, payload);
        if (data?.event) {
          setCalendarPreviewEvents((prev) => prev.map((ev) => (String(ev._id) === eventId ? data.event : ev)));
        }
      }
      setCalendarEventModal(null);
    } catch (error) {
      setCalendarPreviewError(error.response?.data?.error || 'Failed to save event.');
    } finally {
      setCalendarEventBusy(false);
    }
  };

  const renderGlassPanel = (title, body, options = {}) => (
    <section
      className={`overflow-hidden rounded-[1.75rem] border shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl ${options.className || ''}`}
      style={{ ...hubSurfaceStyle, ...(options.style || {}) }}
    >
      <div className="border-b border-white/30 px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--social-text-muted)' }}>{title}</h2>
            {options.subtitle ? <p className="mt-1 text-sm" style={{ color: 'var(--social-text-muted)' }}>{options.subtitle}</p> : null}
          </div>
          {options.action}
        </div>
      </div>
      <div className="px-4 py-4 sm:px-5 sm:py-5">{body}</div>
    </section>
  );

  const renderSoftEmptyState = ({ iconType, title, description, actionLabel, onAction, tone = 'blue' }) => {
    const toneStyle = SURFACE_TONE_STYLES[tone] || SURFACE_TONE_STYLES.blue;

    const iconPaths = {
      compose: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10',
      image: 'm2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z',
      default: 'M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z',
    };
    const path = iconPaths[iconType] || iconPaths.default;

    return (
      <div className="flex flex-col items-center rounded-[1.5rem] border px-6 py-10 text-center" style={{ background: 'var(--bg-panel)', borderColor: 'color-mix(in srgb, var(--social-text-muted) 20%, transparent)' }}>
        <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full ${toneStyle.iconBg}`}>
          <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke={toneStyle.iconStroke} strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={path} />
          </svg>
        </div>
        <p className="text-lg font-semibold" style={{ color: 'var(--social-text-primary)' }}>{title}</p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed" style={{ color: 'var(--social-text-muted)' }}>{description}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className={`mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm transition ${toneStyle.primaryButton}`}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    );
  };

  const renderPrivateProfileBody = () => (
    <div className="space-y-4 text-sm text-slate-700">
      <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-900 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Private profile</p>
        <p className="mt-2 text-base font-semibold">Only limited identity details are visible to visitors.</p>
        <p className="mt-2 text-sm text-amber-800">Posts, gallery media, calendar activity, and network panels stay locked until the owner decides to share more.</p>
      </div>
      <div className="space-y-3 rounded-3xl border border-slate-200 bg-white/70 px-4 py-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-4">
            <div className="h-3 w-24 rounded-full bg-slate-200" />
            <div className="mt-3 h-3 w-full rounded-full bg-slate-200" />
            <div className="mt-2 h-3 w-3/4 rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );

  const renderSharedDesignCard = !isOwnSocialContext && isAuthenticated && sharedDesigns.length > 0
    ? renderGlassPanel(
      'Shared Design',
      <div className="space-y-3 text-sm text-slate-700">
        <p>@{requestedProfileIdentifier} shared a public style pack.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => toggleFavoriteSharedDesign(sharedDesigns[0])} className="rounded-2xl border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50">{sharedDesigns[0]?.isFavorite ? 'Unfavorite' : 'Favorite'}</button>
          <button type="button" onClick={() => cloneSharedDesign(sharedDesigns[0], `${sharedDesigns[0]?.name || 'Shared design'} Clone`, false)} className="rounded-2xl border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50">Clone</button>
        </div>
      </div>
    )
    : null;

  const renderCenterStage = () => {
    if (isPrivateGuestLock) {
      return renderGlassPanel('Private Stage', renderPrivateProfileBody(), {
        subtitle: 'Guest access is limited by this account\'s privacy settings'
      });
    }

    switch (activeHeroTab) {
      case 'friends':
        return renderGlassPanel('Circles', renderPanelBody('circles'), {
          subtitle: 'Expanded circles and trusted groups'
        });
      case 'gallery':
        return renderGlassPanel('Gallery', renderPanelBody('gallery'), {
          subtitle: null
        });
      case 'chat':
        return renderGlassPanel('Chat', renderPanelBody('chat_panel'), {
          subtitle: null
        });
      case 'calendar':
        return renderGlassPanel(
          'Calendar',
          <div data-testid="social-calendar-preview-shell" className="mx-auto w-full max-w-3xl space-y-4 overflow-y-auto pr-1 text-sm [scrollbar-gutter:stable] sm:max-h-[44rem]" style={{ color: 'var(--social-text-secondary)' }}>
            {/* Header bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3" style={{ background: 'var(--bg-panel)', backdropFilter: 'blur(var(--panel-blur))' }}>
              <div className="flex items-center gap-2">
                {/* View type toggles */}
                <div className="flex rounded-xl border border-white/10 p-0.5" style={{ background: 'var(--social-surface-muted)' }}>
                  {[
                    { key: 'monthly', label: 'Month' },
                    { key: 'weekly', label: 'Week' },
                    { key: 'hourly', label: 'Day' }
                  ].map((view) => (
                    <button
                      key={view.key}
                      type="button"
                      onClick={() => setCalendarViewType(view.key)}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                        calendarViewType === view.key
                          ? 'text-white shadow-sm'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                      style={calendarViewType === view.key ? { backgroundColor: 'var(--accent)' } : undefined}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isOwnSocialContext && !isGuestPreview ? (
                  <button
                    type="button"
                    onClick={() => openCalendarCreateModal()}
                    className="rounded-2xl px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90" style={{ backgroundColor: 'var(--accent)' }}
                  >
                    + New event
                  </button>
                ) : null}
                <Link to={socialCalendarPath} className="rounded-2xl border border-white/10 px-3 py-1.5 text-xs font-semibold opacity-70 hover:opacity-100" style={{ background: 'var(--social-surface-muted)' }}>
                  Full calendar
                </Link>
              </div>
            </div>

            {/* Event create/edit modal */}
            {calendarEventModal && isOwnSocialContext && !isGuestPreview ? (
              <div className="rounded-2xl border border-white/10 p-4 shadow-sm" style={{ background: 'var(--bg-panel)', backdropFilter: 'blur(var(--panel-blur))' }}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">{calendarEventModal.mode === 'create' ? 'New event' : 'Edit event'}</p>
                  <button
                    type="button"
                    onClick={() => setCalendarEventModal(null)}
                    className="rounded-full border border-white/10 px-2 py-0.5 text-xs opacity-60 hover:opacity-100"
                  >
                    Cancel
                  </button>
                </div>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={calendarEventModal.title}
                    onChange={(event) => setCalendarEventModal((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Event title *"
                    maxLength={200}
                    className="w-full rounded-xl border border-white/10 px-3 py-1.5 text-sm focus:outline-none focus:ring-2" style={{ background: 'rgba(255,255,255,0.06)', '--tw-ring-color': 'var(--accent)' }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide opacity-50">Start</label>
                      <input
                        type="datetime-local"
                        value={calendarEventModal.startAt}
                        onChange={(event) => setCalendarEventModal((prev) => ({ ...prev, startAt: event.target.value }))}
                        className="w-full rounded-xl border border-white/10 px-2 py-1.5 text-xs focus:outline-none focus:ring-2" style={{ background: 'rgba(255,255,255,0.06)', '--tw-ring-color': 'var(--accent)' }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide opacity-50">End</label>
                      <input
                        type="datetime-local"
                        value={calendarEventModal.endAt}
                        onChange={(event) => setCalendarEventModal((prev) => ({ ...prev, endAt: event.target.value }))}
                        className="w-full rounded-xl border border-white/10 px-2 py-1.5 text-xs focus:outline-none focus:ring-2" style={{ background: 'rgba(255,255,255,0.06)', '--tw-ring-color': 'var(--accent)' }}
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={calendarEventModal.location}
                    onChange={(event) => setCalendarEventModal((prev) => ({ ...prev, location: event.target.value }))}
                    placeholder="Location (optional)"
                    maxLength={200}
                    className="w-full rounded-xl border border-white/10 px-3 py-1.5 text-sm focus:outline-none focus:ring-2" style={{ background: 'rgba(255,255,255,0.06)', '--tw-ring-color': 'var(--accent)' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCalendarEventModalSave}
                  disabled={calendarEventBusy || !calendarEventModal.title.trim()}
                  className="mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: 'var(--accent)' }}
                >
                  {calendarEventBusy ? 'Saving…' : (calendarEventModal.mode === 'create' ? 'Create event' : 'Save changes')}
                </button>
              </div>
            ) : null}

            {calendarPreviewError ? (
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">{calendarPreviewError}</div>
            ) : null}

            {/* Monthly view */}
            {calendarViewType === 'monthly' ? (
              <div className="rounded-2xl p-3" style={{ background: 'var(--bg-panel)', backdropFilter: 'blur(var(--panel-blur))' }}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigateCalendarPreviewMonth(-1)}
                      className="rounded-full border border-white/10 px-2 py-1 text-xs opacity-60 hover:opacity-100"
                      aria-label="Previous month"
                    >
                      ←
                    </button>
                    <p className="text-sm font-semibold">
                      {calendarPreviewAnchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigateCalendarPreviewMonth(1)}
                      className="rounded-full border border-white/10 px-2 py-1 text-xs opacity-60 hover:opacity-100"
                      aria-label="Next month"
                    >
                      →
                    </button>
                  </div>
                  <span role="status" aria-live="polite" className="text-xs opacity-50">
                    {calendarPreviewLoading ? 'Loading…' : 'Live'}
                  </span>
                </div>
                {!isOwnSocialContext && !calendarPreviewShowsOwnerEvents ? (
                  <div className="mb-3 rounded-xl border border-white/10 px-3 py-2 text-xs opacity-60">
                    Owner setting: {calendarPreviewOwnerVisibility === 'friends_readonly' ? 'Friends only' : 'Private'}.
                  </div>
                ) : null}
                <div data-testid="social-calendar-preview-grid" className="mt-3">
                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide opacity-50">
                    {CALENDAR_PREVIEW_WEEKDAY_LABELS.map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {calendarPreviewMonthDays.map((day) => {
                      const inMonth = day.getMonth() === calendarPreviewAnchorDate.getMonth();
                      const dayKey = formatCalendarDayKey(day);
                      const eventCount = calendarPreviewEventCountByDay.get(dayKey) || 0;
                      const holidays = calendarPreviewHolidaysByDay.get(dayKey) || [];
                      const isToday = formatCalendarDayKey(day) === formatCalendarDayKey(new Date());
                      return (
                        <button
                          key={dayKey}
                          type="button"
                          onClick={() => {
                            if (isOwnSocialContext && !isGuestPreview) {
                              const start = new Date(day);
                              start.setHours(9, 0, 0, 0);
                              openCalendarCreateModal({ startAt: start, endAt: new Date(start.getTime() + 60 * 60 * 1000) });
                            }
                          }}
                          className={`rounded-lg border px-1 py-1 text-center text-xs transition ${
                            isToday
                              ? 'font-bold ring-1'
                              : inMonth
                                ? 'border-white/10 hover:border-white/20'
                                : 'border-transparent opacity-30'
                          }`}
                          style={isToday ? { borderColor: 'var(--accent)', backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', '--tw-ring-color': 'var(--accent)' } : { background: inMonth ? 'var(--social-surface-soft)' : 'transparent' }}
                          title={holidays.map((holiday) => holiday.name).join(', ')}
                        >
                          <p>{day.getDate()}</p>
                          {eventCount > 0 ? (
                            <p className="mt-0.5 text-[10px] font-semibold" style={{ color: accentColor }}>
                              {eventCount}
                            </p>
                          ) : holidays.length > 0 ? (
                            <p className="mt-0.5 text-[10px] font-semibold text-rose-400">
                              ★
                            </p>
                          ) : (
                            <span className="mt-0.5 block h-[12px]" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Weekly view */}
            {calendarViewType === 'weekly' ? (
              <div className="rounded-2xl p-3" style={{ background: 'var(--bg-panel)', backdropFilter: 'blur(var(--panel-blur))' }}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigateCalendarPreviewWeek(-1)}
                      className="rounded-full border border-white/10 px-2 py-1 text-xs opacity-60 hover:opacity-100"
                      aria-label="Previous week"
                    >
                      ←
                    </button>
                    <p className="text-sm font-semibold">
                      {calendarWeekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      {' – '}
                      {calendarWeekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigateCalendarPreviewWeek(1)}
                      className="rounded-full border border-white/10 px-2 py-1 text-xs opacity-60 hover:opacity-100"
                      aria-label="Next week"
                    >
                      →
                    </button>
                  </div>
                  <span role="status" aria-live="polite" className="text-xs opacity-50">
                    {calendarPreviewLoading ? 'Loading…' : 'Live'}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarWeekDays.map((day) => {
                    const dayKey = formatCalendarDayKey(day);
                    const isToday = dayKey === formatCalendarDayKey(new Date());
                    const dayEvents = calendarPreviewEvents.filter((ev) => {
                      const evStart = new Date(ev?.startAt);
                      const evEnd = new Date(ev?.endAt || ev?.startAt);
                      const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
                      const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
                      return !Number.isNaN(evStart.getTime()) && evStart <= dayEnd && evEnd >= dayStart;
                    });
                    const holidays = calendarPreviewHolidaysByDay.get(dayKey) || [];
                    return (
                      <div key={dayKey} className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (isOwnSocialContext && !isGuestPreview) {
                              const start = new Date(day);
                              start.setHours(9, 0, 0, 0);
                              openCalendarCreateModal({ startAt: start, endAt: new Date(start.getTime() + 60 * 60 * 1000) });
                            }
                          }}
                          className={`rounded-lg border px-1 py-1.5 text-center text-xs font-semibold transition ${
                            isToday
                              ? 'text-white'
                              : 'border-white/10 hover:border-white/20'
                          }`}
                          style={isToday ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent)' } : { background: 'var(--social-surface-soft)' }}
                        >
                          <p className="text-[10px] uppercase tracking-wide">{CALENDAR_PREVIEW_WEEKDAY_LABELS[day.getDay()]}</p>
                          <p>{day.getDate()}</p>
                        </button>
                        <div className="space-y-0.5 overflow-hidden">
                          {holidays.slice(0, 1).map((holiday) => (
                            <div key={holiday.id} className="truncate rounded-md bg-rose-500/15 px-1 py-0.5 text-[10px] font-semibold text-rose-400">
                              {holiday.name.replace(/^US:\s*/, '')}
                            </div>
                          ))}
                          {dayEvents.slice(0, 3).map((ev) => (
                            <button
                              key={String(ev._id)}
                              type="button"
                              onClick={() => isOwnSocialContext && !isGuestPreview && openCalendarEditModal(ev)}
                              className="w-full truncate rounded-md px-1 py-0.5 text-left text-[10px] font-semibold text-white transition hover:opacity-80"
                              style={{ backgroundColor: accentColor }}
                            >
                              {ev.title}
                            </button>
                          ))}
                          {dayEvents.length > 3 ? (
                            <p className="text-center text-[10px] opacity-50">+{dayEvents.length - 3}</p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Hourly / Day view */}
            {calendarViewType === 'hourly' ? (
              <div className="rounded-2xl p-3" style={{ background: 'var(--bg-panel)', backdropFilter: 'blur(var(--panel-blur))' }}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigateCalendarPreviewDay(-1)}
                      className="rounded-full border border-white/10 px-2 py-1 text-xs opacity-60 hover:opacity-100"
                      aria-label="Previous day"
                    >
                      ←
                    </button>
                    <p className="text-sm font-semibold">
                      {calendarPreviewAnchorDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigateCalendarPreviewDay(1)}
                      className="rounded-full border border-white/10 px-2 py-1 text-xs opacity-60 hover:opacity-100"
                      aria-label="Next day"
                    >
                      →
                    </button>
                  </div>
                  <span role="status" aria-live="polite" className="text-xs opacity-50">
                    {calendarPreviewLoading ? 'Loading…' : 'Live'}
                  </span>
                </div>
                <div className="max-h-[26rem] space-y-0.5 overflow-y-auto [scrollbar-gutter:stable]">
                  {CALENDAR_HOUR_LABELS.map((hourLabel, hourIndex) => {
                    const hourStart = new Date(calendarPreviewAnchorDate);
                    hourStart.setHours(hourIndex, 0, 0, 0);
                    const hourEnd = new Date(calendarPreviewAnchorDate);
                    hourEnd.setHours(hourIndex, 59, 59, 999);
                    const hourEvents = calendarPreviewEvents.filter((ev) => {
                      const evStart = new Date(ev?.startAt);
                      const evEnd = new Date(ev?.endAt || ev?.startAt);
                      return !Number.isNaN(evStart.getTime()) && evStart <= hourEnd && evEnd >= hourStart;
                    });
                    const isCurrentHour = new Date().getHours() === hourIndex
                      && formatCalendarDayKey(calendarPreviewAnchorDate) === formatCalendarDayKey(new Date());
                    return (
                      <button
                        key={hourLabel}
                        type="button"
                        onClick={() => {
                          if (isOwnSocialContext && !isGuestPreview) {
                            openCalendarCreateModal({ startAt: hourStart, endAt: new Date(hourStart.getTime() + 60 * 60 * 1000) });
                          }
                        }}
                        className={`flex w-full items-start gap-3 rounded-lg border px-2 py-1.5 text-left transition ${
                          isCurrentHour
                            ? 'ring-1'
                            : hourEvents.length > 0
                              ? 'border-white/10'
                              : 'border-transparent hover:border-white/10'
                        }`}
                        style={isCurrentHour ? { borderColor: 'var(--accent)', backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)', '--tw-ring-color': 'var(--accent)' } : { background: hourEvents.length > 0 ? 'var(--social-surface-soft)' : 'var(--social-surface-muted)' }}
                      >
                        <span className="w-14 shrink-0 text-[11px] font-semibold opacity-40">{hourLabel}</span>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          {hourEvents.map((ev) => (
                            <div
                              key={String(ev._id)}
                              onClick={(e) => { e.stopPropagation(); if (isOwnSocialContext && !isGuestPreview) openCalendarEditModal(ev); }}
                              className="flex items-center justify-between gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-white"
                              style={{ backgroundColor: accentColor }}
                            >
                              <span className="truncate">{ev.title}</span>
                              {ev.location ? <span className="shrink-0 text-[10px] opacity-80">📍</span> : null}
                            </div>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Upcoming events list (monthly view only) */}
            {calendarViewType === 'monthly' ? (
              <div className="space-y-2 rounded-xl px-3 py-3" style={{ background: 'var(--bg-panel)', backdropFilter: 'blur(var(--panel-blur))' }}>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Upcoming</p>
                {upcomingCalendarItems.length === 0 ? (
                  <div className="flex flex-col items-center py-4 text-center">
                    <svg className="mb-1.5 h-6 w-6 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                    <p className="text-xs opacity-40">No upcoming events in this window.</p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {upcomingCalendarItems.map((item) => (
                      <li key={item.id}>
                        {item.type === 'event' ? (
                          <div className="group flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-xs transition hover:border-white/20" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <Link
                              to={socialCalendarPath}
                              data-testid={`social-upcoming-${item.id}`}
                              className="min-w-0 flex-1"
                            >
                              <p className="truncate font-semibold">{item.title}</p>
                              <p className="mt-0.5 truncate text-[11px] opacity-50">{item.dateLabel} • {item.timeLabel}</p>
                              {item.location ? <p className="mt-0.5 truncate text-[11px] opacity-50">📍 {item.location}</p> : null}
                            </Link>
                            <div className="flex shrink-0 items-center gap-1">
                              <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ backgroundColor: 'var(--accent)' }}>Event</span>
                              {isOwnSocialContext && !isGuestPreview && item.eventId ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const ev = calendarPreviewEvents.find((e) => String(e._id) === item.eventId);
                                      if (ev) openCalendarEditModal(ev);
                                    }}
                                    className="rounded-full border border-white/10 px-2 py-0.5 font-semibold opacity-60 hover:opacity-100"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCalendarEvent(item.eventId)}
                                    className="rounded-full border border-red-400/30 px-2 py-0.5 font-semibold text-red-400 hover:bg-red-500/10"
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold">{item.title}</p>
                              <p className="mt-0.5 truncate text-[11px] opacity-50">{item.dateLabel} • {item.timeLabel}</p>
                            </div>
                            <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 font-semibold text-rose-400">Holiday</span>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>,
          { subtitle: null }
        );
      case 'blog': {
        const isBlogEnabled = enabledSections.blog;
        if (!isBlogEnabled && isOwnSocialContext && !isGuestPreview) {
          return renderGlassPanel('Blog', (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
                <svg className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-300">Blog</h3>
              <p className="mt-1 text-sm text-slate-500">Create and share blog posts with your visitors.</p>
              <button type="button" onClick={() => handleToggleSection('blog')} className="mt-4 rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})` }}>
                Enable Blog
              </button>
            </div>
          ), { subtitle: 'Not yet enabled' });
        }
        if (!isBlogEnabled) return null;
        return renderGlassPanel('Blog', renderPanelBody('blog_panel'), { subtitle: 'Posts and articles' });
      }
      case 'resume': {
        const isResumeEnabled = enabledSections.resume;
        if (!isResumeEnabled && isOwnSocialContext && !isGuestPreview) {
          return renderGlassPanel('Resume', (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
                <svg className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-300">Resume</h3>
              <p className="mt-1 text-sm text-slate-500">Show your professional resume to visitors.</p>
              <button type="button" onClick={() => handleToggleSection('resume')} className="mt-4 rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})` }}>
                Enable Resume
              </button>
            </div>
          ), { subtitle: 'Not yet enabled' });
        }
        if (!isResumeEnabled) return null;
        return renderGlassPanel('Resume', renderPanelBody('resume_panel'), { subtitle: 'Professional profile' });
      }
      case 'aboutme': {
        const isAboutMeEnabled = enabledSections.aboutme;
        if (!isAboutMeEnabled && isOwnSocialContext && !isGuestPreview) {
          return renderGlassPanel('About Me', (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
                <svg className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-300">About Me</h3>
              <p className="mt-1 text-sm text-slate-500">Share more about yourself with your visitors.</p>
              <button type="button" onClick={() => handleToggleSection('aboutme')} className="mt-4 rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})` }}>
                Enable About Me
              </button>
            </div>
          ), { subtitle: 'Not yet enabled' });
        }
        if (!isAboutMeEnabled) return null;
        return renderGlassPanel('About Me', renderPanelBody('aboutme_panel'), { subtitle: 'Personal introduction' });
      }
      case 'main':
      default:
        return (
          <div className="space-y-6">
            {renderProfileCompletionHint()}
            {ownerEditingEnabled && !isGuestPreview && composerVisible ? (
              renderGlassPanel('Composer', renderPanelBody('composer'), {
                subtitle: 'Share an update to the center stage',
                action: (
                  <button
                    type="button"
                    onClick={() => setComposerVisible(false)}
                    className="rounded-2xl border px-3 py-1.5 text-xs font-semibold"
                    style={{ borderColor: 'color-mix(in srgb, var(--social-text-muted) 30%, transparent)', color: 'var(--social-text-secondary)' }}
                  >
                    Hide
                  </button>
                )
              })
            ) : null}
            {ownerEditingEnabled && !isGuestPreview && !composerVisible ? (
              <button
                type="button"
                onClick={() => setComposerVisible(true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-slate-400 transition-all hover:border-white/20 hover:bg-white/[0.03] hover:text-slate-300"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})` }}>+</span>
                <span className="font-medium">Compose a new post</span>
              </button>
            ) : null}
            {renderGlassPanel('Feed', renderPanelBody('timeline'))}
            {renderGlassPanel('Gallery', renderPanelBody('gallery'))}
          </div>
        );
    }
  };

  const renderFriendAvatar = (friend, sizeClass = 'h-14 w-14') => (
    <div className={`flex ${sizeClass} items-center justify-center overflow-hidden rounded-[1rem] bg-slate-200 text-sm font-semibold text-slate-700`}>
      {friend?.avatarUrl ? (
        <img src={friend.avatarUrl} alt={friend.username || 'friend'} className="h-full w-full object-cover" />
      ) : (
        (friend?.realName || friend?.username || '?').charAt(0).toUpperCase()
      )}
    </div>
  );

  const renderPulseRail = () => (
    <div className="space-y-6">
      {isPrivateGuestLock ? renderGlassPanel('Access Locked', renderPrivateProfileBody(), {
        subtitle: 'Pulse, live activity, and messaging stay hidden while this profile is private'
      }) : null}
    </div>
  );

  const renderProfileCompletionHint = () => {
    if (!showProfileCompletionHint || profileCompletionItems.length === 0) {
      return null;
    }

    return (
      <section className="rounded-[1.5rem] border border-amber-200/80 bg-white/88 p-4 shadow-[0_0_0_1px_rgba(253,230,138,0.72),0_18px_48px_rgba(245,158,11,0.16)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-amber-700">Gentle nudge</p>
            <p className="mt-2 text-base font-semibold text-slate-900">A couple of small touches would make this page feel complete.</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">These are optional. You can ignore them, hide this hint for now, or stop seeing it entirely.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => dismissProfileCompletionHint(false)}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => dismissProfileCompletionHint(true)}
              className="rounded-full border border-amber-200 px-3 py-1.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-50"
            >
              Do not show again
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {profileCompletionItems.slice(0, 3).map((item) => (
            <div key={item.id} className="rounded-[1.25rem] border border-white/80 bg-white/95 p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{item.eyebrow}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              <button
                type="button"
                onClick={() => handleProfileCompletionAction(item.id)}
                className="mt-4 rounded-full border border-sky-200 px-3 py-1.5 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-50"
              >
                {item.actionLabel}
              </button>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const bodyBgImage = resolveUploadMediaUrl(socialPreferences.globalStyles?.bodyBackgroundImage || '');
  const bodyBgOverlay = socialPreferences.globalStyles?.bodyBackgroundOverlay || 0;
  const bodyBgGrain = socialPreferences.globalStyles?.bodyBackgroundGrain || 0;
  const bodyBgBlur = socialPreferences.globalStyles?.bodyBackgroundBlur || 0;
  const bodyBgDisplayMode = socialPreferences.globalStyles?.bodyBackgroundDisplayMode || 'cover';
  const bodyBgOverlayAnimation = socialPreferences.globalStyles?.bodyBackgroundOverlayAnimation || 'none';

  const bodyBgStyles = (() => {
    if (!bodyBgImage) return {};
    const base = { backgroundImage: `url(${bodyBgImage})` };
    if (bodyBgDisplayMode === 'repeat') {
      return { ...base, backgroundRepeat: 'repeat', backgroundSize: 'auto', backgroundPosition: 'top left' };
    }
    if (bodyBgDisplayMode === 'fixed') {
      return { ...base, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' };
    }
    return { ...base, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' };
  })();

  const cssCustomProperties = {
    '--accent': accentColor,
    '--accent2': accentColor2,
    '--bg-base': globalPageBackground,
    '--bg-panel': globalPanelColor,
    '--social-text-primary': globalFontColor,
    '--social-text-secondary': `color-mix(in srgb, ${globalFontColor} 78%, ${globalPageBackground} 22%)`,
    '--social-text-muted': `color-mix(in srgb, ${globalFontColor} 56%, ${globalPageBackground} 44%)`,
    '--social-surface-soft': `color-mix(in srgb, ${globalPanelColor} 90%, ${globalPageBackground} 10%)`,
    '--social-surface-muted': `color-mix(in srgb, ${globalPanelColor} 80%, ${globalPageBackground} 20%)`,
    '--panel-blur': '16px',
    '--radius-md': '16px',
    backgroundColor: globalPageBackground,
    fontFamily: `"${hubFontFamily}", "DM Sans", sans-serif`,
    color: globalFontColor
  };

  return (
    <div
      className={`relative min-h-screen w-full ${pageThemeClass}`}
      style={cssCustomProperties}
    >
      {bodyBgImage ? (
        <>
          <div className="pointer-events-none fixed inset-0 z-0" style={{ ...bodyBgStyles, filter: bodyBgBlur ? `blur(${bodyBgBlur}px)` : undefined, transform: bodyBgBlur ? 'scale(1.05)' : undefined }} />
          {bodyBgOverlay > 0 ? <div className="pointer-events-none fixed inset-0 z-0" style={{ backgroundColor: `rgba(0,0,0,${bodyBgOverlay})` }} /> : null}
          {bodyBgGrain > 0 ? <div className="pointer-events-none fixed inset-0 z-0" style={{ opacity: bodyBgGrain, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.5\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat', backgroundSize: '128px 128px' }} /> : null}
        </>
      ) : null}
      {bodyBgOverlayAnimation !== 'none' ? (
        <div className="pointer-events-none fixed inset-0 z-[5] overflow-hidden" aria-hidden="true" data-testid="overlay-animation">
          <style>{`
            @keyframes socialBgFall { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(110vh) rotate(360deg); opacity: 0.3; } }
            @keyframes socialBgFloat { 0% { transform: translateY(110vh) scale(0.8); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(-10vh) scale(1.2); opacity: 0; } }
            @keyframes socialBgBurst { 0% { transform: scale(0) translateY(0); opacity: 1; } 50% { opacity: 1; } 100% { transform: scale(1.5) translateY(-30vh); opacity: 0; } }
            .social-overlay-particle { position: absolute; animation-timing-function: linear; animation-iteration-count: infinite; will-change: transform; }
          `}</style>
          {Array.from({ length: 12 }).map((_, i) => {
            const left = `${(i * 8.3) % 100}%`;
            const delay = `${(i * 1.7) % 8}s`;
            const dur = `${6 + (i % 5) * 2}s`;
            const size = 12 + (i % 4) * 4;
            const overlayMap = {
              snow: { char: '❄', anim: 'socialBgFall' },
              'easter-eggs': { char: '🥚', anim: 'socialBgFall' },
              'halloween-ghosts': { char: '👻', anim: 'socialBgFloat' },
              'valentines-hearts': { char: '💕', anim: 'socialBgFloat' },
              fireworks: { char: '✦', anim: 'socialBgBurst' }
            };
            const cfg = overlayMap[bodyBgOverlayAnimation] || overlayMap.snow;
            return (
              <span
                key={i}
                className="social-overlay-particle"
                style={{ left, top: cfg.anim === 'socialBgFloat' ? 'auto' : '-5%', bottom: cfg.anim === 'socialBgFloat' ? '-5%' : 'auto', fontSize: `${size}px`, animationName: cfg.anim, animationDuration: dur, animationDelay: delay, opacity: 0.7 }}
              >
                {cfg.char}
              </span>
            );
          })}
        </div>
      ) : null}
      <div className="relative z-10">
      {/* Guest Preview Notice */}
      {isGuestPreview ? (
        <GuestPreviewNotice
          sectionId="social-guest-preview"
          isGuestPreview={isGuestPreview}
          onExitPreview={() => setIsGuestPreview(false)}
        />
      ) : null}

      {/* Slim header for scroll (existing) */}
      {showSlimHeader ? (
        <div className="fixed inset-x-0 top-16 z-40 hidden lg:block">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex items-center justify-between gap-4 rounded-b-2xl border border-white/10 px-4 py-3 text-white shadow-lg" style={{ background: 'rgba(13,13,20,0.92)', backdropFilter: 'blur(20px)' }}>
              <p className="truncate text-sm font-semibold">{heroProfile?.name || activeProfile?.realName || activeProfile?.username || 'Social'}</p>
              <div className="flex items-center gap-1">
                {visibleHeroTabs.map((tab) => (
                  <button
                    key={`slim-tab-${tab.id}`}
                    type="button"
                    onClick={() => handleHeroTabChange(tab.id)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${activeHeroTab === tab.id ? 'text-white' : 'text-slate-400 hover:text-white'}`}
                    style={activeHeroTab === tab.id ? { background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})` } : undefined}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Hero Section */}
      <div className="w-full">
        <SocialHero
          profile={heroProfile}
          heroConfig={heroConfig}
          activeTab={activeHeroTab}
          onTabChange={handleHeroTabChange}
          isMobile={isMobile}
          isEditing={ownerEditingEnabled}
          onEditClick={() => setDesignStudioOpen(true)}
          activitySummary={heroOverlayActivity}
          onMobileMenuToggle={setHeroOverlayOpen}
          enableMobileLauncher={false}
          visibleTabs={visibleHeroTabs}
          enabledSections={enabledSections}
          isGuestPreview={isGuestPreview}
          onGuestPreviewToggle={ownerEditingEnabled ? handleGuestPreviewToggle : undefined}
        />
      </div>

      {/* Main Two-Column Layout */}
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6">
        <div className="grid grid-cols-1 gap-6" style={{ gridTemplateColumns: isMobile ? '1fr' : '300px minmax(0, 1fr)' }}>
          {/* Main Content Area */}
          <main className="min-w-0 space-y-6">
            {!isAuthenticated ? renderGlassPanel('Guest Access', renderPanelBody('guest_lookup'), {
              subtitle: 'Load a public profile by username or user ID'
            }) : null}
            {renderCenterStage()}
          </main>

          {/* Left Sidebar (rendered as right on DOM for visual order, but on mobile it stacks below) */}
          <aside ref={socialSidebarRef} className="space-y-5" style={isMobile ? {} : { order: -1 }}>
            {/* About Panel */}
            {!isPrivateGuestLock ? (
              <div className="overflow-hidden rounded-2xl border border-white/[0.06]" style={{ background: 'var(--bg-panel)', backdropFilter: 'blur(var(--panel-blur))' }}>
                <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor2})` }} />
                <div className="px-4 py-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--social-text-muted)' }}>About</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--social-text-secondary)' }}>
                    {activeProfile?.bio || activeProfile?.tagline || <span className="italic" style={{ color: 'var(--social-text-muted)' }}>No bio shared yet.</span>}
                  </p>
                </div>
              </div>
            ) : null}

            {/* Details Panel */}
            {!isPrivateGuestLock ? (
              <div className="overflow-hidden rounded-2xl border border-white/[0.06]" style={{ background: 'var(--bg-panel)', backdropFilter: 'blur(var(--panel-blur))' }}>
                <div className="px-4 py-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--social-text-muted)' }}>Details</h3>
                  <div className="mt-3 space-y-2.5">
                    {activeProfile?.location ? <div className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--social-text-secondary)' }}><span className="flex h-6 w-6 items-center justify-center rounded-lg text-xs" style={{ background: `${accentColor}15` }}>📍</span>{activeProfile.location}</div> : null}
                    {activeProfile?.website ? <div className="flex items-center gap-2.5 text-sm"><span className="flex h-6 w-6 items-center justify-center rounded-lg text-xs" style={{ background: `${accentColor}15` }}>🌐</span><a href={activeProfile.website} target="_blank" rel="noopener noreferrer" className="truncate hover:underline" style={{ color: accentColor }}>{activeProfile.website}</a></div> : null}
                    {activeProfile?.pronouns ? <div className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--social-text-secondary)' }}><span className="flex h-6 w-6 items-center justify-center rounded-lg text-xs" style={{ background: `${accentColor}15` }}>💬</span>{activeProfile.pronouns}</div> : null}
                    {activeProfile?.createdAt ? <div className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--social-text-secondary)' }}><span className="flex h-6 w-6 items-center justify-center rounded-lg text-xs" style={{ background: `${accentColor}15` }}>📅</span>Joined {new Date(activeProfile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div> : null}
                    {ownerResumeMeta ? <div className="flex items-center gap-2.5 text-sm"><span className="flex h-6 w-6 items-center justify-center rounded-lg text-xs" style={{ background: `${accentColor}15` }}>📄</span><Link to={`/resume/${activeProfile?.username}`} className="hover:underline" style={{ color: accentColor }}>View Resume</Link></div> : null}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Top Friends Widget */}
            {!isPrivateGuestLock ? (
              <div className="overflow-hidden rounded-2xl border border-white/[0.06]" style={{ background: 'var(--bg-panel)', backdropFilter: 'blur(var(--panel-blur))' }}>
                <div className="px-4 py-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--social-text-muted)' }}>Top Friends</h3>
                  <div className="mt-3">
                    {topFriends.length > 0 ? (
                      <div className="grid grid-cols-5 gap-2">
                        {topFriends.slice(0, 5).map((friend) => (
                          <Link key={friend._id} to={`/social?user=${friend.username}`} className="group flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-colors hover:bg-white/5">
                            <div className="relative">
                              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full ring-2 ring-white/10 text-xs font-semibold text-white transition-all group-hover:ring-white/25" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})` }}>
                                {friend.avatarUrl ? <img src={friend.avatarUrl} alt={friend.username} className="h-full w-full object-cover" /> : (friend.realName || friend.username || '?').charAt(0).toUpperCase()}
                              </div>
                              <PresenceIndicator presence={friend.presence} />
                            </div>
                            <span className="truncate text-[10px]" style={{ color: 'var(--social-text-muted)' }}>{friend.realName || friend.username}</span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm" style={{ color: 'var(--social-text-muted)' }}>No top friends configured.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Partner / Spouse Panel */}
            {!isPrivateGuestLock ? (
              <div className="overflow-hidden rounded-2xl border border-white/[0.06]" style={{ background: 'var(--bg-panel)', backdropFilter: 'blur(var(--panel-blur))' }}>
                <div className="px-4 py-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--social-text-muted)' }}>Partner / Spouse</h3>
                  <div className="mt-3">
                    {activePartnerFriend ? (
                      <Link to={`/social?user=${encodeURIComponent(activePartnerFriend.username)}`} className="group flex items-center gap-3 rounded-2xl p-3 transition hover:bg-white/[0.04]" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,130,246,0.06))' }}>
                        <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-white ring-2 ring-emerald-400/40 transition group-hover:ring-emerald-400/70" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})` }}>
                          {activePartnerFriend.avatarUrl ? <img src={activePartnerFriend.avatarUrl} alt={activePartnerFriend.username} className="h-full w-full object-cover" /> : (activePartnerFriend.realName || activePartnerFriend.username || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">💚 Partner</p>
                          <p className="truncate text-sm font-semibold text-slate-200 group-hover:text-white">@{activePartnerFriend.username}</p>
                          {activePartnerFriend.realName ? <p className="truncate text-xs text-slate-400">{activePartnerFriend.realName}</p> : null}
                        </div>
                        <svg className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </Link>
                    ) : null}

                    {!activePartnerFriend && outgoingPartnerRequest ? (
                      <div className="flex items-center gap-3 rounded-xl bg-blue-500/10 px-3 py-3">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})` }}>
                          {outgoingPartnerRequest.avatarUrl ? <img src={outgoingPartnerRequest.avatarUrl} alt={outgoingPartnerRequest.username} className="h-full w-full object-cover" /> : (outgoingPartnerRequest.realName || outgoingPartnerRequest.username || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-400">Pending request</p>
                          <p className="truncate text-sm font-semibold text-slate-200">@{outgoingPartnerRequest.username}</p>
                        </div>
                        {isOwnSocialContext && !isGuestPreview ? (
                          <button type="button" onClick={() => handlePartnerListingAction(outgoingPartnerRequest.friendshipId, 'clear')} disabled={partnerActionBusyFriendshipId === String(outgoingPartnerRequest.friendshipId)} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-400 hover:text-red-400 disabled:opacity-60">Cancel</button>
                        ) : null}
                      </div>
                    ) : null}

                    {incomingPartnerRequests.map((friend) => (
                      <div key={`partner-incoming-${friend.friendshipId || friend._id}`} className="flex items-center gap-3 rounded-xl bg-amber-500/10 px-3 py-3">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})` }}>
                          {friend.avatarUrl ? <img src={friend.avatarUrl} alt={friend.username} className="h-full w-full object-cover" /> : (friend.realName || friend.username || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Incoming request</p>
                          <p className="truncate text-sm font-semibold text-slate-200">@{friend.username}</p>
                        </div>
                        {isOwnSocialContext && !isGuestPreview ? (
                          <div className="flex gap-1">
                            <button type="button" onClick={() => handlePartnerListingAction(friend.friendshipId, 'accept')} disabled={partnerActionBusyFriendshipId === String(friend.friendshipId)} className="rounded-lg border border-emerald-400/30 px-2 py-1 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-400/10 disabled:opacity-60">Accept</button>
                            <button type="button" onClick={() => handlePartnerListingAction(friend.friendshipId, 'deny')} disabled={partnerActionBusyFriendshipId === String(friend.friendshipId)} className="rounded-lg border border-red-400/30 px-2 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-400/10 disabled:opacity-60">Deny</button>
                          </div>
                        ) : null}
                      </div>
                    ))}

                    {isOwnSocialContext && !isGuestPreview && !activePartnerFriend && !outgoingPartnerRequest ? (
                      <button
                        type="button"
                        onClick={() => { setPartnerSearchOpen(true); setPartnerSearchQuery(''); setPartnerConfirmFriend(null); }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs font-semibold text-slate-400 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-slate-200"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        Add Partner / Spouse
                      </button>
                    ) : null}

                    {isOwnSocialContext && !isGuestPreview && activePartnerFriend ? (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handlePartnerListingAction(activePartnerFriend.friendshipId, 'clear')}
                          disabled={partnerActionBusyFriendshipId === String(activePartnerFriend.friendshipId)}
                          className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-500 hover:border-red-400/30 hover:text-red-400 disabled:opacity-60"
                        >
                          Remove partner
                        </button>
                      </div>
                    ) : null}

                    {!isOwnSocialContext && !activePartnerFriend ? (
                      <p className="text-sm" style={{ color: 'var(--social-text-muted)' }}>No partner listed.</p>
                    ) : null}

                    {partnerActionError ? <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{partnerActionError}</div> : null}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Partner Search Popup */}
            {partnerSearchOpen && isOwnSocialContext && !isGuestPreview ? (
              <div className="fixed inset-0 z-[1500] flex items-center justify-center">
                <button type="button" onClick={() => setPartnerSearchOpen(false)} className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" aria-label="Close partner search" />
                <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 p-5 shadow-2xl" style={{ background: 'var(--bg-panel)' }}>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--social-text-primary)' }}>Add Partner / Spouse</h3>
                  <p className="mt-1 text-xs" style={{ color: 'var(--social-text-secondary)' }}>Search your friends to send a partner request.</p>
                  <input
                    type="text"
                    value={partnerSearchQuery}
                    onChange={(e) => { setPartnerSearchQuery(e.target.value); setPartnerConfirmFriend(null); }}
                    placeholder="Search friends…"
                    autoFocus
                    className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-sm placeholder:opacity-70 focus:outline-none focus:ring-1"
                    style={{ '--tw-ring-color': 'var(--accent)', background: 'var(--social-surface-soft)', color: 'var(--social-text-primary)' }}
                  />
                  <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                    {availablePartnerCandidates
                      .filter((f) => !partnerSearchQuery || f.username?.toLowerCase().includes(partnerSearchQuery.toLowerCase()) || f.realName?.toLowerCase().includes(partnerSearchQuery.toLowerCase()))
                      .map((friend) => (
                        <button
                          key={`ps-${friend.friendshipId || friend._id}`}
                          type="button"
                          onClick={() => setPartnerConfirmFriend(friend)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${partnerConfirmFriend && String(partnerConfirmFriend.friendshipId) === String(friend.friendshipId) ? 'ring-1' : 'hover:bg-[color:var(--social-surface-muted)]'}`}
                          style={partnerConfirmFriend && String(partnerConfirmFriend.friendshipId) === String(friend.friendshipId) ? { background: 'var(--social-surface-soft)', '--tw-ring-color': 'var(--accent)' } : undefined}
                        >
                          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white" style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})` }}>
                            {friend.avatarUrl ? <img src={friend.avatarUrl} alt={friend.username} className="h-full w-full object-cover" /> : (friend.realName || friend.username || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold" style={{ color: 'var(--social-text-primary)' }}>@{friend.username}</p>
                            {friend.realName ? <p className="truncate text-xs" style={{ color: 'var(--social-text-secondary)' }}>{friend.realName}</p> : null}
                          </div>
                        </button>
                      ))}
                    {availablePartnerCandidates.filter((f) => !partnerSearchQuery || f.username?.toLowerCase().includes(partnerSearchQuery.toLowerCase()) || f.realName?.toLowerCase().includes(partnerSearchQuery.toLowerCase())).length === 0 ? (
                      <p className="px-3 py-3 text-center text-xs" style={{ color: 'var(--social-text-muted)' }}>{availablePartnerCandidates.length === 0 ? 'No friends available.' : 'No matches found.'}</p>
                    ) : null}
                  </div>
                  {partnerConfirmFriend ? (
                    <div className="mt-3 rounded-xl border border-white/10 p-3" style={{ background: 'var(--social-surface-muted)' }}>
                      <p className="text-xs" style={{ color: 'var(--social-text-secondary)' }}>Send partner request to <span className="font-semibold" style={{ color: 'var(--social-text-primary)' }}>@{partnerConfirmFriend.username}</span>?</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => { handlePartnerListingAction(partnerConfirmFriend.friendshipId, 'request'); setPartnerSearchOpen(false); }}
                          disabled={partnerActionBusyFriendshipId === String(partnerConfirmFriend.friendshipId)}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                          style={{ backgroundColor: 'var(--accent)' }}
                        >
                          Confirm
                        </button>
                        <button type="button" onClick={() => setPartnerConfirmFriend(null)} className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold" style={{ color: 'var(--social-text-secondary)' }}>Cancel</button>
                      </div>
                    </div>
                  ) : null}
                  <button type="button" onClick={() => setPartnerSearchOpen(false)} className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold" style={{ color: 'var(--social-text-secondary)' }}>Close</button>
                </div>
              </div>
            ) : null}

            {/* Now Playing Widget */}
            <div className="overflow-hidden rounded-2xl border border-white/[0.06]" style={{ background: 'var(--bg-panel)', backdropFilter: 'blur(var(--panel-blur))' }}>
              <div className="px-4 py-4">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Now Playing</h3>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: `linear-gradient(135deg, ${accentColor}22, ${accentColor2}22)` }}>🎵</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-300">Nothing playing</p>
                    <p className="text-[10px] text-slate-500">Coming Soon</p>
                  </div>
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full w-0 rounded-full" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor2})` }} />
                </div>
              </div>
            </div>

            {renderPulseRail()}
          </aside>
        </div>
      </div>

      {/* Modals */}
      {personalInfoModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/55 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-white/60 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Edit Personal Information</h3>
                <p className="text-sm text-slate-500">Set each field and choose Social or Secure visibility.</p>
              </div>
              <button
                type="button"
                onClick={() => setPersonalInfoModalOpen(false)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {PERSONAL_INFO_FIELDS.map((field) => (
                <div key={`personal-info-draft-${field.id}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={`personal-info-${field.id}`}>{field.label}</label>
                  <input
                    id={`personal-info-${field.id}`}
                    type={field.inputType}
                    value={personalInfoDraft?.values?.[field.id] || ''}
                    onChange={(event) => handlePersonalInfoDraftValueChange(field.id, event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                  />
                  <select
                    value={personalInfoDraft?.visibility?.[field.id] === 'secure' ? 'secure' : 'social'}
                    onChange={(event) => handlePersonalInfoDraftVisibilityChange(field.id, event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700"
                  >
                    <option value="social">Social</option>
                    <option value="secure">Secure</option>
                  </select>
                </div>
              ))}
            </div>
            {personalInfoSaveError ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{personalInfoSaveError}</div> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPersonalInfoModalOpen(false)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePersonalInfo}
                disabled={personalInfoSaveBusy}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {personalInfoSaveBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SocialStageSettingsSidebar
        isOpen={designStudioOpen}
        onClose={() => setDesignStudioOpen(false)}
        hasUnsavedChanges={hasUnsavedDesignChanges}
        onSaveChanges={saveDraftPreferences}
        onCancelChanges={cancelDraftPreferences}
        busy={designBusy}
        error={designError}
        successMessage={designSuccessMessage}
        heroBackgroundImage={socialPreferences.hero?.backgroundImage || ''}
        heroBackgroundImageHistory={socialPreferences.hero?.backgroundImageHistory || []}
        heroRandomGalleryEnabled={Boolean(socialPreferences.hero?.backgroundImageUseRandomGallery)}
        heroProfileImage={socialPreferences.hero?.profileImage || ''}
        heroProfileImageHistory={socialPreferences.hero?.profileImageHistory || []}
        bodyBackgroundImage={socialPreferences.globalStyles?.bodyBackgroundImage || ''}
        bodyBackgroundOverlay={socialPreferences.globalStyles?.bodyBackgroundOverlay || 0}
        bodyBackgroundGrain={socialPreferences.globalStyles?.bodyBackgroundGrain || 0}
        bodyBackgroundBlur={socialPreferences.globalStyles?.bodyBackgroundBlur || 0}
        bodyBackgroundDisplayMode={socialPreferences.globalStyles?.bodyBackgroundDisplayMode || 'cover'}
        bodyBackgroundOverlayAnimation={socialPreferences.globalStyles?.bodyBackgroundOverlayAnimation || 'none'}
        onBodyBackgroundImageChange={(value) => updateGlobalStyles({ bodyBackgroundImage: value })}
        onBodyBackgroundOverlayChange={(value) => updateGlobalStyles({ bodyBackgroundOverlay: value })}
        onBodyBackgroundGrainChange={(value) => updateGlobalStyles({ bodyBackgroundGrain: value })}
        onBodyBackgroundBlurChange={(value) => updateGlobalStyles({ bodyBackgroundBlur: value })}
        onBodyBackgroundDisplayModeChange={(value) => updateGlobalStyles({ bodyBackgroundDisplayMode: value })}
        onBodyBackgroundOverlayAnimationChange={(value) => updateGlobalStyles({ bodyBackgroundOverlayAnimation: value })}
        onBodyBackgroundUpload={async (file) => {
          const response = await socialPageAPI.uploadBodyBackground(file);
          const url = response.data?.mediaUrl;
          if (url) updateGlobalStyles({ bodyBackgroundImage: url });
        }}
        themePreset={socialPreferences.themePreset || 'default'}
        themeOptions={STAGE_THEME_OPTIONS}
        accentColor={accentColor}
        fontFamily={socialPreferences.globalStyles?.fontFamily || 'Inter'}
        fontOptions={SOCIAL_FONT_FAMILIES}
        selectedTopFriends={draftTopFriends}
        availableFriends={friends}
        topFriendsLimit={TOP_FRIENDS_LIMIT}
        onHeroBackgroundImageChange={(value) => updateHeroMediaPreference('backgroundImage', value)}
        onHeroBackgroundImageUpload={(event) => uploadHeroMediaPreference(event, 'backgroundImage')}
        onHeroProfileImageChange={(value) => updateHeroMediaPreference('profileImage', value)}
        onHeroProfileImageUpload={(event) => uploadHeroMediaPreference(event, 'profileImage')}
        onHeroRandomGalleryToggle={(enabled) => updateHeroConfig({ backgroundImageUseRandomGallery: enabled })}
        onThemePresetChange={updateThemePreset}
        onAccentColorChange={(value) => {
          updateHeroConfig({ menuActiveColor: value, locationColor: value });
          updateGlobalStyles({ headerColor: value });
        }}
        onFontFamilyChange={(value) => {
          updateGlobalStyles({ fontFamily: value });
          updateHeroConfig({ fontFamily: value });
        }}
        onToggleTopFriend={toggleDraftTopFriend}
        onMoveTopFriend={moveDraftTopFriend}
      />

      {activeGalleryImage ? (
        <div className="fixed inset-0 z-[1700] bg-black/85 p-3 sm:p-6">
          <button
            type="button"
            onClick={handleCloseGalleryImage}
            className="absolute right-4 top-4 z-20 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/80 sm:right-6 sm:top-6"
            aria-label="Close gallery viewer"
          >
            Close ✕
          </button>
          <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-4 lg:flex-row">
            <div className="relative flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-white/20 bg-black/40 p-2 sm:p-4">
              <img src={activeGalleryImage.mediaUrl} alt={activeGalleryImage.title || 'Gallery item'} className="max-h-full max-w-full rounded-xl object-contain" />
            </div>
            <aside className="flex w-full flex-col rounded-2xl border border-white/20 bg-white/95 p-4 text-slate-900 lg:w-[360px]">
              <div className="mb-3">
                <p className="text-base font-semibold">{activeGalleryImage.title || 'Untitled visual'}</p>
                {activeGalleryImage.caption ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{activeGalleryImage.caption}</p> : null}
              </div>
              <div className="mb-3 flex items-center gap-2 text-sm">
                <button type="button" onClick={() => handleGalleryReaction(activeGalleryImage._id, 'like')} disabled={!viewerCanReact || Boolean(galleryActionLoadingByImage[activeGalleryImage._id])} className="rounded-lg border px-2 py-1 transition-colors" style={(activeGalleryImage.viewerReaction || null) === 'like' ? { borderColor: '#16a34a', background: '#16a34a', color: '#fff' } : { borderColor: '#d1d5db', color: '#334155' }}>👍 {activeGalleryImage.likesCount || 0}</button>
                <button type="button" onClick={() => handleGalleryReaction(activeGalleryImage._id, 'dislike')} disabled={!viewerCanReact || Boolean(galleryActionLoadingByImage[activeGalleryImage._id])} className="rounded-lg border px-2 py-1 transition-colors" style={(activeGalleryImage.viewerReaction || null) === 'dislike' ? { borderColor: '#ef4444', background: '#ef4444', color: '#fff' } : { borderColor: '#d1d5db', color: '#334155' }}>👎 {activeGalleryImage.dislikesCount || 0}</button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                {(activeGalleryImage.comments || []).length === 0 ? (
                  <p className="p-2 text-sm text-slate-500">No comments yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {(activeGalleryImage.comments || []).map((comment, index) => (
                      <li key={comment._id || `${activeGalleryImage._id}-comment-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
                        <p className="font-medium text-slate-700">@{comment.username || 'Unknown User'}</p>
                        <p className="whitespace-pre-wrap text-slate-800">{comment.content}</p>
                        <p className="text-[11px] text-slate-500">{formatDate(comment.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={galleryCommentInputs[activeGalleryImage._id] || ''}
                  onChange={(event) => handleGalleryCommentInputChange(activeGalleryImage._id, event.target.value)}
                  placeholder={viewerCanReact ? 'Add a comment...' : 'Sign in to comment'}
                  disabled={!viewerCanReact || Boolean(galleryCommentSubmittingByImage[activeGalleryImage._id])}
                  maxLength={1000}
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => handleGalleryCommentSubmit(activeGalleryImage._id)}
                  disabled={!viewerCanReact || !(galleryCommentInputs[activeGalleryImage._id] || '').trim() || Boolean(galleryCommentSubmittingByImage[activeGalleryImage._id])}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </aside>
          </div>
        </div>
      ) : null}

      {/* Gallery Upload Modal */}
      {showGalleryUploadModal ? (
        <div className="fixed inset-0 z-[1700] flex items-center justify-center bg-slate-900/55 px-4 py-6 backdrop-blur-sm">
          <div className="flex w-full max-w-2xl flex-col rounded-3xl border border-white/60 bg-white shadow-2xl" style={{ maxHeight: 'calc(100vh - 3rem)' }}>
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Add to Gallery</h3>
                <p className="text-sm text-slate-500">Select up to {galleryUploadMaxSlots} images with optional descriptions.</p>
              </div>
              <button type="button" onClick={handleGalleryUploadClose} className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
            {/* Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {/* File picker + batch audience toggle */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-100">
                  <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="4" width="16" height="12" rx="2" /><circle cx="7" cy="9" r="1.5" /><path d="M2 14l4-4 4 4 3-3 5 4" /></svg>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUploadFileSelect} disabled={galleryUploading} />
                  Select images
                </label>
                <span className="text-[11px] font-medium text-slate-400">{galleryUploadPreviews.length} / {galleryUploadMaxSlots} selected</span>
                {/* Batch audience toggle */}
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="text-[10px] font-medium text-slate-400">All images:</span>
                  <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    {['social', 'secure', 'public'].map((aud) => (
                      <button
                        key={aud}
                        type="button"
                        onClick={() => {
                          setGalleryUploadDefaultAudience(aud);
                          setGalleryUploadAudienceOverrides({});
                        }}
                        className="rounded-md px-2 py-0.5 text-[10px] font-semibold transition-all"
                        style={galleryUploadDefaultAudience === aud && Object.keys(galleryUploadAudienceOverrides).length === 0
                          ? { backgroundColor: RELATIONSHIP_AUDIENCE_COLORS[aud], color: '#fff' }
                          : { color: '#94a3b8' }
                        }
                      >
                        {RELATIONSHIP_AUDIENCE_LABELS[aud]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Image previews grid */}
              {galleryUploadPreviews.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {galleryUploadPreviews.map((preview, index) => {
                    const effectiveAudience = galleryUploadAudienceOverrides[index] || galleryUploadDefaultAudience;
                    return (
                      <div key={`${preview.file.name}-${index}`} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
                        <img src={preview.objectUrl} alt={`Preview ${index + 1}`} className="h-28 w-full object-cover" />
                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => handleGalleryUploadRemoveFile(index)}
                          disabled={galleryUploading}
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-30"
                          style={{ background: 'rgba(0,0,0,0.6)' }}
                        >
                          ✕
                        </button>
                        {/* Per-image audience override */}
                        <div className="absolute left-1 top-1 flex rounded-md p-px opacity-0 transition-opacity group-hover:opacity-100" style={{ background: 'rgba(0,0,0,0.5)' }}>
                          {['social', 'secure', 'public'].map((aud) => (
                            <button
                              key={aud}
                              type="button"
                              onClick={() => setGalleryUploadAudienceOverrides((prev) => ({ ...prev, [index]: aud }))}
                              className={`px-1.5 py-px text-[9px] font-semibold ${aud === 'social' ? 'rounded-l-md' : aud === 'public' ? 'rounded-r-md' : ''}`}
                              style={effectiveAudience === aud
                                ? { backgroundColor: RELATIONSHIP_AUDIENCE_COLORS[aud], color: '#fff' }
                                : { color: 'rgba(255,255,255,0.7)' }
                              }
                            >
                              {RELATIONSHIP_AUDIENCE_ICONS[aud]}
                            </button>
                          ))}
                        </div>
                        {/* Audience badge - positioned at the bottom of the image area */}
                        <span className={`absolute right-1 top-[6rem] rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${effectiveAudience === 'secure' ? 'bg-amber-100 text-amber-800' : effectiveAudience === 'public' ? 'bg-green-100 text-green-800' : 'bg-sky-100 text-sky-800'}`}>
                          {RELATIONSHIP_AUDIENCE_LABELS[effectiveAudience]}
                        </span>
                        {/* Description input */}
                        <input
                          type="text"
                          value={galleryUploadDescriptions[index] || ''}
                          onChange={(event) => setGalleryUploadDescriptions((prev) => ({ ...prev, [index]: event.target.value }))}
                          placeholder="Add description…"
                          maxLength={280}
                          disabled={galleryUploading}
                          className="w-full border-t border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600 placeholder-slate-400 focus:outline-none disabled:opacity-50"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-10 text-center">
                  <svg className="mb-2 h-10 w-10 text-slate-300" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.2}><rect x="2" y="4" width="16" height="12" rx="2" /><circle cx="7" cy="9" r="1.5" /><path d="M2 14l4-4 4 4 3-3 5 4" /></svg>
                  <p className="text-sm font-medium text-slate-400">Click &quot;Select images&quot; to choose photos</p>
                  <p className="mt-1 text-[11px] text-slate-400">Up to {galleryUploadMaxSlots} images, max 3MB each</p>
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={handleGalleryUploadClose} disabled={galleryUploading} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button
                type="button"
                onClick={handleGalleryUploadSubmit}
                disabled={galleryUploading || galleryUploadPreviews.length === 0}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {galleryUploading ? 'Uploading…' : `Upload ${galleryUploadPreviews.length || ''} image${galleryUploadPreviews.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ReportModal
        isOpen={reportModalState.isOpen}
        targetType={reportModalState.targetType}
        targetId={reportModalState.targetId}
        targetUserId={reportModalState.targetUserId}
        onClose={closeReportModal}
        onSubmit={submitReport}
      />
      </div>
    </div>
  );
};

export default Social;
