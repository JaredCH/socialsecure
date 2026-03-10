import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { newsAPI } from '../utils/api';
import SourcesStatusCard from '../components/news/sidebar/SourcesStatusCard';
import TrendingCard from '../components/news/sidebar/TrendingCard';
import KeywordHitsCard from '../components/news/sidebar/KeywordHitsCard';
import LocalNewsCard from '../components/news/sidebar/LocalNewsCard';
import WeatherWidget from '../components/news/sidebar/WeatherWidget';
import ArticleDrawer from '../components/news/ArticleDrawer';

// ─── Constants ──────────────────────────────────────────────────────────────────

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
  { id: 'world', name: 'World', icon: '🌍' },
  { id: 'general', name: 'General', icon: '📰' },
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
  government: 'Official government or public-service feed URL',
  npr: 'NPR RSS feed URL (e.g., https://feeds.npr.org/1001/rss.xml)',
  bbc: 'BBC News RSS feed URL (e.g., https://feeds.bbci.co.uk/news/rss.xml)'
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

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

const getSourceTypeLabel = (sourceType) => {
  const labels = {
    rss: 'RSS',
    googleNews: 'Google',
    youtube: '📺 YouTube',
    podcast: '🎙️ Podcast',
    government: '🏛️ Government',
    gdlet: 'GDELT',
    npr: '📻 NPR',
    bbc: '📡 BBC'
  };
  return labels[sourceType] || sourceType;
};

const getScopeFallbackMessage = (personalization = {}) => {
  if (!personalization?.fallbackApplied) return '';
  const activeScope = personalization?.activeScope || 'broader';
  const requestedScope = personalization?.requestedScope || 'selected';
  if (personalization?.fallbackReason === 'no_scope_matches') {
    return `Showing ${activeScope} scope — no ${requestedScope} articles available right now.`;
  }
  return `Showing ${activeScope} scope — ${requestedScope} scope is unavailable for your current location.`;
};

// ─── Reusable toggle switch ─────────────────────────────────────────────────────

const Toggle = ({ enabled, onToggle, label, size = 'md' }) => {
  const sizes = {
    sm: { track: 'w-8 h-[18px]', thumb: 'w-3.5 h-3.5', on: 'translate-x-[14px]', off: 'translate-x-0.5' },
    md: { track: 'w-10 h-[22px]', thumb: 'w-4 h-4', on: 'translate-x-5', off: 'translate-x-0.5' },
  };
  const s = sizes[size] || sizes.md;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onToggle}
      className={`${s.track} rounded-full transition-colors duration-200 shrink-0 ${enabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
    >
      <span className={`block ${s.thumb} bg-white rounded-full shadow transition-transform duration-200 ${enabled ? s.on : s.off}`} />
    </button>
  );
};

// ─── Sidebar panel sections ──────────────────────────────────────────────────────

const PANEL_IDS = { sources: 'sources', categories: 'categories', keywords: 'keywords', locations: 'locations', addSource: 'addSource' };

// ─── Main Component ──────────────────────────────────────────────────────────────

function News() {
  // Core state
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
  const [newSource, setNewSource] = useState({ name: '', url: '', type: 'rss', category: 'general' });
  const [sourceStatusMessage, setSourceStatusMessage] = useState('');
  const [newLocation, setNewLocation] = useState({ city: '', zipCode: '', state: '', country: '', isPrimary: false });
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  // UI-only state
  const [openPanel, setOpenPanel] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState('newest');
  const [viewMode, setViewMode] = useState('list');
  const [selectedArticleId, setSelectedArticleId] = useState(null);

  const togglePanel = (id) => setOpenPanel(prev => (prev === id ? null : id));

  // ─── Data fetching (unchanged API contracts) ────────────────────────────────

  const loadPromoted = useCallback(async (topicFilter = activeFilter) => {
    try {
      setPromotedLoading(true);
      const promotedRes = await newsAPI.getPromoted({ limit: 8, topic: topicFilter !== 'all' ? topicFilter : undefined });
      setPromotedArticles(promotedRes.data.items || []);
      setPromotedError(null);
    } catch (err) {
      console.error('Error loading promoted news:', err);
      setPromotedError('Failed to load promoted news');
    } finally {
      setPromotedLoading(false);
    }
  }, [activeFilter]);

  const refreshFeed = useCallback(async (scope = activeScope, topic = activeFilter) => {
    const refreshedFeed = await newsAPI.getFeed({ page: 1, limit: 20, topic: topic !== 'all' ? topic : undefined, scope });
    setArticles(refreshedFeed.data.articles);
    setPagination(refreshedFeed.data.pagination);
    setActiveScope(refreshedFeed.data.personalization?.activeScope || scope);
    setScopeFallbackMessage(getScopeFallbackMessage(refreshedFeed.data.personalization));
  }, [activeScope, activeFilter]);

  const bootstrap = useCallback(async () => {
    try {
      setLoading(true);
      setPromotedLoading(true);
      const [prefsRes, topicsRes, promotedRes] = await Promise.all([
        newsAPI.getPreferences().catch(() => ({ data: { preferences: null } })),
        newsAPI.getTopics(),
        newsAPI.getPromoted({ limit: 8 }).catch(() => ({ data: { items: [] } }))
      ]);
      const preferredScope = prefsRes.data.preferences?.defaultScope;
      const feedRes = await newsAPI.getFeed({ page: 1, limit: 20, scope: preferredScope || undefined });
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
      if (prefsRes.data.preferences?.hiddenCategories) setHiddenCategories(prefsRes.data.preferences.hiddenCategories);
      setError(null);
    } catch (err) {
      console.error('Error loading news:', err);
      setError('Failed to load news feed');
    } finally {
      setLoading(false);
      setPromotedLoading(false);
    }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  // ─── Handlers (same business logic, same API calls) ─────────────────────────

  const loadMore = async () => {
    if (pagination.page >= pagination.pages) return;
    try {
      const nextPage = pagination.page + 1;
      const res = await newsAPI.getFeed({ page: nextPage, limit: 20, topic: activeFilter !== 'all' ? activeFilter : undefined, scope: activeScope });
      setArticles(prev => [...prev, ...res.data.articles]);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error('Error loading more:', err);
    }
  };

  const handleFilterChange = async (topic) => {
    setActiveFilter(topic);
    setLoading(true);
    try {
      await refreshFeed(activeScope, topic);
      await loadPromoted(topic);
    } catch (err) {
      console.error('Error filtering:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddKeyword = async (e) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    try {
      const res = await newsAPI.addKeyword(newKeyword.trim());
      setPreferences(res.data.preferences);
      setNewKeyword('');
      await refreshFeed();
    } catch (err) {
      console.error('Error adding keyword:', err);
    }
  };

  const handleRemoveKeyword = async (keyword) => {
    try {
      const res = await newsAPI.removeKeyword(keyword);
      setPreferences(res.data.preferences);
      await refreshFeed();
    } catch (err) {
      console.error('Error removing keyword:', err);
    }
  };

  const handleScopeChange = async (scope) => {
    setActiveScope(scope);
    setLoading(true);
    try {
      await refreshFeed(scope, activeFilter);
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

  const handleToggleGoogleNews = async () => {
    if (!preferences) return;
    try {
      const res = await newsAPI.updatePreferences({ googleNewsEnabled: !preferences.googleNewsEnabled });
      setPreferences(res.data.preferences);
      await refreshFeed();
    } catch (err) {
      console.error('Error updating preferences:', err);
    }
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();
    if (!newLocation.city.trim() && !newLocation.zipCode.trim() && !newLocation.state.trim() && !newLocation.country.trim()) return;
    try {
      const res = await newsAPI.addLocation(newLocation);
      setPreferences(res.data.preferences);
      setNewLocation({ city: '', zipCode: '', state: '', country: '', isPrimary: false });
      await refreshFeed();
    } catch (err) {
      console.error('Error adding location:', err);
    }
  };

  const handleRemoveLocation = async (locationId) => {
    try {
      const res = await newsAPI.removeLocation(locationId);
      setPreferences(res.data.preferences);
      await refreshFeed();
    } catch (err) {
      console.error('Error removing location:', err);
    }
  };

  const handleSetPrimaryLocation = async (locationId) => {
    if (!preferences?.locations?.length) return;
    const updatedLocations = preferences.locations.map((location) => ({
      ...location,
      isPrimary: String(location._id) === String(locationId)
    }));
    try {
      const res = await newsAPI.updatePreferences({ locations: updatedLocations });
      setPreferences(res.data.preferences);
      await refreshFeed();
    } catch (err) {
      console.error('Error setting primary location:', err);
    }
  };

  const handleToggleSource = async (sourceId, currentEnabled) => {
    if (!preferences) return;
    const normalizedSourceId = String(sourceId);
    const currentSourcePrefs = preferences.rssSources || [];
    const existingIndex = currentSourcePrefs.findIndex((sourcePref) => {
      const prefSourceId = typeof sourcePref.sourceId === 'object' ? sourcePref.sourceId?._id : sourcePref.sourceId;
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
      await refreshFeed();
    } catch (err) {
      console.error('Error updating source:', err);
    }
  };

  const handleAddSource = async (e) => {
    e.preventDefault();
    if (!newSource.name.trim() || !newSource.url.trim()) return;
    try {
      await newsAPI.addSource({ name: newSource.name.trim(), url: newSource.url.trim(), type: newSource.type, category: newSource.category.trim() || 'general' });
      const sourcesRes = await newsAPI.getSources();
      setAvailableSources(sourcesRes.data.sources || []);
      setNewSource({ name: '', url: '', type: 'rss', category: 'general' });
      setSourceStatusMessage('Source saved successfully.');
    } catch (err) {
      console.error('Error adding source:', err);
      setSourceStatusMessage('Failed to add source. Please verify feed URL and try again.');
    }
  };

  const isSourceEnabled = (sourceId) => {
    const sourcePreference = preferences?.rssSources?.find((sourcePref) => {
      const prefSourceId = typeof sourcePref.sourceId === 'object' ? sourcePref.sourceId?._id : sourcePref.sourceId;
      return String(prefSourceId) === String(sourceId);
    });
    if (!sourcePreference) return true;
    return sourcePreference.enabled !== false;
  };

  const handleToggleCategory = async (categoryId) => {
    const newHidden = hiddenCategories.includes(categoryId)
      ? hiddenCategories.filter(c => c !== categoryId)
      : [...hiddenCategories, categoryId];
    setHiddenCategories(newHidden);
    try {
      const res = await newsAPI.updateHiddenCategories(newHidden);
      setPreferences(res.data.preferences);
      await refreshFeed();
    } catch (err) {
      console.error('Error updating hidden categories:', err);
      setHiddenCategories(hiddenCategories);
    }
  };

  const visibleCategories = ALL_CATEGORIES.filter(cat => !hiddenCategories.includes(cat.id));

  // Client-side sort
  const sortedArticles = useMemo(() => {
    if (sortOrder === 'oldest') return [...articles].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
    return articles; // API already returns newest-first
  }, [articles, sortOrder]);

  // ─── Loading skeleton ─────────────────────────────────────────────────────────

  if (loading && articles.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-gray-100">
        {/* skeleton header */}
        <div className="bg-white/80 backdrop-blur border-b border-gray-200/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 animate-pulse">
            <div className="h-8 bg-gray-200 rounded-lg w-32 mb-4" />
            <div className="flex gap-2 mb-3">{[...Array(4)].map((_, i) => <div key={i} className="h-9 bg-gray-100 rounded-full w-24" />)}</div>
            <div className="flex gap-2">{[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded-full w-20" />)}</div>
          </div>
        </div>
        {/* skeleton body */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="animate-pulse space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 flex gap-5 shadow-sm">
                <div className="hidden sm:block w-44 h-28 bg-gray-200 rounded-xl shrink-0" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-4/5" />
                  <div className="h-4 bg-gray-100 rounded w-full" />
                  <div className="h-4 bg-gray-100 rounded w-3/5" />
                  <div className="flex gap-3"><div className="h-3 bg-gray-100 rounded w-20" /><div className="h-3 bg-gray-100 rounded w-16" /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const activeKeywords = preferences?.followedKeywords || [];
  const googleNewsEnabled = preferences?.googleNewsEnabled !== false;
  const enabledSourceCount = availableSources.filter(s => isSourceEnabled(s._id)).length + (googleNewsEnabled ? 1 : 0);
  const enabledCategoryCount = ALL_CATEGORIES.length - hiddenCategories.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-gray-100 text-gray-900">

      {/* ── Sticky Top Bar ──────────────────────────────────────────────────────── */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200/60 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Row 1 – title + controls */}
          <div className="flex items-center justify-between py-3">
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent select-none">
              News
            </h1>
            <div className="flex items-center gap-2">
              {/* Sort control */}
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="hidden sm:block text-xs bg-gray-100 border-0 rounded-lg px-2.5 py-1.5 text-gray-600 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>

              {/* List/Grid view toggle */}
              <div className="hidden sm:inline-flex items-center rounded-lg bg-gray-100 p-0.5">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                  aria-label="List view"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                  aria-label="Grid view"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                </button>
              </div>

              {/* Mobile filter toggle */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
                aria-label="Toggle filters"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </button>

              {/* Settings gear */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-xl transition-colors ${showSettings ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                aria-label="Configure news preferences"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Row 2 – Scope segmented control */}
          <div className="flex items-center gap-3 pb-3">
            <div className="inline-flex items-center rounded-xl bg-gray-100 p-1">
              {NEWS_SCOPES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleScopeChange(s.id)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    activeScope === s.id
                      ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="text-xs sm:text-sm">{s.icon}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              ))}
            </div>
            {scopeFallbackMessage && <p className="text-xs text-amber-600 truncate">{scopeFallbackMessage}</p>}
          </div>

          {/* Row 3 – Category chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            <button
              onClick={() => handleFilterChange('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                activeFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                  : 'bg-white text-gray-600 hover:bg-gray-100 ring-1 ring-gray-200'
              }`}
            >
              All
            </button>
            {visibleCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleFilterChange(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 flex items-center gap-1 ${
                  activeFilter === cat.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'bg-white text-gray-600 hover:bg-gray-100 ring-1 ring-gray-200'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>

          {/* Keyword bar (always visible) */}
          <div className="pb-3">
            <form onSubmit={handleAddKeyword} className="flex items-center gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="Add keyword to track (e.g., Bitcoin, AI, Iran…)"
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all"
                />
              </div>
              <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-indigo-200">
                Track
              </button>
            </form>
            {activeKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {activeKeywords.map((item) => (
                  <span key={item.keyword} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium ring-1 ring-indigo-200/60">
                    {item.keyword}
                    <button onClick={() => handleRemoveKeyword(item.keyword)} className="text-indigo-400 hover:text-red-500 transition-colors ml-0.5" aria-label={`Remove keyword ${item.keyword}`}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Settings Panel (expanded below header) ────────────────────────────── */}
      {showSettings && (
        <div className="bg-white border-b border-gray-200/60 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Preferences</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close preferences">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Default scope */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Default Scope</h3>
                <p className="text-xs text-gray-500">Scope that loads when you open News</p>
                <select value={preferences?.defaultScope || 'local'} onChange={(e) => handleDefaultScopeChange(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all">
                  {NEWS_SCOPES.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
                </select>
              </div>

              {/* Google News toggle */}
              <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Google News</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Include Google News results</p>
                </div>
                <Toggle enabled={preferences?.googleNewsEnabled !== false} onToggle={handleToggleGoogleNews} label="Toggle Google News" />
              </div>

              {/* Location preferences */}
              <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                <h3 className="text-sm font-semibold text-gray-900">Locations</h3>
                <p className="text-xs text-gray-500">For local &amp; regional coverage</p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {preferences?.locations?.map((loc) => {
                    const parts = [loc.city, loc.zipCode, loc.county, loc.state, loc.country].filter(Boolean);
                    return (
                      <div key={loc._id} className="flex items-center justify-between px-3 py-1.5 bg-white rounded-lg text-sm ring-1 ring-gray-200">
                        <span className="text-gray-700 truncate">
                          {parts.join(', ') || 'Unknown'}
                          {loc.isPrimary && <span className="ml-1.5 text-xs text-indigo-600 font-semibold">Primary</span>}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {!loc.isPrimary && <button onClick={() => handleSetPrimaryLocation(loc._id)} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Primary</button>}
                          <button onClick={() => handleRemoveLocation(loc._id)} className="text-gray-400 hover:text-red-500 transition-colors">×</button>
                        </div>
                      </div>
                    );
                  })}
                  {(!preferences?.locations || preferences.locations.length === 0) && <p className="text-xs text-gray-400">No locations added yet.</p>}
                </div>
                <form onSubmit={handleAddLocation} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={newLocation.city} onChange={(e) => setNewLocation({ ...newLocation, city: e.target.value })} placeholder="City" className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all" />
                    <input type="text" value={newLocation.zipCode} onChange={(e) => setNewLocation({ ...newLocation, zipCode: e.target.value })} placeholder="ZIP" className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all" />
                    <input type="text" value={newLocation.state} onChange={(e) => setNewLocation({ ...newLocation, state: e.target.value })} placeholder="State" className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all" />
                    <input type="text" value={newLocation.country} onChange={(e) => setNewLocation({ ...newLocation, country: e.target.value })} placeholder="Country" className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all" />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input type="checkbox" checked={newLocation.isPrimary} onChange={(e) => setNewLocation({ ...newLocation, isPrimary: e.target.checked })} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    Make this my primary location
                  </label>
                  <button type="submit" className="w-full px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors">Add Location</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex gap-6">

        {/* Mobile sidebar overlay */}
        {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        {/* ── Left Sidebar – Filters ─────────────────────────────────────────── */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-40 lg:z-0
          w-72 lg:w-64 shrink-0
          bg-white lg:bg-transparent
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          lg:block overflow-y-auto
          border-r lg:border-r-0 border-gray-200
        `}>
          <div className="p-4 lg:p-0 space-y-3 lg:sticky lg:top-[210px]">
            {/* Mobile close */}
            <div className="flex items-center justify-between lg:hidden mb-2">
              <span className="text-sm font-bold text-gray-900">Filters</span>
              <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* ── Sources accordion ──────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/70 overflow-hidden">
              <button onClick={() => togglePanel(PANEL_IDS.sources)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                  <span className="text-sm font-semibold text-gray-800">Sources</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{enabledSourceCount}/{availableSources.length + 1}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${openPanel === PANEL_IDS.sources ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>
              {openPanel === PANEL_IDS.sources && (
                <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3 max-h-72 overflow-y-auto">
                  {/* Google News as first-class source toggle */}
                  <div className="flex items-center justify-between py-1.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">Google News</p>
                      <p className="text-[11px] text-gray-400">Aggregated results</p>
                    </div>
                    <Toggle enabled={preferences?.googleNewsEnabled !== false} onToggle={handleToggleGoogleNews} label="Toggle Google News" size="sm" />
                  </div>
                  {availableSources.map((source) => {
                    const enabled = isSourceEnabled(source._id);
                    return (
                      <div key={source._id} className="flex items-center justify-between py-1.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{source.name}</p>
                          <p className="text-[11px] text-gray-400">{getSourceTypeLabel(source.type)} · {source.category || 'general'}</p>
                        </div>
                        <Toggle enabled={enabled} onToggle={() => handleToggleSource(source._id, enabled)} label={`Toggle ${source.name}`} size="sm" />
                      </div>
                    );
                  })}
                  {availableSources.length === 0 && (
                    <p className="text-xs text-gray-400 py-1">No shared sources available yet.</p>
                  )}
                </div>
              )}
            </div>

            {/* ── Categories accordion ───────────────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/70 overflow-hidden">
              <button onClick={() => togglePanel(PANEL_IDS.categories)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                  <span className="text-sm font-semibold text-gray-800">Categories</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{enabledCategoryCount}/{ALL_CATEGORIES.length}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${openPanel === PANEL_IDS.categories ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>
              {openPanel === PANEL_IDS.categories && (
                <div className="px-4 pb-4 space-y-1 border-t border-gray-100 pt-3 max-h-72 overflow-y-auto">
                  {ALL_CATEGORIES.map(cat => {
                    const isHidden = hiddenCategories.includes(cat.id);
                    return (
                      <div key={cat.id} className="flex items-center justify-between py-1.5">
                        <span className="flex items-center gap-2 text-sm text-gray-700">
                          <span>{cat.icon}</span>
                          <span className={isHidden ? 'line-through text-gray-400' : ''}>{cat.name}</span>
                        </span>
                        <Toggle enabled={!isHidden} onToggle={() => handleToggleCategory(cat.id)} label={`Toggle ${cat.name} category`} size="sm" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Keywords accordion ─────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/70 overflow-hidden">
              <button onClick={() => togglePanel(PANEL_IDS.keywords)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
                  <span className="text-sm font-semibold text-gray-800">Keywords</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{activeKeywords.length}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${openPanel === PANEL_IDS.keywords ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>
              {openPanel === PANEL_IDS.keywords && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                  {activeKeywords.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {activeKeywords.map((item) => (
                        <span key={item.keyword} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium ring-1 ring-emerald-200/60">
                          {item.keyword}
                          <button onClick={() => handleRemoveKeyword(item.keyword)} className="text-emerald-400 hover:text-red-500 transition-colors ml-0.5">×</button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 mb-3">No keywords tracked yet.</p>
                  )}
                  <form onSubmit={handleAddKeyword} className="flex gap-1.5">
                    <input type="text" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} placeholder="e.g., Bitcoin" className="flex-1 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all" />
                    <button type="submit" className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors">Add</button>
                  </form>
                </div>
              )}
            </div>

            {/* ── Add Custom Source accordion ─────────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/70 overflow-hidden">
              <button onClick={() => togglePanel(PANEL_IDS.addSource)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  <span className="text-sm font-semibold text-gray-800">Add Source</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${openPanel === PANEL_IDS.addSource ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {openPanel === PANEL_IDS.addSource && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                  <form onSubmit={handleAddSource} className="space-y-2">
                    <input type="text" value={newSource.name} onChange={(e) => setNewSource({ ...newSource, name: e.target.value })} placeholder="Source name" className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all" />
                    <input type="url" value={newSource.url} onChange={(e) => setNewSource({ ...newSource, url: e.target.value })} placeholder="Feed URL" className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all" />
                    <select value={newSource.type} onChange={(e) => setNewSource({ ...newSource, type: e.target.value })} className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all">
                      <option value="rss">RSS / Atom</option>
                      <option value="podcast">Podcast</option>
                      <option value="youtube">YouTube</option>
                      <option value="googleNews">Google News</option>
                      <option value="government">Government</option>
                      <option value="npr">NPR</option>
                      <option value="bbc">BBC</option>
                    </select>
                    <input type="text" value={newSource.category} onChange={(e) => setNewSource({ ...newSource, category: e.target.value })} placeholder="Category (news, sports…)" className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all" />
                    <p className="text-[11px] text-gray-400">{SOURCE_FORMAT_GUIDANCE[newSource.type] || SOURCE_FORMAT_GUIDANCE.rss}</p>
                    {sourceStatusMessage && <p className="text-xs text-gray-600">{sourceStatusMessage}</p>}
                    <button type="submit" className="w-full px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors">Add Source</button>
                  </form>
                </div>
              )}
            </div>

            {/* Top sources chip */}
            {topUsedSources.length > 0 && (
              <div className="bg-indigo-50/60 rounded-2xl p-3 ring-1 ring-indigo-100/80">
                <p className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider mb-2">Top Sources</p>
                <div className="space-y-1">
                  {topUsedSources.slice(0, 5).map((source, idx) => (
                    <div key={source._id} className="flex items-center justify-between text-xs text-indigo-600">
                      <span className="truncate">{idx + 1}. {source.name}</span>
                      <span className="text-indigo-400 shrink-0 ml-2">{source.fetchCount || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Article Feed ───────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
              {error}
            </div>
          )}

          {sortedArticles.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-5xl mb-4">📭</div>
              <p className="text-gray-600 font-semibold text-lg">No articles found</p>
              <p className="text-gray-400 text-sm mt-1 max-w-xs mx-auto">Try adjusting your filters, scope, or adding more keywords and sources.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sortedArticles.map((article) => (
                <article key={article._id} className="group bg-white rounded-2xl overflow-hidden hover:shadow-lg hover:shadow-gray-200/60 transition-all duration-300 ring-1 ring-gray-200/70">
                  <button onClick={() => setSelectedArticleId(article._id)} className="w-full text-left">
                    {article.imageUrl && (
                      <div className="w-full h-40 overflow-hidden bg-gray-100">
                        <img src={article.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                      </div>
                    )}
                    <div className="p-4">
                      <h2 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">{article.title}</h2>
                      <div className="mt-2 flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-gray-400">
                        <span className="font-semibold text-gray-600">{article.source}</span>
                        <span className="text-gray-300">·</span>
                        <span>{formatRelativeTime(article.publishedAt)}</span>
                        {article.localityLevel && article.localityLevel !== 'global' && (
                          <span className="text-indigo-500 font-medium">{article.localityLevel}</span>
                        )}
                      </div>
                    </div>
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {sortedArticles.map((article) => (
                <article key={article._id} className="group bg-white rounded-2xl overflow-hidden hover:shadow-lg hover:shadow-gray-200/60 transition-all duration-300 ring-1 ring-gray-200/70">
                  <div className="flex flex-col sm:flex-row">
                    <a href={article.url} target="_blank" rel="noopener noreferrer" className="flex flex-col sm:flex-row flex-1 min-w-0">
                      {article.imageUrl && (
                        <div className="sm:w-48 sm:min-h-[130px] shrink-0 overflow-hidden bg-gray-100">
                          <img src={article.imageUrl} alt="" className="w-full h-44 sm:h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 p-4 sm:p-5 flex flex-col justify-center">
                        <h2 className="text-[15px] sm:text-base font-semibold text-gray-900 leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">{article.title}</h2>
                        {article.description && (
                          <p className="mt-1.5 text-sm text-gray-500 line-clamp-2 leading-relaxed">{article.description.length > 200 ? article.description.substring(0, 200) + '…' : article.description}</p>
                        )}
                        <div className="mt-3 flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-gray-400">
                          <span className="font-semibold text-gray-600">{article.source}</span>
                          <span className="text-gray-300">·</span>
                          <span>{formatRelativeTime(article.publishedAt)}</span>
                          {article.localityLevel && article.localityLevel !== 'global' && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span className="text-indigo-500 font-medium">{article.localityLevel}</span>
                            </>
                          )}
                          <span className="ml-auto px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[11px] font-medium">{getSourceTypeLabel(article.sourceType)}</span>
                        </div>
                      </div>
                    </a>
                    <div className="flex items-center gap-1 px-3 py-2 sm:py-0 sm:pr-4 border-t sm:border-t-0 sm:border-l border-gray-100">
                      <button onClick={() => setSelectedArticleId(article._id)} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" aria-label="View article details">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Load more */}
          {pagination.page < pagination.pages && (
            <div className="mt-8 text-center">
              <button
                onClick={loadMore}
                disabled={loading}
                className="px-8 py-2.5 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 hover:shadow-sm ring-1 ring-gray-200/60"
              >
                {loading ? (
                  <span className="flex items-center gap-2 justify-center">
                    <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
                    Loading…
                  </span>
                ) : 'Load More'}
              </button>
            </div>
          )}

          <p className="mt-4 text-center text-xs text-gray-400">
            {articles.length} of {pagination.total} articles
          </p>
        </main>

        {/* ── Right Sidebar – Information Stack ────────────────────────────── */}
        <aside className="hidden xl:block w-72 shrink-0">
          <div className="sticky top-[210px] space-y-4">
            <SourcesStatusCard
              sources={availableSources}
              enabledCount={enabledSourceCount}
              totalCount={availableSources.length + 1 /* +1 for Google News */}
              onManageSources={() => { setSidebarOpen(true); togglePanel(PANEL_IDS.sources); }}
            />
            <TrendingCard
              items={promotedArticles}
              loading={promotedLoading}
              error={promotedError}
            />
            <KeywordHitsCard
              keywords={activeKeywords}
              articles={articles}
              onKeywordClick={(kw) => setNewKeyword(kw)}
            />
            <LocalNewsCard
              articles={articles}
              locations={preferences?.locations || []}
              onManageLocations={() => setShowSettings(true)}
            />
            <WeatherWidget />
          </div>
        </aside>
      </div>

      {/* ── Article Drawer ──────────────────────────────────────────────────── */}
      <ArticleDrawer
        articleId={selectedArticleId}
        onClose={() => setSelectedArticleId(null)}
      />
    </div>
  );
}

export default News;
