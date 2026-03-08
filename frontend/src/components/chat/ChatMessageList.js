import React, { useEffect, useMemo, useRef, useState } from 'react';
import ChatMessageItem from './ChatMessageItem';

const INITIAL_RENDER_COUNT = 80;
const LOAD_MORE_STEP = 80;

function ChatMessageList({
  conversationId,
  messages,
  loading,
  profile,
  theme
}) {
  const scrollRef = useRef(null);
  const [renderCount, setRenderCount] = useState(INITIAL_RENDER_COUNT);

  useEffect(() => {
    setRenderCount(INITIAL_RENDER_COUNT);
  }, [conversationId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, loading]);

  const visibleMessages = useMemo(
    () => messages.slice(Math.max(messages.length - renderCount, 0)),
    [messages, renderCount]
  );

  const hasOlderMessages = visibleMessages.length < messages.length;

  return (
    <div className={`relative flex-1 min-h-0 overflow-hidden rounded-xl border ${theme.messagesShell}`}>
      <div ref={scrollRef} className="h-full overflow-y-auto px-2 py-1.5 space-y-1 [scrollbar-gutter:stable]">
        {hasOlderMessages ? (
          <div className="sticky top-0 z-10 flex justify-center pb-2">
            <button
              type="button"
              onClick={() => setRenderCount((count) => count + LOAD_MORE_STEP)}
              className={`rounded border px-3 py-1 text-xs font-semibold backdrop-blur ${theme.subtle}`}
            >
              Load earlier messages
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm opacity-80">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-sm opacity-80">No messages yet.</p>
        ) : (
          visibleMessages.map((message) => (
            <ChatMessageItem
              key={String(message._id)}
              message={message}
              isOwnMessage={String(message.userId?._id) === String(profile?._id)}
              theme={theme}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default ChatMessageList;
