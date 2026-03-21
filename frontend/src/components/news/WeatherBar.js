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

function formatClockLabel(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
  const upcoming = parsedHourly.filter(({ time }) => time > now);
  return (upcoming.length > 0 ? upcoming : parsedHourly).map(({ entry }) => entry);
}

function getHourlyStrip(hourly) {
  if (!Array.isArray(hourly) || hourly.length === 0) return [];

  const parsed = hourly
    .map((entry) => {
      const time = new Date(entry?.time);
      if (Number.isNaN(time.getTime())) return null;
      return { ...entry, _parsed: time };
    })
    .filter(Boolean)
    .sort((a, b) => a._parsed - b._parsed);

  if (parsed.length === 0) return [];

  const now = new Date();
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
  const windowStart = currentHour.getTime() - 60 * 60 * 1000;
  const windowEnd = currentHour.getTime() + 4 * 60 * 60 * 1000;

  return parsed
    .filter(({ _parsed }) => _parsed.getTime() >= windowStart && _parsed.getTime() <= windowEnd)
    .map(({ _parsed, ...entry }) => {
      const entryHour = new Date(_parsed.getFullYear(), _parsed.getMonth(), _parsed.getDate(), _parsed.getHours(), 0, 0, 0);
      return {
        ...entry,
        isCurrent: entryHour.getTime() === currentHour.getTime(),
      };
    });
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
        ? 'rounded-3xl shadow-lg overflow-hidden'
        : 'sticky top-0 z-30 bg-gradient-to-r from-blue-700 to-indigo-800 shadow-md'}
      style={isCard ? { background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #312e81 100%)' } : undefined}
    >
      <div className="px-5 py-4 flex items-center gap-3 text-white" style={isCard ? { background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' } : undefined}>
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
    <div className="rounded-lg bg-white/10 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-white">
        {badgeColor ? (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: badgeColor }}>
            {value}
          </span>
        ) : (
          <span className="font-semibold">{value}</span>
        )}
        {detail ? <span className="text-[11px] text-white/70">{detail}</span> : null}
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
  const [cardExpanded, setCardExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('hourly');
  const [carouselGroup, setCarouselGroup] = useState(0); // 0=d1-3, 1=d4-6, 2=d7
  const [fade, setFade] = useState(true);
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(0);
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

  // Determine the usable locations (up to 3)
  const usableLocations = locations.filter(hasUsableWeather).slice(0, 3);

  // For the card variant, use the selectedLocationIndex; for sticky, keep the old primary logic
  const primary = variant === 'card'
    ? (usableLocations[selectedLocationIndex] || usableLocations[0] || locations.find((location) => location.isPrimary) || locations[0] || null)
    : (locations.find((location) => location.isPrimary && hasUsableWeather(location)) ||
       locations.find(hasUsableWeather) ||
       locations.find((location) => location.isPrimary) ||
       locations[0] ||
       null);
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
        : 'bg-gradient-to-br from-slate-900 to-indigo-950 rounded-3xl h-14 flex items-center justify-center'}>
        <div className="w-5 h-5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!primary?.weather?.current) {
    return <WeatherUnavailableState variant={variant} message={getUnavailableMessage(locations, requestError)} />;
  }

  const { weather, label, city, state, zipCode } = primary;
  const { current, high, low, hourly = [], weekly: wk = [], uvIndex, airQuality, pollen } = weather;
  const upcomingHourly = getUpcomingHourlyForecast(hourly);
  const hourlyStrip = variant === 'card' ? getHourlyStrip(hourly) : [];
  const displayCity = formatLocationLine(primary) || label || city || '';
  const currentIcon = ICON_MAP[current?.icon] || '🌤️';
  const pressure = current?.pressure ?? null;
  const sunriseLabel = formatClockLabel(weather?.sunrise || wk?.[0]?.sunrise);
  const sunsetLabel = formatClockLabel(weather?.sunset || wk?.[0]?.sunset);

  // Carousel day slots
  const groupStart = carouselGroup * 3;
  const carouselDays = wk.slice(groupStart, groupStart + 3);

  const isCard = variant === 'card';

  if (isCard) {
    return (
      <section
        className="shrink-0 rounded-3xl shadow-lg overflow-hidden text-white"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #312e81 100%)' }}
      >
        <div className="p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
          {/* ── Header: city name + location selector ──────────────────── */}
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold leading-tight truncate">{displayCity}</h2>
            {usableLocations.length > 1 && (
              <select
                data-testid="weather-location-selector"
                value={selectedLocationIndex}
                onChange={(e) => setSelectedLocationIndex(Number(e.target.value))}
                className="max-w-[9.5rem] text-[11px] bg-white/10 border border-white/10 rounded-lg px-2 py-1 text-white/90 outline-none cursor-pointer hover:bg-white/15 transition-colors"
                style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
                aria-label="Select weather location"
              >
                {usableLocations.map((loc, i) => (
                  <option key={loc._id || i} value={i} className="bg-slate-800 text-white">
                    {formatLocationLine(loc) || loc.label || loc.city || `Location ${i + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* ── Main temperature display ───────────────────────────────── */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-5xl font-light tracking-tight leading-none">
                {current?.temperature != null ? `${current.temperature}°` : '--°'}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: '#9ca3af' }}>
                <span className="truncate max-w-[11rem]">
                  {current?.shortForecast || weather.forecastSummary || 'Loading...'}
                </span>
                {high != null && low != null ? (
                  <span>
                    <span aria-hidden="true">↑</span>
                    <span className="sr-only">High </span>
                    {high}°
                    <span className="ml-1" aria-hidden="true">↓</span>
                    <span className="sr-only">Low </span>
                    {low}°
                  </span>
                ) : null}
                {current?.humidity != null ? (
                  <span>
                    <span aria-hidden="true">💧</span>
                    <span className="sr-only">Humidity </span>
                    {current.humidity}%
                  </span>
                ) : null}
              </div>
            </div>
            <span className="text-4xl leading-none shrink-0" aria-hidden="true">{currentIcon}</span>
          </div>

          {/* ── Stats row: humidity, wind, precipitation ────────────────── */}
          <div className="grid grid-cols-3 mt-1 py-2.5 border-y border-white/5 text-center items-center">
            <div className="border-r border-white/5 flex flex-col items-center">
              <svg className="mb-1 opacity-40" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.7L12 2 8 9.3C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
              </svg>
              <p className="text-[10px] font-bold">{current?.humidity != null ? `${current.humidity}%` : '--%'}</p>
            </div>
            <div className="border-r border-white/5 flex flex-col items-center">
              <svg className="mb-1 opacity-40" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
              </svg>
              <p className="text-[10px] font-bold">{current?.windSpeed != null ? `${current.windSpeed} mph` : '-- mph'}</p>
            </div>
            <div className="flex flex-col items-center">
              <svg className="mb-1 opacity-40" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7" />
              </svg>
              <p className="text-[10px] font-bold">{current?.precipitationProbability != null ? `${current.precipitationProbability}%` : '--%'}</p>
            </div>
          </div>

          {/* ── Mini hourly strip ──────────────────────────────────────── */}
          {hourlyStrip.length > 0 && (
            <div data-testid="weather-hourly-strip" className="flex justify-between gap-0.5 mt-1">
              {hourlyStrip.map((h, i) => (
                <div
                  key={i}
                  className={`flex flex-col items-center gap-0.5 px-1 py-1 rounded-lg flex-1 min-w-0${h.isCurrent ? ' bg-white/15' : ''}`}
                >
                  <span className="text-[10px] text-white/50">
                    {h.isCurrent ? 'Now' : new Date(h.time).toLocaleTimeString([], { hour: 'numeric' })}
                  </span>
                  <span className="text-base leading-none" aria-hidden="true">{ICON_MAP[h.icon] || '🌤️'}</span>
                  <span className="text-[11px] font-medium">{h.temperature != null ? `${h.temperature}°` : '--°'}</span>
                  {h.precipitationProbability != null && (
                    <span className="text-[9px] text-blue-300">{h.precipitationProbability}%</span>
                  )}
                  {h.windSpeed != null && (
                    <span className="text-[9px] text-white/40">{h.windSpeed}mph</span>
                  )}
                </div>
              ))}
            </div>
          )}

              {/* ── Expanded section ────────────────────────────────────────── */}
              {cardExpanded && (
                <div data-testid="weather-card-expanded" className="space-y-3 pt-2">
                  {/* Hourly grid */}
                  {upcomingHourly.length > 0 && (
                    <div className="grid grid-cols-4 gap-1.5">
                      {upcomingHourly.slice(0, 8).map((h, i) => (
                        <div
                          key={i}
                          className="min-w-0 rounded-lg px-1.5 py-1 text-center leading-tight"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <p className="text-[9px]" style={{ color: '#9ca3af' }}>
                        {new Date(h.time).toLocaleTimeString([], { hour: 'numeric' })}
                      </p>
                      <p className="text-[11px] font-semibold mt-0.5">{h.temperature}°</p>
                      <div className="mt-0.5 space-y-0.5 text-[8px] text-white/70">
                        {h.precipitationProbability != null && (
                          <p className="flex items-center justify-center gap-1">
                            <span aria-hidden="true">💧</span>
                            <span>{h.precipitationProbability}%</span>
                          </p>
                        )}
                        {h.windGust != null && (
                          <p className="flex items-center justify-center gap-1">
                            <span aria-hidden="true">🌀</span>
                            <span className="sr-only">Gust </span>
                            <span>{h.windGust} mph</span>
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Daily forecast list */}
              {wk.length > 0 && (
                <div className="space-y-1.5">
                  {wk.map((day, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[2.5rem_1.25rem_minmax(0,1fr)_auto] items-start gap-2 p-2 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <p className="text-[11px] font-medium pt-0.5">{day.name || getDayAbbr(day.date)}</p>
                      <span className="text-sm leading-none pt-0.5" aria-hidden="true">{ICON_MAP[day.icon] || '🌤️'}</span>
                      <p className="min-w-0 text-[10px] leading-tight text-white/70 whitespace-normal break-words">
                        {day.shortForecast}
                      </p>
                      <div className="flex items-center gap-1 shrink-0 pt-0.5 text-[11px]">
                        <span className="font-semibold">{day.high != null ? `${day.high}°` : '--'}</span>
                        <span className="text-white/50">{day.low != null ? `${day.low}°` : '--'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Extra metrics */}
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

              {/* Metric badges */}
              <div className="flex flex-wrap gap-1.5 text-[9px] text-white/85">
                {high != null && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5">
                    <span aria-hidden="true">↑</span>
                    <span className="sr-only">High </span>
                    {' '}{high}°
                  </span>
                )}
                {low != null && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5">
                    <span aria-hidden="true">↓</span>
                    <span className="sr-only">Low </span>
                    {' '}{low}°
                  </span>
                )}
                {current?.humidity != null && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5">
                    <span aria-hidden="true">💧</span>
                    <span className="sr-only">Humidity </span>
                    {' '}{current.humidity}%
                  </span>
                )}
                {current?.windSpeed != null && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5">
                    <span aria-hidden="true">🌬️</span> Air {current.windSpeed} mph
                  </span>
                )}
                {current?.windGust != null && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5">
                    <span aria-hidden="true">🌀</span> Gust {current.windGust} mph
                  </span>
                )}
                {pressure != null && <span className="rounded-full bg-white/10 px-2 py-0.5">Pressure {Math.round(pressure)} hPa</span>}
                {airQuality?.index != null && <span className="rounded-full bg-white/10 px-2 py-0.5">AQI {airQuality.index}</span>}
                {sunriseLabel && <span className="rounded-full bg-white/10 px-2 py-0.5"><span aria-hidden="true">🌅</span> Sunrise {sunriseLabel}</span>}
                {sunsetLabel && <span className="rounded-full bg-white/10 px-2 py-0.5"><span aria-hidden="true">🌇</span> Sunset {sunsetLabel}</span>}
              </div>
            </div>
          )}

          {/* ── Toggle chevron ─────────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setCardExpanded((value) => !value)}
            aria-expanded={cardExpanded}
            aria-label={cardExpanded ? 'Collapse weather details' : 'Expand weather details'}
            className="w-full mt-2 flex justify-center opacity-20 hover:opacity-100 transition-all focus:outline-none"
          >
            <svg
              className={`transition-transform duration-300 ${cardExpanded ? 'rotate-180' : ''}`}
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
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
          {(upcomingHourly.length > 0 || wk.length > 0) && (
            <>
              <div className="flex gap-2 mt-1 mb-2">
                {upcomingHourly.length > 0 && (
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
              {activeTab === 'hourly' && upcomingHourly.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                  {upcomingHourly.slice(0, 12).map((h, i) => (
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
