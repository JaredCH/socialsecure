import React, { useState, useEffect, useCallback } from 'react';
import { newsAPI } from '../../../utils/api';
import WeatherCard from './WeatherCard';

const WeatherWidget = () => {
  const [weatherData, setWeatherData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchWeather = useCallback(async () => {
    try {
      setLoading(true);
      const res = await newsAPI.getWeather();
      setWeatherData(res.data.locations || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching weather:', err);
      setError('Unable to load weather');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/70 p-5">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">🌤️ Weather</h2>
        <div className="space-y-3 animate-pulse">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error && weatherData.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/70 p-5">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">🌤️ Weather</h2>
        <p className="text-xs text-gray-400">{error}</p>
      </div>
    );
  }

  if (weatherData.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/70 p-5">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">🌤️ Weather</h2>
        <p className="text-xs text-gray-400">No weather locations configured. Add locations in preferences.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/70 p-5">
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">🌤️ Weather</h2>
      <div className="space-y-3">
        {weatherData.map((loc, i) => (
          <WeatherCard key={loc._id || i} location={loc} />
        ))}
      </div>
    </div>
  );
};

export default WeatherWidget;
