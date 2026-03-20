import React, { useCallback, useEffect, useRef, useState } from 'react';
import { discoveryAPI, friendsAPI, hasAuthToken } from '../utils/api';
import usePaginatedResource from '../hooks/usePaginatedResource';
import { PostCard, UserCard } from '../components/discovery/DiscoveryCards';

const TABS = [
  { id: 'people', label: 'People' },
  { id: 'posts', label: 'Posts' }
];

const Discovery = () => {
  const canInteract = hasAuthToken();
  const [activeTab, setActiveTab] = useState('people');
  const [searchQuery, setSearchQuery] = useState('');
  const searchDebounceRef = useRef(null);

  const [viewerCoords, setViewerCoords] = useState(null);

  // Attempt to get viewer's location for geo-ranked post discovery
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setViewerCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => { /* Permission denied or unavailable — geo-ranking is optional; continue without it */ }
    );
  }, []);

  // Keep a ref for search query so the fetcher can access it without recreating
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const usersFetcher = useCallback(
    (page, pageSize) => discoveryAPI.getUsers(searchQueryRef.current, page, pageSize),
    [],
  );

  const viewerCoordsRef = useRef(viewerCoords);
  viewerCoordsRef.current = viewerCoords;

  const postsFetcher = useCallback(
    (page, pageSize) => {
      const lat = viewerCoordsRef.current?.latitude ?? null;
      const lon = viewerCoordsRef.current?.longitude ?? null;
      return discoveryAPI.getPosts('', page, pageSize, lat, lon);
    },
    [],
  );

  const usersResource = usePaginatedResource(usersFetcher, {
    pageSize: 20,
    extractItems: (res) => res.data?.users || [],
    extractHasMore: (res) => res.data?.hasMore ?? false,
    errorMessage: 'Failed to load suggestions. Please try again.',
    autoLoad: true,
  });

  const postsResource = usePaginatedResource(postsFetcher, {
    pageSize: 20,
    extractItems: (res) => res.data?.posts || [],
    extractHasMore: (res) => res.data?.hasMore ?? false,
    errorMessage: 'Failed to load posts. Please try again.',
    autoLoad: false,
  });

  // Load posts when tab changes to 'posts' (lazy load)
  const postsLoadedRef = useRef(false);
  useEffect(() => {
    if (activeTab === 'posts' && !postsLoadedRef.current) {
      postsLoadedRef.current = true;
      postsResource.refresh();
    }
  }, [activeTab, postsResource.refresh]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  // Debounced search
  const handleSearchChange = (value) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      usersResource.refresh();
    }, 350);
  };

  const handleSendFriendRequest = async (userId) => {
    await friendsAPI.sendRequest(userId);
    // Emit follow analytics in the background (non-blocking)
    discoveryAPI.trackEvent('follow_click', { targetUserId: userId, surface: 'find_friends' }).catch(() => {});
  };

  const handleRefreshUsers = () => {
    usersResource.refresh();
  };

  const handleRefreshPosts = () => {
    postsResource.refresh();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Find Friends</h1>
        <p className="text-gray-500 text-sm mt-1">
          Find people and posts you might find interesting
        </p>
      </div>

      {/* Search Bar */}
      {activeTab === 'people' && (
        <div className="mb-5">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by username or name…"
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      )}

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
          {usersResource.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 flex items-center justify-between">
              <span>{usersResource.error}</span>
              <button type="button" onClick={handleRefreshUsers} className="text-sm underline ml-2 min-h-[44px] px-2">Retry</button>
            </div>
          )}

          {!usersResource.loading && usersResource.items.length === 0 && !usersResource.error && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">👥</p>
              <p className="font-medium text-gray-600">No suggestions yet</p>
              <p className="text-sm mt-1">We'll suggest people as more members join.</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {usersResource.items.map((user) => (
              <UserCard
                key={String(user._id)}
                user={user}
                onSendRequest={handleSendFriendRequest}
                canInteract={canInteract}
              />
            ))}
          </div>

          {usersResource.loading && (
            <div className="text-center py-6 text-gray-400">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              <p className="text-sm mt-2">Loading suggestions…</p>
            </div>
          )}

          {usersResource.hasMore && !usersResource.loading && (
            <div className="text-center mt-4">
              <button
                onClick={usersResource.loadMore}
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
          {postsResource.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 flex items-center justify-between">
              <span>{postsResource.error}</span>
              <button type="button" onClick={handleRefreshPosts} className="text-sm underline ml-2 min-h-[44px] px-2">Retry</button>
            </div>
          )}

          {!postsResource.loading && postsResource.items.length === 0 && !postsResource.error && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">📰</p>
              <p className="font-medium text-gray-600">No posts to discover yet</p>
              <p className="text-sm mt-1">Check back as people share more content.</p>
            </div>
          )}

          <div className="space-y-3">
            {postsResource.items.map((post) => (
              <PostCard key={String(post._id)} post={post} />
            ))}
          </div>

          {postsResource.loading && (
            <div className="text-center py-6 text-gray-400">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              <p className="text-sm mt-2">Loading posts…</p>
            </div>
          )}

          {postsResource.hasMore && !postsResource.loading && (
            <div className="text-center mt-4">
              <button
                onClick={postsResource.loadMore}
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
