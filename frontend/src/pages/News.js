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
  { id: 'local', label: 'Local', icon: '📍' },
  { id: 'regional', label: 'Regional', icon: '🗺️' },
  { id: 'national', label: 'National', icon: '🏛️' },
  { id: 'global', label: 'Global', icon: '🌍' }
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

const getScopeFallbackMessage = (personalization = {}) => {
  if (!personalization?.fallbackApplied) return '';
  const activeScope = personalization?.activeScope || 'broader';
  const requestedScope = personalization?.requestedScope || 'selected';
  if (personalization?.fallbackReason === 'no_scope_matches') {
    return `Showing ${activeScope} scope because there are no ${requestedScope} articles available right now.`;
  }
  return `Showing ${activeScope} scope because ${requestedScope} scope is unavailable for your current location data.`;
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
  const [activeScope, setActiveScope] = useState('local');
  const [scopeFallbackMessage, setScopeFallbackMessage] = useState('');
  const [availableSources, setAvailableSources] = useState([]);
  const [topUsedSources, setTopUsedSources] = useState([]);
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
    zipCode: '',
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
      
      const [prefsRes, topicsRes, promotedRes] = await Promise.all([
        newsAPI.getPreferences().catch(() => ({ data: { preferences: null } })),
        newsAPI.getTopics(),
        newsAPI.getPromoted({ limit: 8 }).catch(() => ({ data: { items: [] } }))
      ]);
      const preferredScope = prefsRes.data.preferences?.defaultScope;
      const feedRes = await newsAPI.getFeed({
        page: 1,
        limit: 20,
        scope: preferredScope || undefined
      });
      const sourcesRes = await newsAPI.getSources().catch(() => ({ data: { sources: [] } }));
      
      setArticles(feedRes.data.articles);
      setPagination(feedRes.data.pagination);
      setPreferences(prefsRes.data.preferences);
      setActiveScope(feedRes.data.personalization?.activeScope || 'local');
      setScopeFallbackMessage(getScopeFallbackMessage(feedRes.data.personalization));
      setTopics(topicsRes.data.topics);
      setPromotedArticles(promotedRes.data.items || []);
      setAvailableSources(sourcesRes.data.sources || []);
      setTopUsedSources(sourcesRes.data.topUsedSources || []);
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
      setScopeFallbackMessage(getScopeFallbackMessage(res.data.personalization));
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
      setScopeFallbackMessage(getScopeFallbackMessage(res.data.personalization));
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
    if (!newLocation.city.trim() && !newLocation.zipCode.trim() && !newLocation.state.trim() && !newLocation.country.trim()) return;
    
    try {
      const res = await newsAPI.addLocation(newLocation);
      setPreferences(res.data.preferences);
      setNewLocation({ city: '', zipCode: '', state: '', country: '' });
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
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
            <div className="animate-pulse">
              <div className="h-7 bg-gray-200 rounded-lg w-40 mb-4"></div>
              <div className="flex gap-1 mb-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-9 bg-gray-100 rounded-lg w-24"></div>
                ))}
              </div>
              <div className="flex gap-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-8 bg-gray-100 rounded-full w-20"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-4 flex gap-4">
                <div className="hidden sm:block w-40 h-28 bg-gray-200 rounded-lg shrink-0"></div>
                <div className="flex-1 space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-100 rounded w-full"></div>
                  <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                  <div className="flex gap-3">
                    <div className="h-3 bg-gray-100 rounded w-16"></div>
                    <div className="h-3 bg-gray-100 rounded w-20"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          {/* Title Row */}
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900">News</h1>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-lg transition-colors ${
                showSettings
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
              aria-label="Configure news preferences"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          {/* Scope Filters — Segmented Control */}
          <div className="inline-flex items-center rounded-lg bg-gray-100 p-0.5 mb-3">
            {NEWS_SCOPES.map((scopeOption) => (
              <button
                key={scopeOption.id}
                onClick={() => handleScopeChange(scopeOption.id)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
                  activeScope === scopeOption.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="text-xs sm:text-sm">{scopeOption.icon}</span>
                <span>{scopeOption.label}</span>
              </button>
            ))}
          </div>
          {scopeFallbackMessage && (
            <p className="text-xs text-amber-600 mb-2">{scopeFallbackMessage}</p>
          )}

          {/* Topic Filters */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            <button
              onClick={() => handleFilterChange('all')}
              className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition-all duration-150 font-medium ${
                activeFilter === 'all' 
                  ? 'bg-gray-900 text-white' 
                  : 'bg-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              All
            </button>
            {visibleCategories.map(category => (
              <button
                key={category.id}
                onClick={() => handleFilterChange(category.id)}
                className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition-all duration-150 font-medium flex items-center gap-1 ${
                  activeFilter === category.id 
                    ? 'bg-gray-900 text-white' 
                    : 'bg-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span>{category.icon}</span>
                <span>{category.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            <h2 className="text-lg font-semibold mb-5 text-gray-900">Preferences</h2>
            
            {/* Default Scope */}
            <div className="py-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900">Default Scope</h3>
              <p className="text-xs text-gray-500 mb-2">Scope that loads when you open News</p>
              <select
                value={preferences?.defaultScope || 'local'}
                onChange={(e) => handleDefaultScopeChange(e.target.value)}
                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
              >
                {NEWS_SCOPES.map((scopeOption) => (
                  <option key={scopeOption.id} value={scopeOption.id}>
                    {scopeOption.icon} {scopeOption.label}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Google News Toggle */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Google News</h3>
                <p className="text-xs text-gray-500">Include Google News results in your feed</p>
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
            <div className="py-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-1">Category Visibility</h3>
              <p className="text-xs text-gray-500 mb-3">Show or hide categories from your feed</p>
              <div className="flex flex-wrap gap-2">
                {ALL_CATEGORIES.map(category => {
                  const isHidden = hiddenCategories.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      onClick={() => handleToggleCategory(category.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all duration-150 border ${
                        isHidden 
                          ? 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                          : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
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
            <div className="py-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-1">Followed Keywords</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {preferences?.followedKeywords?.map((item) => (
                  <span 
                    key={item.keyword}
                    className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium flex items-center gap-1.5"
                  >
                    {item.keyword}
                    <button
                      onClick={() => handleRemoveKeyword(item.keyword)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
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
                  className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                />
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Add
                </button>
              </form>
            </div>

            {/* RSS Source Catalog + Custom Source Input */}
            <div className="py-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-1">RSS Sources</h3>
              <p className="text-xs text-gray-500 mb-3">
                Manage catalog sources and add your own feeds.
              </p>
              <div className="space-y-2 mb-4">
                {topUsedSources.length > 0 && (
                  <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                    <p className="text-xs font-medium text-blue-800 mb-2">Top active sources</p>
                    <div className="space-y-1">
                      {topUsedSources.map((source, index) => (
                        <div key={source._id} className="text-xs text-blue-700 flex items-center justify-between gap-2">
                          <span className="truncate">{index + 1}. {source.name}</span>
                          <span className="shrink-0 text-blue-500">{source.fetchCount || 0} fetches</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {availableSources.map((source) => {
                  const enabled = isSourceEnabled(source._id);
                  return (
                    <div key={source._id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{source.name}</p>
                        <p className="text-xs text-gray-500">
                          {getSourceTypeLabel(source.type)} · {source.category || 'general'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleToggleSource(source._id, enabled)}
                        className={`w-10 h-5 rounded-full transition-colors shrink-0 ${enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                        aria-label={`Toggle ${source.name}`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  );
                })}
                {availableSources.length === 0 && (
                  <p className="text-xs text-gray-500">No shared sources available yet.</p>
                )}
              </div>
              <form onSubmit={handleAddSource} className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newSource.name}
                    onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                    placeholder="Source name"
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                  />
                  <input
                    type="url"
                    value={newSource.url}
                    onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                    placeholder="Feed URL"
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                  />
                  <select
                    value={newSource.type}
                    onChange={(e) => setNewSource({ ...newSource, type: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
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
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                  />
                </div>
                <p className="text-xs text-gray-400">
                  {SOURCE_FORMAT_GUIDANCE[newSource.type] || SOURCE_FORMAT_GUIDANCE.rss}
                </p>
                {sourceStatusMessage && (
                  <p className="text-xs text-gray-600">{sourceStatusMessage}</p>
                )}
                <button
                  type="submit"
                  className="w-full px-4 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Add Source
                </button>
              </form>
            </div>
            
            {/* Location Preferences */}
            <div className="py-3">
              <h3 className="text-sm font-medium text-gray-900 mb-1">Locations</h3>
              <p className="text-xs text-gray-500 mb-3">
                Add locations for local and regional news coverage.
              </p>
              <div className="space-y-2 mb-3">
                {preferences?.locations?.map((loc) => {
                  const parts = [loc.city, loc.zipCode, loc.county, loc.state, loc.country].filter(Boolean);
                  return (
                    <div 
                      key={loc._id}
                      className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg"
                    >
                      <span className="text-sm text-gray-700">
                        {parts.join(', ') || 'Unknown location'}
                        {loc.isPrimary && <span className="ml-2 text-xs text-blue-600 font-medium">Primary</span>}
                      </span>
                      <button
                        onClick={() => handleRemoveLocation(loc._id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                {(!preferences?.locations || preferences.locations.length === 0) && (
                  <p className="text-xs text-gray-500">No locations added. Add a zip code or city for local news.</p>
                )}
              </div>
              
              {/* Add Location Form */}
              <form onSubmit={handleAddLocation} className="space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    value={newLocation.city}
                    onChange={(e) => setNewLocation({ ...newLocation, city: e.target.value })}
                    placeholder="City"
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                  />
                  <input
                    type="text"
                    value={newLocation.zipCode}
                    onChange={(e) => setNewLocation({ ...newLocation, zipCode: e.target.value })}
                    placeholder="ZIP"
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                  />
                  <input
                    type="text"
                    value={newLocation.state}
                    onChange={(e) => setNewLocation({ ...newLocation, state: e.target.value })}
                    placeholder="State"
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                  />
                  <input
                    type="text"
                    value={newLocation.country}
                    onChange={(e) => setNewLocation({ ...newLocation, country: e.target.value })}
                    placeholder="Country"
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full px-4 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Add Location
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* News Feed */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:grid lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}
        
        {articles.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500 font-medium">No articles found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your filters or preferences</p>
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <article 
                key={article._id}
                className="bg-white rounded-xl overflow-hidden hover:shadow-md transition-all duration-200 border border-gray-100"
              >
                <a 
                  href={article.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex flex-col sm:flex-row gap-0 sm:gap-4 p-0 sm:p-4"
                >
                  {article.imageUrl && (
                    <div className="sm:w-40 sm:h-28 shrink-0 overflow-hidden sm:rounded-lg">
                      <img 
                        src={article.imageUrl} 
                        alt=""
                        className="w-full h-40 sm:h-full object-cover"
                        loading="lazy"
                        onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                      />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0 p-4 sm:p-0">
                    <h2 className="text-base font-semibold text-gray-900 leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
                      {article.title}
                    </h2>
                    
                    {article.description && (
                      <p className="mt-1.5 text-sm text-gray-500 line-clamp-2 leading-relaxed">
                        {article.description.length > 180 
                          ? article.description.substring(0, 180) + '...'
                          : article.description
                        }
                      </p>
                    )}
                    
                    <div className="mt-2.5 flex items-center gap-2 text-xs text-gray-400">
                      <span className="font-medium text-gray-500">{article.source}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(article.publishedAt)}</span>
                      {article.localityLevel && article.localityLevel !== 'global' && (
                        <>
                          <span>·</span>
                          <span className="text-blue-500 font-medium">{article.localityLevel}</span>
                        </>
                      )}
                      <span className="ml-auto text-gray-300">{getSourceTypeLabel(article.sourceType)}</span>
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
              className="px-8 py-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-600 text-sm font-medium rounded-lg transition-all duration-150 disabled:opacity-50 hover:shadow-sm"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></span>
                  Loading…
                </span>
              ) : 'Load More'}
            </button>
          </div>
        )}
        
        {/* Pagination Info */}
        <div className="mt-4 text-center text-xs text-gray-400">
          {articles.length} of {pagination.total} articles
        </div>
        </div>

        <aside className="mt-6 lg:mt-0 lg:col-span-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4 sticky top-20">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">Trending</h2>
            {promotedLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, index) => (
                  <div key={index} className="animate-pulse border-b border-gray-50 pb-3">
                    <div className="h-3 bg-gray-100 rounded w-3/4 mb-2" />
                    <div className="h-2 bg-gray-100 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : promotedError ? (
              <p className="text-xs text-red-500">{promotedError}</p>
            ) : promotedArticles.length === 0 ? (
              <p className="text-xs text-gray-400">No trending stories right now.</p>
            ) : (
              <div className="space-y-2">
                {promotedArticles.map((item) => (
                  <a
                    key={item.article._id}
                    href={item.article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block py-2.5 border-b border-gray-50 last:border-b-0 last:pb-0 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{item.article.title}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-gray-400">
                        {item.article.source} · {formatRelativeTime(item.article.publishedAt)}
                      </span>
                      <span className="ml-auto text-xs font-medium bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">
                        🔥 {Math.round(item.viralScore || 0)}
                      </span>
                    </div>
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
