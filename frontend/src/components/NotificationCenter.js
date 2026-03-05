import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { notificationAPI } from '../utils/api';
import NotificationItem from './NotificationItem';

const PAGE_SIZE = 20;

const NotificationCenter = ({ unreadCount = 0, onUnreadCountChange, incomingNotification }) => {
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative text-gray-600 hover:text-blue-600"
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 ? (
          <span className="absolute -top-2 -right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] text-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-96 max-w-[92vw] bg-white border rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <p className="font-semibold text-gray-900">Notifications</p>
            <div className="flex items-center gap-3">
              <button type="button" className="text-xs text-blue-600 hover:text-blue-700" onClick={markAllRead}>Mark all read</button>
              <Link to="/notification-settings" className="text-xs text-gray-600 hover:text-gray-800" onClick={() => setOpen(false)}>Settings</Link>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto" onScroll={handleScroll}>
            {notifications.length === 0 && !loading ? (
              <div className="p-4 text-sm text-gray-500">No notifications yet.</div>
            ) : notifications.map((notification) => (
              <NotificationItem
                key={String(notification._id)}
                notification={notification}
                onOpen={openNotification}
                onMarkRead={markRead}
                onDelete={deleteNotification}
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
