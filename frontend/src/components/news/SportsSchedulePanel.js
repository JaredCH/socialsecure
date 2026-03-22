import React, { useState, useEffect, useMemo } from 'react';
import { newsAPI } from '../../utils/api';
import { getTeamColors } from '../../constants/teamColors';

/** Return relative luminance (0–1) from a hex color string (#RGB or #RRGGBB). */
function hexLuminance(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const toLinear = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Pick the better text color: use secondary if dark enough, otherwise fall back to primary.
 * Threshold 0.4 roughly corresponds to mid-gray (#999); colors brighter than that lack
 * sufficient contrast against the light tinted card background.
 */
function readableTextColor(colors) {
  return hexLuminance(colors.secondary) > 0.4 ? colors.primary : colors.secondary;
}

/**
 * SportsSchedulePanel - Displays upcoming games for user's followed sports teams
 * 
 * @param {Object} props
 * @param {Array} props.followedTeams - Array of team objects the user follows
 * @param {Array} props.sportsLeagues - Array of league data with teams
 */
function SportsSchedulePanel({ followedTeams = [], sportsLeagues = [], className = '' }) {
  const [schedules, setSchedules] = useState({});
  const [leagueStatuses, setLeagueStatuses] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(true);
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
    <div className={`flex flex-col overflow-hidden bg-white ${className}`}>
      {/* Header bar */}
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-slate-100/50 transition-colors border-b border-gray-100"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-[14px] h-[14px] text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Sports</span>
        </div>
        <span className={`material-symbols-outlined text-base text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {/* Expandable content area */}
      <div 
        className={`grid transition-[grid-template-rows,padding,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          expanded ? 'grid-rows-[1fr] opacity-100 px-4 pb-4 pt-3' : 'grid-rows-[0fr] opacity-0 px-4 pb-0 pt-0'
        }`}
      >
        <div className="overflow-hidden lg:overflow-y-auto lg:max-h-[20rem]">
          {loading && (
            <div className="flex items-center justify-center py-4 h-[40px]">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          )}
          
          {error && (
            <p className="text-xs text-red-500 text-center py-2">{error}</p>
          )}

          {!loading && !error && (
            <div 
              className="flex overflow-x-auto snap-x snap-mandatory gap-2 pb-2 -mb-2 scrollbar-none lg:grid lg:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <style>{`.scrollbar-none::-webkit-scrollbar { display: none; }`}</style>
              
              {[...processedFollowedTeams]
                .sort((a, b) => {
                  const sA = getGameStatus(schedules[a.id], a.id).status;
                  const sB = getGameStatus(schedules[b.id], b.id).status;
                  if (sA === 'off-season' && sB !== 'off-season') return 1;
                  if (sB === 'off-season' && sA !== 'off-season') return -1;
                  return 0;
                })
                .map((team) => {
          const schedule = schedules[team.id];
          const gameStatus = getGameStatus(schedule, team.id);
          const colors = getTeamColors(team.id);
          const game = schedule?.nextGame;
          const isOffSeason = gameStatus.status === 'off-season';

          // Helper to render half the card
          const renderTeamHalf = (tName, tAbbr, tColors) => {
             const tText = readableTextColor(tColors);
             return (
               <div className="flex-1 flex flex-col justify-center items-center p-0.5 text-center relative overflow-hidden" style={{ backgroundColor: tColors.primary, color: tText }}>
                 <div className="absolute inset-0 opacity-10" style={{ backgroundColor: tColors.secondary }}></div>
                 <span className="text-[14px] font-black tracking-tight leading-none relative z-10 drop-shadow-sm truncate w-full px-0.5" title={tName}>
                   {tAbbr || tName?.substring(0, 3).toUpperCase() || '???'}
                 </span>
               </div>
             );
          };

          if (!game || isOffSeason || gameStatus.status === 'tbd') {
            return (
              <div key={team.id} className={`h-[40px] w-[140px] lg:w-auto flex flex-col rounded-lg overflow-hidden border border-gray-200 shadow-sm shrink-0 relative ${isOffSeason ? 'opacity-65 saturate-50' : ''}`}>
                <div className="flex-1 flex" style={{ backgroundColor: colors.primary }}>
                  {renderTeamHalf(team.displayName, team.abbreviation, colors)}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center py-[1px] px-1 border-t border-white/20">
                   <span className="text-white text-[7px] font-black uppercase tracking-widest text-center leading-none">
                     {isOffSeason ? 'Off-Season' : 'Schedule TBD'}
                   </span>
                   {gameStatus.nextSeasonStart && (
                     <span className="text-white/80 text-[6px] font-medium leading-none mt-[1px]">
                       Starts {new Date(gameStatus.nextSeasonStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                     </span>
                   )}
                </div>
              </div>
            );
          }

          // Active game split card
          const oppColors = getTeamColors(game.opponent);
          const isHome = game.isHome; 
          
          const awayTeam = {
             name: isHome ? game.opponent : team.displayName,
             abbr: isHome ? game.opponent?.substring(0, 3).toUpperCase() : team.abbreviation,
             colors: isHome ? oppColors : colors,
             score: isHome ? (game.awayScore ?? game.opponentScore) : (game.homeScore ?? game.teamScore), 
          };
          const homeTeam = {
             name: isHome ? team.displayName : game.opponent,
             abbr: isHome ? team.abbreviation : game.opponent?.substring(0, 3).toUpperCase(),
             colors: isHome ? colors : oppColors,
             score: isHome ? (game.homeScore ?? game.teamScore) : (game.awayScore ?? game.opponentScore),
          };
          
          const isLive = game.isLive || game.status === 'live' || game.status === 'in-progress';
          const isFinished = game.status === 'final' || game.status === 'completed' || gameStatus.label === 'Past game';

          return (
            <div key={team.id} className="h-[40px] w-[140px] lg:w-auto flex rounded-lg overflow-hidden border border-gray-200 shadow-sm shrink-0">
               {/* AWAY */}
               {renderTeamHalf(awayTeam.name, awayTeam.abbr, awayTeam.colors)}
               
               {/* CENTER SPLIT */}
               <div className="w-[52px] shrink-0 bg-white flex flex-col justify-center items-center border-x border-gray-100 z-10 px-0.5 text-center shadow-[0_0_15px_rgba(0,0,0,0.08)] relative py-0.5">
                 <span className="text-[6px] font-black text-gray-400 tracking-widest uppercase mb-[1px] leading-none shrink-0">{team.leagueName}</span>
                 
                 {isLive ? (
                   <>
                     <span className="bg-red-500 text-white text-[6px] font-bold px-1 py-[1px] rounded-[2px] animate-pulse mb-[1px] shadow-sm leading-none shrink-0">LIVE</span>
                     <div className="flex items-center gap-[2px] font-black text-slate-800 text-[11px] leading-none shrink-0">
                       <span>{awayTeam.score ?? '-'}</span>
                       <span className="text-gray-300 text-[6px]">-</span>
                       <span>{homeTeam.score ?? '-'}</span>
                     </div>
                   </>
                 ) : isFinished ? (
                   <>
                     <span className="text-[6px] font-black text-gray-500 mb-[1px] tracking-wider uppercase leading-none shrink-0">FINAL</span>
                     <div className="flex items-center gap-[2px] font-black text-slate-800 text-[11px] leading-none shrink-0">
                       <span>{awayTeam.score ?? '-'}</span>
                       <span className="text-gray-300 text-[6px]">-</span>
                       <span>{homeTeam.score ?? '-'}</span>
                     </div>
                   </>
                 ) : (
                   <div className="flex flex-col items-center whitespace-pre-line mt-[1px] shrink-0">
                     <span className="text-[7px] font-bold text-slate-800 leading-[1.1] px-0.5 break-words max-h-full">
                       {gameStatus.label.replace(', ', '\n')}
                     </span>
                   </div>
                 )}
               </div>
               
               {/* HOME */}
               {renderTeamHalf(homeTeam.name, homeTeam.abbr, homeTeam.colors)}
            </div>
          );
        })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SportsSchedulePanel;
