import React, { useEffect, useMemo, useRef, useState } from 'react';
import ChatMessageItem from './ChatMessageItem';

const INITIAL_RENDER_COUNT = 10;
const LOAD_MORE_STEP = 10;

function ChatMessageList({
  conversationId,
  messages,
  loading,
  profile,
  theme,
  onOpenUserMenu,
  reactionsByMessageId,
  reactionOptions,
  onToggleReaction,
  longPressDelayMs,
  onVisibleMessageIdsChange,
  hasMoreMessages,
  onLoadOlderMessages
}) {
  const scrollRef = useRef(null);
  const previousConversationIdRef = useRef(String(conversationId || ''));
  const previousMessageCountRef = useRef(messages.length);
  const [renderCount, setRenderCount] = useState(INITIAL_RENDER_COUNT);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);

  useEffect(() => {
    setRenderCount(INITIAL_RENDER_COUNT);
  }, [conversationId]);

  const visibleMessages = useMemo(
    () => messages.slice(Math.max(messages.length - renderCount, 0)),
    [messages, renderCount]
  );

  const hasOlderMessages = visibleMessages.length < messages.length;

  useEffect(() => {
    if (typeof onVisibleMessageIdsChange !== 'function') return;
    onVisibleMessageIdsChange(visibleMessages.map((message) => String(message?._id || '')).filter(Boolean));
  }, [onVisibleMessageIdsChange, visibleMessages]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const currentConversationId = String(conversationId || '');
    const conversationChanged = previousConversationIdRef.current !== currentConversationId;
    const grew = messages.length > previousMessageCountRef.current;
    const nearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) <= 80;

    if (conversationChanged || (grew && nearBottom)) {
      container.scrollTop = container.scrollHeight;
    }

    previousConversationIdRef.current = currentConversationId;
    previousMessageCountRef.current = messages.length;
  }, [conversationId, messages.length]);

  return (
    <div className={`relative flex-1 min-h-0 overflow-hidden rounded-xl border ${theme.messagesShell}`}>
      <div
        ref={scrollRef}
        onScroll={async (event) => {
          const target = event.currentTarget;
          if (loading) return;
          if (target.scrollTop <= 48) {
            if (hasOlderMessages) {
              setRenderCount((count) => count + LOAD_MORE_STEP);
              return;
            }
            if (hasMoreMessages && typeof onLoadOlderMessages === 'function' && !loadingOlderMessages) {
              setLoadingOlderMessages(true);
              try {
                const loadedCount = await onLoadOlderMessages();
                if (Number.isFinite(loadedCount) && loadedCount > 0) {
                  setRenderCount((count) => count + loadedCount);
                }
              } finally {
                setLoadingOlderMessages(false);
              }
            }
          }
        }}
        className="h-full overflow-y-auto px-2 py-1.5 space-y-1 [scrollbar-gutter:stable]"
      >
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
        {!hasOlderMessages && hasMoreMessages ? (
          <div className="sticky top-0 z-10 flex justify-center pb-2">
            <span className={`rounded border px-3 py-1 text-xs font-semibold backdrop-blur ${theme.subtle}`}>
              {loadingOlderMessages ? 'Loading earlier messages...' : 'Scroll up to load earlier messages'}
            </span>
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
              currentUserId={profile?._id}
              theme={theme}
              onOpenUserMenu={onOpenUserMenu}
              reactionsByType={reactionsByMessageId?.[String(message._id)] || {}}
              reactionOptions={reactionOptions}
              onToggleReaction={onToggleReaction}
              longPressDelayMs={longPressDelayMs}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default ChatMessageList;
