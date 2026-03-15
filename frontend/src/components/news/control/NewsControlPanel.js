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
  { id: 'sources', label: 'Sources', icon: 'rss_feed', summary: 'Control which feeds are active and healthy.' },
  { id: 'keywords', label: 'Keywords', icon: 'sell', summary: 'Follow topics you want to surface first.' },
  { id: 'locations', label: 'Locations', icon: 'location_on', summary: 'Set the places used for local news relevance.' },
  { id: 'sports', label: 'Sports Teams', icon: 'sports_football', summary: 'Pick teams for personalized schedules and coverage.' },
  { id: 'weather', label: 'Weather', icon: 'partly_cloudy_day', summary: 'Manage forecast locations and saved coordinates.' },
  { id: 'schedule', label: 'Schedule', icon: 'schedule', summary: 'Tune cadence and default feed scope.' },
  { id: 'export', label: 'Export', icon: 'upload', summary: 'Export or review your current news settings.' }
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
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) || TABS[0];

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

  const summaryCards = [
    { label: 'Enabled sources', value: `${stats.enabledCount}/${stats.totalCount}`, tone: 'from-sky-500/15 to-cyan-500/5' },
    { label: 'Saved keywords', value: activeKeywords.length, tone: 'from-amber-500/15 to-orange-500/5' },
    { label: 'News locations', value: locations.length, tone: 'from-emerald-500/15 to-teal-500/5' },
    { label: 'Weather points', value: (weatherLocations || []).length, tone: 'from-indigo-500/15 to-violet-500/5' }
  ];

  const renderActivePanel = () => {
    if (activeTab === 'sources') {
      return (
        <SourcesPanel
          sources={sources}
          onToggleSource={onToggleSource}
          isSourceEnabled={isSourceEnabled}
          onToggleGoogleNews={onToggleGoogleNews}
          googleNewsEnabled={googleNewsEnabled}
          preferences={preferences}
          onToggleSourceCategory={onToggleSourceCategory}
        />
      );
    }

    if (activeTab === 'keywords') {
      return (
        <KeywordsPanel
          keywords={activeKeywords}
          onAddKeyword={onAddKeyword}
          onRemoveKeyword={onRemoveKeyword}
          onRenameKeyword={onRenameKeyword}
          newKeyword={newKeyword}
          setNewKeyword={setNewKeyword}
        />
      );
    }

    if (activeTab === 'locations') {
      return (
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
      );
    }

    if (activeTab === 'schedule') {
      return (
        <SchedulePanel
          preferences={preferences}
          onUpdatePreferences={onUpdatePreferences}
          scopes={scopes}
        />
      );
    }

    if (activeTab === 'sports') {
      return (
        <SportsTeamsPanel
          leagues={sportsLeagues}
          followedSportsTeams={followedSportsTeams}
          onSetAllTeams={onSetAllSportsTeams}
          onSetLeagueTeams={onSetLeagueSportsTeams}
          onToggleTeam={onToggleSportsTeam}
        />
      );
    }

    if (activeTab === 'weather') {
      return (
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
      );
    }

    return <ExportPanel />;
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.12),_transparent_32%),linear-gradient(180deg,_rgba(248,250,252,0.98),_rgba(255,255,255,0.96))] text-slate-900">
      <div className="border-b border-slate-200/80 bg-white/80 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
              <span className="material-symbols-outlined text-sm leading-none">tune</span>
              News workspace
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">News Control Panel</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">A clearer workspace for managing sources, local coverage, sports teams, and weather locations without losing context from the rest of the page.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              onClick={onRestore}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              aria-label="Restore default preferences"
            >
              Restore defaults
            </button>
            <button
              onClick={onRefreshHealth}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
              aria-label="Refresh source health"
            >
              Refresh health
            </button>
            <button
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition-colors hover:text-slate-900"
              aria-label="Close control panel"
            >
              <span className="material-symbols-outlined text-[20px] leading-none">close</span>
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div key={card.label} className={`rounded-2xl border border-white/80 bg-gradient-to-br ${card.tone} px-4 py-3 shadow-sm`}>
              <div className="text-xs font-medium text-slate-500">{card.label}</div>
              <div className="mt-1 text-2xl font-semibold text-slate-950">{card.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200/80 bg-white/70 px-6 py-6 backdrop-blur-xl lg:flex lg:min-h-0 lg:flex-col lg:gap-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sections</div>
            <div className="mt-3 space-y-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                    activeTab === tab.id
                      ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10'
                      : 'border-slate-200 bg-white/85 text-slate-700 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px] leading-none">{tab.icon}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{tab.label}</div>
                      <div className={`mt-0.5 text-xs ${activeTab === tab.id ? 'text-white/75' : 'text-slate-500'}`}>{tab.summary}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-sky-200/80 bg-sky-50/70 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-800">Active feeds</div>
                <div className="mt-1 text-sm text-sky-900">{activeFeeds.length > 0 ? `${activeFeeds.length} source${activeFeeds.length === 1 ? '' : 's'} currently active` : 'No feeds enabled yet'}</div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />{stats.greenCount}</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" />{stats.yellowCount}</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-rose-500" />{stats.redCount}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {activeFeeds.length > 0 ? activeFeeds.slice(0, 8).map((source, index) => (
                <div key={`${source._id || source.providerId || source.id || source.name}-${index}`} className="flex items-center gap-2 rounded-2xl bg-white/85 px-3 py-2 text-sm text-slate-700">
                  <HealthDot health={source.health} healthReason={source.healthReason} size={7} />
                  <span className="min-w-0 flex-1 truncate">{source.name}</span>
                  {source.wiringState === 'catalog_only' ? <span className="text-[10px] font-semibold text-amber-600">Needs wiring</span> : null}
                </div>
              )) : (
                <div className="rounded-2xl bg-white/80 px-3 py-3 text-sm text-slate-500">Enable a feed to see it here.</div>
              )}
            </div>
          </div>
        </aside>

        <section className="min-h-0 flex flex-col">
          <div className="border-b border-slate-200/70 bg-white/65 px-4 py-3 backdrop-blur-xl sm:px-6 lg:hidden" role="tablist">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] leading-none">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto flex max-w-4xl flex-col gap-5">
              <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-6">
                <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <span className="material-symbols-outlined text-[16px] leading-none">{activeTabMeta.icon}</span>
                      {activeTabMeta.label}
                    </div>
                    <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">{activeTabMeta.label}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{activeTabMeta.summary}</p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="font-medium text-slate-900">Simple view</div>
                    <div className="mt-1">Everything in this panel is grouped into one focused workspace so it is easier to scan and use.</div>
                  </div>
                </div>

                <div className="pt-5" id={`panel-${activeTab}`} role="tabpanel">
                  {renderActivePanel()}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
