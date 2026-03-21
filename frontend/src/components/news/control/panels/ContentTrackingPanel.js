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
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" data-testid="content-tracking-tabs">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubTab(tab.id)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeSubTab === tab.id
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
