import React, { useState, useEffect } from 'react';
import { Widget } from './RightSidebar';
import { newsAPI } from '../../utils/api';

const ICON_MAP = {
  sun: '☀️',
  'cloud-sun': '⛅',
  cloud: '☁️',
  'cloud-fog': '🌫️',
  'cloud-drizzle': '🌦️',
  'cloud-rain': '🌧️',
  'cloud-snow': '🌨️',
  'cloud-lightning': '⛈️',
};

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function getDayAbbr(dateStr) {
  try { return DAY_ABBR[new Date(dateStr).getDay()]; } catch { return ''; }
}

function getUpcomingHourlyForecast(hourly) {
  if (!Array.isArray(hourly) || hourly.length === 0) return [];

  const parsedHourly = hourly
    .map((entry, index) => {
      const time = new Date(entry?.time);
      if (Number.isNaN(time.getTime())) return null;
      return { entry, index, time };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time || a.index - b.index);

  if (parsedHourly.length === 0) return hourly;

  const now = new Date();
  const upcoming = parsedHourly.filter(({ time }) => time >= now);
  return (upcoming.length > 0 ? upcoming : parsedHourly).map(({ entry }) => entry);
}

export default function WeatherWidget() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    newsAPI.getWeather()
      .then((r) => setLocations(r.data?.locations || []))
      .catch((error) => console.error(error))
      .finally(() => setLoading(false));
  }, []);

  const primary = locations.find((l) => l.isPrimary && l?.weather?.current) || 
                  locations.find((l) => l?.weather?.current) || null;

  if (loading) {
    return (
      <Widget id="weather-widget" icon="🌤" title="Weather" statusText="Loading...">
        <div className="p-6 flex items-center justify-center min-h-[120px]">
           <div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
        </div>
      </Widget>
    );
  }

  if (!primary?.weather?.current) {
    return (
      <Widget id="weather-widget" icon="🌤" title="Weather" statusText="Unavailable">
        <div className="p-6 text-[11px] text-[var(--text3)] text-center py-10 bg-[var(--bg2)] rounded-[8px] m-2 border border-dashed border-[var(--border)]">
           <span className="material-symbols-outlined text-[32px] mb-3 opacity-30">cloud_off</span>
           <p className="font-medium">Weather data currently unavailable</p>
           <p className="opacity-70 mt-1">Check your home location in settings.</p>
        </div>
      </Widget>
    );
  }

  const { weather, label, city, state, zipCode } = primary;
  const { current, hourly = [], weekly: wk = [] } = weather;
  const upcomingHourly = getUpcomingHourlyForecast(hourly).slice(0, 12);
  
  const displayCity = city ? `${city}${state ? `, ${state}` : ''}` : (label || zipCode || 'Current Location');
  const currentIcon = ICON_MAP[current?.icon] || '☀️';
  
  const weekTemps = wk.map(d => ({ h: d.high, l: d.low })).filter(d => d.h != null && d.l != null);
  const minTempThisWeek = weekTemps.length > 0 ? Math.min(...weekTemps.map(d => d.l)) : 32;
  const maxTempThisWeek = weekTemps.length > 0 ? Math.max(...weekTemps.map(d => d.h)) : 100;
  const tempRange = Math.max(1, maxTempThisWeek - minTempThisWeek);

  // SVG Sparkline Helper for Temperature Trend
  const generateSparkline = (data, min, max, width = 200, height = 40) => {
    if (!data.length) return null;
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((d.temperature - min) / (max - min)) * height;
      return `${x},${y}`;
    }).join(' ');
    
    return (
      <svg width={width} height={height} className="overflow-visible mt-2 mb-4">
        <polyline
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
          className="drop-shadow-[0_2px_4px_rgba(0,212,255,0.3)]"
        />
        {data.map((d, i) => {
           if (i % 3 !== 0 && i !== data.length - 1) return null;
           const x = (i / (data.length - 1)) * width;
           const y = height - ((d.temperature - min) / (max - min)) * height;
           return (
             <g key={i}>
                <circle cx={x} cy={y} r="3" fill="var(--bg)" stroke="var(--accent)" strokeWidth="1.5" />
                <text x={x} y={y - 8} fontSize="8" fill="var(--text3)" textAnchor="middle" className="font-[var(--mono)]">{d.temperature}°</text>
             </g>
           );
        })}
      </svg>
    );
  };

  const hourlyTemps = upcomingHourly.map(h => h.temperature);
  const minHourly = Math.min(...hourlyTemps);
  const maxHourly = Math.max(...hourlyTemps);

  return (
    <Widget id="weather-widget" icon="🌤" title="Weather" statusText={`${current?.temperature ?? '--'}°F`}>
      {/* Current Conditions Header */}
      <div className="p-4 border-b border-[var(--border)] relative bg-gradient-to-b from-[var(--bg)] to-[var(--bg2)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col">
            <span className="font-[var(--mono)] text-[10px] font-bold text-[var(--accent)] uppercase tracking-[1.5px] items-center gap-1 flex">
              <span className="material-symbols-outlined text-[14px]">location_on</span>
              {displayCity}
            </span>
            <span className="text-[11px] text-[var(--text2)] mt-0.5 font-medium">{current?.shortForecast || 'Conditions unknown'}</span>
          </div>
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg3)] hover:bg-[var(--bg4)] text-[11px] font-bold text-[var(--text2)] transition-all border border-[var(--border)] shadow-sm"
          >
            {isExpanded ? 'Minimize' : 'Details'}
            <span className="material-symbols-outlined text-[16px]">{isExpanded ? 'expand_less' : 'expand_more'}</span>
          </button>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-baseline">
            <span className="text-[56px] font-black text-[var(--text)] leading-none -ml-1 tracking-tighter">
              {current?.temperature ?? '--'}
            </span>
            <span className="text-[24px] font-[var(--display)] text-[var(--text3)] ml-1">°F</span>
          </div>
          <div className="text-[64px] leading-none select-none drop-shadow-md">{currentIcon}</div>
          
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] text-[var(--text2)] font-medium">
              <span className="opacity-70">Feels Like</span>
              <span className="text-[var(--text)] font-bold">{current?.feelsLike ?? current?.temperature}°</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-[var(--text2)] font-medium">
              <span className="opacity-70">High/Low</span>
              <span className="text-[var(--text)] font-bold">{wk[0]?.high ?? '--'}° / {wk[0]?.low ?? '--'}°</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-[var(--text2)] font-medium">
              <span className="opacity-70">Humidity</span>
              <span className="text-[var(--text)] font-bold">{current?.humidity ?? '--'}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded View Content */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
        {/* Statistics Grid */}
        <div className="grid grid-cols-2 gap-2 p-3 bg-[var(--bg2)] border-b border-[var(--border)]">
          <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)] flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                <span className="material-symbols-outlined text-[20px]">air</span>
             </div>
             <div>
                <div className="text-[9px] font-bold text-[var(--text3)] uppercase tracking-wider">Wind Speed</div>
                <div className="text-[14px] font-bold text-[var(--text)]">{current?.windSpeed ?? '--'} mph</div>
             </div>
          </div>
          <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)] flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500">
                <span className="material-symbols-outlined text-[20px]">water_drop</span>
             </div>
             <div>
                <div className="text-[9px] font-bold text-[var(--text3)] uppercase tracking-wider">Precip Chance</div>
                <div className="text-[14px] font-bold text-[var(--text)]">{current?.precipitationProbability ?? '0'}%</div>
             </div>
          </div>
          <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)] flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                <span className="material-symbols-outlined text-[20px]">wb_sunny</span>
             </div>
             <div>
                <div className="text-[9px] font-bold text-[var(--text3)] uppercase tracking-wider">UV Index</div>
                <div className="text-[14px] font-bold text-[var(--text)]">Moderate (4)</div>
             </div>
          </div>
          <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)] flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                <span className="material-symbols-outlined text-[20px]">visibility</span>
             </div>
             <div>
                <div className="text-[9px] font-bold text-[var(--text3)] uppercase tracking-wider">Visibility</div>
                <div className="text-[14px] font-bold text-[var(--text)]">9.4 mi</div>
             </div>
          </div>
        </div>

        {/* Temperature Trend Sparkline */}
        <div className="p-4 bg-[var(--bg)] border-b border-[var(--border)]">
           <div className="text-[10px] font-black text-[var(--text3)] uppercase tracking-[1.5px] mb-4 flex items-center gap-2">
              <span className="w-1 h-3 bg-[var(--accent)] rounded-full" />
              12-Hour Temperature Trend
           </div>
           <div className="flex justify-center">
             {generateSparkline(upcomingHourly, minHourly - 5, maxHourly + 5, 260, 50)}
           </div>
        </div>

        {/* 7-DAY FORECAST - CLEAN TABLE STYLE */}
        <div className="p-4 bg-[var(--bg)]">
          <div className="text-[10px] font-black text-[var(--text3)] uppercase tracking-[1.5px] mb-4 flex items-center gap-2">
              <span className="w-1 h-3 bg-[var(--accent)] rounded-full" />
              7-Day Outlook
          </div>
          <div className="flex flex-col gap-1">
            {wk.map((day, i) => {
              const h = day.high ?? maxTempThisWeek;
              const l = day.low ?? minTempThisWeek;
              const leftPercent = ((l - minTempThisWeek) / tempRange) * 100;
              const widthPercent = ((h - l) / tempRange) * 100;

              return (
                <div key={i} className="flex items-center py-[6px] px-[8px] rounded-[8px] hover:bg-[var(--bg3)] transition-all cursor-default group">
                  <div className="w-[42px] shrink-0 flex flex-col">
                    <span className="text-[10px] font-bold text-[var(--text)]">{i === 0 ? 'Today' : getDayAbbr(day.date)}</span>
                    <span className="text-[8px] text-[var(--text3)] font-medium">{new Date(day.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                  </div>
                  
                  <div className="text-[18px] w-[32px] shrink-0 text-center group-hover:scale-110 transition-transform duration-300">
                    {ICON_MAP[day.icon] || '🌤️'}
                  </div>

                  <div className="flex-1 mx-[12px] h-[4px] bg-[var(--bg4)] rounded-full relative overflow-hidden">
                    <div 
                      className="absolute h-full rounded-full shadow-[0_0_8px_rgba(59,130,246,0.3)] bg-gradient-to-r from-blue-500 to-[var(--accent)]" 
                      style={{
                        left: `${leftPercent}%`,
                        width: `${Math.max(widthPercent, 10)}%`,
                      }}
                    />
                  </div>

                  <div className="flex items-center gap-[6px] w-[50px] shrink-0 justify-end">
                    <span className="text-[11px] font-black text-[var(--text)]">{h}°</span>
                    <span className="text-[10px] font-bold text-[var(--text3)]">{l}°</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hourly Quick Strip (Visible when not expanded) */}
      {!isExpanded && (
        <div className="flex gap-2 overflow-x-auto p-4 border-t border-[var(--border)] scrollbar-none bg-[var(--bg2)]">
          {upcomingHourly.slice(0, 6).map((h, i) => (
            <div key={i} className="flex-shrink-0 w-16 flex flex-col items-center gap-1.5 bg-[var(--bg)] py-3 rounded-xl border border-[var(--border)] shadow-sm">
              <span className="text-[9px] font-bold text-[var(--text3)] uppercase">
                {new Date(h.time).toLocaleTimeString([], { hour: 'numeric' })}
              </span>
              <span className="text-[20px]">{ICON_MAP[h.icon] || '🌤️'}</span>
              <span className="text-[13px] font-black text-[var(--text)]">
                {h.temperature ?? '--'}°
              </span>
            </div>
          ))}
        </div>
      )}
    </Widget>
  );
}
