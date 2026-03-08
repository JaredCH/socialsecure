import React from 'react';
import { SOCIAL_HERO_TABS, SOCIAL_HERO_TAB_LABELS } from '../../utils/socialPagePreferences';

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
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-700 bg-slate-950/95 backdrop-blur-xl">
          <nav className="flex justify-around py-2">
            {SOCIAL_HERO_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange?.(tab.id)}
                className={`
                  flex flex-col items-center gap-1 px-3 py-2
                  ${activeTab === tab.id 
                    ? 'text-blue-400' 
                    : 'text-slate-400'
                  }
                `}
              >
                <TabIcon icon={tab.icon} className="w-5 h-5" />
                <span className="text-xs">{SOCIAL_HERO_TAB_LABELS[tab.id]}</span>
              </button>
            ))}
          </nav>
        </div>
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
