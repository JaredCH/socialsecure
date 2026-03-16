import React, { memo, useEffect, useRef, useState } from 'react';

const LINK_REGEX = /(https?:\/\/[^\s]+)/gi;
const TRAILING_PUNCTUATION_REGEX = /[),.!?;:]+$/;
const HEX_COLOR_REGEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const DEFAULT_LONG_PRESS_DELAY_MS = 550;
const LINK_PREVIEW_PERCENTAGE = 0.25;

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
  isOwnMessage,
  currentUserId,
  theme,
  onOpenUserMenu,
  reactionsByType = {},
  reactionOptions = [],
  onToggleReaction,
  longPressDelayMs = DEFAULT_LONG_PRESS_DELAY_MS
}) {
  const author = message.userId?.username || message.userId?.realName || 'user';
  const usernameForProfileLink = typeof message.userId?.username === 'string' ? message.userId.username.trim() : '';
  const profileLink = usernameForProfileLink ? `/social?user=${encodeURIComponent(usernameForProfileLink)}` : null;
  const createdAt = message.createdAt ? new Date(message.createdAt) : null;
  const timestamp = createdAt ? createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const fullTimestamp = createdAt ? createdAt.toLocaleString() : '';
  const senderNameColor = HEX_COLOR_REGEX.test(String(message.senderNameColor || ''))
    ? String(message.senderNameColor)
    : null;
  const senderNameStyle = senderNameColor
    ? {
      color: senderNameColor,
      textShadow: '0 0 1px rgba(15, 23, 42, 0.95), 0 0 1px rgba(248, 250, 252, 0.85)'
    }
    : {
      textShadow: '0 0 1px rgba(15, 23, 42, 0.4)'
    };
  const longPressTimerRef = useRef(null);
  const normalizedCurrentUserId = String(currentUserId || '');
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const menuUser = message.userId?._id ? {
    _id: message.userId._id,
    username: message.userId.username,
    realName: message.userId.realName
  } : null;

  useEffect(() => () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const triggerUserMenu = (event, point) => {
    if (!menuUser || typeof onOpenUserMenu !== 'function') return;
    if (event?.target?.closest('a, [data-chat-no-user-menu="true"]')) return;
    onOpenUserMenu(event, menuUser, point);
  };

  return (
    <article
      className={`group flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
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
      <div className={`flex max-w-[94%] items-end gap-1.5 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
        {profileLink ? (
          <a
            href={profileLink}
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 ${theme.subtle}`}
            aria-label={isOwnMessage ? 'View your social profile' : `View @${author} social profile`}
          >
            {(isOwnMessage ? 'Y' : author).slice(0, 1).toUpperCase()}
          </a>
        ) : (
          <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${theme.subtle}`}>
            {(isOwnMessage ? 'Y' : author).slice(0, 1).toUpperCase()}
          </span>
        )}
        <div
          tabIndex={0}
          className={[
            'relative rounded-2xl px-2.5 py-1.5 shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1',
            isOwnMessage ? theme.messageOwn : theme.messageOther
          ].join(' ')}
        >
          <header className="mb-0.5 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-normal">
            <span className="truncate" style={senderNameStyle}>
              <button
                type="button"
                className="truncate text-left text-[11px] font-bold normal-case hover:opacity-80"
                onClick={(event) => triggerUserMenu(event)}
                onContextMenu={(event) => triggerUserMenu(event)}
              >
                {isOwnMessage ? 'You' : `@${author}`}
              </button>
            </span>
            <span className="font-mono text-[10px] opacity-75">{timestamp}</span>
          </header>
          <p className="whitespace-pre-wrap break-words text-[13px] leading-5">{renderMessageContent(message.content)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] opacity-70">
            <span className="font-mono">{fullTimestamp}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
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
            <div className="relative">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setReactionPickerOpen((open) => !open);
                }}
                data-chat-no-user-menu="true"
                className="rounded-full border px-1 py-0.5 text-[10px] opacity-75 hover:opacity-100"
                aria-label="Open reaction picker"
                title="Add reaction"
              >
                😊
              </button>
              {reactionPickerOpen ? (
                <div
                  className={[
                    'absolute bottom-full z-20 mb-1 flex items-center gap-1 rounded border px-1 py-1 text-[10px] shadow-sm',
                    isOwnMessage ? 'right-0' : 'left-0',
                    theme.subtle
                  ].join(' ')}
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
                      className="rounded border px-1 py-0.5 text-[10px] hover:opacity-100"
                      aria-label={`Add ${reaction.label} reaction`}
                      title={reaction.label}
                    >
                      {reaction.emoji}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default memo(ChatMessageItem);
