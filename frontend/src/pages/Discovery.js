import React, { useCallback, useEffect, useState } from 'react';
import { discoveryAPI, friendsAPI, hasAuthToken } from '../utils/api';
import { PostCard, UserCard } from '../components/discovery/DiscoveryCards';

const TABS = [
  { id: 'people', label: 'People' },
  { id: 'posts', label: 'Posts' }
];

const extractApiErrorMessage = (error, fallbackMessage) => (
  error?.response?.data?.error || fallbackMessage
);

const Discovery = () => {
  const canInteract = hasAuthToken();
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
      setUsersError(extractApiErrorMessage(err, 'Failed to load suggestions. Please try again.'));
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
      setPostsError(extractApiErrorMessage(err, 'Failed to load posts. Please try again.'));
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
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-[44px] px-5 py-2 text-sm font-medium transition-colors ${
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
              <button type="button" onClick={handleRefreshUsers} className="text-sm underline ml-2 min-h-[44px] px-2">Retry</button>
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
                canInteract={canInteract}
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
                className="min-h-[44px] px-4 py-2 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors"
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
              <button type="button" onClick={handleRefreshPosts} className="text-sm underline ml-2 min-h-[44px] px-2">Retry</button>
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
                className="min-h-[44px] px-4 py-2 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors"
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
