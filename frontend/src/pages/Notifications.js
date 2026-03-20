import React from 'react';
import { Link } from 'react-router-dom';
import useInfiniteNotifications from '../hooks/useInfiniteNotifications';
import NotificationItem from '../components/NotificationItem';
import { ErrorBanner, EmptyState, LoadMoreButton, Spinner } from '../components/ui';

const Notifications = () => {
  const {
    notifications,
    loading,
    error,
    hasMore,
    loadMore,
    markRead,
    acknowledge,
    dismiss,
    remove,
  } = useInfiniteNotifications();

  const handleOpen = (notification) => {
    if (notification?.data?.url) {
      window.location.href = notification.data.url;
    }
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

      <ErrorBanner message={error} />

      {notifications.length === 0 && !loading ? (
        <EmptyState title="No new notifications." className="py-4 text-sm" />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {notifications.map((notification) => (
            <NotificationItem
              key={String(notification._id)}
              notification={notification}
              onOpen={handleOpen}
              onMarkRead={(id) => markRead(id)}
              onAcknowledge={(id) => acknowledge(id)}
              onDismiss={(id) => dismiss(id)}
              onDelete={(id) => remove(id)}
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

export default Notifications;
