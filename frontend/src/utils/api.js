import axios from 'axios';

export const normalizeApiBaseUrl = (apiUrl) => {
  const trimmedApiUrl = (apiUrl || '').trim();
  if (!trimmedApiUrl) return '/api';

  const isAbsoluteUrl = /^(https?:)?\/\//i.test(trimmedApiUrl);
  const normalizedApiUrl = isAbsoluteUrl
    ? trimmedApiUrl
    : `/${trimmedApiUrl.replace(/^\/+/, '')}`;

  return normalizedApiUrl.replace(/\/+$/, '') || '/api';
};

const API_URL = normalizeApiBaseUrl(process.env.REACT_APP_API_URL);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const REGISTER_PASSWORD_REQUIREMENTS = [
  {
    id: 'minLength',
    label: 'At least 8 characters',
    validator: (password) => password.length >= 8
  },
  {
    id: 'upperLower',
    label: 'Includes uppercase and lowercase letters',
    validator: (password) => /[a-z]/.test(password) && /[A-Z]/.test(password)
  },
  {
    id: 'number',
    label: 'Includes at least one number',
    validator: (password) => /\d/.test(password)
  }
];

const PASSWORD_STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong'];

export const evaluateRegisterPassword = (password = '') => {
  const requirementChecks = REGISTER_PASSWORD_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    met: requirement.validator(password)
  }));

  const metCount = requirementChecks.filter((requirement) => requirement.met).length;
  let strengthScore = 0;
  if (metCount >= 1) strengthScore = 1;
  if (metCount >= 2) strengthScore = 2;
  if (metCount === REGISTER_PASSWORD_REQUIREMENTS.length && password.length >= 12) {
    strengthScore = 3;
  }

  return {
    requirementChecks,
    allRequirementsMet: requirementChecks.every((requirement) => requirement.met),
    strengthScore,
    strengthLabel: PASSWORD_STRENGTH_LABELS[strengthScore]
  };
};

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  checkUsernameAvailability: (username) => api.get(`/auth/username-availability?username=${encodeURIComponent(username)}`),
  login: (data) => api.post('/auth/login', data),
  getProfile: () => api.get('/auth/me'),
  getSecurityCenter: () => api.get('/auth/security-center'),
  getSessions: () => api.get('/auth/sessions'),
  revokeSession: (sessionId) => api.delete(`/auth/sessions/${sessionId}`),
  revokeAllOtherSessions: () => api.delete('/auth/sessions/all-others'),
  getSecurityEvents: (page = 1, limit = 50) => api.get(`/auth/security-events?page=${page}&limit=${limit}`),
  getOnboardingStatus: () => api.get('/auth/onboarding-status'),
  updateOnboardingProgress: (step, data = {}) => api.post('/auth/onboarding/progress', { step, data }),
  completeOnboarding: (securityPreferences = {}) => api.post('/auth/onboarding/complete', { securityPreferences }),
  updateProfile: (data) => api.put('/auth/profile', data),
  getAddressSuggestions: (query) => api.get(`/auth/address-suggestions?q=${encodeURIComponent(query)}`),
  respondToAddressApproval: (requestId, decision) => api.post('/auth/address-approval/respond', { requestId, decision }),
  setupPGP: (publicKey) => api.post('/auth/pgp/setup', { publicKey }),
  getEncryptionPasswordStatus: () => api.get('/auth/encryption-password/status'),
  setEncryptionPassword: (data) => api.post('/auth/encryption-password/set', data),
  changeEncryptionPassword: (data) => api.post('/auth/encryption-password/change', data),
  changePassword: (data) => api.post('/auth/password/change', data),
  // 12-hour unlock session
  verifyEncryptionPassword: (password) => api.post('/auth/encryption-password/verify', { encryptionPassword: password }),
  getEncryptionUnlockStatus: () => api.get('/auth/encryption-password/status/unlock'),
  lockEncryption: () => api.post('/auth/encryption-password/lock'),
  getDeviceKeys: () => api.get('/chat/devices'),
  // Recovery kit
  saveRecoveryKitMetadata: (data) => api.post('/auth/recovery-kit/metadata', data),
  getRecoveryKitStatus: () => api.get('/auth/recovery-kit/status'),
};

export const resumeAPI = {
  getPublicResume: (username) =>
    api.get(`/public/users/${encodeURIComponent(username)}/resume`),
  getMyResume: () => api.get('/resume/me'),
  upsertMyResume: (data) => api.put('/resume/me', data),
  saveMyResume: (data) => api.put('/resume/me', data),
  deleteMyResume: () => api.delete('/resume/me'),
  trackEvent: (eventType, metadata = {}) => api.post('/resume/me/telemetry', { eventType, metadata }),
  trackProfileLinkClick: (username, source = 'social_profile') =>
    api.post(`/public/users/${encodeURIComponent(username)}/resume/link-click`, { source })
};

// User API
export const userAPI = {
  search: (queryOrCriteria) => {
    if (typeof queryOrCriteria === 'string') {
      return api.get(`/users/search?q=${encodeURIComponent(queryOrCriteria)}`);
    }
    return api.post('/users/search', queryOrCriteria || {});
  },
  getByUsername: (username) => api.get(`/users/username/${username}`),
  getById: (userId) => api.get(`/users/${userId}`),
};

// Feed API
export const feedAPI = {
  getUserFeed: (userId, page = 1, limit = 20) => 
    api.get(`/feed/user/${userId}?page=${page}&limit=${limit}`),
  getPublicUserFeed: (userIdOrUsername, page = 1, limit = 20) =>
    api.get(`/public/users/${encodeURIComponent(userIdOrUsername)}/feed?page=${page}&limit=${limit}`),
  createPost: (data) => api.post('/feed/post', data),
  deletePost: (postId) => api.delete(`/feed/post/${postId}`),
  likePost: (postId) => api.post(`/feed/post/${postId}/like`),
  unlikePost: (postId) => api.delete(`/feed/post/${postId}/like`),
  addComment: (postId, content) => api.post(`/feed/post/${postId}/comment`, { content }),
  votePoll: (postId, optionIndexes) => api.post(`/feed/post/${postId}/vote`, { optionIndexes }),
  submitQuizAnswer: (postId, optionIndex) => api.post(`/feed/post/${postId}/quiz-answer`, { optionIndex }),
  followCountdown: (postId) => api.post(`/feed/post/${postId}/countdown-follow`),
  getInteraction: (postId) => api.get(`/feed/post/${postId}/interaction`),
  getTimeline: (page = 1, limit = 20) => 
    api.get(`/feed/timeline?page=${page}&limit=${limit}`),
  getPost: (postId) => api.get(`/feed/post/${postId}`),
};

// Gallery API
export const galleryAPI = {
  getGallery: (ownerIdOrUsername, page = 1, limit = 20) =>
    api.get(`/gallery/${encodeURIComponent(ownerIdOrUsername)}?page=${page}&limit=${limit}`),
  createGalleryItem: (ownerIdOrUsername, data) =>
    api.post(`/gallery/${encodeURIComponent(ownerIdOrUsername)}`, data),
  uploadGalleryItem: (ownerIdOrUsername, file, caption = '', relationshipAudience = 'social', title = '') => {
    const formData = new FormData();
    formData.append('image', file);
    if (title) {
      formData.append('title', title);
    }
    if (caption) {
      formData.append('caption', caption);
    }
    if (relationshipAudience) {
      formData.append('relationshipAudience', relationshipAudience);
    }

    return api.post(`/gallery/${encodeURIComponent(ownerIdOrUsername)}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  updateGalleryItem: (ownerIdOrUsername, imageId, data) =>
    api.patch(`/gallery/${encodeURIComponent(ownerIdOrUsername)}/${encodeURIComponent(imageId)}`, data),
  deleteGalleryItem: (ownerIdOrUsername, imageId) =>
    api.delete(`/gallery/${encodeURIComponent(ownerIdOrUsername)}/${encodeURIComponent(imageId)}`),
  reactToGalleryImage: (ownerIdOrUsername, imageId, type) =>
    api.post(`/gallery/${encodeURIComponent(ownerIdOrUsername)}/${encodeURIComponent(imageId)}/reaction`, {
      type,
    }),
};

// Chat API
export const chatAPI = {
  getNearbyRooms: (latitude, longitude, radius = 50) =>
    api.get(`/chat/rooms/nearby?latitude=${latitude}&longitude=${longitude}&radius=${radius}`),
  getRoom: (roomId, page = 1, limit = 500) =>
    api.get(`/chat/rooms/${roomId}?page=${page}&limit=${limit}`),
  sendMessage: (roomId, data) => api.post(`/chat/rooms/${roomId}/messages`, data),
  requestAudioUpload: (roomId, audioBlob, metadata = {}) => {
    const formData = new FormData();
    formData.append('roomId', roomId);
    formData.append('audio', audioBlob, metadata.fileName || `voice-note.${(metadata.mimeType || 'audio/webm').split('/')[1] || 'webm'}`);
    if (metadata.durationMs != null) {
      formData.append('durationMs', String(metadata.durationMs));
    }
    if (Array.isArray(metadata.waveformBins)) {
      formData.append('waveformBins', JSON.stringify(metadata.waveformBins));
    }
    return api.post('/chat/media/audio/upload-url', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },
  sendVoiceMessage: (roomId, audio) =>
    api.post(`/chat/rooms/${roomId}/messages`, {
      mediaType: 'audio',
      audio,
      messageType: 'text'
    }),
  sendE2EEMessage: (roomId, data) => api.post(`/chat/rooms/${roomId}/messages/e2ee`, data),
  getMessages: (roomId, page = 1, limit = 500) =>
    api.get(`/chat/rooms/${roomId}/messages?page=${page}&limit=${limit}`),
  getMessagesByCursor: (roomId, cursor, limit = 500) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) {
      params.append('cursor', cursor);
    }
    return api.get(`/chat/rooms/${roomId}/messages?${params.toString()}`);
  },
  migrateMessageToE2EE: (roomId, messageId, data) =>
    api.post(`/chat/rooms/${roomId}/messages/${messageId}/migrate-e2ee`, data),
  registerDeviceKeys: (data) => api.post('/chat/devices/keys', data),
  revokeDeviceKey: (deviceId) => api.delete(`/chat/devices/keys/${encodeURIComponent(deviceId)}`),
  publishRoomKeyPackages: (roomId, packages) =>
    api.post(`/chat/rooms/${roomId}/keys/packages`, { packages }),
  syncRoomKeyPackages: (roomId, deviceId, since, limit = 100) => {
    const params = new URLSearchParams({
      deviceId,
      limit: String(limit)
    });
    if (since) {
      params.append('since', since);
    }
    return api.get(`/chat/rooms/${roomId}/keys/packages/sync?${params.toString()}`);
  },
  joinRoom: (roomId) => api.post(`/chat/rooms/${roomId}/join`),
  leaveRoom: (roomId) => api.post(`/chat/rooms/${roomId}/leave`),
  getRoomUsers: (roomId) => api.get(`/chat/rooms/${roomId}/users`),
  syncLocationRooms: () => api.post('/chat/rooms/sync-location'),
  getNearbyZipRooms: (zipCode) => api.get(`/chat/zip/nearby?zipCode=${encodeURIComponent(zipCode)}`),
  getConversations: () => api.get('/chat/conversations'),
  getConversationMessages: (conversationId, page = 1, limit = 50) =>
    api.get(`/chat/conversations/${conversationId}/messages?page=${page}&limit=${limit}`),
  getConversationUsers: (conversationId) =>
    api.get(`/chat/conversations/${conversationId}/users`),
  getConversationDevices: (conversationId) =>
    api.get(`/chat/conversations/${conversationId}/devices`),
  sendConversationMessage: (conversationId, payload) => {
    if (typeof payload === 'string') {
      return api.post(`/chat/conversations/${conversationId}/messages`, { content: payload });
    }
    return api.post(`/chat/conversations/${conversationId}/messages`, payload);
  },
  sendConversationE2EEMessage: (conversationId, payload) =>
    api.post(`/chat/conversations/${conversationId}/messages`, payload),
  publishConversationKeyPackages: (conversationId, packages) =>
    api.post(`/chat/conversations/${conversationId}/keys/packages`, { packages }),
  syncConversationKeyPackages: (conversationId, deviceId, since, limit = 100) => {
    const params = new URLSearchParams({
      deviceId,
      limit: String(limit)
    });
    if (since) {
      params.append('since', since);
    }
    return api.get(`/chat/conversations/${conversationId}/keys/packages/sync?${params.toString()}`);
  },
  startDM: (targetUserId) => api.post('/chat/dm/start', { targetUserId }),
  getProfileThread: (userId) => api.get(`/chat/profile/${encodeURIComponent(userId)}/thread`),
  updateProfileThreadSettings: (userId, payload) =>
    api.put(`/chat/profile/${encodeURIComponent(userId)}/thread/settings`, payload),
};

// Location API
export const locationAPI = {
  update: (data) => api.post('/location/update', data),
  getCities: (latitude, longitude, radius = 50) =>
    api.get(`/location/cities?latitude=${latitude}&longitude=${longitude}&radius=${radius}`),
  validateAddress: (address) => api.get(`/location/validate?address=${encodeURIComponent(address)}`),
  getMyLocation: () => api.get('/location/me'),
  calculateDistance: (lat1, lon1, lat2, lon2) =>
    api.post('/location/distance', { lat1, lon1, lat2, lon2 }),
  // Zip-based location
  getZipLocation: (zipCode) => api.get(`/location/zip/${zipCode}`),
  searchCities: (query, limit = 20) => api.get(`/location/search?q=${encodeURIComponent(query)}&limit=${limit}`),
};

// Market API
const withMultipartHeaders = (data) => (
  data instanceof FormData
    ? { headers: { 'Content-Type': 'multipart/form-data' } }
    : undefined
);

export const marketAPI = {
  getCategories: () => api.get('/market/categories'),
  getListings: (filters = {}, page = 1, limit = 20) => {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    if (filters.category) params.append('category', filters.category);
    if (filters.minPrice) params.append('minPrice', filters.minPrice);
    if (filters.maxPrice) params.append('maxPrice', filters.maxPrice);
    if (filters.latitude) params.append('latitude', filters.latitude);
    if (filters.longitude) params.append('longitude', filters.longitude);
    if (filters.maxDistance) params.append('maxDistance', filters.maxDistance);
    if (filters.q) params.append('q', filters.q);
    return api.get(`/market/listings?${params}`);
  },
  getListing: (listingId) => api.get(`/market/listings/${listingId}`),
  createListing: (data) => api.post('/market/listings', data, withMultipartHeaders(data)),
  updateListing: (listingId, data) => api.put(`/market/listings/${listingId}`, data, withMultipartHeaders(data)),
  deleteListing: (listingId) => api.delete(`/market/listings/${listingId}`),
  incrementViews: (listingId) => api.post(`/market/listings/${listingId}/view`),
  markAsSold: (listingId) => api.post(`/market/listings/${listingId}/sold`),
  reactivateListing: (listingId) => api.post(`/market/listings/${listingId}/reactivate`),
  getUserListings: (page = 1, limit = 20, status) => {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    if (status) params.append('status', status);
    return api.get(`/market/user/listings?${params}`);
  },
  // Transaction management
  initiateSale: (listingId, data) => api.post(`/market/listings/${listingId}/initiate-sale`, data),
  respondToTransaction: (transactionId, response) =>
    api.post(`/market/transactions/${transactionId}/respond`, { response }),
  getTransactions: (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.role) queryParams.append('role', params.role);
    if (params.status) queryParams.append('status', params.status);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    return api.get(`/market/transactions?${queryParams}`);
  },
  // Public trade history
  getTradeHistory: (page = 1, limit = 20) =>
    api.get(`/market/trade-history?page=${page}&limit=${limit}`),
  // User search for buyer selection
  searchUsers: (q) => api.get(`/market/users/search?q=${encodeURIComponent(q)}`),
};

// Universal Account / Referral API
export const universalAPI = {
  search: ({ email, phone }) => {
    const params = new URLSearchParams();
    if (email) params.append('email', email);
    if (phone) params.append('phone', phone);
    return api.get(`/universal/search?${params.toString()}`);
  },
  invite: (data) => api.post('/universal/invite', data),
  invitations: (page = 1, limit = 20, status = null) => {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    if (status) params.append('status', status);
    return api.get(`/universal/invitations?${params.toString()}`);
  },
  // Get referral statistics
  getReferralStats: () => api.get('/universal/referral-stats'),
  // Resend invitation
  resendInvitation: (id) => api.post(`/universal/invitations/${id}/resend`),
  // Revoke invitation
  revokeInvitation: (id, reason = '') => api.post(`/universal/invitations/${id}/revoke`, { reason }),
  // Qualify and reward invitation
  qualifyInvitation: (id) => api.post(`/universal/invitations/${id}/qualify`),
  // Register by referral code
  registerByCode: (data) => api.post('/universal/register-by-code', data),
};

// Friends API
export const friendsAPI = {
  // Get all friends
  getFriends: () => api.get('/friends'),
  // Get friend count
  getFriendCount: () => api.get('/friends/count'),
  // Get incoming friend requests
  getIncomingRequests: () => api.get('/friends/requests/incoming'),
  // Get outgoing friend requests
  getOutgoingRequests: () => api.get('/friends/requests/outgoing'),
  // Send friend request
  sendRequest: (userId, message = null) => api.post('/friends/request', { userId, message }),
  // Accept friend request
  acceptRequest: (friendshipId) => api.post(`/friends/${friendshipId}/accept`),
  // Decline friend request
  declineRequest: (friendshipId) => api.post(`/friends/${friendshipId}/decline`),
  // Remove/unfriend
  removeFriend: (friendshipId) => api.delete(`/friends/${friendshipId}`),
  // Block user
  blockUser: (friendshipId, reason = null) => api.post(`/friends/${friendshipId}/block`, { reason }),
  // Update friend category
  updateFriendCategory: (friendshipId, category) => api.put(`/friends/${friendshipId}/category`, { category }),
  // Update partner/spouse listing request flow
  updatePartnerStatus: (friendshipId, action) => api.patch(`/friends/${friendshipId}/partner`, { action }),
  // Get top friends
  getTopFriends: (userIdOrUsername) => api.get(`/friends/top/${userIdOrUsername}`),
  // Update top friends order
  updateTopFriends: (friendIds) => api.put('/friends/top', { friendIds }),
  // Get privacy settings
  getPrivacySettings: () => api.get('/friends/privacy'),
  // Update privacy settings
  updatePrivacySettings: (data) => api.put('/friends/privacy', data),
  // Get relationship status
  getRelationship: (userId) => api.get(`/friends/relationship/${userId}`),
  getPublicCircles: (userIdOrUsername) => api.get(`/public/users/${encodeURIComponent(userIdOrUsername)}/friends/circles`),
};

export const circlesAPI = {
  getCircles: () => api.get('/circles'),
  createCircle: (data) => api.post('/circles', data),
  updateCircle: (circleName, data) => api.put(`/circles/${encodeURIComponent(circleName)}`, data),
  deleteCircle: (circleName) => api.delete(`/circles/${encodeURIComponent(circleName)}`),
  addMember: (circleName, userId) => api.post(`/circles/${encodeURIComponent(circleName)}/members`, { userId }),
  removeMember: (circleName, userId) => api.delete(`/circles/${encodeURIComponent(circleName)}/members/${encodeURIComponent(userId)}`),
};

export const notificationAPI = {
  getNotifications: (page = 1, limit = 20) => api.get(`/notifications?page=${page}&limit=${limit}`),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.put(`/notifications/${encodeURIComponent(id)}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  deleteNotification: (id) => api.delete(`/notifications/${encodeURIComponent(id)}`),
  getPreferences: () => api.get('/notifications/preferences'),
  updatePreferences: (data) => api.put('/notifications/preferences', data),
};

export const discoveryAPI = {
  getUsers: (q = '', page = 1, limit = 10) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q) params.append('q', q);
    return api.get(`/discovery/users?${params.toString()}`);
  },
  getPosts: (q = '', page = 1, limit = 10, latitude = null, longitude = null) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q) params.append('q', q);
    if (latitude != null && longitude != null) {
      params.append('latitude', String(latitude));
      params.append('longitude', String(longitude));
    }
    return api.get(`/discovery/posts?${params.toString()}`);
  },
  trackEvent: (eventType, metadata = {}) => api.post('/discovery/events', { eventType, metadata }),
  trackUserImpression: (userId) =>
    api.post('/discovery/users/impression', { userId }),
  trackPostImpression: (postId) =>
    api.post('/discovery/posts/impression', { postId }),
};

export const socialPageAPI = {
  getConfigs: () => api.get('/social-page/configs'),
  savePreferences: (preferences, syncActiveConfig = true) =>
    api.put('/social-page/preferences', { preferences, syncActiveConfig }),
  createConfig: (payload) => api.post('/social-page/configs', payload),
  updateConfig: (configId, payload) => api.patch(`/social-page/configs/${encodeURIComponent(configId)}`, payload),
  applyConfig: (configId) => api.post(`/social-page/configs/${encodeURIComponent(configId)}/apply`),
  duplicateConfig: (configId, payload) => api.post(`/social-page/configs/${encodeURIComponent(configId)}/duplicate`, payload),
  deleteConfig: (configId) => api.delete(`/social-page/configs/${encodeURIComponent(configId)}`),
  getSharedByUser: (identifier) => api.get(`/social-page/shared/by-user/${encodeURIComponent(identifier)}`),
  favoriteShared: (configId) => api.post(`/social-page/shared/${encodeURIComponent(configId)}/favorite`),
  unfavoriteShared: (configId) => api.delete(`/social-page/shared/${encodeURIComponent(configId)}/favorite`),
  cloneShared: (configId, payload) => api.post(`/social-page/shared/${encodeURIComponent(configId)}/clone`, payload),
};

export const calendarAPI = {
  getMyCalendar: () => api.get('/calendar/me'),
  updateMyCalendarSettings: (data) => api.patch('/calendar/me/settings', data),
  getMyEvents: (params = {}) => api.get('/calendar/me/events', { params }),
  createEvent: (data) => api.post('/calendar/me/events', data),
  updateEvent: (eventId, data) => api.put(`/calendar/me/events/${encodeURIComponent(eventId)}`, data),
  deleteEvent: (eventId) => api.delete(`/calendar/me/events/${encodeURIComponent(eventId)}`),
  getUserCalendar: (username) => api.get(`/calendar/user/${encodeURIComponent(username)}`),
  getUserCalendarEvents: (username, params = {}) =>
    api.get(`/calendar/user/${encodeURIComponent(username)}/events`, { params }),
};

// News API
export const newsAPI = {
  // Get personalized news feed
  getFeed: (params = {}) => api.get('/news/feed', { params }),
  // Get promoted news ranked by viral potential
  getPromoted: (params = {}) => api.get('/news/promoted', { params }),
  // Get available RSS sources (merged with catalog)
  getSources: () => api.get('/news/sources'),
  // Add new RSS source
  addSource: (data) => api.post('/news/sources', data),
  // Remove RSS source
  removeSource: (sourceId) => api.delete(`/news/sources/${sourceId}`),
  // Refresh source health status
  refreshSourceHealth: () => api.post('/news/sources/health-check'),
  // Get user's news preferences
  getPreferences: () => api.get('/news/preferences'),
  // Update user's news preferences
  updatePreferences: (data) => api.put('/news/preferences', data),
  // Add followed keyword
  addKeyword: (keyword) => api.post('/news/preferences/keywords', { keyword }),
  // Remove followed keyword
  removeKeyword: (keyword) => api.delete(`/news/preferences/keywords/${encodeURIComponent(keyword)}`),
  // Rename/edit a followed keyword
  renameKeyword: (oldKeyword, newKeyword) => api.put(`/news/preferences/keywords/${encodeURIComponent(oldKeyword)}`, { keyword: newKeyword }),
  // Add location preference
  addLocation: (data) => api.post('/news/preferences/locations', data),
  // Remove location preference
  removeLocation: (locationId) => api.delete(`/news/preferences/locations/${locationId}`),
  // Update hidden categories
  updateHiddenCategories: (hiddenCategories) => api.put('/news/preferences/hidden-categories', { hiddenCategories }),
  // Toggle a category for a specific source
  toggleSourceCategory: (sourceId, category) => api.put('/news/preferences/source-categories', { sourceId, category }),
  // Get available topics
  getTopics: () => api.get('/news/topics'),
  // Get canonical location taxonomy for state/city selectors
  getLocationTaxonomy: () => api.get('/news/location-taxonomy'),
  // Get single article
  getArticle: (id) => api.get(`/news/article/${id}`),
  // Trigger manual ingestion (admin)
  triggerIngestion: () => api.post('/news/ingest'),
  // Trigger single-source ingestion (admin)
  triggerSourceIngestion: (sourceKey) => api.post(`/news/ingest/${encodeURIComponent(sourceKey)}`),
  // Get scheduler info (admin)
  getScheduleInfo: () => api.get('/news/schedule-info'),
  // Get ingestion stats (admin)
  getIngestionStats: () => api.get('/news/ingestion-stats'),
  // Weather
  getWeather: () => api.get('/news/weather'),
  addWeatherLocation: (data) => api.post('/news/preferences/weather-locations', data),
  updateWeatherLocations: (locations) => api.put('/news/preferences/weather-locations', { locations }),
  removeWeatherLocation: (locationId) => api.delete(`/news/preferences/weather-locations/${locationId}`),
  setWeatherLocationPrimary: (locationId) => api.put(`/news/preferences/weather-locations/${locationId}/primary`),
};

// Maps API
export const mapsAPI = {
  // Location presence
  updatePresence: (data) => api.post('/maps/presence', data),
  getPresence: () => api.get('/maps/presence'),
  updatePrivacy: (shareWithFriends) => api.put('/maps/presence/privacy', { shareWithFriends }),
  deactivatePresence: () => api.delete('/maps/presence'),
  
  // Friend locations
  getFriendsLocations: () => api.get('/maps/friends'),
  
  // Spotlights
  createSpotlight: (data) => api.post('/maps/spotlight', data),
  reactToSpotlight: (spotlightId, reactionType) => api.post(`/maps/spotlight/${spotlightId}/react`, { reactionType }),
  getNearbySpotlights: (params) => api.get('/maps/spotlight/nearby', { params }),
  getFriendsSpotlights: () => api.get('/maps/spotlight/friends'),
  deleteSpotlight: (spotlightId) => api.delete(`/maps/spotlight/${spotlightId}`),
  
  // Heatmap
  getHeatmap: (params) => api.get('/maps/heatmap', { params }),
  
  // Maps
  getLocalMap: (params) => api.get('/maps/local', { params }),
  getCommunityMap: (params) => api.get('/maps/community', { params }),
};

export const moderationAPI = {
  report: (data) => api.post('/moderation/report', data),
  getMyReports: () => api.get('/moderation/my-reports'),
  getAccountActions: () => api.get('/moderation/account-actions'),
  getBlocks: () => api.get('/moderation/blocks'),
  blockUser: (userId, reason = '') => api.post('/moderation/block', { userId, reason }),
  unblockUser: (userId) => api.delete(`/moderation/block/${encodeURIComponent(userId)}`),
  getMutes: () => api.get('/moderation/mutes'),
  muteUser: (userId) => api.post('/moderation/mute', { userId }),
  unmuteUser: (userId) => api.delete(`/moderation/mute/${encodeURIComponent(userId)}`),
  getReports: (params = {}) => api.get('/moderation/reports', { params }),
  updateReport: (reportId, data) => api.put(`/moderation/reports/${encodeURIComponent(reportId)}`, data),
  applyAction: (data) => api.post('/moderation/actions', data),
  submitAppeal: (data) => api.post('/moderation/appeals', data),
  getAppeals: () => api.get('/moderation/appeals'),
  processAppeal: (reportId, data) => api.put(`/moderation/appeals/${encodeURIComponent(reportId)}`, data),
  getControlPanelOverview: () => api.get('/moderation/control-panel/overview'),
  getControlPanelDetails: (params = {}) => api.get('/moderation/control-panel/details', { params }),
  getNewsIngestionRecords: (params = {}) => api.get('/moderation/control-panel/news-ingestion', { params }),
  getNewsIngestionRecord: (recordId) => api.get(`/moderation/control-panel/news-ingestion/${encodeURIComponent(recordId)}`),
  getNewsIngestionTimeline: (recordId) => api.get(`/moderation/control-panel/news-ingestion/${encodeURIComponent(recordId)}/timeline`),
  getNewsIngestionLogs: (recordId, params = {}) => api.get(`/moderation/control-panel/news-ingestion/${encodeURIComponent(recordId)}/logs`, { params }),
  resetUserPassword: (userId) => api.post(`/moderation/control-panel/users/${encodeURIComponent(userId)}/reset-password`),
  muteUserByAdmin: (userId, data) => api.post(`/moderation/control-panel/users/${encodeURIComponent(userId)}/mute`, data),
  unmuteUserByAdmin: (userId) => api.delete(`/moderation/control-panel/users/${encodeURIComponent(userId)}/mute`),
  addInfraction: (userId, data) => api.post(`/moderation/control-panel/users/${encodeURIComponent(userId)}/infractions`, data),
  removeInfraction: (userId, infractionIndex) => api.delete(`/moderation/control-panel/users/${encodeURIComponent(userId)}/infractions/${encodeURIComponent(infractionIndex)}`),
  deletePostByAdmin: (postId) => api.delete(`/moderation/control-panel/posts/${encodeURIComponent(postId)}`),
  deleteMessageByAdmin: (messageId, type = 'room') => api.delete(`/moderation/control-panel/messages/${encodeURIComponent(messageId)}?type=${encodeURIComponent(type)}`),
  deleteUserByAdmin: (userId) => api.delete(`/moderation/control-panel/users/${encodeURIComponent(userId)}`)
};

export default api;
