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

function hasUsableWeather(location) {
  return Boolean(location?.weather?.current);
}

function formatLocationLine(location) {
  if (!location) return '';

  const baseLabel = location.city || location.label || '';
  if (!baseLabel) return location.zipCode ? `ZIP ${location.zipCode}` : '';
  if (!location.city) return location.zipCode && !String(baseLabel).includes(location.zipCode)
    ? `${baseLabel} ${location.zipCode}`
    : baseLabel;

  return [
    `${location.city}${location.state ? `, ${location.state}` : ''}`,
    location.zipCode || null,
  ].filter(Boolean).join(' ');
}

function getUnavailableMessage(locations, requestError) {
  if (requestError) {
    return 'Weather is temporarily unavailable. Try again in a moment.';
  }

  if (!locations.length) {
    return 'Add a weather or news location in preferences to load forecasts here.';
  }

  const firstError = locations.find((location) => location?.error);
  if (firstError?.error) {
    return firstError.error;
  }

  return 'No current weather data is available for your saved locations right now.';
}

function WeatherUnavailableState({ variant, message }) {
  const isCard = variant === 'card';

  return (
    <div
      className={isCard
        ? 'bg-gradient-to-br from-blue-700 to-indigo-800 rounded-2xl shadow-lg overflow-hidden'
        : 'sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-indigo-800 shadow-md'}
    >
      <div className="px-3 py-2.5 flex items-center gap-3 text-white">
        <span className="text-2xl shrink-0" aria-hidden="true">🌤️</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">Weather unavailable</div>
          <div className="text-[11px] text-white/80 leading-tight">{message}</div>
        </div>
      </div>
    </div>
  );
}

function WeatherMetric({ label, value, badgeColor = null, detail = null }) {
  if (value == null || value === '') return null;

  return (
    <div className="rounded-xl bg-white/10 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-sm text-white">
        {badgeColor ? (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: badgeColor }}>
            {value}
          </span>
        ) : (
          <span className="font-semibold">{value}</span>
        )}
        {detail ? <span className="text-xs text-white/70">{detail}</span> : null}
      </div>
    </div>
  );
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
  const [requestError, setRequestError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('hourly');
  const [carouselGroup, setCarouselGroup] = useState(0); // 0=d1-3, 1=d4-6, 2=d7
  const [fade, setFade] = useState(true);
  const intervalRef = useRef(null);

  useEffect(() => {
    newsAPI.getWeather()
      .then((r) => {
        setLocations(r.data?.locations || []);
        setRequestError(null);
      })
      .catch((error) => {
        console.error(error);
        setLocations([]);
        setRequestError(error);
      })
      .finally(() => setLoading(false));
  }, []);

  const primary =
    locations.find((location) => location.isPrimary && hasUsableWeather(location)) ||
    locations.find(hasUsableWeather) ||
    locations.find((location) => location.isPrimary) ||
    locations[0] ||
    null;
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

  useEffect(() => {
    if (carouselGroup >= totalGroups) {
      setCarouselGroup(0);
    }
  }, [carouselGroup, totalGroups]);

  if (loading) {
    return (
      <div className={variant === 'sticky'
        ? 'sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-indigo-700 h-14 flex items-center justify-center'
        : 'bg-gradient-to-br from-blue-700 to-indigo-700 rounded-2xl h-14 flex items-center justify-center'}>
        <div className="w-5 h-5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!primary?.weather?.current) {
    return <WeatherUnavailableState variant={variant} message={getUnavailableMessage(locations, requestError)} />;
  }

  const { weather, label, city, state, zipCode } = primary;
  const { current, high, low, hourly = [], weekly: wk = [], uvIndex, airQuality, pollen } = weather;
  const displayCity = formatLocationLine(primary) || label || city || '';
  const currentIcon = ICON_MAP[current?.icon] || '🌤️';

  // Carousel day slots
  const groupStart = carouselGroup * 3;
  const carouselDays = wk.slice(groupStart, groupStart + 3);

  const isCard = variant === 'card';

  if (isCard) {
    return (
      <section className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 rounded-2xl shadow-lg overflow-hidden">
        <div className="px-4 pt-3 pb-2.5 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Weather</div>
              <div className="mt-1 text-base font-semibold text-white leading-tight">{displayCity}</div>
              <div className="mt-1 text-sm text-white/70">{current?.shortForecast || weather.forecastSummary || 'Current conditions unavailable'}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-3xl leading-none" aria-hidden="true">{currentIcon}</div>
              <div className="mt-1.5 text-4xl font-bold text-white leading-none">
                {current?.temperature != null ? `${current.temperature}°` : '--'}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-white/80">
            {high != null && <span className="rounded-full bg-white/10 px-2.5 py-1">High {high}°</span>}
            {low != null && <span className="rounded-full bg-white/10 px-2.5 py-1">Low {low}°</span>}
            {current?.humidity != null && <span className="rounded-full bg-white/10 px-2.5 py-1">Humidity {current.humidity}%</span>}
            {current?.windSpeed != null && <span className="rounded-full bg-white/10 px-2.5 py-1">Wind {current.windSpeed} mph</span>}
          </div>
        </div>

        <div className="px-4 py-2.5 space-y-2.5">
          {(uvIndex != null || airQuality != null || pollen != null) && (
            <div className="grid grid-cols-1 gap-2">
              <WeatherMetric label="UV Index" value={uvIndex} badgeColor={UV_COLOR(uvIndex)} />
              <WeatherMetric label="Air Quality" value={airQuality?.index} badgeColor={AQI_COLOR(airQuality?.index)} detail={airQuality?.label || null} />
              <WeatherMetric
                label="Pollen"
                value={pollen ? [
                  pollen.grass != null ? `Grass ${Math.round(pollen.grass)}` : null,
                  pollen.birch != null ? `Birch ${Math.round(pollen.birch)}` : null,
                  pollen.ragweed != null ? `Ragweed ${Math.round(pollen.ragweed)}` : null,
                ].filter(Boolean).join(' · ') : null}
              />
            </div>
          )}

          {(hourly.length > 0 || wk.length > 0) && (
            <>
              <div className="flex gap-2">
                {hourly.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('hourly')}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                      activeTab === 'hourly'
                        ? 'bg-white text-blue-700'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    Hourly
                  </button>
                )}
                {wk.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('weekly')}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                      activeTab === 'weekly'
                        ? 'bg-white text-blue-700'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    5-Day
                  </button>
                )}
              </div>

              {activeTab === 'hourly' && hourly.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {hourly.slice(0, 8).map((h, i) => (
                    <div key={i} className="rounded-xl bg-white/8 px-2 py-2 text-center text-white/80">
                      <div className="text-[10px]">{new Date(h.time).toLocaleTimeString([], { hour: 'numeric' })}</div>
                      <div className="mt-1 text-base">{ICON_MAP[h.icon] || '🌤️'}</div>
                      <div className="mt-1 text-sm font-semibold text-white">{h.temperature}°</div>
                      <div className="text-[10px]">{h.precipitationProbability ?? '--'}%</div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'weekly' && wk.length > 0 && (
                <div className="space-y-2">
                  {wk.map((day, index) => (
                    <div key={index} className="flex items-center gap-3 rounded-xl bg-white/8 px-3 py-1.5 text-sm text-white/85">
                      <div className="w-10 font-medium">{getDayAbbr(day.date)}</div>
                      <div className="text-lg">{ICON_MAP[day.icon] || '🌤️'}</div>
                      <div className="w-20 font-semibold text-white">{day.high}° / {day.low}°</div>
                      <div className="min-w-0 flex-1 truncate text-white/70">{day.shortForecast}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    );
  }

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
            {current?.windGust != null && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm" aria-hidden="true">cyclone</span>
                Gusts {current.windGust} mph
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
                    <div key={i} className="flex min-w-[76px] flex-col items-center shrink-0 rounded-xl bg-white/10 px-2 py-2 text-[10px] text-white/80 gap-0.5">
                      <span>{new Date(h.time).toLocaleTimeString([], { hour: 'numeric' })}</span>
                      <span className="text-sm">{ICON_MAP[h.icon] || '🌤️'}</span>
                      <span className="font-semibold text-white">{h.temperature}°</span>
                      <span>Rain {h.precipitationProbability ?? '--'}%</span>
                      <span>Wind {h.windSpeed ?? '--'} mph</span>
                      <span>Gust {h.windGust ?? '--'} mph</span>
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
