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

const REQUEST_TYPES = new Set(['follow', 'partner_request']);

const NotificationItem = ({
  notification,
  onOpen,
  onMarkRead,
  onDelete,
  onAcknowledge,
  onDismiss,
  onFriendRequestAction,
  onFriendCircleChange,
  friendActionLoading = false,
  friendCircle = 'social',
  count = 1,
  isHistory = false
}) => {
  const id = String(notification?._id || '');
  const isFriendRequest = notification?.type === 'follow' && !!notification?.senderId;
  const isRequest = REQUEST_TYPES.has(notification?.type) && !!notification?.senderId;

  return (
    <div className={`border-b px-3 py-2 ${notification?.isRead ? 'bg-white' : 'bg-blue-50'}`}>
      <button
        type="button"
        onClick={() => onOpen(notification)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm text-gray-900">
            {notification?.title || 'Notification'}
            {count > 1 ? (
              <span className="ml-1 inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                {count}
              </span>
            ) : null}
          </p>
          <span className="text-xs text-gray-500 whitespace-nowrap">{formatRelativeTime(notification?.createdAt)}</span>
        </div>
        {notification?.body ? (
          <p className="text-sm text-gray-700 mt-1">{notification.body}</p>
        ) : null}
      </button>

      <div className="mt-2 flex gap-2 flex-wrap">
        {isFriendRequest && !isHistory ? (
          <div className="flex w-full items-center gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-2 py-1.5">
            <label htmlFor={`friend-circle-${id}`} className="text-xs font-medium text-slate-700">
              Circle
            </label>
            <select
              id={`friend-circle-${id}`}
              value={friendCircle}
              disabled={friendActionLoading}
              onChange={(event) => onFriendCircleChange(id, event.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
            >
              <option value="social">Social</option>
              <option value="secure">Secure</option>
            </select>
            <button
              type="button"
              disabled={friendActionLoading}
              onClick={() => onFriendRequestAction(notification, 'accept')}
              className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Accept"
            >
              ✓ Accept
            </button>
            <button
              type="button"
              disabled={friendActionLoading}
              onClick={() => onFriendRequestAction(notification, 'decline')}
              className="rounded bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Decline"
            >
              ✗ Decline
            </button>
          </div>
        ) : null}
        {isRequest && !isFriendRequest && !isHistory ? (
          <div className="flex w-full items-center gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-2 py-1.5">
            <button
              type="button"
              disabled={friendActionLoading}
              onClick={() => onFriendRequestAction(notification, 'accept')}
              className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Accept"
            >
              ✓ Accept
            </button>
            <button
              type="button"
              disabled={friendActionLoading}
              onClick={() => onFriendRequestAction(notification, 'decline')}
              className="rounded bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Decline"
            >
              ✗ Decline
            </button>
          </div>
        ) : null}
        {!isHistory ? (
          <>
            {typeof onAcknowledge === 'function' ? (
              <button
                type="button"
                onClick={() => onAcknowledge(id)}
                className="text-xs text-gray-500 hover:text-gray-700"
                aria-label="Acknowledge"
                title="Acknowledge"
              >
                ✓
              </button>
            ) : null}
            {typeof onDismiss === 'function' ? (
              <button
                type="button"
                onClick={() => onDismiss(id)}
                className="text-xs text-gray-500 hover:text-gray-700"
                aria-label="Dismiss"
                title="Dismiss"
              >
                ✗
              </button>
            ) : null}
            {!notification?.isRead && typeof onMarkRead === 'function' ? (
              <button
                type="button"
                onClick={() => onMarkRead(id)}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Mark read
              </button>
            ) : null}
            {typeof onDelete === 'function' ? (
              <button
                type="button"
                onClick={() => onDelete(id)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Delete
              </button>
            ) : null}
          </>
        ) : (
          <span className="text-xs text-gray-400">
            {notification?.status === 'acknowledged' ? 'Acknowledged' : 'Dismissed'}
            {notification?.acknowledgedAt || notification?.dismissedAt
              ? ` · ${formatRelativeTime(notification.acknowledgedAt || notification.dismissedAt)}`
              : ''}
          </span>
        )}
      </div>
    </div>
  );
};

export default NotificationItem;
