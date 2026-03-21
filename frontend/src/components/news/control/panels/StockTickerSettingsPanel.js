import React, { useState, useEffect, useCallback } from 'react';
import { newsAPI } from '../../../../utils/api';

const MAX_TICKERS = 9;

const TYPE_LABELS = {
  EQUITY: 'Stock',
  CRYPTOCURRENCY: 'Crypto',
  ETF: 'ETF',
  INDEX: 'Index',
  CURRENCY: 'Currency',
  FUTURE: 'Futures',
};

export default function StockTickerSettingsPanel({
  tickers = [],
  enabled = false,
  onUpdatePreferences
}) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [statusMessage, setStatusMessage] = useState('');

  // Debounced search
  useEffect(() => {
    if (!query || query.trim().length < 1) {
      setSuggestions([]);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const { data } = await newsAPI.searchStocks(query.trim());
        if (!active) return;
        const filtered = (data?.results || []).filter(
          (r) => !tickers.includes(r.symbol)
        );
        setSuggestions(filtered);
      } catch {
        if (!active) return;
        setSuggestions([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, tickers]);

  const handleToggleEnabled = useCallback(() => {
    onUpdatePreferences({ stockTickersEnabled: !enabled });
    setStatusMessage(!enabled ? 'Tickers enabled' : 'Tickers disabled');
    setTimeout(() => setStatusMessage(''), 2000);
  }, [enabled, onUpdatePreferences]);

  const handleAddTicker = useCallback((symbol) => {
    if (tickers.length >= MAX_TICKERS) {
      setStatusMessage(`Maximum ${MAX_TICKERS} tickers allowed`);
      setTimeout(() => setStatusMessage(''), 2000);
      return;
    }
    if (tickers.includes(symbol)) return;

    const updated = [...tickers, symbol];
    onUpdatePreferences({ stockTickers: updated, stockTickersEnabled: true });
    setQuery('');
    setSuggestions([]);
    setStatusMessage(`Added ${symbol}`);
    setTimeout(() => setStatusMessage(''), 2000);
  }, [tickers, onUpdatePreferences]);

  const handleRemoveTicker = useCallback((symbol) => {
    const updated = tickers.filter((t) => t !== symbol);
    onUpdatePreferences({ stockTickers: updated });
    setStatusMessage(`Removed ${symbol}`);
    setTimeout(() => setStatusMessage(''), 2000);
  }, [tickers, onUpdatePreferences]);

  return (
    <div className="space-y-5" data-testid="stock-ticker-settings">
      {/* Enable/disable toggle */}
      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
        <div>
          <div className="text-sm font-medium text-slate-900">Show Market Tickers</div>
          <div className="text-xs text-slate-500">Display stocks, crypto, currencies, metals & commodities</div>
        </div>
        <button
          onClick={handleToggleEnabled}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
            enabled ? 'bg-indigo-600' : 'bg-slate-300'
          }`}
          role="switch"
          aria-checked={enabled}
          data-testid="stock-ticker-toggle"
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Current tickers list */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Your Tickers ({tickers.length}/{MAX_TICKERS})
          </span>
        </div>
        {tickers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
            No tickers added yet. Search below to add stocks, crypto, currencies, metals, or commodities.
          </p>
        ) : (
          <div className="space-y-1.5">
            {tickers.map((symbol) => (
              <div
                key={symbol}
                className="flex items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200 hover:ring-slate-300 transition-colors"
                data-testid={`ticker-item-${symbol}`}
              >
                <span className="text-sm font-semibold text-slate-800">{symbol}</span>
                <button
                  onClick={() => handleRemoveTicker(symbol)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                  aria-label={`Remove ${symbol}`}
                  data-testid={`ticker-remove-${symbol}`}
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search and add */}
      {tickers.length < MAX_TICKERS && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Add Ticker
          </label>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stocks, crypto, currencies, gold, oil…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              data-testid="stock-ticker-search"
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              </div>
            )}
          </div>

          {/* Suggestions dropdown */}
          {suggestions.length > 0 && (
            <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg" data-testid="stock-ticker-suggestions">
              {suggestions.map((item) => (
                <button
                  key={item.symbol}
                  onClick={() => handleAddTicker(item.symbol)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-indigo-50 transition-colors"
                  data-testid={`ticker-suggestion-${item.symbol}`}
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800">{item.symbol}</span>
                    <span className="ml-2 truncate text-xs text-slate-500">{item.name}</span>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-400 uppercase">{TYPE_LABELS[item.type] || item.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Status message */}
      {statusMessage && (
        <div className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700" data-testid="stock-ticker-status">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
