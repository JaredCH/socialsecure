import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI, feedAPI } from '../utils/api';

const VISIBILITY_OPTIONS = ['public', 'friends', 'private'];
const MEDIA_URL_MAX_ITEMS = 8;
const MEDIA_URL_MAX_LENGTH = 2048;
const GALLERY_STORAGE_KEY = 'socialsecure.gallery.v1';
const GALLERY_MAX_ITEMS = 24;
const GALLERY_MAX_IMAGE_SIZE_BYTES = 3 * 1024 * 1024;

const isRenderableMediaUrl = (value) => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MEDIA_URL_MAX_LENGTH) return false;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
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
    mediaUrls: normalizeMediaUrls(post.mediaUrls),
  };
};

const readGalleryStore = () => {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(GALLERY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeGalleryStore = (store) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(store));
};

const readGalleryItems = (ownerKey) => {
  if (!ownerKey) return [];
  const store = readGalleryStore();
  const items = store[ownerKey];
  return Array.isArray(items) ? items : [];
};

const writeGalleryItems = (ownerKey, items) => {
  if (!ownerKey) return;
  const store = readGalleryStore();
  store[ownerKey] = items;
  writeGalleryStore(store);
};

const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });

const computeReactionCounts = (votes) => {
  const values = Object.values(votes || {});
  return {
    likes: values.filter((value) => value === 'like').length,
    dislikes: values.filter((value) => value === 'dislike').length,
  };
};

const Social = () => {
  const initialGuestUser = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('user') || '';
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(localStorage.getItem('token')));
  const [currentUser, setCurrentUser] = useState(null);
  const [guestUser, setGuestUser] = useState(initialGuestUser);
  const [guestProfile, setGuestProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [submittingPost, setSubmittingPost] = useState(false);
  const [postForm, setPostForm] = useState({
    content: '',
    mediaUrlInput: '',
    mediaUrls: [],
    visibility: 'public',
  });
  const [commentInputs, setCommentInputs] = useState({});
  const [actionLoadingByPost, setActionLoadingByPost] = useState({});
  const [galleryItems, setGalleryItems] = useState([]);
  const [galleryUrlInput, setGalleryUrlInput] = useState('');
  const [galleryError, setGalleryError] = useState('');
  const [galleryBusy, setGalleryBusy] = useState(false);

  const galleryOwnerKey = useMemo(() => {
    if (isAuthenticated && currentUser?._id) {
      return `user:${currentUser._id}`;
    }

    if (guestProfile?._id) {
      return `user:${guestProfile._id}`;
    }

    const guestKey = guestUser.trim().toLowerCase();
    return guestKey ? `guest:${guestKey}` : '';
  }, [isAuthenticated, currentUser?._id, guestProfile?._id, guestUser]);

  const galleryActorKey = useMemo(() => {
    if (isAuthenticated && currentUser?._id) {
      return `user:${currentUser._id}`;
    }
    return 'guest:anonymous';
  }, [isAuthenticated, currentUser?._id]);

  const canManageGallery = isAuthenticated && Boolean(currentUser?._id);

  useEffect(() => {
    if (!galleryOwnerKey) {
      setGalleryItems([]);
      return;
    }

    setGalleryItems(readGalleryItems(galleryOwnerKey));
    setGalleryError('');
  }, [galleryOwnerKey]);

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

  const loadAuthenticatedFeed = useCallback(async () => {
    const profileResponse = await authAPI.getProfile();
    const user = profileResponse.data?.user;
    setCurrentUser(user || null);

    const timelineResponse = await feedAPI.getTimeline();
    const timelinePosts = Array.isArray(timelineResponse.data?.posts)
      ? timelineResponse.data.posts
      : [];
    setPosts(timelinePosts.map(normalizePost));
    setGuestProfile(null);
  }, []);

  const loadGuestFeed = useCallback(async () => {
    if (!guestUser.trim()) {
      setPosts([]);
      setGuestProfile(null);
      setFeedError('Enter a username or user ID in Guest mode to view a public feed.');
      return;
    }

    const response = await feedAPI.getPublicUserFeed(guestUser.trim());
    const publicPosts = Array.isArray(response.data?.posts) ? response.data.posts : [];
    setPosts(publicPosts.map(normalizePost));
    setGuestProfile(response.data?.user || null);
  }, [guestUser]);

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    setFeedError('');

    const token = localStorage.getItem('token');
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
      await loadAuthenticatedFeed();
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to load timeline.');
      setPosts([]);
    } finally {
      setLoadingFeed(false);
    }
  }, [loadAuthenticatedFeed, loadGuestFeed]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const handleAddMediaUrl = () => {
    const value = postForm.mediaUrlInput.trim();
    if (!value) return;
    if (!isRenderableMediaUrl(value)) {
      setFeedError('Media URL must be a valid http/https URL.');
      return;
    }
    if (value.length > MEDIA_URL_MAX_LENGTH) {
      setFeedError(`Media URL exceeds max length (${MEDIA_URL_MAX_LENGTH}).`);
      return;
    }
    if (postForm.mediaUrls.length >= MEDIA_URL_MAX_ITEMS) {
      setFeedError(`You can attach up to ${MEDIA_URL_MAX_ITEMS} media URLs per post.`);
      setPostForm((prev) => ({ ...prev, mediaUrlInput: '' }));
      return;
    }
    if (postForm.mediaUrls.includes(value)) {
      setPostForm((prev) => ({ ...prev, mediaUrlInput: '' }));
      return;
    }

    setPostForm((prev) => ({
      ...prev,
      mediaUrls: [...prev.mediaUrls, value],
      mediaUrlInput: '',
    }));
    setFeedError('');
  };

  const handleRemoveMediaUrl = (index) => {
    setPostForm((prev) => ({
      ...prev,
      mediaUrls: prev.mediaUrls.filter((_, i) => i !== index),
    }));
  };

  const handleSubmitPost = async (event) => {
    event.preventDefault();
    if (!currentUser?._id) return;

    const content = postForm.content.trim();
    if (!content && postForm.mediaUrls.length === 0) {
      setFeedError('Add post content or at least one media URL before publishing.');
      return;
    }

    setSubmittingPost(true);
    setFeedError('');
    try {
      const response = await feedAPI.createPost({
        content,
        mediaUrls: postForm.mediaUrls,
        visibility: postForm.visibility,
        targetFeedId: currentUser._id,
      });

      const created = response.data?.post ? normalizePost(response.data.post) : null;
      if (created) {
        setPosts((prev) => [created, ...prev]);
      } else {
        await loadAuthenticatedFeed();
      }

      setPostForm({
        content: '',
        mediaUrlInput: '',
        mediaUrls: [],
        visibility: 'public',
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
    } catch (error) {
      setFeedError(error.response?.data?.error || 'Failed to add comment.');
    } finally {
      setPostActionLoading(postId, false);
    }
  };

  const persistGallery = (nextItems) => {
    setGalleryItems(nextItems);
    writeGalleryItems(galleryOwnerKey, nextItems);
  };

  const handleAddGalleryUrl = () => {
    if (!canManageGallery) return;

    const value = galleryUrlInput.trim();
    if (!value) return;

    if (!isRenderableMediaUrl(value)) {
      setGalleryError('Gallery image URL must be a valid http/https URL.');
      return;
    }

    if (galleryItems.length >= GALLERY_MAX_ITEMS) {
      setGalleryError(`Gallery can contain up to ${GALLERY_MAX_ITEMS} images.`);
      return;
    }

    const normalized = value.toLowerCase();
    if (galleryItems.some((item) => String(item.url || '').toLowerCase() === normalized)) {
      setGalleryUrlInput('');
      return;
    }

    const nextItems = [
      {
        id: `gallery-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        url: value,
        votes: {},
        likes: 0,
        dislikes: 0,
        createdAt: new Date().toISOString(),
      },
      ...galleryItems,
    ];

    persistGallery(nextItems);
    setGalleryUrlInput('');
    setGalleryError('');
  };

  const handleUploadGalleryImage = async (event) => {
    if (!canManageGallery) return;

    const [file] = Array.from(event.target.files || []);
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setGalleryError('Only image files are supported.');
      return;
    }

    if (file.size > GALLERY_MAX_IMAGE_SIZE_BYTES) {
      setGalleryError('Image file is too large (max 3MB).');
      return;
    }

    if (galleryItems.length >= GALLERY_MAX_ITEMS) {
      setGalleryError(`Gallery can contain up to ${GALLERY_MAX_ITEMS} images.`);
      return;
    }

    setGalleryBusy(true);
    try {
      const dataUrl = await toDataUrl(file);
      const nextItems = [
        {
          id: `gallery-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          url: dataUrl,
          votes: {},
          likes: 0,
          dislikes: 0,
          createdAt: new Date().toISOString(),
          fileName: file.name,
        },
        ...galleryItems,
      ];

      persistGallery(nextItems);
      setGalleryError('');
    } catch {
      setGalleryError('Failed to upload image. Please try again.');
    } finally {
      setGalleryBusy(false);
    }
  };

  const handleRemoveGalleryImage = (imageId) => {
    if (!canManageGallery) return;
    const nextItems = galleryItems.filter((item) => item.id !== imageId);
    persistGallery(nextItems);
  };

  const handleGalleryReaction = (imageId, reactionType) => {
    const nextItems = galleryItems.map((item) => {
      if (item.id !== imageId) return item;

      const nextVotes = { ...(item.votes || {}) };
      const existingReaction = nextVotes[galleryActorKey];

      if (existingReaction === reactionType) {
        delete nextVotes[galleryActorKey];
      } else {
        nextVotes[galleryActorKey] = reactionType;
      }

      const { likes, dislikes } = computeReactionCounts(nextVotes);
      return {
        ...item,
        votes: nextVotes,
        likes,
        dislikes,
      };
    });

    persistGallery(nextItems);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white rounded-2xl shadow-lg p-6">
        <h2 className="text-2xl font-semibold mb-2">Social</h2>
        <p className="text-blue-100">
          {isAuthenticated
            ? 'Share updates, browse your timeline, and connect with your community.'
            : 'Guest mode: view public posts only. Sign in to create posts and interact.'}
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <aside className="xl:col-span-3 space-y-4 xl:sticky xl:top-6">
          <section className="bg-white rounded-xl shadow p-5 border border-gray-100">
            <h3 className="text-sm uppercase tracking-wide text-gray-500 font-semibold">Shortcuts</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link to="/social" className="block px-3 py-2 rounded-lg bg-blue-50 text-blue-700 font-medium">
                  Social Stream
                </Link>
              </li>
              <li>
                <Link to="/market" className="block px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-700">
                  Marketplace
                </Link>
              </li>
              <li>
                <Link to="/settings" className="block px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-700">
                  User Settings
                </Link>
              </li>
              <li>
                <Link to="/refer" className="block px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-700">
                  Refer Friend
                </Link>
              </li>
            </ul>
          </section>

          <section className="bg-white rounded-xl shadow p-5 border border-gray-100">
            <h3 className="text-sm uppercase tracking-wide text-gray-500 font-semibold">Social Snapshot</h3>
            <div className="mt-3 space-y-3 text-sm text-gray-700">
              <p>
                Active profile:{' '}
                <span className="font-medium">
                  {currentUser?.username ? `@${currentUser.username}` : 'Guest'}
                </span>
              </p>
              <p>
                Loaded posts:{' '}
                <span className="font-medium">{posts.length}</span>
              </p>
              {!isAuthenticated && guestProfile?.username && (
                <p>
                  Viewing public profile:{' '}
                  <span className="font-medium">@{guestProfile.username}</span>
                </p>
              )}
            </div>
          </section>
        </aside>

        <section className="xl:col-span-6 space-y-6">
          {!isAuthenticated && (
            <div className="bg-white rounded-xl shadow p-6 space-y-3 border border-gray-100">
              <h3 className="text-lg font-medium">Guest Public Feed</h3>
              <p className="text-sm text-gray-600">Enter a username or user ID to load a public feed.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={guestUser}
                  onChange={(event) => setGuestUser(event.target.value)}
                  placeholder="username or user ID"
                  className="flex-1 border rounded px-3 py-2"
                />
                <button
                  type="button"
                  onClick={loadFeed}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  disabled={loadingFeed}
                >
                  Load
                </button>
              </div>
              {guestProfile && (
                <p className="text-sm text-gray-700">
                  Viewing public posts for <span className="font-medium">@{guestProfile.username}</span>
                </p>
              )}
            </div>
          )}

          {isAuthenticated && (
            <form onSubmit={handleSubmitPost} className="bg-white rounded-xl shadow p-6 space-y-4 border border-gray-100">
              <h3 className="text-lg font-medium">Create Post</h3>

              <textarea
                value={postForm.content}
                onChange={(event) => setPostForm((prev) => ({ ...prev, content: event.target.value }))}
                placeholder="What's on your mind?"
                className="w-full border rounded px-3 py-2 min-h-28"
                maxLength={5000}
              />

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Media URLs</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={postForm.mediaUrlInput}
                    onChange={(event) =>
                      setPostForm((prev) => ({ ...prev, mediaUrlInput: event.target.value }))
                    }
                    placeholder="https://example.com/image.jpg"
                    className="flex-1 border rounded px-3 py-2"
                  />
                  <button
                    type="button"
                    onClick={handleAddMediaUrl}
                    className="border border-blue-600 text-blue-600 px-4 py-2 rounded hover:bg-blue-50"
                  >
                    Add URL
                  </button>
                </div>

                {postForm.mediaUrls.length > 0 && (
                  <ul className="space-y-1">
                    {postForm.mediaUrls.map((url, index) => (
                      <li
                        key={`${url}-${index}`}
                        className="flex items-center justify-between text-sm bg-gray-50 border rounded px-2 py-1"
                      >
                        <span className="truncate pr-2">{url}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMediaUrl(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
                <select
                  value={postForm.visibility}
                  onChange={(event) => setPostForm((prev) => ({ ...prev, visibility: event.target.value }))}
                  className="border rounded px-3 py-2"
                >
                  {VISIBILITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={submittingPost}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
              >
                {submittingPost ? 'Publishing...' : 'Publish Post'}
              </button>
            </form>
          )}

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">{isAuthenticated ? 'Timeline' : 'Public Timeline'}</h3>
              <button
                type="button"
                onClick={loadFeed}
                className="text-sm px-3 py-2 border rounded hover:bg-gray-50"
                disabled={loadingFeed}
              >
                {loadingFeed ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {feedError && <div className="text-red-700 bg-red-50 border border-red-200 rounded p-3">{feedError}</div>}

            {loadingFeed ? (
              <div className="bg-white rounded-xl shadow p-6 text-gray-600 border border-gray-100">Loading feed...</div>
            ) : posts.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-6 text-gray-600 border border-gray-100">
                No posts found yet.
              </div>
            ) : (
              posts.map((post) => {
                const postAuthor = post.authorId?.username || 'unknown';
                const postTarget = post.targetFeedId?.username || postAuthor;
                const hasLiked = currentUser ? post.likes.includes(currentUser._id) : false;
                const postBusy = Boolean(actionLoadingByPost[post._id]);

                return (
                  <article key={post._id} className="bg-white rounded-xl shadow p-5 space-y-3 border border-gray-100">
                    <header className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          @{postAuthor} {'→'} @{postTarget}
                        </p>
                        <p className="text-xs text-gray-500">{formatDate(post.createdAt)}</p>
                      </div>
                      <span className="text-xs uppercase tracking-wide bg-gray-100 px-2 py-1 rounded">
                        {post.visibility}
                      </span>
                    </header>

                    {post.content && <p className="text-gray-800 whitespace-pre-wrap">{post.content}</p>}

                    {post.mediaUrls.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {post.mediaUrls.map((url, index) => (
                          renderMediaItem(url, `${post._id}-media-${index}`)
                        ))}
                      </div>
                    )}

                    <div className="text-sm text-gray-600 flex items-center gap-4">
                      <span>{post.likesCount} like{post.likesCount === 1 ? '' : 's'}</span>
                      <span>{post.commentsCount} comment{post.commentsCount === 1 ? '' : 's'}</span>
                    </div>

                    {isAuthenticated ? (
                      <div className="space-y-3">
                        <button
                          type="button"
                          disabled={postBusy}
                          onClick={() => handleToggleLike(post)}
                          className={`px-3 py-1.5 rounded border text-sm ${
                            hasLiked
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {hasLiked ? 'Unlike' : 'Like'}
                        </button>

                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Comments</h4>
                          {post.comments.length === 0 ? (
                            <p className="text-sm text-gray-500">No comments yet.</p>
                          ) : (
                            <ul className="space-y-2">
                              {post.comments.map((comment, index) => (
                                <li key={comment._id || `${post._id}-comment-${index}`} className="text-sm border rounded p-2 bg-gray-50">
                                  <p className="font-medium text-gray-700">
                                    @{comment.username || comment.userId || 'user'}
                                  </p>
                                  <p className="text-gray-800 whitespace-pre-wrap">{comment.content}</p>
                                  <p className="text-xs text-gray-500">{formatDate(comment.createdAt)}</p>
                                </li>
                              ))}
                            </ul>
                          )}

                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={commentInputs[post._id] || ''}
                              onChange={(event) =>
                                setCommentInputs((prev) => ({ ...prev, [post._id]: event.target.value }))
                              }
                              placeholder="Add a comment..."
                              className="flex-1 border rounded px-3 py-2 text-sm"
                              maxLength={1000}
                            />
                            <button
                              type="button"
                              onClick={() => handleAddComment(post._id)}
                              disabled={postBusy}
                              className="px-3 py-2 bg-gray-900 text-white rounded text-sm hover:bg-gray-800 disabled:opacity-60"
                            >
                              Comment
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">Sign in to like or comment on posts.</p>
                    )}
                  </article>
                );
              })
            )}
          </section>

          <section className="bg-white rounded-xl shadow p-5 border border-gray-100 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold">Gallery</h3>
              <span className="text-xs text-gray-500">{galleryItems.length}/{GALLERY_MAX_ITEMS}</span>
            </div>

            {canManageGallery ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Add images by URL or upload image files. You can remove your own gallery items any time.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={galleryUrlInput}
                    onChange={(event) => setGalleryUrlInput(event.target.value)}
                    placeholder="https://example.com/photo.jpg"
                    className="flex-1 border rounded px-3 py-2"
                  />
                  <button
                    type="button"
                    onClick={handleAddGalleryUrl}
                    className="border border-blue-600 text-blue-600 px-4 py-2 rounded hover:bg-blue-50"
                  >
                    Add URL
                  </button>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadGalleryImage}
                    disabled={galleryBusy}
                  />
                </label>
              </div>
            ) : (
              <p className="text-sm text-gray-600">Browse gallery items and react with like/dislike.</p>
            )}

            {galleryError ? (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{galleryError}</div>
            ) : null}

            {galleryItems.length === 0 ? (
              <div className="text-sm text-gray-500 border rounded p-4 bg-gray-50">No gallery images yet.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {galleryItems.map((image) => {
                  const viewerReaction = image.votes?.[galleryActorKey] || null;

                  return (
                    <article key={image.id} className="border rounded-lg overflow-hidden bg-white">
                      <img src={image.url} alt="Gallery item" className="w-full h-48 object-cover" />
                      <div className="p-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <button
                            type="button"
                            onClick={() => handleGalleryReaction(image.id, 'like')}
                            className={`px-2 py-1 rounded border ${
                              viewerReaction === 'like'
                                ? 'bg-green-600 border-green-600 text-white'
                                : 'border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            👍 {image.likes || 0}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleGalleryReaction(image.id, 'dislike')}
                            className={`px-2 py-1 rounded border ${
                              viewerReaction === 'dislike'
                                ? 'bg-red-600 border-red-600 text-white'
                                : 'border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            👎 {image.dislikes || 0}
                          </button>
                        </div>
                        {canManageGallery ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveGalleryImage(image.id)}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Remove image
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>

        <aside className="xl:col-span-3 space-y-4 xl:sticky xl:top-6">
          <section className="bg-white rounded-xl shadow p-5 border border-gray-100">
            <h3 className="text-sm uppercase tracking-wide text-gray-500 font-semibold">Chat Panel</h3>
            <p className="mt-3 text-sm text-gray-700">
              Jump into direct or room conversations without leaving the social experience.
            </p>
            <Link
              to="/chat"
              className="mt-4 inline-flex items-center justify-center w-full bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800"
            >
              Open Chat
            </Link>
          </section>

          <section className="bg-white rounded-xl shadow p-5 border border-gray-100">
            <h3 className="text-sm uppercase tracking-wide text-gray-500 font-semibold">Community Notes</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-inside">
              <li>Keep posts constructive and clear.</li>
              <li>Use visibility settings to control reach.</li>
              <li>Switch to chat for real-time discussion.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default Social;
