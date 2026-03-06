import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { discoveryAPI, friendsAPI } from '../utils/api';

const TABS = [
  { id: 'people', label: 'People' },
  { id: 'posts', label: 'Posts' }
];

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const UserCard = ({ user, onSendRequest }) => {
  const [requestState, setRequestState] = useState('idle'); // idle | loading | sent | error

  const handleSendRequest = async () => {
    setRequestState('loading');
    try {
      await onSendRequest(user._id);
      setRequestState('sent');
    } catch {
      setRequestState('error');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 flex items-start gap-3">
      <div className="flex-shrink-0">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.username}
            className="w-12 h-12 rounded-full object-cover border border-gray-200"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-lg">
            {(user.realName || user.username || '?')[0].toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/social?user=${encodeURIComponent(user.username)}`}
              className="font-semibold text-gray-900 hover:text-blue-600 truncate block"
            >
              {user.realName || user.username}
            </Link>
            <p className="text-sm text-gray-500">@{user.username}</p>
          </div>

          {requestState === 'sent' ? (
            <span className="text-sm text-green-600 font-medium flex-shrink-0">Request sent ✓</span>
          ) : (
            <button
              onClick={handleSendRequest}
              disabled={requestState === 'loading'}
              className="flex-shrink-0 text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {requestState === 'loading' ? 'Sending…' : 'Add Friend'}
            </button>
          )}
        </div>

        {user.bio && (
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{user.bio}</p>
        )}

        <div className="flex items-center gap-2 mt-2">
          {[user.city, user.state, user.country].filter(Boolean).length > 0 && (
            <span className="text-xs text-gray-400">
              📍 {[user.city, user.state, user.country].filter(Boolean).join(', ')}
            </span>
          )}
        </div>

        <p className="text-xs text-blue-500 mt-1">{user.whySuggested}</p>

        {requestState === 'error' && (
          <p className="text-xs text-red-500 mt-1">Failed to send request. Please try again.</p>
        )}
      </div>
    </div>
  );
};

const PostCard = ({ post }) => {
  const author = post.author || {};
  const authorName = author.realName || author.username || 'Unknown';
  const authorUsername = author.username || '';

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-2 mb-2">
        {author.avatarUrl ? (
          <img
            src={author.avatarUrl}
            alt={authorUsername}
            className="w-8 h-8 rounded-full object-cover border border-gray-200"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
            {(authorName)[0].toUpperCase()}
          </div>
        )}
        <div>
          <Link
            to={`/social?user=${encodeURIComponent(authorUsername)}`}
            className="font-semibold text-gray-900 hover:text-blue-600 text-sm"
          >
            {authorName}
          </Link>
          <p className="text-xs text-gray-400">{formatDate(post.createdAt)}</p>
        </div>
      </div>

      {post.content && (
        <p className="text-gray-800 text-sm whitespace-pre-wrap line-clamp-4">{post.content}</p>
      )}

      {Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-1">
          {post.mediaUrls.slice(0, 4).map((url, i) => (
            <a
              key={`${post._id}-media-${i}`}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="block rounded overflow-hidden border bg-gray-50"
            >
              <img
                src={url}
                alt="Post media"
                loading="lazy"
                className="w-full h-32 object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
        <span>❤️ {post.likesCount}</span>
        <span>💬 {post.commentsCount}</span>
      </div>

      <p className="text-xs text-blue-500 mt-2">{post.whySuggested}</p>
    </div>
  );
};

const Discovery = () => {
  const [activeTab, setActiveTab] = useState('people');

  const [users, setUsers] = useState([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [usersLoaded, setUsersLoaded] = useState(false);

  const [posts, setPosts] = useState([]);
  const [postsPage, setPostsPage] = useState(1);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState('');
  const [postsLoaded, setPostsLoaded] = useState(false);

  const [viewerCoords, setViewerCoords] = useState(null);

  // Attempt to get viewer's location for geo-ranked post discovery
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setViewerCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => { /* Permission denied or unavailable — geo-ranking is optional; continue without it */ }
    );
  }, []);

  const loadUsers = useCallback(async (page) => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const { data } = await discoveryAPI.getUsers('', page, 20);
      if (page === 1) {
        setUsers(data.users || []);
      } else {
        setUsers((prev) => [...prev, ...(data.users || [])]);
      }
      setUsersHasMore(data.hasMore ?? false);
      setUsersPage(page);
    } catch (err) {
      setUsersError(err?.response?.data?.error || 'Failed to load suggestions. Please try again.');
    } finally {
      setUsersLoaded(true);
      setUsersLoading(false);
    }
  }, []);

  const loadPosts = useCallback(async (page) => {
    setPostsLoading(true);
    setPostsError('');
    try {
      const lat = viewerCoords?.latitude ?? null;
      const lon = viewerCoords?.longitude ?? null;
      const { data } = await discoveryAPI.getPosts('', page, 20, lat, lon);
      if (page === 1) {
        setPosts(data.posts || []);
      } else {
        setPosts((prev) => [...prev, ...(data.posts || [])]);
      }
      setPostsHasMore(data.hasMore ?? false);
      setPostsPage(page);
    } catch (err) {
      setPostsError(err?.response?.data?.error || 'Failed to load posts. Please try again.');
    } finally {
      setPostsLoaded(true);
      setPostsLoading(false);
    }
  }, [viewerCoords]);

  // Load initial data when tab changes
  useEffect(() => {
    if (activeTab === 'people' && !usersLoaded && !usersLoading) {
      loadUsers(1);
    }
  }, [activeTab, loadUsers, usersLoaded, usersLoading]);

  useEffect(() => {
    if (activeTab === 'posts' && !postsLoaded && !postsLoading) {
      loadPosts(1);
    }
  }, [activeTab, loadPosts, postsLoaded, postsLoading]);

  const handleSendFriendRequest = async (userId) => {
    await friendsAPI.sendRequest(userId);
    // Emit follow analytics in the background (non-blocking)
    discoveryAPI.trackEvent('follow_click', { targetUserId: userId }).catch(() => {});
  };

  const handleLoadMoreUsers = () => loadUsers(usersPage + 1);
  const handleLoadMorePosts = () => loadPosts(postsPage + 1);

  const handleRefreshUsers = () => {
    setUsers([]);
    loadUsers(1);
  };

  const handleRefreshPosts = () => {
    setPosts([]);
    loadPosts(1);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Discover</h1>
        <p className="text-gray-500 text-sm mt-1">
          People and posts you might find interesting
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* People Tab */}
      {activeTab === 'people' && (
        <div>
          {usersError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 flex items-center justify-between">
              <span>{usersError}</span>
              <button onClick={handleRefreshUsers} className="text-sm underline ml-2">Retry</button>
            </div>
          )}

          {!usersLoading && users.length === 0 && !usersError && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">👥</p>
              <p className="font-medium text-gray-600">No suggestions yet</p>
              <p className="text-sm mt-1">We'll suggest people as more members join.</p>
            </div>
          )}

          <div className="space-y-3">
            {users.map((user) => (
              <UserCard
                key={String(user._id)}
                user={user}
                onSendRequest={handleSendFriendRequest}
              />
            ))}
          </div>

          {usersLoading && (
            <div className="text-center py-6 text-gray-400">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              <p className="text-sm mt-2">Loading suggestions…</p>
            </div>
          )}

          {usersHasMore && !usersLoading && (
            <div className="text-center mt-4">
              <button
                onClick={handleLoadMoreUsers}
                className="px-4 py-2 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Load more people
              </button>
            </div>
          )}
        </div>
      )}

      {/* Posts Tab */}
      {activeTab === 'posts' && (
        <div>
          {postsError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 flex items-center justify-between">
              <span>{postsError}</span>
              <button onClick={handleRefreshPosts} className="text-sm underline ml-2">Retry</button>
            </div>
          )}

          {!postsLoading && posts.length === 0 && !postsError && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">📰</p>
              <p className="font-medium text-gray-600">No posts to discover yet</p>
              <p className="text-sm mt-1">Check back as people share more content.</p>
            </div>
          )}

          <div className="space-y-3">
            {posts.map((post) => (
              <PostCard key={String(post._id)} post={post} />
            ))}
          </div>

          {postsLoading && (
            <div className="text-center py-6 text-gray-400">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              <p className="text-sm mt-2">Loading posts…</p>
            </div>
          )}

          {postsHasMore && !postsLoading && (
            <div className="text-center mt-4">
              <button
                onClick={handleLoadMorePosts}
                className="px-4 py-2 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Load more posts
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Discovery;
