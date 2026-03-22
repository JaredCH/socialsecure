import React, { useState, useEffect, useCallback, useRef } from 'react';
import { newsAPI } from '../../utils/api';

// ─── Utilities ──────────────────────────────────────────────────────────────
function cleanCompanyName(name, symbol) {
  if (!name) return symbol;
  let clean = name;
  // Strip common crypto suffixes
  if (clean.toUpperCase().endsWith(' USD')) clean = clean.slice(0, -4);
  // Strip corporate suffixes
  clean = clean.replace(/\b(Inc\.?|Corp\.?|Corporation|Ltd\.?|PLC|LLC|LC|Co\.?|Company|Holdings?|Group)\b/gi, '').trim();
  // Strip leftover trailing commas or dots
  clean = clean.replace(/[,.\-\s]+$/, '').trim();
  return clean || symbol;
}

// ─── Tiny SVG sparkline ─────────────────────────────────────────────────────
function Sparkline({ data = [], direction = 'flat', width = 64, height = 24, className = '' }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(' ');

  // Use currentColor so parent text classes dictate stroke color
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={`shrink-0 ${className}`} aria-hidden="true">
      <polyline
        fill="none"
        stroke="currentColor"
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
  
  // Modern gradient styles
  const baseClasses = 'relative flex flex-col justify-between overflow-hidden rounded-[14px] border p-3 w-[150px] lg:w-auto shrink-0 transition-shadow snap-start';
  const colorScheme = isUp 
    ? 'bg-gradient-to-br from-green-50 to-white border-green-200/60 shadow-[0_2px_8px_-3px_rgba(22,163,74,0.15)] hover:shadow-[0_4px_12px_-4px_rgba(22,163,74,0.25)]' 
    : isDown 
      ? 'bg-gradient-to-br from-red-50 to-white border-red-200/60 shadow-[0_2px_8px_-3px_rgba(220,38,38,0.15)] hover:shadow-[0_4px_12px_-4px_rgba(220,38,38,0.25)]' 
      : 'bg-gradient-to-br from-slate-50 to-white border-slate-200/60 shadow-[0_2px_8px_-3px_rgba(148,163,184,0.15)] hover:shadow-[0_4px_12px_-4px_rgba(148,163,184,0.25)]';

  const iconColor = isUp ? 'text-green-600' : isDown ? 'text-red-600' : 'text-slate-500';
  const SparklineColor = isUp ? 'text-green-500 opacity-25' : isDown ? 'text-red-500 opacity-25' : 'text-slate-400 opacity-25';
  const arrow = isUp ? 'trending_up' : isDown ? 'trending_down' : 'remove';

  const formatPrice = (val) => {
    if (val == null) return '—';
    return val >= 1000
      ? val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : val.toFixed(2);
  };

  const cleanedName = cleanCompanyName(quote.name, quote.symbol);

  return (
    <div className={`${baseClasses} ${colorScheme}`} data-testid={`ticker-card-${quote.symbol}`}>
      {/* Background Sparkline positioning */}
      <div className={`absolute -bottom-1 -right-1 pointer-events-none ${SparklineColor}`}>
        <Sparkline data={quote.sparkline} direction={quote.direction} width={80} height={32} />
      </div>

      <div className="relative z-10 flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 truncate pr-2" title={quote.name || quote.symbol}>
            {cleanedName}
          </span>
          {quote.name && quote.name !== quote.symbol && (
            <span className="text-[9px] font-bold tracking-wider text-slate-400 bg-slate-100/50 px-1 py-0.5 rounded uppercase">
              {quote.symbol}
            </span>
          )}
        </div>
        
        <div className="flex items-end justify-between mt-1.5">
          <span className="text-sm font-extrabold tracking-tight text-slate-900">
            {formatPrice(quote.price)}
          </span>
          <div className="flex items-center gap-0.5 border bg-white/60 backdrop-blur-sm rounded-full px-1.5 py-0.5" style={{ borderColor: 'inherit' }}>
            <span className={`material-symbols-outlined text-[10px] ${iconColor}`} style={{ fontVariationSettings: "'FILL' 1" }}>
              {arrow}
            </span>
            <span className={`text-[10px] font-bold ${iconColor}`}>
              {quote.changePercent != null ? `${quote.direction !== 'flat' ? Math.abs(quote.changePercent) : '0'}%` : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ticker strip ──────────────────────────────────────────────────────
const REFRESH_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export default function StockTicker({ tickers = [], enabled = true }) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
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
    <div className="border-b border-slate-200 bg-slate-50/50" data-testid="stock-ticker-strip">
      {/* Header bar */}
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-slate-100/50 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px] text-slate-400">show_chart</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Markets</span>
        </div>
        <span className={`material-symbols-outlined text-base text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {/* Expandable content area */}
      <div 
        className={`grid transition-[grid-template-rows,padding,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          expanded ? 'grid-rows-[1fr] opacity-100 px-4 pb-4' : 'grid-rows-[0fr] opacity-0 px-4 pb-0'
        }`}
      >
        <div className="overflow-hidden">
          {loading && validQuotes.length === 0 ? (
            <div className="flex items-center gap-2 h-[60px]">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              <span className="text-xs text-slate-500 font-medium">Loading tickers…</span>
            </div>
          ) : (
            <div 
              className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 -mb-2 scrollbar-none lg:grid lg:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <style>{`.scrollbar-none::-webkit-scrollbar { display: none; }`}</style>
              {validQuotes.map((q) => (
                <TickerCard key={q.symbol} quote={q} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
