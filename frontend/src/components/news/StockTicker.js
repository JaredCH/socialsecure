import React, { useState, useEffect, useCallback, useRef } from 'react';
import { newsAPI } from '../../utils/api';

function cleanCompanyName(name, symbol) {
  if (!name) return symbol;
  let clean = name;
  if (clean.toUpperCase().endsWith(' USD')) clean = clean.slice(0, -4);
  clean = clean.replace(/\b(Inc\.?|Corp\.?|Corporation|Ltd\.?|PLC|LLC|LC|Co\.?|Company|Holdings?|Group)\b/gi, '').trim();
  clean = clean.replace(/[,.\-\s]+$/, '').trim();
  return clean || symbol;
}

const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

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
      // Silently fail
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

  // The infinite scroll trick: repeat the validQuotes array so it scrolls seamlessly.
  const scrollItems = validQuotes.length > 0 ? [...validQuotes, ...validQuotes, ...validQuotes] : [];

  return (
    <div id="ticker-bar" className="bg-[var(--bg2)] border-b border-[var(--border)] h-[32px] flex items-center overflow-hidden relative shrink-0">
      <div className="absolute top-0 bottom-0 left-0 w-[60px] z-[2] bg-gradient-to-r from-[var(--bg2)] to-transparent pointer-events-none" />
      <div className="absolute top-0 bottom-0 right-0 w-[60px] z-[2] bg-gradient-to-l from-[var(--bg2)] to-transparent pointer-events-none" />
      
      <div className="font-[var(--mono)] text-[10px] text-[var(--accent)] tracking-[2px] px-4 whitespace-nowrap border-r border-[var(--border)] h-full flex items-center shrink-0 z-[3] bg-[var(--bg2)]">
        MARKETS
      </div>
      
      <div className="flex animate-[ticker_60s_linear_infinite] hover:[animation-play-state:paused] gap-0">
        {scrollItems.map((q, i) => {
          const isUp = q.direction === 'up';
          const isDown = q.direction === 'down';
          const chgColor = isUp ? 'text-[var(--green)]' : isDown ? 'text-[var(--red)]' : 'text-[var(--text2)]';
          return (
            <div key={`${q.symbol}-${i}`} className="flex items-center gap-[6px] px-[18px] border-r border-[var(--border)] h-[32px] whitespace-nowrap cursor-pointer transition-colors hover:bg-[var(--bg3)] text-[var(--text)]">
              <span className="font-[var(--mono)] text-[10px] font-semibold text-[var(--text2)] tracking-[1px]">{cleanCompanyName(q.name, q.symbol)}</span>
              <span className="font-[var(--mono)] text-[11px] font-medium">{q.price != null ? q.price.toFixed(2) : '—'}</span>
              <span className={`font-[var(--mono)] text-[10px] ${chgColor}`}>
                {isUp ? '+' : ''}{q.changePercent != null ? q.changePercent.toFixed(2) : '0.00'}%
              </span>
            </div>
          )
        })}
      </div>
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); } /* Since we repeated it 3 times, actually to skip seamlessly we might need 33.3%, but -50% works if we repeat twice. Let's adjust to -33.33% because we have 3 copies */
        }
        .animate-\\[ticker_60s_linear_infinite\\] {
          animation: ticker 40s linear infinite;
        }
      `}</style>
    </div>
  );
}
