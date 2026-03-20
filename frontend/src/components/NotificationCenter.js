import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { friendsAPI, notificationAPI } from '../utils/api';
import useInfiniteNotifications from '../hooks/useInfiniteNotifications';
import NotificationItem from './NotificationItem';

const HOVER_CLOSE_DELAY_MS = 150;
const isResolvedFriendRequestNotification = (notification) => (
  notification?.type === 'follow' && notification?.isRead
);

const rollUpNotifications = (notifications) => {
  const grouped = {};
  const order = [];
  notifications.forEach((n) => {
    const key = n.groupKey || `${n.type}:${n.senderId || 'system'}`;
    if (!grouped[key]) {
      grouped[key] = [];
      order.push(key);
    }
    grouped[key].push(n);
  });
  return order.map((key) => {
    const group = grouped[key];
    return {
      ...group[0],
      count: group.length,
      _groupedIds: group.map((item) => String(item._id))
    };
  });
};

const NotificationCenter = ({
  unreadCount = 0,
  onUnreadCountChange,
  incomingNotification,
  userDisplayName = 'Account',
  navLinks = [],
  onLogout = null,
  containerClassName = '',
  buttonClassName = ''
}) => {
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [friendActionLoadingById, setFriendActionLoadingById] = useState({});
  const [friendCircleById, setFriendCircleById] = useState({});
  const [friendActionMessage, setFriendActionMessage] = useState('');

  const {
    notifications,
    loading,
    hasMore,
    loadMore,
    markRead: hookMarkRead,
    markAllRead: hookMarkAllRead,
    acknowledge: hookAcknowledge,
    dismiss: hookDismiss,
    remove: hookRemove,
    refresh,
  } = useInfiniteNotifications({ incomingNotification });

  // Refresh list when panel opens
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

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
    const ok = await hookMarkRead(id);
    if (ok) onUnreadCountChange((prev) => Math.max(0, prev - 1));
  };

  const deleteNotification = async (id) => {
    const target = notifications.find((item) => String(item._id) === String(id));
    const ok = await hookRemove(id);
    if (ok && target && !target.isRead) {
      onUnreadCountChange((prev) => Math.max(0, prev - 1));
    }
  };

  const acknowledgeNotification = async (id) => {
    const target = notifications.find((item) => String(item._id) === String(id));
    const ok = await hookAcknowledge(id);
    if (ok && target && !target.isRead) {
      onUnreadCountChange((prev) => Math.max(0, prev - 1));
    }
  };

  const dismissNotification = async (id) => {
    const target = notifications.find((item) => String(item._id) === String(id));
    const ok = await hookDismiss(id);
    if (ok && target && !target.isRead) {
      onUnreadCountChange((prev) => Math.max(0, prev - 1));
    }
  };

  const viewDirectMessage = (notification) => {
    navigate('/chat?tab=dm');
    setOpen(false);
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

      await hookAcknowledge(notificationId);
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
    const ok = await hookMarkAllRead();
    if (ok) onUnreadCountChange(0);
  };

  const handleScroll = (event) => {
    const el = event.currentTarget;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (nearBottom && hasMore && !loading) {
      loadMore();
    }
  };

  const activeNotifications = notifications.filter((notification) => !isResolvedFriendRequestNotification(notification));
  const rolledUpNotifications = rollUpNotifications(activeNotifications);

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
    }, HOVER_CLOSE_DELAY_MS);
  };

  return (
    <div
      className={`relative ${containerClassName}`.trim()}
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
        className={`relative inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/80 hover:text-blue-700 ${buttonClassName}`.trim()}
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
              <Link to="/notifications/history" className="text-xs text-gray-600 hover:text-gray-800" onClick={() => setOpen(false)}>History</Link>
              <Link to="/notification-settings" className="text-xs text-gray-600 hover:text-gray-800" onClick={() => setOpen(false)}>Settings</Link>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto" onScroll={handleScroll}>
            {friendActionMessage ? (
              <div className="px-3 pt-2 text-xs text-slate-600">{friendActionMessage}</div>
            ) : null}
            {rolledUpNotifications.length === 0 && !loading ? (
              <div className="p-4 text-sm text-gray-500">No notifications yet.</div>
            ) : rolledUpNotifications.map((notification) => (
              <NotificationItem
                key={String(notification._id)}
                notification={notification}
                count={notification.count || 1}
                onOpen={openNotification}
                onMarkRead={markRead}
                onDelete={deleteNotification}
                onAcknowledge={acknowledgeNotification}
                onDismiss={dismissNotification}
                onView={viewDirectMessage}
                onFriendRequestAction={handleFriendRequestAction}
                onFriendCircleChange={handleFriendCircleChange}
                friendActionLoading={Boolean(friendActionLoadingById[String(notification._id)])}
                friendCircle={friendCircleById[String(notification._id)] || 'social'}
              />
            ))}
            {loading ? <div className="p-3 text-xs text-gray-500">Loading...</div> : null}
          </div>
          {typeof onLogout === 'function' ? (
            <div className="border-t p-2">
              <button
                type="button"
                data-testid="notification-dropdown-logout"
                className="w-full rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
              >
                Logout
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default NotificationCenter;
