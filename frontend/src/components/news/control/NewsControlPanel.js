import React, { useState, useMemo } from 'react';
import { HealthDot } from './HealthDot';
import SourcesPanel from './panels/SourcesPanel';
import KeywordsPanel from './panels/KeywordsPanel';
import LocationsPanel from './panels/LocationsPanel';
import SportsTeamsPanel from './panels/SportsTeamsPanel';
import SchedulePanel from './panels/SchedulePanel';
import ExportPanel from './panels/ExportPanel';
import WeatherLocationsPanel from './panels/WeatherLocationsPanel';

const TABS = [
  { id: 'sources', label: 'Sources', icon: '📡' },
  { id: 'keywords', label: 'Keywords', icon: '#' },
  { id: 'locations', label: 'Locations', icon: '📍' },
  { id: 'sports', label: 'Sports Teams', icon: '🏈' },
  { id: 'weather', label: 'Weather', icon: '🌦️' },
  { id: 'schedule', label: 'Schedule', icon: '⏰' },
  { id: 'export', label: 'Export', icon: '📤' }
];

export default function NewsControlPanel({
  sources,
  preferences,
  onToggleSource,
  isSourceEnabled,
  onToggleGoogleNews,
  onToggleSourceCategory,
  onAddKeyword,
  onRemoveKeyword,
  onRenameKeyword,
  newKeyword,
  setNewKeyword,
  onAddLocation,
  onRemoveLocation,
  onSetPrimaryLocation,
  newLocation,
  setNewLocation,
  locationTaxonomy,
  registrationAlignment,
  sportsLeagues,
  followedSportsTeams,
  onSetAllSportsTeams,
  onSetLeagueSportsTeams,
  onToggleSportsTeam,
  weatherLocations,
  onSearchWeatherLocations,
  onAddWeatherLocation,
  onRemoveWeatherLocation,
  onSetPrimaryWeatherLocation,
  onReorderWeatherLocations,
  weatherStatusMessage,
  setWeatherStatusMessage,
  onUpdatePreferences,
  onRefreshHealth,
  onClose,
  onRestore,
  scopes
}) {
  const [activeTab, setActiveTab] = useState('sources');

  const googleNewsEnabled = preferences?.googleNewsEnabled !== false;
  const activeKeywords = preferences?.followedKeywords || [];
  const locations = preferences?.locations || [];
  const getSourcePreferenceId = (source) => source?._id || source?.providerId || source?.id;

  // Compute sidebar stats
  const stats = useMemo(() => {
    const enabledCount = sources.filter(s => {
      if (s.id === 'google-news') return googleNewsEnabled;
      const sourcePreferenceId = getSourcePreferenceId(s);
      return sourcePreferenceId ? isSourceEnabled(sourcePreferenceId) : false;
    }).length;
    const greenCount = sources.filter(s => s.health === 'green').length;
    const yellowCount = sources.filter(s => s.health === 'yellow').length;
    const redCount = sources.filter(s => s.health === 'red').length;
    return { enabledCount, totalCount: sources.length, greenCount, yellowCount, redCount };
  }, [sources, googleNewsEnabled, isSourceEnabled]);

  // Active feeds for sidebar widget
  const activeFeeds = useMemo(() => {
    return sources.filter(s => {
      if (s.id === 'google-news') return googleNewsEnabled;
      const sourcePreferenceId = getSourcePreferenceId(s);
      return s.enabled || (sourcePreferenceId && isSourceEnabled(sourcePreferenceId));
    });
  }, [sources, googleNewsEnabled, isSourceEnabled]);

  return (
    <div className="border-b border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-sky-50/50 shadow-sm">
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">

        {/* Header Row */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900">News Control Panel</h2>
            <p className="mt-0.5 text-xs text-slate-500">Manage sources, keywords, and preferences</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRestore}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
              aria-label="Restore default preferences"
            >
              Restore
            </button>
            <button
              onClick={onRefreshHealth}
              className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
              aria-label="Refresh source health"
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 transition-colors hover:text-slate-700"
              aria-label="Close control panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab Pills */}
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-3 scrollbar-hide" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span className="text-xs">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Two-column layout: sidebar + main */}
        <div className="mt-3 flex gap-6">

          {/* Sidebar */}
          <div className="hidden md:block w-56 shrink-0 space-y-4">
            {/* Stats summary */}
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Summary</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-slate-600">Sources</div>
                <div className="text-right font-semibold text-slate-900">{stats.enabledCount}/{stats.totalCount}</div>
                <div className="text-slate-600">Keywords</div>
                <div className="text-right font-semibold text-slate-900">{activeKeywords.length}</div>
                <div className="text-slate-600">Locations</div>
                <div className="text-right font-semibold text-slate-900">{locations.length}</div>
                <div className="text-slate-600">Sports Teams</div>
                <div className="text-right font-semibold text-slate-900">{(followedSportsTeams || []).length}</div>
                <div className="text-slate-600">Weather</div>
                <div className="text-right font-semibold text-slate-900">{(weatherLocations || []).length}</div>
              </div>
              <div className="mt-1 flex items-center gap-3 border-t border-slate-200/70 pt-1">
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#10b981' }} />
                  {stats.greenCount}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                  {stats.yellowCount}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                  {stats.redCount}
                </span>
              </div>
            </div>

            {/* Section shortcuts */}
            <div className="space-y-1">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sections</p>
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition-colors ${
                    activeTab === tab.id
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Active feeds widget */}
            <div className="rounded-2xl border border-sky-200/80 bg-sky-50/70 p-3 shadow-sm">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-sky-800">Active Feeds</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {activeFeeds.length > 0 ? activeFeeds.map((source) => (
                  <div key={source.id} className="flex items-center gap-1.5 text-xs text-sky-700">
                    <HealthDot health={source.health} healthReason={source.healthReason} size={6} />
                    <span className="truncate">{source.name}</span>
                    {source.wiringState === 'catalog_only' && (
                      <span className="shrink-0 text-[9px] text-amber-600">Not wired</span>
                    )}
                  </div>
                )) : (
                  <p className="text-[11px] text-sky-400">No active feeds</p>
                )}
              </div>
            </div>
          </div>

          {/* Main panel content */}
          <div className="flex-1 min-w-0" id={`panel-${activeTab}`} role="tabpanel">
            {activeTab === 'sources' && (
              <SourcesPanel
                sources={sources}
                onToggleSource={onToggleSource}
                isSourceEnabled={isSourceEnabled}
                onToggleGoogleNews={onToggleGoogleNews}
                googleNewsEnabled={googleNewsEnabled}
                preferences={preferences}
                onToggleSourceCategory={onToggleSourceCategory}
              />
            )}
            {activeTab === 'keywords' && (
              <KeywordsPanel
                keywords={activeKeywords}
                onAddKeyword={onAddKeyword}
                onRemoveKeyword={onRemoveKeyword}
                onRenameKeyword={onRenameKeyword}
                newKeyword={newKeyword}
                setNewKeyword={setNewKeyword}
              />
            )}
            {activeTab === 'locations' && (
              <LocationsPanel
                locations={locations}
                onAddLocation={onAddLocation}
                onRemoveLocation={onRemoveLocation}
                onSetPrimaryLocation={onSetPrimaryLocation}
                newLocation={newLocation}
                setNewLocation={setNewLocation}
                locationTaxonomy={locationTaxonomy}
                registrationAlignment={registrationAlignment}
              />
            )}
            {activeTab === 'schedule' && (
              <SchedulePanel
                preferences={preferences}
                onUpdatePreferences={onUpdatePreferences}
                scopes={scopes}
              />
            )}
            {activeTab === 'sports' && (
              <SportsTeamsPanel
                leagues={sportsLeagues}
                followedSportsTeams={followedSportsTeams}
                onSetAllTeams={onSetAllSportsTeams}
                onSetLeagueTeams={onSetLeagueSportsTeams}
                onToggleTeam={onToggleSportsTeam}
              />
            )}
            {activeTab === 'weather' && (
              <WeatherLocationsPanel
                locations={weatherLocations}
                onSearchLocations={onSearchWeatherLocations}
                onAddLocation={onAddWeatherLocation}
                onRemoveLocation={onRemoveWeatherLocation}
                onSetPrimary={onSetPrimaryWeatherLocation}
                onReorder={onReorderWeatherLocations}
                statusMessage={weatherStatusMessage}
                setStatusMessage={setWeatherStatusMessage}
              />
            )}
            {activeTab === 'export' && (
              <ExportPanel />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
