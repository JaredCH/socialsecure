import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  const bootstrap = useCallback(async () => {
    const [prefsRes, sourcesRes, sportsRes, taxRes] = await Promise.allSettled([
      newsAPI.getPreferences(),
      newsAPI.getSources(),
      newsAPI.getSportsTeams(),
      newsAPI.getLocationTaxonomy(),
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
      <div data-testid="news-mobile-layout" className="lg:hidden flex h-full flex-col overflow-hidden bg-gray-50">
        <WeatherBar variant="sticky" />
        <div>
          <FilterBar
            categories={CATEGORIES}
            activeCategory={feedCategory}
            onCategoryChange={handleToggleCategory}
            onSearch={setSearchQuery}
            onRegionChange={setActiveRegion}
            onDateChange={setActiveDate}
            activeRegion={activeRegion}
            activeDate={activeDate}
          />
        </div>
        <div data-testid="news-mobile-feed" className="flex-1 overflow-y-auto">
          <AlgorithmicFeed
            categories={CATEGORIES}
            activeCategory={feedCategory}
            activeRegion={activeRegion}
            activeDate={activeDate}
            searchQuery={searchQuery}
            onArticle={setSelectedArticle}
          />
        </div>
        <button
          className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-transform"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open news settings"
        >
          <span className="material-symbols-outlined text-xl leading-none">settings</span>
        </button>
      </div>

      {/* ─── Desktop layout (>= lg) ────────────────────────────────────────── */}
      <div className="hidden lg:flex h-full min-h-0 overflow-hidden bg-gray-50">
        <NewsLeftPanel
          categories={CATEGORIES}
          activeCategories={activeCategories}
          multiSelect={multiSelect}
          onToggleCategory={handleToggleCategory}
          onMultiSelectToggle={() => setMultiSelect((v) => !v)}
          followedTeams={followedTeams}
          keywords={keywords}
          onAddKeyword={handleAddKeyword}
          onRemoveKeyword={handleRemoveKeyword}
          onSearch={setSearchQuery}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
          <FilterBar
            categories={CATEGORIES}
            activeCategory={feedCategory}
            onCategoryChange={handleToggleCategory}
            onSearch={setSearchQuery}
            onRegionChange={setActiveRegion}
            onDateChange={setActiveDate}
            activeRegion={activeRegion}
            activeDate={activeDate}
          />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <AlgorithmicFeed
              categories={CATEGORIES}
              activeCategory={feedCategory}
              activeRegion={activeRegion}
              activeDate={activeDate}
              searchQuery={searchQuery}
              onArticle={setSelectedArticle}
            />
          </div>
        </div>
        <div className="w-[300px] shrink-0 flex min-h-0 flex-col gap-4 overflow-y-auto p-4 border-l border-gray-100 bg-white">
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
