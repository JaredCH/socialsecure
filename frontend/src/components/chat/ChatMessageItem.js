import React, { memo } from 'react';

const LINK_REGEX = /(https?:\/\/[^\s]+)/gi;
const TRAILING_PUNCTUATION_REGEX = /[),.!?;:]+$/;
const HEX_COLOR_REGEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

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

const renderMessageContent = (content) => {
  const text = String(content || '');
  if (!text) return null;

  const parts = text.split(LINK_REGEX);
  return parts.map((part, index) => {
    if (!part) return null;
    if (!/^https?:\/\//i.test(part)) {
      return <React.Fragment key={`text-${index}`}>{part}</React.Fragment>;
    }
    const { link, trailing } = extractLinkToken(part);
    if (!link) {
      return <React.Fragment key={`text-${index}`}>{part}</React.Fragment>;
    }
    return (
      <React.Fragment key={`link-${index}`}>
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
          {link}
        </a>
        {trailing}
      </React.Fragment>
    );
  });
};

function ChatMessageItem({ message, isOwnMessage, theme }) {
  const author = message.userId?.username || message.userId?.realName || 'user';
  const profileLink = message.userId?.username ? `/social/${encodeURIComponent(message.userId.username)}` : null;
  const createdAt = message.createdAt ? new Date(message.createdAt) : null;
  const timestamp = createdAt ? createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const fullTimestamp = createdAt ? createdAt.toLocaleString() : '';
  const senderNameColor = HEX_COLOR_REGEX.test(String(message.senderNameColor || ''))
    ? String(message.senderNameColor)
    : null;

  return (
    <article className={`group flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[94%] items-end gap-0.5 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
        {profileLink ? (
          <a
            href={profileLink}
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 ${theme.subtle}`}
            aria-label={isOwnMessage ? 'View your social profile' : `View @${author} social profile`}
          >
            {(isOwnMessage ? 'Y' : author).slice(0, 1).toUpperCase()}
          </a>
        ) : (
          <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${theme.subtle}`}>
            {(isOwnMessage ? 'Y' : author).slice(0, 1).toUpperCase()}
          </span>
        )}
        <div
          tabIndex={0}
          className={[
            'relative rounded-xl border px-1.5 py-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1',
            isOwnMessage ? theme.messageOwn : theme.messageOther
          ].join(' ')}
        >
          <header className="mb-0 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-normal">
            <span className="truncate" style={senderNameColor ? { color: senderNameColor } : undefined}>
              {isOwnMessage ? 'You' : `@${author}`}
            </span>
            <span className="font-mono text-[10px] opacity-75">{timestamp}</span>
          </header>
          <p className="whitespace-pre-wrap break-words text-[13px] leading-4">{renderMessageContent(message.content)}</p>
          <div className={`absolute right-1 top-full z-10 mt-0.5 hidden items-center gap-2 rounded border px-1 py-0.5 text-[10px] opacity-95 shadow-sm group-hover:flex group-focus-within:flex ${theme.subtle}`}>
            <span className="font-mono">{fullTimestamp}</span>
            <button
              type="button"
              className="rounded border px-1 leading-3 font-mono disabled:opacity-60"
              aria-label="React with thumbs up"
              disabled
              title="Reactions coming soon"
            >
              👍
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default memo(ChatMessageItem);
