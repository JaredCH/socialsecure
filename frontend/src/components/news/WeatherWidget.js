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
      <div className="p-3 border-b border-[var(--border)] relative bg-gradient-to-b from-[var(--bg)] to-[var(--bg2)]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex flex-col">
            <span className="font-[var(--mono)] text-[9px] font-bold text-[var(--accent)] uppercase tracking-[1.5px] items-center gap-1 flex">
              <span className="material-symbols-outlined text-[12px]">location_on</span>
              {displayCity}
            </span>
            <span className="text-[10px] text-[var(--text2)] mt-0.5 font-medium">{current?.shortForecast || 'Conditions unknown'}</span>
          </div>
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 px-2 py-1 rounded-[4px] bg-[var(--bg3)] hover:bg-[var(--bg4)] text-[9px] font-bold text-[var(--text2)] transition-all border border-[var(--border)] shadow-sm"
          >
            {isExpanded ? 'LESS' : 'MORE'}
            <span className="material-symbols-outlined text-[12px]">{isExpanded ? 'expand_less' : 'expand_more'}</span>
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="text-[42px] leading-none select-none drop-shadow-sm">{currentIcon}</div>
          <div className="flex items-baseline">
            <span className="text-[36px] font-black text-[var(--text)] leading-none tracking-tighter">
              {current?.temperature ?? '--'}
            </span>
            <span className="text-[16px] font-[var(--display)] text-[var(--text3)] ml-0.5">°F</span>
          </div>
          
          <div className="flex-1 flex flex-wrap gap-x-3 gap-y-1 justify-end text-[9px] text-[var(--text2)] font-medium">
            <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[11px]">thermostat</span> Feels {current?.feelsLike ?? current?.temperature}°</div>
            <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[11px]">swap_vert</span> {wk[0]?.high ?? '--'}°/{wk[0]?.low ?? '--'}°</div>
            <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[11px]">water_drop</span> {current?.humidity ?? '--'}%</div>
          </div>
        </div>
      </div>

      {/* Expanded View Content */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
        {/* Statistics Strip */}
        <div className="flex items-center justify-between p-2 bg-[var(--bg2)] border-b border-[var(--border)] text-[9px] font-bold text-[var(--text)]">
          <div className="flex items-center gap-1" title="Wind Speed"><span className="material-symbols-outlined text-[12px] text-blue-500">air</span> {current?.windSpeed ?? '--'} mph</div>
          <div className="flex items-center gap-1" title="Precipitation Chance"><span className="material-symbols-outlined text-[12px] text-orange-500">water_drop</span> {current?.precipitationProbability ?? '0'}%</div>
          <div className="flex items-center gap-1" title="UV Index"><span className="material-symbols-outlined text-[12px] text-amber-500">wb_sunny</span> Mod(4)</div>
          <div className="flex items-center gap-1" title="Visibility"><span className="material-symbols-outlined text-[12px] text-indigo-500">visibility</span> 9.4 mi</div>
        </div>

        {/* Temperature Trend Sparkline */}
        <div className="p-2 bg-[var(--bg)] border-b border-[var(--border)]">
           <div className="text-[9px] font-black text-[var(--text3)] uppercase tracking-[1.5px] flex items-center gap-1.5 pb-2">
              <span className="w-1 h-2 bg-[var(--accent)] rounded-full" />
              12hr Trend
           </div>
           <div className="flex justify-center -mb-2">
             {generateSparkline(upcomingHourly, minHourly - 5, maxHourly + 5, 260, 25)}
           </div>
        </div>

        {/* 7-DAY FORECAST - COMPACT TABLE */}
        <div className="p-2 bg-[var(--bg)]">
          <div className="text-[9px] font-black text-[var(--text3)] uppercase tracking-[1.5px] flex items-center gap-1.5 pb-1">
              <span className="w-1 h-2 bg-[var(--accent)] rounded-full" />
              7-Day
          </div>
          <div className="flex flex-col">
            {wk.map((day, i) => {
              const h = day.high ?? maxTempThisWeek;
              const l = day.low ?? minTempThisWeek;
              const leftPercent = ((l - minTempThisWeek) / tempRange) * 100;
              const widthPercent = ((h - l) / tempRange) * 100;

              return (
                <div key={i} className="flex items-center py-[2px] px-[4px] rounded-[4px] hover:bg-[var(--bg3)] transition-all cursor-default group">
                  <div className="w-[28px] shrink-0 font-[var(--mono)] text-[9px] font-bold text-[var(--text)] uppercase tracking-tight">
                    {i === 0 ? 'TDY' : getDayAbbr(day.date)}
                  </div>
                  
                  <div className="text-[14px] w-[20px] shrink-0 text-center">
                    {ICON_MAP[day.icon] || '🌤️'}
                  </div>

                  <div className="flex-1 mx-[8px] h-[3px] bg-[var(--bg4)] rounded-full relative overflow-hidden">
                    <div 
                      className="absolute h-full rounded-full bg-gradient-to-r from-blue-500 to-[var(--accent)]" 
                      style={{
                        left: `${leftPercent}%`,
                        width: `${Math.max(widthPercent, 10)}%`,
                      }}
                    />
                  </div>

                  <div className="flex items-center gap-[4px] w-[36px] shrink-0 justify-end font-[var(--mono)] tracking-tighter">
                    <span className="text-[9px] font-bold text-[var(--text)]">{h}°</span>
                    <span className="text-[9px] text-[var(--text3)]">{l}°</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hourly Quick Strip (Visible when not expanded) */}
      {!isExpanded && (
        <div className="flex gap-1 overflow-x-auto p-2 border-t border-[var(--border)] scrollbar-none bg-[var(--bg2)]">
          {upcomingHourly.slice(0, 6).map((h, i) => (
            <div key={i} className="flex-shrink-0 w-[42px] flex flex-col items-center gap-[2px] bg-[var(--bg)] py-1.5 rounded-[6px] border border-[var(--border)] shadow-sm">
              <span className="font-[var(--mono)] text-[8px] font-bold text-[var(--text3)] uppercase">
                {new Date(h.time).toLocaleTimeString([], { hour: 'numeric' }).replace(' ', '')}
              </span>
              <span className="text-[14px] leading-none">{ICON_MAP[h.icon] || '🌤️'}</span>
              <span className="font-[var(--mono)] text-[9px] font-black text-[var(--text)] tracking-tighter">
                {h.temperature ?? '--'}°
              </span>
            </div>
          ))}
        </div>
      )}
    </Widget>
  );
}
