import React, { useEffect, useRef, useState } from 'react';

const QUICK_EMOJIS = ['😀', '🔥', '✨', '❤️', '👏'];

function ChatComposerBar({
  composerValue,
  setComposerValue,
  onSubmit,
  disabled,
  sending,
  theme,
  onComposerError
}) {
  const textAreaRef = useRef(null);
  const [showEmojiTray, setShowEmojiTray] = useState(false);
  const [showLinkTray, setShowLinkTray] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');

  useEffect(() => {
    if (!textAreaRef.current) return;
    textAreaRef.current.style.height = 'auto';
    textAreaRef.current.style.height = `${Math.min(textAreaRef.current.scrollHeight, 160)}px`;
  }, [composerValue]);

  useEffect(() => {
    if (!disabled) return;
    setShowEmojiTray(false);
    setShowLinkTray(false);
  }, [disabled]);

  const insertLinkToken = () => {
    const trimmedUrl = linkUrl.trim();
    if (!trimmedUrl) return;

    let normalizedUrl = trimmedUrl;
    try {
      const parsed = new URL(trimmedUrl);
      if (!/^https?:$/i.test(parsed.protocol)) {
        throw new Error('Only HTTP(S) links are supported');
      }
      normalizedUrl = parsed.toString();
    } catch {
      if (typeof onComposerError === 'function') {
        onComposerError('Enter a valid http:// or https:// URL');
      }
      return;
    }

    const shortName = linkLabel.trim().replace(/[\[\]()]/g, '').slice(0, 80);
    const linkToken = shortName ? `[${shortName}](${normalizedUrl})` : normalizedUrl;
    setComposerValue((value) => {
      const prefix = value && !/\s$/.test(value) ? `${value} ` : value;
      return `${prefix}${linkToken}`;
    });
    setShowLinkTray(false);
    setLinkUrl('');
    setLinkLabel('');
  };

  return (
    <form onSubmit={onSubmit} className={`relative rounded-xl border p-1.5 ${theme.panelGlass}`}>
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => setShowEmojiTray((value) => !value)}
          className={`rounded border px-2 py-1.5 text-sm transition active:scale-95 ${theme.subtle}`}
          aria-label="Open emoji picker"
          disabled={disabled}
        >
          😊
        </button>

        <button
          type="button"
          onClick={() => setShowLinkTray((value) => !value)}
          className={`rounded border px-2 py-1.5 text-sm transition active:scale-95 ${theme.subtle}`}
          aria-label="Open URL formatter"
          disabled={disabled}
        >
          🔗
        </button>

        <textarea
          ref={textAreaRef}
          className={`max-h-36 min-h-[40px] flex-1 resize-none rounded border px-2.5 py-1.5 text-sm leading-5 ${theme.input}`}
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
          className={`rounded px-3 py-1.5 text-sm font-semibold transition duration-150 active:scale-95 disabled:opacity-50 ${theme.accent}`}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>

      {showEmojiTray && !disabled ? (
        <div className={`absolute bottom-12 left-1 rounded border p-1 shadow-xl ${theme.panelGlass}`}>
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
      {showLinkTray && !disabled ? (
        <div className={`absolute bottom-12 left-12 w-64 rounded border p-2 text-xs shadow-xl ${theme.panelGlass}`}>
          <label className="mb-1 block font-semibold" htmlFor="chat-link-url-input">Paste URL</label>
          <input
            id="chat-link-url-input"
            type="url"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://example.com/page"
            className={`mb-2 w-full rounded border px-2 py-1 ${theme.input}`}
          />
          <label className="mb-1 block font-semibold" htmlFor="chat-link-short-name">Short name (optional)</label>
          <input
            id="chat-link-short-name"
            type="text"
            value={linkLabel}
            onChange={(event) => setLinkLabel(event.target.value)}
            placeholder="Reference"
            className={`mb-2 w-full rounded border px-2 py-1 ${theme.input}`}
            maxLength={80}
          />
          <button
            type="button"
            onClick={insertLinkToken}
            className={`w-full rounded border px-2 py-1 font-semibold ${theme.subtle}`}
          >
            Insert link
          </button>
        </div>
      ) : null}
    </form>
  );
}

export default ChatComposerBar;
