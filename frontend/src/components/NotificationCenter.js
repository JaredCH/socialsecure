import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { friendsAPI, notificationAPI } from '../utils/api';
import NotificationItem from './NotificationItem';

const PAGE_SIZE = 20;
const isResolvedFriendRequestNotification = (notification) => (
  notification?.type === 'follow' && notification?.isRead
);

const NotificationCenter = ({ unreadCount = 0, onUnreadCountChange, incomingNotification, userDisplayName = 'Account', navLinks = [] }) => {
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [friendActionLoadingById, setFriendActionLoadingById] = useState({});
  const [friendCircleById, setFriendCircleById] = useState({});
  const [friendActionMessage, setFriendActionMessage] = useState('');

  const loadNotifications = async (nextPage = 1, replace = false) => {
    setLoading(true);
    try {
      const response = await notificationAPI.getNotifications(nextPage, PAGE_SIZE);
      const incoming = Array.isArray(response.data?.notifications)
        ? response.data.notifications
        : [];

      setNotifications((prev) => {
        if (replace || nextPage === 1) return incoming;
        const map = new Map(prev.map((item) => [String(item._id), item]));
        for (const item of incoming) {
          map.set(String(item._id), item);
        }
        return [...map.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      });

      setPage(nextPage);
      setHasMore(Boolean(response.data?.pagination?.hasMore));
    } catch {
      if (replace) {
        setNotifications([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadNotifications(1, true);
    }
  }, [open]);

  useEffect(() => {
    if (!incomingNotification) return;
    setNotifications((prev) => [incomingNotification, ...prev.filter((item) => String(item._id) !== String(incomingNotification._id))]);
  }, [incomingNotification]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (!open) return;
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markRead = async (id) => {
    try {
      await notificationAPI.markAsRead(id);
      setNotifications((prev) => prev.map((item) => (
        String(item._id) === String(id)
          ? { ...item, isRead: true, readAt: new Date().toISOString() }
          : item
      )));
      onUnreadCountChange((prev) => Math.max(0, prev - 1));
    } catch {
      // no-op
    }
  };

  const deleteNotification = async (id) => {
    const target = notifications.find((item) => String(item._id) === String(id));
    try {
      await notificationAPI.deleteNotification(id);
      setNotifications((prev) => prev.filter((item) => String(item._id) !== String(id)));
      if (target && !target.isRead) {
        onUnreadCountChange((prev) => Math.max(0, prev - 1));
      }
    } catch {
      // no-op
    }
  };

  const setFriendActionLoading = (id, loadingValue) => {
    setFriendActionLoadingById((prev) => ({ ...prev, [String(id)]: loadingValue }));
  };

  const handleFriendCircleChange = (notificationId, value) => {
    setFriendCircleById((prev) => ({ ...prev, [String(notificationId)]: value === 'secure' ? 'secure' : 'social' }));
  };

  const resolveFriendshipForNotification = async (notification) => {
    const directFriendshipId = String(notification?.data?.friendshipId || '').trim();
    if (directFriendshipId) {
      return { friendshipId: directFriendshipId, relationship: 'pending' };
    }
    const senderId = String(notification?.senderId || '').trim();
    if (!senderId) {
      return { friendshipId: null, relationship: null };
    }
    const relationshipResponse = await friendsAPI.getRelationship(senderId);
    return {
      friendshipId: relationshipResponse?.data?.friendshipId ? String(relationshipResponse.data.friendshipId) : null,
      relationship: String(relationshipResponse?.data?.relationship || '')
    };
  };

  const handleFriendRequestAction = async (notification, action) => {
    const notificationId = String(notification?._id || '');
    if (!notificationId) return;
    const confirmLabel = action === 'accept' ? 'accept' : 'decline';
    const isConfirmed = window.confirm(`Are you sure you want to ${confirmLabel} this friend request?`);
    if (!isConfirmed) return;

    setFriendActionMessage('');
    setFriendActionLoading(notificationId, true);
    try {
      const { friendshipId, relationship } = await resolveFriendshipForNotification(notification);
      if (!friendshipId || (relationship && relationship !== 'pending')) {
        setFriendActionMessage('This request is no longer pending.');
        return;
      }

      if (action === 'accept') {
        await friendsAPI.acceptRequest(friendshipId);
        const selectedCircle = friendCircleById[notificationId] === 'secure' ? 'secure' : 'social';
        await friendsAPI.updateFriendCategory(friendshipId, selectedCircle);
      } else {
        await friendsAPI.declineRequest(friendshipId);
      }

      if (!notification?.isRead) {
        await notificationAPI.markAsRead(notificationId);
      }

      setNotifications((prev) => prev.map((item) => (
        String(item._id) === notificationId
          ? { ...item, isRead: true, readAt: item.readAt || new Date().toISOString() }
          : item
      )));
      onUnreadCountChange((prev) => Math.max(0, prev - (notification?.isRead ? 0 : 1)));
      setFriendActionMessage(action === 'accept' ? 'Friend request accepted.' : 'Friend request declined.');
    } catch {
      setFriendActionMessage('Unable to update friend request. Please try again.');
    } finally {
      setFriendActionLoading(notificationId, false);
    }
  };

  const openNotification = async (notification) => {
    if (!notification?.isRead) {
      await markRead(notification._id);
    }

    const targetUrl = String(notification?.data?.url || '').trim();
    if (targetUrl.startsWith('/')) {
      navigate(targetUrl);
      setOpen(false);
      return;
    }

    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      window.location.href = targetUrl;
      return;
    }

    if (notification?.data?.postId) {
      navigate(`/social?post=${encodeURIComponent(String(notification.data.postId))}`);
      setOpen(false);
      return;
    }

    if (notification?.data?.roomId) {
      navigate('/chat');
      setOpen(false);
      return;
    }
  };

  const markAllRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true, readAt: item.readAt || new Date().toISOString() })));
      onUnreadCountChange(0);
    } catch {
      // no-op
    }
  };

  const handleScroll = (event) => {
    const el = event.currentTarget;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (nearBottom && hasMore && !loading) {
      loadNotifications(page + 1);
    }
  };

  const visibleNotifications = notifications.filter((notification) => !isResolvedFriendRequestNotification(notification));

  const openPanel = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpen(true);
  };

  const scheduleClosePanel = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 150);
  };

  return (
    <div
      className="relative"
      ref={panelRef}
      onMouseEnter={openPanel}
      onMouseLeave={scheduleClosePanel}
      onFocus={openPanel}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/80 hover:text-blue-700"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <span className="hidden max-w-24 truncate sm:inline" title={userDisplayName}>{userDisplayName}</span>
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 ? (
          <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] text-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-64 max-w-[92vw] bg-white border rounded-lg shadow-lg z-50">
          {navLinks.length > 0 && (
            <div className="border-b">
              {navLinks.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-600"
                >
                  {label}
                </Link>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <p className="font-semibold text-gray-900">Notifications</p>
            <div className="flex items-center gap-3">
              <button type="button" className="text-xs text-blue-600 hover:text-blue-700" onClick={markAllRead}>Mark all read</button>
              <Link to="/notification-settings" className="text-xs text-gray-600 hover:text-gray-800" onClick={() => setOpen(false)}>Settings</Link>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto" onScroll={handleScroll}>
            {friendActionMessage ? (
              <div className="px-3 pt-2 text-xs text-slate-600">{friendActionMessage}</div>
            ) : null}
            {visibleNotifications.length === 0 && !loading ? (
              <div className="p-4 text-sm text-gray-500">No notifications yet.</div>
            ) : visibleNotifications.map((notification) => (
              <NotificationItem
                key={String(notification._id)}
                notification={notification}
                onOpen={openNotification}
                onMarkRead={markRead}
                onDelete={deleteNotification}
                onFriendRequestAction={handleFriendRequestAction}
                onFriendCircleChange={handleFriendCircleChange}
                friendActionLoading={Boolean(friendActionLoadingById[String(notification._id)])}
                friendCircle={friendCircleById[String(notification._id)] || 'social'}
              />
            ))}
            {loading ? <div className="p-3 text-xs text-gray-500">Loading...</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default NotificationCenter;
