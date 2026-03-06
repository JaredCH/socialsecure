import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI, circlesAPI, feedAPI, friendsAPI, galleryAPI, moderationAPI } from '../utils/api';
import PrivacySelector from '../components/PrivacySelector';
import CircleManager from '../components/CircleManager';
import ReportModal from '../components/ReportModal';
import BlockButton from '../components/BlockButton';

const MEDIA_URL_MAX_ITEMS = 8;
const MEDIA_URL_MAX_LENGTH = 2048;
const GALLERY_MAX_ITEMS = 24;
const GALLERY_MAX_IMAGE_SIZE_BYTES = 3 * 1024 * 1024;

const PRIVACY_BADGE_LABELS = {
  public: 'Public',
  friends: 'Friends',
  circles: 'Circles',
  specific_users: 'Specific Users',
  private: 'Private'
};

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

const normalizeGalleryItem = (item) => ({
  ...item,
  likesCount: typeof item?.likesCount === 'number' ? item.likesCount : 0,
  dislikesCount: typeof item?.dislikesCount === 'number' ? item.dislikesCount : 0,
  viewerReaction: item?.viewerReaction || null,
  caption: item?.caption || '',
  mediaType: item?.mediaType || 'url',
});

const Social = () => {
  const initialGuestUser = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('user') || '';
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(localStorage.getItem('token')));
  const [currentUser, setCurrentUser] = useState(null);
  const [isGuestPreview, setIsGuestPreview] = useState(false);
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
    visibleToCircles: [],
    visibleToUsers: [],
    excludeUsers: [],
    locationRadius: '',
    expirationPreset: 'none',
  });
  const [circles, setCircles] = useState([]);
  const [friends, setFriends] = useState([]);
  const [commentInputs, setCommentInputs] = useState({});
  const [actionLoadingByPost, setActionLoadingByPost] = useState({});
  const [galleryItems, setGalleryItems] = useState([]);
  const [galleryTargetInput, setGalleryTargetInput] = useState(initialGuestUser);
  const [galleryTarget, setGalleryTarget] = useState(initialGuestUser.trim());
  const [galleryUrlInput, setGalleryUrlInput] = useState('');
  const [galleryCaptionInput, setGalleryCaptionInput] = useState('');
  const [galleryError, setGalleryError] = useState('');
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryActionLoadingByImage, setGalleryActionLoadingByImage] = useState({});
  const [galleryEditById, setGalleryEditById] = useState({});
  const [blockedUserIds, setBlockedUserIds] = useState([]);
  const [mutedUserIds, setMutedUserIds] = useState([]);
  const [myReports, setMyReports] = useState([]);
  const [reportModalState, setReportModalState] = useState({
    isOpen: false,
    targetType: 'post',
    targetId: null,
    targetUserId: null
  });

  const galleryOwnerIdentifier = useMemo(() => {
    // Authenticated users always see their own gallery on /social
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

    return guestUser.trim();
  }, [isAuthenticated, currentUser?._id, galleryTarget, guestProfile?._id, guestUser]);

  const viewerCanReact = isAuthenticated && !isGuestPreview && Boolean(currentUser?._id);
  const normalizedGalleryOwnerIdentifier = String(galleryOwnerIdentifier || '').trim().toLowerCase();
  const normalizedCurrentUserId = String(currentUser?._id || '').trim().toLowerCase();
  const normalizedCurrentUsername = String(currentUser?.username || '').trim().toLowerCase();

  const canManageGallery =
    viewerCanReact
    && !isGuestPreview
    && Boolean(galleryOwnerIdentifier)
    && (
      normalizedGalleryOwnerIdentifier === normalizedCurrentUserId
      || normalizedGalleryOwnerIdentifier === normalizedCurrentUsername
    );

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
  }, [galleryOwnerIdentifier]);

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

    const [circlesResponse, friendsResponse] = await Promise.all([
      circlesAPI.getCircles().catch(() => ({ data: { circles: [] } })),
      friendsAPI.getFriends().catch(() => ({ data: { friends: [] } }))
    ]);
    setCircles(Array.isArray(circlesResponse.data?.circles) ? circlesResponse.data.circles : []);
    setFriends(Array.isArray(friendsResponse.data?.friends) ? friendsResponse.data.friends : []);

    const [blocksResponse, mutesResponse, reportsResponse] = await Promise.all([
      moderationAPI.getBlocks().catch(() => ({ data: { blockedUsers: [] } })),
      moderationAPI.getMutes().catch(() => ({ data: { mutedUsers: [] } })),
      moderationAPI.getMyReports().catch(() => ({ data: { reports: [] } }))
    ]);

    setBlockedUserIds((blocksResponse.data?.blockedUsers || []).map((entry) => String(entry._id)));
    setMutedUserIds((mutesResponse.data?.mutedUsers || []).map((entry) => String(entry._id)));
    setMyReports(Array.isArray(reportsResponse.data?.reports) ? reportsResponse.data.reports : []);

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

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

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

  const handlePostFormField = (field, value) => {
    setPostForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleStringInArray = (list, value) => {
    if (list.includes(value)) {
      return list.filter((entry) => entry !== value);
    }
    return [...list, value];
  };

  const handleToggleCircle = (circleName) => {
    setPostForm((prev) => ({
      ...prev,
      visibleToCircles: toggleStringInArray(prev.visibleToCircles, circleName)
    }));
  };

  const handleToggleVisibleUser = (userId) => {
    setPostForm((prev) => ({
      ...prev,
      visibleToUsers: toggleStringInArray(prev.visibleToUsers, userId)
    }));
  };

  const handleToggleExcludeUser = (userId) => {
    setPostForm((prev) => ({
      ...prev,
      excludeUsers: toggleStringInArray(prev.excludeUsers, userId)
    }));
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

    const content = postForm.content.trim();
    if (!content && postForm.mediaUrls.length === 0) {
      setFeedError('Add post content or at least one media URL before publishing.');
      return;
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
        visibleToCircles: postForm.visibleToCircles,
        visibleToUsers: postForm.visibleToUsers,
        excludeUsers: postForm.excludeUsers,
        locationRadius: postForm.locationRadius ? Number(postForm.locationRadius) : null,
        expiresAt,
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
        visibleToCircles: [],
        visibleToUsers: [],
        excludeUsers: [],
        locationRadius: '',
        expirationPreset: 'none',
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

  const handleAddGalleryUrl = async () => {
    if (!canManageGallery || !galleryOwnerIdentifier) return;

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

    setGalleryBusy(true);
    setGalleryError('');
    try {
      const response = await galleryAPI.createGalleryItem(galleryOwnerIdentifier, {
        mediaUrl: value,
        caption: galleryCaptionInput,
      });

      const created = response.data?.item ? normalizeGalleryItem(response.data.item) : null;
      if (created) {
        setGalleryItems((prev) => [created, ...prev]);
      } else {
        await loadGallery();
      }

      setGalleryUrlInput('');
      setGalleryCaptionInput('');
    } catch (error) {
      setGalleryError(error.response?.data?.error || 'Failed to add gallery URL.');
    } finally {
      setGalleryBusy(false);
    }
  };

  const handleUploadGalleryImage = async (event) => {
    if (!canManageGallery || !galleryOwnerIdentifier) return;

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
    setGalleryError('');
    try {
      const response = await galleryAPI.uploadGalleryItem(
        galleryOwnerIdentifier,
        file,
        galleryCaptionInput
      );

      const created = response.data?.item ? normalizeGalleryItem(response.data.item) : null;
      if (created) {
        setGalleryItems((prev) => [created, ...prev]);
      } else {
        await loadGallery();
      }

      setGalleryCaptionInput('');
    } catch (error) {
      setGalleryError(error.response?.data?.error || 'Failed to upload image.');
    } finally {
      setGalleryBusy(false);
    }
  };

  const handleStartEditGalleryItem = (item) => {
    setGalleryEditById((prev) => ({
      ...prev,
      [item._id]: {
        mediaUrl: item.mediaType === 'url' ? item.mediaUrl || '' : '',
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
      const payload = { caption: editState.caption || '' };
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

    setGalleryActionLoading(imageId, true);
    setGalleryError('');
    try {
      await galleryAPI.deleteGalleryItem(galleryOwnerIdentifier, imageId);
      setGalleryItems((prev) => prev.filter((item) => item._id !== imageId));
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

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 p-5 text-white shadow-lg ring-1 ring-white/20 sm:p-6 md:p-8">
        <div className="max-w-3xl space-y-2 sm:space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-100/95">
            Community Hub
          </p>
          <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            Social
          </h2>
          <p className="text-sm leading-relaxed text-white/95 sm:text-base">
            {isAuthenticated && isGuestPreview
              ? 'Guest preview mode: interaction controls are hidden. This is how your page appears to visitors.'
              : isAuthenticated
                ? 'Share updates, browse your timeline, and connect with your community.'
                : 'Guest mode: view public posts only. Sign in to create posts and interact.'}
          </p>
          {isAuthenticated && (
            <div className="pt-1">
              {isGuestPreview ? (
                <button
                  type="button"
                  onClick={() => setIsGuestPreview(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/30"
                >
                  ← Exit Guest Preview
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsGuestPreview(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/30"
                >
                  👁 View as Guest
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {isGuestPreview && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span className="font-semibold">Guest Preview</span>
          <span className="text-amber-700">You are previewing how your profile appears to non-authenticated visitors. Controls that require sign-in are hidden.</span>
          <button
            type="button"
            onClick={() => setIsGuestPreview(false)}
            className="ml-auto shrink-0 rounded border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            Exit Preview
          </button>
        </div>
      )}

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
                <Link to="/calendar" className="block px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-700">
                  Calendar
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
                <div className="space-y-2 text-sm text-gray-700">
                  <p>
                    Viewing public posts for <span className="font-medium">@{guestProfile.username}</span>
                  </p>
                  <Link
                    to={`/calendar?user=${encodeURIComponent(guestProfile.username)}`}
                    className="inline-flex text-blue-600 hover:text-blue-700"
                  >
                    View calendar
                  </Link>
                </div>
              )}
            </div>
          )}

          {isAuthenticated && !isGuestPreview && (
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

              <PrivacySelector
                form={postForm}
                circles={circles}
                friends={friends}
                onChange={handlePostFormField}
                onToggleCircle={handleToggleCircle}
                onToggleVisibleUser={handleToggleVisibleUser}
                onToggleExcludeUser={handleToggleExcludeUser}
              />

              <button
                type="submit"
                disabled={submittingPost}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
              >
                {submittingPost ? 'Publishing...' : 'Publish Post'}
              </button>
            </form>
          )}

          {isAuthenticated && !isGuestPreview && (
            <CircleManager
              circles={circles}
              friends={friends}
              onCreateCircle={handleCreateCircle}
              onDeleteCircle={handleDeleteCircle}
              onAddMember={handleAddCircleMember}
              onRemoveMember={handleRemoveCircleMember}
            />
          )}

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">{(isAuthenticated && !isGuestPreview) ? 'Timeline' : 'Public Timeline'}</h3>
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
                const postAuthorId = String(post.authorId?._id || post.authorId || '');
                const postTarget = post.targetFeedId?.username || postAuthor;
                const hasLiked = currentUser ? post.likes.includes(currentUser._id) : false;
                const postBusy = Boolean(actionLoadingByPost[post._id]);
                const isBlocked = blockedUserIds.includes(postAuthorId);
                const isMuted = mutedUserIds.includes(postAuthorId);

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
                        {PRIVACY_BADGE_LABELS[post.visibility] || post.visibility}
                      </span>
                    </header>

                    <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                      {Array.isArray(post.visibleToCircles) && post.visibleToCircles.length > 0 && (
                        <span className="bg-gray-100 px-2 py-1 rounded">
                          Circles: {post.visibleToCircles.join(', ')}
                        </span>
                      )}
                      {post.locationRadius ? (
                        <span className="bg-gray-100 px-2 py-1 rounded">Radius: {post.locationRadius} mi</span>
                      ) : null}
                      {post.expiresAt ? (
                        <span className="bg-gray-100 px-2 py-1 rounded">Expires: {formatDate(post.expiresAt)}</span>
                      ) : null}
                    </div>

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

                    {isAuthenticated && !isGuestPreview && postAuthorId && postAuthorId !== String(currentUser?._id) && (
                      <div className="flex flex-wrap gap-2">
                        <BlockButton
                          isBlocked={isBlocked}
                          onBlock={(reason) => handleBlockUser(postAuthorId, reason)}
                          onUnblock={() => handleUnblockUser(postAuthorId)}
                        />
                        <button
                          type="button"
                          onClick={() => handleToggleMuteUser(postAuthorId)}
                          className="px-3 py-1.5 rounded border border-gray-400 text-sm"
                        >
                          {isMuted ? 'Unmute User' : 'Mute User'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openReportModal('post', post._id, postAuthorId)}
                          className="px-3 py-1.5 rounded border border-red-300 text-red-700 text-sm"
                        >
                          Report
                        </button>
                      </div>
                    )}

          {isAuthenticated && !isGuestPreview && (
            <section className="bg-white rounded-xl shadow p-5 border border-gray-100 space-y-3">
              <h3 className="text-lg font-semibold">Moderation Transparency</h3>
              <p className="text-sm text-gray-600">Track the current status of your submitted reports.</p>
              {myReports.length === 0 ? (
                <p className="text-sm text-gray-500">No submitted reports yet.</p>
              ) : (
                <div className="space-y-2">
                  {myReports.slice(0, 10).map((report) => (
                    <div key={report.id} className="border rounded p-2 text-sm">
                      <p className="font-medium text-gray-900">
                        {report.category} • {report.targetType} • {report.status}
                      </p>
                      <p className="text-gray-500">{formatDate(report.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

                    {isAuthenticated && !isGuestPreview ? (
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

            {!isAuthenticated && (
              <div className="space-y-2 border rounded-lg p-3 bg-gray-50">
                <p className="text-sm text-gray-600">Choose a profile to browse gallery media.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={galleryTargetInput}
                    onChange={(event) => setGalleryTargetInput(event.target.value)}
                    placeholder="username or user ID"
                    className="flex-1 border rounded px-3 py-2"
                  />
                  <button
                    type="button"
                    onClick={() => setGalleryTarget(galleryTargetInput.trim())}
                    disabled={galleryBusy || galleryLoading}
                    className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-100 disabled:opacity-60"
                  >
                    Load Gallery
                  </button>
                </div>
              </div>
            )}

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
                    disabled={galleryBusy}
                    className="border border-blue-600 text-blue-600 px-4 py-2 rounded hover:bg-blue-50"
                  >
                    {galleryBusy ? 'Adding...' : 'Add URL'}
                  </button>
                </div>
                <input
                  type="text"
                  value={galleryCaptionInput}
                  onChange={(event) => setGalleryCaptionInput(event.target.value)}
                  placeholder="Optional caption"
                  maxLength={280}
                  className="w-full border rounded px-3 py-2"
                />
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

            {galleryLoading ? (
              <div className="text-sm text-gray-500 border rounded p-4 bg-gray-50">Loading gallery...</div>
            ) : galleryItems.length === 0 ? (
              <div className="text-sm text-gray-500 border rounded p-4 bg-gray-50">No gallery images yet.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {galleryItems.map((image) => {
                  const viewerReaction = image.viewerReaction || null;
                  const imageBusy = Boolean(galleryActionLoadingByImage[image._id]);
                  const editState = galleryEditById[image._id] || null;

                  return (
                    <article key={image._id} className="border rounded-lg overflow-hidden bg-white">
                      <img src={image.mediaUrl} alt="Gallery item" className="w-full h-48 object-cover" />
                      <div className="p-3 space-y-2">
                        {image.caption ? (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{image.caption}</p>
                        ) : null}

                        <div className="flex items-center gap-2 text-sm">
                          <button
                            type="button"
                            onClick={() => handleGalleryReaction(image._id, 'like')}
                            disabled={!viewerCanReact || imageBusy}
                            className={`px-2 py-1 rounded border ${
                              viewerReaction === 'like'
                                ? 'bg-green-600 border-green-600 text-white'
                                : 'border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            👍 {image.likesCount || 0}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleGalleryReaction(image._id, 'dislike')}
                            disabled={!viewerCanReact || imageBusy}
                            className={`px-2 py-1 rounded border ${
                              viewerReaction === 'dislike'
                                ? 'bg-red-600 border-red-600 text-white'
                                : 'border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            👎 {image.dislikesCount || 0}
                          </button>
                        </div>

                        {!viewerCanReact ? (
                          <p className="text-xs text-gray-500">Sign in to react.</p>
                        ) : null}

                        {canManageGallery ? (
                          <div className="space-y-2 border-t pt-2">
                            {editState ? (
                              <div className="space-y-2">
                                {image.mediaType === 'url' ? (
                                  <input
                                    type="url"
                                    value={editState.mediaUrl}
                                    onChange={(event) =>
                                      handleEditGalleryField(image._id, 'mediaUrl', event.target.value)
                                    }
                                    placeholder="https://example.com/photo.jpg"
                                    className="w-full border rounded px-2 py-1 text-sm"
                                  />
                                ) : null}
                                <input
                                  type="text"
                                  value={editState.caption}
                                  onChange={(event) =>
                                    handleEditGalleryField(image._id, 'caption', event.target.value)
                                  }
                                  placeholder="Caption"
                                  maxLength={280}
                                  className="w-full border rounded px-2 py-1 text-sm"
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleSaveGalleryItem(image)}
                                    disabled={imageBusy}
                                    className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCancelEditGalleryItem(image._id)}
                                    disabled={imageBusy}
                                    className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleStartEditGalleryItem(image)}
                                disabled={imageBusy}
                                className="text-xs text-blue-600 hover:text-blue-700"
                              >
                                Edit image
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRemoveGalleryImage(image._id)}
                              disabled={imageBusy}
                              className="text-xs text-red-600 hover:text-red-700 disabled:opacity-60"
                            >
                              Remove image
                            </button>
                          </div>
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

      <ReportModal
        isOpen={reportModalState.isOpen}
        targetType={reportModalState.targetType}
        targetId={reportModalState.targetId}
        targetUserId={reportModalState.targetUserId}
        onClose={closeReportModal}
        onSubmit={submitReport}
      />
    </div>
  );
};

export default Social;
