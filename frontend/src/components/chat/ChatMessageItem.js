import React, { memo } from 'react';

function ChatMessageItem({ message, isOwnMessage, theme }) {
  const author = message.userId?.username || message.userId?.realName || 'user';
  const createdAt = message.createdAt ? new Date(message.createdAt) : null;
  const timestamp = createdAt ? createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const fullTimestamp = createdAt ? createdAt.toLocaleString() : '';

  return (
    <article className={`group flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[88%] rounded-md border-2 px-3 py-2 shadow-sm transition-all duration-200',
          isOwnMessage ? theme.messageOwn : theme.messageOther
        ].join(' ')}
      >
        <header className="mb-1 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wide">
          <span className="truncate">{isOwnMessage ? 'You' : `@${author}`}</span>
          <span className="font-mono text-[10px] opacity-75">{timestamp}</span>
        </header>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
        <div className="mt-1 flex items-center justify-between text-[10px] opacity-0 transition-opacity duration-200 group-hover:opacity-80">
          <span className="font-mono">{fullTimestamp}</span>
          <span className="rounded border px-1 leading-4 font-mono">Reactions soon</span>
        </div>
      </div>
    </article>
  );
}

export default memo(ChatMessageItem);
