/**
 * Sports Schedule Ingestion Service
 * Fetches sport-specific schedules from public scoreboard feeds and stores them in the database.
 * Runs twice daily at 3am and 3pm UTC.
 */

const https = require('https');
const SportsSchedule = require('../models/SportsSchedule');
const EventSourceHealth = require('../models/EventSourceHealth');
const { LEAGUE_CATALOG, SPORTS_TEAMS, inferSportsTeamsFromText } = require('../data/news/sportsTeamLocationIndex');

const ESPN_SCOREBOARD_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';
const SCHEDULE_FETCH_TIMEOUT_MS = 15000;

const LEAGUE_SCOREBOARD_CONFIG = {
  NFL: { sport: 'football', leaguePath: 'nfl', horizonDays: 21 },
  NCAA_FOOTBALL: { sport: 'football', leaguePath: 'college-football', horizonDays: 28 },
  NBA: { sport: 'basketball', leaguePath: 'nba', horizonDays: 14 },
  NCAA_BASKETBALL: { sport: 'basketball', leaguePath: 'mens-college-basketball', horizonDays: 21 },
  MLB: { sport: 'baseball', leaguePath: 'mlb', horizonDays: 10 },
  NHL: { sport: 'hockey', leaguePath: 'nhl', horizonDays: 14 },
  MLS: { sport: 'soccer', leaguePath: 'usa.1', horizonDays: 21 },
  PREMIER_LEAGUE: { sport: 'soccer', leaguePath: 'eng.1', horizonDays: 21 },
  LA_LIGA: { sport: 'soccer', leaguePath: 'esp.1', horizonDays: 21 }
};

const SPORT_LEAGUE_GROUPS = {
  football: ['NFL', 'NCAA_FOOTBALL'],
  basketball: ['NBA', 'NCAA_BASKETBALL'],
  baseball: ['MLB'],
  hockey: ['NHL'],
  soccer: ['MLS', 'PREMIER_LEAGUE', 'LA_LIGA']
};

// Season definitions for each league
const LEAGUE_SEASONS = {
  NFL: {
    seasonStartMonth: 8, // September
    seasonEndMonth: 1,   // January/February (playoffs)
    offSeasonMonths: [3, 4, 5, 6, 7] // March through July
  },
  NBA: {
    seasonStartMonth: 9, // October
    seasonEndMonth: 5,   // May/June (playoffs)
    offSeasonMonths: [6, 7, 8] // June through August
  },
  MLB: {
    seasonStartMonth: 3, // March/April
    seasonEndMonth: 10,  // October/November
    offSeasonMonths: [11, 12, 1, 2] // November through February
  },
  NHL: {
    seasonStartMonth: 9, // October
    seasonEndMonth: 5,   // May/June (playoffs)
    offSeasonMonths: [6, 7, 8] // June through August
  },
  MLS: {
    seasonStartMonth: 1, // February/March
    seasonEndMonth: 10,  // October/November (playoffs)
    offSeasonMonths: [11, 12] // November through January
  },
  NCAA_FOOTBALL: {
    seasonStartMonth: 7, // August
    seasonEndMonth: 0,   // January
    offSeasonMonths: [1, 2, 3, 4, 5, 6] // February through June
  },
  NCAA_BASKETBALL: {
    seasonStartMonth: 9, // October/November
    seasonEndMonth: 3,   // March/April
    offSeasonMonths: [4, 5, 6, 7, 8] // April through August
  },
  PREMIER_LEAGUE: {
    seasonStartMonth: 7, // August
    seasonEndMonth: 4,   // May
    offSeasonMonths: [5, 6] // May through July
  },
  LA_LIGA: {
    seasonStartMonth: 7, // August
    seasonEndMonth: 4,   // May
    offSeasonMonths: [5, 6] // May through July
  }
};

/**
 * Check if a league is currently in season
 */
const isInSeason = (league, now = new Date()) => {
  const currentMonth = now.getMonth();
  const leagueInfo = LEAGUE_SEASONS[league];
  
  if (!leagueInfo) {
    // Default to in-season if we don't have season info
    return true;
  }
  
  return !leagueInfo.offSeasonMonths.includes(currentMonth);
};

/**
 * Get the next season start date for a league
 */
const getNextSeasonStart = (league, now = new Date()) => {
  const leagueInfo = LEAGUE_SEASONS[league];
  
  if (!leagueInfo) {
    return null;
  }
  
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  // If currently in off-season, next season starts this year
  // If in season, next season starts next year (after current season ends)
  let nextYear = currentYear;
  
  if (currentMonth >= leagueInfo.seasonStartMonth) {
    // We're past the season start, so next season is next cycle
    // But we might still be in season
    if (isInSeason(league)) {
      // Still in season, next season is after this one ends
      // For simplicity, estimate next season start
      if (leagueInfo.seasonStartMonth < leagueInfo.seasonEndMonth) {
        // Season spans within same calendar year
        nextYear = currentYear + 1;
      } else {
        // Season spans across calendar years (like NFL)
        nextYear = currentYear + 1;
      }
    }
  }
  
  return new Date(nextYear, leagueInfo.seasonStartMonth, 1);
};

/**
 * Build a team lookup map from the sports team index.
 */
const buildTeamLookup = () => {
  const teamMap = new Map();
  const leagueMap = new Map();

  for (const team of SPORTS_TEAMS) {
    const normalizedId = team.id.toLowerCase();
    const enriched = {
      id: normalizedId,
      league: team.league,
      team: team.team,
      city: team.city,
      state: team.state,
      sport: team.sport,
      variants: [...new Set([team.team, team.city, ...(team.variants || []), `${team.city} ${team.team}`])]
    };
    teamMap.set(normalizedId, enriched);
    if (!leagueMap.has(team.league)) leagueMap.set(team.league, []);
    leagueMap.get(team.league).push(enriched);
  }

  return { byId: teamMap, byLeague: leagueMap };
};

const TEAM_LOOKUP = buildTeamLookup();

const formatEspnDate = (date) => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}${month}${day}`;
};

const buildLeagueScoreboardUrl = (league, now = new Date()) => {
  const config = LEAGUE_SCOREBOARD_CONFIG[league];
  if (!config) return null;

  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - 1);

  const endDate = new Date(now);
  endDate.setUTCDate(endDate.getUTCDate() + config.horizonDays);

  const dateRange = `${formatEspnDate(startDate)}-${formatEspnDate(endDate)}`;
  return `${ESPN_SCOREBOARD_BASE_URL}/${config.sport}/${config.leaguePath}/scoreboard?dates=${dateRange}&limit=1000`;
};

const fetchJson = (url, timeoutMs = SCHEDULE_FETCH_TIMEOUT_MS) => new Promise((resolve, reject) => {
  const req = https.get(url, {
    headers: {
      'User-Agent': 'SocialSecure-SportsIngestion/1.0',
      Accept: 'application/json'
    },
    timeout: timeoutMs
  }, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error(`Invalid JSON from ${url}`));
      }
    });
  });

  req.on('error', reject);
  req.on('timeout', () => {
    req.destroy(new Error(`Request timed out for ${url}`));
  });
});

const mapCompetitionStatus = (status = {}) => {
  const state = String(status?.type?.state || '').toLowerCase();
  const detail = String(status?.type?.detail || status?.type?.description || '').toLowerCase();

  if (detail.includes('postponed')) return 'postponed';
  if (detail.includes('canceled') || detail.includes('cancelled')) return 'canceled';
  if (state === 'in') return 'in_progress';
  if (state === 'post') return 'completed';
  if (detail.includes('tbd')) return 'tbd';
  return 'scheduled';
};

const formatDisplayTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const findTeamForLeague = (league, competitor = {}) => {
  const leagueTeams = TEAM_LOOKUP.byLeague.get(league) || [];
  const candidates = [
    competitor?.team?.displayName,
    competitor?.team?.shortDisplayName,
    competitor?.team?.name,
    competitor?.team?.abbreviation,
    [competitor?.team?.location, competitor?.team?.name].filter(Boolean).join(' ')
  ].filter(Boolean);

  for (const candidate of candidates) {
    const inferred = inferSportsTeamsFromText(candidate).find((team) => team.league === league);
    if (inferred) {
      return TEAM_LOOKUP.byId.get(inferred.id.toLowerCase()) || null;
    }
  }

  const direct = candidates
    .map((candidate) => String(candidate || '').trim().toLowerCase())
    .find((candidate) => candidate);

  if (!direct) return null;

  return leagueTeams.find((team) => team.variants.some((variant) => String(variant || '').trim().toLowerCase() === direct)) || null;
};

const buildScheduleRecordsFromEvent = ({ league, event }) => {
  const competition = event?.competitions?.[0];
  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  if (!competition || competitors.length < 2) return [];

  const competitionId = competition.id || event.id;
  const gameDate = new Date(competition.date || event.date);
  if (Number.isNaN(gameDate.getTime())) return [];

  const mappedCompetitors = competitors
    .map((competitor) => ({
      competitor,
      team: findTeamForLeague(league, competitor)
    }))
    .filter((entry) => entry.team);

  if (mappedCompetitors.length !== 2) return [];

  const homeEntry = mappedCompetitors.find((entry) => entry.competitor.homeAway === 'home') || mappedCompetitors[0];
  const awayEntry = mappedCompetitors.find((entry) => entry.competitor.homeAway === 'away') || mappedCompetitors[1];
  const venue = competition?.venue?.fullName || null;
  const status = mapCompetitionStatus(competition?.status || event?.status);
  const season = event?.season?.year ? String(event.season.year) : String(gameDate.getUTCFullYear());
  const broadcast = Array.isArray(competition?.broadcasts)
    ? competition.broadcasts.flatMap((item) => item?.names || []).filter(Boolean).join(', ') || null
    : null;
  const week = Number.isFinite(Number(event?.week?.number)) ? Number(event.week.number) : null;
  const homeScore = Number.isFinite(Number(homeEntry.competitor?.score)) ? Number(homeEntry.competitor.score) : null;
  const awayScore = Number.isFinite(Number(awayEntry.competitor?.score)) ? Number(awayEntry.competitor.score) : null;

  return mappedCompetitors.map(({ competitor, team }) => {
    const opponent = team.id === homeEntry.team.id ? awayEntry.team : homeEntry.team;
    const isHome = competitor.homeAway === 'home';

    return {
      teamId: team.id,
      league,
      teamName: team.team,
      opponentId: opponent.id,
      opponentName: opponent.team,
      gameDate,
      isHome,
      venue,
      status,
      season,
      week,
      broadcast,
      homeScore,
      awayScore,
      source: 'espn-scoreboard',
      sourceKey: `espn:${league}:${competitionId}`,
      dedupeKey: `espn:${league}:${competitionId}:${team.id}`
    };
  });
};

const extractSchedulesFromScoreboard = ({ league, payload }) => {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return events.flatMap((event) => buildScheduleRecordsFromEvent({ league, event }));
};

const fetchLeagueSchedules = async (league, { now = new Date(), fetcher = fetchJson } = {}) => {
  const url = buildLeagueScoreboardUrl(league, now);
  if (!url) return [];
  if (!isInSeason(league, now)) return [];

  const payload = await fetcher(url);
  return extractSchedulesFromScoreboard({ league, payload });
};

const fetchGroupedSportSchedules = async (sport, options = {}) => {
  const leagues = SPORT_LEAGUE_GROUPS[sport] || [];
  const responses = await Promise.all(leagues.map(async (league) => {
    try {
      return await fetchLeagueSchedules(league, options);
    } catch (error) {
      console.error(`[sports-ingestion] ${sport}/${league} fetch failed:`, error.message);
      return [];
    }
  }));
  return responses.flat();
};

const fetchFootballSchedules = (options = {}) => fetchGroupedSportSchedules('football', options);
const fetchBasketballSchedules = (options = {}) => fetchGroupedSportSchedules('basketball', options);
const fetchBaseballSchedules = (options = {}) => fetchGroupedSportSchedules('baseball', options);
const fetchHockeySchedules = (options = {}) => fetchGroupedSportSchedules('hockey', options);
const fetchSoccerSchedules = (options = {}) => fetchGroupedSportSchedules('soccer', options);

const getLeagueStatusMap = (leagueIds = [], now = new Date()) => {
  const statuses = {};

  for (const leagueId of leagueIds) {
    const key = String(leagueId || '').toUpperCase();
    if (!key) continue;
    statuses[key] = {
      league: key,
      isInSeason: isInSeason(key, now),
      nextSeasonStart: isInSeason(key, now) ? null : getNextSeasonStart(key, now)?.toISOString() || null
    };
  }

  return statuses;
};

const getAllLeagueStatuses = (now = new Date()) => getLeagueStatusMap(Object.keys(LEAGUE_SCOREBOARD_CONFIG), now);

/**
 * Upsert schedule records to database
 */
const upsertSchedules = async (schedules) => {
  let upserts = 0;
  const now = new Date();
  
  for (const schedule of schedules) {
    try {
      await SportsSchedule.updateOne(
        { dedupeKey: schedule.dedupeKey },
        {
          $set: {
            teamId: schedule.teamId,
            league: schedule.league,
            teamName: schedule.teamName,
            opponentId: schedule.opponentId,
            opponentName: schedule.opponentName,
            gameDate: schedule.gameDate,
            isHome: schedule.isHome,
            venue: schedule.venue,
            status: schedule.status,
            season: schedule.season,
            week: schedule.week,
            broadcast: schedule.broadcast,
            homeScore: schedule.homeScore,
            awayScore: schedule.awayScore,
            source: schedule.source,
            sourceKey: schedule.sourceKey,
            sourceUpdatedAt: now
          },
          $setOnInsert: {
            dedupeKey: schedule.dedupeKey
          }
        },
        { upsert: true }
      );
      upserts += 1;
    } catch (error) {
      console.error(`[sports-ingestion] Error upserting schedule:`, error.message);
    }
  }
  
  return upserts;
};

/**
 * Clean up old schedule records (games that have passed)
 */
const cleanupOldSchedules = async () => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const result = await SportsSchedule.deleteMany({
    gameDate: { $lt: thirtyDaysAgo },
    status: { $in: ['completed', 'canceled'] }
  });
  
  return result.deletedCount;
};

/**
 * Main ingestion function
 * Fetches and stores sports schedules
 */
const runSportsScheduleIngestion = async ({ now = new Date() } = {}) => {
  console.log(`[sports-ingestion] Starting sports schedule ingestion at ${now.toISOString()}`);
  
  const results = {
    sports: {},
    leagues: {},
    totalUpserts: 0,
    errors: []
  };
  
  try {
    const sportFetchers = {
      football: fetchFootballSchedules,
      basketball: fetchBasketballSchedules,
      baseball: fetchBaseballSchedules,
      hockey: fetchHockeySchedules,
      soccer: fetchSoccerSchedules
    };

    const allSchedules = [];

    for (const [sport, fetchSportSchedules] of Object.entries(sportFetchers)) {
      const schedules = await fetchSportSchedules({ now });
      results.sports[sport] = { fetched: schedules.length };
      allSchedules.push(...schedules);
    }

    for (const schedule of allSchedules) {
      if (!results.leagues[schedule.league]) results.leagues[schedule.league] = { fetched: 0 };
      results.leagues[schedule.league].fetched += 1;
    }
    
    // Upsert schedules
    const upserts = await upsertSchedules(allSchedules);
    results.totalUpserts = upserts;
    
    // Clean up old records
    const deleted = await cleanupOldSchedules();
    console.log(`[sports-ingestion] Cleaned up ${deleted} old schedule records`);
    
    // Update health record
    await EventSourceHealth.updateOne(
      { sourceKey: 'sports_schedule_ingestion' },
      {
        $set: {
          enabled: true,
          lastSyncAt: now,
          lastStatus: 'success',
          lastError: null
        },
        $setOnInsert: { sourceKey: 'sports_schedule_ingestion' }
      },
      { upsert: true }
    );
    
    console.log(`[sports-ingestion] Completed: ${upserts} schedules upserted`);
  } catch (error) {
    console.error(`[sports-ingestion] Error:`, error.message);
    results.errors.push(error.message);
    
    // Update health record with error
    await EventSourceHealth.updateOne(
      { sourceKey: 'sports_schedule_ingestion' },
      {
        $set: {
          enabled: true,
          lastSyncAt: now,
          lastStatus: 'error',
          lastError: error.message
        },
        $setOnInsert: { sourceKey: 'sports_schedule_ingestion' }
      },
      { upsert: true }
    );
  }
  
  return results;
};

// Scheduler state
let schedulerInterval = null;
let schedulerStartedAt = null;

/**
 * Start the sports schedule ingestion scheduler
 * Runs twice daily at 3am and 3pm UTC
 */
const startSportsScheduleScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  
  schedulerStartedAt = new Date();
  
  // Calculate next run time
  const getNextRunDelay = () => {
    const now = new Date();
    const hours = now.getUTCHours();
    let nextRun;
    
    if (hours < 3) {
      // Before 3am, next run at 3am
      nextRun = new Date(now);
      nextRun.setUTCHours(3, 0, 0, 0);
    } else if (hours < 15) {
      // Before 3pm, next run at 3pm
      nextRun = new Date(now);
      nextRun.setUTCHours(15, 0, 0, 0);
    } else {
      // After 3pm, next run at 3am tomorrow
      nextRun = new Date(now);
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
      nextRun.setUTCHours(3, 0, 0, 0);
    }
    
    return nextRun.getTime() - now.getTime();
  };
  
  // Run initial ingestion
  runSportsScheduleIngestion().catch((error) => {
    console.error('[sports-ingestion] Initial ingestion failed:', error.message);
  });
  
  // Schedule next runs
  const scheduleNextRun = () => {
    const delay = getNextRunDelay();
    console.log(`[sports-ingestion] Next run in ${Math.round(delay / 1000 / 60)} minutes`);
    
    setTimeout(() => {
      runSportsScheduleIngestion().catch((error) => {
        console.error('[sports-ingestion] Scheduled ingestion failed:', error.message);
      });
      scheduleNextRun();
    }, delay);
  };
  
  scheduleNextRun();
  
  // Also set up a fallback interval check every hour
  schedulerInterval = setInterval(() => {
    const now = new Date();
    const hours = now.getUTCHours();
    
    // Run at 3am (3) or 3pm (15)
    if (hours === 3 || hours === 15) {
      const minutes = now.getUTCMinutes();
      // Only run if within first 5 minutes of the hour
      if (minutes < 5) {
        runSportsScheduleIngestion().catch((error) => {
          console.error('[sports-ingestion] Interval ingestion failed:', error.message);
        });
      }
    }
  }, 60 * 60 * 1000); // Check every hour
  
  console.log('[sports-ingestion] Sports schedule scheduler started (3am/3pm UTC)');
};

/**
 * Stop the sports schedule scheduler
 */
const stopSportsScheduleScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[sports-ingestion] Sports schedule scheduler stopped');
  }
};

/**
 * Get schedule for specific teams
 */
const getTeamSchedules = async (teamIds) => {
  if (!Array.isArray(teamIds) || teamIds.length === 0) {
    return {};
  }
  
  const now = new Date();
  const normalizedIds = [...new Set(teamIds.map(id => String(id || '').toLowerCase()).filter(Boolean))];
  const results = {};
  const upcomingGames = await SportsSchedule.find({
    teamId: { $in: normalizedIds },
    gameDate: { $gte: now },
    status: { $in: ['scheduled', 'in_progress', 'tbd'] }
  }).sort({ gameDate: 1 }).lean();

  const nextGameByTeam = new Map();
  for (const game of upcomingGames) {
    if (!nextGameByTeam.has(game.teamId)) {
      nextGameByTeam.set(game.teamId, game);
    }
  }
  
  for (const teamId of normalizedIds) {
    const teamInfo = TEAM_LOOKUP.byId.get(teamId);
    
    if (!teamInfo) {
      results[teamId] = null;
      continue;
    }
    
    const nextGame = nextGameByTeam.get(teamId) || null;
    
    // Get season status
    const seasonStatus = isInSeason(teamInfo.league, now);
    const nextSeasonStart = !seasonStatus ? getNextSeasonStart(teamInfo.league, now) : null;
    
    results[teamId] = {
      teamId: teamId,
      teamName: teamInfo.team,
      league: teamInfo.league,
      nextGame: nextGame ? {
        date: nextGame.gameDate,
        time: formatDisplayTime(nextGame.gameDate),
        opponent: nextGame.opponentName,
        isHome: nextGame.isHome,
        venue: nextGame.venue,
        status: nextGame.status,
        broadcast: nextGame.broadcast
      } : null,
      season: {
        current: seasonStatus,
        startDate: nextSeasonStart ? nextSeasonStart.toISOString() : null,
        endDate: null
      }
    };
  }
  
  return results;
};

module.exports = {
  runSportsScheduleIngestion,
  startSportsScheduleScheduler,
  stopSportsScheduleScheduler,
  getTeamSchedules,
  getLeagueStatusMap,
  getAllLeagueStatuses,
  fetchFootballSchedules,
  fetchBasketballSchedules,
  fetchBaseballSchedules,
  fetchHockeySchedules,
  fetchSoccerSchedules,
  extractSchedulesFromScoreboard,
  buildLeagueScoreboardUrl,
  isInSeason,
  getNextSeasonStart,
  LEAGUE_SEASONS
};