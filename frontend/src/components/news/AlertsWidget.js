import React, { useState, useEffect } from 'react';
import { Widget } from './RightSidebar';
import { newsAPI } from '../../utils/api';

/**
 * AlertsWidget — Displays severe weather and news alerts.
 * Fetches from /api/news/weather/alerts with fallback to static data.
 */

const SEVERITY_COLORS = {
  extreme: 'var(--red)',
  severe: 'var(--red)',
  moderate: 'var(--orange)',
  minor: 'var(--gold)',
  default: 'var(--gold)',
};

const FALLBACK_ALERTS = [
  { id: 'f1', color: 'var(--red)', text: 'SEVERE THUNDERSTORM WATCH — Henderson County, TX until 8PM CDT', time: '15m ago' },
  { id: 'f2', color: 'var(--orange)', text: 'FLASH FLOOD ADVISORY — Cedar Creek Lake area through Sunday', time: '1h ago' },
  { id: 'f3', color: 'var(--gold)', text: 'HEALTH ALERT — H5N1 precautions recommended for East TX farmworkers', time: '2h ago' },
];

function formatAlertTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return d.toLocaleDateString();
  } catch { return ''; }
}

export default function AlertsWidget() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    newsAPI.getWeatherAlerts()
      .then((res) => {
        if (cancelled) return;
        const apiAlerts = res.data?.alerts || res.data;
        if (Array.isArray(apiAlerts) && apiAlerts.length > 0) {
          setAlerts(apiAlerts.map((a, i) => ({
            id: a.id || `alert-${i}`,
            color: SEVERITY_COLORS[a.severity?.toLowerCase()] || SEVERITY_COLORS.default,
            text: a.headline || a.event || a.text || 'Unknown alert',
            time: formatAlertTime(a.onset || a.effective || a.time),
          })));
        } else {
          setAlerts(FALLBACK_ALERTS);
        }
      })
      .catch((err) => {
        console.warn('[AlertsWidget] API unavailable, using fallback:', err.message);
        setAlerts(FALLBACK_ALERTS);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (!loading && alerts.length === 0) return null;

  const countBadge = (
    <span
      className="font-[var(--mono)] text-[9px] px-[5px] py-[1px] rounded-[3px] ml-auto"
      style={{ background: 'rgba(255,71,87,0.2)', color: 'var(--red)' }}
    >
      {alerts.length}
    </span>
  );

  return (
    <Widget
      id="alerts-widget"
      icon="⚠️"
      title="Alerts"
      statusText={String(alerts.length)}
      statusColor="var(--red)"
      extraHeader={countBadge}
    >
      <div className="flex flex-col">
        {loading ? (
          <div className="p-[14px] text-[10px] text-[var(--text3)]">Checking alerts...</div>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-[8px] p-[7px_14px] border-b border-[var(--border)] last:border-b-0 cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.02)]"
            >
              <div
                className="w-[6px] h-[6px] rounded-full mt-[4px] flex-shrink-0"
                style={{ background: a.color }}
              />
              <div>
                <div className="text-[11px] text-[var(--text)] leading-[1.4]">{a.text}</div>
                <div className="font-[var(--mono)] text-[9px] text-[var(--text3)] mt-[1px]">{a.time}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </Widget>
  );
}
