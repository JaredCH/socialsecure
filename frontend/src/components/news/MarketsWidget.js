import React, { useState, useEffect } from 'react';
import { Widget } from './RightSidebar';
import { newsAPI } from '../../utils/api';

/**
 * MarketsWidget — Displays stock/commodity quotes from the backend.
 * Falls back to static data if the API call fails.
 */

const FALLBACK_SYMBOLS = ['SPX', 'GOLD', 'SILVER', 'WTI', 'AAPL', 'NVDA', 'TSLA', '10Y'];

const FALLBACK_MARKETS = [
  { sym: 'SPX', name: 'S&P 500', price: '5,842', chg: '+1.43%', up: true },
  { sym: 'GOLD', name: 'Gold / oz', price: '3,240', chg: '+2.80%', up: true },
  { sym: 'SILVER', name: 'Silver / oz', price: '32.44', chg: '+1.20%', up: true },
  { sym: 'WTI', name: 'Crude Oil', price: '78.23', chg: '-0.67%', up: false },
  { sym: 'AAPL', name: 'Apple Inc.', price: '214.82', chg: '+2.14%', up: true },
  { sym: 'NVDA', name: 'NVIDIA', price: '891.40', chg: '+3.67%', up: true },
  { sym: 'TSLA', name: 'Tesla', price: '198.33', chg: '-1.22%', up: false },
  { sym: '10Y', name: '10Y Treasury', price: '4.31%', chg: '+0.04', up: false },
];

function Sparkline({ up = true, seed = '' }) {
  const canvasRef = React.useRef(null);
  
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    // Simple deterministic pseudo-random path based on seed
    const points = [];
    let current = h / 2;
    const step = w / 10;
    
    // Basic hash for seed
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    
    for (let i = 0; i <= 10; i++) {
        const rand = Math.sin(hash + i * 0.5) * (h / 3);
        points.push({ x: i * step, y: current + rand });
    }
    
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.strokeStyle = up ? '#00ef8b' : '#ff4d4d';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }, [up, seed]);

  return <canvas ref={canvasRef} width="40" height="15" className="ml-auto mr-[6px] opacity-60" />;
}

export default function MarketsWidget() {
  const [markets, setMarkets] = useState(FALLBACK_MARKETS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    newsAPI.getStockQuotes(FALLBACK_SYMBOLS)
      .then((res) => {
        if (cancelled) return;
        const quotes = res.data?.quotes || res.data;
        if (Array.isArray(quotes) && quotes.length > 0) {
          setMarkets(quotes.map(q => ({
            sym: q.symbol || q.sym,
            name: q.name || q.symbol,
            price: q.price?.toLocaleString?.() ?? String(q.price ?? '--'),
            chg: q.changePercent != null
              ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`
              : (q.chg || '--'),
            up: (q.changePercent ?? 0) >= 0,
          })));
        }
      })
      .catch((err) => {
        console.warn('[MarketsWidget] API unavailable, using fallback data:', err.message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const isUp = markets.filter(m => m.up).length >= markets.length / 2;
  const statusColor = isUp ? 'var(--green)' : 'var(--red)';
  const statusText = `▲ ${isUp ? 'Bullish' : 'Mixed'}`;

  return (
    <Widget
      id="markets-widget"
      icon="📈"
      title="Markets"
      statusText={loading ? 'Loading...' : statusText}
      statusColor={statusColor}
    >
      <div className="flex flex-col gap-[3px] p-[6px_10px_10px]">
        {markets.map((m) => (
          <div
            key={m.sym}
            className="flex items-center gap-[8px] p-[7px_8px] bg-[var(--bg3)] border border-[var(--border)] rounded-[5px] cursor-pointer transition-all hover:border-[var(--border2)] relative overflow-hidden"
          >
            <span className="font-[var(--mono)] text-[9px] font-semibold tracking-[1px] text-[var(--text2)] w-[45px]">
              {m.sym}
            </span>
            <span className="text-[10px] text-[var(--text)] flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
              {m.name}
            </span>
            
            <Sparkline up={m.up} seed={m.sym} />

            <span className="font-[var(--mono)] text-[11px] font-semibold text-[var(--text)]">
              {m.price}
            </span>
            <span
              className={`font-[var(--mono)] text-[9px] min-w-[50px] text-right ${
                m.up ? 'text-[var(--green)]' : 'text-[var(--red)]'
              }`}
            >
              {m.chg}
            </span>
          </div>
        ))}
      </div>
    </Widget>
  );
}
