import React, { useState, useMemo } from 'react';
import { HealthDot } from './HealthDot';
import SourcesPanel from './panels/SourcesPanel';
import KeywordsPanel from './panels/KeywordsPanel';
import LocationsPanel from './panels/LocationsPanel';
import SchedulePanel from './panels/SchedulePanel';
import ExportPanel from './panels/ExportPanel';

const TABS = [
  { id: 'sources', label: 'Sources', icon: '📡' },
  { id: 'keywords', label: 'Keywords', icon: '#' },
  { id: 'locations', label: 'Locations', icon: '📍' },
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
    <div className="bg-white border-b border-gray-200/60 shadow-sm">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4">

        {/* Header Row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">News Control Panel</h2>
            <p className="text-xs text-gray-500 mt-0.5">Manage sources, keywords, and preferences</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRestore}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              aria-label="Restore default preferences"
            >
              Restore
            </button>
            <button
              onClick={onRefreshHealth}
              className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
              aria-label="Refresh source health"
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              aria-label="Close control panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab Pills */}
        <div className="flex gap-1 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-hide" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="text-xs">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Two-column layout: sidebar + main */}
        <div className="flex gap-6 mt-3">

          {/* Sidebar */}
          <div className="hidden md:block w-56 shrink-0 space-y-4">
            {/* Stats summary */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Summary</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-gray-600">Sources</div>
                <div className="text-right font-medium text-gray-900">{stats.enabledCount}/{stats.totalCount}</div>
                <div className="text-gray-600">Keywords</div>
                <div className="text-right font-medium text-gray-900">{activeKeywords.length}</div>
                <div className="text-gray-600">Locations</div>
                <div className="text-right font-medium text-gray-900">{locations.length}</div>
              </div>
              <div className="flex items-center gap-3 pt-1 border-t border-gray-200/60 mt-1">
                <span className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#10b981' }} />
                  {stats.greenCount}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                  {stats.yellowCount}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                  {stats.redCount}
                </span>
              </div>
            </div>

            {/* Section shortcuts */}
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Sections</p>
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Active feeds widget */}
            <div className="bg-indigo-50/60 rounded-xl p-3 ring-1 ring-indigo-100/80">
              <p className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider mb-2">Active Feeds</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {activeFeeds.length > 0 ? activeFeeds.map((source) => (
                  <div key={source.id} className="flex items-center gap-1.5 text-xs text-indigo-600">
                    <HealthDot health={source.health} healthReason={source.healthReason} size={6} />
                    <span className="truncate">{source.name}</span>
                    {source.wiringState === 'catalog_only' && (
                      <span className="text-[9px] text-amber-500 shrink-0">Not wired</span>
                    )}
                  </div>
                )) : (
                  <p className="text-[11px] text-indigo-400">No active feeds</p>
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
            {activeTab === 'export' && (
              <ExportPanel />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
