import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { moderationAPI, newsAPI } from '../utils/api';
import { StatusBadge } from '../components/ui';

/* ──────────────────────────── constants ──────────────────────────── */

const SECTION_LABELS = {
  users: 'Users',
  posts: 'Posts',
  chatRoomMessages: 'Room Messages',
  directMessages: 'Direct Messages',
  allMessages: 'All Messages',
  reports: 'Reports',
  blocks: 'Blocks',
  mutes: 'Mutes',
  rooms: 'Chat Rooms',
  conversations: 'Conversations'
};

const SECTION_ICONS = {
  users: '👥',
  posts: '📝',
  chatRoomMessages: '💬',
  directMessages: '✉️',
  allMessages: '📨',
  reports: '🚩',
  blocks: '🚫',
  mutes: '🔇',
  rooms: '🏠',
  conversations: '💭'
};

const FALLBACK_MUTE_DURATIONS = ['24h', '48h', '72h', '5d', '7d', '1m', 'forever'];
const INGESTION_TABLE_COL_COUNT = 15;
const TOTAL_KEY_TO_SECTION = {
  users: 'users',
  posts: 'posts',
  chatRoomMessages: 'messages',
  directMessages: 'messages',
  allMessages: 'messages',
  reports: 'reports',
  blocks: 'blocks',
  mutes: 'mutes',
  rooms: 'rooms',
  conversations: 'conversations'
};

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'activity', label: 'Activity', icon: '⚡' },
  { id: 'filters', label: 'Content Filters', icon: '🛡️' },
  { id: 'news', label: 'News Ingestion', icon: '📰' },
  { id: 'security', label: 'Security', icon: '🔒' }
];

/* ──────────────────────────── helpers ──────────────────────────── */

const wordListToText = (values = []) => (Array.isArray(values) ? values.join('\n') : '');
const textToWordList = (value) => String(value || '')
  .split(/\r?\n|,/)
  .map((entry) => entry.trim())
  .filter(Boolean);

const formatAssociatedLocations = (locationAssociations = {}) => {
  const cities = Array.isArray(locationAssociations.cities) ? locationAssociations.cities : [];
  const states = Array.isArray(locationAssociations.states) ? locationAssociations.states : [];
  const countries = Array.isArray(locationAssociations.countries) ? locationAssociations.countries : [];
  const zipCodes = Array.isArray(locationAssociations.zipCodes) ? locationAssociations.zipCodes : [];
  const counties = Array.isArray(locationAssociations.counties) ? locationAssociations.counties : [];
  return [
    ...cities.map((value) => `city:${value}`),
    ...counties.map((value) => `county:${value}`),
    ...states.map((value) => `state:${value}`),
    ...countries.map((value) => `country:${value}`),
    ...zipCodes.map((value) => `zip:${value}`)
  ];
};

const getIngestedTimestamp = (record = {}) => (
  record.processedAt
  || record.updatedAt
  || record.persistence?.persistedAt
  || record.ingestedAt
  || record.createdAt
  || record.scrapedAt
  || null
);

const formatTimestampCell = (value) => (value ? new Date(value).toLocaleString() : '—');

const formatCountdown = (ms) => {
  if (ms == null || ms <= 0) return '—';
  const secs = Math.floor(ms / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h > 0 ? `${h}h ` : ''}${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
};

const timeAgo = (date) => {
  if (!date) return '';
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

/* ──────────────────────────── sub-components ──────────────────────────── */

const Modal = ({ title, onClose, children, dark }) => (
  <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
    <div className={`w-full max-w-4xl rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden border ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <div className={`flex items-center justify-between border-b px-5 py-3 ${dark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
        <h3 className={`text-lg font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h3>
        <button type="button" onClick={onClose} className={`rounded-lg px-3 py-1 text-sm transition-colors ${dark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200'}`}>✕ Close</button>
      </div>
      <div className="p-5 overflow-auto max-h-[80vh]">{children}</div>
    </div>
  </div>
);

function SortableHeader({ label, field, sortBy, sortDir, onSort }) {
  const isActive = sortBy === field;
  const handleClick = () => {
    if (!isActive) {
      onSort(field, 'asc');
    } else if (sortDir === 'asc') {
      onSort(field, 'desc');
    } else {
      onSort('createdAt', 'desc');
    }
  };
  const arrow = isActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <th
      className={`px-3 py-2.5 cursor-pointer select-none hover:text-gray-800 transition-colors ${isActive ? 'text-indigo-600' : ''}`}
      onClick={handleClick}
      aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}{arrow}
    </th>
  );
}

function CollapsibleSection({ id, title, icon, collapsed, onToggle, children, dark, badge }) {
  return (
    <section id={`section-${id}`} className={`rounded-xl border overflow-hidden transition-colors ${dark ? 'border-gray-700 bg-gray-800/60' : 'border-gray-200 bg-white'} shadow-sm`}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${dark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}`}
      >
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <h2 className={`text-sm font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h2>
          {badge != null && (
            <span className="inline-flex items-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>
          )}
        </div>
        <span className={`text-xs transition-transform ${collapsed ? '' : 'rotate-180'} ${dark ? 'text-gray-400' : 'text-gray-500'}`}>▼</span>
      </button>
      {!collapsed && <div className={`border-t px-4 py-3 ${dark ? 'border-gray-700' : 'border-gray-100'}`}>{children}</div>}
    </section>
  );
}

function StatCard({ icon, value, label, trend, dark, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative rounded-lg border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${dark ? 'border-gray-700 bg-gray-800 hover:border-blue-500' : 'border-gray-200 bg-white hover:border-blue-400'}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-base">{icon}</span>
        <p className={`text-xl font-bold tabular-nums ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{value ?? '—'}</p>
      </div>
      <p className={`mt-1 text-[10px] font-medium uppercase tracking-wide ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{label}</p>
      {trend != null && (
        <p className={`mt-0.5 text-[10px] font-semibold ${trend >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}
        </p>
      )}
    </button>
  );
}

/* ──────────────────────────── main component ──────────────────────────── */

function ModerationDashboard() {
  /* ── existing state ── */
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState({ open: false, section: 'users', rows: [], page: 1, totalPages: 1, loading: false });
  const [activeUser, setActiveUser] = useState(null);
  const [tempPassword, setTempPassword] = useState('');
  const [muteDurationKey, setMuteDurationKey] = useState('24h');
  const [infractionAction, setInfractionAction] = useState('warning');
  const [actionReason, setActionReason] = useState('');
  const [ingestionFilters, setIngestionFilters] = useState({
    source: '',
    tag: '',
    category: '',
    dedupeOutcome: '',
    location: '',
    zipCode: '',
    region: '',
    processingStatus: '',
    publishedFrom: '',
    publishedTo: '',
    sortBy: 'createdAt',
    sortDir: 'desc'
  });
  const [ingestion, setIngestion] = useState({ rows: [], page: 1, totalPages: 1, total: 0, loading: false });
  const [ingestionDetail, setIngestionDetail] = useState({ open: false, record: null, loading: false });
  const [ingestionTimeline, setIngestionTimeline] = useState([]);
  const [ingestionLogs, setIngestionLogs] = useState([]);
  const [expandedIngestionRows, setExpandedIngestionRows] = useState({});
  const [scheduleInfo, setScheduleInfo] = useState(null);
  const [ingestionStats, setIngestionStats] = useState(null);
  const [countdownMs, setCountdownMs] = useState(null);
  const [contentFilterForm, setContentFilterForm] = useState({
    zeroToleranceWordsText: '',
    maturityCensoredWordsText: ''
  });
  const [contentFilterSaving, setContentFilterSaving] = useState(false);

  /* ── new UI state ── */
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('admin-theme') || 'light'; } catch { return 'light'; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNav, setActiveNav] = useState('dashboard');
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const dark = theme === 'dark';
  const notifRef = useRef(null);

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('admin-theme', next); } catch { /* ignore */ }
  };

  const toggleSection = useCallback((id) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const scrollToSection = (id) => {
    setActiveNav(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ── derived ── */
  const muteDurations = useMemo(() => overview?.muteDurations || FALLBACK_MUTE_DURATIONS, [overview]);

  /* ── data loaders ── */
  const loadOverview = async () => {
    setLoading(true);
    try {
      const { data } = await moderationAPI.getControlPanelOverview();
      setOverview(data);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load control panel');
    } finally {
      setLoading(false);
    }
  };

  const loadContentFilter = async () => {
    try {
      const { data } = await moderationAPI.getContentFilter();
      setContentFilterForm({
        zeroToleranceWordsText: wordListToText(data?.zeroToleranceWords),
        maturityCensoredWordsText: wordListToText(data?.maturityCensoredWords)
      });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load content filter settings');
    }
  };

  useEffect(() => {
    loadOverview();
    loadContentFilter();
    loadIngestionRecords(1);
    loadScheduleInfo();
    loadIngestionStats();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!scheduleInfo?.nextRunAt || !scheduleInfo?.schedulerRunning) {
      setCountdownMs(null);
      return;
    }
    const tick = () => {
      const remaining = new Date(scheduleInfo.nextRunAt).getTime() - Date.now();
      setCountdownMs(Math.max(0, remaining));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [scheduleInfo?.nextRunAt, scheduleInfo?.schedulerRunning]);

  // Close notification dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotificationsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadScheduleInfo = async () => {
    try {
      const { data } = await newsAPI.getScheduleInfo();
      setScheduleInfo(data);
    } catch (error) {
      // Non-critical, fail silently
    }
  };

  const loadIngestionStats = async () => {
    try {
      const { data } = await newsAPI.getIngestionStats();
      setIngestionStats(data);
    } catch (error) {
      // Non-critical, fail silently
    }
  };

  const handleTriggerIngestion = async () => {
    try {
      toast.loading('Running full ingestion...', { id: 'ingest' });
      await newsAPI.triggerIngestion();
      toast.success('Ingestion completed', { id: 'ingest' });
      await Promise.all([loadIngestionRecords(1), loadScheduleInfo(), loadIngestionStats()]);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Ingestion failed', { id: 'ingest' });
    }
  };

  const handleTriggerSourceIngestion = async (sourceKey) => {
    try {
      toast.loading(`Ingesting ${sourceKey}...`, { id: `ingest-${sourceKey}` });
      await newsAPI.triggerSourceIngestion(sourceKey);
      toast.success(`${sourceKey} ingestion completed`, { id: `ingest-${sourceKey}` });
      await Promise.all([loadIngestionRecords(1), loadIngestionStats()]);
    } catch (error) {
      toast.error(error.response?.data?.error || `${sourceKey} ingestion failed`, { id: `ingest-${sourceKey}` });
    }
  };

  const resetIngestionFilters = () => {
    const defaults = {
      source: '', tag: '', category: '', dedupeOutcome: '',
      location: '', zipCode: '', region: '', processingStatus: '',
      publishedFrom: '', publishedTo: '', sortBy: 'createdAt', sortDir: 'desc'
    };
    setIngestionFilters(defaults);
  };

  const loadIngestionRecords = async (page = 1) => {
    setIngestion((prev) => ({ ...prev, loading: true }));
    try {
      const params = { page, limit: 25 };
      Object.entries(ingestionFilters).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      const { data } = await moderationAPI.getNewsIngestionRecords(params);
      setIngestion({
        rows: data.records || [],
        page: data.page || page,
        totalPages: data.totalPages || 1,
        total: data.total || 0,
        loading: false
      });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load ingestion records');
      setIngestion((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleIngestionSort = (field, dir) => {
    setIngestionFilters((prev) => ({ ...prev, sortBy: field, sortDir: dir }));
  };

  const toggleIngestionRow = (rowId) => {
    setExpandedIngestionRows((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  const openIngestionDetail = async (recordId) => {
    setIngestionDetail({ open: true, record: null, loading: true });
    try {
      const [detailRes, timelineRes, logsRes] = await Promise.all([
        moderationAPI.getNewsIngestionRecord(recordId),
        moderationAPI.getNewsIngestionTimeline(recordId),
        moderationAPI.getNewsIngestionLogs(recordId)
      ]);
      setIngestionDetail({ open: true, record: detailRes.data, loading: false });
      setIngestionTimeline(timelineRes.data?.timeline || []);
      setIngestionLogs(logsRes.data?.logs || []);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load ingestion detail');
      setIngestionDetail({ open: false, record: null, loading: false });
    }
  };

  /* ── details / actions ── */
  const openDetails = async (section, page = 1) => {
    setDetails((prev) => ({ ...prev, open: true, section, loading: true, page }));
    try {
      const params = { section, page, limit: 20 };
      if (searchQuery) params.search = searchQuery;
      const { data } = await moderationAPI.getControlPanelDetails(params);
      setDetails({
        open: true, section,
        rows: data.rows || [],
        page: data.page || page,
        totalPages: data.totalPages || 1,
        loading: false
      });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load details');
      setDetails((prev) => ({ ...prev, loading: false }));
    }
  };

  const refreshAll = async () => {
    await Promise.all([loadOverview(), loadContentFilter()]);
  };

  const handleDeletePost = async (postId) => {
    try {
      await moderationAPI.deletePostByAdmin(postId);
      toast.success('Post deleted');
      await refreshAll();
      if (details.open) await openDetails(details.section, details.page);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete post');
    }
  };

  const handleDeleteMessage = async (messageId, type = 'room') => {
    try {
      await moderationAPI.deleteMessageByAdmin(messageId, type);
      toast.success('Message deleted');
      await refreshAll();
      if (details.open) await openDetails(details.section, details.page);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete message');
    }
  };

  const handleResetPassword = async (userId) => {
    try {
      const { data } = await moderationAPI.resetUserPassword(userId);
      setTempPassword(data.tempPassword);
      toast.success('Password reset successfully');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to reset password');
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await moderationAPI.deleteUserByAdmin(userId);
      toast.success('User deleted');
      setActiveUser(null);
      await refreshAll();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleMuteUser = async () => {
    if (!activeUser) return;
    try {
      await moderationAPI.muteUserByAdmin(activeUser._id, { duration: muteDurationKey, reason: actionReason });
      toast.success('User muted');
      await refreshAll();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to mute user');
    }
  };

  const handleUnmuteUser = async () => {
    if (!activeUser) return;
    try {
      await moderationAPI.unmuteUserByAdmin(activeUser._id);
      toast.success('User unmuted');
      await refreshAll();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to unmute user');
    }
  };

  const handleAddInfraction = async () => {
    if (!activeUser) return;
    try {
      await moderationAPI.addInfraction(activeUser._id, { action: infractionAction, reason: actionReason });
      toast.success('Infraction added');
      await refreshAll();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add infraction');
    }
  };

  const handleRemoveInfraction = async (row) => {
    try {
      await moderationAPI.removeInfraction(row.userId, row.index);
      toast.success('Infraction removed');
      await refreshAll();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to remove infraction');
    }
  };

  const handleSaveContentFilter = async (e) => {
    e.preventDefault();
    setContentFilterSaving(true);
    try {
      await moderationAPI.updateContentFilter({
        zeroToleranceWords: textToWordList(contentFilterForm.zeroToleranceWordsText),
        maturityCensoredWords: textToWordList(contentFilterForm.maturityCensoredWordsText)
      });
      toast.success('Content filters saved');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save content filters');
    } finally {
      setContentFilterSaving(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      openDetails('users', 1);
    }
  };

  /* ── loading state ── */
  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Loading control panel…</p>
        </div>
      </div>
    );
  }

  /* ──────────────────────────── render ──────────────────────────── */
  const inputCls = `rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors ${dark ? 'border-gray-600 bg-gray-700 text-gray-200 focus:border-blue-500' : 'border-gray-200 bg-white text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400'}`;

  return (
    <div className={`relative z-[1400] flex min-h-screen ${dark ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      {/* ── Sidebar ── */}
      <aside className={`sticky top-0 z-30 flex h-screen flex-col border-r transition-all ${sidebarOpen ? 'w-48' : 'w-12'} ${dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <button type="button" onClick={() => setSidebarOpen(!sidebarOpen)} className={`flex items-center justify-center py-3 transition-colors ${dark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`} aria-label="Toggle sidebar">
          <span className={`text-sm transition-transform ${sidebarOpen ? '' : 'rotate-180'}`}>◀</span>
        </button>
        <nav className="flex-1 space-y-1 px-1.5 pt-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToSection(item.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${activeNav === item.id ? (dark ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-700') : (dark ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')}`}
              title={item.label}
            >
              <span className="text-base">{item.icon}</span>
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>
        {sidebarOpen && (
          <div className={`border-t p-3 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
            <Link to="/control-panel/news-review" className={`flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${dark ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
              📰 <span>News Review</span>
            </Link>
          </div>
        )}
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* ── Top Bar ── */}
        <header className={`sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-2.5 backdrop-blur-xl ${dark ? 'border-gray-700 bg-gray-900/80' : 'border-gray-200 bg-white/80'}`}>
          <h1 className="text-lg font-bold whitespace-nowrap">Control Panel</h1>
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users, posts, messages…"
              className={`w-full rounded-lg border py-1.5 pl-8 pr-3 text-sm outline-none transition-colors ${dark ? 'border-gray-600 bg-gray-800 text-gray-200 placeholder-gray-500 focus:border-blue-500' : 'border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:border-blue-400'}`}
            />
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm opacity-50">🔍</span>
          </form>
          <div className="flex items-center gap-2 ml-auto">
            {/* Theme toggle */}
            <button type="button" onClick={toggleTheme} className={`rounded-lg p-1.5 text-sm transition-colors ${dark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`} title={`Switch to ${dark ? 'light' : 'dark'} mode`}>
              {dark ? '☀️' : '🌙'}
            </button>
            {/* Notification bell */}
            <div className="relative" ref={notifRef}>
              <button type="button" onClick={() => setNotificationsOpen(!notificationsOpen)} className={`relative rounded-lg p-1.5 text-sm transition-colors ${dark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`} title="Notifications">
                🔔
                {(overview?.pendingReports || 0) > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">{overview.pendingReports}</span>
                )}
              </button>
              {notificationsOpen && (
                <div className={`absolute right-0 top-full mt-1 w-72 rounded-xl border shadow-xl ${dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
                  <div className={`border-b px-3 py-2 ${dark ? 'border-gray-700' : 'border-gray-100'}`}>
                    <p className="text-xs font-semibold">Alerts &amp; Events</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                    {(overview?.pendingReports || 0) > 0 && (
                      <button type="button" onClick={() => { setNotificationsOpen(false); openDetails('reports'); }} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${dark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                        <span className="text-red-500">🚩</span>
                        <span>{overview.pendingReports} pending report{overview.pendingReports !== 1 ? 's' : ''}</span>
                      </button>
                    )}
                    {(overview?.recentSecurityEvents || []).map((evt) => (
                      <div key={evt._id} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                        <span>{evt.severity === 'critical' ? '🔴' : evt.severity === 'warning' ? '🟡' : '🔵'}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{evt.eventType}{evt.username ? ` · @${evt.username}` : ''}</p>
                          <p className={`text-[10px] ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{timeAgo(evt.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                    {(overview?.recentSecurityEvents || []).length === 0 && !overview?.pendingReports && (
                      <p className={`py-4 text-center text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>No recent alerts</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Content ── */}
        <main className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">

          {/* ── Dashboard: Global Stats ── */}
          <section id="section-dashboard" className="space-y-4">
            <div className={`rounded-xl border px-4 py-3 ${dark ? 'border-gray-700 bg-gradient-to-r from-gray-800 to-gray-900' : 'border-gray-200 bg-gradient-to-r from-slate-50 to-white'}`}>
              <p className={`text-[10px] font-semibold uppercase tracking-widest ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Heartbeat</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                <StatCard dark={dark} icon="👥" value={overview?.totals?.users} label="Total Users" onClick={() => openDetails('users')} />
                <StatCard dark={dark} icon="🟢" value={overview?.sessions?.active ?? '—'} label="Active Sessions" />
                <StatCard dark={dark} icon="🆕" value={overview?.signups?.today ?? '—'} label="New Today" trend={overview?.signups?.today} />
                <StatCard dark={dark} icon="📅" value={overview?.signups?.thisWeek ?? '—'} label="This Week" />
                <StatCard dark={dark} icon="📆" value={overview?.signups?.thisMonth ?? '—'} label="This Month" />
                <StatCard dark={dark} icon="✅" value={overview?.accounts?.verified ?? '—'} label="Verified" />
                <StatCard dark={dark} icon="⛔" value={overview?.accounts?.banned ?? '—'} label="Banned" />
                <StatCard dark={dark} icon="⚠️" value={overview?.accounts?.atRisk ?? '—'} label="At Risk" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {Object.entries(overview?.totals || {}).map(([key, value]) => (
                <StatCard key={key} dark={dark} icon={SECTION_ICONS[key] || '📊'} value={value} label={SECTION_LABELS[key] || key} onClick={() => openDetails(TOTAL_KEY_TO_SECTION[key] || 'users')} />
              ))}
              <StatCard dark={dark} icon="🚩" value={overview?.pendingReports ?? '—'} label="Pending Reports" onClick={() => openDetails('reports')} />
            </div>
          </section>

          {/* ── Activity Feed ── */}
          <CollapsibleSection id="activity" title="Recent Activity" icon="⚡" collapsed={collapsedSections.activity} onToggle={toggleSection} dark={dark}>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {['users', 'posts', 'messages', 'infractions', 'reports', 'blocks', 'mutes', 'rooms', 'conversations'].map((s) => (
                <button key={s} type="button" onClick={() => openDetails(s)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${dark ? 'border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-blue-400' : 'border-gray-200 text-gray-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200'}`}>{s}</button>
              ))}
            </div>
            <div className={`grid gap-px md:grid-cols-3 rounded-lg overflow-hidden ${dark ? 'bg-gray-700' : 'bg-gray-100'}`}>
              <div className={`p-3 ${dark ? 'bg-gray-800' : 'bg-white'}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>👥 Users</p>
                <ul className="space-y-1.5 text-xs">
                  {(overview?.recents?.users || []).slice(0, 6).map((user) => (
                    <li key={user._id} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${dark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                      <div className="min-w-0">
                        <span className="font-medium">@{user.username}</span>
                        {user.createdAt && <span className={`ml-1.5 text-[10px] ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{timeAgo(user.createdAt)}</span>}
                      </div>
                      <button type="button" onClick={() => setActiveUser(user)} className="rounded p-0.5 text-blue-500 hover:bg-blue-500/10">✏️</button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={`p-3 ${dark ? 'bg-gray-800' : 'bg-white'}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>📝 Posts</p>
                <ul className="space-y-1.5 text-xs">
                  {(overview?.recents?.posts || []).slice(0, 6).map((post) => (
                    <li key={post._id} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${dark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                      <span className={`truncate ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{post.content || '(empty)'}</span>
                      <button type="button" onClick={() => handleDeletePost(post._id)} className="rounded p-0.5 text-red-500 hover:bg-red-500/10">🗑️</button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={`p-3 ${dark ? 'bg-gray-800' : 'bg-white'}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>💬 Messages</p>
                <ul className="space-y-1.5 text-xs">
                  {(overview?.recents?.messages || []).slice(0, 6).map((message) => (
                    <li key={`${message.type}:${message._id}`} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${dark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                      <span className={`truncate ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{message.content || '(empty)'}</span>
                      <button type="button" onClick={() => handleDeleteMessage(message._id, message.type)} className="rounded p-0.5 text-red-500 hover:bg-red-500/10">🗑️</button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CollapsibleSection>

          {/* ── Content Filters ── */}
          <CollapsibleSection id="filters" title="Content Filters" icon="🛡️" collapsed={collapsedSections.filters} onToggle={toggleSection} dark={dark}>
            <p className={`text-xs mb-3 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
              Zero-tolerance words block submission. Maturity-censored words are masked for viewers who enable the user setting.
            </p>
            <form onSubmit={handleSaveContentFilter} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={`mb-1.5 block text-xs font-medium ${dark ? 'text-gray-300' : 'text-gray-800'}`}>Zero-tolerance words</label>
                <textarea
                  value={contentFilterForm.zeroToleranceWordsText}
                  onChange={(event) => setContentFilterForm((prev) => ({ ...prev, zeroToleranceWordsText: event.target.value }))}
                  className={`min-h-[140px] w-full rounded-lg border p-3 text-sm outline-none ${dark ? 'border-gray-600 bg-gray-700 text-gray-200 focus:border-blue-500' : 'border-gray-200 bg-white text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400'}`}
                  placeholder="One word per line"
                />
              </div>
              <div>
                <label className={`mb-1.5 block text-xs font-medium ${dark ? 'text-gray-300' : 'text-gray-800'}`}>Maturity-censored words</label>
                <textarea
                  value={contentFilterForm.maturityCensoredWordsText}
                  onChange={(event) => setContentFilterForm((prev) => ({ ...prev, maturityCensoredWordsText: event.target.value }))}
                  className={`min-h-[140px] w-full rounded-lg border p-3 text-sm outline-none ${dark ? 'border-gray-600 bg-gray-700 text-gray-200 focus:border-blue-500' : 'border-gray-200 bg-white text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400'}`}
                  placeholder="One word per line"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <button type="submit" disabled={contentFilterSaving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-700 transition-colors">
                  {contentFilterSaving ? 'Saving…' : 'Save content filters'}
                </button>
              </div>
            </form>
          </CollapsibleSection>

          {/* ── News Ingestion Observability ── */}
          <CollapsibleSection id="news" title="News Ingestion Observability" icon="📰" collapsed={collapsedSections.news} onToggle={toggleSection} dark={dark} badge={ingestion.total || null}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => loadIngestionRecords(1)} className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${dark ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-blue-50 hover:text-blue-700'}`}>↻ Refresh</button>
                <button type="button" onClick={handleTriggerIngestion} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors">▶ Run Full Ingestion</button>
              </div>

              {/* Schedule & Stats Dashboard */}
              <div className="grid gap-3 md:grid-cols-4">
                <div className={`rounded-lg border p-3 ${dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
                  <h4 className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Scheduler</h4>
                  <div className="space-y-1 text-xs">
                    <p className="flex items-center gap-1.5">
                      <span className={`inline-block w-2 h-2 rounded-full ${scheduleInfo?.schedulerRunning ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      {scheduleInfo?.schedulerRunning ? 'Running' : 'Stopped'}
                    </p>
                    {scheduleInfo?.lastIngestionRunAt && (
                      <p><span className="text-gray-500">Last run:</span> {new Date(scheduleInfo.lastIngestionRunAt).toLocaleString()}</p>
                    )}
                    {scheduleInfo?.schedulerRunning && (
                      <p><span className="text-gray-500">Next run:</span> <span className="font-mono font-semibold text-indigo-500">{formatCountdown(countdownMs)}</span></p>
                    )}
                  </div>
                </div>
                <div className={`rounded-lg border p-3 ${dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
                  <h4 className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Article Totals</h4>
                  <div className="space-y-1 text-xs">
                    <p><span className="text-gray-500">Today:</span> <span className="font-semibold">{ingestionStats?.totals?.today ?? '—'}</span></p>
                    <p><span className="text-gray-500">This week:</span> <span className="font-semibold">{ingestionStats?.totals?.week ?? '—'}</span></p>
                    <p><span className="text-gray-500">Active articles:</span> <span className="font-semibold">{ingestionStats?.totals?.activeArticles ?? '—'}</span></p>
                  </div>
                </div>
                <div className={`rounded-lg border p-3 ${dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
                  <h4 className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>By Scope (24h)</h4>
                  <div className="space-y-1 text-xs">
                    {ingestionStats?.byScope ? Object.entries(ingestionStats.byScope).map(([scope, count]) => (
                      <p key={scope}><span className="text-gray-500">{scope}:</span> <span className="font-semibold">{count}</span></p>
                    )) : <p className="text-gray-400 italic">No data</p>}
                  </div>
                </div>
                <div className={`rounded-lg border p-3 ${dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
                  <h4 className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Dedupe (24h)</h4>
                  <div className="space-y-1 text-xs">
                    {ingestionStats?.byStatus ? Object.entries(ingestionStats.byStatus).map(([outcome, count]) => (
                      <p key={outcome}><span className="text-gray-500">{outcome}:</span> <span className="font-semibold">{count}</span></p>
                    )) : <p className="text-gray-400 italic">No data</p>}
                  </div>
                </div>
              </div>

              {/* Per-Source Stats */}
              {ingestionStats?.bySource?.length > 0 && (
                <div>
                  <h4 className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Per-Source (24h)</h4>
                  <div className={`max-h-56 overflow-y-auto rounded-lg border ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <table className="w-full text-xs">
                      <thead className={`sticky top-0 ${dark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                        <tr className={`text-left ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                          <th className="px-3 py-1.5 font-medium">Source</th>
                          <th className="px-3 py-1.5 font-medium text-right">OK</th>
                          <th className="px-3 py-1.5 font-medium text-right">Err</th>
                          <th className="px-3 py-1.5 font-medium text-right">Total</th>
                          <th className="px-2 py-1.5 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${dark ? 'divide-gray-700' : 'divide-gray-100'}`}>
                        {ingestionStats.bySource.map((s) => {
                          const adapterKey = ingestionStats.nameToAdapterKey?.[s.source];
                          return (
                            <tr key={s.source} className={dark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                              <td className={`px-3 py-1 font-medium truncate max-w-[180px] ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{s.source}</td>
                              <td className="px-3 py-1 text-right text-emerald-500">{s.processed}</td>
                              <td className="px-3 py-1 text-right text-red-500">{s.failed || 0}</td>
                              <td className={`px-3 py-1 text-right ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{s.total}</td>
                              <td className="px-2 py-1 text-center">
                                {adapterKey && (
                                  <button type="button" onClick={() => handleTriggerSourceIngestion(adapterKey)} className="text-indigo-500 hover:text-indigo-400 font-medium" title={`Re-ingest ${s.source}`}>▶</button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Ingestion Filters */}
              <div className="grid gap-2 md:grid-cols-5">
                <select value={ingestionFilters.source} onChange={(e) => setIngestionFilters((prev) => ({ ...prev, source: e.target.value }))} className={inputCls}>
                  <option value="">All sources</option>
                  <option value="Google News">Google News</option>
                  <option value="Reuters">Reuters</option>
                  <option value="BBC News">BBC News</option>
                  <option value="NPR">NPR</option>
                  <option value="Associated Press">Associated Press</option>
                  <option value="PBS NewsHour">PBS NewsHour</option>
                  <option value="CNN">CNN</option>
                  <option value="The Guardian">The Guardian</option>
                  <option value="New York Times">New York Times</option>
                  <option value="Wall Street Journal">Wall Street Journal</option>
                  <option value="TechCrunch">TechCrunch</option>
                  <option value="Yahoo News">Yahoo News</option>
                  <option value="ESPN">ESPN</option>
                  <option value="GDELT">GDELT</option>
                </select>
                <select value={ingestionFilters.category} onChange={(e) => setIngestionFilters((prev) => ({ ...prev, category: e.target.value }))} className={inputCls}>
                  <option value="">All categories</option>
                  <option value="general">General</option>
                  <option value="world">World</option>
                  <option value="politics">Politics</option>
                  <option value="business">Business</option>
                  <option value="technology">Technology</option>
                  <option value="science">Science</option>
                  <option value="health">Health</option>
                  <option value="entertainment">Entertainment</option>
                  <option value="sports">Sports</option>
                  <option value="finance">Finance</option>
                </select>
                <input value={ingestionFilters.tag} onChange={(e) => setIngestionFilters((prev) => ({ ...prev, tag: e.target.value }))} placeholder="Tag" className={inputCls} />
                <input value={ingestionFilters.location} onChange={(e) => setIngestionFilters((prev) => ({ ...prev, location: e.target.value }))} placeholder="City / County / ZIP (±50 mi)" className={inputCls} />
                <input value={ingestionFilters.zipCode} onChange={(e) => setIngestionFilters((prev) => ({ ...prev, zipCode: e.target.value }))} placeholder="ZIP" className={inputCls} />
                <select value={ingestionFilters.region} onChange={(e) => setIngestionFilters((prev) => ({ ...prev, region: e.target.value }))} className={inputCls}>
                  <option value="">All scopes</option>
                  <option value="local">Local</option>
                  <option value="regional">Regional</option>
                  <option value="national">National</option>
                  <option value="global">Global</option>
                </select>
                <select value={ingestionFilters.processingStatus} onChange={(e) => setIngestionFilters((prev) => ({ ...prev, processingStatus: e.target.value }))} className={inputCls}>
                  <option value="">Any status</option>
                  <option value="processed">Processed</option>
                  <option value="failed">Failed</option>
                </select>
                <select value={ingestionFilters.dedupeOutcome} onChange={(e) => setIngestionFilters((prev) => ({ ...prev, dedupeOutcome: e.target.value }))} className={inputCls}>
                  <option value="">Any dedupe outcome</option>
                  <option value="inserted">Inserted</option>
                  <option value="updated">Updated</option>
                  <option value="duplicate">Duplicate</option>
                  <option value="error">Error</option>
                </select>
                <input type="date" value={ingestionFilters.publishedFrom} onChange={(e) => setIngestionFilters((prev) => ({ ...prev, publishedFrom: e.target.value }))} title="Published from" className={inputCls} />
                <input type="date" value={ingestionFilters.publishedTo} onChange={(e) => setIngestionFilters((prev) => ({ ...prev, publishedTo: e.target.value }))} title="Published to" className={inputCls} />
                <select value={ingestionFilters.sortBy} onChange={(e) => setIngestionFilters((prev) => ({ ...prev, sortBy: e.target.value }))} className={inputCls}>
                  <option value="createdAt">Created</option>
                  <option value="scrapedAt">Scraped</option>
                  <option value="resolvedScope">Scope</option>
                  <option value="processingStatus">Status</option>
                </select>
                <select value={ingestionFilters.sortDir} onChange={(e) => setIngestionFilters((prev) => ({ ...prev, sortDir: e.target.value }))} className={inputCls}>
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </select>
                <div className="flex gap-2">
                  <button type="button" onClick={() => loadIngestionRecords(1)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors flex-1">Apply Filters</button>
                  <button type="button" onClick={resetIngestionFilters} className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${dark ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-100'}`} title="Reset all filters">Reset</button>
                </div>
              </div>

              {/* Ingestion table */}
              {ingestion.loading ? (
                <div className="flex items-center gap-2 py-8 justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  <span className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Loading ingestion records…</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className={`text-xs font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Total records: {ingestion.total}</div>
                  <div className={`overflow-x-auto rounded-lg border ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className={`text-left text-[11px] font-semibold uppercase tracking-wider ${dark ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                          <th className="px-3 py-2.5 w-8"></th>
                          <SortableHeader label="Source" field="source.name" sortBy={ingestionFilters.sortBy} sortDir={ingestionFilters.sortDir} onSort={handleIngestionSort} />
                          <SortableHeader label="Category" field="normalized.category" sortBy={ingestionFilters.sortBy} sortDir={ingestionFilters.sortDir} onSort={handleIngestionSort} />
                          <SortableHeader label="Title" field="normalized.title" sortBy={ingestionFilters.sortBy} sortDir={ingestionFilters.sortDir} onSort={handleIngestionSort} />
                          <SortableHeader label="Published" field="normalized.publishedAt" sortBy={ingestionFilters.sortBy} sortDir={ingestionFilters.sortDir} onSort={handleIngestionSort} />
                          <th className="px-3 py-2.5">Processed</th>
                          <SortableHeader label="Status" field="processingStatus" sortBy={ingestionFilters.sortBy} sortDir={ingestionFilters.sortDir} onSort={handleIngestionSort} />
                          <SortableHeader label="Scope" field="resolvedScope" sortBy={ingestionFilters.sortBy} sortDir={ingestionFilters.sortDir} onSort={handleIngestionSort} />
                          <th className="px-3 py-2.5">Topics</th>
                          <SortableHeader label="Locality" field="normalized.localityLevel" sortBy={ingestionFilters.sortBy} sortDir={ingestionFilters.sortDir} onSort={handleIngestionSort} />
                          <th className="px-3 py-2.5">Raw Location</th>
                          <th className="px-3 py-2.5">Text Match</th>
                          <th className="px-3 py-2.5">ZIP Code</th>
                          <th className="px-3 py-2.5">City</th>
                          <th className="px-3 py-2.5">State</th>
                          <th className="px-3 py-2.5 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${dark ? 'divide-gray-700' : 'divide-gray-100'}`}>
                        {ingestion.rows.map((row) => {
                          const loc = row.locationAssociations || {};
                          const zipCodes = (loc.zipCodes || []);
                          const cities = (loc.cities || []);
                          const states = (loc.states || []);
                          const assignedZip = row.normalized?.assignedZipCode || '';
                          const primaryZip = assignedZip || zipCodes[0] || '';
                          const primaryCity = cities[0] || '';
                          const primaryState = states[0] || '';
                          const hasLocationGap = !primaryZip || !primaryCity || !primaryState;
                          const isFailed = row.processingStatus === 'failed';
                          const isExpanded = expandedIngestionRows[row._id];
                          const detectedLocations = row.normalized?.locations || [];
                          const matchedLocationToken = row.locationDetection?.matchedToken || detectedLocations[0] || '';
                          const usedPlainTextLocation = row.locationDetection?.usedPlainText ?? Boolean(matchedLocationToken);
                          const category = row.normalized?.category || '';
                          const topics = row.normalized?.topics || [];

                          return (
                            <React.Fragment key={row._id}>
                              <tr
                                className={`transition-colors cursor-pointer ${isFailed ? 'bg-red-900/20 hover:bg-red-900/30' : (dark ? 'hover:bg-gray-700/50' : 'hover:bg-blue-50/40')}`}
                                onClick={() => toggleIngestionRow(row._id)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleIngestionRow(row._id); } }}
                                tabIndex={0}
                                role="row"
                                aria-expanded={isExpanded}
                                aria-label={`${row.normalized?.title || 'Untitled article'} from ${row.source?.name || 'unknown source'}`}
                              >
                                <td className={`px-3 py-2 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                                  <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
                                </td>
                                <td className={`px-3 py-2 font-medium max-w-[120px] truncate ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{row.source?.name || 'Unknown'}</td>
                                <td className={`px-3 py-2 max-w-[110px] truncate ${dark ? 'text-gray-300' : 'text-gray-700'}`} title={category}>
                                  {category || <span className={`italic ${dark ? 'text-gray-600' : 'text-gray-400'}`}>—</span>}
                                </td>
                                <td className={`px-3 py-2 font-medium max-w-[220px] truncate ${dark ? 'text-gray-200' : 'text-gray-900'}`} title={row.normalized?.title || ''}>
                                  {row.normalized?.title || <span className={`italic ${dark ? 'text-gray-600' : 'text-gray-400'}`}>untitled</span>}
                                </td>
                                <td className={`px-3 py-2 whitespace-nowrap ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{formatTimestampCell(row.normalized?.publishedAt)}</td>
                                <td className={`px-3 py-2 whitespace-nowrap ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{formatTimestampCell(getIngestedTimestamp(row))}</td>
                                <td className="px-3 py-2"><StatusBadge status={row.processingStatus} /></td>
                                <td className="px-3 py-2"><StatusBadge status={row.resolvedScope || 'global'} /></td>
                                <td className={`px-3 py-2 max-w-[140px] truncate ${dark ? 'text-gray-300' : 'text-gray-700'}`} title={topics.join(', ')}>
                                  {topics.length > 0 ? topics.join(', ') : <span className={`italic ${dark ? 'text-gray-600' : 'text-gray-400'}`}>—</span>}
                                </td>
                                <td className={`px-3 py-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{row.normalized?.localityLevel || 'global'}</td>
                                <td className={`px-3 py-2 max-w-[140px] truncate ${dark ? 'text-gray-300' : 'text-gray-700'}`} title={detectedLocations.join(', ')}>
                                  {detectedLocations.length > 0 ? detectedLocations.join(', ') : <span className={`italic ${dark ? 'text-gray-600' : 'text-gray-400'}`}>—</span>}
                                </td>
                                <td className={`px-3 py-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                                  {usedPlainTextLocation
                                    ? (<span>yes{matchedLocationToken ? ` · ${matchedLocationToken}` : ''}</span>)
                                    : <span className={`italic ${dark ? 'text-gray-600' : 'text-gray-400'}`}>no</span>}
                                </td>
                                <td className="px-3 py-2">
                                  {primaryZip ? <span className={`font-mono text-xs ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{primaryZip}</span> : <span className="text-amber-500 italic">—</span>}
                                </td>
                                <td className="px-3 py-2">
                                  {primaryCity ? <span className={dark ? 'text-gray-300' : 'text-gray-700'}>{primaryCity}</span> : <span className="text-amber-500 italic">—</span>}
                                </td>
                                <td className="px-3 py-2">
                                  {primaryState ? <span className={dark ? 'text-gray-300' : 'text-gray-700'}>{primaryState}</span> : <span className="text-amber-500 italic">—</span>}
                                </td>
                                <td className="px-3 py-2">
                                  {hasLocationGap && <span className="inline-block w-2 h-2 rounded-full bg-amber-400" title="Incomplete location data"></span>}
                                  {isFailed && <span className="inline-block w-2 h-2 rounded-full bg-red-500 ml-1" title="Processing failed"></span>}
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className={isFailed ? 'bg-red-900/10' : (dark ? 'bg-gray-800/50' : 'bg-gray-50/50')}>
                                  <td colSpan={INGESTION_TABLE_COL_COUNT} className="px-4 py-3">
                                    <div className="grid gap-3 md:grid-cols-3 text-xs">
                                      <div className={`rounded-lg border p-3 space-y-2 ${dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
                                        <h5 className={`font-semibold uppercase tracking-wide text-[10px] ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Article Processing</h5>
                                        <div className="space-y-1">
                                          <p><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Source:</span> {row.source?.name || 'Unknown'} <span className={dark ? 'text-gray-500' : 'text-gray-400'}>({row.source?.sourceType || 'N/A'})</span></p>
                                          <p><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Scope:</span> <StatusBadge status={row.resolvedScope} /></p>
                                          <p><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Dedupe:</span> <StatusBadge status={row.dedupe?.outcome} /></p>
                                          {row.persistence?.operation ? <p><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Persistence:</span> <StatusBadge status={row.persistence.operation} /></p> : null}
                                          {row.eventCount > 0 ? <p><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Events:</span> {row.eventCount}</p> : null}
                                          {row.persistence?.errorMessage ? <p className="text-red-500"><span className="font-medium">Error:</span> {row.persistence.errorMessage}</p> : null}
                                        </div>
                                        {(row.tags || []).length > 0 && (
                                          <div className="flex flex-wrap gap-1 pt-1">
                                            {row.tags.map((tag) => (
                                              <span key={tag} className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${dark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{tag}</span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className={`rounded-lg border p-3 space-y-2 ${dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
                                        <h5 className={`font-semibold uppercase tracking-wide text-[10px] ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Detected Location Data</h5>
                                        <div className="space-y-1">
                                          {detectedLocations.length > 0 ? (
                                            <p><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Raw locations:</span> {detectedLocations.join(', ')}</p>
                                          ) : (
                                            <p className={`italic ${dark ? 'text-gray-500' : 'text-gray-400'}`}>No raw location tokens detected</p>
                                          )}
                                          {(row.normalized?.topics || []).length > 0 && (
                                            <p><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Topics:</span> {row.normalized.topics.join(', ')}</p>
                                          )}
                                          <p><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Locality level:</span> {row.normalized?.localityLevel || 'global'}</p>
                                        </div>
                                      </div>
                                      <div className={`rounded-lg border p-3 space-y-2 ${dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
                                        <h5 className={`font-semibold uppercase tracking-wide text-[10px] ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Normalized Location</h5>
                                        <div className="space-y-1">
                                          <p>
                                            <span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>ZIP:</span>{' '}
                                            {primaryZip ? <span className="font-mono">{primaryZip}</span> : <span className="text-amber-500 italic">missing</span>}
                                            {zipCodes.length > 1 && <span className={`ml-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>(+{zipCodes.length - 1} more)</span>}
                                          </p>
                                          <p>
                                            <span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>City:</span>{' '}
                                            {primaryCity || <span className="text-amber-500 italic">missing</span>}
                                            {cities.length > 1 && <span className={`ml-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>(+{cities.length - 1} more)</span>}
                                          </p>
                                          <p>
                                            <span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>State:</span>{' '}
                                            {primaryState || <span className="text-amber-500 italic">missing</span>}
                                            {states.length > 1 && <span className={`ml-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>(+{states.length - 1} more)</span>}
                                          </p>
                                          {(loc.counties || []).length > 0 && (
                                            <p><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>County:</span> {loc.counties.join(', ')}</p>
                                          )}
                                          {(loc.countries || []).length > 0 && (
                                            <p><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Country:</span> {loc.countries.join(', ')}</p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="mt-2 flex justify-end">
                                      <button type="button" onClick={(e) => { e.stopPropagation(); openIngestionDetail(row._id); }} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 transition-colors">View full detail →</button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                    {ingestion.rows.length === 0 && (
                      <div className={`px-4 py-8 text-center text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>No ingestion records match your filters.</div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <button type="button" disabled={ingestion.page <= 1} onClick={() => loadIngestionRecords(Math.max(1, ingestion.page - 1))} className={`rounded-lg border px-3 py-1.5 disabled:opacity-40 transition-colors ${dark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'}`}>← Previous</button>
                    <span className={dark ? 'text-gray-400' : 'text-gray-500'}>Page {ingestion.page} / {ingestion.totalPages}</span>
                    <button type="button" disabled={ingestion.page >= ingestion.totalPages} onClick={() => loadIngestionRecords(Math.min(ingestion.totalPages, ingestion.page + 1))} className={`rounded-lg border px-3 py-1.5 disabled:opacity-40 transition-colors ${dark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'}`}>Next →</button>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* ── Security Events ── */}
          <CollapsibleSection id="security" title="Security Events" icon="🔒" collapsed={collapsedSections.security} onToggle={toggleSection} dark={dark}>
            <div className="space-y-2">
              {(overview?.recentSecurityEvents || []).length > 0 ? (
                <div className={`rounded-lg border overflow-hidden ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                  <table className="w-full text-xs">
                    <thead className={dark ? 'bg-gray-800' : 'bg-gray-50'}>
                      <tr className={`text-left ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <th className="px-3 py-2 font-medium">Severity</th>
                        <th className="px-3 py-2 font-medium">Event</th>
                        <th className="px-3 py-2 font-medium">User</th>
                        <th className="px-3 py-2 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${dark ? 'divide-gray-700' : 'divide-gray-100'}`}>
                      {overview.recentSecurityEvents.map((evt) => (
                        <tr key={evt._id} className={dark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-2">{evt.severity === 'critical' ? '🔴' : evt.severity === 'warning' ? '🟡' : '🔵'}</td>
                          <td className={`px-3 py-2 font-medium ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{evt.eventType}</td>
                          <td className={`px-3 py-2 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{evt.username ? `@${evt.username}` : '—'}</td>
                          <td className={`px-3 py-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{timeAgo(evt.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={`py-4 text-center text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>No recent security events</p>
              )}
            </div>
          </CollapsibleSection>

        </main>
      </div>

      {/* ── Ingestion Detail Modal ── */}
      {ingestionDetail.open ? (
        <Modal title="📰 Ingestion Record Detail" onClose={() => setIngestionDetail({ open: false, record: null, loading: false })} dark={dark}>
          {ingestionDetail.loading ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Loading…</span>
            </div>
          ) : ingestionDetail.record ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Title:</span> {ingestionDetail.record.normalized?.title || '—'}</div>
                <div><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Source:</span> {ingestionDetail.record.source?.name || '—'}</div>
                <div><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Status:</span> <StatusBadge status={ingestionDetail.record.processingStatus} /></div>
                <div><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Scope:</span> <StatusBadge status={ingestionDetail.record.resolvedScope} /></div>
              </div>
              {ingestionDetail.record.normalized?.summary && (
                <div><span className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Summary:</span> <p className="mt-1">{ingestionDetail.record.normalized.summary}</p></div>
              )}
              {(() => {
                const allLocs = formatAssociatedLocations(ingestionDetail.record.locationAssociations);
                return allLocs.length > 0 ? (
                  <div>
                    <p className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Locations:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {allLocs.map((loc) => (
                        <span key={loc} className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${dark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{loc}</span>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
              {ingestionTimeline.length > 0 && (
                <div>
                  <p className={`font-medium mb-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Timeline:</p>
                  <div className="space-y-1 text-xs">
                    {ingestionTimeline.map((entry, i) => (
                      <div key={i} className={`flex items-start gap-2 rounded-lg px-2 py-1 ${dark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                        <span className={dark ? 'text-gray-500' : 'text-gray-400'}>{formatTimestampCell(entry.timestamp)}</span>
                        <span>{entry.label || entry.event || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {ingestionLogs.length > 0 && (
                <div>
                  <p className={`font-medium mb-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Logs:</p>
                  <div className={`max-h-48 overflow-y-auto rounded-lg border p-2 font-mono text-xs ${dark ? 'border-gray-700 bg-gray-900 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                    {ingestionLogs.map((log, i) => (
                      <div key={i}>{typeof log === 'string' ? log : JSON.stringify(log)}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </Modal>
      ) : null}

      {/* ── Details Modal ── */}
      {details.open ? (
        <Modal title={`${SECTION_ICONS[details.section] || '📋'} ${SECTION_LABELS[details.section] || details.section}`} onClose={() => setDetails((prev) => ({ ...prev, open: false }))} dark={dark}>
          {details.loading ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Loading…</span>
            </div>
          ) : (
            <div className="space-y-3">
              {details.rows.map((row) => (
                <div key={`${row.type || details.section}-${row._id || `${row.userId}-${row.index}`}`} className={`rounded-xl border p-3 text-sm transition-colors ${dark ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'}`}>
                  {details.section === 'users' && (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>@{row.username} <span className={`font-normal ${dark ? 'text-gray-400' : 'text-gray-500'}`}>({row.realName || 'No name'})</span></p>
                        <p className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Status: <StatusBadge status={row.registrationStatus} /> • Moderation: <StatusBadge status={row.moderationStatus} /></p>
                      </div>
                      <button type="button" onClick={() => setActiveUser(row)} className="rounded-lg p-1.5 text-blue-500 hover:bg-blue-500/10">✏️</button>
                    </div>
                  )}
                  {details.section === 'posts' && (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
                          {row.author?.username ? `@${row.author.username}` : 'Unknown author'}
                          {row.author?._id ? <button type="button" onClick={() => setActiveUser(row.author)} className="ml-2 text-blue-500 hover:underline text-xs">edit</button> : null}
                        </p>
                        <p className={`mt-1 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{row.content || '(empty post)'}</p>
                        {row.createdAt ? <p className={`text-xs mt-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{new Date(row.createdAt).toLocaleString()}</p> : null}
                      </div>
                      <button type="button" onClick={() => handleDeletePost(row._id)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-500/10">🗑️</button>
                    </div>
                  )}
                  {details.section === 'messages' && (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
                          {row.user?.username ? `@${row.user.username}` : 'Unknown user'}
                          <StatusBadge status={row.type} className="ml-2" />
                          {row.user?._id ? <button type="button" onClick={() => setActiveUser(row.user)} className="ml-2 text-blue-500 hover:underline text-xs">edit</button> : null}
                        </p>
                        <p className={`mt-1 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{row.content || '(empty message)'}</p>
                        {row.createdAt ? <p className={`text-xs mt-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{new Date(row.createdAt).toLocaleString()}</p> : null}
                      </div>
                      <button type="button" onClick={() => handleDeleteMessage(row._id, row.type)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-500/10">🗑️</button>
                    </div>
                  )}
                  {details.section === 'infractions' && (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>@{row.username} • <StatusBadge status={row.action} /></p>
                        <p className={`mt-1 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{row.reason || '(no reason)'}</p>
                      </div>
                      <button type="button" onClick={() => handleRemoveInfraction(row)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-500/10">🗑️</button>
                    </div>
                  )}
                  {details.section === 'reports' && (
                    <div>
                      <p className={`font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{row.category} <StatusBadge status={row.status} className="ml-1" /> <StatusBadge status={row.priority} className="ml-1" /></p>
                      <p className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Reporter: {row.reporter?.username ? `@${row.reporter.username}` : 'Unknown'} → Target: {row.targetUser?.username ? `@${row.targetUser.username}` : 'Unknown'} ({row.targetType})
                      </p>
                      {row.description ? <p className={`mt-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{row.description}</p> : null}
                      {row.createdAt ? <p className={`text-xs mt-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{new Date(row.createdAt).toLocaleString()}</p> : null}
                    </div>
                  )}
                  {details.section === 'blocks' && (
                    <div>
                      <p className={`font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {row.blocker?.username ? `@${row.blocker.username}` : 'Unknown'} → {row.blocked?.username ? `@${row.blocked.username}` : 'Unknown'}
                      </p>
                      {row.reason ? <p className={`mt-1 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{row.reason}</p> : null}
                      {row.createdAt ? <p className={`text-xs mt-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{new Date(row.createdAt).toLocaleString()}</p> : null}
                    </div>
                  )}
                  {details.section === 'mutes' && (
                    <div>
                      <p className={`font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {row.muter?.username ? `@${row.muter.username}` : 'Unknown'} → {row.muted?.username ? `@${row.muted.username}` : 'Unknown'}
                      </p>
                      {row.createdAt ? <p className={`text-xs mt-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{new Date(row.createdAt).toLocaleString()}</p> : null}
                    </div>
                  )}
                  {details.section === 'rooms' && (
                    <div>
                      <p className={`font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{row.name || '(unnamed room)'}</p>
                      {row.description ? <p className={`mt-1 text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{row.description}</p> : null}
                      {row.createdAt ? <p className={`text-xs mt-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{new Date(row.createdAt).toLocaleString()}</p> : null}
                    </div>
                  )}
                  {details.section === 'conversations' && (
                    <div>
                      <p className={`font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{row.title || '(unnamed conversation)'} <StatusBadge status={row.type} className="ml-1" /></p>
                      <p className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Participants: {(row.participants || []).map((p) => p.username ? `@${p.username}` : 'Unknown').join(', ') || 'None'}
                      </p>
                      {row.createdAt ? <p className={`text-xs mt-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{new Date(row.createdAt).toLocaleString()}</p> : null}
                    </div>
                  )}
                </div>
              ))}
              {details.rows.length === 0 && (
                <p className={`py-8 text-center text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>No records found.</p>
              )}
              <div className="flex items-center justify-between text-xs pt-2">
                <button type="button" disabled={details.page <= 1} onClick={() => openDetails(details.section, Math.max(1, details.page - 1))} className={`rounded-lg border px-3 py-1.5 disabled:opacity-40 transition-colors ${dark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'}`}>← Previous</button>
                <span className={dark ? 'text-gray-400' : 'text-gray-500'}>Page {details.page} / {details.totalPages}</span>
                <button type="button" disabled={details.page >= details.totalPages} onClick={() => openDetails(details.section, Math.min(details.totalPages, details.page + 1))} className={`rounded-lg border px-3 py-1.5 disabled:opacity-40 transition-colors ${dark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'}`}>Next →</button>
              </div>
            </div>
          )}
        </Modal>
      ) : null}

      {/* ── User Action Modal ── */}
      {activeUser ? (
        <Modal title={`✏️ Manage @${activeUser.username}`} onClose={() => { setActiveUser(null); setTempPassword(''); }} dark={dark}>
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className={dark ? 'text-gray-400' : 'text-gray-500'}>Username</p>
                <p className={`font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>@{activeUser.username}</p>
              </div>
              <div>
                <p className={dark ? 'text-gray-400' : 'text-gray-500'}>Real name</p>
                <p className={`font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{activeUser.realName || 'N/A'}</p>
              </div>
              <div>
                <p className={dark ? 'text-gray-400' : 'text-gray-500'}>Registration</p>
                <StatusBadge status={activeUser.registrationStatus} />
              </div>
              <div>
                <p className={dark ? 'text-gray-400' : 'text-gray-500'}>Moderation</p>
                <StatusBadge status={activeUser.moderationStatus} />
              </div>
              {activeUser.mutedUntil && (
                <div className="sm:col-span-2">
                  <p className={dark ? 'text-gray-400' : 'text-gray-500'}>Muted until</p>
                  <p className="text-amber-500 font-semibold">{new Date(activeUser.mutedUntil).toLocaleString()}</p>
                  {activeUser.muteReason && <p className={`text-xs mt-0.5 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Reason: {activeUser.muteReason}</p>}
                </div>
              )}
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>Reason / notes</label>
              <textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)} className={`w-full rounded-lg border p-3 text-sm outline-none ${dark ? 'border-gray-600 bg-gray-700 text-gray-200 focus:border-blue-500' : 'border-gray-200 bg-white text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400'}`} rows={3} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => handleResetPassword(activeUser._id)} className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition-colors">Reset password</button>
              <button type="button" onClick={() => handleDeleteUser(activeUser._id)} className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 transition-colors">Delete user</button>
            </div>
            {tempPassword ? (
              <div className={`rounded-xl border p-4 ${dark ? 'border-yellow-600 bg-yellow-900/30' : 'border-yellow-300 bg-yellow-50'}`}>
                <p className={`font-semibold ${dark ? 'text-yellow-400' : 'text-yellow-800'}`}>Temporary one-time password</p>
                <p className="font-mono text-lg mt-1">{tempPassword}</p>
              </div>
            ) : null}
            <div className={`rounded-xl border p-4 space-y-3 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
              <p className={`font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>Mute controls</p>
              <select value={muteDurationKey} onChange={(e) => setMuteDurationKey(e.target.value)} className={`rounded-lg border px-3 py-1.5 text-sm outline-none ${dark ? 'border-gray-600 bg-gray-700 text-gray-200' : 'border-gray-200 bg-white text-gray-900 focus:border-blue-400'}`}>
                {muteDurations.map((duration) => <option key={duration} value={duration}>{duration}</option>)}
              </select>
              <div className="flex gap-2">
                <button type="button" onClick={handleMuteUser} className="rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700 transition-colors">Apply mute</button>
                <button type="button" onClick={handleUnmuteUser} className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${dark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'}`}>Remove mute</button>
              </div>
            </div>
            <div className={`rounded-xl border p-4 space-y-3 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
              <p className={`font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>Infractions</p>
              <select value={infractionAction} onChange={(e) => setInfractionAction(e.target.value)} className={`rounded-lg border px-3 py-1.5 text-sm outline-none ${dark ? 'border-gray-600 bg-gray-700 text-gray-200' : 'border-gray-200 bg-white text-gray-900 focus:border-blue-400'}`}>
                <option value="warning">warning</option>
                <option value="suspension">suspension</option>
                <option value="ban">ban</option>
              </select>
              <button type="button" onClick={handleAddInfraction} className="rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors">Apply infraction</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export default ModerationDashboard;
