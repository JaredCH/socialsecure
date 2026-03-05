import React from 'react';

const formatRelativeTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
};

const NotificationItem = ({ notification, onOpen, onMarkRead, onDelete }) => {
  const id = String(notification?._id || '');

  return (
    <div className={`border-b px-3 py-2 ${notification?.isRead ? 'bg-white' : 'bg-blue-50'}`}>
      <button
        type="button"
        onClick={() => onOpen(notification)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm text-gray-900">{notification?.title || 'Notification'}</p>
          <span className="text-xs text-gray-500 whitespace-nowrap">{formatRelativeTime(notification?.createdAt)}</span>
        </div>
        {notification?.body ? (
          <p className="text-sm text-gray-700 mt-1">{notification.body}</p>
        ) : null}
      </button>

      <div className="mt-2 flex gap-2">
        {!notification?.isRead ? (
          <button
            type="button"
            onClick={() => onMarkRead(id)}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            Mark read
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onDelete(id)}
          className="text-xs text-red-600 hover:text-red-700"
        >
          Delete
        </button>
      </div>
    </div>
  );
};

export default NotificationItem;
