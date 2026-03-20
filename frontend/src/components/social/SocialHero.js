import React, { useEffect, useMemo, useState } from 'react';
import { getPresenceMeta } from '../../utils/presence';

const MOBILE_SOCIAL_MENU_LAYOUT_BY_TAB = {
  main: { x: -72, y: 0 },
  friends: { x: -72, y: -32 },
  gallery: { x: -24, y: -68 },
  chat: { x: -24, y: -102 },
  calendar: { x: -24, y: -134 }
};

const SITE_NAV_LINKS = [
  { id: 'chat', label: 'Chat', path: '/chat', icon: 'chat' },
  { id: 'news', label: 'News', path: '/news', icon: 'news' },
  { id: 'market', label: 'Market', path: '/market', icon: 'market' },
  { id: 'discover', label: 'Find Friends', path: '/find-friends', icon: 'discover' }
];
const MUTED_ACTIVITY_CLASS = 'opacity-55';

const buildMobileMenuLayout = (items, layoutMap, fallbackOriginX) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items.map((item, index) => {
    const fallback = {
      x: fallbackOriginX + (index * 14),
      y: 2 - (index * 32)
    };

    return {
      ...item,
      ...(layoutMap[item.id] || fallback)
    };
  });
};

const formatActivityTimestamp = (value) => {
  if (!value) return '';

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';

  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h`;
  return `${Math.floor(diffMinutes / 1440)}d`;
};

const getActivityItemKey = (item, fallback = 'activity') => String(item?._id || item?.id || item?.title || fallback);

const isActivityAcknowledged = (item) => Boolean(item?.isRead || item?.readAt || item?.acknowledgedAt);

const getNotificationSupportingText = (item) => {
  const bodyText = String(item?.body || '').trim();
  if (bodyText) return bodyText;

  const senderName = String(
    item?.senderName
      || item?.senderRealName
      || item?.senderUsername
      || item?.sender?.realName
      || item?.sender?.username
      || item?.data?.senderName
      || ''
  ).trim();
  if (!senderName) return '';

  if (/follow request/i.test(String(item?.title || ''))) {
    return `${senderName} sent you a follow request`;
  }

  return senderName;
};

const isActivityMuted = (item, timestampKey = 'createdAt') => {
  if (!item) return false;
  if (item.isRead || item.readAt || item.acknowledgedAt) return true;

  const timestamp = new Date(item[timestampKey] || item.updatedAt || item.timestamp || 0).getTime();
  if (!timestamp || Number.isNaN(timestamp)) return false;

  const hoursOld = Math.max(0, (Date.now() - timestamp) / 3600000);
  return hoursOld >= 24;
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
    ),
    news: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
    market: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
    discover: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    blog: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
    resume: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    aboutme: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )
  };
  return icons[icon] || null;
};

const SocialHero = ({
  profile = {},
  heroConfig = {},
  isMobile = false,
  isEditing = false,
  onEditClick,
  activeTab,
  onTabChange,
  activitySummary,
  onMobileMenuToggle,
  enableMobileLauncher,
  visibleTabs,
  enabledSections,
  isGuestPreview,
  onGuestPreviewToggle
}) => {
  const {
    name = 'User Name',
    location = '',
    avatarUrl = '',
    presence = null,
    isOnline = false,
    lastActive = null
  } = profile;

  const {
    backgroundColor = '#1e293b',
    backgroundImage = null,
    backgroundImageDisplayMode = 'cover',
    backgroundImageOverlay = 0,
    backgroundImageGrain = 0,
    backgroundImageBlur = 0,
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
  const [presenceReferenceTime, setPresenceReferenceTime] = useState(() => Date.now());

  const resolvedPresence = useMemo(
    () => (presence || { status: isOnline ? 'online' : 'offline', lastSeen: lastActive }),
    [presence, isOnline, lastActive]
  );
  const presenceMeta = useMemo(
    () => getPresenceMeta(resolvedPresence, presenceReferenceTime),
    [resolvedPresence, presenceReferenceTime]
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPresenceReferenceTime(Date.now());
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

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

  const bgDisplayStyles = backgroundImage
    ? backgroundImageDisplayMode === 'fixed'
      ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }
      : backgroundImageDisplayMode === 'repeat'
        ? { backgroundImage: `url(${backgroundImage})`, backgroundRepeat: 'repeat', backgroundSize: 'auto' }
        : { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {};

  const containerStyle = {
    backgroundColor,
    fontFamily: `"${fontFamily}", sans-serif`,
    ...bgDisplayStyles
  };

  const nameStyle = { color: nameColor };
  const locationStyle = { color: locationColor };

  return (
    <div 
      className="relative w-full overflow-visible"
      style={containerStyle}
    >
      {/* Blur layer */}
      {backgroundImage && backgroundImageBlur > 0 && (
        <div className="absolute inset-0" style={{ backdropFilter: `blur(${backgroundImageBlur}px)`, WebkitBackdropFilter: `blur(${backgroundImageBlur}px)` }} />
      )}
      {/* Dark overlay */}
      {backgroundImage && backgroundImageOverlay > 0 && (
        <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${backgroundImageOverlay})` }} />
      )}
      {/* Grain / noise */}
      {backgroundImage && backgroundImageGrain > 0 && (
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: backgroundImageGrain, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.5\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat', backgroundSize: '128px 128px' }} />
      )}
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
                  presenceMeta.dotClassName
                }`}
                title={presenceMeta.status === 'online' ? 'Online' : presenceMeta.label || formatLastActive(lastActive)}
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

          {/* Desktop section navigation */}
          {!isMobile && showNavigation && Array.isArray(visibleTabs) && visibleTabs.length > 0 && (
            <nav
              className="flex items-center gap-1 rounded-2xl border border-white/15 bg-black/30 px-2 py-1.5 backdrop-blur-md"
              aria-label="Social page sections"
            >
              {visibleTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onTabChange && onTabChange(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isActive ? 'bg-white/20' : 'hover:bg-white/10'
                    }`}
                    style={{ color: isActive ? menuActiveColor : menuTextColor }}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <TabIcon icon={tab.icon} className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </div>
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
