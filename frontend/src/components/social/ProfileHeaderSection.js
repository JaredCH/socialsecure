import React from 'react';

const getVisibleLinks = (links) => {
  if (!Array.isArray(links)) return [];
  return links
    .filter((entry) => entry && typeof entry.url === 'string' && entry.url.trim())
    .slice(0, 3);
};

const ProfileHeaderSection = ({
  sectionId,
  profile,
  isAuthenticated,
  isGuestPreview,
  isOwnSocialContext,
  isViewingAnotherProfile,
  requestedProfileIdentifier,
  postsCount,
  onEnterGuestPreview,
  onExitGuestPreview,
  onSectionClick,
}) => {
  const displayName = profile?.realName || profile?.username || requestedProfileIdentifier || 'Community member';
  const username = profile?.username || requestedProfileIdentifier || 'guest';
  const bio = profile?.bio || 'No bio shared yet.';
  const avatarUrl = profile?.avatarUrl || 'https://via.placeholder.com/96?text=User';
  const bannerStyle = profile?.bannerUrl
    ? { backgroundImage: `url(${profile.bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : null;
  const links = getVisibleLinks(profile?.links);

  return (
    <section
      id={sectionId}
      data-social-section={sectionId}
      className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow"
      onClick={() => onSectionClick(sectionId)}
    >
      <div
        className={`h-28 sm:h-36 ${bannerStyle ? '' : 'bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700'}`}
        style={bannerStyle || undefined}
      />
      <div className="relative -mt-10 px-5 pb-5 sm:px-6 sm:pb-6">
        <img
          src={avatarUrl}
          alt={`${displayName} avatar`}
          className="h-20 w-20 rounded-2xl border-4 border-white bg-white object-cover shadow"
        />
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">{displayName}</h2>
            <p className="text-sm text-gray-600">@{username}</p>
            <p className="mt-2 max-w-2xl text-sm text-gray-700">{bio}</p>
          </div>
          {isOwnSocialContext && (
            <div>
              {isGuestPreview ? (
                <button
                  type="button"
                  onClick={onExitGuestPreview}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Exit Guest Preview
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onEnterGuestPreview}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  View as Guest
                </button>
              )}
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-600">
          <span className="rounded-full bg-gray-100 px-2.5 py-1">Posts loaded: {postsCount}</span>
          {isViewingAnotherProfile ? (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
              Viewing public profile for @{requestedProfileIdentifier}
            </span>
          ) : isAuthenticated && isGuestPreview ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">Guest preview mode active</span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
              {isAuthenticated ? 'Owner view' : 'Guest mode'}
            </span>
          )}
        </div>
        {links.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {links.map((link, index) => (
              <a
                key={`${link.url}-${index}`}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50"
              >
                {link.label || 'Profile link'}
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default ProfileHeaderSection;
