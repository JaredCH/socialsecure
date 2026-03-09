import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { moderationAPI } from '../utils/api';

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

const StatusBadge = ({ status, className = '' }) => {
  const colors = {
    processed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    inserted: 'bg-blue-100 text-blue-700',
    updated: 'bg-amber-100 text-amber-700',
    duplicate: 'bg-gray-100 text-gray-600',
    error: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
    under_review: 'bg-blue-100 text-blue-700',
    resolved: 'bg-emerald-100 text-emerald-700',
    dismissed: 'bg-gray-100 text-gray-600',
    insert: 'bg-blue-100 text-blue-700',
    update: 'bg-amber-100 text-amber-700',
    skip: 'bg-gray-100 text-gray-600',
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
    warn: 'bg-yellow-100 text-yellow-700',
    debug: 'bg-gray-100 text-gray-500'
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'} ${className}`}>
      {status}
    </span>
  );
};

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-hidden border border-gray-200">
      <div className="flex items-center justify-between border-b bg-gray-50 px-5 py-3">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 transition-colors">✕ Close</button>
      </div>
      <div className="p-5 overflow-auto max-h-[80vh]">{children}</div>
    </div>
  </div>
);

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
const getIngestedTimestamp = (record = {}) => record.ingestedAt || record.createdAt || null;

function ModerationDashboard() {
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
    zipCode: '',
    region: '',
    processingStatus: '',
    sortBy: 'createdAt',
    sortDir: 'desc'
  });
  const [ingestion, setIngestion] = useState({ rows: [], page: 1, totalPages: 1, total: 0, loading: false });
  const [ingestionDetail, setIngestionDetail] = useState({ open: false, record: null, loading: false });
  const [ingestionTimeline, setIngestionTimeline] = useState([]);
  const [ingestionLogs, setIngestionLogs] = useState([]);

  const muteDurations = useMemo(() => overview?.muteDurations || FALLBACK_MUTE_DURATIONS, [overview]);

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

  useEffect(() => {
    loadOverview();
    loadIngestionRecords(1);
  }, []);

  const loadIngestionRecords = async (page = ingestion.page || 1, filters = ingestionFilters) => {
    setIngestion((prev) => ({ ...prev, loading: true }));
    try {
      const { data } = await moderationAPI.getNewsIngestionRecords({ ...filters, page, limit: 20 });
      setIngestion({
        rows: Array.isArray(data.records) ? data.records : [],
        page: data.pagination?.page || page,
        totalPages: data.pagination?.totalPages || 1,
        total: data.pagination?.total || 0,
        loading: false
      });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load ingestion observability');
      setIngestion((prev) => ({ ...prev, loading: false }));
    }
  };

  const openIngestionDetail = async (recordId) => {
    setIngestionDetail({ open: true, record: null, loading: true });
    try {
      const [{ data: detailData }, { data: timelineData }, { data: logsData }] = await Promise.all([
        moderationAPI.getNewsIngestionRecord(recordId),
        moderationAPI.getNewsIngestionTimeline(recordId),
        moderationAPI.getNewsIngestionLogs(recordId)
      ]);
      setIngestionDetail({ open: true, record: detailData.record || null, loading: false });
      setIngestionTimeline(Array.isArray(timelineData.timeline) ? timelineData.timeline : []);
      setIngestionLogs(Array.isArray(logsData.logs) ? logsData.logs : []);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load ingestion record detail');
      setIngestionDetail({ open: true, record: null, loading: false });
      setIngestionTimeline([]);
      setIngestionLogs([]);
    }
  };

  const openDetails = async (section, page = 1) => {
    setDetails((prev) => ({ ...prev, open: true, section, loading: true }));
    try {
      const { data } = await moderationAPI.getControlPanelDetails({ section, page, limit: 30 });
      setDetails({
        open: true,
        section,
        rows: Array.isArray(data.rows) ? data.rows : [],
        page: data.pagination?.page || page,
        totalPages: data.pagination?.totalPages || 1,
        loading: false
      });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load details');
      setDetails((prev) => ({ ...prev, loading: false }));
    }
  };

  const refreshAll = async () => {
    await Promise.all([
      loadOverview(),
      details.open ? openDetails(details.section, details.page) : Promise.resolve(),
      loadIngestionRecords(ingestion.page || 1)
    ]);
  };

  const handleDeletePost = async (postId) => {
    try {
      await moderationAPI.deletePostByAdmin(postId);
      toast.success('Post deleted');
      await refreshAll();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete post');
    }
  };

  const handleDeleteMessage = async (messageId, type) => {
    try {
      await moderationAPI.deleteMessageByAdmin(messageId, type);
      toast.success('Message deleted');
      await refreshAll();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete message');
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

  const handleResetPassword = async (userId) => {
    try {
      const { data } = await moderationAPI.resetUserPassword(userId);
      setTempPassword(data.temporaryPassword || '');
      toast.success('Temporary password generated');
      await refreshAll();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to reset password');
    }
  };

  const handleMuteUser = async () => {
    if (!activeUser?._id) return;
    try {
      await moderationAPI.muteUserByAdmin(activeUser._id, { durationKey: muteDurationKey, reason: actionReason });
      toast.success('User muted');
      await refreshAll();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to mute user');
    }
  };

  const handleUnmuteUser = async () => {
    if (!activeUser?._id) return;
    try {
      await moderationAPI.unmuteUserByAdmin(activeUser._id);
      toast.success('User unmuted');
      await refreshAll();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to unmute user');
    }
  };

  const handleAddInfraction = async () => {
    if (!activeUser?._id) return;
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading control panel…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-8">
      <div className="rounded-2xl bg-gradient-to-r from-gray-900 to-gray-700 px-6 py-5 text-white shadow-lg">
        <h1 className="text-2xl font-bold">Control Panel</h1>
        <p className="mt-1 text-sm text-gray-300">High-level command center for users, posts, chat activity, reports, and moderation actions.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Object.entries(overview?.totals || {}).map(([key, value]) => (
          <button
            key={key}
            type="button"
            onClick={() => openDetails(TOTAL_KEY_TO_SECTION[key] || 'users')}
            className="group relative rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md hover:border-blue-400 hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{SECTION_ICONS[key] || '📊'}</span>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
            </div>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-500">{SECTION_LABELS[key] || key}</p>
            <p className="mt-1 text-[11px] text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Click for details →</p>
          </button>
        ))}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b bg-gray-50 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">Recent Activity</h2>
          <div className="flex flex-wrap gap-1.5">
            {['users', 'posts', 'messages', 'infractions', 'reports'].map((s) => (
              <button key={s} type="button" onClick={() => openDetails(s)} className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors capitalize">{s}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-px bg-gray-100 md:grid-cols-3">
          <div className="bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">👥 Users</p>
            <ul className="space-y-2 text-sm">
              {(overview?.recents?.users || []).slice(0, 6).map((user) => (
                <li key={user._id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                  <span className="font-medium text-gray-800">@{user.username}</span>
                  <button type="button" onClick={() => setActiveUser(user)} className="rounded p-1 text-blue-600 hover:bg-blue-50">✏️</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">📝 Posts</p>
            <ul className="space-y-2 text-sm">
              {(overview?.recents?.posts || []).slice(0, 6).map((post) => (
                <li key={post._id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                  <span className="truncate text-gray-700">{post.content || '(empty)'}</span>
                  <button type="button" onClick={() => handleDeletePost(post._id)} className="rounded p-1 text-red-600 hover:bg-red-50">🗑️</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">💬 Messages</p>
            <ul className="space-y-2 text-sm">
              {(overview?.recents?.messages || []).slice(0, 6).map((message) => (
                <li key={`${message.type}:${message._id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                  <span className="truncate text-gray-700">{message.content || '(empty)'}</span>
                  <button type="button" onClick={() => handleDeleteMessage(message._id, message.type)} className="rounded p-1 text-red-600 hover:bg-red-50">🗑️</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gray-50 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">📰 News Ingestion Observability</h2>
            <p className="text-xs text-gray-500 mt-0.5">Inspect scraped records, dedupe outcomes, ingestion timing, associated locations, persistence details, and processing logs.</p>
          </div>
          <button type="button" onClick={() => loadIngestionRecords(1)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition-colors">↻ Refresh</button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid gap-2 md:grid-cols-4">
            <input
              value={ingestionFilters.source}
              onChange={(e) => setIngestionFilters((prev) => ({ ...prev, source: e.target.value }))}
              placeholder="Source"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
            />
            <input
              value={ingestionFilters.tag}
              onChange={(e) => setIngestionFilters((prev) => ({ ...prev, tag: e.target.value }))}
              placeholder="Tag"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
            />
            <input
              value={ingestionFilters.zipCode}
              onChange={(e) => setIngestionFilters((prev) => ({ ...prev, zipCode: e.target.value }))}
              placeholder="ZIP"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
            />
            <select
              value={ingestionFilters.region}
              onChange={(e) => setIngestionFilters((prev) => ({ ...prev, region: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
            >
              <option value="">All scopes</option>
              <option value="local">Local</option>
              <option value="regional">Regional</option>
              <option value="national">National</option>
              <option value="global">Global</option>
            </select>
            <select
              value={ingestionFilters.processingStatus}
              onChange={(e) => setIngestionFilters((prev) => ({ ...prev, processingStatus: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
            >
              <option value="">Any status</option>
              <option value="processed">Processed</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={ingestionFilters.sortBy}
              onChange={(e) => setIngestionFilters((prev) => ({ ...prev, sortBy: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
            >
              <option value="createdAt">Created</option>
              <option value="scrapedAt">Scraped</option>
              <option value="resolvedScope">Scope</option>
              <option value="processingStatus">Status</option>
            </select>
            <select
              value={ingestionFilters.sortDir}
              onChange={(e) => setIngestionFilters((prev) => ({ ...prev, sortDir: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
            <button
              type="button"
              onClick={() => loadIngestionRecords(1)}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
            >
              Apply Filters
            </button>
          </div>
          {ingestion.loading ? (
            <div className="flex items-center gap-2 py-8 justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span className="text-sm text-gray-500">Loading ingestion records…</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-medium text-gray-500">Total records: {ingestion.total}</div>
              <div className="divide-y rounded-xl border border-gray-200 overflow-hidden">
                {ingestion.rows.map((row) => (
                  <button
                    type="button"
                    key={row._id}
                    onClick={() => openIngestionDetail(row._id)}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{row.normalized?.title || '(untitled)'}</p>
                        {row.normalized?.description ? (
                          <p className="text-xs text-gray-500 truncate mt-0.5">{row.normalized.description}</p>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                          <span className="text-xs text-gray-500">{row.source?.name || 'Unknown source'}</span>
                          <StatusBadge status={row.resolvedScope} />
                          <StatusBadge status={row.dedupe?.outcome} />
                          <StatusBadge status={row.processingStatus} />
                          {row.normalized?.assignedZipCode ? <span className="text-xs text-gray-500">📍 {row.normalized.assignedZipCode}</span> : null}
                          {row.eventCount > 0 ? <span className="text-xs text-gray-400">{row.eventCount} events</span> : null}
                        </div>
                        {formatAssociatedLocations(row.locationAssociations).length > 0 ? (
                          <p className="text-[11px] text-gray-500 mt-1 truncate">
                            Associated: {formatAssociatedLocations(row.locationAssociations).join(' • ')}
                          </p>
                        ) : null}
                        {(row.tags || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {row.tags.slice(0, 5).map((tag) => (
                              <span key={tag} className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{tag}</span>
                            ))}
                            {row.tags.length > 5 ? <span className="text-[11px] text-gray-400">+{row.tags.length - 5}</span> : null}
                          </div>
                        ) : null}
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(getIngestedTimestamp(row)).toLocaleString()}</span>
                    </div>
                  </button>
                ))}
                {ingestion.rows.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">No ingestion records match your filters.</div>
                ) : null}
              </div>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  disabled={ingestion.page <= 1}
                  onClick={() => loadIngestionRecords(Math.max(1, ingestion.page - 1))}
                  className="rounded-lg border px-3 py-1.5 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  ← Previous
                </button>
                <span className="text-gray-500">Page {ingestion.page} / {ingestion.totalPages}</span>
                <button
                  type="button"
                  disabled={ingestion.page >= ingestion.totalPages}
                  onClick={() => loadIngestionRecords(Math.min(ingestion.totalPages, ingestion.page + 1))}
                  className="rounded-lg border px-3 py-1.5 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {details.open ? (
        <Modal title={`${SECTION_ICONS[details.section] || '📋'} ${SECTION_LABELS[details.section] || details.section}`} onClose={() => setDetails((prev) => ({ ...prev, open: false }))}>
          {details.loading ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span className="text-sm text-gray-500">Loading…</span>
            </div>
          ) : (
            <div className="space-y-3">
              {details.rows.map((row) => (
                <div key={`${row.type || details.section}-${row._id || `${row.userId}-${row.index}`}`} className="rounded-xl border border-gray-200 p-4 text-sm hover:border-gray-300 transition-colors">
                  {details.section === 'users' && (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">@{row.username} <span className="font-normal text-gray-500">({row.realName || 'No name'})</span></p>
                        <p className="text-xs text-gray-500 mt-1">Status: <StatusBadge status={row.registrationStatus} /> • Moderation: <StatusBadge status={row.moderationStatus} /></p>
                      </div>
                      <button type="button" onClick={() => setActiveUser(row)} className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50">✏️</button>
                    </div>
                  )}

                  {details.section === 'posts' && (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {row.author?.username ? `@${row.author.username}` : 'Unknown author'}
                          {row.author?._id ? <button type="button" onClick={() => setActiveUser(row.author)} className="ml-2 text-blue-600 hover:underline text-xs">edit</button> : null}
                        </p>
                        <p className="text-gray-700 mt-1">{row.content || '(empty post)'}</p>
                        {row.createdAt ? <p className="text-xs text-gray-400 mt-1">{new Date(row.createdAt).toLocaleString()}</p> : null}
                      </div>
                      <button type="button" onClick={() => handleDeletePost(row._id)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50">🗑️</button>
                    </div>
                  )}

                  {details.section === 'messages' && (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {row.user?.username ? `@${row.user.username}` : 'Unknown user'}
                          <StatusBadge status={row.type} className="ml-2" />
                          {row.user?._id ? <button type="button" onClick={() => setActiveUser(row.user)} className="ml-2 text-blue-600 hover:underline text-xs">edit</button> : null}
                        </p>
                        <p className="text-gray-700 mt-1">{row.content || '(empty message)'}</p>
                        {row.createdAt ? <p className="text-xs text-gray-400 mt-1">{new Date(row.createdAt).toLocaleString()}</p> : null}
                      </div>
                      <button type="button" onClick={() => handleDeleteMessage(row._id, row.type)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50">🗑️</button>
                    </div>
                  )}

                  {details.section === 'infractions' && (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">@{row.username} • <StatusBadge status={row.action} /></p>
                        <p className="text-gray-700 mt-1">{row.reason || '(no reason)'}</p>
                      </div>
                      <button type="button" onClick={() => handleRemoveInfraction(row)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50">🗑️</button>
                    </div>
                  )}

                  {details.section === 'reports' && (
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900">{row.category} <StatusBadge status={row.status} className="ml-1" /> <StatusBadge status={row.priority} className="ml-1" /></p>
                          <p className="text-xs text-gray-500 mt-1">
                            Reporter: {row.reporter?.username ? `@${row.reporter.username}` : 'Unknown'} → Target: {row.targetUser?.username ? `@${row.targetUser.username}` : 'Unknown'} ({row.targetType})
                          </p>
                        </div>
                      </div>
                      {row.description ? <p className="text-gray-700 mt-2">{row.description}</p> : null}
                      {row.createdAt ? <p className="text-xs text-gray-400 mt-1">{new Date(row.createdAt).toLocaleString()}</p> : null}
                    </div>
                  )}

                  {details.section === 'blocks' && (
                    <div>
                      <p className="font-semibold text-gray-900">
                        {row.user?.username ? `@${row.user.username}` : 'Unknown'} blocked {row.blockedUser?.username ? `@${row.blockedUser.username}` : 'Unknown'}
                      </p>
                      {row.reason ? <p className="text-gray-700 mt-1">{row.reason}</p> : null}
                      {row.createdAt ? <p className="text-xs text-gray-400 mt-1">{new Date(row.createdAt).toLocaleString()}</p> : null}
                    </div>
                  )}

                  {details.section === 'mutes' && (
                    <div>
                      <p className="font-semibold text-gray-900">
                        {row.user?.username ? `@${row.user.username}` : 'Unknown'} muted {row.mutedUser?.username ? `@${row.mutedUser.username}` : 'Unknown'}
                      </p>
                      {row.expiresAt ? <p className="text-xs text-gray-500 mt-1">Expires: {new Date(row.expiresAt).toLocaleString()}</p> : null}
                      {row.createdAt ? <p className="text-xs text-gray-400 mt-1">{new Date(row.createdAt).toLocaleString()}</p> : null}
                    </div>
                  )}

                  {details.section === 'rooms' && (
                    <div>
                      <p className="font-semibold text-gray-900">{row.name || '(unnamed room)'} <StatusBadge status={row.type} className="ml-1" /></p>
                      <p className="text-xs text-gray-500 mt-1">
                        {[row.city, row.state].filter(Boolean).join(', ') || 'No location'} {row.zipCode ? `• ZIP ${row.zipCode}` : ''}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{row.messageCount} messages • Last active: {row.lastActivity ? new Date(row.lastActivity).toLocaleString() : 'Never'}</p>
                    </div>
                  )}

                  {details.section === 'conversations' && (
                    <div>
                      <p className="font-semibold text-gray-900">{row.title || '(untitled conversation)'} <StatusBadge status={row.type} className="ml-1" /></p>
                      {row.zipCode ? <p className="text-xs text-gray-500 mt-1">ZIP: {row.zipCode}</p> : null}
                      <p className="text-xs text-gray-500 mt-0.5">{row.messageCount} messages • Last message: {row.lastMessageAt ? new Date(row.lastMessageAt).toLocaleString() : 'None'}</p>
                    </div>
                  )}
                </div>
              ))}
              {details.rows.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">No records found for this section.</div>
              ) : null}
              <div className="flex items-center justify-between pt-2">
                <button type="button" onClick={() => openDetails(details.section, Math.max(details.page - 1, 1))} disabled={details.page <= 1} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50 transition-colors">← Prev</button>
                <p className="text-xs text-gray-500">Page {details.page} of {details.totalPages}</p>
                <button type="button" onClick={() => openDetails(details.section, Math.min(details.page + 1, details.totalPages))} disabled={details.page >= details.totalPages} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50 transition-colors">Next →</button>
              </div>
            </div>
          )}
        </Modal>
      ) : null}

      {ingestionDetail.open ? (
        <Modal title="📰 News Ingestion Record Detail" onClose={() => setIngestionDetail({ open: false, record: null, loading: false })}>
          {ingestionDetail.loading ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span className="text-sm text-gray-500">Loading…</span>
            </div>
          ) : ingestionDetail.record ? (
            <div className="space-y-5 text-sm">
              <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Overview</h4>
                <p className="text-base font-semibold text-gray-900">{ingestionDetail.record.normalized?.title || '(untitled)'}</p>
                {ingestionDetail.record.normalized?.description ? (
                  <p className="text-gray-600">{ingestionDetail.record.normalized.description}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={ingestionDetail.record.processingStatus} />
                  <StatusBadge status={ingestionDetail.record.resolvedScope} />
                  <StatusBadge status={ingestionDetail.record.dedupe?.outcome} />
                  {ingestionDetail.record.persistence?.operation ? <StatusBadge status={ingestionDetail.record.persistence.operation} /> : null}
                </div>
                {ingestionDetail.record.normalized?.url ? (
                  <p className="text-xs"><span className="font-medium text-gray-500">URL:</span>{' '}
                    <a href={ingestionDetail.record.normalized.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{ingestionDetail.record.normalized.url}</a>
                  </p>
                ) : null}
                {(ingestionDetail.record.tags || []).length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {ingestionDetail.record.tags.map((tag) => (
                      <span key={tag} className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{tag}</span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-gray-200 p-4 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Source</h4>
                  <div className="space-y-1 text-xs">
                    <p><span className="font-medium text-gray-500">Name:</span> {ingestionDetail.record.source?.name || 'Unknown'}</p>
                    <p><span className="font-medium text-gray-500">Type:</span> {ingestionDetail.record.source?.sourceType || 'N/A'}</p>
                    {ingestionDetail.record.source?.sourceId ? <p><span className="font-medium text-gray-500">Source ID:</span> {ingestionDetail.record.source.sourceId}</p> : null}
                    {ingestionDetail.record.source?.providerId ? <p><span className="font-medium text-gray-500">Provider ID:</span> {ingestionDetail.record.source.providerId}</p> : null}
                    {ingestionDetail.record.source?.url ? (
                      <p><span className="font-medium text-gray-500">Feed URL:</span>{' '}
                        <a href={ingestionDetail.record.source.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{ingestionDetail.record.source.url}</a>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Normalized Data</h4>
                  <div className="space-y-1 text-xs">
                    {ingestionDetail.record.normalized?.publishedAt ? <p><span className="font-medium text-gray-500">Published:</span> {new Date(ingestionDetail.record.normalized.publishedAt).toLocaleString()}</p> : null}
                    {getIngestedTimestamp(ingestionDetail.record) ? (
                      <p><span className="font-medium text-gray-500">Ingested:</span> {new Date(getIngestedTimestamp(ingestionDetail.record)).toLocaleString()}</p>
                    ) : null}
                    <p><span className="font-medium text-gray-500">ZIP:</span> {ingestionDetail.record.normalized?.assignedZipCode || 'N/A'}</p>
                    <p><span className="font-medium text-gray-500">Locality:</span> {ingestionDetail.record.normalized?.localityLevel || 'N/A'}</p>
                    <p><span className="font-medium text-gray-500">Language:</span> {ingestionDetail.record.normalized?.language || 'en'}</p>
                    {(ingestionDetail.record.locationAssociations?.cities || []).length > 0 ? (
                      <p><span className="font-medium text-gray-500">Cities:</span> {ingestionDetail.record.locationAssociations.cities.join(', ')}</p>
                    ) : null}
                    {(ingestionDetail.record.normalized?.locations || []).length > 0 ? (
                      <p><span className="font-medium text-gray-500">Locations:</span> {ingestionDetail.record.normalized.locations.join(', ')}</p>
                    ) : null}
                    {(ingestionDetail.record.normalized?.topics || []).length > 0 ? (
                      <p><span className="font-medium text-gray-500">Topics:</span> {ingestionDetail.record.normalized.topics.join(', ')}</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Deduplication</h4>
                  <div className="space-y-1 text-xs">
                    <p><span className="font-medium text-gray-500">Outcome:</span> <StatusBadge status={ingestionDetail.record.dedupe?.outcome} /></p>
                    {ingestionDetail.record.dedupe?.reason ? <p><span className="font-medium text-gray-500">Reason:</span> {ingestionDetail.record.dedupe.reason}</p> : null}
                    {ingestionDetail.record.dedupe?.existingArticleId ? <p><span className="font-medium text-gray-500">Existing Article:</span> {ingestionDetail.record.dedupe.existingArticleId}</p> : null}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Persistence</h4>
                  <div className="space-y-1 text-xs">
                    <p><span className="font-medium text-gray-500">Operation:</span> <StatusBadge status={ingestionDetail.record.persistence?.operation} /></p>
                    {ingestionDetail.record.persistence?.articleId ? <p><span className="font-medium text-gray-500">Article ID:</span> {ingestionDetail.record.persistence.articleId}</p> : null}
                    {ingestionDetail.record.persistence?.persistedAt ? <p><span className="font-medium text-gray-500">Persisted:</span> {new Date(ingestionDetail.record.persistence.persistedAt).toLocaleString()}</p> : null}
                    {ingestionDetail.record.persistence?.errorCode ? <p><span className="font-medium text-gray-500">Error Code:</span> <span className="text-red-600">{ingestionDetail.record.persistence.errorCode}</span></p> : null}
                    {ingestionDetail.record.persistence?.errorMessage ? <p><span className="font-medium text-gray-500">Error:</span> <span className="text-red-600">{ingestionDetail.record.persistence.errorMessage}</span></p> : null}
                  </div>
                </div>
              </div>

              {ingestionDetail.record.persistedArticle ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-1">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-600">Persisted Article</h4>
                  <p className="text-sm font-medium text-gray-900">{ingestionDetail.record.persistedArticle.title || '(untitled)'}</p>
                  <p className="text-xs text-gray-600">
                    ID: {ingestionDetail.record.persistedArticle._id}
                    {ingestionDetail.record.persistedArticle.publishedAt ? ` • Published: ${new Date(ingestionDetail.record.persistedArticle.publishedAt).toLocaleString()}` : ''}
                  </p>
                </div>
              ) : null}

              <div className="rounded-xl border border-gray-200 p-4 space-y-1 text-xs">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Metadata</h4>
                <p><span className="font-medium text-gray-500">Ingestion Run:</span> {ingestionDetail.record.ingestionRunId || 'N/A'}</p>
                {ingestionDetail.record.scrapedAt ? <p><span className="font-medium text-gray-500">Scraped:</span> {new Date(ingestionDetail.record.scrapedAt).toLocaleString()}</p> : null}
                {ingestionDetail.record.createdAt ? <p><span className="font-medium text-gray-500">Created:</span> {new Date(ingestionDetail.record.createdAt).toLocaleString()}</p> : null}
                {ingestionDetail.record.updatedAt ? <p><span className="font-medium text-gray-500">Updated:</span> {new Date(ingestionDetail.record.updatedAt).toLocaleString()}</p> : null}
              </div>

              {ingestionTimeline.length > 0 ? (
                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Timeline ({ingestionTimeline.length} events)</h4>
                  <div className="space-y-2">
                    {ingestionTimeline.map((entry, idx) => (
                      <div key={`${entry.timestamp}-${entry.eventType}-${idx}`} className="flex items-start gap-3 text-xs">
                        <StatusBadge status={entry.severity} className="mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800">{entry.eventType}</p>
                          <p className="text-gray-600">{entry.message}</p>
                          {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
                            <pre className="mt-1 rounded bg-gray-50 p-1.5 text-[11px] text-gray-500 overflow-x-auto">{JSON.stringify(entry.metadata, null, 2)}</pre>
                          ) : null}
                        </div>
                        <span className="text-gray-400 whitespace-nowrap shrink-0">{new Date(entry.timestamp).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {ingestionLogs.length > 0 ? (
                <div className="rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Log Events ({ingestionLogs.length})</h4>
                  <div className="space-y-1.5 font-mono text-[11px]">
                    {ingestionLogs.map((entry, idx) => (
                      <div key={`${entry.timestamp}-${entry.eventType}-log-${idx}`} className="flex items-start gap-2">
                        <span className="text-gray-400 shrink-0">[{new Date(entry.timestamp).toLocaleTimeString()}]</span>
                        <StatusBadge status={entry.severity} className="shrink-0" />
                        <span className="text-gray-700">{entry.eventType}: {entry.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No record selected.</p>
          )}
        </Modal>
      ) : null}

      {activeUser ? (
        <Modal title={`⚙️ Modify @${activeUser.username || 'user'}`} onClose={() => { setActiveUser(null); setTempPassword(''); }}>
          <div className="space-y-5 text-sm">
            <p><span className="font-semibold">Name:</span> {activeUser.realName || 'N/A'}</p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Reason / notes</label>
              <textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)} className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none" rows={3} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => handleResetPassword(activeUser._id)} className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition-colors">Reset password</button>
              <button type="button" onClick={() => handleDeleteUser(activeUser._id)} className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 transition-colors">Delete user</button>
            </div>
            {tempPassword ? (
              <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4">
                <p className="font-semibold text-yellow-800">Temporary one-time password</p>
                <p className="font-mono text-lg mt-1">{tempPassword}</p>
              </div>
            ) : null}

            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="font-semibold text-gray-900">Mute controls</p>
              <select value={muteDurationKey} onChange={(e) => setMuteDurationKey(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 outline-none">
                {muteDurations.map((duration) => <option key={duration} value={duration}>{duration}</option>)}
              </select>
              <div className="flex gap-2">
                <button type="button" onClick={handleMuteUser} className="rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700 transition-colors">Apply mute</button>
                <button type="button" onClick={handleUnmuteUser} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors">Remove mute</button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="font-semibold text-gray-900">Infractions</p>
              <select value={infractionAction} onChange={(e) => setInfractionAction(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 outline-none">
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
