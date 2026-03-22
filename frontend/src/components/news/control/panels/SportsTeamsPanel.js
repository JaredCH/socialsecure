import React, { useMemo, useState } from 'react';
import { getTeamColors } from '../../../../constants/teamColors';

/**
 * Determine readable text color (black or white) against a hex background
 * using the W3C relative luminance formula with sRGB gamma correction.
 */
function contrastText(hex) {
  if (!hex || hex.length < 7) return '#ffffff';
  const toLinear = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(parseInt(hex.slice(1, 3), 16));
  const g = toLinear(parseInt(hex.slice(3, 5), 16));
  const b = toLinear(parseInt(hex.slice(5, 7), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

/** League brand colors for tab styling */
const LEAGUE_TAB_COLORS = {
  nfl:  { bg: '#013369', accent: '#D50A0A' },
  nba:  { bg: '#1D428A', accent: '#C8102E' },
  mlb:  { bg: '#002D72', accent: '#E4002B' },
  nhl:  { bg: '#000000', accent: '#A2AAAD' },
  mls:  { bg: '#231F20', accent: '#80B940' },
};

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
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide" role="tablist" data-testid="sports-league-tabs">
        {safeLeagues.map((league) => {
          const isActive = league.id === (activeLeague?.id || '');
          const count = (league.teams || []).filter((t) => selectedSet.has(t.id)).length;
          const leagueColors = LEAGUE_TAB_COLORS[league.id] || { bg: '#1e293b', accent: '#6366f1' };
          return (
            <button
              key={league.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => { setActiveLeagueId(league.id); setQuery(''); }}
              className={`relative inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-xs font-bold tracking-wide uppercase transition-all ${
                isActive
                  ? 'text-white rounded-lg shadow-md'
                  : 'text-slate-500 rounded-lg hover:text-slate-800 hover:bg-slate-100'
              }`}
              style={isActive ? { backgroundColor: leagueColors.bg, borderBottom: `3px solid ${leagueColors.accent}` } : {}}
            >
              {league.icon && <span className="text-sm leading-none">{league.icon}</span>}
              <span>{league.label || league.name || league.id}</span>
              {count > 0 && (
                <span
                  className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
                  style={isActive
                    ? { backgroundColor: leagueColors.accent, color: '#fff' }
                    : { backgroundColor: leagueColors.bg + '18', color: leagueColors.bg }
                  }
                >{count}</span>
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
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold transition-all cursor-pointer select-none ${
                selected
                  ? 'shadow-md ring-1 ring-white/20 scale-[1.02]'
                  : 'hover:scale-[1.02] hover:shadow-sm'
              }`}
              style={selected
                ? { backgroundColor: colors.primary, color: textColor, boxShadow: `0 2px 8px ${colors.primary}44` }
                : { backgroundColor: colors.primary + '14', color: colors.primary, border: `1.5px solid ${colors.primary}30` }
              }
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-white/30"
                style={{ backgroundColor: selected ? colors.secondary : colors.primary }}
              />
              <span className="truncate">{teamName}</span>
              {selected && (
                <span className="material-symbols-outlined text-[14px] leading-none opacity-80">check_circle</span>
              )}
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
