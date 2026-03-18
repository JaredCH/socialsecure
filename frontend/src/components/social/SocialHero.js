import React, { useEffect, useMemo, useState } from 'react';
import { getPresenceMeta } from '../../utils/presence';

const SocialHero = ({
  profile = {},
  heroConfig = {},
  isMobile = false,
  isEditing = false,
  onEditClick,
  // Legacy props accepted but no longer used (navigation moved to DotNav)
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
    nameColor = '#ffffff',
    locationColor = '#94a3b8',
    fontFamily = 'Inter',
    showLocation = true,
    showOnlineStatus = true
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

  const containerStyle = {
    backgroundColor,
    fontFamily: `"${fontFamily}", sans-serif`,
    ...(backgroundImage && { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' })
  };

  const nameStyle = { color: nameColor };
  const locationStyle = { color: locationColor };

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
