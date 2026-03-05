import React, { useState, useEffect } from 'react';
import { newsAPI } from '../utils/api';

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
  const [preferences, setPreferences] = useState(null);
  const [topics, setTopics] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  // Fetch initial data
  useEffect(() => {
    bootstrap();
  }, []);

  const bootstrap = async () => {
    try {
      setLoading(true);
      
      const [feedRes, prefsRes, topicsRes] = await Promise.all([
        newsAPI.getFeed({ page: 1, limit: 20 }),
        newsAPI.getPreferences().catch(() => ({ data: { preferences: null } })),
        newsAPI.getTopics()
      ]);
      
      setArticles(feedRes.data.articles);
      setPagination(feedRes.data.pagination);
      setPreferences(prefsRes.data.preferences);
      setTopics(topicsRes.data.topics);
      setError(null);
    } catch (err) {
      console.error('Error loading news:', err);
      setError('Failed to load news feed');
    } finally {
      setLoading(false);
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
        topic: activeFilter !== 'all' ? activeFilter : undefined
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
        topic: topic !== 'all' ? topic : undefined
      });
      
      setArticles(res.data.articles);
      setPagination(res.data.pagination);
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

  // Toggle local priority
  const handleToggleLocalPriority = async () => {
    if (!preferences) return;
    
    try {
      const res = await newsAPI.updatePreferences({
        localPriorityEnabled: !preferences.localPriorityEnabled
      });
      setPreferences(res.data.preferences);
    } catch (err) {
      console.error('Error updating preferences:', err);
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
  const handleAddLocation = async (locationData) => {
    try {
      const res = await newsAPI.addLocation(locationData);
      setPreferences(res.data.preferences);
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
    
    const updatedSources = preferences.rssSources.map(s => 
      s.sourceId === sourceId ? { ...s, enabled: !currentEnabled } : s
    );
    
    try {
      const res = await newsAPI.updatePreferences({ rssSources: updatedSources });
      setPreferences(res.data.preferences);
    } catch (err) {
      console.error('Error updating source:', err);
    }
  };

  if (loading && articles.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-700 rounded w-48 mb-6"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-800 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">📰 Latest News</h1>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 transition-colors"
            >
              <span>⚙️</span>
              <span>Configure</span>
            </button>
          </div>
          
          {/* Topic Filters */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
            <button
              onClick={() => handleFilterChange('all')}
              className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                activeFilter === 'all' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              All
            </button>
            {topics.map(topic => (
              <button
                key={topic.id}
                onClick={() => handleFilterChange(topic.id)}
                className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  activeFilter === topic.id 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {topic.icon} {topic.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-gray-800 border-b border-gray-700">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <h2 className="text-xl font-semibold mb-4">News Preferences</h2>
            
            {/* Local Priority Toggle */}
            <div className="flex items-center justify-between py-3 border-b border-gray-700">
              <div>
                <h3 className="font-medium">Local News Priority</h3>
                <p className="text-sm text-gray-400">Prioritize news from your location</p>
              </div>
              <button
                onClick={handleToggleLocalPriority}
                className={`w-12 h-6 rounded-full transition-colors ${
                  preferences?.localPriorityEnabled ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  preferences?.localPriorityEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            
            {/* Google News Toggle */}
            <div className="flex items-center justify-between py-3 border-b border-gray-700">
              <div>
                <h3 className="font-medium">Google News Integration</h3>
                <p className="text-sm text-gray-400">Include Google News in your feed</p>
              </div>
              <button
                onClick={handleToggleGoogleNews}
                className={`w-12 h-6 rounded-full transition-colors ${
                  preferences?.googleNewsEnabled ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  preferences?.googleNewsEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            
            {/* Followed Keywords */}
            <div className="py-3 border-b border-gray-700">
              <h3 className="font-medium mb-3">Followed Keywords</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {preferences?.followedKeywords?.map((item) => (
                  <span 
                    key={item.keyword}
                    className="px-3 py-1 bg-gray-700 rounded-full flex items-center gap-2"
                  >
                    {item.keyword}
                    <button
                      onClick={() => handleRemoveKeyword(item.keyword)}
                      className="text-gray-400 hover:text-red-400"
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
                  className="flex-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Add
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
                    className="flex items-center justify-between px-3 py-2 bg-gray-700 rounded-lg"
                  >
                    <span>
                      {loc.city || loc.county || loc.state || loc.country}
                      {loc.isPrimary && <span className="ml-2 text-xs text-blue-400">Primary</span>}
                    </span>
                    <button
                      onClick={() => handleRemoveLocation(loc._id)}
                      className="text-gray-400 hover:text-red-400"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="text-sm text-gray-400">
                Add locations in settings to prioritize local news
              </div>
            </div>
          </div>
        </div>
      )}

      {/* News Feed */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}
        
        {articles.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No news articles available</p>
            <p className="text-gray-500 mt-2">Try adjusting your filters or preferences</p>
          </div>
        ) : (
          <div className="space-y-4">
            {articles.map((article) => (
              <article 
                key={article._id}
                className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-750 transition-colors"
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
                      <h2 className="text-lg font-semibold text-white hover:text-blue-400 transition-colors">
                        {article.title}
                      </h2>
                      
                      {article.description && (
                        <p className="mt-2 text-gray-400 line-clamp-2">
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
                            <span className="text-blue-400">{article.localityLevel}</span>
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
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
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
    </div>
  );
}

export default News;
