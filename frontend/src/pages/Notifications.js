import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { notificationAPI } from '../utils/api';
import NotificationItem from '../components/NotificationItem';

const PAGE_SIZE = 20;

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadNotifications = useCallback(async (nextPage = 1, replace = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await notificationAPI.getNotifications(nextPage, PAGE_SIZE);
      const incoming = Array.isArray(response.data?.notifications)
        ? response.data.notifications
        : [];

      setNotifications((prev) => (replace || nextPage === 1) ? incoming : [...prev, ...incoming]);
      setPage(nextPage);
      setHasMore(Boolean(response.data?.pagination?.hasMore));
    } catch {
      setError('Failed to load notifications.');
      if (replace) setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications(1, true);
  }, [loadNotifications]);

  const loadMore = () => {
    if (hasMore && !loading) {
      loadNotifications(page + 1);
    }
  };

  const handleOpen = (notification) => {
    if (notification?.data?.url) {
      window.location.href = notification.data.url;
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await notificationAPI.markAsRead(id);
      setNotifications((prev) => prev.map((n) => String(n._id) === id ? { ...n, isRead: true } : n));
    } catch { /* ignore */ }
  };

  const handleAcknowledge = async (id) => {
    try {
      await notificationAPI.acknowledgeNotification(id);
      setNotifications((prev) => prev.filter((n) => String(n._id) !== id));
    } catch { /* ignore */ }
  };

  const handleDismiss = async (id) => {
    try {
      await notificationAPI.dismissNotification(id);
      setNotifications((prev) => prev.filter((n) => String(n._id) !== id));
    } catch { /* ignore */ }
  };

  const handleDelete = async (id) => {
    try {
      await notificationAPI.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => String(n._id) !== id));
    } catch { /* ignore */ }
  };

  const noop = () => {};

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white shadow rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <div className="flex gap-3">
          <Link to="/notifications/history" className="text-sm text-blue-600 hover:text-blue-700">
            History
          </Link>
          <Link to="/notification-settings" className="text-sm text-blue-600 hover:text-blue-700">
            Settings
          </Link>
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        Active notifications requiring your attention.
      </p>

      {error ? (
        <div className="mb-4 p-3 rounded bg-red-50 text-red-700 border border-red-200">{error}</div>
      ) : null}

      {notifications.length === 0 && !loading ? (
        <div className="p-4 text-sm text-gray-500">No new notifications.</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {notifications.map((notification) => (
            <NotificationItem
              key={String(notification._id)}
              notification={notification}
              onOpen={handleOpen}
              onMarkRead={handleMarkRead}
              onAcknowledge={handleAcknowledge}
              onDismiss={handleDismiss}
              onDelete={handleDelete}
              onFriendRequestAction={noop}
              onFriendCircleChange={noop}
            />
          ))}
        </div>
      )}

      {loading ? (
        <div className="p-4 text-sm text-gray-500">Loading...</div>
      ) : null}

      {hasMore && !loading ? (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={loadMore}
            className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
          >
            Load more
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default Notifications;
