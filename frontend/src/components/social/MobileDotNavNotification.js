import React, { useCallback, useEffect, useRef, useState } from 'react';

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const AUTO_DISMISS_MS = 6000;
const ANIMATION_DURATION_MS = 350;

/**
 * MobileDotNavNotification – overlay notification toast for the mobile DotNav.
 *
 * Renders a fixed-position, animated notification above the DotNav so it never
 * overlaps navigation buttons.  Supports acknowledge (✓) and dismiss (✗)
 * actions, and auto-dismisses after a timeout.
 *
 * Props:
 *   notification  – { _id, title, body, type }  (from realtime push)
 *   dotnavHeight  – pixel height of the dotnav anchor region (for bottom offset)
 *   onAcknowledge – (notification) => void
 *   onDismiss     – (notification) => void
 */
const MobileDotNavNotification = ({ notification, dotnavHeight = 72, onAcknowledge, onDismiss }) => {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(null);
  const timerRef = useRef(null);
  const animTimerRef = useRef(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (animTimerRef.current) { clearTimeout(animTimerRef.current); animTimerRef.current = null; }
  }, []);

  // Animate out then clear
  const animateOut = useCallback(() => {
    setVisible(false);
    animTimerRef.current = setTimeout(() => setCurrent(null), ANIMATION_DURATION_MS);
  }, []);

  // When a new notification arrives, show it
  useEffect(() => {
    if (!notification || !notification._id) return;
    clearTimers();
    setCurrent(notification);
    // Trigger enter animation on next frame
    requestAnimationFrame(() => setVisible(true));
    timerRef.current = setTimeout(animateOut, AUTO_DISMISS_MS);
    return clearTimers;
  }, [notification, clearTimers, animateOut]);

  const handleAcknowledge = useCallback(() => {
    clearTimers();
    if (onAcknowledge && current) onAcknowledge(current);
    animateOut();
  }, [current, onAcknowledge, clearTimers, animateOut]);

  const handleDismiss = useCallback(() => {
    clearTimers();
    if (onDismiss && current) onDismiss(current);
    animateOut();
  }, [current, onDismiss, clearTimers, animateOut]);

  if (!current) return null;

  return (
    <div
      className={`dotnav-mobile-notification${visible ? ' dotnav-mobile-notification-visible' : ''}`}
      style={{ bottom: dotnavHeight + 16 }}
      role="alert"
      aria-live="assertive"
      data-testid="mobile-dotnav-notification"
    >
      <div className="dotnav-mobile-notification-content">
        {current.title && (
          <span className="dotnav-mobile-notification-title" data-testid="mobile-dotnav-notification-title">
            {current.title}
          </span>
        )}
        {current.body && (
          <span className="dotnav-mobile-notification-body" data-testid="mobile-dotnav-notification-body">
            {current.body}
          </span>
        )}
      </div>
      <div className="dotnav-mobile-notification-actions">
        <button
          type="button"
          className="dotnav-mobile-notification-ack"
          onClick={handleAcknowledge}
          aria-label="Acknowledge notification"
          data-testid="mobile-dotnav-notification-ack"
        >
          ✓
        </button>
        <button
          type="button"
          className="dotnav-mobile-notification-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss notification"
          data-testid="mobile-dotnav-notification-dismiss"
        >
          ✗
        </button>
      </div>
    </div>
  );
};

export default MobileDotNavNotification;
