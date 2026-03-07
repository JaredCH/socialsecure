import React, { useEffect, useRef, useState } from 'react';

const QUICK_EMOJIS = ['😀', '🔥', '✨', '❤️', '👏'];

function ChatComposerBar({
  composerValue,
  setComposerValue,
  onSubmit,
  disabled,
  sending,
  theme
}) {
  const textAreaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [showEmojiTray, setShowEmojiTray] = useState(false);

  useEffect(() => {
    if (!textAreaRef.current) return;
    textAreaRef.current.style.height = 'auto';
    textAreaRef.current.style.height = `${Math.min(textAreaRef.current.scrollHeight, 160)}px`;
  }, [composerValue]);

  const handleAttachmentClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  return (
    <form onSubmit={onSubmit} className={`relative rounded-md border-2 p-2 ${theme.panelGlass}`}>
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => setShowEmojiTray((value) => !value)}
          className={`rounded border px-2 py-2 text-sm transition active:scale-95 ${theme.subtle}`}
          aria-label="Open emoji picker"
          disabled={disabled}
        >
          😊
        </button>

        <button
          type="button"
          onClick={handleAttachmentClick}
          className={`rounded border px-2 py-2 text-sm transition active:scale-95 ${theme.subtle}`}
          aria-label="Attach file"
          disabled={disabled}
        >
          📎
        </button>

        <textarea
          ref={textAreaRef}
          className={`max-h-40 min-h-[44px] flex-1 resize-none rounded border px-3 py-2 text-sm leading-5 ${theme.input}`}
          value={composerValue}
          onChange={(event) => setComposerValue(event.target.value)}
          maxLength={2000}
          disabled={disabled}
          rows={1}
          placeholder={disabled ? 'Choose a conversation to message' : 'Type your message'}
        />

        <button
          type="submit"
          disabled={disabled || !composerValue.trim() || sending}
          className={`rounded px-4 py-2 text-sm font-semibold transition duration-150 active:scale-95 disabled:opacity-50 ${theme.accent}`}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>

      {showEmojiTray && !disabled ? (
        <div className={`absolute bottom-14 left-2 rounded border p-1 shadow-xl ${theme.panelGlass}`}>
          <div className="flex gap-1">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="rounded px-2 py-1 text-lg hover:scale-110"
                onClick={() => {
                  setComposerValue((value) => `${value}${emoji}`);
                  setShowEmojiTray(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) {
            setComposerValue((value) => `${value}${value ? ' ' : ''}[${event.target.files[0].name}]`);
          }
        }}
      />
    </form>
  );
}

export default ChatComposerBar;
