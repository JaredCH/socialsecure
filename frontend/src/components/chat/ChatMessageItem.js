import React, { memo, useEffect, useRef, useState } from 'react';

const LINK_REGEX = /(https?:\/\/[^\s]+)/gi;
const TRAILING_PUNCTUATION_REGEX = /[),.!?;:]+$/;
const DEFAULT_LONG_PRESS_DELAY_MS = 550;
const LINK_PREVIEW_PERCENTAGE = 0.25;
const DM_MESSAGE_TEXT_CLASS = 'text-[13px] leading-5';
const ROOM_MESSAGE_TEXT_CLASS = 'text-[14px] leading-6';
const REACTION_CLOSE_DELAY_MS = 300;

const getAvatarInitials = (realName, fallbackLabel) => {
  const nameParts = String(realName || '').trim().split(/\s+/).filter(Boolean);
  if (nameParts.length >= 2) {
    return `${nameParts[0].charAt(0)}${nameParts[nameParts.length - 1].charAt(0)}`.toUpperCase();
  }
  if (nameParts.length === 1 && nameParts[0].length > 0) {
    return nameParts[0].slice(0, 2).toUpperCase();
  }
  const fallback = String(fallbackLabel || '').replace(/^@/, '').trim();
  return fallback.slice(0, 2).toUpperCase() || '?';
};

const supportsHoverInput = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
};

const formatCompactTimestamp = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = String(date.getFullYear()).slice(-2);
  const rawHours = date.getHours();
  const hours = rawHours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const meridiem = rawHours >= 12 ? 'pm' : 'am';
  return `${month}/${day}/${year} - ${hours}:${minutes}:${seconds}${meridiem}`;
};

const getLinkPreview = (href) => {
  const mainUrl = String(href || '').replace(/^https?:\/\//i, '');
  if (!mainUrl) return '';
  const previewLength = Math.max(1, Math.ceil(mainUrl.length * LINK_PREVIEW_PERCENTAGE));
  return mainUrl.slice(0, previewLength);
};

const extractLinkToken = (token) => {
  const match = token.match(TRAILING_PUNCTUATION_REGEX);
  if (!match) {
    return { link: token, trailing: '' };
  }
  return {
    link: token.slice(0, -match[0].length),
    trailing: match[0]
  };
};

const isExternalLink = (href) => {
  try {
    const current = new URL(window.location.href);
    const parsed = new URL(href, current.origin);
    return parsed.host !== current.host;
  } catch {
    return true;
  }
};

const renderPlainTextWithLinks = (text, keyPrefix = 'plain') => {
  if (!text) return [];
  const parts = String(text).split(LINK_REGEX);
  return parts.map((part, index) => {
    if (!part) return null;
    if (!/^https?:\/\//i.test(part)) {
      return <React.Fragment key={`${keyPrefix}-text-${index}`}>{part}</React.Fragment>;
    }
    const { link, trailing } = extractLinkToken(part);
    if (!link) {
      return <React.Fragment key={`${keyPrefix}-text-${index}`}>{part}</React.Fragment>;
    }
    const preview = getLinkPreview(link);
    return (
      <React.Fragment key={`${keyPrefix}-link-${index}`}>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:opacity-80"
          onClick={(event) => {
            if (isExternalLink(link)) {
              const proceed = window.confirm('You are leaving SocialSecure. Continue to open this link in a new window?');
              if (!proceed) {
                event.preventDefault();
              }
            }
          }}
        >
          {preview}
        </a>
        {trailing}
      </React.Fragment>
    );
  });
};

const renderMessageContent = (content) => {
  const text = String(content || '');
  if (!text) return null;

  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi;
  const rendered = [];
  let lastIndex = 0;
  let match;
  let matchIndex = 0;
  while ((match = markdownLinkRegex.exec(text)) !== null) {
    const [full, shortName, href] = match;
    const start = match.index;
    if (start > lastIndex) {
      rendered.push(...renderPlainTextWithLinks(text.slice(lastIndex, start), `segment-${matchIndex}`));
    }
    const preview = getLinkPreview(href);
    rendered.push(
      <a
        key={`named-link-${matchIndex}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-80"
        onClick={(event) => {
          if (isExternalLink(href)) {
            const proceed = window.confirm('You are leaving SocialSecure. Continue to open this link in a new window?');
            if (!proceed) {
              event.preventDefault();
            }
          }
        }}
      >
        {`${shortName} (${preview})`}
      </a>
    );
    lastIndex = start + full.length;
    matchIndex += 1;
  }
  if (lastIndex < text.length) {
    rendered.push(...renderPlainTextWithLinks(text.slice(lastIndex), `segment-end`));
  }
  return rendered;
};

function ChatMessageItem({
  message,
  conversationType,
  groupedWithPrevious = false,
  groupedWithNext = false,
  isOwnMessage,
  currentUserId,
  theme,
  censorSensitiveWords = true,
  onOpenUserMenu,
  reactionsByType = {},
  reactionOptions = [],
  onToggleReaction,
  longPressDelayMs = DEFAULT_LONG_PRESS_DELAY_MS,
  showAdminActions = false,
  adminMutedUserIds,
  adminProcessingMessageIds,
  adminProcessingUserIds,
  onToggleAdminMessageRemoval,
  onToggleAdminUserMute,
  onAdminDeleteMessage,
  onUsernameHoverStart,
  onUsernameHoverEnd
}) {
  const author = message.userId?.username || message.userId?.realName || 'user';
  const usernameForProfileLink = typeof message.userId?.username === 'string' ? message.userId.username.trim() : '';
  const profileLink = usernameForProfileLink ? `/social?user=${encodeURIComponent(usernameForProfileLink)}` : null;
  const createdAt = message.createdAt ? new Date(message.createdAt) : null;
  const timestamp = createdAt ? formatCompactTimestamp(createdAt) : '';
  const longPressTimerRef = useRef(null);
  const normalizedCurrentUserId = String(currentUserId || '');
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const reactionCloseTimerRef = useRef(null);
  const isDmConversation = conversationType === 'dm';
  const canHoverForReactions = supportsHoverInput();
  const isSystemMessage = message.messageType === 'system';
  const avatarUrl = message.userId?.avatarUrl || '';
  const menuUser = message.userId?._id ? {
    _id: message.userId._id,
    username: message.userId.username,
    realName: message.userId.realName
  } : null;
  const displayContent = censorSensitiveWords && typeof message.contentCensored === 'string'
    ? message.contentCensored
    : message.content;
  const normalizedMessageId = String(message?._id || '');
  const normalizedAuthorId = String(message?.userId?._id || '');
  const messageRemovedByAdmin = !!message?.moderation?.removedByAdmin;
  const authorMutedByAdmin = adminMutedUserIds?.has?.(normalizedAuthorId);
  const messageActionPending = adminProcessingMessageIds?.has?.(normalizedMessageId);
  const muteActionPending = adminProcessingUserIds?.has?.(normalizedAuthorId);

  useEffect(() => () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (reactionCloseTimerRef.current) {
      clearTimeout(reactionCloseTimerRef.current);
      reactionCloseTimerRef.current = null;
    }
  }, []);

  const openReactionPicker = () => {
    if (reactionCloseTimerRef.current) {
      clearTimeout(reactionCloseTimerRef.current);
      reactionCloseTimerRef.current = null;
    }
    setReactionPickerOpen(true);
  };

  const scheduleCloseReactionPicker = (event) => {
    if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) {
      reactionCloseTimerRef.current = setTimeout(() => {
        setReactionPickerOpen(false);
      }, REACTION_CLOSE_DELAY_MS);
    }
  };

  const triggerUserMenu = (event, point) => {
    if (!menuUser || typeof onOpenUserMenu !== 'function') return;
    if (event?.target?.closest('a, [data-chat-no-user-menu="true"]')) return;
    onOpenUserMenu(event, menuUser, point);
  };

  const avatarInitials = getAvatarInitials(message.userId?.realName, message.userId?.username || author);
  const avatarContent = avatarUrl ? (
    <img
      src={avatarUrl}
      alt={isOwnMessage ? 'You' : `@${author}`}
      className="h-full w-full rounded-full object-cover"
    />
  ) : (
    avatarInitials
  );

  const avatarNode = profileLink ? (
    <a
      href={profileLink}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 ${theme.subtle}`}
      aria-label={isOwnMessage ? 'View your social profile' : `View @${author} social profile`}
    >
      {avatarContent}
    </a>
  ) : (
    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold overflow-hidden ${theme.subtle}`}>
      {avatarContent}
    </span>
  );

  const reactionsMarkup = (
    <div className="mt-0.5 flex flex-wrap items-center gap-1">
      {reactionOptions.map((reaction) => {
        const actors = Array.isArray(reactionsByType?.[reaction.key]) ? reactionsByType[reaction.key] : [];
        if (actors.length === 0) return null;
        const reactedByMe = normalizedCurrentUserId && actors.includes(normalizedCurrentUserId);
        return (
          <button
            key={reaction.key}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleReaction?.(message._id, reaction.key);
            }}
            data-chat-no-user-menu="true"
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${reactedByMe ? 'font-semibold' : ''}`}
            title={reaction.label}
          >
            <span>{reaction.emoji}</span>
            <span>{actors.length}</span>
          </button>
        );
      })}
      {reactionPickerOpen ? (
        <div
          className={[
            'absolute bottom-full z-20 -mb-1 flex items-center gap-0.5 rounded-lg border px-1.5 py-1 shadow-sm',
            'text-sm sm:text-xs sm:gap-1 sm:px-1 sm:py-0.5',
            isOwnMessage ? 'right-0' : 'left-0',
            theme.subtle
          ].join(' ')}
          data-chat-no-user-menu="true"
          data-testid="reaction-picker-popup"
          onMouseEnter={openReactionPicker}
          onMouseLeave={scheduleCloseReactionPicker}
        >
          {reactionOptions.map((reaction) => (
            <button
              key={`pick-${reaction.key}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleReaction?.(message._id, reaction.key);
                setReactionPickerOpen(false);
              }}
              data-chat-no-user-menu="true"
              className="rounded px-1.5 py-1 sm:px-1 sm:py-0.5 text-base sm:text-[10px] hover:opacity-100 transition-transform hover:scale-110"
              aria-label={`Add ${reaction.label} reaction`}
              title={reaction.label}
            >
              {reaction.emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  const adminActionsMarkup = showAdminActions ? (
    <div className="ml-2 flex shrink-0 items-start gap-1" data-chat-no-user-menu="true">
      <button
        type="button"
        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${theme.subtle}`}
        aria-label={messageRemovedByAdmin ? 'Undo remove message' : 'Remove message'}
        title={messageRemovedByAdmin ? 'Undo remove message' : 'Remove message'}
        disabled={messageActionPending}
        onClick={(event) => {
          event.stopPropagation();
          onToggleAdminMessageRemoval?.(message);
        }}
      >
        {messageActionPending ? '…' : (messageRemovedByAdmin ? 'Undo' : '🗑')}
      </button>
      <button
        type="button"
        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${theme.subtle}`}
        aria-label={authorMutedByAdmin ? 'Undo 2 hour mute' : 'Mute user for 2 hours'}
        title={authorMutedByAdmin ? 'Undo 2 hour mute' : 'Mute user for 2 hours'}
        disabled={muteActionPending || !normalizedAuthorId || isOwnMessage}
        onClick={(event) => {
          event.stopPropagation();
          if (!menuUser) return;
          onToggleAdminUserMute?.(menuUser);
        }}
      >
        {muteActionPending ? '…' : (authorMutedByAdmin ? 'Undo' : '🔇')}
      </button>
      <button
        type="button"
        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold text-red-600 ${theme.subtle}`}
        aria-label="Delete message"
        title="Delete message permanently"
        disabled={messageActionPending}
        onClick={(event) => {
          event.stopPropagation();
          onAdminDeleteMessage?.(message);
        }}
      >
        {messageActionPending ? '…' : '✕'}
      </button>
    </div>
  ) : null;

  if (isSystemMessage) {
    return (
      <div className="my-0.5 flex items-center justify-center" data-chat-message-layout="system" data-testid="system-message">
        <span className="text-[11px] italic opacity-40">{displayContent || message.content}</span>
      </div>
    );
  }

  const usernameHoverProps = (user) => ({
    onMouseEnter: (event) => {
      if (typeof onUsernameHoverStart === 'function' && user) {
        const rect = event.currentTarget.getBoundingClientRect();
        onUsernameHoverStart(user, rect);
      }
    },
    onMouseLeave: () => {
      if (typeof onUsernameHoverEnd === 'function') {
        onUsernameHoverEnd();
      }
    }
  });

  if (isDmConversation) {
    const showAvatar = !groupedWithNext;
    const showHeader = !groupedWithPrevious;
    const dmAvatarNode = showAvatar ? avatarNode : <span className="block h-9 w-9 shrink-0" />;

    return (
      <article
        className={`group flex ${isOwnMessage ? 'justify-end' : 'justify-start'} ${groupedWithPrevious ? 'mt-0.5' : 'mt-2'}`}
        data-chat-message-layout="dm"
        data-chat-grouped={groupedWithPrevious ? 'true' : 'false'}
        onClick={(event) => triggerUserMenu(event)}
        onContextMenu={(event) => triggerUserMenu(event)}
        onTouchStart={(event) => {
          if (!menuUser) return;
          const touch = event.touches?.[0];
          if (!touch) return;
          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = setTimeout(() => {
            triggerUserMenu(event, { x: touch.clientX, y: touch.clientY });
          }, longPressDelayMs);
        }}
        onTouchEnd={() => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
        }}
      >
        <div className={`flex max-w-[88%] items-end gap-2 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
          {dmAvatarNode}
          <div className={`flex min-w-0 flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}>
            {showHeader ? (
              <a
                href={profileLink || '#'}
                className={`mb-0.5 truncate text-xs font-semibold ${isOwnMessage ? 'text-right' : 'text-left'} ${theme.senderAccent} hover:underline`}
                {...usernameHoverProps(menuUser)}
              >
                @{author}
              </a>
            ) : null}
            <div
              tabIndex={0}
              className={[
                'relative px-2 py-1 shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1',
                isOwnMessage
                  ? [
                    'rounded-[1.35rem] rounded-r-[1.35rem]',
                    groupedWithPrevious ? 'rounded-tr-md' : '',
                    groupedWithNext ? 'rounded-br-md' : ''
                  ].join(' ')
                  : [
                    'rounded-[1.35rem] rounded-l-[1.35rem]',
                    groupedWithPrevious ? 'rounded-tl-md' : '',
                    groupedWithNext ? 'rounded-bl-md' : ''
                  ].join(' '),
                isOwnMessage ? theme.messageOwn : theme.messageOther
              ].join(' ')}
              onMouseOver={() => {
                if (canHoverForReactions) {
                  openReactionPicker();
                }
              }}
              onMouseLeave={(event) => {
                if (canHoverForReactions) {
                  scheduleCloseReactionPicker(event);
                }
              }}
              onClick={(event) => {
                if (canHoverForReactions) return;
                if (event.target?.closest?.('a, button, [data-chat-no-user-menu="true"]')) return;
                event.stopPropagation();
                setReactionPickerOpen((open) => !open);
              }}
            >
              <p className={`whitespace-pre-wrap break-words ${DM_MESSAGE_TEXT_CLASS}`}>{renderMessageContent(message.content)}</p>
              {reactionsMarkup}
            </div>
            {timestamp ? (
              <span className="mt-0.5 px-2 text-[10px] font-mono opacity-65">{timestamp}</span>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`group rounded-xl px-2 py-0.5 ${groupedWithPrevious ? 'mt-0' : 'mt-2'} ${theme.roomHover || ''}`}
      data-chat-message-layout="room"
      data-chat-grouped={groupedWithPrevious ? 'true' : 'false'}
      onClick={(event) => triggerUserMenu(event)}
      onContextMenu={(event) => triggerUserMenu(event)}
      onTouchStart={(event) => {
        if (!menuUser) return;
        const touch = event.touches?.[0];
        if (!touch) return;
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = setTimeout(() => {
          triggerUserMenu(event, { x: touch.clientX, y: touch.clientY });
        }, longPressDelayMs);
      }}
      onTouchEnd={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }}
    >
      <div className="flex gap-2">
        <div className="w-9 shrink-0">
          {groupedWithPrevious ? <span className="block h-9 w-9" /> : avatarNode}
        </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {!groupedWithPrevious ? (
                  <div className="mb-0 flex items-baseline gap-2">
                    <a
                      href={profileLink || '#'}
                      className={`truncate text-left text-sm font-semibold ${theme.senderAccent} hover:underline`}
                      {...usernameHoverProps(menuUser)}
                    >
                      @{author}
                    </a>
                    <span className="font-mono text-[10px] opacity-75">{timestamp}</span>
                  </div>
                ) : null}
                <div
                  tabIndex={0}
                  className="relative rounded-xl px-0.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1"
                  onMouseOver={() => {
                    if (canHoverForReactions) {
                      openReactionPicker();
                    }
                  }}
                  onMouseLeave={(event) => {
                    if (canHoverForReactions) {
                      scheduleCloseReactionPicker(event);
                    }
                  }}
                  onClick={(event) => {
                    if (canHoverForReactions) return;
                    if (event.target?.closest?.('a, button, [data-chat-no-user-menu="true"]')) return;
                    event.stopPropagation();
                    setReactionPickerOpen((open) => !open);
                  }}
                >
                  <p className={`whitespace-pre-wrap break-words ${ROOM_MESSAGE_TEXT_CLASS}`}>{renderMessageContent(displayContent)}</p>
                  {reactionsMarkup}
                </div>
                {timestamp ? <span className="mt-0.5 block text-[10px] font-mono opacity-60">{timestamp}</span> : null}
              </div>
              {adminActionsMarkup}
            </div>
          </div>
        </div>
      </article>
  );
}

export default memo(ChatMessageItem);
