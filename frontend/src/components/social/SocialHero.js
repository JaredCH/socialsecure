import React from 'react';
import { SOCIAL_HERO_TABS, SOCIAL_HERO_TAB_LABELS, HERO_AVATAR_SIZES } from '../../utils/socialPagePreferences';

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
    document: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    newspaper: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
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
    textColor = '#ffffff',
    nameColor = '#ffffff',
    locationColor = '#94a3b8',
    menuTextColor = '#e2e8f0',
    menuActiveColor = '#3b82f6',
    fontFamily = 'Inter',
    avatarSize = 'lg',
    showLocation = true,
    showOnlineStatus = true,
    showNavigation = true,
    layout = 'standard'
  } = heroConfig;

  const avatarDimensions = HERO_AVATAR_SIZES[avatarSize] || HERO_AVATAR_SIZES.lg;
  const currentAvatarSize = isMobile ? avatarDimensions.mobile : avatarDimensions.desktop;

  const getLayoutClasses = () => {
    switch (layout) {
      case 'compact':
        return isMobile 
          ? 'flex-col items-center text-center py-4' 
          : 'items-center gap-4 py-6';
      case 'expanded':
        return isMobile 
          ? 'flex-col items-center text-center py-6' 
          : 'items-start gap-6 py-8';
      case 'standard':
      default:
        return isMobile 
          ? 'flex-col items-center text-center py-4' 
          : 'items-center gap-6 py-6';
    }
  };

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
      className="w-full relative"
      style={containerStyle}
    >
      {/* Gradient overlay for readability if background image */}
      {backgroundImage && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      )}

      <div className={`
        relative z-10 max-w-7xl mx-auto px-4 sm:px-6
        flex ${getLayoutClasses()}
      `}>
        {/* Avatar Section */}
        <div className="relative flex-shrink-0">
          <div 
            className="rounded-full overflow-hidden border-4 border-white/20 shadow-lg"
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
            <div className="absolute bottom-1 right-1">
              <div 
                className={`w-4 h-4 rounded-full border-2 border-white ${
                  isOnline ? 'bg-green-500' : 'bg-slate-400'
                }`}
                title={isOnline ? 'Online' : formatLastActive(lastActive)}
              />
            </div>
          )}
        </div>

        {/* Profile Info Section */}
        <div className="flex flex-col">
          <h1 
            className="text-2xl sm:text-3xl font-bold"
            style={nameStyle}
          >
            {name}
          </h1>
          
          {showLocation && location && (
            <div 
              className="flex items-center gap-1 mt-1 text-sm"
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
              className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Customize Hero
            </button>
          )}
        </div>

        {/* Navigation Menu - Desktop */}
        {showNavigation && !isMobile && (
          <nav className="ml-auto flex items-center gap-1">
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

      {/* Mobile Navigation - Bottom Tabs */}
      {showNavigation && isMobile && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 z-50">
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
