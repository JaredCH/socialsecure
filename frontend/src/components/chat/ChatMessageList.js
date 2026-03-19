import React, { useEffect, useMemo, useRef, useState } from 'react';
import ChatMessageItem from './ChatMessageItem';

const INITIAL_RENDER_COUNT = 10;
const LOAD_MORE_STEP = 10;
const SCROLL_NEAR_BOTTOM_THRESHOLD_PX = 96;

function ChatMessageList({
  conversationId,
  conversationType,
  messages,
  loading,
  profile,
  censorSensitiveWords,
  theme,
  onOpenUserMenu,
  reactionsByMessageId,
  reactionOptions,
  onToggleReaction,
  reactionsDisabled = false,
  longPressDelayMs,
  onVisibleMessageIdsChange,
  hasMoreMessages,
  onLoadOlderMessages,
  showAdminActions = false,
  adminMutedUserIds,
  adminProcessingMessageIds,
  adminProcessingUserIds,
  onToggleAdminMessageRemoval,
  onToggleAdminUserMute,
  onAdminDeleteMessage,
  onUsernameHoverStart,
  onUsernameHoverEnd,
  unreadDividerTimestamp = 0,
  highlightedMessageIds = {},
  readReceiptByMessageId = {}
}) {
  const scrollRef = useRef(null);
  const previousConversationIdRef = useRef(String(conversationId || ''));
  const previousMessageCountRef = useRef(messages.length);
  const stickToBottomRef = useRef(true);
  const [renderCount, setRenderCount] = useState(INITIAL_RENDER_COUNT);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);

  const isNearBottom = (container) => {
    if (!container) return true;
    return (container.scrollHeight - container.scrollTop - container.clientHeight) <= SCROLL_NEAR_BOTTOM_THRESHOLD_PX;
  };

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

    if (conversationChanged) {
      container.scrollTop = container.scrollHeight;
      stickToBottomRef.current = true;
    } else if (grew && stickToBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }

    previousConversationIdRef.current = currentConversationId;
    previousMessageCountRef.current = messages.length;
  }, [conversationId, messages.length]);

  const visibleMessagesWithGrouping = useMemo(() => (
    visibleMessages.map((message, index) => {
      const previousMessage = visibleMessages[index - 1];
      const nextMessage = visibleMessages[index + 1];
      const currentAuthorId = String(message?.userId?._id || '');
      const previousAuthorId = String(previousMessage?.userId?._id || '');
      const nextAuthorId = String(nextMessage?.userId?._id || '');
      const createdAtTs = new Date(message?.createdAt || 0).getTime();
      const previousTs = new Date(previousMessage?.createdAt || 0).getTime();
      const nextTs = new Date(nextMessage?.createdAt || 0).getTime();
      const groupedWithPrevious = Boolean(
        previousMessage
        && currentAuthorId
        && currentAuthorId === previousAuthorId
        && Number.isFinite(createdAtTs)
        && Number.isFinite(previousTs)
        && (createdAtTs - previousTs) <= (5 * 60 * 1000)
      );
      const groupedWithNext = Boolean(
        nextMessage
        && currentAuthorId
        && currentAuthorId === nextAuthorId
        && Number.isFinite(createdAtTs)
        && Number.isFinite(nextTs)
        && (nextTs - createdAtTs) <= (5 * 60 * 1000)
      );

      return {
        message,
        groupedWithPrevious,
        groupedWithNext
      };
    })
  ), [visibleMessages]);
  const unreadDividerIndex = useMemo(() => {
    if (!Number.isFinite(unreadDividerTimestamp) || unreadDividerTimestamp <= 0) return -1;
    return visibleMessagesWithGrouping.findIndex(({ message }) => {
      const messageTs = new Date(message?.createdAt || 0).getTime();
      return Number.isFinite(messageTs) && messageTs > unreadDividerTimestamp;
    });
  }, [unreadDividerTimestamp, visibleMessagesWithGrouping]);

  return (
    <div className={`relative flex-1 min-h-0 overflow-hidden rounded-2xl ${theme.messagesShell}`}>
      <div
        ref={scrollRef}
        onScroll={async (event) => {
          const target = event.currentTarget;
          if (loading) return;
          stickToBottomRef.current = isNearBottom(target);
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
        className="h-full overflow-y-auto px-3 py-3 [scrollbar-gutter:stable]"
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
          <div className="space-y-3" aria-busy="true" aria-label="Loading messages">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={`skeleton-${i}`} className="flex items-start gap-2 animate-pulse">
                <span className={`inline-block h-8 w-8 shrink-0 rounded-full ${theme.subtle}`} />
                <div className="flex-1 space-y-1.5">
                  <div className={`h-3 rounded ${theme.subtle}`} style={{ width: `${40 + (i * 7) % 40}%` }} />
                  <div className={`h-3 rounded ${theme.subtle}`} style={{ width: `${55 + (i * 11) % 30}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 opacity-60">
            <span className="text-3xl">💬</span>
            <p className="mt-2 text-sm">No messages yet.</p>
            <p className="mt-1 text-[11px] opacity-70">Start the conversation by typing below.</p>
          </div>
        ) : (
          visibleMessagesWithGrouping.map(({ message, groupedWithPrevious, groupedWithNext }) => {
            const messageTs = new Date(message?.createdAt || 0).getTime();
            const shouldShowUnreadDivider = unreadDividerIndex >= 0
              && String(visibleMessagesWithGrouping[unreadDividerIndex]?.message?._id || '') === String(message?._id || '')
              && Number.isFinite(messageTs)
              && messageTs > unreadDividerTimestamp;
            return (
              <React.Fragment key={String(message._id)}>
                {shouldShowUnreadDivider ? (
                  <div className="my-2 flex items-center gap-2" data-testid="chat-unread-divider">
                    <span className={`h-px flex-1 ${theme.subtle}`} />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-75">New Messages Below</span>
                    <span className={`h-px flex-1 ${theme.subtle}`} />
                  </div>
                ) : null}
                <ChatMessageItem
                  message={message}
                  conversationType={conversationType}
                  groupedWithPrevious={groupedWithPrevious}
                  groupedWithNext={groupedWithNext}
                  isOwnMessage={String(message.userId?._id) === String(profile?._id)}
                  currentUserId={profile?._id}
                  censorSensitiveWords={censorSensitiveWords}
                  theme={theme}
                  onOpenUserMenu={onOpenUserMenu}
                  reactionsByType={reactionsByMessageId?.[String(message._id)] || {}}
                  reactionOptions={reactionOptions}
                  onToggleReaction={onToggleReaction}
                  reactionsDisabled={reactionsDisabled}
                  longPressDelayMs={longPressDelayMs}
                  showAdminActions={showAdminActions}
                  adminMutedUserIds={adminMutedUserIds}
                  adminProcessingMessageIds={adminProcessingMessageIds}
                  adminProcessingUserIds={adminProcessingUserIds}
                  onToggleAdminMessageRemoval={onToggleAdminMessageRemoval}
                  onToggleAdminUserMute={onToggleAdminUserMute}
                  onAdminDeleteMessage={onAdminDeleteMessage}
                  onUsernameHoverStart={onUsernameHoverStart}
                  onUsernameHoverEnd={onUsernameHoverEnd}
                  highlighted={Boolean(highlightedMessageIds[String(message?._id || '')])}
                  readReceipt={readReceiptByMessageId[String(message?._id || '')] || ''}
                />
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ChatMessageList;
