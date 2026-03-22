import React, { useState } from 'react';
import KeywordsPanel from './KeywordsPanel';
import SportsTeamsPanel from './SportsTeamsPanel';
import StockTickerSettingsPanel from './StockTickerSettingsPanel';

const SUB_TABS = [
  { id: 'keywords', label: 'Keywords', icon: 'sell' },
  { id: 'sports', label: 'Sports Teams', icon: 'sports_football' },
  { id: 'tickers', label: 'Tickers', icon: 'trending_up' },
];

/**
 * Combined Content Tracking panel — Keywords, Sports Teams, and Tickers
 * presented as sub-tabs within a single settings section.
 */
export default function ContentTrackingPanel({
  // Keywords
  keywords,
  onAddKeyword,
  onRemoveKeyword,
  onRenameKeyword,
  newKeyword,
  setNewKeyword,
  // Sports
  sportsLeagues,
  followedSportsTeams,
  onSetAllSportsTeams,
  onSetLeagueSportsTeams,
  onToggleSportsTeam,
  // Tickers
  tickers,
  tickersEnabled,
  onUpdatePreferences,
}) {
  const [activeSubTab, setActiveSubTab] = useState('keywords');

  return (
    <div className="space-y-4" data-testid="content-tracking-panel">
      {/* Sub-tab bar */}
      <div className="flex gap-0.5 rounded-xl bg-slate-100 p-1" data-testid="content-tracking-tabs">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
              activeSubTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] leading-none">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active sub-tab content */}
      {activeSubTab === 'keywords' && (
        <KeywordsPanel
          keywords={keywords}
          onAddKeyword={onAddKeyword}
          onRemoveKeyword={onRemoveKeyword}
          onRenameKeyword={onRenameKeyword}
          newKeyword={newKeyword}
          setNewKeyword={setNewKeyword}
        />
      )}

      {activeSubTab === 'sports' && (
        <SportsTeamsPanel
          leagues={sportsLeagues}
          followedSportsTeams={followedSportsTeams}
          onSetAllTeams={onSetAllSportsTeams}
          onSetLeagueTeams={onSetLeagueSportsTeams}
          onToggleTeam={onToggleSportsTeam}
        />
      )}

      {activeSubTab === 'tickers' && (
        <StockTickerSettingsPanel
          tickers={tickers}
          enabled={tickersEnabled}
          onUpdatePreferences={onUpdatePreferences}
        />
      )}
    </div>
  );
}
