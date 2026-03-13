/**
 * Sports Schedule Ingestion Service
 * Fetches sports schedules from external APIs and stores them in the database.
 * Runs twice daily at 3am and 3pm UTC.
 */

const mongoose = require('mongoose');
const SportsSchedule = require('../models/SportsSchedule');
const EventSourceHealth = require('../models/EventSourceHealth');
const { LEAGUE_CATALOG, SPORTS_TEAMS } = require('../data/news/sportsTeamLocationIndex');

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
const isInSeason = (league) => {
  const now = new Date();
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
const getNextSeasonStart = (league) => {
  const now = new Date();
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
 * Build a team lookup map from the sports team index
 */
const buildTeamLookup = () => {
  const teamMap = new Map();
  for (const team of SPORTS_TEAMS) {
    teamMap.set(team.id.toLowerCase(), {
      id: team.id,
      league: team.league,
      team: team.team,
      city: team.city,
      state: team.state,
      variants: team.variants
    });
  }
  return teamMap;
};

/**
 * Generate mock schedule data for development/testing
 * In production, this would be replaced with actual API calls
 */
const generateMockScheduleData = async () => {
  const teamLookup = buildTeamLookup();
  const schedules = [];
  const now = new Date();
  
  // Group teams by league
  const teamsByLeague = new Map();
  for (const team of SPORTS_TEAMS) {
    const league = team.league;
    if (!teamsByLeague.has(league)) {
      teamsByLeague.set(league, []);
    }
    teamsByLeague.get(league).push(team);
  }
  
  // Generate games for each league
  for (const [league, teams] of teamsByLeague) {
    const inSeason = isInSeason(league);
    
    if (!inSeason) {
      // Don't generate games for off-season leagues
      continue;
    }
    
    // Shuffle teams and create matchups
    const shuffledTeams = [...teams].sort(() => Math.random() - 0.5);
    
    // Generate 1-2 upcoming games per team
    for (let i = 0; i < shuffledTeams.length; i++) {
      const team = shuffledTeams[i];
      const opponentIndex = (i + 1) % shuffledTeams.length;
      const opponent = shuffledTeams[opponentIndex];
      
      // Generate game date (1-14 days from now)
      const daysFromNow = Math.floor(Math.random() * 14) + 1;
      const gameDate = new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000);
      
      // Random game time
      const hour = 12 + Math.floor(Math.random() * 8); // 12pm - 8pm
      gameDate.setHours(hour, 0, 0, 0);
      
      const isHome = Math.random() > 0.5;
      
      schedules.push({
        teamId: team.id.toLowerCase(),
        league: league,
        teamName: team.team,
        opponentId: opponent.id.toLowerCase(),
        opponentName: opponent.team,
        gameDate: gameDate,
        isHome: isHome,
        venue: isHome ? `${team.city} Stadium` : `${opponent.city} Stadium`,
        status: 'scheduled',
        season: `${now.getFullYear()}-${(now.getFullYear() + 1).toString().slice(-2)}`,
        source: 'mock',
        sourceKey: `mock:${league}:${team.id}:${gameDate.toISOString()}`,
        dedupeKey: `mock:${league}:${team.id}:${gameDate.toISOString()}`
      });
    }
  }
  
  return schedules;
};

/**
 * Fetch sports schedules from ESPN API
 * Note: ESPN doesn't have a public schedule API, so we use their RSS feeds
 * and parse game information from the news items
 */
const fetchEspnSchedules = async (league) => {
  const Parser = require('rss-parser');
  const parser = new Parser({
    timeout: 10000,
    headers: {
      'User-Agent': 'SocialSecure-SportsIngestion/1.0'
    }
  });
  
  const leagueUrls = {
    NFL: 'https://www.espn.com/espn/rss/nfl/news',
    NBA: 'https://www.espn.com/espn/rss/nba/news',
    MLB: 'https://www.espn.com/espn/rss/mlb/news',
    NHL: 'https://www.espn.com/espn/rss/nhl/news',
    // Add more leagues as needed
  };
  
  const url = leagueUrls[league];
  if (!url) {
    return [];
  }
  
  try {
    const feed = await parser.parseURL(url);
    // ESPN RSS feeds are news, not schedules
    // In production, you would use a proper sports data API
    // For now, return empty array
    return [];
  } catch (error) {
    console.error(`[sports-ingestion] Error fetching ESPN ${league}:`, error.message);
    return [];
  }
};

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
    leagues: {},
    totalUpserts: 0,
    errors: []
  };
  
  try {
    // Generate mock data for development
    // In production, replace with actual API calls
    const schedules = await generateMockScheduleData();
    
    // Upsert schedules
    const upserts = await upsertSchedules(schedules);
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
  const normalizedIds = teamIds.map(id => id.toLowerCase());
  const results = {};
  
  for (const teamId of normalizedIds) {
    // Get team info
    const teamLookup = buildTeamLookup();
    const teamInfo = teamLookup.get(teamId);
    
    if (!teamInfo) {
      results[teamId] = null;
      continue;
    }
    
    // Get next upcoming game
    const nextGame = await SportsSchedule.findOne({
      teamId: teamId,
      gameDate: { $gte: now },
      status: { $in: ['scheduled', 'in_progress', 'tbd'] }
    }).sort({ gameDate: 1 }).lean();
    
    // Get season status
    const seasonStatus = isInSeason(teamInfo.league);
    const nextSeasonStart = !seasonStatus ? getNextSeasonStart(teamInfo.league) : null;
    
    results[teamId] = {
      teamId: teamId,
      teamName: teamInfo.team,
      league: teamInfo.league,
      nextGame: nextGame ? {
        date: nextGame.gameDate,
        opponent: nextGame.opponentName,
        isHome: nextGame.isHome,
        venue: nextGame.venue,
        status: nextGame.status
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
  isInSeason,
  getNextSeasonStart,
  LEAGUE_SEASONS
};