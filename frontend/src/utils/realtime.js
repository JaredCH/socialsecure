import { io } from 'socket.io-client';

let socket = null;

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || window.location.origin;

export const initRealtime = ({ token, userId, lastEventTimestamp } = {}) => {
  if (!token || !userId) return null;
  if (socket?.connected && socket.auth?.userId === String(userId)) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
  }

  socket = io(SOCKET_URL, {
    auth: {
      token,
      userId: String(userId),
      lastEventTimestamp: Number(lastEventTimestamp || 0)
    },
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  return socket;
};

export const getRealtimeSocket = () => socket;

export const disconnectRealtime = () => {
  if (!socket) return;
  socket.disconnect();
  socket = null;
};

export const subscribeFeed = (userIds = []) => {
  if (!socket || !Array.isArray(userIds)) return;
  socket.emit('subscribe_feed', userIds);
};

export const subscribePost = (postId) => {
  if (!socket || !postId) return;
  socket.emit('subscribe_post', postId);
};

export const joinChatRoom = (roomId) => {
  if (!socket || !roomId) return;
  socket.emit('join-room', roomId);
};

export const emitTypingStart = ({ roomId, postId, type }) => {
  if (!socket) return;
  socket.emit('typing_start', { roomId, postId, type });
};

export const emitTypingStop = ({ roomId, postId, type }) => {
  if (!socket) return;
  socket.emit('typing_stop', { roomId, postId, type });
};

export const onRealtimeEvent = (eventName, callback) => {
  if (!socket || !eventName || typeof callback !== 'function') {
    return () => {};
  }
  socket.on(eventName, callback);
  return () => socket?.off(eventName, callback);
};
