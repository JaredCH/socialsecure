import React, { useState, useEffect, useMemo } from 'react';
import { newsAPI } from '../../utils/api';

/**
 * SportsSchedulePanel - Displays upcoming games for user's followed sports teams
 * 
 * @param {Object} props
 * @param {Array} props.followedTeams - Array of team objects the user follows
 * @param {Array} props.sportsLeagues - Array of league data with teams
 */
function SportsSchedulePanel({ followedTeams = [], sportsLeagues = [] }) {
  const [schedules, setSchedules] = useState({});
  const [leagueStatuses, setLeagueStatuses] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const userTimeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
      return undefined;
    }
  }, []);

  // Normalize team IDs for comparison
  const normalizeTeamId = (team) => {
    if (typeof team === 'string') return team.toLowerCase();
    return (team?.id || team?._id || team?.teamId || '').toLowerCase();
  };

  // Get team display name
  const getTeamDisplayName = (team) => {
    if (typeof team === 'string') return team;
    return team?.name || team?.displayName || team?.teamName || team;
  };

  // Get team info from leagues data
  const getTeamInfo = useMemo(() => {
    const teamMap = new Map();
    
    sportsLeagues.forEach(league => {
      const leagueName = league?.name || league?.league || 'Unknown League';
      const leagueId = league?.id || league?.leagueId || leagueName.toLowerCase().replace(/\s+/g, '-');
      
      (league?.teams || []).forEach(team => {
        const teamId = normalizeTeamId(team);
        teamMap.set(teamId, {
          ...team,
          leagueName,
          leagueId,
          id: teamId,
          displayName: team?.displayName || team?.name || team?.teamName || 'Unknown Team',
          city: team?.city || team?.location || '',
          name: team?.name || team?.teamName || '',
          abbreviation: team?.abbreviation || team?.abbr || '',
        });
      });
    });
    
    return teamMap;
  }, [sportsLeagues]);

  // Process followed teams to get normalized list
  const processedFollowedTeams = useMemo(() => {
    return followedTeams.map(team => {
      const normalizedId = normalizeTeamId(team);
      const teamInfo = getTeamInfo.get(normalizedId);
      
      if (teamInfo) {
        return {
          ...teamInfo,
          id: normalizedId,
          isFollowed: true,
        };
      }
      
      // Team not found in leagues data - parse info from colon-format ID (e.g. 'nfl:dallas-cowboys')
      const colonIdx = normalizedId.indexOf(':');
      if (colonIdx > 0) {
        const leagueSlug = normalizedId.substring(0, colonIdx);
        const teamSlug = normalizedId.substring(colonIdx + 1);
        const toTitle = (s) => s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const leagueName = leagueSlug.split('-').map(w => w.length <= 4 ? w.toUpperCase() : toTitle(w)).join(' ');
        return {
          id: normalizedId,
          displayName: toTitle(teamSlug),
          leagueName,
          abbreviation: teamSlug.split('-').map(w => w[0]).join('').toUpperCase().substring(0, 3),
          isFollowed: true,
        };
      }
      return {
        id: normalizedId,
        displayName: getTeamDisplayName(team),
        leagueName: team?.league?.name || team?.leagueName || 'Unknown',
        isFollowed: true,
      };
    });
  }, [followedTeams, getTeamInfo]);

  // Fetch schedules from API
  useEffect(() => {
    const fetchSchedules = async () => {
      if (processedFollowedTeams.length === 0) {
        setSchedules({});
        setLeagueStatuses({});
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const teamIds = processedFollowedTeams.map(t => t.id);
        const response = await newsAPI.getSportsSchedules(teamIds);
        
        if (response.data?.schedules) {
          setSchedules(response.data.schedules);
        }
        if (response.data?.leagueStatuses) {
          setLeagueStatuses(response.data.leagueStatuses);
        }
      } catch (err) {
        console.error('Error fetching sports schedules:', err);
        setError('Unable to load schedules');
        // Fall back to empty state on error
        setSchedules({});
      } finally {
        setLoading(false);
      }
    };

    fetchSchedules();
  }, [processedFollowedTeams]);

  // Format game date/time
  const formatGameTime = (game) => {
    if (!game?.date) return 'TBD';
    
    const gameDate = new Date(game.date);
    const now = new Date();
    const formatDateKey = (value) => value.toLocaleDateString('en-CA', { timeZone: userTimeZone });
    const todayKey = formatDateKey(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = formatDateKey(tomorrow);
    const gameKey = formatDateKey(gameDate);
    const localTime = gameDate.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: userTimeZone,
      timeZoneName: 'short'
    });
    
    if (gameDate < now) return 'Past game';
    if (gameKey === todayKey) return `Today, ${localTime}`;
    if (gameKey === tomorrowKey) return `Tomorrow, ${localTime}`;
    
    const dateStr = gameDate.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      timeZone: userTimeZone
    });
    
    return `${dateStr}, ${localTime}`;
  };

  // Get display status for off-season
  const getGameStatus = (schedule, teamId) => {
    if (!schedule) return { status: 'no-data', label: 'No schedule' };
    
    // Check league season status
    const leagueId = schedule.league || processedFollowedTeams.find(t => t.id === teamId)?.leagueId;
    const leagueStatus = leagueStatuses[leagueId?.toUpperCase()];
    
    if (leagueStatus && !leagueStatus.isInSeason) {
      return {
        status: 'off-season',
        label: 'Off-season',
        nextSeasonStart: leagueStatus.nextSeasonStart,
      };
    }
    
    if (!schedule.nextGame?.date) {
      return { status: 'tbd', label: 'Schedule TBD' };
    }
    
    return { status: 'scheduled', label: formatGameTime(schedule.nextGame) };
  };

  // Don't render if no teams followed
  if (processedFollowedTeams.length === 0) {
    return null;
  }

  return (
    <div className="min-h-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/70">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-semibold text-gray-800">Sports Schedule</span>
        </div>
      </div>
      
      <div className="space-y-3 px-4 py-3">
        {loading && (
          <div className="flex items-center justify-center py-4">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}
        
        {error && (
          <p className="text-xs text-red-500 text-center py-2">{error}</p>
        )}
        
        {!loading && !error && processedFollowedTeams.map((team) => {
          const schedule = schedules[team.id];
          const gameStatus = getGameStatus(schedule, team.id);
          
          return (
            <div key={team.id} className="flex items-start gap-2.5 py-1.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-100 to-amber-50 flex items-center justify-center text-xs font-bold text-orange-600 shrink-0">
                {team.abbreviation || team.displayName?.substring(0, 2).toUpperCase() || '??'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {team.displayName}
                </p>
                <p className="text-[11px] text-gray-400">
                  {team.leagueName}
                </p>
                {gameStatus.status === 'off-season' ? (
                  <div className="mt-1">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Off-season
                    </span>
                    {gameStatus.nextSeasonStart && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Season starts {new Date(gameStatus.nextSeasonStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                ) : gameStatus.status === 'tbd' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[10px] font-medium mt-1">
                    Schedule TBD
                  </span>
                ) : gameStatus.status === 'scheduled' && schedule?.nextGame ? (
                  <div className="mt-1">
                    <p className="text-xs text-gray-600">
                      <span className="font-medium">
                        {schedule.nextGame.isHome ? 'vs' : '@'}
                      </span>
                      {' '}
                      <span className="text-gray-800">{schedule.nextGame.opponent}</span>
                    </p>
                    <p className="text-[11px] text-indigo-600 font-medium">
                      {gameStatus.label}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400">No upcoming games</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {processedFollowedTeams.length > 3 && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50">
          <p className="text-[10px] text-gray-400 text-center">
            {processedFollowedTeams.length} teams followed
          </p>
        </div>
      )}
    </div>
  );
}

export default SportsSchedulePanel;
