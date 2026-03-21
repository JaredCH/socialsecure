import React, { useMemo, useState } from 'react';
import { getTeamColors } from '../../../../constants/teamColors';

/**
 * Determine readable text color (black or white) against a hex background.
 */
function contrastText(hex) {
  if (!hex || hex.length < 7) return '#ffffff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // W3C relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#000000' : '#ffffff';
}

export default function SportsTeamsPanel({
  leagues,
  followedSportsTeams,
  onSetAllTeams,
  onSetLeagueTeams,
  onToggleTeam
}) {
  const safeLeagues = leagues || [];
  const [activeLeagueId, setActiveLeagueId] = useState(safeLeagues[0]?.id || '');
  const [query, setQuery] = useState('');

  const selectedSet = useMemo(() => new Set(followedSportsTeams || []), [followedSportsTeams]);

  const activeLeague = safeLeagues.find((l) => l.id === activeLeagueId) || safeLeagues[0];
  const normalizedQuery = query.trim().toLowerCase();

  const filteredTeams = useMemo(() => {
    if (!activeLeague) return [];
    return (activeLeague.teams || []).filter((team) => {
      if (!normalizedQuery) return true;
      const haystack = `${team.team || team.name || ''} ${team.city || ''} ${team.state || ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [activeLeague, normalizedQuery]);

  const leagueTeamIds = filteredTeams.map((t) => t.id);
  const selectedInLeague = leagueTeamIds.filter((id) => selectedSet.has(id)).length;

  return (
    <div className="space-y-4" data-testid="sports-teams-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Sports Team Monitoring</h3>
        <span className="text-xs text-slate-400">{selectedSet.size} selected</span>
      </div>

      {/* League tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" role="tablist" data-testid="sports-league-tabs">
        {safeLeagues.map((league) => {
          const isActive = league.id === (activeLeague?.id || '');
          const count = (league.teams || []).filter((t) => selectedSet.has(t.id)).length;
          return (
            <button
              key={league.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => { setActiveLeagueId(league.id); setQuery(''); }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {league.icon && <span className="text-sm leading-none">{league.icon}</span>}
              <span>{league.label || league.name || league.id}</span>
              {count > 0 && (
                <span className={`ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${
                  isActive ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search + bulk actions */}
      {activeLeague && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${activeLeague.label || activeLeague.name || ''} teams…`}
            className="flex-1 min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onSetLeagueTeams(activeLeague.id, true, leagueTeamIds)}
            className="shrink-0 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onSetLeagueTeams(activeLeague.id, false, leagueTeamIds)}
            className="shrink-0 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            None
          </button>
          <span className="shrink-0 text-[11px] text-slate-400">{selectedInLeague}/{filteredTeams.length}</span>
        </div>
      )}

      {/* Team cards grid */}
      <div className="flex flex-wrap gap-2 max-h-[28rem] overflow-y-auto pr-0.5" data-testid="sports-team-cards">
        {filteredTeams.map((team) => {
          const selected = selectedSet.has(team.id);
          const colors = getTeamColors(team.id);
          const textColor = contrastText(colors.primary);
          const teamName = team.team || team.name || team.shortName || team.id;

          return (
            <button
              key={team.id}
              type="button"
              onClick={() => onToggleTeam(team.id, selected)}
              data-testid={`sports-team-card-${team.id}`}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer select-none ${
                selected ? 'ring-2 ring-offset-1 ring-indigo-500 shadow-sm' : 'ring-1 ring-slate-200 opacity-60 hover:opacity-90'
              }`}
              style={selected ? { backgroundColor: colors.primary, color: textColor, borderColor: colors.secondary } : {}}
            >
              {selected && (
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: colors.secondary }}
                />
              )}
              <span className="truncate">{teamName}</span>
            </button>
          );
        })}

        {filteredTeams.length === 0 && (
          <p className="w-full text-sm text-slate-400 text-center py-4">No teams match your search.</p>
        )}
      </div>
    </div>
  );
}
