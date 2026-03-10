import React, { useState } from 'react';

const WeatherCard = ({ location }) => {
  const [hourlyOpen, setHourlyOpen] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);

  if (!location) return null;

  const { weather, error, label, city, state, zipCode } = location;
  const displayLabel = label || [city, state].filter(Boolean).join(', ') || 'Unknown';

  if (error && !weather) {
    return (
      <div className="p-3 bg-gray-50 rounded-xl ring-1 ring-gray-200">
        <p className="text-sm font-medium text-gray-700">{displayLabel}</p>
        <p className="text-xs text-gray-400 mt-1">{error}</p>
      </div>
    );
  }

  if (!weather) return null;

  const { current, high, low, hourly = [], weekly = [], updatedAt } = weather;
  const iconMap = {
    sun: '☀️',
    'cloud-sun': '⛅',
    cloud: '☁️',
    'cloud-fog': '🌫️',
    'cloud-drizzle': '🌦️',
    'cloud-rain': '🌧️',
    'cloud-snow': '🌨️',
    'cloud-lightning': '⛈️'
  };
  const currentIcon = iconMap[current?.icon] || '🌤️';

  return (
    <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl ring-1 ring-blue-200/60">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-semibold text-gray-800">{displayLabel}</p>
          {zipCode && <p className="text-[10px] text-gray-400">ZIP {zipCode}</p>}
        </div>
        {location.isPrimary && (
          <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">Primary</span>
        )}
      </div>

      {/* Current conditions */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-3xl" aria-hidden="true">{currentIcon}</span>
        <div>
          <p className="text-2xl font-bold text-gray-900">
            {current?.temperature != null ? `${current.temperature}°${current.temperatureUnit || 'F'}` : '--'}
          </p>
          <p className="text-xs text-gray-600">{current?.shortForecast || weather.forecastSummary || ''}</p>
        </div>
      </div>

      {/* High / Low */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-2">
        {high != null && <span>H: {high}°</span>}
        {low != null && <span>L: {low}°</span>}
        {current?.humidity != null && <span>Humidity: {current.humidity}%</span>}
        {current?.windSpeed != null && <span>💨 {current.windSpeed} mph</span>}
        {current?.precipitationProbability != null && <span>Rain: {current.precipitationProbability}%</span>}
      </div>

      {/* Updated timestamp */}
      {updatedAt && (
        <p className="text-[10px] text-gray-400 mb-2">Updated {new Date(updatedAt).toLocaleTimeString()}</p>
      )}

      {/* Hourly expand/collapse */}
      {hourly.length > 0 && (
        <div className="border-t border-blue-200/50 pt-2">
          <button
            onClick={() => setHourlyOpen(!hourlyOpen)}
            className="flex items-center justify-between w-full text-xs font-medium text-blue-700 hover:text-blue-800"
            aria-label={hourlyOpen ? 'Collapse hourly forecast' : 'Expand hourly forecast'}
          >
            <span>Hourly</span>
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 transition-transform ${hourlyOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {hourlyOpen && (
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {hourly.map((h, i) => (
                <div key={i} className="flex items-center justify-between text-[11px] text-gray-600">
                  <span>{new Date(h.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  <span className="font-medium">{h.temperature}°</span>
                  <span className="text-gray-400 truncate max-w-[110px]">{h.shortForecast} · {h.precipitationProbability ?? '--'}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Weekly expand/collapse */}
      {weekly.length > 0 && (
        <div className="border-t border-blue-200/50 pt-2 mt-2">
          <button
            onClick={() => setWeeklyOpen(!weeklyOpen)}
            className="flex items-center justify-between w-full text-xs font-medium text-blue-700 hover:text-blue-800"
            aria-label={weeklyOpen ? 'Collapse weekly forecast' : 'Expand weekly forecast'}
          >
            <span>Weekly</span>
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 transition-transform ${weeklyOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {weeklyOpen && (
            <div className="mt-2 space-y-1">
              {weekly.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-[11px] text-gray-600">
                  <span className="font-medium w-20">{d.name}</span>
                  <span>{d.high}° / {d.low}°</span>
                  <span className="text-gray-400 truncate max-w-[100px]">{d.shortForecast}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WeatherCard;
