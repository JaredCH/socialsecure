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
        <div className="p-[14px] text-[10px] text-[var(--text3)] flex items-center justify-center min-h-[100px]">
           <div className="w-5 h-5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
        </div>
      </Widget>
    );
  }

  if (!primary?.weather?.current) {
    return (
      <Widget id="weather-widget" icon="🌤" title="Weather" statusText="Unavailable">
        <div className="p-[14px] text-[10px] text-[var(--text3)] text-center py-8">
           <span className="material-symbols-outlined text-[24px] mb-2 opacity-50">cloud_off</span>
           <p>Weather data temporarily unavailable.<br/>Check your location settings.</p>
        </div>
      </Widget>
    );
  }

  const { weather, label, city, state, zipCode } = primary;
  const { current, hourly = [], weekly: wk = [] } = weather;
  const upcomingHourly = getUpcomingHourlyForecast(hourly).slice(0, isExpanded ? 24 : 8);
  
  const displayCity = city ? `${city}${state ? `, ${state}` : ''}` : (label || zipCode || 'Unknown Location');
  const currentIcon = ICON_MAP[current?.icon] || '☀️';
  
  // Weekly ranges
  const weekTemps = wk.map(d => ({ h: d.high, l: d.low })).filter(d => d.h != null && d.l != null);
  const minTempThisWeek = weekTemps.length > 0 ? Math.min(...weekTemps.map(d => d.l)) : 0;
  const maxTempThisWeek = weekTemps.length > 0 ? Math.max(...weekTemps.map(d => d.h)) : 100;
  const tempRange = Math.max(1, maxTempThisWeek - minTempThisWeek);

  return (
    <Widget id="weather-widget" icon="🌤" title="Weather" statusText={`${current?.temperature ?? '--'}°F`}>
      <div className="p-[14px] border-b border-[var(--border)] relative">
        <div className="font-[var(--mono)] text-[9px] tracking-[1px] text-[var(--text2)] mb-[6px] uppercase flex items-center justify-between">
          <span>⊙ {displayCity} {zipCode || ''}</span>
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[var(--accent)] hover:underline cursor-pointer flex items-center gap-[2px]"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
            <span className="material-symbols-outlined text-[12px]">{isExpanded ? 'expand_less' : 'expand_more'}</span>
          </button>
        </div>
        
        <div className="flex items-start gap-[4px] mb-[4px]">
          <div className="font-[var(--display)] text-[48px] leading-[0.8] text-[var(--text)]">
            {current?.temperature ?? '--'}
          </div>
          <div className="font-[var(--display)] text-[20px] text-[var(--text2)] mt-[2px]">°F</div>
          <div className="text-[42px] ml-auto leading-[1] drop-shadow-sm">{currentIcon}</div>
        </div>

        <div className="font-[var(--mono)] text-[10px] text-[var(--text2)] mb-[12px]">
          {current?.shortForecast || 'Sunny'}
          {current?.feelsLike != null && ` · Feels like ${current.feelsLike}°F`}
        </div>

        <div className="flex gap-[8px]">
          <div className="flex-1 bg-[var(--bg3)] p-[6px_4px] rounded-[4px] text-center" title="Humidity">
            <span className="material-symbols-outlined text-[14px] text-[var(--text3)] mb-[2px]">humidity_low</span>
            <div className="font-[var(--display)] text-[14px] text-[var(--text)]">{current?.humidity ?? '--'}%</div>
          </div>
          <div className="flex-1 bg-[var(--bg3)] p-[6px_4px] rounded-[4px] text-center" title="Wind Speed">
            <span className="material-symbols-outlined text-[14px] text-[var(--text3)] mb-[2px]">air</span>
            <div className="font-[var(--display)] text-[14px] text-[var(--text)]">{current?.windSpeed ?? '--'}</div>
          </div>
          <div className="flex-1 bg-[var(--bg3)] p-[6px_4px] rounded-[4px] text-center" title="Precipitation">
            <span className="material-symbols-outlined text-[14px] text-[var(--text3)] mb-[2px]">rainy</span>
            <div className="font-[var(--display)] text-[14px] text-[var(--text)]">{current?.precipitationProbability ?? '0'}%</div>
          </div>
        </div>
      </div>

      {upcomingHourly.length > 0 && (
        <div className={`flex gap-[8px] p-[12px_14px] border-b border-[var(--border)] [&::-webkit-scrollbar]:h-[4px] ${isExpanded ? 'flex-wrap overflow-y-auto max-h-[300px]' : 'overflow-x-auto'}`}>
          {upcomingHourly.map((h, i) => (
            <div key={i} className={`flex-shrink-0 flex flex-col items-center gap-[4px] bg-[var(--bg3)] py-[8px] rounded-[6px] ${isExpanded ? 'w-[calc(25%-6px)]' : 'w-[52px]'}`}>
              <div className="font-[var(--mono)] text-[8px] text-[var(--text3)] uppercase">
                {new Date(h.time).toLocaleTimeString([], { hour: 'numeric' })}
              </div>
              <div className="text-[18px]">{ICON_MAP[h.icon] || '🌤️'}</div>
              <div className="font-[var(--display)] text-[14px] text-[var(--text)]">
                {h.temperature ?? '--'}°
              </div>
            </div>
          ))}
        </div>
      )}

      {(isExpanded ? wk : wk.slice(0, 3)).length > 0 && (
        <div className="p-[12px_14px_8px]">
          <div className="font-[var(--mono)] text-[8px] text-[var(--text3)] tracking-[1.5px] mb-[10px] uppercase font-bold">
            {isExpanded ? '7-Day Forecast' : 'Next 3 Days'}
          </div>
          <div className="flex flex-col gap-[4px]">
            {(isExpanded ? wk : wk.slice(0, 3)).map((day, i) => {
              const h = day.high ?? maxTempThisWeek;
              const l = day.low ?? minTempThisWeek;
              const leftPercent = ((l - minTempThisWeek) / tempRange) * 100;
              const widthPercent = ((h - l) / tempRange) * 100;

              return (
                <div key={i} className="flex items-center p-[6px_8px] rounded-[6px] hover:bg-[var(--bg3)] transition-colors group">
                  <div className="font-[var(--mono)] text-[10px] text-[var(--text2)] w-[36px] font-bold">
                    {i === 0 ? 'Tdy' : getDayAbbr(day.date)}
                  </div>
                  <div className="text-[18px] w-[28px] text-center">
                    {ICON_MAP[day.icon] || '🌤️'}
                  </div>
                  <div className="flex-1 mx-[12px] h-[5px] bg-[var(--bg4)] rounded-[2.5px] relative overflow-hidden">
                    <div 
                      className="absolute h-full rounded-[2.5px] shadow-[0_0_8px_rgba(0,212,255,0.4)]" 
                      style={{
                        left: `${leftPercent}%`,
                        width: `${Math.max(widthPercent, 8)}%`,
                        background: 'linear-gradient(90deg, #3b82f6 0%, #00d4ff 100%)'
                      }}
                    />
                  </div>
                  <div className="font-[var(--mono)] text-[10px] w-[54px] flex justify-end gap-[8px]">
                    <span className="text-[var(--text)] font-black">{h}°</span>
                    <span className="text-[var(--text3)] font-medium">{l}°</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Widget>
  );
}
