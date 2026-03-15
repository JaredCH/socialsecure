import React, { useEffect, useMemo, useState } from 'react';
import { SOCIAL_HERO_TABS, SOCIAL_HERO_TAB_LABELS } from '../../utils/socialPagePreferences';

const MOBILE_MENU_LAYOUT_BY_TAB = {
  main: { x: -38, y: -8 },
  friends: { x: -48, y: -36 },
  gallery: { x: -52, y: -64 },
  chat: { x: -48, y: -92 },
  calendar: { x: -40, y: -120 }
};

const buildMobileMenuLayout = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items.map((item, index) => {
    const fallback = {
      x: -96 - (index * 10),
      y: -28 - (index * 36)
    };

    return {
      ...item,
      ...(MOBILE_MENU_LAYOUT_BY_TAB[item.id] || fallback)
    };
  });
};

// Simple icon components for the tabs
const TabIcon = ({ icon, className }) => {
  const icons = {
    home: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    chat: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    calendar: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    users: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-1a4 4 0 00-5.356-3.77M17 20H7m10 0v-1c0-.653-.126-1.278-.356-1.85M7 20H2v-1a4 4 0 015.356-3.77M7 20v-1c0-.653.126-1.278.356-1.85m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    photo: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16l4-4a3 3 0 014.243 0L16 16m-2-2l1-1a3 3 0 014.243 0L21 14m-6-8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    )
  };
  return icons[icon] || null;
};

const SocialHero = ({
  profile = {},
  heroConfig = {},
  activeTab = 'main',
  onTabChange,
  isMobile = false,
  isEditing = false,
  onEditClick
}) => {
  const {
    name = 'User Name',
    location = '',
    avatarUrl = '',
    isOnline = false,
    lastActive = null
  } = profile;

  const {
    backgroundColor = '#1e293b',
    backgroundImage = null,
    nameColor = '#ffffff',
    locationColor = '#94a3b8',
    menuTextColor = '#e2e8f0',
    menuActiveColor = '#3b82f6',
    fontFamily = 'Inter',
    showLocation = true,
    showOnlineStatus = true,
    showNavigation = true
  } = heroConfig;
  const currentAvatarSize = isMobile ? 88 : 128;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const mobileMenuItems = useMemo(() => buildMobileMenuLayout(SOCIAL_HERO_TABS), []);

  useEffect(() => {
    if (!isMobile || !showNavigation) {
      setIsMobileMenuOpen(false);
    }
  }, [isMobile, showNavigation]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  const getNavItemClasses = (tabId) => {
    const isActive = activeTab === tabId;
    return `
      flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200
      ${isActive 
        ? 'bg-white/10 text-white font-medium' 
        : 'text-slate-300 hover:bg-white/5 hover:text-white'
      }
    `;
  };

  const formatLastActive = (lastActiveAt) => {
    if (!lastActiveAt) return 'Offline';
    const now = new Date();
    const last = new Date(lastActiveAt);
    const diffMs = now - last;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Online now';
    if (diffMins < 60) return `Last seen ${diffMins}m ago`;
    if (diffMins < 1440) return `Last seen ${Math.floor(diffMins / 60)}h ago`;
    return 'Offline';
  };

  const containerStyle = {
    backgroundColor,
    fontFamily: `"${fontFamily}", sans-serif`,
    ...(backgroundImage && { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' })
  };

  const nameStyle = { color: nameColor };
  const locationStyle = { color: locationColor };
  const mobileLauncherStyle = {
    boxShadow: isMobileMenuOpen
      ? `0 24px 50px ${backgroundColor}55, 0 0 0 1px ${menuTextColor}1f`
      : `0 18px 36px ${backgroundColor}2f, 0 0 0 1px ${menuTextColor}22`
  };
  const mobileOrbitalGlowStyle = {
    background: `radial-gradient(circle, ${menuActiveColor}2a 0%, ${backgroundColor}00 72%)`
  };

  return (
    <div 
      className="relative w-full overflow-visible"
      style={containerStyle}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/65 to-slate-950/10" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950/90 to-transparent" />

      <div className="relative z-10 mx-auto flex min-h-[15rem] max-w-7xl items-end px-4 pb-6 pt-12 sm:px-6 lg:min-h-[18rem] lg:px-8">
        <div className={`flex w-full ${isMobile ? 'flex-col items-center text-center' : 'items-end justify-between gap-8'}`}>
          <div className={`flex ${isMobile ? 'flex-col items-center' : 'items-end gap-6'}`}>
            <div className="relative flex-shrink-0 translate-y-8 sm:translate-y-10">
          <div 
            className="overflow-hidden rounded-[1.75rem] border-4 border-slate-950/80 bg-slate-800 shadow-[0_30px_60px_rgba(15,23,42,0.45)]"
            style={{ 
              width: currentAvatarSize, 
              height: currentAvatarSize,
              minWidth: currentAvatarSize
            }}
          >
            {avatarUrl ? (
              <img 
                src={avatarUrl} 
                alt={name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div 
                className="w-full h-full flex items-center justify-center bg-slate-600 text-white text-2xl font-semibold"
                style={{ 
                  fontSize: currentAvatarSize * 0.4,
                  fontFamily: `"${fontFamily}", sans-serif`
                }}
              >
                {name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          
          {/* Online Status Indicator */}
          {showOnlineStatus && (
            <div className="absolute bottom-2 right-2">
              <div 
                className={`h-4 w-4 rounded-full border-2 border-white ${
                  isOnline ? 'bg-green-500' : 'bg-slate-400'
                }`}
                title={isOnline ? 'Online' : formatLastActive(lastActive)}
              />
            </div>
          )}
        </div>

        {/* Profile Info Section */}
        <div className={`flex flex-col ${isMobile ? 'mt-16 items-center' : 'pb-2'}`}>
          <h1 
            className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl"
            style={nameStyle}
          >
            {name}
          </h1>
          
          {showLocation && location && (
            <div 
              className="mt-2 flex items-center gap-2 text-sm sm:text-base"
              style={locationStyle}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{location}</span>
            </div>
          )}

          {/* Edit Button (when editing) */}
          {isEditing && onEditClick && (
            <button
              type="button"
              onClick={onEditClick}
              className="mt-4 inline-flex items-center gap-1 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Customize stage
            </button>
          )}
        </div>
          </div>

        {/* Navigation Menu - Desktop */}
        {showNavigation && !isMobile && (
          <nav className="flex items-center gap-2 rounded-2xl border border-white/15 bg-slate-950/35 p-2 backdrop-blur-xl">
            {SOCIAL_HERO_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange?.(tab.id)}
                className={getNavItemClasses(tab.id)}
                style={{ 
                  color: activeTab === tab.id ? menuActiveColor : menuTextColor 
                }}
              >
                <TabIcon icon={tab.icon} className="w-5 h-5" />
                <span className="text-sm">{SOCIAL_HERO_TAB_LABELS[tab.id]}</span>
              </button>
            ))}
          </nav>
        )}
        </div>
      </div>

      {/* Mobile Navigation - Bottom Tabs */}
      {showNavigation && isMobile && (
        <>
          {isMobileMenuOpen && (
            <button
              type="button"
              aria-label="Close social section menu"
              className="fixed inset-0 z-40 border-0 bg-[radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.18),rgba(2,6,23,0.88)_38%,rgba(2,6,23,0.7)_100%)] backdrop-blur-[3px]"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}
          <div
            className="pointer-events-none fixed bottom-0 right-0 z-50 md:hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            data-testid="social-mobile-nav"
          >
            <div className="relative h-72 w-72 overflow-visible">
              <div
                className={`absolute bottom-10 right-10 h-56 w-56 rounded-full transition-all duration-500 ${isMobileMenuOpen ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
                style={mobileOrbitalGlowStyle}
                aria-hidden="true"
              />
              <nav
                id="social-mobile-nav-menu"
                aria-label="Social sections"
                className="absolute inset-0"
              >
                {mobileMenuItems.map((tab, index) => {
                  const isActive = activeTab === tab.id;
                  const transitionDelay = `${index * 22}ms`;
                  const transform = isMobileMenuOpen
                    ? `translate3d(${tab.x}px, ${tab.y}px, 0) scale(1)`
                    : 'translate3d(0, 0, 0) scale(0.7)';

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      aria-label={`Open ${SOCIAL_HERO_TAB_LABELS[tab.id]} section`}
                      onClick={() => {
                        onTabChange?.(tab.id);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`pointer-events-auto absolute bottom-12 right-12 flex w-[3.8rem] origin-bottom-right items-center gap-1 rounded-full border px-2 py-1 text-left shadow-[0_8px_20px_rgba(2,6,23,0.2)] transition-all duration-300 ease-out ${isActive ? 'border-white/20 bg-white text-slate-950' : 'border-white/10 bg-slate-950/82 text-white backdrop-blur-xl'} ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'}`}
                      style={{
                        transform,
                        transitionDelay,
                        color: isActive ? backgroundColor : menuTextColor
                      }}
                    >
                      <span style={{ color: isActive ? menuActiveColor : menuTextColor }} className="shrink-0">
                        <TabIcon icon={tab.icon} className="h-4 w-4" />
                      </span>
                      <span className="truncate text-[0.55rem] font-semibold tracking-[0.02em]">
                        {SOCIAL_HERO_TAB_LABELS[tab.id]}
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div className="absolute bottom-0 right-0 flex items-end gap-3">
                <div
                  className={`pointer-events-none absolute bottom-[4.5rem] right-[5.7rem] rounded-2xl border border-white/10 bg-slate-950/72 px-3 py-2 text-right text-white shadow-[0_18px_40px_rgba(2,6,23,0.26)] backdrop-blur-xl transition-all duration-300 ${isMobileMenuOpen ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100'}`}
                  aria-hidden="true"
                >
                  <div className="text-[0.6rem] uppercase tracking-[0.32em] text-white/55">Social</div>
                  <div className="mt-1 text-sm font-semibold">{SOCIAL_HERO_TAB_LABELS[activeTab] || 'Main'}</div>
                </div>
                <button
                  type="button"
                  className={`pointer-events-auto absolute -bottom-12 -right-12 flex h-28 w-28 items-start justify-start overflow-hidden rounded-full border text-white transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${isMobileMenuOpen ? 'scale-105 border-white/22 bg-slate-950/72 backdrop-blur-xl' : 'scale-100 border-white/14 bg-slate-950/20 backdrop-blur-md'}`}
                  style={mobileLauncherStyle}
                  onClick={() => setIsMobileMenuOpen((prev) => !prev)}
                  aria-expanded={isMobileMenuOpen}
                  aria-controls="social-mobile-nav-menu"
                  aria-label={isMobileMenuOpen ? 'Collapse social section menu' : 'Expand social section menu'}
                >
                  <span className={`absolute inset-[10px] rounded-full border transition-opacity duration-300 ${isMobileMenuOpen ? 'border-white/14 opacity-100' : 'border-white/12 opacity-75'}`} aria-hidden="true" />
                  <span className={`absolute inset-0 transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-52'}`} aria-hidden="true" style={{ background: `radial-gradient(circle at 30% 25%, ${menuActiveColor}aa, ${backgroundColor}18 40%, transparent 74%)` }} />
                  <span className="relative ml-5 mt-4 flex flex-col items-center leading-none">
                    <span className="text-[2.15rem] font-black tracking-[-0.16em]">S</span>
                    <span className="mt-1 text-[0.5rem] uppercase tracking-[0.34em] text-white/72">
                      {isMobileMenuOpen ? 'Close' : 'Menu'}
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Preview component for Design Studio
export const SocialHeroPreview = ({ heroConfig = {}, isMobile = false }) => {
  const mockProfile = {
    name: 'John Doe',
    location: 'San Francisco, CA',
    avatarUrl: '',
    isOnline: true,
    lastActive: new Date().toISOString()
  };

  return (
    <SocialHero
      profile={mockProfile}
      heroConfig={heroConfig}
      activeTab={heroConfig.activeTab || 'main'}
      isMobile={isMobile}
    />
  );
};

export default SocialHero;
