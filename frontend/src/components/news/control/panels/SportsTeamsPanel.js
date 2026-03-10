import React, { useMemo, useState } from 'react';

export default function SportsTeamsPanel({
  leagues,
  followedSportsTeams,
  onSetAllTeams,
  onSetLeagueTeams,
  onToggleTeam
}) {
  const [query, setQuery] = useState('');
  const [expandedLeagueIds, setExpandedLeagueIds] = useState([]);

  const selectedSet = useMemo(() => new Set(followedSportsTeams || []), [followedSportsTeams]);
  const normalizedQuery = query.trim().toLowerCase();

  const filteredLeagues = useMemo(() => {
    return (leagues || []).map((league) => {
      const teams = (league.teams || []).filter((team) => {
        if (!normalizedQuery) return true;
        const haystack = `${team.team} ${team.city} ${team.state} ${team.leagueLabel}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });
      return { ...league, teams };
    }).filter((league) => league.teams.length > 0 || !normalizedQuery);
  }, [leagues, normalizedQuery]);

  const allVisibleTeamIds = filteredLeagues.flatMap((league) => league.teams.map((team) => team.id));
  const allVisibleSelected = allVisibleTeamIds.length > 0 && allVisibleTeamIds.every((id) => selectedSet.has(id));

  const toggleLeague = (leagueId) => {
    setExpandedLeagueIds((prev) => (
      prev.includes(leagueId)
        ? prev.filter((id) => id !== leagueId)
        : [...prev, leagueId]
    ));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2 gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Sports Team Monitoring</h3>
        <span className="text-xs text-gray-400">{selectedSet.size} selected</span>
      </div>

      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by team or city"
        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSetAllTeams(allVisibleTeamIds)}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
        >
          Select All
        </button>
        <button
          type="button"
          onClick={() => onSetAllTeams([])}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          Deselect All
        </button>
        <span className="text-xs text-gray-400">{allVisibleSelected ? 'All visible selected' : 'Fast bulk actions'}</span>
      </div>

      <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
        {filteredLeagues.map((league) => {
          const leagueTeamIds = league.teams.map((team) => team.id);
          const selectedCount = leagueTeamIds.filter((id) => selectedSet.has(id)).length;
          const expanded = expandedLeagueIds.includes(league.id);

          return (
            <section key={league.id} className="rounded-xl ring-1 ring-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleLeague(league.id)}
                className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-gray-50"
              >
                <span className="text-sm font-semibold text-gray-800">{league.icon} {league.label}</span>
                <span className="text-xs text-gray-500">{selectedCount}/{league.teams.length}</span>
              </button>

              {expanded && (
                <div className="border-t border-gray-100 px-3 py-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSetLeagueTeams(league.id, true, leagueTeamIds)}
                      className="px-2 py-1 text-[11px] font-semibold rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetLeagueTeams(league.id, false, leagueTeamIds)}
                      className="px-2 py-1 text-[11px] font-semibold rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      Deselect All
                    </button>
                  </div>

                  <div className="grid gap-1">
                    {league.teams.map((team) => {
                      const checked = selectedSet.has(team.id);
                      return (
                        <label key={team.id} className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-800 truncate">{team.team}</p>
                            <p className="text-[11px] text-gray-500 truncate">{team.city}{team.state ? `, ${team.state}` : ''}</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleTeam(team.id, checked)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          );
        })}

        {filteredLeagues.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-3">No teams match your search.</p>
        )}
      </div>
    </div>
  );
}
