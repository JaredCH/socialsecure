const mongoose = require('mongoose');

/**
 * SportsSchedule Model
 * Stores game schedules for sports teams.
 * Used to track upcoming games, off-season status, and TBD scenarios.
 */
const sportsScheduleSchema = new mongoose.Schema({
  // Team identifier (e.g., "nfl:kansas-city-chiefs")
  teamId: {
    type: String,
    required: true,
    index: true
  },
  // League identifier (e.g., "NFL", "NBA", "MLB")
  league: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  // Team name (e.g., "Kansas City Chiefs")
  teamName: {
    type: String,
    required: true,
    trim: true
  },
  // Opponent team identifier
  opponentId: {
    type: String,
    default: null
  },
  // Opponent team name
  opponentName: {
    type: String,
    default: null,
    trim: true
  },
  // Game date/time (UTC)
  gameDate: {
    type: Date,
    required: true,
    index: true
  },
  // Whether the game is at home
  isHome: {
    type: Boolean,
    default: null
  },
  // Venue/stadium name
  venue: {
    type: String,
    default: null,
    trim: true
  },
  // Game status
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'postponed', 'canceled', 'tbd'],
    default: 'scheduled',
    index: true
  },
  // Score (for completed games)
  homeScore: {
    type: Number,
    default: null
  },
  awayScore: {
    type: Number,
    default: null
  },
  // Season information
  season: {
    type: String,
    default: null,
    trim: true
  },
  // Week/round number (for football, etc.)
  week: {
    type: Number,
    default: null
  },
  // Broadcast channel
  broadcast: {
    type: String,
    default: null,
    trim: true
  },
  // Source information
  source: {
    type: String,
    required: true,
    trim: true
  },
  sourceKey: {
    type: String,
    required: true,
    trim: true
  },
  sourceUpdatedAt: {
    type: Date,
    default: Date.now
  },
  // Unique key for deduplication
  dedupeKey: {
    type: String,
    required: true,
    unique: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
sportsScheduleSchema.index({ teamId: 1, gameDate: 1 });
sportsScheduleSchema.index({ league: 1, gameDate: 1 });
sportsScheduleSchema.index({ status: 1, gameDate: 1 });

/**
 * Get upcoming games for a list of team IDs
 * @param {string[]} teamIds - Array of team IDs
 * @param {number} limit - Maximum number of games per team
 * @returns {Promise<Object>} - Map of teamId to next game
 */
sportsScheduleSchema.statics.getUpcomingGames = async function(teamIds, limit = 1) {
  if (!Array.isArray(teamIds) || teamIds.length === 0) {
    return {};
  }

  const now = new Date();
  const results = {};

  for (const teamId of teamIds) {
    const games = await this.find({
      teamId: teamId.toLowerCase(),
      gameDate: { $gte: now },
      status: { $in: ['scheduled', 'in_progress', 'tbd'] }
    })
    .sort({ gameDate: 1 })
    .limit(limit)
    .lean();

    results[teamId.toLowerCase()] = games.length > 0 ? games[0] : null;
  }

  return results;
};

/**
 * Get season status for a league
 * @param {string} league - League identifier
 * @returns {Promise<Object>} - Season status info
 */
sportsScheduleSchema.statics.getLeagueSeasonStatus = async function(league) {
  const now = new Date();
  const leagueUpper = (league || '').toUpperCase();

  // Check if there are any upcoming games in the league
  const upcomingCount = await this.countDocuments({
    league: leagueUpper,
    gameDate: { $gte: now },
    status: { $in: ['scheduled', 'in_progress', 'tbd'] }
  });

  // Check if there are any recent past games (within last 30 days)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentGames = await this.countDocuments({
    league: leagueUpper,
    gameDate: { $gte: thirtyDaysAgo, $lt: now },
    status: { $in: ['completed', 'scheduled'] }
  });

  // Determine if in season
  const isInSeason = upcomingCount > 0 || recentGames > 0;

  // Estimate next season start (rough estimates based on typical league schedules)
  const seasonStarts = {
    NFL: { month: 8, day: 1 },   // Early September
    NBA: { month: 9, day: 15 },  // Late October
    MLB: { month: 2, day: 15 },  // Late March/Early April
    NHL: { month: 8, day: 15 },  // Early October
    MLS: { month: 1, day: 15 },  // Late February/March
    NCAA_FOOTBALL: { month: 7, day: 15 }, // Late August
    NCAA_BASKETBALL: { month: 9, day: 15 }, // Late October/November
    PREMIER_LEAGUE: { month: 7, day: 1 }, // August
    LA_LIGA: { month: 7, day: 1 } // August
  };

  let nextSeasonStart = null;
  if (!isInSeason && seasonStarts[leagueUpper]) {
    const seasonInfo = seasonStarts[leagueUpper];
    const currentYear = now.getFullYear();
    let nextYear = currentYear;
    
    // If we're past the typical season start month, next season is next year
    if (now.getMonth() > seasonInfo.month) {
      nextYear = currentYear + 1;
    }
    
    nextSeasonStart = new Date(nextYear, seasonInfo.month, seasonInfo.day);
  }

  return {
    league: leagueUpper,
    isInSeason,
    upcomingGamesCount: upcomingCount,
    nextSeasonStart
  };
};

module.exports = mongoose.model('SportsSchedule', sportsScheduleSchema);