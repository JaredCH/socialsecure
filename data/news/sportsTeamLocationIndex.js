const SPORTS_TEAMS = [
  // NFL
  { league: 'NFL', sport: 'football', team: 'Arizona Cardinals', city: 'Phoenix', state: 'AZ', variants: ['Arizona Cardinals', 'Cardinals', 'ARI'] },
  { league: 'NFL', sport: 'football', team: 'Atlanta Falcons', city: 'Atlanta', state: 'GA', variants: ['Atlanta Falcons', 'Falcons', 'ATL'] },
  { league: 'NFL', sport: 'football', team: 'Baltimore Ravens', city: 'Baltimore', state: 'MD', variants: ['Baltimore Ravens', 'Ravens', 'BAL'] },
  { league: 'NFL', sport: 'football', team: 'Buffalo Bills', city: 'Buffalo', state: 'NY', variants: ['Buffalo Bills', 'Bills', 'BUF'] },
  { league: 'NFL', sport: 'football', team: 'Carolina Panthers', city: 'Charlotte', state: 'NC', variants: ['Carolina Panthers', 'Panthers', 'CAR'] },
  { league: 'NFL', sport: 'football', team: 'Chicago Bears', city: 'Chicago', state: 'IL', variants: ['Chicago Bears', 'Bears', 'CHI'] },
  { league: 'NFL', sport: 'football', team: 'Cincinnati Bengals', city: 'Cincinnati', state: 'OH', variants: ['Cincinnati Bengals', 'Bengals', 'CIN'] },
  { league: 'NFL', sport: 'football', team: 'Cleveland Browns', city: 'Cleveland', state: 'OH', variants: ['Cleveland Browns', 'Browns', 'CLE'] },
  { league: 'NFL', sport: 'football', team: 'Dallas Cowboys', city: 'Dallas', state: 'TX', variants: ['Dallas Cowboys', 'Cowboys', 'DAL', "America's Team", 'Big D'] },
  { league: 'NFL', sport: 'football', team: 'Denver Broncos', city: 'Denver', state: 'CO', variants: ['Denver Broncos', 'Broncos', 'DEN'] },
  { league: 'NFL', sport: 'football', team: 'Detroit Lions', city: 'Detroit', state: 'MI', variants: ['Detroit Lions', 'Lions', 'DET'] },
  { league: 'NFL', sport: 'football', team: 'Green Bay Packers', city: 'Green Bay', state: 'WI', variants: ['Green Bay Packers', 'Packers', 'GB'] },
  { league: 'NFL', sport: 'football', team: 'Houston Texans', city: 'Houston', state: 'TX', variants: ['Houston Texans', 'Texans', 'HOU'] },
  { league: 'NFL', sport: 'football', team: 'Indianapolis Colts', city: 'Indianapolis', state: 'IN', variants: ['Indianapolis Colts', 'Colts', 'IND'] },
  { league: 'NFL', sport: 'football', team: 'Jacksonville Jaguars', city: 'Jacksonville', state: 'FL', variants: ['Jacksonville Jaguars', 'Jaguars', 'Jags', 'JAX'] },
  { league: 'NFL', sport: 'football', team: 'Kansas City Chiefs', city: 'Kansas City', state: 'MO', variants: ['Kansas City Chiefs', 'Chiefs', 'KC'] },
  { league: 'NFL', sport: 'football', team: 'Las Vegas Raiders', city: 'Las Vegas', state: 'NV', variants: ['Las Vegas Raiders', 'Raiders', 'LV'] },
  { league: 'NFL', sport: 'football', team: 'Los Angeles Chargers', city: 'Los Angeles', state: 'CA', variants: ['Los Angeles Chargers', 'Chargers', 'LAC'] },
  { league: 'NFL', sport: 'football', team: 'Los Angeles Rams', city: 'Los Angeles', state: 'CA', variants: ['Los Angeles Rams', 'Rams', 'LAR'] },
  { league: 'NFL', sport: 'football', team: 'Miami Dolphins', city: 'Miami', state: 'FL', variants: ['Miami Dolphins', 'Dolphins', 'MIA'] },
  { league: 'NFL', sport: 'football', team: 'Minnesota Vikings', city: 'Minneapolis', state: 'MN', variants: ['Minnesota Vikings', 'Vikings', 'MIN'] },
  { league: 'NFL', sport: 'football', team: 'New England Patriots', city: 'Boston', state: 'MA', variants: ['New England Patriots', 'Patriots', 'Pats', 'NE'] },
  { league: 'NFL', sport: 'football', team: 'New Orleans Saints', city: 'New Orleans', state: 'LA', variants: ['New Orleans Saints', 'Saints', 'NO'] },
  { league: 'NFL', sport: 'football', team: 'New York Giants', city: 'New York', state: 'NY', variants: ['New York Giants', 'Giants', 'NYG'] },
  { league: 'NFL', sport: 'football', team: 'New York Jets', city: 'New York', state: 'NY', variants: ['New York Jets', 'Jets', 'NYJ'] },
  { league: 'NFL', sport: 'football', team: 'Philadelphia Eagles', city: 'Philadelphia', state: 'PA', variants: ['Philadelphia Eagles', 'Eagles', 'PHI'] },
  { league: 'NFL', sport: 'football', team: 'Pittsburgh Steelers', city: 'Pittsburgh', state: 'PA', variants: ['Pittsburgh Steelers', 'Steelers', 'PIT'] },
  { league: 'NFL', sport: 'football', team: 'San Francisco 49ers', city: 'San Francisco', state: 'CA', variants: ['San Francisco 49ers', '49ers', 'Niners', 'SF'] },
  { league: 'NFL', sport: 'football', team: 'Seattle Seahawks', city: 'Seattle', state: 'WA', variants: ['Seattle Seahawks', 'Seahawks', 'SEA'] },
  { league: 'NFL', sport: 'football', team: 'Tampa Bay Buccaneers', city: 'Tampa', state: 'FL', variants: ['Tampa Bay Buccaneers', 'Buccaneers', 'Bucs', 'TB'] },
  { league: 'NFL', sport: 'football', team: 'Tennessee Titans', city: 'Nashville', state: 'TN', variants: ['Tennessee Titans', 'Titans', 'TEN'] },
  { league: 'NFL', sport: 'football', team: 'Washington Commanders', city: 'Washington', state: 'DC', variants: ['Washington Commanders', 'Commanders', 'WAS'] },

  // NBA / WNBA
  { league: 'NBA', sport: 'basketball', team: 'Boston Celtics', city: 'Boston', state: 'MA', variants: ['Boston Celtics', 'Celtics', 'BOS'] },
  { league: 'NBA', sport: 'basketball', team: 'Los Angeles Lakers', city: 'Los Angeles', state: 'CA', variants: ['Los Angeles Lakers', 'Lakers', 'LAL'] },
  { league: 'NBA', sport: 'basketball', team: 'Golden State Warriors', city: 'San Francisco', state: 'CA', variants: ['Golden State Warriors', 'Warriors', 'GSW'] },
  { league: 'NBA', sport: 'basketball', team: 'Dallas Mavericks', city: 'Dallas', state: 'TX', variants: ['Dallas Mavericks', 'Mavericks', 'Mavs', 'DAL'] },
  { league: 'NBA', sport: 'basketball', team: 'Houston Rockets', city: 'Houston', state: 'TX', variants: ['Houston Rockets', 'Rockets', 'HOU'] },
  { league: 'NBA', sport: 'basketball', team: 'San Antonio Spurs', city: 'San Antonio', state: 'TX', variants: ['San Antonio Spurs', 'Spurs', 'SAS'] },
  { league: 'NBA', sport: 'basketball', team: 'New York Knicks', city: 'New York', state: 'NY', variants: ['New York Knicks', 'Knicks', 'NYK'] },
  { league: 'NBA', sport: 'basketball', team: 'Brooklyn Nets', city: 'New York', state: 'NY', variants: ['Brooklyn Nets', 'Nets', 'BKN'] },
  { league: 'NBA', sport: 'basketball', team: 'Miami Heat', city: 'Miami', state: 'FL', variants: ['Miami Heat', 'Heat', 'MIA'] },
  { league: 'NBA', sport: 'basketball', team: 'Chicago Bulls', city: 'Chicago', state: 'IL', variants: ['Chicago Bulls', 'Bulls', 'CHI'] },
  { league: 'WNBA', sport: 'basketball', team: 'Dallas Wings', city: 'Dallas', state: 'TX', variants: ['Dallas Wings', 'Wings'] },
  { league: 'WNBA', sport: 'basketball', team: 'New York Liberty', city: 'New York', state: 'NY', variants: ['New York Liberty', 'Liberty'] },
  { league: 'WNBA', sport: 'basketball', team: 'Las Vegas Aces', city: 'Las Vegas', state: 'NV', variants: ['Las Vegas Aces', 'Aces'] },
  { league: 'WNBA', sport: 'basketball', team: 'Seattle Storm', city: 'Seattle', state: 'WA', variants: ['Seattle Storm', 'Storm'] },
  { league: 'WNBA', sport: 'basketball', team: 'Indiana Fever', city: 'Indianapolis', state: 'IN', variants: ['Indiana Fever', 'Fever'] },

  // MLB
  { league: 'MLB', sport: 'baseball', team: 'New York Yankees', city: 'New York', state: 'NY', variants: ['New York Yankees', 'Yankees', 'NYY'] },
  { league: 'MLB', sport: 'baseball', team: 'New York Mets', city: 'New York', state: 'NY', variants: ['New York Mets', 'Mets', 'NYM'] },
  { league: 'MLB', sport: 'baseball', team: 'Boston Red Sox', city: 'Boston', state: 'MA', variants: ['Boston Red Sox', 'Red Sox', 'BOS'] },
  { league: 'MLB', sport: 'baseball', team: 'Houston Astros', city: 'Houston', state: 'TX', variants: ['Houston Astros', 'Astros', 'HOU'] },
  { league: 'MLB', sport: 'baseball', team: 'Texas Rangers', city: 'Arlington', state: 'TX', variants: ['Texas Rangers', 'Rangers', 'TEX'] },
  { league: 'MLB', sport: 'baseball', team: 'Los Angeles Dodgers', city: 'Los Angeles', state: 'CA', variants: ['Los Angeles Dodgers', 'Dodgers', 'LAD'] },
  { league: 'MLB', sport: 'baseball', team: 'San Francisco Giants', city: 'San Francisco', state: 'CA', variants: ['San Francisco Giants', 'Giants', 'SF'] },
  { league: 'MLB', sport: 'baseball', team: 'Chicago Cubs', city: 'Chicago', state: 'IL', variants: ['Chicago Cubs', 'Cubs', 'CHC'] },
  { league: 'MLB', sport: 'baseball', team: 'Atlanta Braves', city: 'Atlanta', state: 'GA', variants: ['Atlanta Braves', 'Braves', 'ATL'] },
  { league: 'MLB', sport: 'baseball', team: 'Seattle Mariners', city: 'Seattle', state: 'WA', variants: ['Seattle Mariners', 'Mariners', 'SEA'] },

  // NHL
  { league: 'NHL', sport: 'hockey', team: 'Dallas Stars', city: 'Dallas', state: 'TX', variants: ['Dallas Stars', 'Stars', 'DAL'] },
  { league: 'NHL', sport: 'hockey', team: 'New York Rangers', city: 'New York', state: 'NY', variants: ['New York Rangers', 'Rangers', 'NYR'] },
  { league: 'NHL', sport: 'hockey', team: 'New York Islanders', city: 'New York', state: 'NY', variants: ['New York Islanders', 'Islanders', 'NYI'] },
  { league: 'NHL', sport: 'hockey', team: 'Boston Bruins', city: 'Boston', state: 'MA', variants: ['Boston Bruins', 'Bruins', 'BOS'] },
  { league: 'NHL', sport: 'hockey', team: 'Chicago Blackhawks', city: 'Chicago', state: 'IL', variants: ['Chicago Blackhawks', 'Blackhawks', 'CHI'] },
  { league: 'NHL', sport: 'hockey', team: 'Detroit Red Wings', city: 'Detroit', state: 'MI', variants: ['Detroit Red Wings', 'Red Wings', 'DET'] },
  { league: 'NHL', sport: 'hockey', team: 'Colorado Avalanche', city: 'Denver', state: 'CO', variants: ['Colorado Avalanche', 'Avalanche', 'Avs', 'COL'] },
  { league: 'NHL', sport: 'hockey', team: 'Vegas Golden Knights', city: 'Las Vegas', state: 'NV', variants: ['Vegas Golden Knights', 'Golden Knights', 'VGK'] },
  { league: 'NHL', sport: 'hockey', team: 'Seattle Kraken', city: 'Seattle', state: 'WA', variants: ['Seattle Kraken', 'Kraken', 'SEA'] },

  // MLS / NWSL
  { league: 'MLS', sport: 'soccer', team: 'Austin FC', city: 'Austin', state: 'TX', variants: ['Austin FC', 'Verde', 'ATXFC'] },
  { league: 'MLS', sport: 'soccer', team: 'Houston Dynamo FC', city: 'Houston', state: 'TX', variants: ['Houston Dynamo', 'Houston Dynamo FC', 'Dynamo'] },
  { league: 'MLS', sport: 'soccer', team: 'FC Dallas', city: 'Dallas', state: 'TX', variants: ['FC Dallas', 'FCD'] },
  { league: 'MLS', sport: 'soccer', team: 'LA Galaxy', city: 'Los Angeles', state: 'CA', variants: ['LA Galaxy', 'Galaxy'] },
  { league: 'MLS', sport: 'soccer', team: 'Inter Miami CF', city: 'Miami', state: 'FL', variants: ['Inter Miami', 'Inter Miami CF'] },
  { league: 'MLS', sport: 'soccer', team: 'Seattle Sounders FC', city: 'Seattle', state: 'WA', variants: ['Seattle Sounders', 'Sounders'] },
  { league: 'NWSL', sport: 'soccer', team: 'Houston Dash', city: 'Houston', state: 'TX', variants: ['Houston Dash', 'Dash'] },
  { league: 'NWSL', sport: 'soccer', team: 'Kansas City Current', city: 'Kansas City', state: 'MO', variants: ['Kansas City Current', 'Current'] },
  { league: 'NWSL', sport: 'soccer', team: 'NJ/NY Gotham FC', city: 'New York', state: 'NY', variants: ['Gotham FC', 'NJ/NY Gotham FC'] },
  { league: 'NWSL', sport: 'soccer', team: 'Orlando Pride', city: 'Orlando', state: 'FL', variants: ['Orlando Pride', 'Pride'] },

  // NCAA Division I - notable programs across football, basketball, baseball, women's basketball
  { league: 'NCAA-DI', sport: 'football', team: 'Texas Longhorns', city: 'Austin', state: 'TX', variants: ['Texas Longhorns', 'Longhorns', 'UT Austin', 'UT'] },
  { league: 'NCAA-DI', sport: 'football', team: 'Texas A&M Aggies', city: 'College Station', state: 'TX', variants: ['Texas A&M Aggies', 'Aggies', 'A&M'] },
  { league: 'NCAA-DI', sport: 'football', team: 'LSU Tigers', city: 'Baton Rouge', state: 'LA', variants: ['LSU Tigers', 'LSU', 'Tigers'] },
  { league: 'NCAA-DI', sport: 'football', team: 'Houston Cougars', city: 'Houston', state: 'TX', variants: ['Houston Cougars', 'Cougars', 'UH'] },
  { league: 'NCAA-DI', sport: 'football', team: 'Baylor Bears', city: 'Waco', state: 'TX', variants: ['Baylor Bears', 'Baylor'] },
  { league: 'NCAA-DI', sport: 'football', team: 'TCU Horned Frogs', city: 'Fort Worth', state: 'TX', variants: ['TCU Horned Frogs', 'TCU', 'Horned Frogs'] },
  { league: 'NCAA-DI', sport: 'football', team: 'Texas Tech Red Raiders', city: 'Lubbock', state: 'TX', variants: ['Texas Tech Red Raiders', 'Texas Tech', 'Red Raiders'] },
  { league: 'NCAA-DI', sport: 'football', team: 'Alabama Crimson Tide', city: 'Tuscaloosa', state: 'AL', variants: ['Alabama Crimson Tide', 'Alabama', 'Crimson Tide', 'Bama'] },
  { league: 'NCAA-DI', sport: 'football', team: 'Georgia Bulldogs', city: 'Athens', state: 'GA', variants: ['Georgia Bulldogs', 'Georgia', 'Bulldogs', 'UGA'] },
  { league: 'NCAA-DI', sport: 'football', team: 'Michigan Wolverines', city: 'Ann Arbor', state: 'MI', variants: ['Michigan Wolverines', 'Michigan', 'Wolverines'] },
  { league: 'NCAA-DI', sport: 'football', team: 'Ohio State Buckeyes', city: 'Columbus', state: 'OH', variants: ['Ohio State Buckeyes', 'Ohio State', 'Buckeyes', 'OSU'] },
  { league: 'NCAA-DI', sport: 'basketball', team: 'Duke Blue Devils', city: 'Durham', state: 'NC', variants: ['Duke Blue Devils', 'Duke', 'Blue Devils'] },
  { league: 'NCAA-DI', sport: 'basketball', team: 'North Carolina Tar Heels', city: 'Chapel Hill', state: 'NC', variants: ['North Carolina Tar Heels', 'Tar Heels', 'UNC'] },
  { league: 'NCAA-DI', sport: 'basketball', team: 'Kentucky Wildcats', city: 'Lexington', state: 'KY', variants: ['Kentucky Wildcats', 'Kentucky', 'Wildcats'] },
  { league: 'NCAA-DI', sport: 'basketball', team: 'Kansas Jayhawks', city: 'Lawrence', state: 'KS', variants: ['Kansas Jayhawks', 'Kansas', 'Jayhawks'] },
  { league: 'NCAA-DI', sport: 'basketball', team: 'UConn Huskies', city: 'Storrs', state: 'CT', variants: ['UConn Huskies', 'UConn', 'Huskies'] },
  { league: 'NCAA-DI', sport: 'basketball', team: 'Gonzaga Bulldogs', city: 'Spokane', state: 'WA', variants: ['Gonzaga Bulldogs', 'Gonzaga', 'Zags'] },
  { league: 'NCAA-DI', sport: 'women-basketball', team: 'South Carolina Gamecocks', city: 'Columbia', state: 'SC', variants: ['South Carolina Gamecocks', 'Gamecocks', 'South Carolina'] },
  { league: 'NCAA-DI', sport: 'women-basketball', team: 'Iowa Hawkeyes', city: 'Iowa City', state: 'IA', variants: ['Iowa Hawkeyes', 'Iowa', 'Hawkeyes'] },
  { league: 'NCAA-DI', sport: 'baseball', team: 'Vanderbilt Commodores', city: 'Nashville', state: 'TN', variants: ['Vanderbilt Commodores', 'Vanderbilt', 'Commodores'] },
  { league: 'NCAA-DI', sport: 'baseball', team: 'Tennessee Volunteers', city: 'Knoxville', state: 'TN', variants: ['Tennessee Volunteers', 'Tennessee', 'Volunteers', 'Vols'] }
];

const normalizeToken = (value) => String(value || '').trim().toLowerCase();

const buildTeamLookup = () => {
  const tokenToTeam = new Map();
  for (const team of SPORTS_TEAMS) {
    const tokens = [team.team, `${team.city} ${team.team.split(' ').slice(-1)[0]}`, ...(team.variants || [])]
      .map(normalizeToken)
      .filter(Boolean);
    for (const token of tokens) {
      if (!tokenToTeam.has(token)) {
        tokenToTeam.set(token, team);
      }
    }
  }
  return tokenToTeam;
};

const SPORTS_TEAM_LOOKUP = buildTeamLookup();

const inferSportsLocationFromText = (text = '') => {
  const normalizedText = normalizeToken(text);
  if (!normalizedText) return null;

  let bestMatch = null;
  for (const [variant, team] of SPORTS_TEAM_LOOKUP.entries()) {
    const pattern = new RegExp(`\\b${variant.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(normalizedText)) {
      if (!bestMatch || variant.length > bestMatch.variant.length) {
        bestMatch = { team, variant };
      }
    }
  }

  return bestMatch?.team || null;
};

module.exports = {
  SPORTS_TEAMS,
  inferSportsLocationFromText
};
