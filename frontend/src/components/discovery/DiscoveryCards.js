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

  return (
    <div className="bg-white rounded-lg shadow p-4 flex flex-col sm:flex-row items-start gap-3">
      <div className="flex-shrink-0">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={`${user.username || 'user'} avatar`}
            className="w-12 h-12 rounded-full object-cover border border-gray-200"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-lg">
            {(user.realName || user.username || '?')[0].toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 w-full">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/social?user=${encodeURIComponent(user.username)}`}
              className="font-semibold text-gray-900 hover:text-blue-600 truncate block"
            >
              {user.realName || user.username}
            </Link>
            <p className="text-sm text-gray-500">@{user.username}</p>
          </div>

          {!canInteract ? (
            <span className="text-sm text-slate-500 font-medium flex-shrink-0">Register to connect</span>
          ) : requestState === 'sent' ? (
            <span className="text-sm text-amber-600 font-medium flex-shrink-0">Pending</span>
          ) : (
            <button
              type="button"
              onClick={handleSendRequest}
              disabled={requestState === 'loading'}
              className="flex-shrink-0 min-h-[44px] px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {requestState === 'loading' ? 'Sending…' : 'Add Friend'}
            </button>
          )}
        </div>

        {user.bio && (
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{user.bio}</p>
        )}

        <div className="flex items-center gap-2 mt-2">
          {[user.city, user.state, user.country].filter(Boolean).length > 0 && (
            <span className="text-xs text-gray-400">
              📍 {[user.city, user.state, user.country].filter(Boolean).join(', ')}
            </span>
          )}
        </div>

        <p className="text-xs text-blue-500 mt-1">{user.whySuggested}</p>

        {requestState === 'error' && (
          <p className="text-xs text-red-500 mt-1">{requestError || 'Failed to send request. Please try again.'}</p>
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
