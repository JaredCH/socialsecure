import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { moderationAPI } from '../utils/api';

const SECTION_LABELS = {
  users: 'Users',
  posts: 'Posts',
  allMessages: 'Chat Messages',
  reports: 'Reports',
  blocks: 'Blocks',
  mutes: 'Mutes',
  rooms: 'Chat Rooms',
  conversations: 'Conversations'
};

const FALLBACK_MUTE_DURATIONS = ['24h', '48h', '72h', '5d', '7d', '1m', 'forever'];
const TOTAL_KEY_TO_SECTION = {
  users: 'users',
  posts: 'posts',
  chatRoomMessages: 'messages',
  directMessages: 'messages',
  allMessages: 'messages',
  reports: 'infractions',
  blocks: 'users',
  mutes: 'users',
  rooms: 'messages',
  conversations: 'messages'
};

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
    <div className="w-full max-w-4xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">Close</button>
      </div>
      <div className="p-4 overflow-auto max-h-[80vh]">{children}</div>
    </div>
  </div>
);

function ModerationDashboard() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState({ open: false, section: 'users', rows: [], page: 1, totalPages: 1, loading: false });
  const [activeUser, setActiveUser] = useState(null);
  const [tempPassword, setTempPassword] = useState('');
  const [muteDurationKey, setMuteDurationKey] = useState('24h');
  const [infractionAction, setInfractionAction] = useState('warning');
  const [actionReason, setActionReason] = useState('');

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
  }, []);

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
    await Promise.all([loadOverview(), details.open ? openDetails(details.section, details.page) : Promise.resolve()]);
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
    return <div className="min-h-screen grid place-items-center">Loading control panel...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Control Panel</h1>
      <p className="text-sm text-gray-600">High-level command center for users, posts, chat activity, reports, and moderation actions.</p>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(overview?.totals || {}).map(([key, value]) => (
          <button
            key={key}
            type="button"
            onClick={() => openDetails(TOTAL_KEY_TO_SECTION[key] || 'users')}
            className="rounded-lg border bg-white p-4 text-left shadow-sm hover:border-blue-300"
          >
            <p className="text-xs uppercase tracking-wide text-gray-500">{SECTION_LABELS[key] || key}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
            <p className="mt-1 text-xs text-blue-600">Click for details</p>
          </button>
        ))}
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <div className="space-x-2">
            <button type="button" onClick={() => openDetails('users')} className="px-3 py-1 text-xs rounded border">Users</button>
            <button type="button" onClick={() => openDetails('posts')} className="px-3 py-1 text-xs rounded border">Posts</button>
            <button type="button" onClick={() => openDetails('messages')} className="px-3 py-1 text-xs rounded border">Messages</button>
            <button type="button" onClick={() => openDetails('infractions')} className="px-3 py-1 text-xs rounded border">Infractions</button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded border p-3">
            <p className="text-sm font-medium text-gray-800">Users</p>
            <ul className="mt-2 space-y-2 text-sm">
              {(overview?.recents?.users || []).slice(0, 6).map((user) => (
                <li key={user._id} className="flex items-center justify-between gap-2">
                  <span>@{user.username}</span>
                  <button type="button" onClick={() => setActiveUser(user)} className="text-blue-600">✏️</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded border p-3">
            <p className="text-sm font-medium text-gray-800">Posts</p>
            <ul className="mt-2 space-y-2 text-sm">
              {(overview?.recents?.posts || []).slice(0, 6).map((post) => (
                <li key={post._id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{post.content || '(empty)'}</span>
                  <button type="button" onClick={() => handleDeletePost(post._id)} className="text-red-600">🛠️</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded border p-3">
            <p className="text-sm font-medium text-gray-800">Messages</p>
            <ul className="mt-2 space-y-2 text-sm">
              {(overview?.recents?.messages || []).slice(0, 6).map((message) => (
                <li key={`${message.type}:${message._id}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">{message.content || '(empty)'}</span>
                  <button type="button" onClick={() => handleDeleteMessage(message._id, message.type)} className="text-red-600">🛠️</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {details.open ? (
        <Modal title={`Detail: ${details.section}`} onClose={() => setDetails((prev) => ({ ...prev, open: false }))}>
          {details.loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : (
            <div className="space-y-3">
              {details.rows.map((row) => (
                <div key={`${row.type || details.section}-${row._id || `${row.userId}-${row.index}`}`} className="rounded border p-3 text-sm">
                  {details.section === 'users' && (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">@{row.username} ({row.realName || 'No name'})</p>
                        <p className="text-xs text-gray-500">Status: {row.registrationStatus} • Moderation: {row.moderationStatus}</p>
                      </div>
                      <button type="button" onClick={() => setActiveUser(row)} className="text-blue-600">✏️</button>
                    </div>
                  )}

                  {details.section === 'posts' && (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {row.author?.username ? `@${row.author.username}` : 'Unknown author'}
                          {row.author?._id ? <button type="button" onClick={() => setActiveUser(row.author)} className="ml-2 text-blue-600">✏️</button> : null}
                        </p>
                        <p className="text-gray-700">{row.content || '(empty post)'}</p>
                      </div>
                      <button type="button" onClick={() => handleDeletePost(row._id)} className="text-red-600">🛠️</button>
                    </div>
                  )}

                  {details.section === 'messages' && (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {row.user?.username ? `@${row.user.username}` : 'Unknown user'}
                          {row.user?._id ? <button type="button" onClick={() => setActiveUser(row.user)} className="ml-2 text-blue-600">✏️</button> : null}
                        </p>
                        <p className="text-gray-700">{row.content || '(empty message)'}</p>
                      </div>
                      <button type="button" onClick={() => handleDeleteMessage(row._id, row.type)} className="text-red-600">🛠️</button>
                    </div>
                  )}

                  {details.section === 'infractions' && (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">@{row.username} • {row.action}</p>
                        <p className="text-gray-700">{row.reason || '(no reason)'}</p>
                      </div>
                      <button type="button" onClick={() => handleRemoveInfraction(row)} className="text-red-600">🛠️</button>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => openDetails(details.section, Math.max(details.page - 1, 1))} disabled={details.page <= 1} className="rounded border px-3 py-1 text-xs disabled:opacity-40">Prev</button>
                <p className="text-xs text-gray-500">Page {details.page} of {details.totalPages}</p>
                <button type="button" onClick={() => openDetails(details.section, Math.min(details.page + 1, details.totalPages))} disabled={details.page >= details.totalPages} className="rounded border px-3 py-1 text-xs disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </Modal>
      ) : null}

      {activeUser ? (
        <Modal title={`Modify @${activeUser.username || 'user'}`} onClose={() => { setActiveUser(null); setTempPassword(''); }}>
          <div className="space-y-4 text-sm">
            <p><span className="font-semibold">Name:</span> {activeUser.realName || 'N/A'}</p>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Reason / notes</label>
              <textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)} className="w-full border rounded p-2" rows={3} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => handleResetPassword(activeUser._id)} className="rounded bg-indigo-600 text-white px-3 py-1">Reset password</button>
              <button type="button" onClick={() => handleDeleteUser(activeUser._id)} className="rounded bg-red-600 text-white px-3 py-1">Delete user</button>
            </div>
            {tempPassword ? (
              <div className="rounded border border-yellow-300 bg-yellow-50 p-2">
                <p className="font-semibold">Temporary one-time password</p>
                <p className="font-mono text-lg">{tempPassword}</p>
              </div>
            ) : null}

            <div className="rounded border p-3 space-y-2">
              <p className="font-semibold">Mute controls</p>
              <select value={muteDurationKey} onChange={(e) => setMuteDurationKey(e.target.value)} className="border rounded p-1">
                {muteDurations.map((duration) => <option key={duration} value={duration}>{duration}</option>)}
              </select>
              <div className="space-x-2">
                <button type="button" onClick={handleMuteUser} className="rounded bg-amber-600 text-white px-3 py-1">Apply mute</button>
                <button type="button" onClick={handleUnmuteUser} className="rounded border px-3 py-1">Remove mute</button>
              </div>
            </div>

            <div className="rounded border p-3 space-y-2">
              <p className="font-semibold">Infractions</p>
              <select value={infractionAction} onChange={(e) => setInfractionAction(e.target.value)} className="border rounded p-1">
                <option value="warning">warning</option>
                <option value="suspension">suspension</option>
                <option value="ban">ban</option>
              </select>
              <button type="button" onClick={handleAddInfraction} className="rounded bg-gray-900 text-white px-3 py-1">Apply infraction</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export default ModerationDashboard;
