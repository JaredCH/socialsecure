import React, { useCallback, useEffect, useRef, useState } from 'react';
import { notificationAPI } from '../../utils/api';

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const ANIMATION_DURATION_MS = 350;
const TOP_GAP_PX = 0;

/**
 * MobileDotNavNotification – notification panel for the mobile DotNav overlay.
 *
 * When the DotNav is open, renders a fixed-position notification panel at the
 * top of the screen with a "Notifications" header bar and red "Logout" button.
 * Below the header, displays grouped active notifications as slim pills, or
 * "No new notifications" if empty.  Notifications never overlap DotNav buttons;
 * the list height is restricted via max-height derived from dotnavHeight.
 *
 * Props:
 *   isOpen        – whether the DotNav overlay is open
 *   dotnavHeight  – pixel height of the dotnav anchor region (for max-height calc)
 *   onLogout      – () => void
 *   onNavigate    – (path) => void
 *   onAcknowledge – (notification) => void
 *   onDismiss     – (notification) => void
 */

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

/** Group notifications by type+title, keeping newest first. */
const groupNotifications = (list) => {
  const map = new Map();
  for (const n of list) {
    const key = `${n.type || ''}::${n.title || ''}`;
    if (!map.has(key)) {
      map.set(key, { ...n, _ids: [n._id], count: 1 });
    } else {
      const group = map.get(key);
      group._ids.push(n._id);
      group.count += 1;
      // keep newest createdAt
      if (n.createdAt > group.createdAt) {
        group.createdAt = n.createdAt;
        group.body = n.body;
      }
    }
  }
  return Array.from(map.values());
};

const MobileDotNavNotification = ({
  isOpen = false,
  dotnavHeight = 72,
  onLogout,
  onNavigate,
  onAcknowledge,
  onDismiss,
}) => {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const animTimerRef = useRef(null);

  // Fetch active notifications when panel opens
  useEffect(() => {
    if (!isOpen) {
      // animate out
      setVisible(false);
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      animTimerRef.current = setTimeout(() => {
        setMounted(false);
        setNotifications([]);
      }, ANIMATION_DURATION_MS);
      return;
    }
    setMounted(true);
    let cancelled = false;
    setLoading(true);
    notificationAPI.getNotifications(1, 50)
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data?.notifications) ? res.data.notifications : [];
        setNotifications(list);
      })
      .catch(() => {
        if (!cancelled) setNotifications([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Trigger enter animation on next frame
    requestAnimationFrame(() => { if (!cancelled) setVisible(true); });
    return () => { cancelled = true; };
  }, [isOpen]);

  const handleMarkRead = useCallback((e, notification) => {
    e.stopPropagation();
    if (onAcknowledge) onAcknowledge(notification);
    setNotifications((prev) => prev.filter((n) => n._id !== notification._id && !(notification._ids || []).includes(n._id)));
  }, [onAcknowledge]);

  const handleDismiss = useCallback((e, notification) => {
    e.stopPropagation();
    if (onDismiss) onDismiss(notification);
    setNotifications((prev) => prev.filter((n) => n._id !== notification._id && !(notification._ids || []).includes(n._id)));
  }, [onDismiss]);

  const handleView = useCallback((e, notification) => {
    e.stopPropagation();
    if (onNavigate) {
      const target = notification?.type === 'message' ? '/chat?tab=dm' : '/notifications';
      onNavigate(target);
    }
  }, [onNavigate]);

  const handleLogout = useCallback(() => {
    if (onLogout) onLogout();
  }, [onLogout]);

  if (!isOpen && !mounted) return null;

  const grouped = groupNotifications(notifications);

  // max list height: viewport height minus top bar (48px) minus dotnav (dotnavHeight) minus gaps
  const maxListHeight = `calc(100vh - ${dotnavHeight + TOP_GAP_PX + 48 + 32}px)`;

  return (
    <div
      className={`dotnav-mobile-notif-panel${visible ? ' dotnav-mobile-notif-panel-visible' : ''}`}
      role="region"
      aria-label="Notifications panel"
      data-testid="mobile-dotnav-notification"
    >
      {/* Header bar */}
      <div className="dotnav-mobile-notif-header" data-testid="mobile-dotnav-notification-header">
        <span className="dotnav-mobile-notif-header-title">Notifications</span>
        <button
          type="button"
          className="dotnav-mobile-notif-logout"
          onClick={handleLogout}
          aria-label="Logout"
          data-testid="mobile-dotnav-notification-logout"
        >
          Logout
        </button>
      </div>

      {/* Notification list */}
      <div
        className="dotnav-mobile-notif-list"
        style={{ maxHeight: maxListHeight }}
        data-testid="mobile-dotnav-notification-list"
      >
        {loading && notifications.length === 0 && (
          <p className="dotnav-mobile-notif-empty">Loading…</p>
        )}
        {!loading && grouped.length === 0 && (
          <p className="dotnav-mobile-notif-empty" data-testid="mobile-dotnav-notification-empty">
            No new notifications
          </p>
        )}
        {grouped.map((n) => (
          <button
            key={n._id}
            type="button"
            className="dotnav-mobile-notif-pill"
            onClick={(e) => handleView(e, n)}
            data-testid="mobile-dotnav-notification-pill"
          >
            <div className="dotnav-mobile-notif-pill-content">
              <div className="dotnav-mobile-notif-pill-row">
                <span className="dotnav-mobile-notif-pill-title" data-testid="mobile-dotnav-notification-title">
                  {n.title || 'Notification'}
                  {n.count > 1 && (
                    <span className="dotnav-mobile-notif-pill-badge">{n.count}</span>
                  )}
                </span>
                <span className="dotnav-mobile-notif-pill-time">{formatRelativeTime(n.createdAt)}</span>
              </div>
              {n.body ? (
                <span className="dotnav-mobile-notif-pill-body" data-testid="mobile-dotnav-notification-body">
                  {n.body}
                </span>
              ) : null}
            </div>
            <div className="dotnav-mobile-notif-pill-actions">
              <span
                role="button"
                tabIndex={0}
                className="dotnav-mobile-notif-action dotnav-mobile-notif-action-markread"
                onClick={(e) => handleMarkRead(e, n)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleMarkRead(e, n); }}
                aria-label="Mark Read"
                data-testid="mobile-dotnav-notification-markread"
              >
                Mark Read
              </span>
              <span
                role="button"
                tabIndex={0}
                className="dotnav-mobile-notif-action dotnav-mobile-notif-action-dismiss"
                onClick={(e) => handleDismiss(e, n)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleDismiss(e, n); }}
                aria-label="Dismiss"
                data-testid="mobile-dotnav-notification-dismiss"
              >
                Dismiss
              </span>
              <span
                role="button"
                tabIndex={0}
                className="dotnav-mobile-notif-action dotnav-mobile-notif-action-view"
                onClick={(e) => handleView(e, n)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleView(e, n); }}
                aria-label="View"
                data-testid="mobile-dotnav-notification-view"
              >
                View
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MobileDotNavNotification;
