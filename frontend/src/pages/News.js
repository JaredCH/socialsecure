import React, { useState, useEffect } from 'react';
import { newsAPI } from '../utils/api';

// Define all available categories
const ALL_CATEGORIES = [
  { id: 'technology', name: 'Technology', icon: '💻' },
  { id: 'science', name: 'Science', icon: '🔬' },
  { id: 'health', name: 'Health', icon: '🏥' },
  { id: 'business', name: 'Business', icon: '💼' },
  { id: 'sports', name: 'Sports', icon: '⚽' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬' },
  { id: 'politics', name: 'Politics', icon: '🏛️' },
  { id: 'finance', name: 'Finance', icon: '📈' },
  { id: 'gaming', name: 'Gaming', icon: '🎮' },
  { id: 'ai', name: 'AI & Machine Learning', icon: '🤖' },
];

const NEWS_SCOPES = [
  { id: 'local', label: 'Local' },
  { id: 'regional', label: 'Regional' },
  { id: 'national', label: 'National' },
  { id: 'global', label: 'Global' }
];

const SOURCE_FORMAT_GUIDANCE = {
  rss: 'Standard RSS/Atom feed URL (usually ends in /rss, /feed, or .xml)',
  podcast: 'Podcast RSS feed URL from Apple, Spotify, or publisher-hosted feed',
  youtube: 'YouTube channel URL (we auto-convert it to the channel RSS format)',
  googleNews: 'Google News query feed URL',
  government: 'Official government or public-service feed URL'
};

// Format relative time (e.g., "2 hours ago")
const formatRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return date.toLocaleDateString();
};

// Source type icon/label
const getSourceTypeLabel = (sourceType) => {
  const labels = {
    rss: 'RSS',
    googleNews: 'Google',
    youtube: '📺 YouTube',
    podcast: '🎙️ Podcast',
    government: '🏛️ Government',
    gdlet: 'GDLET'
  };
  return labels[sourceType] || sourceType;
};

function News() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [promotedArticles, setPromotedArticles] = useState([]);
  const [promotedLoading, setPromotedLoading] = useState(true);
  const [promotedError, setPromotedError] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [topics, setTopics] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [activeScope, setActiveScope] = useState('global');
  const [scopeFallbackMessage, setScopeFallbackMessage] = useState('');
  const [availableSources, setAvailableSources] = useState([]);
  const [newSource, setNewSource] = useState({
    name: '',
    url: '',
    type: 'rss',
    category: 'general'
  });
  const [sourceStatusMessage, setSourceStatusMessage] = useState('');
  
  // Location form state
  const [newLocation, setNewLocation] = useState({
    city: '',
    state: '',
    country: ''
  });
  
  // Hidden categories state (from preferences)
  const [hiddenCategories, setHiddenCategories] = useState([]);
  
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  // Fetch initial data
  useEffect(() => {
    bootstrap();
  }, []);

  const loadPromoted = async (topicFilter = activeFilter) => {
    try {
      setPromotedLoading(true);
      const promotedRes = await newsAPI.getPromoted({
        limit: 8,
        topic: topicFilter !== 'all' ? topicFilter : undefined
      });
      setPromotedArticles(promotedRes.data.items || []);
      setPromotedError(null);
    } catch (err) {
      console.error('Error loading promoted news:', err);
      setPromotedError('Failed to load promoted news');
    } finally {
      setPromotedLoading(false);
    }
  };

  const bootstrap = async () => {
    try {
      setLoading(true);
      setPromotedLoading(true);
      
      const [feedRes, prefsRes, topicsRes, promotedRes] = await Promise.all([
        newsAPI.getFeed({ page: 1, limit: 20 }),
        newsAPI.getPreferences().catch(() => ({ data: { preferences: null } })),
        newsAPI.getTopics(),
        newsAPI.getPromoted({ limit: 8 }).catch(() => ({ data: { items: [] } }))
      ]);
      const sourcesRes = await newsAPI.getSources().catch(() => ({ data: { sources: [] } }));
      
      setArticles(feedRes.data.articles);
      setPagination(feedRes.data.pagination);
      setPreferences(prefsRes.data.preferences);
      setActiveScope(feedRes.data.personalization?.activeScope || prefsRes.data.preferences?.defaultScope || 'global');
      if (feedRes.data.personalization?.fallbackApplied) {
        setScopeFallbackMessage(`Showing ${feedRes.data.personalization.activeScope} scope because ${feedRes.data.personalization.requestedScope} scope is unavailable for your current location data.`);
      } else {
        setScopeFallbackMessage('');
      }
      setTopics(topicsRes.data.topics);
      setPromotedArticles(promotedRes.data.items || []);
      setAvailableSources(sourcesRes.data.sources || []);
      setPromotedError(null);
      
      // Set hidden categories from preferences
      if (prefsRes.data.preferences?.hiddenCategories) {
        setHiddenCategories(prefsRes.data.preferences.hiddenCategories);
      }
      
      setError(null);
    } catch (err) {
      console.error('Error loading news:', err);
      setError('Failed to load news feed');
    } finally {
      setLoading(false);
      setPromotedLoading(false);
    }
  };

  // Load more articles
  const loadMore = async () => {
    if (pagination.page >= pagination.pages) return;
    
    try {
      const nextPage = pagination.page + 1;
        const res = await newsAPI.getFeed({ 
          page: nextPage, 
          limit: 20,
          topic: activeFilter !== 'all' ? activeFilter : undefined,
          scope: activeScope
        });
      
      setArticles(prev => [...prev, ...res.data.articles]);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error('Error loading more:', err);
    }
  };

  // Filter by topic
  const handleFilterChange = async (topic) => {
    setActiveFilter(topic);
    setLoading(true);
    
    try {
      const res = await newsAPI.getFeed({ 
        page: 1, 
        limit: 20,
        topic: topic !== 'all' ? topic : undefined,
        scope: activeScope
      });
      
      setArticles(res.data.articles);
      setPagination(res.data.pagination);
      if (res.data.personalization?.fallbackApplied) {
        setScopeFallbackMessage(`Showing ${res.data.personalization.activeScope} scope because ${res.data.personalization.requestedScope} scope is unavailable for your current location data.`);
      } else {
        setScopeFallbackMessage('');
      }
      await loadPromoted(topic);
    } catch (err) {
      console.error('Error filtering:', err);
    } finally {
      setLoading(false);
    }
  };

  // Add keyword
  const handleAddKeyword = async (e) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    
    try {
      const res = await newsAPI.addKeyword(newKeyword.trim());
      setPreferences(res.data.preferences);
      setNewKeyword('');
    } catch (err) {
      console.error('Error adding keyword:', err);
    }
  };

  // Remove keyword
  const handleRemoveKeyword = async (keyword) => {
    try {
      const res = await newsAPI.removeKeyword(keyword);
      setPreferences(res.data.preferences);
    } catch (err) {
      console.error('Error removing keyword:', err);
    }
  };

  const handleScopeChange = async (scope) => {
    setActiveScope(scope);
    setLoading(true);
    try {
      const res = await newsAPI.getFeed({
        page: 1,
        limit: 20,
        topic: activeFilter !== 'all' ? activeFilter : undefined,
        scope
      });
      setArticles(res.data.articles);
      setPagination(res.data.pagination);
      setActiveScope(res.data.personalization?.activeScope || scope);
      if (res.data.personalization?.fallbackApplied) {
        setScopeFallbackMessage(`Showing ${res.data.personalization.activeScope} scope because ${res.data.personalization.requestedScope} scope is unavailable for your current location data.`);
      } else {
        setScopeFallbackMessage('');
      }
      await loadPromoted(activeFilter);
    } catch (err) {
      console.error('Error updating feed scope:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDefaultScopeChange = async (defaultScope) => {
    if (!preferences) return;
    try {
      const res = await newsAPI.updatePreferences({ defaultScope });
      setPreferences(res.data.preferences);
    } catch (err) {
      console.error('Error updating default scope:', err);
    }
  };

  // Toggle Google News
  const handleToggleGoogleNews = async () => {
    if (!preferences) return;
    
    try {
      const res = await newsAPI.updatePreferences({
        googleNewsEnabled: !preferences.googleNewsEnabled
      });
      setPreferences(res.data.preferences);
    } catch (err) {
      console.error('Error updating preferences:', err);
    }
  };

  // Add location
  const handleAddLocation = async (e) => {
    e.preventDefault();
    if (!newLocation.city.trim() && !newLocation.state.trim() && !newLocation.country.trim()) return;
    
    try {
      const res = await newsAPI.addLocation(newLocation);
      setPreferences(res.data.preferences);
      setNewLocation({ city: '', state: '', country: '' });
    } catch (err) {
      console.error('Error adding location:', err);
    }
  };

  // Remove location
  const handleRemoveLocation = async (locationId) => {
    try {
      const res = await newsAPI.removeLocation(locationId);
      setPreferences(res.data.preferences);
    } catch (err) {
      console.error('Error removing location:', err);
    }
  };

  // Toggle source enabled
  const handleToggleSource = async (sourceId, currentEnabled) => {
    if (!preferences) return;
    
    const normalizedSourceId = String(sourceId);
    const currentSourcePrefs = preferences.rssSources || [];
    const existingIndex = currentSourcePrefs.findIndex((sourcePref) => {
      const prefSourceId = typeof sourcePref.sourceId === 'object'
        ? sourcePref.sourceId?._id
        : sourcePref.sourceId;
      return String(prefSourceId) === normalizedSourceId;
    });
    const updatedSources = [...currentSourcePrefs];
    if (existingIndex >= 0) {
      updatedSources[existingIndex] = { ...updatedSources[existingIndex], enabled: !currentEnabled };
    } else {
      updatedSources.push({ sourceId: normalizedSourceId, enabled: !currentEnabled });
    }
    
    try {
      const res = await newsAPI.updatePreferences({ rssSources: updatedSources });
      setPreferences(res.data.preferences);
    } catch (err) {
      console.error('Error updating source:', err);
    }
  };

  const handleAddSource = async (e) => {
    e.preventDefault();
    if (!newSource.name.trim() || !newSource.url.trim()) return;

    try {
      await newsAPI.addSource({
        name: newSource.name.trim(),
        url: newSource.url.trim(),
        type: newSource.type,
        category: newSource.category.trim() || 'general'
      });
      const sourcesRes = await newsAPI.getSources();
      setAvailableSources(sourcesRes.data.sources || []);
      setNewSource({
        name: '',
        url: '',
        type: 'rss',
        category: 'general'
      });
      setSourceStatusMessage('Source saved successfully.');
    } catch (err) {
      console.error('Error adding source:', err);
      setSourceStatusMessage('Failed to add source. Please verify feed URL and try again.');
    }
  };

  const isSourceEnabled = (sourceId) => {
    const sourcePreference = preferences?.rssSources?.find((sourcePref) => {
      const prefSourceId = typeof sourcePref.sourceId === 'object'
        ? sourcePref.sourceId?._id
        : sourcePref.sourceId;
      return String(prefSourceId) === String(sourceId);
    });
    if (!sourcePreference) return true;
    return sourcePreference.enabled !== false;
  };

  // Toggle category visibility
  const handleToggleCategory = async (categoryId) => {
    const newHidden = hiddenCategories.includes(categoryId)
      ? hiddenCategories.filter(c => c !== categoryId)
      : [...hiddenCategories, categoryId];
    
    setHiddenCategories(newHidden);
    
    try {
      const res = await newsAPI.updateHiddenCategories(newHidden);
      setPreferences(res.data.preferences);
    } catch (err) {
      console.error('Error updating hidden categories:', err);
      // Revert on error
      setHiddenCategories(hiddenCategories);
    }
  };

  // Get visible categories (filter out hidden ones)
  const visibleCategories = ALL_CATEGORIES.filter(
    cat => !hiddenCategories.includes(cat.id)
  );

  if (loading && articles.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-48 mb-6"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">📰 Latest News</h1>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              <span>⚙️</span>
              <span>Configure</span>
            </button>
          </div>
          
          {/* Topic Filters - Only show visible categories */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
            {NEWS_SCOPES.map((scopeOption) => (
              <button
                key={scopeOption.id}
                onClick={() => handleScopeChange(scopeOption.id)}
                className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  activeScope === scopeOption.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                }`}
              >
                {scopeOption.label}
              </button>
            ))}
          </div>
          {scopeFallbackMessage && (
            <p className="text-xs text-amber-600 mt-2">{scopeFallbackMessage}</p>
          )}

          {/* Topic Filters - Only show visible categories */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
            <button
              onClick={() => handleFilterChange('all')}
              className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                activeFilter === 'all' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All
            </button>
            {visibleCategories.map(category => (
              <button
                key={category.id}
                onClick={() => handleFilterChange(category.id)}
                className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  activeFilter === category.id 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {category.icon} {category.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <h2 className="text-xl font-semibold mb-4">News Preferences</h2>
            
            {/* Default Scope */}
            <div className="py-3 border-b border-gray-200">
              <h3 className="font-medium">Default News Scope</h3>
              <p className="text-sm text-gray-500 mb-2">Choose which scope opens by default each time you load News</p>
              <select
                value={preferences?.defaultScope || 'global'}
                onChange={(e) => handleDefaultScopeChange(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
              >
                {NEWS_SCOPES.map((scopeOption) => (
                  <option key={scopeOption.id} value={scopeOption.id}>
                    {scopeOption.label}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Google News Toggle */}
            <div className="flex items-center justify-between py-3 border-b border-gray-200">
              <div>
                <h3 className="font-medium">Google News Integration</h3>
                <p className="text-sm text-gray-500">Include Google News in your feed</p>
              </div>
              <button
                onClick={handleToggleGoogleNews}
                className={`w-12 h-6 rounded-full transition-colors ${
                  preferences?.googleNewsEnabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  preferences?.googleNewsEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            
            {/* Category Visibility Configuration */}
            <div className="py-3 border-b border-gray-200">
              <h3 className="font-medium mb-3">Category Visibility</h3>
              <p className="text-sm text-gray-500 mb-3">Toggle categories to show or hide them from your feed</p>
              <div className="flex flex-wrap gap-2">
                {ALL_CATEGORIES.map(category => {
                  const isHidden = hiddenCategories.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      onClick={() => handleToggleCategory(category.id)}
                      className={`px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5 transition-colors ${
                        isHidden 
                          ? 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      }`}
                    >
                      <span>{category.icon}</span>
                      <span>{category.name}</span>
                      {isHidden ? (
                        <span className="text-xs">🚫</span>
                      ) : (
                        <span className="text-xs">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Followed Keywords */}
            <div className="py-3 border-b border-gray-200">
              <h3 className="font-medium mb-3">Followed Keywords</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {preferences?.followedKeywords?.map((item) => (
                  <span 
                    key={item.keyword}
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full flex items-center gap-2"
                  >
                    {item.keyword}
                    <button
                      onClick={() => handleRemoveKeyword(item.keyword)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <form onSubmit={handleAddKeyword} className="flex gap-2">
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="Add keyword (e.g., AI, Bitcoin)"
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Add
                </button>
              </form>
            </div>

            {/* RSS Source Catalog + Custom Source Input */}
            <div className="py-3 border-b border-gray-200">
              <h3 className="font-medium mb-3">RSS Sources & Feed Catalog</h3>
              <p className="text-sm text-gray-500 mb-3">
                Choose which catalog sources are enabled and add your own feed links to fully customize your news mix.
              </p>
              <div className="space-y-2 mb-4">
                {availableSources.map((source) => {
                  const enabled = isSourceEnabled(source._id);
                  return (
                    <div key={source._id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{source.name}</p>
                        <p className="text-xs text-gray-500">
                          {getSourceTypeLabel(source.type)} • {source.category || 'general'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleToggleSource(source._id, enabled)}
                        className={`w-12 h-6 rounded-full transition-colors shrink-0 ${enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                        aria-label={`Toggle ${source.name}`}
                      >
                        <div className={`w-5 h-5 bg-white rounded-full transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  );
                })}
                {availableSources.length === 0 && (
                  <p className="text-sm text-gray-500">No shared sources are available yet.</p>
                )}
              </div>
              <form onSubmit={handleAddSource} className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newSource.name}
                    onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                    placeholder="Source name"
                    className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                  <input
                    type="url"
                    value={newSource.url}
                    onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                    placeholder="Feed URL"
                    className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                  <select
                    value={newSource.type}
                    onChange={(e) => setNewSource({ ...newSource, type: e.target.value })}
                    className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  >
                    <option value="rss">RSS / Atom</option>
                    <option value="podcast">Podcast</option>
                    <option value="youtube">YouTube</option>
                    <option value="googleNews">Google News</option>
                    <option value="government">Government</option>
                  </select>
                  <input
                    type="text"
                    value={newSource.category}
                    onChange={(e) => setNewSource({ ...newSource, category: e.target.value })}
                    placeholder="Category (news, sports, podcast)"
                    className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Format hint: {SOURCE_FORMAT_GUIDANCE[newSource.type] || SOURCE_FORMAT_GUIDANCE.rss}
                </p>
                {sourceStatusMessage && (
                  <p className="text-xs text-gray-600">{sourceStatusMessage}</p>
                )}
                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Add Source
                </button>
              </form>
            </div>
            
            {/* Location Preferences */}
            <div className="py-3">
              <h3 className="font-medium mb-3">Location Preferences</h3>
              <div className="space-y-2 mb-3">
                {preferences?.locations?.map((loc) => (
                  <div 
                    key={loc._id}
                    className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg"
                  >
                    <span className="text-gray-700">
                      {loc.city || loc.county || loc.state || loc.country}
                      {loc.isPrimary && <span className="ml-2 text-xs text-blue-600">Primary</span>}
                    </span>
                    <button
                      onClick={() => handleRemoveLocation(loc._id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {(!preferences?.locations || preferences.locations.length === 0) && (
                  <p className="text-sm text-gray-500">No locations added yet</p>
                )}
              </div>
              
              {/* Add Location Form */}
              <form onSubmit={handleAddLocation} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLocation.city}
                    onChange={(e) => setNewLocation({ ...newLocation, city: e.target.value })}
                    placeholder="City"
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={newLocation.state}
                    onChange={(e) => setNewLocation({ ...newLocation, state: e.target.value })}
                    placeholder="State"
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={newLocation.country}
                    onChange={(e) => setNewLocation({ ...newLocation, country: e.target.value })}
                    placeholder="Country"
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Add Location
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* News Feed */}
      <div className="max-w-7xl mx-auto px-4 py-6 lg:grid lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}
        
        {articles.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No news articles available</p>
            <p className="text-gray-400 mt-2">Try adjusting your filters or preferences</p>
          </div>
        ) : (
          <div className="space-y-4">
            {articles.map((article) => (
              <article 
                key={article._id}
                className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow"
              >
                <a 
                  href={article.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block p-4"
                >
                  {article.imageUrl && (
                    <div className="mb-3 rounded-lg overflow-hidden">
                      <img 
                        src={article.imageUrl} 
                        alt=""
                        className="w-full h-48 object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                  )}
                  
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                        {article.title}
                      </h2>
                      
                      {article.description && (
                        <p className="mt-2 text-gray-600 line-clamp-2">
                          {article.description.length > 200 
                            ? article.description.substring(0, 200) + '...'
                            : article.description
                          }
                        </p>
                      )}
                      
                      <div className="mt-3 flex items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <span>{getSourceTypeLabel(article.sourceType)}</span>
                          <span>•</span>
                          <span>{article.source}</span>
                        </span>
                        <span>•</span>
                        <span>{formatRelativeTime(article.publishedAt)}</span>
                        
                        {article.localityLevel && article.localityLevel !== 'global' && (
                          <>
                            <span>•</span>
                            <span className="text-blue-600">{article.localityLevel}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </a>
              </article>
            ))}
          </div>
        )}
        
        {/* Load More */}
        {pagination.page < pagination.pages && (
          <div className="mt-6 text-center">
            <button
              onClick={loadMore}
              disabled={loading}
              className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
        
        {/* Pagination Info */}
        <div className="mt-4 text-center text-sm text-gray-500">
          Showing {articles.length} of {pagination.total} articles
        </div>
        </div>

        <aside className="mt-6 lg:mt-0 lg:col-span-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sticky top-24">
            <h2 className="text-lg font-semibold mb-3">Promoted News</h2>
            {promotedLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, index) => (
                  <div key={index} className="animate-pulse border-b border-gray-100 pb-3">
                    <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-2 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : promotedError ? (
              <p className="text-sm text-red-600">{promotedError}</p>
            ) : promotedArticles.length === 0 ? (
              <p className="text-sm text-gray-500">No promoted stories available right now.</p>
            ) : (
              <div className="space-y-3">
                {promotedArticles.map((item) => (
                  <a
                    key={item.article._id}
                    href={item.article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block border-b border-gray-100 pb-3 last:border-b-0 last:pb-0 hover:bg-gray-50 rounded px-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 line-clamp-2">{item.article.title}</p>
                      <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-1 rounded whitespace-nowrap">
                        Viral {Math.round(item.viralScore || 0)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {item.article.source} • {formatRelativeTime(item.article.publishedAt)}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default News;
