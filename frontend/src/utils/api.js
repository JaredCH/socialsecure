import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '/api';

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
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getProfile: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  setupPGP: (publicKey) => api.post('/auth/pgp/setup', { publicKey }),
  getEncryptionPasswordStatus: () => api.get('/auth/encryption-password/status'),
  setEncryptionPassword: (data) => api.post('/auth/encryption-password/set', data),
  changeEncryptionPassword: (data) => api.post('/auth/encryption-password/change', data),
  // 12-hour unlock session
  verifyEncryptionPassword: (password) => api.post('/auth/encryption-password/verify', { encryptionPassword: password }),
  getEncryptionUnlockStatus: () => api.get('/auth/encryption-password/status/unlock'),
  lockEncryption: () => api.post('/auth/encryption-password/lock'),
};

// User API
export const userAPI = {
  search: (query) => api.get(`/users/search?q=${query}`),
  getByUsername: (username) => api.get(`/users/username/${username}`),
  getById: (userId) => api.get(`/users/${userId}`),
};

// Feed API
export const feedAPI = {
  getUserFeed: (userId, page = 1, limit = 20) => 
    api.get(`/feed/${userId}?page=${page}&limit=${limit}`),
  getPublicUserFeed: (userIdOrUsername, page = 1, limit = 20) =>
    api.get(`/public/users/${encodeURIComponent(userIdOrUsername)}/feed?page=${page}&limit=${limit}`),
  createPost: (data) => api.post('/feed/post', data),
  deletePost: (postId) => api.delete(`/feed/post/${postId}`),
  likePost: (postId) => api.post(`/feed/post/${postId}/like`),
  unlikePost: (postId) => api.delete(`/feed/post/${postId}/like`),
  addComment: (postId, content) => api.post(`/feed/post/${postId}/comment`, { content }),
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
  uploadGalleryItem: (ownerIdOrUsername, file, caption = '') => {
    const formData = new FormData();
    formData.append('image', file);
    if (caption) {
      formData.append('caption', caption);
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
  getNearbyRooms: (longitude, latitude, maxDistance = 50) => 
    api.get(`/chat/rooms/nearby?longitude=${longitude}&latitude=${latitude}&maxDistance=${maxDistance}`),
  getRoom: (roomId, page = 1, limit = 500) =>
    api.get(`/chat/rooms/${roomId}?page=${page}&limit=${limit}`),
  sendMessage: (roomId, data) => api.post(`/chat/rooms/${roomId}/messages`, data),
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
  getNearbyRooms: (latitude, longitude, radius = 50) =>
    api.get(`/chat/rooms/nearby?latitude=${latitude}&longitude=${longitude}&radius=${radius}`),
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
export const marketAPI = {
  getListings: (filters = {}, page = 1, limit = 20) => {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    if (filters.category) params.append('category', filters.category);
    if (filters.minPrice) params.append('minPrice', filters.minPrice);
    if (filters.maxPrice) params.append('maxPrice', filters.maxPrice);
    if (filters.latitude) params.append('latitude', filters.latitude);
    if (filters.longitude) params.append('longitude', filters.longitude);
    if (filters.maxDistance) params.append('maxDistance', filters.maxDistance);
    return api.get(`/market/listings?${params}`);
  },
  getListing: (listingId) => api.get(`/market/listings/${listingId}`),
  createListing: (data) => api.post('/market/listings', data),
  updateListing: (listingId, data) => api.put(`/market/listings/${listingId}`, data),
  deleteListing: (listingId) => api.delete(`/market/listings/${listingId}`),
  incrementViews: (listingId) => api.post(`/market/listings/${listingId}/view`),
  markAsSold: (listingId) => api.post(`/market/listings/${listingId}/sold`),
  getUserListings: (page = 1, limit = 20, status) => {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    if (status) params.append('status', status);
    return api.get(`/market/user/listings?${params}`);
  },
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
};

// News API
export const newsAPI = {
  // Get personalized news feed
  getFeed: (params = {}) => api.get('/news/feed', { params }),
  // Get available RSS sources
  getSources: () => api.get('/news/sources'),
  // Add new RSS source
  addSource: (data) => api.post('/news/sources', data),
  // Remove RSS source
  removeSource: (sourceId) => api.delete(`/news/sources/${sourceId}`),
  // Get user's news preferences
  getPreferences: () => api.get('/news/preferences'),
  // Update user's news preferences
  updatePreferences: (data) => api.put('/news/preferences', data),
  // Add followed keyword
  addKeyword: (keyword) => api.post('/news/preferences/keywords', { keyword }),
  // Remove followed keyword
  removeKeyword: (keyword) => api.delete(`/news/preferences/keywords/${encodeURIComponent(keyword)}`),
  // Add location preference
  addLocation: (data) => api.post('/news/preferences/locations', data),
  // Remove location preference
  removeLocation: (locationId) => api.delete(`/news/preferences/locations/${locationId}`),
  // Get available topics
  getTopics: () => api.get('/news/topics'),
  // Get single article
  getArticle: (id) => api.get(`/news/article/${id}`),
  // Trigger manual ingestion (admin)
  triggerIngestion: () => api.post('/news/ingest'),
};

export default api;
