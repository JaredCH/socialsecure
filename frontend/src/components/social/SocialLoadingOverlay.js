import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './SocialLoadingOverlay.css';

/**
 * SocialLoadingOverlay
 *
 * Two-layer loading experience for /social routes:
 *   1. Full-screen Split Reveal overlay (800 ms total, then 300 ms fade-out).
 *   2. Skeleton Shimmer placeholders that mirror the real profile layout
 *      until children signal they are loaded.
 *
 * Usage:  <SocialLoadingOverlay>{children}</SocialLoadingOverlay>
 */
const SocialLoadingOverlay = ({ children, user }) => {
  const location = useLocation();
  const [showOverlay, setShowOverlay] = useState(true);
  const [overlayRevealed, setOverlayRevealed] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayFading, setOverlayFading] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const overlayRef = useRef(null);
  const timersRef = useRef([]);
  const prevPathRef = useRef(location.pathname + location.search);
  // Track whether the current navigation is intra-social (skeleton-only)
  const intraSocialRef = useRef(false);

  // Derive username from ?user= query param (if present)
  const username = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('user') || '';
  }, [location.search]);

  // Determine if viewing own profile
  const isOwnProfile = React.useMemo(() => {
    if (!user?.username) return false;
    if (!username) return true;
    return username.toLowerCase() === user.username.toLowerCase();
  }, [user, username]);

  // Build display info for the overlay
  const overlayInfo = React.useMemo(() => {
    if (isOwnProfile && user) {
      const locationParts = [user.city, user.state, user.country].filter(Boolean);
      return {
        displayName: user.realName || user.username || '',
        atUsername: user.username ? `@${user.username}` : '',
        location: locationParts.join(', ') || user.location || '',
        // Default to 'secure' — matches the platform default posting audience
        status: 'secure',
      };
    }
    if (username) {
      return {
        displayName: '',
        atUsername: `@${username}`,
        location: '',
        // Show 'social' when visiting another user's social page
        status: 'social',
      };
    }
    return null;
  }, [isOwnProfile, user, username]);

  // Re-trigger on location change — show full split reveal only when arriving
  // from a non-/social route; within /social just show the skeleton shimmer.
  useEffect(() => {
    const current = location.pathname + location.search;
    if (current !== prevPathRef.current) {
      const prevWasSocial = prevPathRef.current.startsWith('/social');
      prevPathRef.current = current;

      if (prevWasSocial) {
        // Intra-social navigation: skeleton-only (skip split reveal)
        intraSocialRef.current = true;
        setShowOverlay(false);
        setOverlayRevealed(false);
        setOverlayOpen(false);
        setOverlayFading(false);
        setShowSkeleton(true);
      } else {
        // Arriving from another page: full split reveal + skeleton
        intraSocialRef.current = false;
        setShowOverlay(true);
        setOverlayRevealed(false);
        setOverlayOpen(false);
        setOverlayFading(false);
        setShowSkeleton(true);
      }
    }
  }, [location.pathname, location.search]);

  // Overlay animation lifecycle — follows the prototype timing:
  // t=0:    username label fades in  (.revealed)
  // t=250:  panels split open        (.open), skeleton appears
  // t=800:  overlay begins fade-out  (.fade-out)
  // t=1100: overlay removed from DOM
  useEffect(() => {
    if (!showOverlay) return;

    const timers = [];

    // Show username label after a double-rAF (≈33ms)
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setOverlayRevealed(true);
      });
      timers.push({ type: 'raf', id: raf2 });
    });
    timers.push({ type: 'raf', id: raf1 });

    // At t=250ms split panels open, skeleton fades in underneath
    timers.push({ type: 'timeout', id: setTimeout(() => {
      setOverlayOpen(true);
    }, 250) });

    // At t=800ms begin the opacity fade-out
    timers.push({ type: 'timeout', id: setTimeout(() => {
      setOverlayFading(true);
    }, 800) });

    // At t=1100ms remove overlay from DOM
    timers.push({ type: 'timeout', id: setTimeout(() => {
      setShowOverlay(false);
      setOverlayRevealed(false);
      setOverlayOpen(false);
      setOverlayFading(false);
    }, 1100) });

    timersRef.current = timers;

    return () => {
      timers.forEach(t => {
        if (t.type === 'timeout') clearTimeout(t.id);
        else cancelAnimationFrame(t.id);
      });
    };
  }, [showOverlay]);

  // Hide skeleton after a short timeout — acts as a fallback for the real
  // content to render underneath.  Use a shorter duration for intra-social
  // navigations (skeleton-only) to avoid slowing the user down.
  useEffect(() => {
    if (!showSkeleton) return;
    const duration = intraSocialRef.current ? 600 : 1400;
    const skeletonTimer = setTimeout(() => setShowSkeleton(false), duration);
    return () => clearTimeout(skeletonTimer);
  }, [showSkeleton]);

  // Detect dark-ish page background to toggle skeleton color scheme.
  // We simply check if --bg-base or the body background is dark.
  const isDark = React.useMemo(() => {
    try {
      const bg =
        getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim() ||
        getComputedStyle(document.body).backgroundColor;
      if (!bg) return false;
      // quick luminance check for hex or rgb
      const m = bg.match(/\d+/g);
      if (m && m.length >= 3) {
        const lum = (+m[0] * 299 + +m[1] * 587 + +m[2] * 114) / 1000;
        return lum < 128;
      }
    } catch { /* ignore */ }
    return false;
  }, [showOverlay]); // re-evaluate each time overlay re-appears

  return (
    <>
      {/* ── Split Reveal Overlay ──────────────────────────── */}
      {showOverlay && (
        <div
          id="loading-overlay"
          ref={overlayRef}
          className={`${overlayRevealed ? 'revealed' : ''} ${overlayOpen ? 'open' : ''} ${overlayFading ? 'fade-out' : ''}`}
          data-testid="loading-overlay"
        >
          <div className="po-panel po-panel-left" />
          <div className="po-panel po-panel-right" />
          {overlayInfo && (
            <div className="overlay-user-info" data-testid="overlay-user-info">
              {overlayInfo.displayName && (
                <span className="overlay-display-name" data-testid="overlay-display-name">
                  {overlayInfo.displayName}
                </span>
              )}
              <span className="overlay-username" data-testid="overlay-username">
                {overlayInfo.atUsername}
              </span>
              {overlayInfo.location && (
                <span className="overlay-location" data-testid="overlay-location">
                  {overlayInfo.location}
                </span>
              )}
              <span
                className={`overlay-status overlay-status--${overlayInfo.status}`}
                data-testid="overlay-status"
              >
                {overlayInfo.status.charAt(0).toUpperCase() + overlayInfo.status.slice(1)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Skeleton Shimmer ──────────────────────────────── */}
      {showSkeleton && (
        <div
          className={`social-skeleton-wrapper ${isDark ? 'skeleton-dark' : ''}`}
          data-testid="social-skeleton"
          aria-hidden="true"
        >
          <div style={{ width: '100%', minHeight: '100vh' }}>
            {/* Hero skeleton */}
            <div style={{ position: 'relative', width: '100%', minHeight: 250 }}>
              <div
                className="skeleton-base"
                style={{ width: '100%', height: 250, borderRadius: 0 }}
              />
              {/* Hero content overlay — avatar + name + location + tabs */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                maxWidth: 1280, margin: '0 auto', padding: '0 24px 24px',
                display: 'flex', alignItems: 'flex-end', gap: 16,
              }}>
                {/* Avatar overlapping hero bottom */}
                <div
                  className="skeleton-base skeleton-hero-avatar"
                  data-testid="skeleton-hero-avatar"
                />
                {/* Name + location block */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 4 }}>
                  {/* First name / last name */}
                  <div className="skeleton-base skeleton-name-line" data-testid="skeleton-name" style={{ width: '40%' }} />
                  {/* City / location */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className="skeleton-base" style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0 }} />
                    <div className="skeleton-base skeleton-line" data-testid="skeleton-city" style={{ width: '25%' }} />
                  </div>
                </div>
                {/* Tab bar */}
                <div className="skeleton-tab-bar" data-testid="skeleton-tabs">
                  <div className="skeleton-base skeleton-tab" />
                  <div className="skeleton-base skeleton-tab" />
                  <div className="skeleton-base skeleton-tab" />
                  <div className="skeleton-base skeleton-tab" />
                </div>
              </div>
            </div>

            {/* Body layout — matches the actual Social page 2-column grid */}
            <div
              className="skeleton-stagger"
              style={{
                maxWidth: 1280,
                margin: '0 auto',
                padding: '24px 16px',
                display: 'grid',
                gridTemplateColumns: '300px minmax(0,1fr)',
                gap: 24,
              }}
            >
              {/* Left sidebar */}
              <aside style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* About panel */}
                <div className="skeleton-panel" data-testid="skeleton-about-panel">
                  <div className="skeleton-panel-accent" />
                  <div style={{ padding: '16px' }}>
                    <div className="skeleton-base skeleton-line" style={{ width: '30%', marginBottom: 12 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div className="skeleton-base skeleton-line" style={{ width: '90%' }} />
                      <div className="skeleton-base skeleton-line" style={{ width: '70%' }} />
                    </div>
                  </div>
                </div>

                {/* Details panel — location, website, pronouns, joined */}
                <div className="skeleton-panel" data-testid="skeleton-details-panel">
                  <div style={{ padding: '16px' }}>
                    <div className="skeleton-base skeleton-line" style={{ width: '30%', marginBottom: 12 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[55, 65, 35, 50].map((w, i) => (
                        <div className="skeleton-detail-row" data-testid="skeleton-detail-row" key={i}>
                          <div className="skeleton-base skeleton-detail-icon" />
                          <div className="skeleton-base skeleton-line" style={{ width: `${w}%` }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Top friends panel */}
                <div className="skeleton-panel" data-testid="skeleton-friends-panel">
                  <div style={{ padding: '16px' }}>
                    <div className="skeleton-base skeleton-line" style={{ width: '40%', marginBottom: 12 }} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div className="skeleton-base skeleton-friend-avatar" />
                          <div className="skeleton-base skeleton-line" style={{ width: '80%', height: 8 }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Partner / Spouse panel */}
                <div className="skeleton-panel" data-testid="skeleton-partner-panel">
                  <div style={{ padding: '16px' }}>
                    <div className="skeleton-base skeleton-line" style={{ width: '50%', marginBottom: 12 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px', borderRadius: 16, background: 'rgba(16,185,129,0.05)' }}>
                      <div className="skeleton-base" style={{ width: 56, height: 56, borderRadius: '50%', flexShrink: 0 }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="skeleton-base skeleton-line" style={{ width: '40%', height: 8 }} />
                        <div className="skeleton-base skeleton-line" style={{ width: '60%' }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Now Playing widget */}
                <div className="skeleton-panel" data-testid="skeleton-now-playing-panel">
                  <div style={{ padding: '16px' }}>
                    <div className="skeleton-base skeleton-line" style={{ width: '40%', marginBottom: 12 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="skeleton-base" style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0 }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="skeleton-base skeleton-line" style={{ width: '60%' }} />
                        <div className="skeleton-base skeleton-line" style={{ width: '35%', height: 8 }} />
                      </div>
                    </div>
                    <div className="skeleton-base" style={{ height: 4, borderRadius: 999, marginTop: 12, width: '100%' }} />
                  </div>
                </div>
              </aside>

              {/* Center content — matches glass-panel Feed + Gallery layout */}
              <main style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Feed glass panel */}
                <div className="skeleton-glass-panel" data-testid="skeleton-feed-panel">
                  <div className="skeleton-glass-panel-header">
                    <div className="skeleton-base skeleton-line" style={{ width: '15%', height: 14 }} />
                  </div>
                  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="skeleton-base skeleton-card" />
                    <div className="skeleton-base skeleton-card" />
                  </div>
                </div>

                {/* Gallery glass panel */}
                <div className="skeleton-glass-panel" data-testid="skeleton-gallery-panel">
                  <div className="skeleton-glass-panel-header">
                    <div className="skeleton-base skeleton-line" style={{ width: '18%', height: 14 }} />
                  </div>
                  <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className="skeleton-base" style={{ width: '100%', paddingBottom: '100%', borderRadius: 8 }} />
                    ))}
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>
      )}

      {/* ── Real Content (always rendered so data-fetching begins immediately) */}
      {children}
    </>
  );
};

export default SocialLoadingOverlay;
