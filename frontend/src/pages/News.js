import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getAuthToken, newsAPI } from '../utils/api';
import WeatherBar from '../components/news/WeatherBar';
import FeedToolbar from '../components/news/FeedToolbar';
import BreakingBanner from '../components/news/BreakingBanner';
import AlgorithmicFeed from '../components/news/AlgorithmicFeed';
import NewsLeftPanel from '../components/news/NewsLeftPanel';
import RightSidebar from '../components/news/RightSidebar';
import WeatherWidget from '../components/news/WeatherWidget';
import MarketsWidget from '../components/news/MarketsWidget';
import CryptoWidget from '../components/news/CryptoWidget';
import SportsWidget from '../components/news/SportsWidget';
import TrendingWidget from '../components/news/TrendingWidget';
import AlertsWidget from '../components/news/AlertsWidget';
import ArticleDrawer from '../components/news/ArticleDrawer';
import SportsSchedulePanel from '../components/news/SportsSchedulePanel';
import StockTicker from '../components/news/StockTicker';
import NewsTopNav from '../components/news/NewsTopNav';
import NewsSettingsModal from '../components/news/NewsSettingsModal';
import { CATEGORY_ICONS } from '../constants/categoryIcons';

// ─── Constants ────────────────────────────────────────────────────────────────

const NEWS_SCOPES = [
  { id: 'local',    label: 'Local',    icon: '📍' },
  { id: 'regional', label: 'Regional', icon: '🗺️' },
  { id: 'national', label: 'National', icon: '🏛️' },
  { id: 'global',   label: 'Global',   icon: '🌍' },
];

const CATEGORIES = Object.keys(CATEGORY_ICONS).map((key) => ({
  key,
  label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
}));

const normalizeSportsTeamId = (v) => String(v || '').trim().toLowerCase();

// ─── Main Page ────────────────────────────────────────────────────────────────

function News({ isGuestMode = false }) {
  // ── Preference & source state ──────────────────────────────────────────────
  const [preferences, setPreferences] = useState(null);
  const [availableSources, setAvailableSources]     = useState([]);
  const [sportsLeagues, setSportsLeagues]           = useState([]);
  const [locationTaxonomy, setLocationTaxonomy]     = useState({
    country: { code: 'US', name: 'United States' },
    states: [],
    citiesByState: {},
    preferredStateCode: '',
    preferredStateName: '',
  });
  const [registrationAlignment, setRegistrationAlignment] = useState(null);
  const [weatherStatusMessage, setWeatherStatusMessage]   = useState('');
  const [newKeyword, setNewKeyword]   = useState('');
  const [newLocation, setNewLocation] = useState({
    city: '', cityKey: '', zipCode: '', state: '', stateCode: '',
    country: 'United States', countryCode: 'US', isPrimary: false,
  });

  // ── Feed-filter state ──────────────────────────────────────────────────────
  const [activeCategories, setActiveCategories] = useState([]);
  const [multiSelect, setMultiSelect]           = useState(false);
  const [activeRegion, setActiveRegion]         = useState(null);
  const [activeDate, setActiveDate]             = useState('all');
  const [searchQuery, setSearchQuery]           = useState('');
  const [viewMode, setViewMode]                 = useState('list'); // 'list' or 'card'

  // ── UI state ───────────────────────────────────────────────────────────────
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [feedFilter, setFeedFilter]           = useState('Top');
  const [desktopArticlePreview, setDesktopArticlePreview] = useState(null);
  const [sessionError, setSessionError] = useState('');
  const desktopFeedRef = useRef(null);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  const [prefetchedFeed, setPrefetchedFeed] = useState(null);
  const [storyCount, setStoryCount] = useState(0);

  const bootstrap = useCallback(async () => {
    // Fire feed prefetch in parallel with bootstrap — feed doesn't depend on bootstrap results
    const [prefsRes, sourcesRes, sportsRes, taxRes, feedRes] = await Promise.allSettled([
      newsAPI.getPreferences(),
      newsAPI.getSources(),
      newsAPI.getSportsTeams(),
      newsAPI.getLocationTaxonomy(),
      newsAPI.getFeed({ page: 1, limit: 50 }),
    ]);
    if (prefsRes.status === 'fulfilled') {
      setPreferences(prefsRes.value.data?.preferences || null);
      setRegistrationAlignment(prefsRes.value.data?.registrationAlignment || null);
    }
    if (sourcesRes.status === 'fulfilled') setAvailableSources(sourcesRes.value.data?.sources || []);
    if (sportsRes.status === 'fulfilled')  setSportsLeagues(sportsRes.value.data?.leagues || []);
    if (taxRes.status === 'fulfilled') {
      setLocationTaxonomy(taxRes.value.data?.taxonomy || locationTaxonomy);
    }
    if (feedRes.status === 'fulfilled') {
      setPrefetchedFeed(feedRes.value.data || null);
    }
}, []);

  useEffect(() => {
    if (isGuestMode) {
      setSessionError('');
      bootstrap();
      return;
    }

    if (!getAuthToken()) {
      setSessionError('Your login session was lost or browser storage/cookies are disabled. Please log in again and enable browser storage/cookies.');
      return;
    }

    setSessionError('');
    bootstrap();
  }, [bootstrap, isGuestMode]);

  // ── Category nav ───────────────────────────────────────────────────────────
  const handleToggleCategory = (key) => {
    if (key === null) { setActiveCategories([]); return; }
    if (multiSelect) {
      setActiveCategories((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      );
    } else {
      setActiveCategories((prev) => (prev.length === 1 && prev[0] === key ? [] : [key]));
    }
  };

  const feedCategory = activeCategories.length === 1 ? activeCategories[0] : null;
  const hiddenCategories = useMemo(
    () => (preferences?.hiddenCategories || []).map((value) => String(value || '').trim()).filter(Boolean),
    [preferences]
  );
  const hiddenCategorySet = useMemo(() => new Set(hiddenCategories), [hiddenCategories]);

  const sortedCategories = useMemo(() => {
    const normalizeLabel = (category) => String(category?.label || '').toLowerCase();
    return [...CATEGORIES].sort((a, b) => {
      const aHidden = hiddenCategorySet.has(a.key);
      const bHidden = hiddenCategorySet.has(b.key);
      if (aHidden !== bHidden) return aHidden ? 1 : -1;
      return normalizeLabel(a).localeCompare(normalizeLabel(b));
    });
  }, [hiddenCategorySet]);

  const enabledCategories = useMemo(
    () => sortedCategories.filter((category) => !hiddenCategorySet.has(category.key)),
    [sortedCategories, hiddenCategorySet]
  );

  const handleToggleCategoryEnabled = useCallback(async (categoryKey, currentlyDisabled) => {
    const key = String(categoryKey || '').trim();
    if (!key) return;
    const hidden = new Set(hiddenCategories);
    if (currentlyDisabled) hidden.delete(key);
    else hidden.add(key);
    try {
      const response = await newsAPI.updateHiddenCategories(Array.from(hidden));
      setPreferences(response.data?.preferences || null);
    } catch (err) {
      console.error('toggleHiddenCategory', err);
    }
  }, [hiddenCategories]);

  useEffect(() => {
    if (!activeCategories.length) return;
    const filtered = activeCategories.filter((category) => !hiddenCategorySet.has(category));
    if (filtered.length !== activeCategories.length) setActiveCategories(filtered);
  }, [activeCategories, hiddenCategorySet, setActiveCategories]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      desktopFeedRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  // Register/unregister the mobile article drawer as a DotNav closeable
  useEffect(() => {
    if (selectedArticle) {
      window.dispatchEvent(new CustomEvent('DotNavRegisterCloseable', { detail: { id: 'news-article' } }));
    } else {
      window.dispatchEvent(new CustomEvent('DotNavUnregisterCloseable', { detail: { id: 'news-article' } }));
    }
  }, [selectedArticle]);

  // Listen for DotNav close requests to close the article drawer
  useEffect(() => {
    const handleCloseRequest = () => {
      setSelectedArticle(null);
    };
    window.addEventListener('DotNavCloseRequest', handleCloseRequest);
    return () => window.removeEventListener('DotNavCloseRequest', handleCloseRequest);
  }, []);

  const handleMobileArticleSelect = useCallback((article) => {
    setDesktopArticlePreview(null);
    setSelectedArticle(article);
  }, []);

  const handleDesktopArticleSelect = useCallback((article, anchorPosition) => {
    setSelectedArticle(null);
    setDesktopArticlePreview({ article, anchorPosition });
  }, []);

  // ── Keyword handlers ───────────────────────────────────────────────────────
  const handleAddKeyword = useCallback(async (kw) => {
    try { const r = await newsAPI.addKeyword(kw); setPreferences(r.data?.preferences || null); }
    catch (err) { console.error('addKeyword', err); }
  }, []);

  const handleRemoveKeyword = useCallback(async (kw) => {
    try { const r = await newsAPI.removeKeyword(kw); setPreferences(r.data?.preferences || null); }
    catch (err) { console.error('removeKeyword', err); }
  }, []);

  const handleRenameKeyword = useCallback(async (oldKw, newKw) => {
    try { const r = await newsAPI.renameKeyword(oldKw, newKw); setPreferences(r.data?.preferences || null); }
    catch (err) { console.error('renameKeyword', err); }
  }, []);

  // ── Location handlers ──────────────────────────────────────────────────────
  const handleAddLocation = useCallback(async (locationData) => {
    if (!locationData?.city?.trim() && !locationData?.zipCode?.trim() &&
        !locationData?.state?.trim() && !locationData?.country?.trim()) return;
    try {
      const r = await newsAPI.addLocation(locationData);
      setPreferences(r.data?.preferences || null);
      setRegistrationAlignment(r.data?.registrationAlignment || null);
      setNewLocation({ city: '', cityKey: '', zipCode: '', state: '', stateCode: '',
        country: 'United States', countryCode: 'US', isPrimary: false });
    } catch (err) { console.error('addLocation', err); }
  }, []);

  const handleRemoveLocation = useCallback(async (locationId) => {
    try {
      const r = await newsAPI.removeLocation(locationId);
      setPreferences(r.data?.preferences || null);
      setRegistrationAlignment(r.data?.registrationAlignment || null);
    } catch (err) { console.error('removeLocation', err); }
  }, []);

  const handleSetPrimaryLocation = useCallback(async (locationId) => {
    if (!preferences?.locations?.length) return;
    const updated = preferences.locations.map((loc) => ({
      ...loc, isPrimary: String(loc._id) === String(locationId),
    }));
    try { const r = await newsAPI.updatePreferences({ locations: updated }); setPreferences(r.data?.preferences || null); }
    catch (err) { console.error('setPrimaryLocation', err); }
  }, [preferences]);

  // ── Source handlers ────────────────────────────────────────────────────────
  const isSourceEnabled = useCallback((sourceId) => {
    const pref = preferences?.rssSources?.find((s) => {
      const id = typeof s.sourceId === 'object' ? s.sourceId?._id : s.sourceId;
      return String(id) === String(sourceId);
    });
    return pref ? pref.enabled !== false : true;
  }, [preferences]);

  const handleToggleSource = useCallback(async (sourceId, currentEnabled) => {
    const current = preferences?.rssSources || [];
    const existIdx = current.findIndex((s) => {
      const id = typeof s.sourceId === 'object' ? s.sourceId?._id : s.sourceId;
      return String(id) === String(sourceId);
    });
    const updated = [...current];
    if (existIdx >= 0) updated[existIdx] = { ...updated[existIdx], enabled: !currentEnabled };
    else updated.push({ sourceId: String(sourceId), enabled: !currentEnabled });
    try { const r = await newsAPI.updatePreferences({ rssSources: updated }); setPreferences(r.data?.preferences || null); }
    catch (err) { console.error('toggleSource', err); }
  }, [preferences]);

  const handleToggleGoogleNews = useCallback(async () => {
    try { const r = await newsAPI.updatePreferences({ googleNewsEnabled: !preferences?.googleNewsEnabled }); setPreferences(r.data?.preferences || null); }
    catch (err) { console.error('toggleGoogleNews', err); }
  }, [preferences]);

  const handleToggleSourceCategory = useCallback(async (sourceId, category) => {
    try { const r = await newsAPI.toggleSourceCategory(sourceId, category); setPreferences(r.data?.preferences || null); }
    catch (err) { console.error('toggleSourceCategory', err); }
  }, []);

  // ── Sports team handlers ───────────────────────────────────────────────────
  const saveFollowedTeams = useCallback(async (teamIds) => {
    const normalized = [...new Set((teamIds || []).map(normalizeSportsTeamId).filter(Boolean))];
    try { const r = await newsAPI.updatePreferences({ followedSportsTeams: normalized }); setPreferences(r.data?.preferences || null); }
    catch (err) { console.error('saveTeams', err); }
  }, []);

  const handleToggleSportsTeam = useCallback(async (teamId, currentlySelected) => {
    const current = (preferences?.followedSportsTeams || []).map(normalizeSportsTeamId);
    const target = normalizeSportsTeamId(teamId);
    await saveFollowedTeams(currentlySelected ? current.filter((id) => id !== target) : [...current, target]);
  }, [preferences, saveFollowedTeams]);

  const handleSetAllSportsTeams    = useCallback((ids) => saveFollowedTeams(ids || []), [saveFollowedTeams]);

  const handleSetLeagueSportsTeams = useCallback(async (leagueId, selectAll, leagueTeamIds) => {
    const current = new Set((preferences?.followedSportsTeams || []).map(normalizeSportsTeamId));
    (leagueTeamIds || []).map(normalizeSportsTeamId).forEach((id) => selectAll ? current.add(id) : current.delete(id));
    await saveFollowedTeams(Array.from(current));
  }, [preferences, saveFollowedTeams]);

  // ── Weather location handlers ──────────────────────────────────────────────
  const handleSearchWeatherLocations  = useCallback(async (q) => { const r = await newsAPI.geocodeWeatherLocations(q); return r.data?.suggestions || []; }, []);
  const handleAddWeatherLocation      = useCallback(async (data) => { try { const r = await newsAPI.addWeatherLocation(data); setPreferences(r.data?.preferences || null); setWeatherStatusMessage('Weather location added.'); } catch (err) { setWeatherStatusMessage('Unable to add weather location.'); throw err; } }, []);
  const handleRemoveWeatherLocation   = useCallback(async (id) => { try { const r = await newsAPI.removeWeatherLocation(id); setPreferences(r.data?.preferences || null); setWeatherStatusMessage('Weather location removed.'); } catch (err) { setWeatherStatusMessage('Unable to remove weather location.'); } }, []);
  const handleSetPrimaryWeatherLocation = useCallback(async (id) => { try { const r = await newsAPI.setWeatherLocationPrimary(id); setPreferences(r.data?.preferences || null); setWeatherStatusMessage('Primary weather location updated.'); } catch (err) { setWeatherStatusMessage('Unable to set primary weather location.'); } }, []);
  const handleReorderWeatherLocations = useCallback(async (locations) => { try { const r = await newsAPI.updateWeatherLocations(locations); setPreferences(r.data?.preferences || null); setWeatherStatusMessage('Weather location order saved.'); } catch (err) { setWeatherStatusMessage('Unable to save weather location order.'); } }, []);

  const handleUpdatePreferences = useCallback(async (data) => {
    try { const r = await newsAPI.updatePreferences(data); setPreferences(r.data?.preferences || null); setRegistrationAlignment(r.data?.registrationAlignment || null); }
    catch (err) { console.error('updatePreferences', err); }
  }, []);

  const handleRefreshHealth = useCallback(async () => {
    try { const r = await newsAPI.refreshSourceHealth(); setAvailableSources(r.data?.sources || []); }
    catch (err) { console.error('refreshHealth', err); }
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────
  const keywords      = useMemo(() => (preferences?.followedKeywords || []).map((k) => k.keyword || k), [preferences]);
  const followedTeams = useMemo(() => preferences?.followedSportsTeams || [], [preferences]);
  const stockTickers  = useMemo(() => preferences?.stockTickers || [], [preferences]);
  const stockTickersEnabled = preferences?.stockTickersEnabled || false;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (sessionError) {
    return (
      <div className="mx-auto my-10 w-full max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
        <p>{sessionError}</p>
        <a href="/login" className="mt-2 inline-flex rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100">
          Go to login
        </a>
      </div>
    );
  }

  return (
    <div className="news-theme h-full w-full bg-[var(--bg)] text-[var(--text)] font-[var(--sans)] flex flex-col overflow-hidden">
      {/* ─── Shared Top/Ticker (Desktop) ──────────────────────────────────── */}
      <div className="hidden lg:flex flex-col shrink-0 z-50 relative">
        <StockTicker tickers={stockTickers} enabled={stockTickersEnabled} />
      </div>

      {/* ─── Mobile layout (< lg) ──────────────────────────────────────────── */}
      <div data-testid="news-mobile-layout" className="lg:hidden flex h-full flex-col overflow-hidden">
        <WeatherBar variant="sticky" />
        <StockTicker tickers={stockTickers} enabled={stockTickersEnabled} />
        {followedTeams.length > 0 && (
          <div className="border-b border-slate-200 lg:hidden bg-white">
            <SportsSchedulePanel followedTeams={followedTeams} sportsLeagues={sportsLeagues} />
          </div>
        )}
        <BreakingBanner />
        <div data-testid="news-mobile-filter-bar-shell" className="relative z-40 border-b border-[var(--border)] bg-[var(--bg2)]">
          <FeedToolbar 
            activeFilter={feedFilter} 
            onFilterChange={(f) => {
              setFeedFilter(f);
              if (f === 'Nearby') setActiveRegion('local');
              else if (activeRegion === 'local') setActiveRegion('all');
            }}
            storyCount={storyCount}
            viewMode="list" 
          />
        </div>
        <div data-testid="news-mobile-feed" className="flex-1 overflow-y-auto p-3">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <AlgorithmicFeed
              categories={enabledCategories}
              activeCategory={feedCategory}
              activeRegion={activeRegion}
              activeDate={activeDate}
              searchQuery={searchQuery}
              onArticle={handleMobileArticleSelect}
              prefetchedFeed={prefetchedFeed}
              onCountChange={setStoryCount}
            />
          </div>
        </div>
        {!isGuestMode && (
          <button
            className="fixed z-40 h-7 w-7 rounded-full border border-white/20 bg-slate-950/75 text-white shadow-[0_8px_18px_rgba(2,6,23,0.35)] backdrop-blur-xl flex items-center justify-center active:scale-95 transition-transform"
            style={{
              left: 'calc(var(--dotnav-anchor-left, 308px) - 36px)',
              top: 'calc(var(--dotnav-anchor-top, 762px) + 14px)',
            }}
            onClick={() => setSettingsModalOpen(true)}
            aria-label="Open news settings"
          >
            <span className="absolute inset-[3px] rounded-full border border-white/15" aria-hidden="true" />
            <span className="absolute inset-[5px] rounded-full bg-white/[0.04]" aria-hidden="true" />
            <span className="relative material-symbols-outlined text-[0.65rem] leading-none">settings</span>
          </button>
        )}
      </div>

      {/* ─── Desktop layout (>= lg) ────────────────────────────────────────── */}
      <div className="hidden lg:grid lg:grid-cols-[200px_1fr_300px] h-full min-h-0 overflow-hidden p-4 gap-4 mx-auto w-full">
        <NewsLeftPanel
          categories={sortedCategories}
          activeCategories={activeCategories}
          disabledCategories={hiddenCategories}
          multiSelect={multiSelect}
          onToggleCategory={handleToggleCategory}
          onToggleCategoryEnabled={isGuestMode ? undefined : handleToggleCategoryEnabled}
          onMultiSelectToggle={() => setMultiSelect((v) => !v)}
          keywords={keywords}
          onAddKeyword={isGuestMode ? undefined : handleAddKeyword}
          onRemoveKeyword={isGuestMode ? undefined : handleRemoveKeyword}
          onSearch={setSearchQuery}
          searchValue={searchQuery}
          onOpenSettings={isGuestMode ? undefined : () => setSettingsModalOpen(true)}
          activeRegion={activeRegion}
          onRegionChange={setActiveRegion}
          regions={[
            { id: 'all', label: 'All Regions', count: 247 },
            { id: 'local', label: `Local (${preferences?.homeLocation || 'TX'})`, count: 34 },
            { id: 'national', label: 'National', count: 89 },
            { id: 'world', label: 'World', count: 124 }
          ]}
        />
        <div className="flex flex-col min-h-0 min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg2)] shadow-sm">
          <div className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text2)]">News</p>
              <h1 className="text-2xl font-semibold text-[var(--text)]">Your Daily Briefing</h1>
            </div>
            {!isGuestMode && (
              <button
                onClick={() => setSettingsModalOpen(true)}
                className="w-[30px] h-[30px] rounded-[6px] border border-[var(--border2)] flex items-center justify-center text-[var(--text3)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                aria-label="Quick settings"
              >
                <span className="material-symbols-outlined text-[16px]">tune</span>
              </button>
            )}
          </div>
          <div className="border-b border-[var(--border)]">
          <BreakingBanner text="🚨 Major cybersecurity breach affects 50M users nationwide. Markets react violently as tech stocks tumble..." />
          <FeedToolbar 
            activeFilter={feedFilter} 
            onFilterChange={(f) => {
              setFeedFilter(f);
              if (f === 'Nearby') setActiveRegion('local');
              else if (activeRegion === 'local') setActiveRegion('all');
            }}
            storyCount={storyCount}
            viewMode={viewMode}
            onViewChange={setViewMode}
          />
          </div>
          <div
            ref={desktopFeedRef}
            tabIndex={-1}
            className="flex-1 min-h-0 overflow-y-auto p-4 focus:outline-none"
          >
            <AlgorithmicFeed
              categories={enabledCategories}
              activeCategory={feedCategory}
              activeRegion={activeRegion}
              activeDate={activeDate}
              searchQuery={searchQuery}
              onArticle={handleDesktopArticleSelect}
              prefetchedFeed={prefetchedFeed}
              onCountChange={setStoryCount}
              viewMode={viewMode}
            />
          </div>
        </div>
        <div className="flex flex-col min-h-0 min-w-0 overflow-hidden">
          <RightSidebar>
            {preferences?.showWeather !== false && <WeatherWidget />}
            {preferences?.showMarkets !== false && <MarketsWidget />}
            {preferences?.showCrypto !== false && <CryptoWidget />}
            {followedTeams?.length > 0 && <SportsWidget followedTeams={followedTeams} sportsLeagues={sportsLeagues} />}
            {preferences?.showTrending !== false && <TrendingWidget />}
            <AlertsWidget />
            
            <footer className="mt-8 text-[10px] text-[var(--text3)] pb-4 text-center font-[var(--mono)] uppercase tracking-widest pointer-events-none">
              <p className="mb-[2px]">Data: NewsAPI / Open-Meteo</p>
              <p>&copy; {new Date().getFullYear()} SocialSecure News</p>
            </footer>
          </RightSidebar>
        </div>
      </div>

      {/* ─── Shared overlays ───────────────────────────────────────────────── */}
      <ArticleDrawer
        article={selectedArticle}
        onClose={() => setSelectedArticle(null)}
      />
      <ArticleDrawer
        article={desktopArticlePreview?.article || null}
        variant="popup"
        anchorPosition={desktopArticlePreview?.anchorPosition || null}
        onClose={() => setDesktopArticlePreview(null)}
      />


      {!isGuestMode && (
        <NewsSettingsModal
          isOpen={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          preferences={preferences}
          onUpdatePreferences={handleUpdatePreferences}
        />
      )}
    </div>
  );
}

export default News;
