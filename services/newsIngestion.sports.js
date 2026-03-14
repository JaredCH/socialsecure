'use strict';

/**
 * newsIngestion.sports.js
 *
 * Pipeline 3 — Sports Team News
 *
 * Fetches Google News RSS for each sports team that at least one user follows.
 * Deduplicates across teams so the same article isn't inserted multiple times even
 * if it covers multiple teams in the same game.
 *
 * Schedule: daily at 6 AM + triggered when a user adds a new team.
 */

const Parser = require('rss-parser');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const NewsPreferences = require('../models/NewsPreferences');
const { buildSportsTeamFeedUrl } = require('../config/newsCategoryFeeds');
const { calculateViralScore } = require('./newsViralScore');

const parser = new Parser({ timeout: 14000, headers: { 'User-Agent': 'SocialSecure-NewsBot/1.0' } });

// Sports team registry — id → { name, league, shortName }
// This matches the team IDs stored in NewsPreferences.followedSportsTeams
const SPORTS_TEAMS = {
  // NFL
  'nfl-ari': { name: 'Arizona Cardinals', league: 'nfl', shortName: 'Cardinals' },
  'nfl-atl': { name: 'Atlanta Falcons', league: 'nfl', shortName: 'Falcons' },
  'nfl-bal': { name: 'Baltimore Ravens', league: 'nfl', shortName: 'Ravens' },
  'nfl-buf': { name: 'Buffalo Bills', league: 'nfl', shortName: 'Bills' },
  'nfl-car': { name: 'Carolina Panthers', league: 'nfl', shortName: 'Panthers' },
  'nfl-chi': { name: 'Chicago Bears', league: 'nfl', shortName: 'Bears' },
  'nfl-cin': { name: 'Cincinnati Bengals', league: 'nfl', shortName: 'Bengals' },
  'nfl-cle': { name: 'Cleveland Browns', league: 'nfl', shortName: 'Browns' },
  'nfl-dal': { name: 'Dallas Cowboys', league: 'nfl', shortName: 'Cowboys' },
  'nfl-den': { name: 'Denver Broncos', league: 'nfl', shortName: 'Broncos' },
  'nfl-det': { name: 'Detroit Lions', league: 'nfl', shortName: 'Lions' },
  'nfl-gb': { name: 'Green Bay Packers', league: 'nfl', shortName: 'Packers' },
  'nfl-hou': { name: 'Houston Texans', league: 'nfl', shortName: 'Texans' },
  'nfl-ind': { name: 'Indianapolis Colts', league: 'nfl', shortName: 'Colts' },
  'nfl-jax': { name: 'Jacksonville Jaguars', league: 'nfl', shortName: 'Jaguars' },
  'nfl-kc': { name: 'Kansas City Chiefs', league: 'nfl', shortName: 'Chiefs' },
  'nfl-lv': { name: 'Las Vegas Raiders', league: 'nfl', shortName: 'Raiders' },
  'nfl-lac': { name: 'Los Angeles Chargers', league: 'nfl', shortName: 'Chargers' },
  'nfl-lar': { name: 'Los Angeles Rams', league: 'nfl', shortName: 'Rams' },
  'nfl-mia': { name: 'Miami Dolphins', league: 'nfl', shortName: 'Dolphins' },
  'nfl-min': { name: 'Minnesota Vikings', league: 'nfl', shortName: 'Vikings' },
  'nfl-ne': { name: 'New England Patriots', league: 'nfl', shortName: 'Patriots' },
  'nfl-no': { name: 'New Orleans Saints', league: 'nfl', shortName: 'Saints' },
  'nfl-nyg': { name: 'New York Giants', league: 'nfl', shortName: 'Giants' },
  'nfl-nyj': { name: 'New York Jets', league: 'nfl', shortName: 'Jets' },
  'nfl-phi': { name: 'Philadelphia Eagles', league: 'nfl', shortName: 'Eagles' },
  'nfl-pit': { name: 'Pittsburgh Steelers', league: 'nfl', shortName: 'Steelers' },
  'nfl-sf': { name: 'San Francisco 49ers', league: 'nfl', shortName: '49ers' },
  'nfl-sea': { name: 'Seattle Seahawks', league: 'nfl', shortName: 'Seahawks' },
  'nfl-tb': { name: 'Tampa Bay Buccaneers', league: 'nfl', shortName: 'Buccaneers' },
  'nfl-ten': { name: 'Tennessee Titans', league: 'nfl', shortName: 'Titans' },
  'nfl-was': { name: 'Washington Commanders', league: 'nfl', shortName: 'Commanders' },
  // NBA
  'nba-atl': { name: 'Atlanta Hawks', league: 'nba', shortName: 'Hawks' },
  'nba-bos': { name: 'Boston Celtics', league: 'nba', shortName: 'Celtics' },
  'nba-bkn': { name: 'Brooklyn Nets', league: 'nba', shortName: 'Nets' },
  'nba-cha': { name: 'Charlotte Hornets', league: 'nba', shortName: 'Hornets' },
  'nba-chi': { name: 'Chicago Bulls', league: 'nba', shortName: 'Bulls' },
  'nba-cle': { name: 'Cleveland Cavaliers', league: 'nba', shortName: 'Cavaliers' },
  'nba-dal': { name: 'Dallas Mavericks', league: 'nba', shortName: 'Mavericks' },
  'nba-den': { name: 'Denver Nuggets', league: 'nba', shortName: 'Nuggets' },
  'nba-det': { name: 'Detroit Pistons', league: 'nba', shortName: 'Pistons' },
  'nba-gsw': { name: 'Golden State Warriors', league: 'nba', shortName: 'Warriors' },
  'nba-hou': { name: 'Houston Rockets', league: 'nba', shortName: 'Rockets' },
  'nba-ind': { name: 'Indiana Pacers', league: 'nba', shortName: 'Pacers' },
  'nba-lac': { name: 'LA Clippers', league: 'nba', shortName: 'Clippers' },
  'nba-lal': { name: 'Los Angeles Lakers', league: 'nba', shortName: 'Lakers' },
  'nba-mem': { name: 'Memphis Grizzlies', league: 'nba', shortName: 'Grizzlies' },
  'nba-mia': { name: 'Miami Heat', league: 'nba', shortName: 'Heat' },
  'nba-mil': { name: 'Milwaukee Bucks', league: 'nba', shortName: 'Bucks' },
  'nba-min': { name: 'Minnesota Timberwolves', league: 'nba', shortName: 'Timberwolves' },
  'nba-no': { name: 'New Orleans Pelicans', league: 'nba', shortName: 'Pelicans' },
  'nba-nyk': { name: 'New York Knicks', league: 'nba', shortName: 'Knicks' },
  'nba-okc': { name: 'Oklahoma City Thunder', league: 'nba', shortName: 'Thunder' },
  'nba-orl': { name: 'Orlando Magic', league: 'nba', shortName: 'Magic' },
  'nba-phi': { name: 'Philadelphia 76ers', league: 'nba', shortName: '76ers' },
  'nba-phx': { name: 'Phoenix Suns', league: 'nba', shortName: 'Suns' },
  'nba-por': { name: 'Portland Trail Blazers', league: 'nba', shortName: 'Trail Blazers' },
  'nba-sac': { name: 'Sacramento Kings', league: 'nba', shortName: 'Kings' },
  'nba-sas': { name: 'San Antonio Spurs', league: 'nba', shortName: 'Spurs' },
  'nba-tor': { name: 'Toronto Raptors', league: 'nba', shortName: 'Raptors' },
  'nba-uta': { name: 'Utah Jazz', league: 'nba', shortName: 'Jazz' },
  'nba-was': { name: 'Washington Wizards', league: 'nba', shortName: 'Wizards' },
  // MLB
  'mlb-ari': { name: 'Arizona Diamondbacks', league: 'mlb', shortName: 'Diamondbacks' },
  'mlb-atl': { name: 'Atlanta Braves', league: 'mlb', shortName: 'Braves' },
  'mlb-bal': { name: 'Baltimore Orioles', league: 'mlb', shortName: 'Orioles' },
  'mlb-bos': { name: 'Boston Red Sox', league: 'mlb', shortName: 'Red Sox' },
  'mlb-chc': { name: 'Chicago Cubs', league: 'mlb', shortName: 'Cubs' },
  'mlb-cws': { name: 'Chicago White Sox', league: 'mlb', shortName: 'White Sox' },
  'mlb-cin': { name: 'Cincinnati Reds', league: 'mlb', shortName: 'Reds' },
  'mlb-cle': { name: 'Cleveland Guardians', league: 'mlb', shortName: 'Guardians' },
  'mlb-col': { name: 'Colorado Rockies', league: 'mlb', shortName: 'Rockies' },
  'mlb-det': { name: 'Detroit Tigers', league: 'mlb', shortName: 'Tigers' },
  'mlb-hou': { name: 'Houston Astros', league: 'mlb', shortName: 'Astros' },
  'mlb-kc': { name: 'Kansas City Royals', league: 'mlb', shortName: 'Royals' },
  'mlb-laa': { name: 'Los Angeles Angels', league: 'mlb', shortName: 'Angels' },
  'mlb-lad': { name: 'Los Angeles Dodgers', league: 'mlb', shortName: 'Dodgers' },
  'mlb-mia': { name: 'Miami Marlins', league: 'mlb', shortName: 'Marlins' },
  'mlb-mil': { name: 'Milwaukee Brewers', league: 'mlb', shortName: 'Brewers' },
  'mlb-min': { name: 'Minnesota Twins', league: 'mlb', shortName: 'Twins' },
  'mlb-nym': { name: 'New York Mets', league: 'mlb', shortName: 'Mets' },
  'mlb-nyy': { name: 'New York Yankees', league: 'mlb', shortName: 'Yankees' },
  'mlb-oak': { name: 'Oakland Athletics', league: 'mlb', shortName: 'Athletics' },
  'mlb-phi': { name: 'Philadelphia Phillies', league: 'mlb', shortName: 'Phillies' },
  'mlb-pit': { name: 'Pittsburgh Pirates', league: 'mlb', shortName: 'Pirates' },
  'mlb-sd': { name: 'San Diego Padres', league: 'mlb', shortName: 'Padres' },
  'mlb-sf': { name: 'San Francisco Giants', league: 'mlb', shortName: 'Giants' },
  'mlb-sea': { name: 'Seattle Mariners', league: 'mlb', shortName: 'Mariners' },
  'mlb-stl': { name: 'St. Louis Cardinals', league: 'mlb', shortName: 'Cardinals' },
  'mlb-tb': { name: 'Tampa Bay Rays', league: 'mlb', shortName: 'Rays' },
  'mlb-tex': { name: 'Texas Rangers', league: 'mlb', shortName: 'Rangers' },
  'mlb-tor': { name: 'Toronto Blue Jays', league: 'mlb', shortName: 'Blue Jays' },
  'mlb-was': { name: 'Washington Nationals', league: 'mlb', shortName: 'Nationals' },
  // NHL
  'nhl-ana': { name: 'Anaheim Ducks', league: 'nhl', shortName: 'Ducks' },
  'nhl-ari': { name: 'Arizona Coyotes', league: 'nhl', shortName: 'Coyotes' },
  'nhl-bos': { name: 'Boston Bruins', league: 'nhl', shortName: 'Bruins' },
  'nhl-buf': { name: 'Buffalo Sabres', league: 'nhl', shortName: 'Sabres' },
  'nhl-cgy': { name: 'Calgary Flames', league: 'nhl', shortName: 'Flames' },
  'nhl-car': { name: 'Carolina Hurricanes', league: 'nhl', shortName: 'Hurricanes' },
  'nhl-chi': { name: 'Chicago Blackhawks', league: 'nhl', shortName: 'Blackhawks' },
  'nhl-col': { name: 'Colorado Avalanche', league: 'nhl', shortName: 'Avalanche' },
  'nhl-cbj': { name: 'Columbus Blue Jackets', league: 'nhl', shortName: 'Blue Jackets' },
  'nhl-dal': { name: 'Dallas Stars', league: 'nhl', shortName: 'Stars' },
  'nhl-det': { name: 'Detroit Red Wings', league: 'nhl', shortName: 'Red Wings' },
  'nhl-edm': { name: 'Edmonton Oilers', league: 'nhl', shortName: 'Oilers' },
  'nhl-fla': { name: 'Florida Panthers', league: 'nhl', shortName: 'Panthers' },
  'nhl-lak': { name: 'Los Angeles Kings', league: 'nhl', shortName: 'Kings' },
  'nhl-min': { name: 'Minnesota Wild', league: 'nhl', shortName: 'Wild' },
  'nhl-mtl': { name: 'Montreal Canadiens', league: 'nhl', shortName: 'Canadiens' },
  'nhl-nsh': { name: 'Nashville Predators', league: 'nhl', shortName: 'Predators' },
  'nhl-njd': { name: 'New Jersey Devils', league: 'nhl', shortName: 'Devils' },
  'nhl-nyi': { name: 'New York Islanders', league: 'nhl', shortName: 'Islanders' },
  'nhl-nyr': { name: 'New York Rangers', league: 'nhl', shortName: 'Rangers' },
  'nhl-ott': { name: 'Ottawa Senators', league: 'nhl', shortName: 'Senators' },
  'nhl-phi': { name: 'Philadelphia Flyers', league: 'nhl', shortName: 'Flyers' },
  'nhl-pit': { name: 'Pittsburgh Penguins', league: 'nhl', shortName: 'Penguins' },
  'nhl-sjs': { name: 'San Jose Sharks', league: 'nhl', shortName: 'Sharks' },
  'nhl-sea': { name: 'Seattle Kraken', league: 'nhl', shortName: 'Kraken' },
  'nhl-stl': { name: 'St. Louis Blues', league: 'nhl', shortName: 'Blues' },
  'nhl-tbl': { name: 'Tampa Bay Lightning', league: 'nhl', shortName: 'Lightning' },
  'nhl-tor': { name: 'Toronto Maple Leafs', league: 'nhl', shortName: 'Maple Leafs' },
  'nhl-van': { name: 'Vancouver Canucks', league: 'nhl', shortName: 'Canucks' },
  'nhl-vgk': { name: 'Vegas Golden Knights', league: 'nhl', shortName: 'Golden Knights' },
  'nhl-was': { name: 'Washington Capitals', league: 'nhl', shortName: 'Capitals' },
  'nhl-wpg': { name: 'Winnipeg Jets', league: 'nhl', shortName: 'Jets' },
};

function extractImageUrl(item) {
  if (item['media:content']?.$.url) return item['media:content'].$.url;
  if (item.enclosure?.url) return item.enclosure.url;
  if (item['media:thumbnail']?.$.url) return item['media:thumbnail'].$.url;
  const html = item['content:encoded'] || item.content || '';
  const match = html.match(/<img[^>]+src="([^"]+)"/i);
  return match ? match[1] : null;
}

/**
 * Ingest news for a single sports team.
 * Tags articles with `sportTeamIds` so the feed can filter by followed teams.
 */
async function ingestSportsTeamNews(teamId) {
  const team = SPORTS_TEAMS[teamId];
  if (!team) {
    console.warn(`[sports-ingest] Unknown team ID: ${teamId}`);
    return { teamId, error: 'unknown_team' };
  }

  const feedUrl = buildSportsTeamFeedUrl(team.name, team.league);
  let items = [];
  try {
    const parsed = await parser.parseURL(feedUrl);
    items = parsed.items || [];
  } catch (err) {
    console.warn(`[sports-ingest] Feed failed for ${teamId}:`, err.message);
    return { teamId, error: err.message, inserted: 0 };
  }

  let inserted = 0;
  let duplicates = 0;

  for (const item of items) {
    const url = item.link || item.guid;
    if (!url) continue;

    const urlHash = crypto
      .createHash('sha256')
      .update(url.toLowerCase().trim())
      .digest('hex')
      .substring(0, 16);

    try {
      // If the article already exists (from another team or the sports category),
      // just add this teamId to sportTeamIds rather than creating a duplicate.
      const existing = await Article.findOne({ normalizedUrlHash: urlHash });
      if (existing) {
        if (!existing.sportTeamIds.includes(teamId)) {
          existing.sportTeamIds.push(teamId);
          await existing.save();
        }
        duplicates++;
        continue;
      }

      const articleData = {
        title: (item.title || '').trim(),
        description: (item.contentSnippet || item.summary || '').trim().substring(0, 1000),
        source: item.creator || item.author || 'Google News Sports',
        url,
        imageUrl: extractImageUrl(item),
        publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
        category: 'sports',
        pipeline: 'sports',
        sportTeamIds: [teamId],
        sourceType: 'googleNews',
        feedSource: `sports-${teamId}`,
        normalizedUrlHash: urlHash,
        ingestTimestamp: new Date(),
        localityLevel: 'global',
        scopeReason: 'source_default',
        scopeConfidence: 0.1,
      };

      const scored = calculateViralScore(articleData, {});
      articleData.viralScore = scored.score;
      articleData.viralSignals = scored.signals;
      articleData.isPromoted = scored.isPromoted;

      await Article.create(articleData);
      inserted++;
    } catch (err) {
      if (err.code !== 11000) {
        console.error(`[sports-ingest] ${teamId} item error:`, err.message);
      } else {
        duplicates++;
      }
    }
  }

  return { teamId, team: team.name, inserted, duplicates, fetched: items.length };
}

/**
 * Ingest news for ALL sports teams that at least one user currently follows.
 * Deduplicates team IDs before fetching.
 */
async function ingestAllFollowedTeams() {
  if (mongoose.connection?.readyState !== 1) {
    console.warn('[sports-ingest] DB not ready — skipping run');
    return;
  }

  // Gather all distinct followed team IDs across all user preferences
  const prefDocs = await NewsPreferences.find(
    { followedSportsTeams: { $exists: true, $not: { $size: 0 } } },
    { followedSportsTeams: 1 }
  ).lean();

  const teamIdSet = new Set();
  for (const doc of prefDocs) {
    (doc.followedSportsTeams || []).forEach(id => teamIdSet.add(id));
  }

  const teamIds = [...teamIdSet];
  if (!teamIds.length) {
    console.log('[sports-ingest] No followed teams found — skipping');
    return [];
  }

  console.log(`[sports-ingest] Ingesting news for ${teamIds.length} distinct teams`);
  const results = [];

  for (const teamId of teamIds) {
    try {
      const result = await ingestSportsTeamNews(teamId);
      results.push(result);
      // Rate limit: 1 req/sec avg
      await new Promise(r => setTimeout(r, 900 + Math.random() * 300));
    } catch (err) {
      console.error(`[sports-ingest] Error for ${teamId}:`, err.message);
      results.push({ teamId, error: err.message });
    }
  }

  const totalInserted = results.reduce((s, r) => s + (r.inserted || 0), 0);
  console.log(`[sports-ingest] Complete: ${totalInserted} inserted across ${teamIds.length} teams`);

  return results;
}

module.exports = {
  SPORTS_TEAMS,
  ingestSportsTeamNews,
  ingestAllFollowedTeams,
};
