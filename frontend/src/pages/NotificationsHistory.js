import React from 'react';
import { Link } from 'react-router-dom';
import useInfiniteNotifications from '../hooks/useInfiniteNotifications';
import NotificationItem from '../components/NotificationItem';
import { ErrorBanner, EmptyState, LoadMoreButton, Spinner } from '../components/ui';

const NotificationsHistory = () => {
  const {
    notifications,
    loading,
    error,
    hasMore,
    loadMore,
  } = useInfiniteNotifications({ history: true });

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

      <ErrorBanner message={error} />

      {notifications.length === 0 && !loading ? (
        <EmptyState title="No notification history yet." className="py-4 text-sm" />
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

      {loading ? <Spinner size="h-6 w-6" label="Loading..." className="py-4" /> : null}

      <LoadMoreButton onClick={loadMore} loading={loading} hasMore={hasMore} />
    </div>
  );
};

export default NotificationsHistory;
