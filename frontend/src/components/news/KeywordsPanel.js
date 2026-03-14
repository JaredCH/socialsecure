import React, { useState } from 'react';

/**
 * KeywordsPanel — manage followed keywords within SettingsDrawer.
 *
 * Props:
 *   keywords        {Array}    — [string]
 *   onAddKeyword    {Function} — (kw) => void
 *   onRemoveKeyword {Function} — (kw) => void
 */
export default function KeywordsPanel({ keywords = [], onAddKeyword, onRemoveKeyword }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleAdd = () => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return;
    if (keywords.includes(trimmed)) { setError('Keyword already added.'); return; }
    if (keywords.length >= 50) { setError('Maximum 50 keywords reached.'); return; }
    setError('');
    onAddKeyword?.(trimmed);
    setInput('');
  };

  return (
    <div className="p-4 space-y-4">
      {/* Info callout */}
      <div className="flex gap-2 bg-purple-50 border border-purple-200 rounded-xl p-3">
        <span className="material-symbols-outlined text-purple-500 text-xl leading-none shrink-0 mt-0.5">info</span>
        <p className="text-xs text-purple-700 leading-relaxed">
          Articles containing your keywords (published within the last 16 hours) are automatically promoted to the top of all views — including category-specific feeds.
        </p>
      </div>

      {/* Add input */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Add a keyword</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. climate, AI, elections…"
            maxLength={80}
            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
          />
          <button
            onClick={handleAdd}
            disabled={!input.trim()}
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-xl font-medium disabled:opacity-40 hover:bg-purple-700 transition-colors"
          >
            Add
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      {/* Keyword list */}
      {keywords.length === 0 ? (
        <div className="py-8 flex flex-col items-center gap-2 text-gray-400">
          <span className="material-symbols-outlined text-4xl">manage_search</span>
          <p className="text-sm">No keywords yet</p>
        </div>
      ) : (
        <div>
          <p className="text-xs text-gray-500 mb-2">{keywords.length} keyword{keywords.length !== 1 ? 's' : ''}</p>
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-3 py-1 text-sm font-medium"
              >
                {kw}
                <button
                  aria-label={`Remove keyword ${kw}`}
                  onClick={() => onRemoveKeyword?.(kw)}
                  className="ml-0.5 hover:text-red-500 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm leading-none">close</span>
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
