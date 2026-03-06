const Parser = require('rss-parser');
const EventSchedule = require('../models/EventSchedule');
const EventSourceHealth = require('../models/EventSourceHealth');

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'SocialSecure-EventIngestion/1.0'
  }
});
const DEFAULT_LIVE_SPORT_DURATION_MS = 3 * 60 * 60 * 1000;

const DEFAULT_SOURCES = [
  {
    key: 'tvmaze_us_schedule',
    enabled: true,
    pollIntervalMinutes: 180,
    priority: 10,
    sportOrSeriesScope: ['tv'],
    adapter: 'tvmaze'
  },
  {
    key: 'espn_nfl_rss',
    enabled: true,
    pollIntervalMinutes: 180,
    priority: 8,
    sportOrSeriesScope: ['football', 'nfl'],
    adapter: 'rss',
    url: 'https://www.espn.com/espn/rss/nfl/news'
  },
  {
    key: 'espn_nba_rss',
    enabled: true,
    pollIntervalMinutes: 180,
    priority: 8,
    sportOrSeriesScope: ['basketball', 'nba'],
    adapter: 'rss',
    url: 'https://www.espn.com/espn/rss/nba/news'
  },
  {
    key: 'espn_mlb_rss',
    enabled: true,
    pollIntervalMinutes: 180,
    priority: 8,
    sportOrSeriesScope: ['baseball', 'mlb'],
    adapter: 'rss',
    url: 'https://www.espn.com/espn/rss/mlb/news'
  },
  {
    key: 'espn_nhl_rss',
    enabled: true,
    pollIntervalMinutes: 180,
    priority: 7,
    sportOrSeriesScope: ['hockey'],
    adapter: 'rss',
    url: 'https://www.espn.com/espn/rss/nhl/news'
  },
  {
    key: 'espn_mma_rss',
    enabled: true,
    pollIntervalMinutes: 180,
    priority: 8,
    sportOrSeriesScope: ['mma', 'boxing'],
    adapter: 'rss',
    url: 'https://www.espn.com/espn/rss/mma/news'
  },
  {
    key: 'espn_mens_college_basketball_rss',
    enabled: true,
    pollIntervalMinutes: 240,
    priority: 7,
    sportOrSeriesScope: ['college', 'basketball'],
    adapter: 'rss',
    url: 'https://www.espn.com/espn/rss/ncb/news'
  },
  {
    key: 'espn_college_football_rss',
    enabled: true,
    pollIntervalMinutes: 240,
    priority: 7,
    sportOrSeriesScope: ['college', 'football'],
    adapter: 'rss',
    url: 'https://www.espn.com/espn/rss/ncf/news'
  },
  {
    key: 'espn_mls_rss',
    enabled: true,
    pollIntervalMinutes: 180,
    priority: 8,
    sportOrSeriesScope: ['soccer', 'mls'],
    adapter: 'rss',
    url: 'https://www.espn.com/espn/rss/soccer/news'
  }
];

const buildDedupeKey = ({ eventType, sourceRef, startAt }) =>
  `${eventType}::${sourceRef}::${new Date(startAt).toISOString()}`;

const buildSourceConfig = () => {
  const disabled = String(process.env.EVENT_SOURCES_DISABLED || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  return DEFAULT_SOURCES
    .map((source) => ({
      ...source,
      enabled: source.enabled && !disabled.includes(source.key)
    }))
    .sort((a, b) => b.priority - a.priority);
};

const normalizeRssSportTags = (scope = []) => [...new Set(scope.map((tag) => String(tag || '').toLowerCase()).filter(Boolean))];

const fetchTvMaze = async (source) => {
  const date = new Date();
  const dateString = date.toISOString().slice(0, 10);
  const url = `https://api.tvmaze.com/schedule?country=US&date=${dateString}`;
  const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!response.ok) {
    throw new Error(`TVMaze returned HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((entry) => entry && entry.show && entry.airdate && entry.airstamp)
    .map((entry) => {
      const tags = Array.isArray(entry.show.genres) ? entry.show.genres.map((genre) => String(genre).toLowerCase()) : [];
      tags.push('tv');
      return {
        eventType: 'tv_episode',
        leagueOrSeries: entry.show.name || 'TV Series',
        title: `${entry.show.name || 'Episode'} - S${entry.season || 0}E${entry.number || 0} ${entry.name || ''}`.trim(),
        season: Number.isFinite(entry.season) ? entry.season : null,
        episode: Number.isFinite(entry.number) ? entry.number : null,
        startAt: entry.airstamp,
        endAt: entry.runtime ? new Date(new Date(entry.airstamp).getTime() + (entry.runtime * 60000)) : null,
        sourceRef: `${source.key}:${entry.id || entry.url || entry.airstamp}`,
        sourceUpdatedAt: new Date(),
        sourceKey: source.key,
        status: 'scheduled',
        tags: [...new Set(tags)].slice(0, 20)
      };
    });
};

const fetchRssSports = async (source) => {
  const feed = await parser.parseURL(source.url);
  return (feed.items || [])
    .slice(0, 100)
    .map((item, index) => {
      const publishedAt = item.isoDate || item.pubDate || new Date().toISOString();
      const startAt = new Date(publishedAt);
      if (Number.isNaN(startAt.getTime())) {
        return null;
      }
      const sourceRefRaw = item.guid || item.id || item.link || `${source.key}:${index}`;
      return {
        eventType: 'live_sport',
        leagueOrSeries: source.sportOrSeriesScope?.join('/').toUpperCase() || 'US Sports',
        title: item.title || 'Live Sports Event',
        season: null,
        episode: null,
        startAt: startAt.toISOString(),
        endAt: new Date(startAt.getTime() + DEFAULT_LIVE_SPORT_DURATION_MS).toISOString(),
        sourceRef: `${source.key}:${String(sourceRefRaw).slice(0, 240)}`,
        sourceUpdatedAt: new Date(),
        sourceKey: source.key,
        status: 'scheduled',
        tags: normalizeRssSportTags(source.sportOrSeriesScope)
      };
    })
    .filter(Boolean);
};

const fetchSourceEvents = async (source) => {
  if (source.adapter === 'tvmaze') {
    return fetchTvMaze(source);
  }
  if (source.adapter === 'rss' && source.url) {
    return fetchRssSports(source);
  }
  return [];
};

const ensureHealthRecord = async (source) => {
  let health = await EventSourceHealth.findOne({ sourceKey: source.key });
  if (!health) {
    health = await EventSourceHealth.create({
      sourceKey: source.key,
      enabled: source.enabled,
      pollIntervalMinutes: source.pollIntervalMinutes,
      priority: source.priority,
      sportOrSeriesScope: source.sportOrSeriesScope || []
    });
  }
  return health;
};

const isSourceDue = (health, source, now = new Date()) => {
  if (!source.enabled || health.enabled === false) return false;
  if (health.backoffUntil && health.backoffUntil > now) return false;
  if (!health.lastSyncAt) return true;
  const elapsedMs = now.getTime() - new Date(health.lastSyncAt).getTime();
  return elapsedMs >= (source.pollIntervalMinutes * 60 * 1000);
};

const upsertEvents = async (events) => {
  let upserts = 0;
  for (const event of events) {
    const dedupeKey = buildDedupeKey(event);
    const updateDoc = {
      eventType: event.eventType,
      leagueOrSeries: event.leagueOrSeries,
      title: event.title,
      season: event.season ?? null,
      episode: event.episode ?? null,
      startAt: new Date(event.startAt),
      endAt: event.endAt ? new Date(event.endAt) : null,
      sourceRef: event.sourceRef,
      sourceUpdatedAt: event.sourceUpdatedAt ? new Date(event.sourceUpdatedAt) : new Date(),
      sourceKey: event.sourceKey,
      status: event.status || 'scheduled',
      tags: Array.isArray(event.tags) ? event.tags.slice(0, 20) : []
    };

    await EventSchedule.updateOne(
      { dedupeKey },
      {
        $set: updateDoc,
        $setOnInsert: { dedupeKey }
      },
      { upsert: true }
    );
    upserts += 1;
  }
  return upserts;
};

const runEventScheduleIngestion = async ({ now = new Date() } = {}) => {
  const sources = buildSourceConfig();
  const results = [];

  for (const source of sources) {
    const health = await ensureHealthRecord(source);
    if (!isSourceDue(health, source, now)) {
      continue;
    }

    try {
      const records = await fetchSourceEvents(source);
      const upserts = await upsertEvents(records);
      await EventSourceHealth.updateOne(
        { sourceKey: source.key },
        {
          $set: {
            enabled: source.enabled,
            pollIntervalMinutes: source.pollIntervalMinutes,
            priority: source.priority,
            sportOrSeriesScope: source.sportOrSeriesScope || [],
            lastSyncAt: new Date(),
            lastStatus: 'success',
            lastError: null,
            backoffUntil: null
          },
          $setOnInsert: { sourceKey: source.key },
          $inc: { errorCount: 0 }
        },
        { upsert: true }
      );

      results.push({ sourceKey: source.key, fetched: records.length, upserts, status: 'success' });
      console.log(`[event-ingestion] source=${source.key} fetched=${records.length} upserts=${upserts}`);
    } catch (error) {
      const nextErrorCount = (health.errorCount || 0) + 1;
      const backoffMinutes = Math.min(240, Math.pow(2, Math.min(nextErrorCount, 7)));
      const backoffUntil = new Date(Date.now() + (backoffMinutes * 60 * 1000));

      await EventSourceHealth.updateOne(
        { sourceKey: source.key },
        {
          $set: {
            enabled: source.enabled,
            pollIntervalMinutes: source.pollIntervalMinutes,
            priority: source.priority,
            sportOrSeriesScope: source.sportOrSeriesScope || [],
            lastSyncAt: new Date(),
            lastStatus: 'error',
            lastError: String(error?.message || error),
            backoffUntil
          },
          $setOnInsert: { sourceKey: source.key },
          $inc: { errorCount: 1 }
        },
        { upsert: true }
      );

      results.push({ sourceKey: source.key, fetched: 0, upserts: 0, status: 'error', error: String(error?.message || error) });
      console.error(`[event-ingestion] source=${source.key} error=${error?.message || error}`);
    }
  }

  return results;
};

const startEventScheduleIngestionScheduler = () => {
  const intervalMinutes = Math.max(parseInt(process.env.EVENT_INGESTION_CHECK_INTERVAL_MINUTES || '15', 10) || 15, 5);
  const intervalMs = intervalMinutes * 60 * 1000;

  runEventScheduleIngestion().catch((error) => {
    console.error('Initial event ingestion failed:', error?.message || error);
  });

  setInterval(() => {
    runEventScheduleIngestion().catch((error) => {
      console.error('Scheduled event ingestion failed:', error?.message || error);
    });
  }, intervalMs);
};

module.exports = {
  DEFAULT_SOURCES,
  buildDedupeKey,
  runEventScheduleIngestion,
  startEventScheduleIngestionScheduler
};
