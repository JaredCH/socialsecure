import React, { useState, useEffect, useMemo } from 'react';
import { Widget } from './RightSidebar';
import { newsAPI } from '../../utils/api';
import { getTeamColors } from '../../constants/teamColors';

function hexLuminance(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const toLinear = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function readableTextColor(colors) {
  return hexLuminance(colors.secondary) > 0.4 ? colors.primary : colors.secondary;
}

export default function SportsWidget({ followedTeams = [], sportsLeagues = [] }) {
  const [schedules, setSchedules] = useState({});
  const [leagueStatuses, setLeagueStatuses] = useState({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('All');

  const normalizeTeamId = (team) => {
    if (typeof team === 'string') return team.toLowerCase();
    return (team?.id || team?._id || team?.teamId || '').toLowerCase();
  };

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
          abbreviation: team?.abbreviation || team?.abbr || '',
        });
      });
    });
    return teamMap;
  }, [sportsLeagues]);

  const processedFollowedTeams = useMemo(() => {
    return followedTeams.map(team => {
      const normalizedId = normalizeTeamId(team);
      const teamInfo = getTeamInfo.get(normalizedId);
      if (teamInfo) return { ...teamInfo, id: normalizedId, isFollowed: true };
      
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
          leagueId: leagueSlug,
          abbreviation: teamSlug.split('-').map(w => w[0]).join('').toUpperCase().substring(0, 3),
          isFollowed: true,
        };
      }
      return { id: normalizedId, displayName: team, leagueName: 'Unknown', isFollowed: true };
    });
  }, [followedTeams, getTeamInfo]);

  useEffect(() => {
    if (processedFollowedTeams.length === 0) return;
    setLoading(true);
    const teamIds = processedFollowedTeams.map(t => t.id);
    newsAPI.getSportsSchedules(teamIds).then((res) => {
      if (res.data?.schedules) setSchedules(res.data.schedules);
      if (res.data?.leagueStatuses) setLeagueStatuses(res.data.leagueStatuses);
    }).catch(console.error).finally(() => setLoading(false));
  }, [processedFollowedTeams]);

  const userTimeZone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
  }, []);

  const formatGameTime = (gameDate) => {
    if (!gameDate) return 'TBD';
    const d = new Date(gameDate);
    const now = new Date();
    const localTime = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d < now) return 'Final';
    if (d.getDate() === now.getDate()) return `Today ${localTime}`;
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${localTime}`;
  };

  const getGameStatus = (schedule, teamId) => {
    if (!schedule) return { status: 'no-data', label: 'No schedule' };
    const leagueId = schedule.league || processedFollowedTeams.find(t => t.id === teamId)?.leagueId;
    const ls = leagueStatuses[leagueId?.toUpperCase()];
    if (ls && !ls.isInSeason) return { status: 'off-season', label: 'Off-season', nextSeasonStart: ls.nextSeasonStart };
    if (!schedule.nextGame?.date) return { status: 'tbd', label: 'TBD' };
    return { status: 'scheduled', label: formatGameTime(schedule.nextGame.date) };
  };

  const availableLeagues = useMemo(() => {
    const leagues = new Set(processedFollowedTeams.map(t => t.leagueName).filter(Boolean));
    return ['All', ...Array.from(leagues)];
  }, [processedFollowedTeams]);

  if (processedFollowedTeams.length === 0) return null;

  const filteredTeams = processedFollowedTeams.filter(t => activeTab === 'All' || t.leagueName === activeTab);

  // Sorting: Active games first, then scheduled, then TBD, then off-season
  const sortedTeams = [...filteredTeams].sort((a, b) => {
    const sA = getGameStatus(schedules[a.id], a.id).status;
    const sB = getGameStatus(schedules[b.id], b.id).status;
    if (sA === 'off-season' && sB !== 'off-season') return 1;
    if (sB === 'off-season' && sA !== 'off-season') return -1;
    return 0;
  });

  return (
    <Widget id="sports-widget" icon="🏆" title="Sports" statusText={loading ? 'Loading...' : ''}>
      {availableLeagues.length > 2 && (
        <div className="flex overflow-x-auto gap-[12px] px-[14px] pt-[6px] border-b border-[var(--border)] [&::-webkit-scrollbar]:hidden">
          {availableLeagues.map(league => (
            <div 
              key={league}
              onClick={() => setActiveTab(league)}
              className={`font-[var(--mono)] text-[10px] pb-[6px] cursor-pointer whitespace-nowrap border-b-2 transition-colors duration-200 ${
                activeTab === league ? 'text-[var(--accent)] border-[var(--accent)]' : 'text-[var(--text3)] border-transparent hover:text-[var(--text)]'
              }`}
            >
              {league}
            </div>
          ))}
        </div>
      )}
      
      <div className="flex flex-col">
        {sortedTeams.map(team => {
          const schedule = schedules[team.id];
          const gameStatus = getGameStatus(schedule, team.id);
          const colors = getTeamColors(team.id);
          const game = schedule?.nextGame;
          const isOffSeason = gameStatus.status === 'off-season';

          const renderTeamHalf = (name, abbr, c) => {
            const tText = readableTextColor(c);
            return (
              <div 
                className="flex-1 flex flex-col justify-center items-center relative overflow-hidden" 
                style={{ backgroundColor: c.primary, color: tText }}
              >
                <div className="absolute inset-0 opacity-10" style={{ backgroundColor: c.secondary }} />
                <span className="font-[var(--sans)] text-[10px] sm:text-[12px] font-bold tracking-tight relative z-10 z-[2] px-[4px]" title={name}>
                  {abbr || name?.substring(0, 3).toUpperCase() || '???'}
                </span>
              </div>
            );
          };

          if (!game || isOffSeason || gameStatus.status === 'tbd') {
            return (
              <div key={team.id} className={`flex h-[28px] border-b border-[var(--border)] ${isOffSeason ? 'opacity-50 saturate-50' : ''}`}>
                <div className="flex-1 flex" style={{ backgroundColor: colors.primary }}>
                  {renderTeamHalf(team.displayName, team.abbreviation, colors)}
                </div>
                <div className="w-[80px] shrink-0 bg-[var(--bg3)] flex items-center justify-center border-l border-[var(--border)] overflow-hidden">
                  <span className="font-[var(--mono)] text-[8px] text-[var(--text3)] font-semibold tracking-[0.5px] uppercase truncate px-[2px]">
                    {isOffSeason ? 'Off-Season' : 'TBD'}
                  </span>
                </div>
              </div>
            );
          }

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
          const isFinished = game.status === 'final' || game.status === 'completed' || gameStatus.label === 'Final';

          return (
            <div key={team.id} className="flex h-[28px] border-b border-[var(--border)] hover:opacity-90 cursor-pointer">
              {renderTeamHalf(awayTeam.name, awayTeam.abbr, awayTeam.colors)}
              
              <div className="w-[80px] shrink-0 bg-[var(--bg3)] flex flex-col justify-center items-center relative py-[2px] z-10">
                <span className="font-[var(--mono)] text-[6px] text-[var(--text3)] uppercase tracking-[1px] leading-none mb-[2px]">
                  {team.leagueName}
                </span>
                {isLive ? (
                  <div className="flex items-center gap-[4px] font-[var(--display)] text-[12px] text-[var(--text)] leading-none">
                    <span className="w-[4px] h-[4px] bg-[var(--red)] rounded-full animate-blink shrink-0" />
                    <span>{awayTeam.score ?? '-'}</span>
                    <span className="text-[var(--text3)]">-</span>
                    <span>{homeTeam.score ?? '-'}</span>
                  </div>
                ) : isFinished ? (
                  <div className="flex items-center gap-[4px] font-[var(--display)] text-[12px] text-[var(--text3)] leading-none">
                    <span>{awayTeam.score ?? '-'}</span>
                    <span className="text-[var(--border2)]">-</span>
                    <span>{homeTeam.score ?? '-'}</span>
                  </div>
                ) : (
                  <div className="font-[var(--mono)] text-[8px] text-[var(--text)] text-center leading-[1.1] max-w-full px-[2px] truncate">
                    {gameStatus.label}
                  </div>
                )}
              </div>
              
              {renderTeamHalf(homeTeam.name, homeTeam.abbr, homeTeam.colors)}
            </div>
          );
        })}
      </div>
    </Widget>
  );
}
