import React, { useState } from 'react';

/**
 * SocialMonitorConfig
 *
 * UI panel for managing the user's list of monitored subreddits.
 *
 * Props:
 *   monitors  — array of { subreddit, minUpvotes, enabled } from NewsPreferences
 *   onAdd     — ({ subreddit, minUpvotes }) => Promise<void>
 *   onRemove  — (subreddit) => Promise<void>
 *   onToggle  — (subreddit, enabled) => Promise<void>
 *   onUpdate  — (subreddit, minUpvotes) => Promise<void>
 */
const SocialMonitorConfig = ({ monitors = [], onAdd, onRemove, onToggle, onUpdate }) => {
  const [subredditInput, setSubredditInput] = useState('');
  const [upvoteInput, setUpvoteInput] = useState('100');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    const sub = subredditInput.trim().toLowerCase().replace(/^r\//, '');
    if (!/^[a-z0-9_]{2,21}$/.test(sub)) {
      setError('Invalid subreddit name (2–21 chars, letters/numbers/underscores)');
      return;
    }
    const upvotes = Math.max(0, Math.min(100000, parseInt(upvoteInput, 10) || 100));
    setAdding(true);
    setError('');
    try {
      await onAdd({ subreddit: sub, minUpvotes: upvotes });
      setSubredditInput('');
      setUpvoteInput('100');
    } catch (e) {
      setError(e?.message || 'Failed to add monitor');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Reddit Monitors</h3>
        <p className="text-xs text-gray-400">
          Articles from these subreddits appear in your Social feed when they reach the minimum upvote threshold.
        </p>
      </div>

      {/* Add form */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">r/</span>
            <input
              type="text"
              value={subredditInput}
              onChange={(e) => setSubredditInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="subreddit"
              maxLength={21}
              className="w-full pl-7 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label="Subreddit name"
            />
          </div>
          <div className="w-24">
            <input
              type="number"
              value={upvoteInput}
              onChange={(e) => setUpvoteInput(e.target.value)}
              min={0}
              max={100000}
              placeholder="Min ▲"
              className="w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-center"
              aria-label="Minimum upvotes"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding}
            className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex-shrink-0"
          >
            {adding ? '…' : 'Add'}
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {/* Monitor list */}
      {monitors.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">No subreddits monitored yet.</p>
      ) : (
        <ul className="space-y-2">
          {monitors.map((m) => (
            <li
              key={m.subreddit}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50 ring-1 ring-gray-200"
            >
              <span className="flex-1 text-sm font-medium text-gray-800 truncate">r/{m.subreddit}</span>

              {/* Upvote threshold */}
              <input
                type="number"
                defaultValue={m.minUpvotes}
                min={0}
                max={100000}
                aria-label={`Minimum upvotes for r/${m.subreddit}`}
                className="w-20 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300 text-center"
                onBlur={(e) => {
                  const v = Math.max(0, Math.min(100000, parseInt(e.target.value, 10) || 0));
                  if (v !== m.minUpvotes) onUpdate && onUpdate(m.subreddit, v);
                }}
              />
              <span className="text-[10px] text-gray-400">▲ min</span>

              {/* Toggle */}
              <button
                onClick={() => onToggle && onToggle(m.subreddit, !m.enabled)}
                className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${
                  m.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                }`}
                aria-label={m.enabled ? 'Disable monitor' : 'Enable monitor'}
              >
                {m.enabled ? 'On' : 'Off'}
              </button>

              {/* Remove */}
              <button
                onClick={() => onRemove && onRemove(m.subreddit)}
                className="text-gray-300 hover:text-red-400 transition-colors"
                aria-label={`Remove r/${m.subreddit}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-gray-300 text-center">Max 10 monitors · Reddit public API</p>
    </div>
  );
};

export default SocialMonitorConfig;
