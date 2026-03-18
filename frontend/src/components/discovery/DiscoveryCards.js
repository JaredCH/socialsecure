import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const resolveUserId = (user) => {
  const rawUserId = user?._id ?? user?.id ?? user?.userId ?? null;
  if (rawUserId === null || rawUserId === undefined) return '';
  return String(rawUserId).trim();
};

const extractApiErrorMessage = (error, fallbackMessage) => (
  error?.response?.data?.error || fallbackMessage
);

const getInitialRequestState = (user) => (
  user?.relationship === 'pending' && user?.requestDirection === 'outgoing'
    ? 'sent'
    : 'idle'
);

export const UserCard = ({ user, onSendRequest, canInteract }) => {
  const [requestState, setRequestState] = useState(() => getInitialRequestState(user)); // idle | loading | sent | error
  const [requestError, setRequestError] = useState('');

  useEffect(() => {
    setRequestState(getInitialRequestState(user));
    setRequestError('');
  }, [user?.relationship, user?.requestDirection]);

  const handleSendRequest = async () => {
    const targetUserId = resolveUserId(user);
    if (!targetUserId) {
      setRequestError('Unable to identify this user. Please refresh and try again.');
      setRequestState('error');
      return;
    }

    setRequestError('');
    setRequestState('loading');
    try {
      await onSendRequest(targetUserId);
      setRequestState('sent');
    } catch (error) {
      setRequestError(extractApiErrorMessage(error, 'Failed to send request. Please try again.'));
      const alreadyPending = String(error?.response?.data?.error || '').toLowerCase().includes('already sent');
      setRequestState(alreadyPending ? 'sent' : 'error');
    }
  };

  const preview = user.socialPreview || {};
  const heroConfig = preview.hero || {};
  const globalStyles = preview.globalStyles || {};
  const heroBg = heroConfig.backgroundImage || null;
  const heroBgColor = heroConfig.backgroundColor || '#1e293b';
  const pageBgColor = globalStyles.pageBackgroundColor || '#f8fafc';
  const pageBgImage = globalStyles.bodyBackgroundImage || '';
  const fontFamily = globalStyles.fontFamily || 'Inter';

  const heroStyle = {
    backgroundColor: heroBgColor,
    ...(heroBg ? { backgroundImage: `url(${heroBg})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {})
  };

  const cardStyle = {
    backgroundColor: pageBgColor,
    fontFamily: `"${fontFamily}", sans-serif`,
    ...(pageBgImage ? { backgroundImage: `url(${pageBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {})
  };

  return (
    <div
      className="rounded-xl shadow-md overflow-hidden border border-gray-200 flex flex-col transition-shadow hover:shadow-lg"
      style={cardStyle}
    >
      {/* Mini hero banner */}
      <div className="relative h-20 w-full" style={heroStyle}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        {/* Avatar overlay on banner */}
        <div className="absolute -bottom-5 left-3">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={`${user.username || 'user'} avatar`}
              className="w-10 h-10 rounded-lg object-cover border-2 border-white shadow"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div
              className="w-10 h-10 rounded-lg border-2 border-white shadow flex items-center justify-center text-white font-semibold text-sm"
              style={{ backgroundColor: heroBgColor }}
            >
              {(user.realName || user.username || '?')[0].toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="pt-7 px-3 pb-3 flex flex-col flex-1 bg-white/80 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="min-w-0 flex-1">
            <Link
              to={`/social?user=${encodeURIComponent(user.username)}`}
              className="font-semibold text-gray-900 hover:text-blue-600 text-sm truncate block leading-tight"
            >
              {user.realName || user.username}
            </Link>
            <p className="text-xs text-gray-400 truncate">@{user.username}</p>
          </div>
          {!canInteract ? (
            <span className="text-[10px] text-slate-400 font-medium flex-shrink-0">Register</span>
          ) : requestState === 'sent' ? (
            <span className="text-[10px] text-amber-600 font-medium flex-shrink-0 bg-amber-50 rounded-full px-2 py-0.5">Pending</span>
          ) : (
            <button
              type="button"
              onClick={handleSendRequest}
              disabled={requestState === 'loading'}
              className="flex-shrink-0 px-2 py-1 text-[10px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {requestState === 'loading' ? '…' : 'Add Friend'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-auto text-[10px] text-gray-400">
          {[user.city, user.state, user.country].filter(Boolean).length > 0 && (
            <span className="truncate">📍 {[user.city, user.state].filter(Boolean).join(', ')}</span>
          )}
          {user.createdAt && (
            <span>Joined {formatDate(user.createdAt)}</span>
          )}
        </div>

        {requestState === 'error' && (
          <p className="text-[10px] text-red-500 mt-1">{requestError || 'Failed to send request.'}</p>
        )}
      </div>
    </div>
  );
};

export const PostCard = ({ post }) => {
  const author = post.author || {};
  const authorName = author.realName || author.username || 'Unknown';
  const authorUsername = author.username || '';

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-2 mb-2">
        {author.avatarUrl ? (
          <img
            src={author.avatarUrl}
            alt={`${authorUsername || authorName} avatar`}
            className="w-8 h-8 rounded-full object-cover border border-gray-200"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
            {(authorName)[0].toUpperCase()}
          </div>
        )}
        <div>
          <Link
            to={`/social?user=${encodeURIComponent(authorUsername)}`}
            className="font-semibold text-gray-900 hover:text-blue-600 text-sm"
          >
            {authorName}
          </Link>
          <p className="text-xs text-gray-400">{formatDate(post.createdAt)}</p>
        </div>
      </div>

      {post.content && (
        <p className="text-gray-800 text-sm whitespace-pre-wrap line-clamp-4">{post.content}</p>
      )}

      {Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0 && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
          {post.mediaUrls.slice(0, 4).map((url, i) => (
            <a
              key={`${post._id}-media-${i}`}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="block rounded overflow-hidden border bg-gray-50"
            >
              <img
                src={url}
                alt={`Post media ${i + 1}`}
                loading="lazy"
                className="w-full h-32 object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
        <span>❤️ {post.likesCount}</span>
        <span>💬 {post.commentsCount}</span>
      </div>

      <p className="text-xs text-blue-500 mt-2">{post.whySuggested}</p>
    </div>
  );
};
