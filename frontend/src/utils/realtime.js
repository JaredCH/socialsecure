import { io } from 'socket.io-client';

const LAST_EVENT_ID_STORAGE_KEY = 'socialsecure:lastRealtimeEventId';

let socket = null;
let activeAuthKey = null;

const getSocketOrigin = () => process.env.REACT_APP_SOCKET_URL || window.location.origin;

const getLastEventId = () => {
  try {
    return localStorage.getItem(LAST_EVENT_ID_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

const setLastEventId = (eventId) => {
  if (!eventId) return;
  try {
    localStorage.setItem(LAST_EVENT_ID_STORAGE_KEY, eventId);
  } catch {
    // best effort only
  }
};

const trackEventMeta = (payload) => {
  const eventId = payload?._meta?.eventId;
  if (eventId) {
    setLastEventId(eventId);
  }
};

export const getRealtimeSocket = ({ token, userId }) => {
  const authKey = `${String(userId || '')}:${String(token || '')}`;
  if (socket && activeAuthKey === authKey) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
    activeAuthKey = null;
  }

  socket = io(getSocketOrigin(), {
    auth: {
      token,
      userId: String(userId || ''),
      lastEventId: getLastEventId()
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  activeAuthKey = authKey;

  socket.on('connect', () => {
    if (userId) {
      socket.emit('join-user', String(userId));
    }

    const lastEventId = getLastEventId();
    if (lastEventId) {
      socket.emit('replay-missed-events', { lastEventId });
    }
  });

  return socket;
};

export const initRealtime = ({ token, userId }) => getRealtimeSocket({ token, userId });

const bindListener = (eventName, callback) => {
  if (!socket || typeof callback !== 'function') {
    return () => {};
  }

  const handler = (payload) => {
    trackEventMeta(payload);
    callback(payload);
  };

  socket.on(eventName, handler);
  return () => {
    socket?.off(eventName, handler);
  };
};

export const subscribeToPost = (postId) => {
  if (!socket || !postId) return;
  socket.emit('subscribe-post', String(postId));
};

export const unsubscribeFromPost = (postId) => {
  if (!socket || !postId) return;
  socket.emit('unsubscribe-post', String(postId));
};

export const joinRealtimeRoom = (roomId) => {
  if (!socket || !roomId) return;
  socket.emit('join-room', String(roomId));
};

export const leaveRealtimeRoom = (roomId) => {
  if (!socket || !roomId) return;
  socket.emit('leave-room', String(roomId));
};

export const emitTypingStart = ({ scope, targetId }) => {
  if (!socket || !scope || !targetId) return;
  socket.emit('typing_start', { scope, targetId: String(targetId) });
};

export const emitTypingStop = ({ scope, targetId }) => {
  if (!socket || !scope || !targetId) return;
  socket.emit('typing_stop', { scope, targetId: String(targetId) });
};

export const onFeedPost = (callback) => bindListener('feed:new-post', callback);
export const onFeedPostRemoved = (callback) => bindListener('feed:post-removed', callback);
export const onFeedInteraction = (callback) => bindListener('feed:interaction', callback);
export const onChatMessage = (callback) => bindListener('chat:message', callback);
export const onTyping = (callback) => bindListener('typing', callback);
export const onFriendPresence = (callback) => bindListener('friend:presence', callback);
export const onPresenceUpdate = (callback) => bindListener('presence:update', callback);
export const onRoomViewerJoin = (callback) => bindListener('room:viewer-join', callback);
export const onRoomViewerLeave = (callback) => bindListener('room:viewer-leave', callback);

export const disconnectRealtime = () => {
  if (!socket) return;
  socket.disconnect();
  socket = null;
  activeAuthKey = null;
};
