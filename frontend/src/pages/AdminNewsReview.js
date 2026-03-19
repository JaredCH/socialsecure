import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { moderationAPI } from '../utils/api';

// ---------------------------------------------------------------------------
// Shared UI helpers (mirroring ModerationDashboard patterns)
// ---------------------------------------------------------------------------

const StatusBadge = ({ status, className = '' }) => {
  const colors = {
    city: 'bg-blue-100 text-blue-700',
    county: 'bg-purple-100 text-purple-700',
    state: 'bg-amber-100 text-amber-700',
    country: 'bg-green-100 text-green-700',
    global: 'bg-gray-100 text-gray-600',
    local: 'bg-blue-100 text-blue-700',
    regional: 'bg-amber-100 text-amber-700',
    national: 'bg-green-100 text-green-700',
    active: 'bg-emerald-100 text-emerald-700',
    inactive: 'bg-red-100 text-red-700',
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        colors[status] ?? 'bg-gray-100 text-gray-600'
      } ${className}`}
    >
      {status}
    </span>
  );
};

const Spinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
  </div>
);

const formatDate = (v) => {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return '—';
  }
};

const formatLocationTags = (tags = {}) => {
  if (!tags) return '—';
  const parts = [];
  if (tags.cities?.length) parts.push(tags.cities.slice(0, 2).join(', '));
  if (tags.states?.length) parts.push(tags.states[0]);
  if (tags.zipCodes?.length) parts.push(`zip:${tags.zipCodes[0]}`);
  return parts.join(' · ') || '—';
};

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

const EMPTY_FILTERS = {
  keyword: '',
  city: '',
  state: '',
  zipCode: '',
  category: '',
  pipeline: '',
  source: '',
  localityLevel: '',
  dateFrom: '',
  dateTo: '',
  isActive: '',
  sortBy: 'publishedAt',
  sortDir: 'desc',
};

function ArticleFilterBar({ filters, onChange, onSearch, loading }) {
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value });

  const inputCls =
    'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-0.5';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
      className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {/* Keyword */}
        <div className="col-span-2 sm:col-span-3 lg:col-span-2">
          <label className={labelCls}>Keyword (title / description)</label>
          <input
            type="text"
            value={filters.keyword}
            onChange={set('keyword')}
            placeholder="Search articles…"
            className={`${inputCls} w-full`}
          />
        </div>

        <div>
          <label className={labelCls}>City</label>
          <input type="text" value={filters.city} onChange={set('city')} placeholder="e.g. Denver" className={`${inputCls} w-full`} />
        </div>

        <div>
          <label className={labelCls}>State</label>
          <input type="text" value={filters.state} onChange={set('state')} placeholder="e.g. CO" className={`${inputCls} w-full`} />
        </div>

        <div>
          <label className={labelCls}>Zip Code</label>
          <input type="text" value={filters.zipCode} onChange={set('zipCode')} placeholder="e.g. 80201" className={`${inputCls} w-full`} />
        </div>

        <div>
          <label className={labelCls}>Category</label>
          <input type="text" value={filters.category} onChange={set('category')} placeholder="e.g. sports" className={`${inputCls} w-full`} />
        </div>

        <div>
          <label className={labelCls}>Pipeline</label>
          <select value={filters.pipeline} onChange={set('pipeline')} className={`${inputCls} w-full`}>
            <option value="">All pipelines</option>
            <option value="local">Local</option>
            <option value="category">Category</option>
            <option value="sports">Sports</option>
            <option value="social">Social</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Source</label>
          <input type="text" value={filters.source} onChange={set('source')} placeholder="e.g. Denver Post" className={`${inputCls} w-full`} />
        </div>

        <div>
          <label className={labelCls}>Locality Level</label>
          <select value={filters.localityLevel} onChange={set('localityLevel')} className={`${inputCls} w-full`}>
            <option value="">All levels</option>
            <option value="city">City</option>
            <option value="county">County</option>
            <option value="state">State</option>
            <option value="country">Country</option>
            <option value="global">Global</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Active Status</label>
          <select value={filters.isActive} onChange={set('isActive')} className={`${inputCls} w-full`}>
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Published From</label>
          <input type="date" value={filters.dateFrom} onChange={set('dateFrom')} className={`${inputCls} w-full`} />
        </div>

        <div>
          <label className={labelCls}>Published To</label>
          <input type="date" value={filters.dateTo} onChange={set('dateTo')} className={`${inputCls} w-full`} />
        </div>

        <div>
          <label className={labelCls}>Sort By</label>
          <select value={filters.sortBy} onChange={set('sortBy')} className={`${inputCls} w-full`}>
            <option value="publishedAt">Published Date</option>
            <option value="viralScore">Viral Score</option>
            <option value="ingestTimestamp">Ingested At</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Sort Direction</label>
          <select value={filters.sortDir} onChange={set('sortDir')} className={`${inputCls} w-full`}>
            <option value="desc">Newest / Highest</option>
            <option value="asc">Oldest / Lowest</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
        <button
          type="button"
          onClick={() => { onChange(EMPTY_FILTERS); }}
          className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Clear
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Article table
// ---------------------------------------------------------------------------

function ArticlesTable({ articles, total, page, pages, limit, onPageChange, loading }) {
  if (loading) return <Spinner />;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2.5">
        <span className="text-sm font-medium text-gray-700">
          {total.toLocaleString()} article{total !== 1 ? 's' : ''} found
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-40 transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs text-gray-600">
              {page} / {pages}
            </span>
            <button
              disabled={page >= pages}
              onClick={() => onPageChange(page + 1)}
              className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-40 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {articles.length === 0 ? (
        <p className="p-6 text-center text-sm text-gray-500">No articles match the current filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50 text-left text-gray-500 font-medium">
              <tr>
                <th className="px-3 py-2.5 min-w-[200px]">Title</th>
                <th className="px-3 py-2.5">Source</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Pipeline</th>
                <th className="px-3 py-2.5">Locality</th>
                <th className="px-3 py-2.5 min-w-[130px]">Locations</th>
                <th className="px-3 py-2.5">Score</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Published</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {articles.map((a) => (
                <tr key={a._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 max-w-[260px]">
                    {a.url ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-indigo-600 hover:underline line-clamp-2"
                        title={a.title}
                      >
                        {a.title || '(no title)'}
                      </a>
                    ) : (
                      <span className="font-medium text-gray-800 line-clamp-2" title={a.title}>
                        {a.title || '(no title)'}
                      </span>
                    )}
                    {a.description && (
                      <p className="mt-0.5 text-gray-400 line-clamp-1">{a.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{a.source || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{a.category || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{a.pipeline || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {a.localityLevel ? <StatusBadge status={a.localityLevel} /> : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{formatLocationTags(a.locationTags)}</td>
                  <td className="px-3 py-2 text-gray-600 text-right whitespace-nowrap">
                    {a.viralScore != null ? a.viralScore.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <StatusBadge status={a.isActive ? 'active' : 'inactive'} />
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(a.publishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feed simulation panel
// ---------------------------------------------------------------------------

function SimulatePanel() {
  const [username, setUsername] = useState('');
  const [scope, setScope] = useState('');
  const [limit, setLimit] = useState('50');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!username.trim()) {
      toast.error('Enter a username to simulate.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const params = { username: username.trim(), limit };
      if (scope) params.scope = scope;
      const data = await moderationAPI.simulateNewsFeed(params);
      setResult(data);
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Simulation failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b bg-gray-50 px-4 py-3">
        <h2 className="text-base font-semibold text-gray-900">Feed Simulation</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Simulates the news feed a user would see based on their preferences and location settings.
        </p>
      </div>

      <div className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-0.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run()}
              placeholder="Enter username…"
              className={`${inputCls} w-52`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-0.5">Override Scope</label>
            <select value={scope} onChange={(e) => setScope(e.target.value)} className={`${inputCls} w-36`}>
              <option value="">User default</option>
              <option value="local">Local</option>
              <option value="regional">Regional</option>
              <option value="national">National</option>
              <option value="global">Global</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-0.5">Max Articles</label>
            <select value={limit} onChange={(e) => setLimit(e.target.value)} className={`${inputCls} w-24`}>
              {[25, 50, 75, 100].map((n) => (
                <option key={n} value={String(n)}>{n}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Simulating…' : 'Simulate Feed'}
          </button>
        </div>

        {loading && <Spinner />}

        {result && !loading && (
          <div className="mt-4 space-y-4">
            {/* User summary */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
              <div className="font-semibold text-blue-900 mb-1">
                User: @{result.user.username}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-blue-700 text-xs">
                {result.user.profileCity && <span>City: {result.user.profileCity}</span>}
                {result.user.profileState && <span>State: {result.user.profileState}</span>}
                {result.user.profileZipCode && <span>ZIP: {result.user.profileZipCode}</span>}
              </div>
              {result.preferences && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-blue-700 text-xs mt-1">
                  <span>Default scope: <strong>{result.preferences.defaultScope}</strong></span>
                  <span>Simulated scope: <strong>{result.simulatedScope}</strong></span>
                  {result.preferences.locations?.length > 0 && (
                    <span>
                      Pref locations:{' '}
                      {result.preferences.locations
                        .map((l) => [l.city, l.state].filter(Boolean).join(', '))
                        .join(' | ')}
                    </span>
                  )}
                  {result.preferences.hiddenCategories?.length > 0 && (
                    <span>Hidden: {result.preferences.hiddenCategories.join(', ')}</span>
                  )}
                </div>
              )}
              {!result.preferences && (
                <p className="text-xs text-blue-600 mt-1 italic">No NewsPreferences record found — using defaults.</p>
              )}
              <div className="mt-1 text-xs font-medium text-blue-800">
                {result.articleCount} article{result.articleCount !== 1 ? 's' : ''} in simulated feed
              </div>
            </div>

            {/* Article list */}
            {result.articles.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-4">No articles matched this user's feed configuration.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50 text-left text-gray-500 font-medium">
                    <tr>
                      <th className="px-3 py-2.5 min-w-[200px]">Title</th>
                      <th className="px-3 py-2.5">Source</th>
                      <th className="px-3 py-2.5">Category</th>
                      <th className="px-3 py-2.5">Locality</th>
                      <th className="px-3 py-2.5">Score</th>
                      <th className="px-3 py-2.5">Scope Reason</th>
                      <th className="px-3 py-2.5">Published</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {result.articles.map((a) => (
                      <tr key={a._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 max-w-[260px]">
                          {a.url ? (
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-indigo-600 hover:underline line-clamp-2"
                            >
                              {a.title || '(no title)'}
                            </a>
                          ) : (
                            <span className="font-medium text-gray-800 line-clamp-2">{a.title || '(no title)'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{a.source || '—'}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{a.category || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {a.localityLevel ? <StatusBadge status={a.localityLevel} /> : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                          {a.viralScore != null ? a.viralScore.toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate">{a.scopeReason || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(a.publishedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

export default function AdminNewsReview() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [activeFilters, setActiveFilters] = useState(EMPTY_FILTERS);
  const [articles, setArticles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('articles'); // 'articles' | 'simulate'

  const fetchArticles = useCallback(
    async (currentFilters, currentPage) => {
      setLoading(true);
      try {
        const params = { ...currentFilters, page: currentPage, limit: PAGE_SIZE };
        // Strip empty values to keep the query clean
        Object.keys(params).forEach((k) => {
          if (params[k] === '' || params[k] == null) delete params[k];
        });
        const data = await moderationAPI.getNewsReviewArticles(params);
        setArticles(data.articles || []);
        setTotal(data.total || 0);
        setPage(data.page || 1);
        setPages(data.pages || 1);
      } catch (err) {
        const msg = err?.response?.data?.error || err.message || 'Failed to fetch articles';
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    fetchArticles(EMPTY_FILTERS, 1);
  }, [fetchArticles]);

  const handleSearch = () => {
    setActiveFilters(filters);
    fetchArticles(filters, 1);
  };

  const handlePageChange = (newPage) => {
    fetchArticles(activeFilters, newPage);
  };

  const tabCls = (tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeTab === tab
        ? 'bg-indigo-600 text-white shadow-sm'
        : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">News Review</h1>
          <p className="text-sm text-gray-500">
            Audit and query the article database, and simulate per-user news feeds.
          </p>
        </div>
        <Link
          to="/control-panel"
          className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors self-start sm:self-auto"
        >
          ← Back to Control Panel
        </Link>
      </div>

      {/* Tab switcher */}
      <div className="mb-4 flex gap-2">
        <button type="button" className={tabCls('articles')} onClick={() => setActiveTab('articles')}>
          Article Search
        </button>
        <button type="button" className={tabCls('simulate')} onClick={() => setActiveTab('simulate')}>
          Feed Simulation
        </button>
      </div>

      {activeTab === 'articles' && (
        <div className="space-y-4">
          <ArticleFilterBar
            filters={filters}
            onChange={setFilters}
            onSearch={handleSearch}
            loading={loading}
          />
          <ArticlesTable
            articles={articles}
            total={total}
            page={page}
            pages={pages}
            limit={PAGE_SIZE}
            onPageChange={handlePageChange}
            loading={loading}
          />
        </div>
      )}

      {activeTab === 'simulate' && (
        <SimulatePanel />
      )}
    </div>
  );
}
