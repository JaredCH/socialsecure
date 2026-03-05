import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { discoveryAPI } from '../utils/api';

const PAGE_SIZE = 10;

const toWhySuggested = (signals = {}) => {
  return Object.entries(signals)
    .filter(([, value]) => (typeof value === 'number' ? value > 0.4 : !!value))
    .sort((a, b) => {
      const left = typeof a[1] === 'number' ? a[1] : Number(a[1]);
      const right = typeof b[1] === 'number' ? b[1] : Number(b[1]);
      return right - left;
    })
    .slice(0, 3)
    .map(([key]) => key);
};

function Discover() {
  const [query, setQuery] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const [postsPage, setPostsPage] = useState(1);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [postsTotal, setPostsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalUserPages = useMemo(() => Math.max(1, Math.ceil(usersTotal / PAGE_SIZE)), [usersTotal]);
  const totalPostPages = useMemo(() => Math.max(1, Math.ceil(postsTotal / PAGE_SIZE)), [postsTotal]);

  const loadDiscovery = useCallback(async (targetQuery, nextUsersPage, nextPostsPage) => {
    setLoading(true);
    setError('');

    try {
      const [usersResponse, postsResponse] = await Promise.all([
        discoveryAPI.getUsers(targetQuery, nextUsersPage, PAGE_SIZE),
        discoveryAPI.getPosts(targetQuery, nextPostsPage, PAGE_SIZE)
      ]);

      setUsers(Array.isArray(usersResponse.data?.users) ? usersResponse.data.users : []);
      setPosts(Array.isArray(postsResponse.data?.posts) ? postsResponse.data.posts : []);
      setUsersTotal(Number(usersResponse.data?.total || 0));
      setPostsTotal(Number(postsResponse.data?.total || 0));
    } catch (requestError) {
      setUsers([]);
      setPosts([]);
      setUsersTotal(0);
      setPostsTotal(0);
      setError(requestError.response?.data?.error || 'Failed to load discovery results.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiscovery(committedQuery, usersPage, postsPage);
  }, [committedQuery, usersPage, postsPage, loadDiscovery]);

  const submitSearch = (event) => {
    event.preventDefault();
    setUsersPage(1);
    setPostsPage(1);
    setCommittedQuery(query.trim());
  };

  const trackProfileClick = async (userId) => {
    try {
      await discoveryAPI.trackEvent('profile_click', { targetUserId: userId, query: committedQuery });
    } catch {
      // best effort only
    }
  };

  const trackPostClick = async (postId) => {
    try {
      await discoveryAPI.trackEvent('post_click', { targetPostId: postId, query: committedQuery });
    } catch {
      // best effort only
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <div className="bg-white border rounded-lg p-4 shadow-sm">
        <h2 className="text-2xl font-semibold text-gray-900">Discover people and posts</h2>
        <p className="text-sm text-gray-600 mt-1">Search and explore ranked suggestions based on relevance, activity, and social context.</p>
        <form onSubmit={submitSearch} className="mt-4 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by username, name, or content"
            className="flex-1 border rounded px-3 py-2"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
        {error ? <p className="text-sm text-red-600 mt-3">{error}</p> : null}
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">People</h3>
            <span className="text-xs text-gray-500">{usersTotal} total</span>
          </div>

          <div className="space-y-3">
            {users.map((user) => {
              const whySuggested = toWhySuggested(user.ranking?.signals);
              return (
                <a
                  key={String(user._id)}
                  href={`/social?user=${encodeURIComponent(user.username)}`}
                  onClick={() => trackProfileClick(String(user._id))}
                  className="block border rounded p-3 hover:bg-gray-50"
                >
                  <div className="font-medium text-gray-900">@{user.username}</div>
                  <div className="text-sm text-gray-600">{user.realName || 'Unknown'}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {user.city || 'N/A'}{user.state ? `, ${user.state}` : ''}{user.country ? `, ${user.country}` : ''}
                  </div>
                  <div className="text-xs text-blue-700 mt-2">
                    Why suggested: {whySuggested.length ? whySuggested.join(', ') : 'general relevance'}
                  </div>
                </a>
              );
            })}

            {!loading && users.length === 0 ? (
              <p className="text-sm text-gray-500">No user suggestions found for this query.</p>
            ) : null}
          </div>

          <div className="mt-4 flex justify-between">
            <button
              type="button"
              disabled={usersPage <= 1 || loading}
              onClick={() => setUsersPage((page) => Math.max(1, page - 1))}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-sm text-gray-600">Page {usersPage} / {totalUserPages}</span>
            <button
              type="button"
              disabled={usersPage >= totalUserPages || loading}
              onClick={() => setUsersPage((page) => page + 1)}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">Posts</h3>
            <span className="text-xs text-gray-500">{postsTotal} total</span>
          </div>

          <div className="space-y-3">
            {posts.map((post) => {
              const whySuggested = toWhySuggested(post.ranking?.signals);
              return (
                <a
                  key={String(post._id)}
                  href="/social"
                  onClick={() => trackPostClick(String(post._id))}
                  className="block border rounded p-3 hover:bg-gray-50"
                >
                  <div className="text-sm text-gray-900 whitespace-pre-wrap">{post.content || '(No text content)'}</div>
                  <div className="text-xs text-gray-500 mt-2">By @{post.authorId?.username || 'unknown'} • {new Date(post.createdAt).toLocaleString()}</div>
                  <div className="text-xs text-gray-500">{post.likesCount || 0} likes • {post.commentsCount || 0} comments</div>
                  <div className="text-xs text-blue-700 mt-2">
                    Why suggested: {whySuggested.length ? whySuggested.join(', ') : 'general relevance'}
                  </div>
                </a>
              );
            })}

            {!loading && posts.length === 0 ? (
              <p className="text-sm text-gray-500">No post suggestions found for this query.</p>
            ) : null}
          </div>

          <div className="mt-4 flex justify-between">
            <button
              type="button"
              disabled={postsPage <= 1 || loading}
              onClick={() => setPostsPage((page) => Math.max(1, page - 1))}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-sm text-gray-600">Page {postsPage} / {totalPostPages}</span>
            <button
              type="button"
              disabled={postsPage >= totalPostPages || loading}
              onClick={() => setPostsPage((page) => page + 1)}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Discover;
