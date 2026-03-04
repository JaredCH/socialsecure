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
  getRoom: (roomId, page = 1, limit = 50) => 
    api.get(`/chat/rooms/${roomId}?page=${page}&limit=${limit}`),
  sendMessage: (roomId, data) => api.post(`/chat/rooms/${roomId}/messages`, data),
  sendE2EEMessage: (roomId, data) => api.post(`/chat/rooms/${roomId}/messages/e2ee`, data),
  getMessages: (roomId, page = 1, limit = 50) => 
    api.get(`/chat/rooms/${roomId}/messages?page=${page}&limit=${limit}`),
  getMessagesByCursor: (roomId, cursor, limit = 50) => {
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
  invitations: (page = 1, limit = 20) => api.get(`/universal/invitations?page=${page}&limit=${limit}`),
};

export default api;
