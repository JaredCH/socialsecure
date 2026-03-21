import React, { useState, useEffect, useCallback, useRef } from 'react';
import { newsAPI } from '../../utils/api';

// ─── Tiny SVG sparkline ─────────────────────────────────────────────────────
function Sparkline({ data = [], direction = 'flat', width = 56, height = 22 }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(' ');

  const color = direction === 'up' ? '#16a34a' : direction === 'down' ? '#dc2626' : '#94a3b8';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

// ─── Single ticker card ─────────────────────────────────────────────────────
function TickerCard({ quote }) {
  if (!quote || quote.error) return null;

  const isUp = quote.direction === 'up';
  const isDown = quote.direction === 'down';
  const color = isUp ? 'text-green-600' : isDown ? 'text-red-600' : 'text-slate-500';
  const bgColor = isUp ? 'bg-green-50' : isDown ? 'bg-red-50' : 'bg-slate-50';
  const arrow = isUp ? '▲' : isDown ? '▼' : '';

  const formatPrice = (val) => {
    if (val == null) return '—';
    return val >= 1000
      ? val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : val.toFixed(2);
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-lg ${bgColor} px-3 py-1.5 min-w-0 transition-colors`}
      data-testid={`ticker-card-${quote.symbol}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-800 truncate">{quote.symbol}</span>
          <span className={`text-[10px] font-semibold ${color}`}>
            {arrow} {quote.changePercent != null ? `${quote.changePercent > 0 ? '+' : ''}${quote.changePercent}%` : ''}
          </span>
        </div>
        <span className="text-xs font-medium text-slate-700">{formatPrice(quote.price)}</span>
      </div>
      <Sparkline data={quote.sparkline} direction={quote.direction} />
    </div>
  );
}

// ─── Main ticker strip ──────────────────────────────────────────────────────
const REFRESH_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export default function StockTicker({ tickers = [], enabled = true }) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const fetchQuotes = useCallback(async () => {
    if (tickers.length === 0) return;
    try {
      setLoading(true);
      const { data } = await newsAPI.getStockQuotes(tickers);
      if (data?.quotes) setQuotes(data.quotes);
    } catch {
      // Silently fail — keep stale data
    } finally {
      setLoading(false);
    }
  }, [tickers]);

  useEffect(() => {
    if (!enabled || tickers.length === 0) {
      setQuotes([]);
      return;
    }

    fetchQuotes();
    intervalRef.current = setInterval(fetchQuotes, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [enabled, tickers, fetchQuotes]);

  if (!enabled || tickers.length === 0) return null;

  const validQuotes = quotes.filter((q) => !q.error);
  if (validQuotes.length === 0 && !loading) return null;

  return (
    <div
      className="border-b border-slate-200 px-4 py-2.5 lg:px-6"
      data-testid="stock-ticker-strip"
    >
      {loading && validQuotes.length === 0 ? (
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          <span className="text-xs text-slate-400">Loading tickers…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
          {validQuotes.map((q) => (
            <TickerCard key={q.symbol} quote={q} />
          ))}
        </div>
      )}
    </div>
  );
}
