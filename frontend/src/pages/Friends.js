import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { friendsAPI, circlesAPI, discoveryAPI, getAuthToken } from '../utils/api';
import { getRealtimeSocket, onFriendPresence } from '../utils/realtime';
import { resolvePresenceStatus } from '../utils/presence';
import toast from 'react-hot-toast';

const TOP_FRIENDS_LIMIT = 5;
const MAX_CIRCLES = 5;
const SEARCH_DEFAULT_PAGE = 1;
const SEARCH_DEFAULT_LIMIT = 25;
const normalizeUserSearchQuery = (value = '') => String(value).trim().replace(/^@+/, '');

const DEFAULT_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

const PresenceDot = ({ presence }) => {
  const status = resolvePresenceStatus(presence);
  const cls =
    status === 'online' ? 'bg-emerald-500' :
    status === 'inactive' ? 'bg-amber-400' :
    'bg-slate-300';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} title={status} />;
};

const Avatar = ({ url, size = 'w-10 h-10' }) => (
  <div className={`${size} shrink-0 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden`}>
    {url ? <img src={url} alt="" className={`${size} rounded-full object-cover`} /> : <span className="text-lg">👤</span>}
  </div>
);

const AudienceToggle = ({ value = 'social', onChange, ariaLabel }) => (
  <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5" role="group" aria-label={ariaLabel}>
    <button
      type="button"
      onClick={() => onChange('social')}
      className={`rounded px-2 py-1 text-xs font-medium ${value === 'social' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      Social
    </button>
    <button
      type="button"
      onClick={() => onChange('secure')}
      className={`rounded px-2 py-1 text-xs font-medium ${value === 'secure' ? 'bg-purple-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      Secure
    </button>
  </div>
);

export default function Friends({ user }) {
  const [activeTab, setActiveTab] = useState('friends');

  // Friends state
  const [friends, setFriends] = useState([]);
  const [topFriends, setTopFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [friendSearch, setFriendSearch] = useState('');

  // User search state
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [userSearching, setUserSearching] = useState(false);

  // Circles state
  const [circles, setCircles] = useState([]);
  const [circlesLoading, setCirclesLoading] = useState(false);
  const [showCreateCircle, setShowCreateCircle] = useState(false);
  const [newCircle, setNewCircle] = useState({ name: '', color: '#3B82F6', relationshipAudience: 'social', profileImageUrl: '' });
  const [editingCircle, setEditingCircle] = useState(null);
  const [circleAddMember, setCircleAddMember] = useState(null);

  const loadFriends = useCallback(async () => {
    setLoading(true);
    try {
      const [friendsRes, incomingRes, outgoingRes] = await Promise.all([
        friendsAPI.getFriends(),
        friendsAPI.getIncomingRequests(),
        friendsAPI.getOutgoingRequests(),
      ]);
      setFriends(friendsRes.data.friends || []);
      setIncomingRequests(incomingRes.data.requests || []);
      setOutgoingRequests(outgoingRes.data.requests || []);

      if (user?.username) {
        const topRes = await friendsAPI.getTopFriends(user.username);
        setTopFriends(topRes.data.topFriends || []);
      }
    } catch (err) {
      console.error('Error loading friends:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.username]);

  const loadCircles = useCallback(async () => {
    setCirclesLoading(true);
    try {
      const res = await circlesAPI.getCircles();
      setCircles(res.data.circles || []);
    } catch (err) {
      console.error('Error loading circles:', err);
    } finally {
      setCirclesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFriends();
    loadCircles();
  }, [loadFriends, loadCircles]);

  // Realtime presence
  useEffect(() => {
    if (!user?._id || user?.realtimePreferences?.enabled === false) return undefined;
    const token = getAuthToken();
    if (!token) return undefined;
    getRealtimeSocket({ token, userId: user._id });

    const offPresence = onFriendPresence((payload) => {
      const uid = String(payload?.userId || '').trim();
      if (!uid) return;
      setFriends((prev) => prev.map((f) =>
        String(f._id) === uid ? { ...f, presence: { status: payload.status, lastSeen: payload.lastSeen || null } } : f
      ));
    });
    return () => offPresence();
  }, [user?._id, user?.realtimePreferences?.enabled]);

  // ─── Friend actions ───────────────────────────────────────────────────────
  const removeFriend = async (friendshipId) => {
    if (!window.confirm('Remove this friend?')) return;
    try {
      await friendsAPI.removeFriend(friendshipId);
      toast.success('Friend removed');
      loadFriends();
      loadCircles();
    } catch {
      toast.error('Failed to remove friend');
    }
  };

  const acceptRequest = async (id) => {
    try {
      await friendsAPI.acceptRequest(id);
      toast.success('Accepted');
      loadFriends();
    } catch {
      toast.error('Failed to accept');
    }
  };
  const declineRequest = async (id) => {
    try {
      await friendsAPI.declineRequest(id);
      toast.success('Declined');
      loadFriends();
    } catch {
      toast.error('Failed to decline');
    }
  };

  const cancelOutgoingRequest = async (id) => {
    try {
      await friendsAPI.removeFriend(id);
      toast.success('Request canceled');
      loadFriends();
    } catch {
      toast.error('Failed to cancel request');
    }
  };

  const updateCategory = async (friendshipId, category) => {
    try {
      await friendsAPI.updateFriendCategory(friendshipId, category);
      setFriends((prev) => prev.map((f) => f.friendshipId === friendshipId ? { ...f, category } : f));
      toast.success('Category updated');
    } catch { toast.error('Failed to update category'); }
  };

  // ─── Top Friends ──────────────────────────────────────────────────────────
  const saveTopFriends = async (ids) => {
    try {
      await friendsAPI.updateTopFriends(ids);
      const res = await friendsAPI.getTopFriends(user.username);
      setTopFriends(res.data.topFriends || []);
      toast.success('Top friends updated');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to update');
    }
  };

  const addToTop = (friend) => {
    if (topFriends.length >= TOP_FRIENDS_LIMIT) { toast.error(`Max ${TOP_FRIENDS_LIMIT} top friends`); return; }
    if (topFriends.some((tf) => tf._id === friend._id)) { toast.error('Already in top friends'); return; }
    saveTopFriends([...topFriends.map((tf) => tf._id), friend._id]);
  };
  const removeFromTop = (friendId) => saveTopFriends(topFriends.filter((tf) => tf._id !== friendId).map((tf) => tf._id));
  const moveTop = (idx, dir) => {
    const next = [...topFriends];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    saveTopFriends(next.map((tf) => tf._id));
  };

  // ─── User search ──────────────────────────────────────────────────────────
  const searchUsers = async () => {
    const q = normalizeUserSearchQuery(userSearchQuery);
    if (!q) return;
    setUserSearching(true);
    try {
      const res = await discoveryAPI.getUsers(q, SEARCH_DEFAULT_PAGE, SEARCH_DEFAULT_LIMIT);
      setUserSearchResults(res.data.users || []);
    } catch {
      toast.error('Search failed');
    } finally {
      setUserSearching(false);
    }
  };

  const sendRequest = async (userId) => {
    try {
      await friendsAPI.sendRequest(userId);
      toast.success('Friend request sent');
      loadFriends();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to send request');
    }
  };

  // ─── Circles ──────────────────────────────────────────────────────────────
  const createCircle = async () => {
    const name = newCircle.name.trim();
    if (!name) { toast.error('Circle name required'); return; }
    if (circles.length >= MAX_CIRCLES) { toast.error(`Max ${MAX_CIRCLES} circles`); return; }
    try {
      await circlesAPI.createCircle({
        name,
        color: newCircle.color,
        relationshipAudience: newCircle.relationshipAudience,
        profileImageUrl: newCircle.profileImageUrl.trim()
      });
      toast.success('Circle created');
      setShowCreateCircle(false);
      setNewCircle({ name: '', color: '#3B82F6', relationshipAudience: 'social', profileImageUrl: '' });
      loadCircles();
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed to create circle'); }
  };

  const updateCircle = async (circleName, data) => {
    try {
      await circlesAPI.updateCircle(circleName, data);
      toast.success('Circle updated');
      loadCircles();
      setEditingCircle(null);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to update circle');
    }
  };

  const deleteCircle = async (circleName) => {
    if (!window.confirm(`Delete circle "${circleName}"?`)) return;
    try {
      await circlesAPI.deleteCircle(circleName);
      toast.success('Circle deleted');
      loadCircles();
    } catch {
      toast.error('Failed to delete circle');
    }
  };

  const addCircleMember = async (circleName, userId) => {
    try {
      await circlesAPI.addMember(circleName, userId);
      toast.success('Added to circle');
      loadCircles();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to add');
    }
  };

  const removeCircleMember = async (circleName, userId) => {
    try {
      await circlesAPI.removeMember(circleName, userId);
      toast.success('Removed from circle');
      loadCircles();
    } catch {
      toast.error('Failed to remove');
    }
  };

  // ─── Derived data ─────────────────────────────────────────────────────────
  const filteredFriends = friendSearch.trim()
    ? friends.filter((f) => {
        const q = friendSearch.toLowerCase();
        return (f.username || '').toLowerCase().includes(q) || (f.realName || '').toLowerCase().includes(q);
      })
    : friends;

  const onlineCount = friends.filter((f) => { const s = resolvePresenceStatus(f.presence); return s === 'online' || s === 'inactive'; }).length;
  const offlineCount = friends.length - onlineCount;

  const friendIdSet = new Set(friends.map((f) => String(f._id)));
  const outgoingRequestByUserId = new Map(outgoingRequests.map((r) => [String(r.user?._id), r]));
  const incomingRequestByUserId = new Map(incomingRequests.map((r) => [String(r.user?._id), r]));

  const tabs = [
    { id: 'friends', label: `Friends (${friends.length})` },
    { id: 'top', label: 'Top 5' },
    { id: 'requests', label: `Requests${incomingRequests.length ? ` (${incomingRequests.length})` : ''}` },
    { id: 'search', label: 'Find Friends' },
    { id: 'circles', label: `Circles (${circles.length})` },
  ];

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><p className="text-slate-500">Loading…</p></div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Friends</h1>
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-emerald-600">{onlineCount}</span> online
            {' · '}
            <span className="font-semibold text-slate-500">{offlineCount}</span> offline
            {' · '}
            {friends.length} total
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ FRIENDS TAB ═══ */}
      {activeTab === 'friends' && (
        <div>
          <input
            type="text"
            placeholder="Filter friends…"
            value={friendSearch}
            onChange={(e) => setFriendSearch(e.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {filteredFriends.length === 0 ? (
            <p className="py-8 text-center text-slate-400">{friends.length === 0 ? 'No friends yet. Use "Find Friends" to get started!' : 'No matches.'}</p>
          ) : (
            <div className="space-y-2">
              {filteredFriends.map((f) => (
                <div key={f._id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar url={f.avatarUrl} />
                      <span className="absolute -bottom-0.5 -right-0.5"><PresenceDot presence={f.presence} /></span>
                    </div>
                    <div>
                      <Link to={`/social?user=${encodeURIComponent(f.username)}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700">
                        @{f.username}
                      </Link>
                      {f.realName && <p className="text-xs text-slate-500">{f.realName}</p>}
                      <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${f.category === 'secure' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                        {f.category === 'secure' ? 'Secure' : 'Social'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <AudienceToggle
                      value={f.category || 'social'}
                      onChange={(category) => updateCategory(f.friendshipId, category)}
                      ariaLabel={`Category for ${f.username}`}
                    />
                    {!topFriends.some((tf) => tf._id === f._id) && topFriends.length < TOP_FRIENDS_LIMIT && (
                      <button onClick={() => addToTop(f)} className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">⭐ Top</button>
                    )}
                    <button onClick={() => removeFriend(f.friendshipId)} className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ TOP 5 TAB ═══ */}
      {activeTab === 'top' && (
        <div>
          <p className="mb-4 text-sm text-slate-500">Your top {TOP_FRIENDS_LIMIT} friends are highlighted on your profile. Drag to reorder.</p>
          {topFriends.length === 0 ? (
            <p className="py-8 text-center text-slate-400">No top friends set. Go to Friends tab and click ⭐ Top to add.</p>
          ) : (
            <div className="space-y-2">
              {topFriends.map((tf, idx) => (
                <div key={tf._id} className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-blue-400">#{idx + 1}</span>
                    <Avatar url={tf.avatarUrl} size="w-9 h-9" />
                    <div>
                      <Link to={`/social?user=${encodeURIComponent(tf.username)}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700">
                        @{tf.username}
                      </Link>
                      {tf.realName && <p className="text-xs text-slate-500">{tf.realName}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button disabled={idx === 0} onClick={() => moveTop(idx, 'up')} className="rounded bg-slate-100 px-2 py-1 text-xs disabled:opacity-40">↑</button>
                    <button disabled={idx === topFriends.length - 1} onClick={() => moveTop(idx, 'down')} className="rounded bg-slate-100 px-2 py-1 text-xs disabled:opacity-40">↓</button>
                    <button onClick={() => removeFromTop(tf._id)} className="rounded bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ REQUESTS TAB ═══ */}
      {activeTab === 'requests' && (
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Incoming ({incomingRequests.length})</h3>
            {incomingRequests.length === 0 ? (
              <p className="text-sm text-slate-400">No pending requests.</p>
            ) : incomingRequests.map((req) => (
              <div key={req._id} className="mb-2 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-3">
                  <Avatar url={req.user?.avatarUrl} size="w-9 h-9" />
                  <div>
                    <Link to={`/social?user=${encodeURIComponent(req.user?.username || '')}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700">
                      @{req.user?.username}
                    </Link>
                    {req.message && <p className="text-xs text-slate-500 italic">&ldquo;{req.message}&rdquo;</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => acceptRequest(req._id)} className="rounded bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">Accept</button>
                  <button onClick={() => declineRequest(req._id)} className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">Decline</button>
                </div>
              </div>
            ))}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Sent ({outgoingRequests.length})</h3>
            {outgoingRequests.length === 0 ? (
              <p className="text-sm text-slate-400">No sent requests.</p>
            ) : outgoingRequests.map((req) => (
              <div key={req._id} className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-3">
                  <Avatar url={req.user?.avatarUrl} size="w-9 h-9" />
                  <div>
                    <Link to={`/social?user=${encodeURIComponent(req.user?.username || '')}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700">
                      @{req.user?.username}
                    </Link>
                    <p className="text-xs text-amber-600">Pending…</p>
                  </div>
                </div>
                <button onClick={() => cancelOutgoingRequest(req._id)} className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ FIND FRIENDS TAB ═══ */}
      {activeTab === 'search' && (
        <div>
          <div className="mb-4 flex gap-2">
            <input
              type="text"
              placeholder="Search by username or name…"
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button onClick={searchUsers} disabled={userSearching} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              {userSearching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {userSearchResults.length > 0 && (
            <div className="space-y-2">
              {userSearchResults.map((u) => {
                const isSelf = String(u._id) === String(user?._id);
                const isFriend = friendIdSet.has(String(u._id));
                const outgoingReq = outgoingRequestByUserId.get(String(u._id));
                const incomingReq = incomingRequestByUserId.get(String(u._id));
                const isOutgoingPending = (u.relationship === 'pending' && u.requestDirection === 'outgoing') || !!outgoingReq;
                const isIncomingPending = (u.relationship === 'pending' && u.requestDirection === 'incoming') || !!incomingReq;
                return (
                  <div key={u._id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-center gap-3">
                      <Avatar url={u.avatarUrl} size="w-9 h-9" />
                      <div>
                        <Link to={`/social?user=${encodeURIComponent(u.username)}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700">
                          @{u.username}
                        </Link>
                        {u.realName && <p className="text-xs text-slate-500">{u.realName}</p>}
                      </div>
                    </div>
                    {isSelf ? (
                      <span className="text-xs text-slate-400">You</span>
                    ) : isFriend ? (
                      <span className="text-xs text-emerald-600 font-medium">Already friends</span>
                    ) : isIncomingPending ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-medium">Requested you</span>
                        {incomingReq && (
                          <>
                            <button onClick={() => acceptRequest(incomingReq._id)} className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">Accept</button>
                            <button onClick={() => declineRequest(incomingReq._id)} className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">Decline</button>
                          </>
                        )}
                      </div>
                    ) : isOutgoingPending ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-600 font-medium">Request sent</span>
                        {outgoingReq && (
                          <button onClick={() => cancelOutgoingRequest(outgoingReq._id)} className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">Cancel</button>
                        )}
                      </div>
                    ) : (
                      <button onClick={() => sendRequest(u._id)} className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">Add Friend</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ CIRCLES TAB ═══ */}
      {activeTab === 'circles' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">Organize friends into circles (max {MAX_CIRCLES}). Each circle has a Social or Secure tag.</p>
            {circles.length < MAX_CIRCLES && (
              <button onClick={() => setShowCreateCircle(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">+ New Circle</button>
            )}
          </div>

          {/* Create circle form */}
          {showCreateCircle && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
              <h3 className="mb-3 font-semibold text-slate-800">Create Circle</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
                  <input
                    type="text"
                    maxLength={50}
                    value={newCircle.name}
                    onChange={(e) => setNewCircle({ ...newCircle, name: e.target.value })}
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                    placeholder="e.g. Close Friends"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Tag</label>
                  <AudienceToggle
                    value={newCircle.relationshipAudience}
                    onChange={(relationshipAudience) => setNewCircle({ ...newCircle, relationshipAudience })}
                    ariaLabel="Circle audience"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Color</label>
                  <div className="flex flex-wrap gap-1.5">
                    {DEFAULT_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewCircle({ ...newCircle, color: c })}
                        className={`h-7 w-7 rounded-full border-2 ${newCircle.color === c ? 'border-slate-900' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                        aria-label={c}
                      />
                    ))}
                    <input
                      type="color"
                      value={newCircle.color}
                      onChange={(e) => setNewCircle({ ...newCircle, color: e.target.value })}
                      className="h-7 w-7 cursor-pointer rounded-full border-0 p-0"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Background Image URL (optional)</label>
                  <input
                    type="url"
                    value={newCircle.profileImageUrl}
                    onChange={(e) => setNewCircle({ ...newCircle, profileImageUrl: e.target.value })}
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                    placeholder="https://…"
                  />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={createCircle} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Create</button>
                <button onClick={() => setShowCreateCircle(false)} className="rounded bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200">Cancel</button>
              </div>
            </div>
          )}

          {/* Circle list */}
          {circlesLoading ? (
            <p className="text-sm text-slate-400">Loading circles…</p>
          ) : circles.length === 0 ? (
            <p className="py-8 text-center text-slate-400">No circles yet. Create one above!</p>
          ) : (
            <div className="space-y-4">
              {circles.map((circle) => {
                const isEditing = editingCircle?.name === circle.name;
                const isAddingMember = circleAddMember === circle.name;
                return (
                  <div key={circle.name} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                    {/* Circle header */}
                    <div
                      className="flex items-center justify-between px-4 py-3"
                      style={circle.profileImageUrl ? { backgroundImage: `url(${circle.profileImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { borderLeft: `4px solid ${circle.color || '#3B82F6'}` }}
                    >
                      <div className="flex items-center gap-2">
                        {!circle.profileImageUrl && <span className="inline-block h-4 w-4 rounded-full" style={{ backgroundColor: circle.color || '#3B82F6' }} />}
                        <span className="font-semibold text-slate-900">{circle.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${circle.relationshipAudience === 'secure' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                          {circle.relationshipAudience === 'secure' ? 'Secure' : 'Social'}
                        </span>
                        <span className="text-xs text-slate-500">{circle.memberCount || 0} members</span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setEditingCircle(isEditing ? null : { name: circle.name, newName: circle.name, color: circle.color || '#3B82F6', relationshipAudience: circle.relationshipAudience || 'social', profileImageUrl: circle.profileImageUrl || '' })} className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200">Edit</button>
                        <button onClick={() => setCircleAddMember(isAddingMember ? null : circle.name)} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100">+ Add</button>
                        <button onClick={() => deleteCircle(circle.name)} className="rounded bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100">Delete</button>
                      </div>
                    </div>

                    {/* Edit form */}
                    {isEditing && (
                      <div className="border-t border-slate-100 bg-slate-50 p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
                            <input type="text" maxLength={50} value={editingCircle.newName} onChange={(e) => setEditingCircle({ ...editingCircle, newName: e.target.value })} className="w-full rounded border border-slate-200 px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Tag</label>
                            <AudienceToggle
                              value={editingCircle.relationshipAudience}
                              onChange={(relationshipAudience) => setEditingCircle({ ...editingCircle, relationshipAudience })}
                              ariaLabel="Edit circle audience"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Color</label>
                            <div className="flex flex-wrap gap-1.5">
                              {DEFAULT_COLORS.map((c) => (
                                <button key={c} onClick={() => setEditingCircle({ ...editingCircle, color: c })} className={`h-7 w-7 rounded-full border-2 ${editingCircle.color === c ? 'border-slate-900' : 'border-transparent'}`} style={{ backgroundColor: c }} aria-label={c} />
                              ))}
                              <input type="color" value={editingCircle.color} onChange={(e) => setEditingCircle({ ...editingCircle, color: e.target.value })} className="h-7 w-7 cursor-pointer rounded-full border-0 p-0" />
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Background Image URL</label>
                            <input type="url" value={editingCircle.profileImageUrl} onChange={(e) => setEditingCircle({ ...editingCircle, profileImageUrl: e.target.value })} className="w-full rounded border border-slate-200 px-3 py-2 text-sm" placeholder="https://…" />
                          </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => updateCircle(editingCircle.name, { name: editingCircle.newName, color: editingCircle.color, relationshipAudience: editingCircle.relationshipAudience, profileImageUrl: editingCircle.profileImageUrl })} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Save</button>
                          <button onClick={() => setEditingCircle(null)} className="rounded bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200">Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Add member picker */}
                    {isAddingMember && (
                      <div className="border-t border-slate-100 bg-slate-50 p-3">
                        <p className="mb-2 text-xs font-medium text-slate-600">Select a friend to add:</p>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {friends.filter((f) => !(circle.members || []).some((m) => String(m._id) === String(f._id))).length === 0 ? (
                            <p className="text-xs text-slate-400">All friends are already in this circle.</p>
                          ) : friends.filter((f) => !(circle.members || []).some((m) => String(m._id) === String(f._id))).map((f) => (
                            <button key={f._id} onClick={() => addCircleMember(circle.name, f._id)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-blue-50">
                              <Avatar url={f.avatarUrl} size="w-6 h-6" />
                              <span>@{f.username}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Members list */}
                    {(circle.members || []).length > 0 && (
                      <div className="border-t border-slate-100 px-4 py-2">
                        <div className="flex flex-wrap gap-2">
                          {circle.members.map((m) => (
                            <div key={m._id} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-1.5 pr-2 text-xs">
                              <Avatar url={m.avatarUrl} size="w-5 h-5" />
                              <Link to={`/social?user=${encodeURIComponent(m.username)}`} className="hover:text-blue-700">
                                @{m.username}
                              </Link>
                              <button onClick={() => removeCircleMember(circle.name, m._id)} className="ml-1 text-red-400 hover:text-red-600" aria-label={`Remove ${m.username}`}>✕</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
