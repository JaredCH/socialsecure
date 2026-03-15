const {
  fetchFootballSchedules,
  fetchBasketballSchedules,
  fetchBaseballSchedules,
  fetchHockeySchedules,
  fetchSoccerSchedules,
  buildLeagueScoreboardUrl,
  isInSeason
} = require('./sportsScheduleIngestion');

const makeTeam = (displayName, abbreviation, location, name) => ({
  displayName,
  shortDisplayName: name || displayName,
  abbreviation,
  location,
  name: name || displayName.replace(`${location} `, '')
});

const makePayload = ({ eventId, date, home, away, venue = 'Test Arena', week = 1 }) => ({
  events: [
    {
      id: eventId,
      date,
      season: { year: 2026 },
      week: { number: week },
      competitions: [
        {
          id: eventId,
          date,
          venue: { fullName: venue },
          status: { type: { state: 'pre', detail: 'Scheduled' } },
          broadcasts: [{ names: ['ESPN'] }],
          competitors: [
            { homeAway: 'home', team: home, score: '0' },
            { homeAway: 'away', team: away, score: '0' }
          ]
        }
      ]
    }
  ]
});

const createFetcher = (responsesByLeague) => jest.fn((url) => {
  const response = Object.entries(responsesByLeague).find(([league]) => url === responsesByLeague[league].url);
  return Promise.resolve(response ? response[1].payload : { events: [] });
});

describe('sportsScheduleIngestion per-sport fetchers', () => {
  it('treats the NFL as off-season in mid-March', () => {
    expect(isInSeason('NFL', new Date('2026-03-15T12:00:00.000Z'))).toBe(false);
  });

  it('fetches football schedules for NFL and NCAA football teams', async () => {
    const now = new Date('2025-11-15T12:00:00.000Z');
    const responses = {
      NFL: {
        url: buildLeagueScoreboardUrl('NFL', now),
        payload: makePayload({
          eventId: 'nfl-1',
          date: '2025-11-16T21:25:00.000Z',
          home: makeTeam('Dallas Cowboys', 'DAL', 'Dallas', 'Cowboys'),
          away: makeTeam('Philadelphia Eagles', 'PHI', 'Philadelphia', 'Eagles'),
          venue: 'AT&T Stadium'
        })
      },
      NCAA_FOOTBALL: {
        url: buildLeagueScoreboardUrl('NCAA_FOOTBALL', now),
        payload: makePayload({
          eventId: 'cfb-1',
          date: '2025-11-22T00:30:00.000Z',
          home: makeTeam('Texas Longhorns', 'TEX', 'Austin', 'Longhorns'),
          away: makeTeam('Alabama Crimson Tide', 'ALA', 'Tuscaloosa', 'Crimson Tide'),
          venue: 'DKR-Texas Memorial Stadium'
        })
      }
    };
    const fetcher = createFetcher(responses);

    const schedules = await fetchFootballSchedules({ now, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(schedules.map((entry) => entry.teamId)).toEqual(expect.arrayContaining([
      'nfl:dallas-cowboys',
      'nfl:philadelphia-eagles',
      'ncaa-football:texas-longhorns',
      'ncaa-football:alabama-crimson-tide'
    ]));
  });

  it('fetches basketball schedules for NBA and NCAA basketball teams', async () => {
    const now = new Date('2026-02-15T12:00:00.000Z');
    const responses = {
      NBA: {
        url: buildLeagueScoreboardUrl('NBA', now),
        payload: makePayload({
          eventId: 'nba-1',
          date: '2026-02-16T01:00:00.000Z',
          home: makeTeam('Los Angeles Lakers', 'LAL', 'Los Angeles', 'Lakers'),
          away: makeTeam('Boston Celtics', 'BOS', 'Boston', 'Celtics'),
          venue: 'Crypto.com Arena'
        })
      },
      NCAA_BASKETBALL: {
        url: buildLeagueScoreboardUrl('NCAA_BASKETBALL', now),
        payload: makePayload({
          eventId: 'ncaab-1',
          date: '2026-02-17T00:00:00.000Z',
          home: makeTeam('Duke Blue Devils', 'DUKE', 'Durham', 'Blue Devils'),
          away: makeTeam('North Carolina Tar Heels', 'UNC', 'Chapel Hill', 'Tar Heels'),
          venue: 'Cameron Indoor Stadium'
        })
      }
    };
    const fetcher = createFetcher(responses);

    const schedules = await fetchBasketballSchedules({ now, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(schedules.map((entry) => entry.teamId)).toEqual(expect.arrayContaining([
      'nba:los-angeles-lakers',
      'nba:boston-celtics',
      'ncaa-basketball:duke-blue-devils',
      'ncaa-basketball:north-carolina-tar-heels'
    ]));
  });

  it('fetches baseball schedules for two MLB teams', async () => {
    const now = new Date('2026-05-15T12:00:00.000Z');
    const responses = {
      MLB: {
        url: buildLeagueScoreboardUrl('MLB', now),
        payload: makePayload({
          eventId: 'mlb-1',
          date: '2026-05-16T23:10:00.000Z',
          home: makeTeam('Boston Red Sox', 'BOS', 'Boston', 'Red Sox'),
          away: makeTeam('New York Yankees', 'NYY', 'New York', 'Yankees'),
          venue: 'Fenway Park'
        })
      }
    };
    const fetcher = createFetcher(responses);

    const schedules = await fetchBaseballSchedules({ now, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(schedules.map((entry) => entry.teamId)).toEqual(expect.arrayContaining([
      'mlb:boston-red-sox',
      'mlb:new-york-yankees'
    ]));
  });

  it('fetches hockey schedules for two NHL teams', async () => {
    const now = new Date('2026-03-15T12:00:00.000Z');
    const responses = {
      NHL: {
        url: buildLeagueScoreboardUrl('NHL', now),
        payload: makePayload({
          eventId: 'nhl-1',
          date: '2026-03-16T01:00:00.000Z',
          home: makeTeam('Dallas Stars', 'DAL', 'Dallas', 'Stars'),
          away: makeTeam('Colorado Avalanche', 'COL', 'Colorado', 'Avalanche'),
          venue: 'American Airlines Center'
        })
      }
    };
    const fetcher = createFetcher(responses);

    const schedules = await fetchHockeySchedules({ now, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(schedules.map((entry) => entry.teamId)).toEqual(expect.arrayContaining([
      'nhl:dallas-stars',
      'nhl:colorado-avalanche'
    ]));
  });

  it('fetches soccer schedules for MLS, Premier League, and La Liga teams', async () => {
    const now = new Date('2026-03-15T12:00:00.000Z');
    const responses = {
      MLS: {
        url: buildLeagueScoreboardUrl('MLS', now),
        payload: makePayload({
          eventId: 'mls-1',
          date: '2026-03-20T00:30:00.000Z',
          home: makeTeam('Inter Miami CF', 'MIA', 'Miami', 'CF'),
          away: makeTeam('LA Galaxy', 'LAG', 'Los Angeles', 'Galaxy'),
          venue: 'Chase Stadium'
        })
      },
      PREMIER_LEAGUE: {
        url: buildLeagueScoreboardUrl('PREMIER_LEAGUE', now),
        payload: makePayload({
          eventId: 'epl-1',
          date: '2026-03-21T15:00:00.000Z',
          home: makeTeam('Arsenal', 'ARS', 'London', 'Arsenal'),
          away: makeTeam('Manchester City', 'MCI', 'Manchester', 'City'),
          venue: 'Emirates Stadium'
        })
      },
      LA_LIGA: {
        url: buildLeagueScoreboardUrl('LA_LIGA', now),
        payload: makePayload({
          eventId: 'laliga-1',
          date: '2026-03-22T20:00:00.000Z',
          home: makeTeam('Real Madrid', 'RMA', 'Madrid', 'Madrid'),
          away: makeTeam('Barcelona', 'BAR', 'Barcelona', 'Barcelona'),
          venue: 'Santiago Bernabeu'
        })
      }
    };
    const fetcher = createFetcher(responses);

    const schedules = await fetchSoccerSchedules({ now, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(schedules.map((entry) => entry.teamId)).toEqual(expect.arrayContaining([
      'mls:inter-miami-cf',
      'mls:la-galaxy',
      'premier-league:arsenal',
      'premier-league:manchester-city',
      'la-liga:real-madrid',
      'la-liga:barcelona'
    ]));
  });
});