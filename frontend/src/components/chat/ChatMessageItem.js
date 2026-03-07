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
  const createdAt = message.createdAt ? new Date(message.createdAt) : null;
  const timestamp = createdAt ? createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const fullTimestamp = createdAt ? createdAt.toLocaleString() : '';
  const senderNameColor = HEX_COLOR_REGEX.test(String(message.senderNameColor || ''))
    ? String(message.senderNameColor)
    : null;

  return (
    <article className={`group flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[88%] rounded-md border-2 px-1 py-0.5 shadow-sm transition-all duration-200',
          isOwnMessage ? theme.messageOwn : theme.messageOther
        ].join(' ')}
      >
        <header className="mb-1 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wide">
          <span className="truncate" style={senderNameColor ? { color: senderNameColor } : undefined}>
            {isOwnMessage ? 'You' : `@${author}`}
          </span>
          <span className="font-mono text-[10px] opacity-75">{timestamp}</span>
        </header>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{renderMessageContent(message.content)}</p>
        <div className="mt-1 flex items-center justify-between text-[10px] opacity-0 transition-opacity duration-200 group-hover:opacity-80">
          <span className="font-mono">{fullTimestamp}</span>
          <span className="rounded border px-1 leading-4 font-mono">Reactions soon</span>
        </div>
      </div>
    </article>
  );
}

export default memo(ChatMessageItem);
