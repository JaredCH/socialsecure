import React, { useState, useEffect, useRef } from 'react';
import { newsAPI } from '../../utils/api';

/**
 * WeatherBar — sticky weather header.
 *
 * Mobile: sits below the main navbar as a sticky strip.
 * Desktop: rendered in the right sidebar as a full card (pass variant="card").
 *
 * Collapsed view shows:
 *   Left side  — icon, temp, sky description, H/L, humidity, city/state/zip
 *   Right side — 3-slot day carousel cycling [d1-d3] → [d4-d6] → [d7,wrap]
 *                every 8 seconds with a CSS fade transition
 *
 * Expanded view shows:
 *   Full current conditions (UV, AQI, pollen, wind, precip)
 *   Tab pills: Hourly scroll row | Weekly 7-day list
 */

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

const UV_COLOR = (v) =>
  v == null ? '#9ca3af'
  : v <= 2  ? '#16a34a'
  : v <= 5  ? '#ca8a04'
  : v <= 7  ? '#ea580c'
  : v <= 10 ? '#dc2626'
  : '#7c3aed';

const AQI_COLOR = (v) =>
  v == null ? '#9ca3af'
  : v <= 50  ? '#16a34a'
  : v <= 100 ? '#ca8a04'
  : v <= 150 ? '#ea580c'
  : v <= 200 ? '#dc2626'
  : '#7c3aed';

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDayAbbr(dateStr) {
  try { return DAY_ABBR[new Date(dateStr).getDay()]; } catch { return ''; }
}

// ─── Day forecast carousel slot (3 per group) ────────────────────────────────
function DaySlot({ day }) {
  if (!day) return <div className="flex-1" />;
  const icon = ICON_MAP[day.icon] || '🌤️';
  return (
    <div className="flex flex-col items-center leading-none gap-0.5 flex-1">
      <span className="text-[10px] font-medium text-white/80 uppercase">{getDayAbbr(day.date)}</span>
      <span className="text-base leading-none">{icon}</span>
      <span className="text-[10px] font-semibold text-white">
        {day.high != null ? `${day.high}°` : '--'}
        <span className="font-normal text-white/60"> / {day.low != null ? `${day.low}°` : '--'}</span>
      </span>
      <span className="text-[9px] text-white/60 truncate max-w-[52px] text-center leading-tight">{day.shortForecast || ''}</span>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function WeatherBar({ variant = 'sticky' }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('hourly');
  const [carouselGroup, setCarouselGroup] = useState(0); // 0=d1-3, 1=d4-6, 2=d7
  const [fade, setFade] = useState(true);
  const intervalRef = useRef(null);

  useEffect(() => {
    newsAPI.getWeather()
      .then((r) => setLocations(r.data?.locations || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const primary = locations.find((l) => l.isPrimary) || locations[0];
  const weekly = primary?.weather?.weekly || [];
  const totalGroups = weekly.length > 0 ? Math.ceil(weekly.length / 3) : 0;

  // Carousel: cycle through groups of 3 days every 8 seconds
  useEffect(() => {
    if (totalGroups <= 1) return;
    intervalRef.current = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setCarouselGroup((g) => (g + 1) % totalGroups);
        setFade(true);
      }, 200);
    }, 8000);
    return () => clearInterval(intervalRef.current);
  }, [totalGroups]);

  if (loading) {
    return (
      <div className={variant === 'sticky'
        ? 'sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-indigo-700 h-14 flex items-center justify-center'
        : 'bg-gradient-to-br from-blue-700 to-indigo-700 rounded-2xl h-14 flex items-center justify-center'}>
        <div className="w-5 h-5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!primary?.weather?.current) return null;

  const { weather, label, city, state, zipCode } = primary;
  const { current, high, low, hourly = [], weekly: wk = [], uvIndex, airQuality, pollen } = weather;
  const displayCity = city || label || '';
  const currentIcon = ICON_MAP[current?.icon] || '🌤️';

  // Carousel day slots
  const groupStart = carouselGroup * 3;
  const carouselDays = wk.slice(groupStart, groupStart + 3);

  const isCard = variant === 'card';

  return (
    <div
      className={`${isCard
        ? 'bg-gradient-to-br from-blue-700 to-indigo-800 rounded-2xl shadow-lg overflow-hidden'
        : 'sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-indigo-800 shadow-md'
      } transition-all duration-300`}
    >
      {/* ── Collapsed row ─────────────────────────────────────────────────── */}
      <button
        className="w-full px-3 py-2 flex items-center gap-3 text-left"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse weather' : 'Expand weather'}
      >
        {/* Current weather — left */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-2xl shrink-0" aria-hidden="true">{currentIcon}</span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xl font-bold text-white leading-none">
                {current?.temperature != null ? `${current.temperature}°` : '--'}
              </span>
              <span className="text-xs text-white/80 truncate max-w-[120px]">
                {current?.shortForecast || ''}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-white/70 mt-0.5 flex-wrap">
              {high != null && <span>H: {high}°</span>}
              {low != null && <span>L: {low}°</span>}
              {current?.humidity != null && <span>{current.humidity}% hum</span>}
              {displayCity && (
                <span className="font-medium text-white/90 truncate max-w-[100px]">
                  {displayCity}{state ? `, ${state}` : ''}
                  {zipCode ? ` ${zipCode}` : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Day carousel — right (hidden on very small screens) */}
        {wk.length > 0 && (
          <div
            className={`hidden sm:flex items-stretch gap-1 shrink-0 transition-opacity duration-200 ${fade ? 'opacity-100' : 'opacity-0'}`}
            style={{ minWidth: 160 }}
          >
            {[0, 1, 2].map((i) => <DaySlot key={i} day={carouselDays[i]} />)}
          </div>
        )}

        {/* Chevron */}
        <span
          className={`material-symbols-outlined text-white/80 text-base shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>

      {/* ── Expanded panel ────────────────────────────────────────────────── */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-white/20">
          {/* Full current conditions */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 py-2 text-xs text-white/90">
            {current?.humidity != null && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm" aria-hidden="true">humidity_percentage</span>
                Humidity {current.humidity}%
              </span>
            )}
            {current?.windSpeed != null && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm" aria-hidden="true">air</span>
                Wind {current.windSpeed} mph
              </span>
            )}
            {current?.precipitationProbability != null && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm" aria-hidden="true">water_drop</span>
                Rain {current.precipitationProbability}%
              </span>
            )}
            {uvIndex != null && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm" aria-hidden="true">sunny</span>
                UV
                <span
                  className="font-bold px-1 rounded-full text-white text-[10px]"
                  style={{ backgroundColor: UV_COLOR(uvIndex) }}
                >{uvIndex}</span>
              </span>
            )}
            {airQuality != null && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm" aria-hidden="true">air</span>
                AQI
                <span
                  className="font-bold px-1 rounded-full text-white text-[10px]"
                  style={{ backgroundColor: AQI_COLOR(airQuality.index) }}
                >{airQuality.index}</span>
                <span className="text-white/70">{airQuality.label}</span>
              </span>
            )}
            {pollen != null && (
              <span className="flex items-center gap-1 col-span-full">
                🌿
                {pollen.grass != null && <span>Grass {Math.round(pollen.grass)}</span>}
                {pollen.birch != null && <span>Birch {Math.round(pollen.birch)}</span>}
                {pollen.ragweed != null && <span>Ragweed {Math.round(pollen.ragweed)}</span>}
              </span>
            )}
          </div>

          {/* Tab pills */}
          {(hourly.length > 0 || wk.length > 0) && (
            <>
              <div className="flex gap-2 mt-1 mb-2">
                {hourly.length > 0 && (
                  <button
                    onClick={() => setActiveTab('hourly')}
                    className={`text-xs font-medium px-2.5 py-0.5 rounded-full transition-colors ${
                      activeTab === 'hourly'
                        ? 'bg-white text-blue-700'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    Hourly
                  </button>
                )}
                {wk.length > 0 && (
                  <button
                    onClick={() => setActiveTab('weekly')}
                    className={`text-xs font-medium px-2.5 py-0.5 rounded-full transition-colors ${
                      activeTab === 'weekly'
                        ? 'bg-white text-blue-700'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    7-Day
                  </button>
                )}
              </div>

              {/* Hourly row */}
              {activeTab === 'hourly' && hourly.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                  {hourly.slice(0, 12).map((h, i) => (
                    <div key={i} className="flex flex-col items-center shrink-0 text-[10px] text-white/80 gap-0.5">
                      <span>{new Date(h.time).toLocaleTimeString([], { hour: 'numeric' })}</span>
                      <span className="text-sm">{ICON_MAP[h.icon] || '🌤️'}</span>
                      <span className="font-semibold text-white">{h.temperature}°</span>
                      <span>{h.precipitationProbability ?? '--'}%</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Weekly list */}
              {activeTab === 'weekly' && wk.length > 0 && (
                <div className="space-y-1">
                  {wk.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-white/90">
                      <span className="font-medium w-8">{getDayAbbr(d.date)}</span>
                      <span className="text-base">{ICON_MAP[d.icon] || '🌤️'}</span>
                      <span className="text-white font-semibold">{d.high}°</span>
                      <span className="text-white/60">{d.low}°</span>
                      <span className="text-white/70 truncate">{d.shortForecast}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
