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

  useEffect(() => {
    newsAPI.getWeather()
      .then((r) => setLocations(r.data?.locations || []))
      .catch((error) => console.error(error))
      .finally(() => setLoading(false));
  }, []);

  const primary = locations.find((l) => l.isPrimary && l?.weather?.current) || 
                  locations.find((l) => l?.weather?.current) || null;

  if (loading || !primary?.weather?.current) {
    return (
      <Widget id="weather-widget" icon="🌤" title="Weather" statusText="Loading...">
        <div className="p-[14px] text-[10px] text-[var(--text3)]">Loading weather data...</div>
      </Widget>
    );
  }

  const { weather, label, city, state, zipCode } = primary;
  const { current, hourly = [], weekly: wk = [] } = weather;
  const upcomingHourly = getUpcomingHourlyForecast(hourly).slice(0, 8);
  
  const displayCity = city ? `${city}${state ? `, ${state}` : ''}` : (label || zipCode || 'Unknown Location');
  const currentIcon = ICON_MAP[current?.icon] || '☀️';
  
  // Calculate temp ranges for the day bars
  const weekTemps = wk.map(d => ({ h: d.high, l: d.low })).filter(d => d.h != null && d.l != null);
  const minTempThisWeek = weekTemps.length > 0 ? Math.min(...weekTemps.map(d => d.l)) : 0;
  const maxTempThisWeek = weekTemps.length > 0 ? Math.max(...weekTemps.map(d => d.h)) : 100;
  const tempRange = Math.max(1, maxTempThisWeek - minTempThisWeek);

  return (
    <Widget id="weather-widget" icon="🌤" title="Weather" statusText={`${current?.temperature ?? '--'}°F`}>
      <div className="p-[14px] border-b border-[var(--border)]">
        <div className="font-[var(--mono)] text-[9px] tracking-[1px] text-[var(--text2)] mb-[6px] uppercase">
          ⊙ {displayCity} {zipCode || ''}
        </div>
        
        <div className="flex items-start gap-[4px] mb-[4px]">
          <div className="font-[var(--display)] text-[48px] leading-[0.8] text-[var(--text)]">
            {current?.temperature ?? '--'}
          </div>
          <div className="font-[var(--display)] text-[20px] text-[var(--text2)] mt-[2px]">°F</div>
          <div className="text-[32px] ml-auto leading-[1]">{currentIcon}</div>
        </div>

        <div className="font-[var(--mono)] text-[10px] text-[var(--text2)] mb-[12px]">
          {current?.shortForecast || 'Sunny'}
          {current?.feelsLike != null && ` · Feels like ${current.feelsLike}°F`}
        </div>

        <div className="flex gap-[12px]">
          <div className="flex-1 bg-[var(--bg3)] p-[6px_8px] rounded-[4px] text-center">
            <div className="font-[var(--display)] text-[16px] text-[var(--text)] tracking-[0.5px]">
              {current?.humidity ?? '--'}%
            </div>
            <div className="font-[var(--mono)] text-[8px] text-[var(--text3)] tracking-[0.5px] uppercase mt-[2px]">
              Humidity
            </div>
          </div>
          <div className="flex-1 bg-[var(--bg3)] p-[6px_8px] rounded-[4px] text-center">
            <div className="font-[var(--display)] text-[16px] text-[var(--text)] tracking-[0.5px]">
              {current?.windSpeed ?? '--'}
            </div>
            <div className="font-[var(--mono)] text-[8px] text-[var(--text3)] tracking-[0.5px] uppercase mt-[2px]">
              Wind mph
            </div>
          </div>
          <div className="flex-1 bg-[var(--bg3)] p-[6px_8px] rounded-[4px] text-center">
            <div className="font-[var(--display)] text-[16px] text-[var(--text)] tracking-[0.5px]">
              {current?.precipitationProbability ?? '0'}%
            </div>
            <div className="font-[var(--mono)] text-[8px] text-[var(--text3)] tracking-[0.5px] uppercase mt-[2px]">
              Precip
            </div>
          </div>
        </div>
      </div>

      {upcomingHourly.length > 0 && (
        <div className="flex gap-[8px] overflow-x-auto p-[12px_14px] border-b border-[var(--border)] [&::-webkit-scrollbar]:h-[4px]">
          {upcomingHourly.map((h, i) => (
            <div key={i} className="flex-shrink-0 w-[calc(25%-6px)] flex flex-col items-center gap-[4px] bg-[var(--bg3)] py-[8px] rounded-[6px]">
              <div className="font-[var(--mono)] text-[9px] text-[var(--text2)]">
                {new Date(h.time).toLocaleTimeString([], { hour: 'numeric' })}
              </div>
              <div className="text-[16px]">{ICON_MAP[h.icon] || '🌤️'}</div>
              <div className="font-[var(--display)] text-[16px] text-[var(--text)]">
                {h.temperature ?? '--'}
              </div>
            </div>
          ))}
        </div>
      )}

      {wk.length > 0 && (
        <div className="p-[8px_14px_4px]">
          <div className="font-[var(--mono)] text-[8px] text-[var(--text3)] tracking-[1px] mb-[6px]">
            7-DAY FORECAST
          </div>
          <div className="flex flex-col gap-[2px]">
            {wk.map((day, i) => {
              const h = day.high ?? maxTempThisWeek;
              const l = day.low ?? minTempThisWeek;
              const leftPercent = ((l - minTempThisWeek) / tempRange) * 100;
              const widthPercent = ((h - l) / tempRange) * 100;

              return (
                <div key={i} className="flex items-center p-[4px_6px] rounded-[4px] transition-colors hover:bg-[rgba(255,255,255,0.03)]">
                  <div className="font-[var(--mono)] text-[10px] text-[var(--text2)] w-[40px]">
                    {i === 0 ? 'Today' : getDayAbbr(day.date)}
                  </div>
                  <div className="text-[14px] w-[24px] text-center">
                    {ICON_MAP[day.icon] || '🌤️'}
                  </div>
                  <div className="flex-1 mx-[10px] h-[4px] bg-[var(--bg3)] rounded-[2px] relative overflow-hidden">
                    <div 
                      className="absolute h-full rounded-[2px]" 
                      style={{
                        left: `${leftPercent}%`,
                        width: `${Math.max(widthPercent, 5)}%`,
                        background: 'linear-gradient(90deg, var(--accent) 0%, var(--green) 100%)'
                      }}
                    />
                  </div>
                  <div className="font-[var(--mono)] text-[10px] w-[50px] flex justify-end gap-[6px]">
                    <span className="text-[var(--text)] font-semibold">{h}°</span>
                    <span className="text-[var(--text3)]">{l}°</span>
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
