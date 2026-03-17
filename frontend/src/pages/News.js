import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { newsAPI } from '../utils/api';
import WeatherBar from '../components/news/WeatherBar';
import FilterBar from '../components/news/FilterBar';
import AlgorithmicFeed from '../components/news/AlgorithmicFeed';
import NewsLeftPanel from '../components/news/NewsLeftPanel';
import SettingsDrawer from '../components/news/SettingsDrawer';
import ArticleDrawer from '../components/news/ArticleDrawer';
import SportsSchedulePanel from '../components/news/SportsSchedulePanel';
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

function News() {
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

  // ── UI state ───────────────────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen]       = useState(false);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [desktopArticlePreview, setDesktopArticlePreview] = useState(null);
  const desktopFeedRef = useRef(null);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  const [prefetchedFeed, setPrefetchedFeed] = useState(null);

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

  useEffect(() => { bootstrap(); }, [bootstrap]);

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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ─── Mobile layout (< lg) ──────────────────────────────────────────── */}
      <div data-testid="news-mobile-layout" className="lg:hidden flex h-full flex-col overflow-hidden bg-slate-100">
        <div className="border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">News</p>
          <h1 className="text-lg font-semibold text-slate-900">Your Daily Briefing</h1>
        </div>
        <WeatherBar variant="sticky" />
        <div data-testid="news-mobile-filter-bar-shell" className="relative z-40 border-b border-slate-200 bg-white">
          <FilterBar
            categories={enabledCategories}
            activeCategory={feedCategory}
            onCategoryChange={handleToggleCategory}
            onSearch={setSearchQuery}
            searchValue={searchQuery}
            onRegionChange={setActiveRegion}
            onDateChange={setActiveDate}
            activeRegion={activeRegion}
            activeDate={activeDate}
            locationTaxonomy={locationTaxonomy}
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
            />
          </div>
        </div>
        <button
          className="fixed bottom-20 right-2 z-40 h-14 w-14 rounded-full border border-white/20 bg-slate-950/75 text-white shadow-[0_18px_36px_rgba(2,6,23,0.35)] backdrop-blur-xl flex items-center justify-center active:scale-95 transition-transform"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open news settings"
        >
          <span className="absolute inset-[7px] rounded-full border border-white/15" aria-hidden="true" />
          <span className="absolute inset-[12px] rounded-full bg-white/[0.04]" aria-hidden="true" />
          <span className="relative material-symbols-outlined text-[1.3rem] leading-none">settings</span>
        </button>
      </div>

      {/* ─── Desktop layout (>= lg) ────────────────────────────────────────── */}
      <div className="hidden lg:flex h-full min-h-0 overflow-hidden bg-slate-100 p-4 gap-4">
        <NewsLeftPanel
          categories={sortedCategories}
          activeCategories={activeCategories}
          disabledCategories={hiddenCategories}
          multiSelect={multiSelect}
          onToggleCategory={handleToggleCategory}
          onToggleCategoryEnabled={handleToggleCategoryEnabled}
          onMultiSelectToggle={() => setMultiSelect((v) => !v)}
          keywords={keywords}
          onAddKeyword={handleAddKeyword}
          onRemoveKeyword={handleRemoveKeyword}
          onSearch={setSearchQuery}
          searchValue={searchQuery}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">News</p>
            <h1 className="text-2xl font-semibold text-slate-900">Your Daily Briefing</h1>
          </div>
          <div className="border-b border-slate-200">
            <FilterBar
              categories={enabledCategories}
              activeCategory={feedCategory}
              onCategoryChange={handleToggleCategory}
              onSearch={setSearchQuery}
              searchValue={searchQuery}
              onRegionChange={setActiveRegion}
              onDateChange={setActiveDate}
              activeRegion={activeRegion}
              activeDate={activeDate}
              locationTaxonomy={locationTaxonomy}
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
            />
          </div>
        </div>
        <div className="w-[320px] shrink-0 flex min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <WeatherBar variant="card" />
          {followedTeams.length > 0 && (
            <SportsSchedulePanel
              followedTeams={followedTeams}
              sportsLeagues={sportsLeagues}
            />
          )}
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

      <SettingsDrawer
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sources={availableSources}
        preferences={preferences}
        onToggleSource={handleToggleSource}
        isSourceEnabled={isSourceEnabled}
        onToggleGoogleNews={handleToggleGoogleNews}
        onToggleSourceCategory={handleToggleSourceCategory}
        onAddKeyword={handleAddKeyword}
        onRemoveKeyword={handleRemoveKeyword}
        onRenameKeyword={handleRenameKeyword}
        newKeyword={newKeyword}
        setNewKeyword={setNewKeyword}
        onAddLocation={handleAddLocation}
        onRemoveLocation={handleRemoveLocation}
        onSetPrimaryLocation={handleSetPrimaryLocation}
        newLocation={newLocation}
        setNewLocation={setNewLocation}
        locationTaxonomy={locationTaxonomy}
        registrationAlignment={registrationAlignment}
        sportsLeagues={sportsLeagues}
        followedSportsTeams={followedTeams}
        onSetAllSportsTeams={handleSetAllSportsTeams}
        onSetLeagueSportsTeams={handleSetLeagueSportsTeams}
        onToggleSportsTeam={handleToggleSportsTeam}
        weatherLocations={preferences?.weatherLocations || []}
        onSearchWeatherLocations={handleSearchWeatherLocations}
        onAddWeatherLocation={handleAddWeatherLocation}
        onRemoveWeatherLocation={handleRemoveWeatherLocation}
        onSetPrimaryWeatherLocation={handleSetPrimaryWeatherLocation}
        onReorderWeatherLocations={handleReorderWeatherLocations}
        weatherStatusMessage={weatherStatusMessage}
        setWeatherStatusMessage={setWeatherStatusMessage}
        onUpdatePreferences={handleUpdatePreferences}
        onRefreshHealth={handleRefreshHealth}
        onRestore={bootstrap}
        scopes={NEWS_SCOPES}
      />
    </>
  );
}

export default News;
