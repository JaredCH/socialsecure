import React, { useState, useEffect } from 'react';
import { Widget } from './RightSidebar';
import { newsAPI } from '../../utils/api';

export default function TrendingWidget() {
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    newsAPI.getTrending()
      .then(res => setTrending(res.data?.topics || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Widget id="trending-widget" icon="🔥" title="Trending" statusText="Loading...">
        <div className="p-[14px] text-[10px] text-[var(--text3)]">Loading trending topics...</div>
      </Widget>
    );
  }

  if (!trending.length) return null;

  return (
    <Widget id="trending-widget" icon="🔥" title="Trending">
      <div className="flex flex-col">
        {trending.slice(0, 5).map((t, i) => (
          <div key={t.topic || i} className="flex items-start gap-[10px] p-[10px_14px] border-b border-[var(--border)] cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.02)] group">
            <div className="font-[var(--display)] text-[20px] text-[var(--border2)] leading-[1] w-[14px] text-center transition-colors group-hover:text-[var(--accent)]">
              {i + 1}
            </div>
            <div className="flex-1">
              <div className="font-[var(--sans)] text-[11px] font-semibold text-[var(--text)] leading-[1.3] mb-[2px]">
                {t.topic}
              </div>
              <div className="font-[var(--mono)] text-[9px] text-[var(--text3)]">
                {t.volume ? `${t.volume.toLocaleString()} articles` : 'Trending now'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Widget>
  );
}
