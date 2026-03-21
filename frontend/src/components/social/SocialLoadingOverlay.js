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
const SocialLoadingOverlay = ({ children }) => {
  const location = useLocation();
  const [showOverlay, setShowOverlay] = useState(true);
  const [overlayFading, setOverlayFading] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const overlayRef = useRef(null);
  const fadeTimerRef = useRef(null);
  const removeTimerRef = useRef(null);
  const prevPathRef = useRef(location.pathname + location.search);

  // Derive username from ?user= query param (if present)
  const username = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('user') || '';
  }, [location.search]);

  // Re-trigger overlay on location change (pathname or search)
  useEffect(() => {
    const current = location.pathname + location.search;
    if (current !== prevPathRef.current) {
      prevPathRef.current = current;
      setShowOverlay(true);
      setOverlayFading(false);
      setShowSkeleton(true);
    }
  }, [location.pathname, location.search]);

  // Overlay animation lifecycle
  useEffect(() => {
    if (!showOverlay) return;

    // At t=800ms begin the opacity fade-out
    fadeTimerRef.current = setTimeout(() => {
      setOverlayFading(true);
    }, 800);

    // At t=1100ms remove overlay from DOM
    removeTimerRef.current = setTimeout(() => {
      setShowOverlay(false);
      setOverlayFading(false);
    }, 1100);

    return () => {
      clearTimeout(fadeTimerRef.current);
      clearTimeout(removeTimerRef.current);
    };
  }, [showOverlay]);

  // Hide skeleton after a generous timeout (the real content will be
  // rendered beneath by then).  This acts as a fallback — the Social
  // component loads its data asynchronously and the skeleton will be
  // visually hidden behind the real content once React renders it.
  useEffect(() => {
    if (!showSkeleton) return;
    const t = setTimeout(() => setShowSkeleton(false), 2000);
    return () => clearTimeout(t);
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
          className={overlayFading ? 'fade-out' : ''}
          data-testid="loading-overlay"
        >
          <div className="rp-left animate-reveal" />
          <div className="rp-right animate-reveal" />
          {username && (
            <span className="overlay-username" data-testid="overlay-username">
              {username}
            </span>
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
            <div
              className="skeleton-base"
              style={{ width: '100%', height: 280, borderRadius: 0 }}
            />

            {/* Body layout */}
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
                {/* Avatar + name block */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <div className="skeleton-base skeleton-avatar" />
                  <div className="skeleton-base skeleton-line" style={{ width: '60%' }} />
                  <div className="skeleton-base skeleton-line" style={{ width: '45%' }} />
                </div>

                {/* About card */}
                <div className="skeleton-base skeleton-card" />

                {/* Details card */}
                <div className="skeleton-base skeleton-card" />

                {/* Top friends card */}
                <div className="skeleton-base skeleton-card" style={{ height: 100 }} />
              </aside>

              {/* Center content */}
              <main style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Stats row */}
                <div className="skeleton-stat-row">
                  <div className="skeleton-base skeleton-square" />
                  <div className="skeleton-base skeleton-square" />
                  <div className="skeleton-base skeleton-square" />
                </div>

                {/* Bio lines */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="skeleton-base skeleton-line" style={{ width: '80%' }} />
                  <div className="skeleton-base skeleton-line" style={{ width: '60%' }} />
                </div>

                {/* Feed cards */}
                <div className="skeleton-base skeleton-card" />
                <div className="skeleton-base skeleton-card" />
                <div className="skeleton-base skeleton-card" />
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
