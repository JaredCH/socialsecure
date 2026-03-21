import React, { useState } from 'react';
import LocationWeatherPanel from './panels/LocationWeatherPanel';
import ContentTrackingPanel from './panels/ContentTrackingPanel';

const TABS = [
  { id: 'location-weather', label: 'Location & Weather', icon: 'location_on', summary: 'Manage locations for local news and weather forecasts.' },
  { id: 'content-tracking', label: 'Content Tracking', icon: 'tune', summary: 'Keywords, sports teams, and market tickers in one place.' },
];

export default function NewsControlPanel({
  preferences,
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
}) {
  const [activeTab, setActiveTab] = useState('location-weather');

  const activeKeywords = preferences?.followedKeywords || [];

  const renderActivePanel = () => {
    if (activeTab === 'location-weather') {
      return (
        <LocationWeatherPanel
          locations={preferences?.locations || []}
          onAddLocation={onAddLocation}
          onRemoveLocation={onRemoveLocation}
          onSetPrimaryLocation={onSetPrimaryLocation}
          newLocation={newLocation}
          setNewLocation={setNewLocation}
          locationTaxonomy={locationTaxonomy}
          registrationAlignment={registrationAlignment}
          weatherLocations={weatherLocations}
          onSearchWeatherLocations={onSearchWeatherLocations}
          onAddWeatherLocation={onAddWeatherLocation}
          onRemoveWeatherLocation={onRemoveWeatherLocation}
          onSetPrimaryWeatherLocation={onSetPrimaryWeatherLocation}
          onReorderWeatherLocations={onReorderWeatherLocations}
          weatherStatusMessage={weatherStatusMessage}
          setWeatherStatusMessage={setWeatherStatusMessage}
        />
      );
    }

    if (activeTab === 'content-tracking') {
      return (
        <ContentTrackingPanel
          keywords={activeKeywords}
          onAddKeyword={onAddKeyword}
          onRemoveKeyword={onRemoveKeyword}
          onRenameKeyword={onRenameKeyword}
          newKeyword={newKeyword}
          setNewKeyword={setNewKeyword}
          sportsLeagues={sportsLeagues}
          followedSportsTeams={followedSportsTeams}
          onSetAllSportsTeams={onSetAllSportsTeams}
          onSetLeagueSportsTeams={onSetLeagueSportsTeams}
          onToggleSportsTeam={onToggleSportsTeam}
          tickers={preferences?.stockTickers || []}
          tickersEnabled={preferences?.stockTickersEnabled || false}
          onUpdatePreferences={onUpdatePreferences}
        />
      );
    }

    return null;
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.12),_transparent_32%),linear-gradient(180deg,_rgba(248,250,252,0.98),_rgba(255,255,255,0.96))] text-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 py-2 backdrop-blur-xl sm:px-6 lg:px-8">
          <span className="font-semibold text-sm text-slate-950">News Settings</span>
          <div className="flex items-center gap-2">
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

      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200/80 bg-white/70 px-6 py-6 backdrop-blur-xl lg:flex lg:min-h-0 lg:flex-col lg:gap-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sections</div>
            <div className="mt-3 space-y-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full text-left ${
                    activeTab === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/5'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px] leading-none">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
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

          <div className="flex-1 overflow-y-auto p-4" id={`panel-${activeTab}`} role="tabpanel">
            {renderActivePanel()}
          </div>
        </section>
      </div>
    </div>
  );
}
