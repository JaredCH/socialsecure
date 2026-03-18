import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { notificationAPI } from '../utils/api';
import NotificationItem from '../components/NotificationItem';

const PAGE_SIZE = 20;

const NotificationsHistory = () => {
  const [notifications, setNotifications] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async (nextPage = 1, replace = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await notificationAPI.getHistory(nextPage, PAGE_SIZE);
      const incoming = Array.isArray(response.data?.notifications)
        ? response.data.notifications
        : [];

      setNotifications((prev) => (replace || nextPage === 1) ? incoming : [...prev, ...incoming]);
      setPage(nextPage);
      setHasMore(Boolean(response.data?.pagination?.hasMore));
    } catch {
      setError('Failed to load notification history.');
      if (replace) setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory(1, true);
  }, [loadHistory]);

  const loadMore = () => {
    if (hasMore && !loading) {
      loadHistory(page + 1);
    }
  };

  const noop = () => {};

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white shadow rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Notification History</h1>
        <Link to="/notification-settings" className="text-sm text-blue-600 hover:text-blue-700">
          Settings
        </Link>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        Acknowledged and dismissed notifications appear here.
      </p>

      {error ? (
        <div className="mb-4 p-3 rounded bg-red-50 text-red-700 border border-red-200">{error}</div>
      ) : null}

      {notifications.length === 0 && !loading ? (
        <div className="p-4 text-sm text-gray-500">No notification history yet.</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {notifications.map((notification) => (
            <NotificationItem
              key={String(notification._id)}
              notification={notification}
              isHistory
              onOpen={noop}
              onMarkRead={noop}
              onDelete={noop}
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

export default NotificationsHistory;
