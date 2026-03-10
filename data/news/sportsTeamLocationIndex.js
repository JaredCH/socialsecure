const league = (id, label, icon, sport, teams) => ({ id, label, icon, sport, teams });

const LEAGUE_CATALOG = [
  league('NFL', 'NFL', '🏈', 'football', [
    ['Arizona Cardinals', 'Phoenix', 'AZ', ['Cardinals', 'ARI']],
    ['Atlanta Falcons', 'Atlanta', 'GA', ['Falcons', 'ATL']],
    ['Baltimore Ravens', 'Baltimore', 'MD', ['Ravens', 'BAL']],
    ['Buffalo Bills', 'Buffalo', 'NY', ['Bills', 'BUF']],
    ['Carolina Panthers', 'Charlotte', 'NC', ['Panthers', 'CAR']],
    ['Chicago Bears', 'Chicago', 'IL', ['Bears', 'CHI']],
    ['Cincinnati Bengals', 'Cincinnati', 'OH', ['Bengals', 'CIN']],
    ['Cleveland Browns', 'Cleveland', 'OH', ['Browns', 'CLE']],
    ['Dallas Cowboys', 'Dallas', 'TX', ['Cowboys', 'DAL']],
    ['Denver Broncos', 'Denver', 'CO', ['Broncos', 'DEN']],
    ['Detroit Lions', 'Detroit', 'MI', ['Lions', 'DET']],
    ['Green Bay Packers', 'Green Bay', 'WI', ['Packers', 'GB']],
    ['Houston Texans', 'Houston', 'TX', ['Texans', 'HOU']],
    ['Indianapolis Colts', 'Indianapolis', 'IN', ['Colts', 'IND']],
    ['Jacksonville Jaguars', 'Jacksonville', 'FL', ['Jaguars', 'Jags', 'JAX']],
    ['Kansas City Chiefs', 'Kansas City', 'MO', ['Chiefs', 'KC']],
    ['Las Vegas Raiders', 'Las Vegas', 'NV', ['Raiders', 'LV']],
    ['Los Angeles Chargers', 'Los Angeles', 'CA', ['Chargers', 'LAC']],
    ['Los Angeles Rams', 'Los Angeles', 'CA', ['Rams', 'LAR']],
    ['Miami Dolphins', 'Miami', 'FL', ['Dolphins', 'MIA']],
    ['Minnesota Vikings', 'Minneapolis', 'MN', ['Vikings', 'MIN']],
    ['New England Patriots', 'Foxborough', 'MA', ['Patriots', 'Pats', 'NE']],
    ['New Orleans Saints', 'New Orleans', 'LA', ['Saints', 'NO']],
    ['New York Giants', 'East Rutherford', 'NJ', ['Giants', 'NYG']],
    ['New York Jets', 'East Rutherford', 'NJ', ['Jets', 'NYJ']],
    ['Philadelphia Eagles', 'Philadelphia', 'PA', ['Eagles', 'PHI']],
    ['Pittsburgh Steelers', 'Pittsburgh', 'PA', ['Steelers', 'PIT']],
    ['San Francisco 49ers', 'Santa Clara', 'CA', ['49ers', 'Niners', 'SF']],
    ['Seattle Seahawks', 'Seattle', 'WA', ['Seahawks', 'SEA']],
    ['Tampa Bay Buccaneers', 'Tampa', 'FL', ['Buccaneers', 'Bucs', 'TB']],
    ['Tennessee Titans', 'Nashville', 'TN', ['Titans', 'TEN']],
    ['Washington Commanders', 'Washington', 'DC', ['Commanders', 'WAS']]
  ]),
  league('NBA', 'NBA', '🏀', 'basketball', [
    ['Atlanta Hawks', 'Atlanta', 'GA', ['Hawks', 'ATL']],
    ['Boston Celtics', 'Boston', 'MA', ['Celtics', 'BOS']],
    ['Brooklyn Nets', 'Brooklyn', 'NY', ['Nets', 'BKN']],
    ['Charlotte Hornets', 'Charlotte', 'NC', ['Hornets', 'CHA']],
    ['Chicago Bulls', 'Chicago', 'IL', ['Bulls', 'CHI']],
    ['Cleveland Cavaliers', 'Cleveland', 'OH', ['Cavaliers', 'Cavs', 'CLE']],
    ['Dallas Mavericks', 'Dallas', 'TX', ['Mavericks', 'Mavs', 'DAL']],
    ['Denver Nuggets', 'Denver', 'CO', ['Nuggets', 'DEN']],
    ['Detroit Pistons', 'Detroit', 'MI', ['Pistons', 'DET']],
    ['Golden State Warriors', 'San Francisco', 'CA', ['Warriors', 'GSW']],
    ['Houston Rockets', 'Houston', 'TX', ['Rockets', 'HOU']],
    ['Indiana Pacers', 'Indianapolis', 'IN', ['Pacers', 'IND']],
    ['LA Clippers', 'Los Angeles', 'CA', ['Clippers', 'LAC']],
    ['Los Angeles Lakers', 'Los Angeles', 'CA', ['Lakers', 'LAL']],
    ['Memphis Grizzlies', 'Memphis', 'TN', ['Grizzlies', 'MEM']],
    ['Miami Heat', 'Miami', 'FL', ['Heat', 'MIA']],
    ['Milwaukee Bucks', 'Milwaukee', 'WI', ['Bucks', 'MIL']],
    ['Minnesota Timberwolves', 'Minneapolis', 'MN', ['Timberwolves', 'Wolves', 'MIN']],
    ['New Orleans Pelicans', 'New Orleans', 'LA', ['Pelicans', 'NOP']],
    ['New York Knicks', 'New York', 'NY', ['Knicks', 'NYK']],
    ['Oklahoma City Thunder', 'Oklahoma City', 'OK', ['Thunder', 'OKC']],
    ['Orlando Magic', 'Orlando', 'FL', ['Magic', 'ORL']],
    ['Philadelphia 76ers', 'Philadelphia', 'PA', ['76ers', 'Sixers', 'PHI']],
    ['Phoenix Suns', 'Phoenix', 'AZ', ['Suns', 'PHX']],
    ['Portland Trail Blazers', 'Portland', 'OR', ['Trail Blazers', 'Blazers', 'POR']],
    ['Sacramento Kings', 'Sacramento', 'CA', ['Kings', 'SAC']],
    ['San Antonio Spurs', 'San Antonio', 'TX', ['Spurs', 'SAS']],
    ['Toronto Raptors', 'Toronto', 'ON', ['Raptors', 'TOR']],
    ['Utah Jazz', 'Salt Lake City', 'UT', ['Jazz', 'UTA']],
    ['Washington Wizards', 'Washington', 'DC', ['Wizards', 'WAS']]
  ]),
  league('MLB', 'MLB', '⚾', 'baseball', [
    ['Arizona Diamondbacks', 'Phoenix', 'AZ', ['Diamondbacks', 'Dbacks', 'ARI']],
    ['Atlanta Braves', 'Atlanta', 'GA', ['Braves', 'ATL']],
    ['Baltimore Orioles', 'Baltimore', 'MD', ['Orioles', 'BAL']],
    ['Boston Red Sox', 'Boston', 'MA', ['Red Sox', 'BOS']],
    ['Chicago Cubs', 'Chicago', 'IL', ['Cubs', 'CHC']],
    ['Chicago White Sox', 'Chicago', 'IL', ['White Sox', 'CHW']],
    ['Cincinnati Reds', 'Cincinnati', 'OH', ['Reds', 'CIN']],
    ['Cleveland Guardians', 'Cleveland', 'OH', ['Guardians', 'CLE']],
    ['Colorado Rockies', 'Denver', 'CO', ['Rockies', 'COL']],
    ['Detroit Tigers', 'Detroit', 'MI', ['Tigers', 'DET']],
    ['Houston Astros', 'Houston', 'TX', ['Astros', 'HOU']],
    ['Kansas City Royals', 'Kansas City', 'MO', ['Royals', 'KC']],
    ['Los Angeles Angels', 'Anaheim', 'CA', ['Angels', 'LAA']],
    ['Los Angeles Dodgers', 'Los Angeles', 'CA', ['Dodgers', 'LAD']],
    ['Miami Marlins', 'Miami', 'FL', ['Marlins', 'MIA']],
    ['Milwaukee Brewers', 'Milwaukee', 'WI', ['Brewers', 'MIL']],
    ['Minnesota Twins', 'Minneapolis', 'MN', ['Twins', 'MIN']],
    ['New York Mets', 'New York', 'NY', ['Mets', 'NYM']],
    ['New York Yankees', 'New York', 'NY', ['Yankees', 'NYY']],
    ['Oakland Athletics', 'West Sacramento', 'CA', ['Athletics', 'A\'s', 'OAK']],
    ['Philadelphia Phillies', 'Philadelphia', 'PA', ['Phillies', 'PHI']],
    ['Pittsburgh Pirates', 'Pittsburgh', 'PA', ['Pirates', 'PIT']],
    ['San Diego Padres', 'San Diego', 'CA', ['Padres', 'SD']],
    ['San Francisco Giants', 'San Francisco', 'CA', ['Giants', 'SF']],
    ['Seattle Mariners', 'Seattle', 'WA', ['Mariners', 'SEA']],
    ['St. Louis Cardinals', 'St. Louis', 'MO', ['Cardinals', 'STL']],
    ['Tampa Bay Rays', 'St. Petersburg', 'FL', ['Rays', 'TB']],
    ['Texas Rangers', 'Arlington', 'TX', ['Rangers', 'TEX']],
    ['Toronto Blue Jays', 'Toronto', 'ON', ['Blue Jays', 'TOR']],
    ['Washington Nationals', 'Washington', 'DC', ['Nationals', 'Nats', 'WSH']]
  ]),
  league('NHL', 'NHL', '🏒', 'hockey', [
    ['Anaheim Ducks', 'Anaheim', 'CA', ['Ducks', 'ANA']],
    ['Boston Bruins', 'Boston', 'MA', ['Bruins', 'BOS']],
    ['Buffalo Sabres', 'Buffalo', 'NY', ['Sabres', 'BUF']],
    ['Calgary Flames', 'Calgary', 'AB', ['Flames', 'CGY']],
    ['Carolina Hurricanes', 'Raleigh', 'NC', ['Hurricanes', 'Canes', 'CAR']],
    ['Chicago Blackhawks', 'Chicago', 'IL', ['Blackhawks', 'CHI']],
    ['Colorado Avalanche', 'Denver', 'CO', ['Avalanche', 'Avs', 'COL']],
    ['Columbus Blue Jackets', 'Columbus', 'OH', ['Blue Jackets', 'CBJ']],
    ['Dallas Stars', 'Dallas', 'TX', ['Stars', 'DAL']],
    ['Detroit Red Wings', 'Detroit', 'MI', ['Red Wings', 'DET']],
    ['Edmonton Oilers', 'Edmonton', 'AB', ['Oilers', 'EDM']],
    ['Florida Panthers', 'Sunrise', 'FL', ['Panthers', 'FLA']],
    ['Los Angeles Kings', 'Los Angeles', 'CA', ['Kings', 'LAK']],
    ['Minnesota Wild', 'Saint Paul', 'MN', ['Wild', 'MIN']],
    ['Montreal Canadiens', 'Montreal', 'QC', ['Canadiens', 'Habs', 'MTL']],
    ['Nashville Predators', 'Nashville', 'TN', ['Predators', 'Preds', 'NSH']],
    ['New Jersey Devils', 'Newark', 'NJ', ['Devils', 'NJD']],
    ['New York Islanders', 'Elmont', 'NY', ['Islanders', 'NYI']],
    ['New York Rangers', 'New York', 'NY', ['Rangers', 'NYR']],
    ['Ottawa Senators', 'Ottawa', 'ON', ['Senators', 'OTT']],
    ['Philadelphia Flyers', 'Philadelphia', 'PA', ['Flyers', 'PHI']],
    ['Pittsburgh Penguins', 'Pittsburgh', 'PA', ['Penguins', 'Pens', 'PIT']],
    ['San Jose Sharks', 'San Jose', 'CA', ['Sharks', 'SJS']],
    ['Seattle Kraken', 'Seattle', 'WA', ['Kraken', 'SEA']],
    ['St. Louis Blues', 'St. Louis', 'MO', ['Blues', 'STL']],
    ['Tampa Bay Lightning', 'Tampa', 'FL', ['Lightning', 'TB']],
    ['Toronto Maple Leafs', 'Toronto', 'ON', ['Maple Leafs', 'Leafs', 'TOR']],
    ['Utah Hockey Club', 'Salt Lake City', 'UT', ['Utah HC', 'Utah']],
    ['Vancouver Canucks', 'Vancouver', 'BC', ['Canucks', 'VAN']],
    ['Vegas Golden Knights', 'Las Vegas', 'NV', ['Golden Knights', 'VGK']],
    ['Washington Capitals', 'Washington', 'DC', ['Capitals', 'Caps', 'WSH']],
    ['Winnipeg Jets', 'Winnipeg', 'MB', ['Jets', 'WPG']]
  ]),
  league('MLS', 'MLS', '⚽', 'soccer', [
    ['Atlanta United FC', 'Atlanta', 'GA', ['Atlanta United']],
    ['Austin FC', 'Austin', 'TX', ['ATXFC', 'Verde']],
    ['CF Montreal', 'Montreal', 'QC', ['Montreal']],
    ['Charlotte FC', 'Charlotte', 'NC', ['Charlotte']],
    ['Chicago Fire FC', 'Chicago', 'IL', ['Chicago Fire']],
    ['Colorado Rapids', 'Denver', 'CO', ['Rapids']],
    ['Columbus Crew', 'Columbus', 'OH', ['Crew']],
    ['D.C. United', 'Washington', 'DC', ['DC United']],
    ['FC Cincinnati', 'Cincinnati', 'OH', ['Cincinnati']],
    ['FC Dallas', 'Dallas', 'TX', ['FCD']],
    ['Houston Dynamo FC', 'Houston', 'TX', ['Houston Dynamo']],
    ['Inter Miami CF', 'Miami', 'FL', ['Inter Miami']],
    ['LA Galaxy', 'Los Angeles', 'CA', ['Galaxy']],
    ['Los Angeles FC', 'Los Angeles', 'CA', ['LAFC']],
    ['Minnesota United FC', 'Saint Paul', 'MN', ['Minnesota United']],
    ['Nashville SC', 'Nashville', 'TN', ['Nashville']],
    ['New England Revolution', 'Foxborough', 'MA', ['Revolution', 'Revs']],
    ['New York City FC', 'New York', 'NY', ['NYCFC']],
    ['New York Red Bulls', 'Harrison', 'NJ', ['Red Bulls']],
    ['Orlando City SC', 'Orlando', 'FL', ['Orlando City']],
    ['Philadelphia Union', 'Philadelphia', 'PA', ['Union']],
    ['Portland Timbers', 'Portland', 'OR', ['Timbers']],
    ['Real Salt Lake', 'Sandy', 'UT', ['RSL']],
    ['San Diego FC', 'San Diego', 'CA', ['San Diego']],
    ['San Jose Earthquakes', 'San Jose', 'CA', ['Earthquakes', 'Quakes']],
    ['Seattle Sounders FC', 'Seattle', 'WA', ['Sounders']],
    ['Sporting Kansas City', 'Kansas City', 'KS', ['Sporting KC']],
    ['St. Louis City SC', 'St. Louis', 'MO', ['St. Louis City']],
    ['Toronto FC', 'Toronto', 'ON', ['Toronto']],
    ['Vancouver Whitecaps FC', 'Vancouver', 'BC', ['Whitecaps']]
  ]),
  league('NCAA_FOOTBALL', 'NCAA Football', '🏟️', 'football', [
    ['Alabama Crimson Tide', 'Tuscaloosa', 'AL', ['Alabama', 'Bama']],
    ['Arkansas Razorbacks', 'Fayetteville', 'AR', ['Arkansas']],
    ['Auburn Tigers', 'Auburn', 'AL', ['Auburn']],
    ['Baylor Bears', 'Waco', 'TX', ['Baylor']],
    ['Clemson Tigers', 'Clemson', 'SC', ['Clemson']],
    ['Colorado Buffaloes', 'Boulder', 'CO', ['Colorado']],
    ['Duke Blue Devils', 'Durham', 'NC', ['Duke']],
    ['Florida Gators', 'Gainesville', 'FL', ['Florida']],
    ['Florida State Seminoles', 'Tallahassee', 'FL', ['Florida State', 'FSU']],
    ['Georgia Bulldogs', 'Athens', 'GA', ['Georgia', 'UGA']],
    ['Georgia Tech Yellow Jackets', 'Atlanta', 'GA', ['Georgia Tech']],
    ['Iowa Hawkeyes', 'Iowa City', 'IA', ['Iowa']],
    ['Kansas State Wildcats', 'Manhattan', 'KS', ['Kansas State', 'K-State']],
    ['Kentucky Wildcats', 'Lexington', 'KY', ['Kentucky']],
    ['LSU Tigers', 'Baton Rouge', 'LA', ['LSU']],
    ['Miami Hurricanes', 'Coral Gables', 'FL', ['Miami']],
    ['Michigan Wolverines', 'Ann Arbor', 'MI', ['Michigan']],
    ['Michigan State Spartans', 'East Lansing', 'MI', ['Michigan State']],
    ['Missouri Tigers', 'Columbia', 'MO', ['Missouri', 'Mizzou']],
    ['North Carolina Tar Heels', 'Chapel Hill', 'NC', ['North Carolina', 'UNC']],
    ['Notre Dame Fighting Irish', 'South Bend', 'IN', ['Notre Dame']],
    ['Ohio State Buckeyes', 'Columbus', 'OH', ['Ohio State', 'OSU']],
    ['Oklahoma Sooners', 'Norman', 'OK', ['Oklahoma']],
    ['Ole Miss Rebels', 'Oxford', 'MS', ['Ole Miss']],
    ['Oregon Ducks', 'Eugene', 'OR', ['Oregon']],
    ['Penn State Nittany Lions', 'State College', 'PA', ['Penn State']],
    ['South Carolina Gamecocks', 'Columbia', 'SC', ['South Carolina']],
    ['Tennessee Volunteers', 'Knoxville', 'TN', ['Tennessee', 'Vols']],
    ['Texas A&M Aggies', 'College Station', 'TX', ['Texas A&M', 'Aggies']],
    ['Texas Longhorns', 'Austin', 'TX', ['Texas', 'Longhorns']],
    ['UCLA Bruins', 'Los Angeles', 'CA', ['UCLA']],
    ['USC Trojans', 'Los Angeles', 'CA', ['USC']],
    ['Utah Utes', 'Salt Lake City', 'UT', ['Utah']],
    ['Washington Huskies', 'Seattle', 'WA', ['Washington']],
    ['Wisconsin Badgers', 'Madison', 'WI', ['Wisconsin']]
  ]),
  league('NCAA_BASKETBALL', 'NCAA Basketball', '⛹️', 'basketball', [
    ['Alabama Crimson Tide', 'Tuscaloosa', 'AL', ['Alabama']],
    ['Arizona Wildcats', 'Tucson', 'AZ', ['Arizona']],
    ['Auburn Tigers', 'Auburn', 'AL', ['Auburn']],
    ['Baylor Bears', 'Waco', 'TX', ['Baylor']],
    ['Connecticut Huskies', 'Storrs', 'CT', ['UConn', 'Huskies']],
    ['Creighton Bluejays', 'Omaha', 'NE', ['Creighton']],
    ['Duke Blue Devils', 'Durham', 'NC', ['Duke']],
    ['Florida Gators', 'Gainesville', 'FL', ['Florida']],
    ['Gonzaga Bulldogs', 'Spokane', 'WA', ['Gonzaga', 'Zags']],
    ['Houston Cougars', 'Houston', 'TX', ['Houston']],
    ['Illinois Fighting Illini', 'Champaign', 'IL', ['Illinois']],
    ['Indiana Hoosiers', 'Bloomington', 'IN', ['Indiana']],
    ['Iowa State Cyclones', 'Ames', 'IA', ['Iowa State']],
    ['Kansas Jayhawks', 'Lawrence', 'KS', ['Kansas']],
    ['Kansas State Wildcats', 'Manhattan', 'KS', ['Kansas State']],
    ['Kentucky Wildcats', 'Lexington', 'KY', ['Kentucky']],
    ['Marquette Golden Eagles', 'Milwaukee', 'WI', ['Marquette']],
    ['Michigan State Spartans', 'East Lansing', 'MI', ['Michigan State']],
    ['North Carolina Tar Heels', 'Chapel Hill', 'NC', ['North Carolina', 'UNC']],
    ['Ohio State Buckeyes', 'Columbus', 'OH', ['Ohio State']],
    ['Purdue Boilermakers', 'West Lafayette', 'IN', ['Purdue']],
    ['Saint John\'s Red Storm', 'New York', 'NY', ['St John\'s', 'Red Storm']],
    ['Tennessee Volunteers', 'Knoxville', 'TN', ['Tennessee']],
    ['Texas Longhorns', 'Austin', 'TX', ['Texas']],
    ['Texas Tech Red Raiders', 'Lubbock', 'TX', ['Texas Tech']],
    ['UCLA Bruins', 'Los Angeles', 'CA', ['UCLA']],
    ['USC Trojans', 'Los Angeles', 'CA', ['USC']],
    ['Villanova Wildcats', 'Villanova', 'PA', ['Villanova']],
    ['Virginia Cavaliers', 'Charlottesville', 'VA', ['Virginia']],
    ['Wisconsin Badgers', 'Madison', 'WI', ['Wisconsin']]
  ]),
  league('PREMIER_LEAGUE', 'Premier League', '🇬🇧', 'soccer', [
    ['Arsenal', 'London', 'ENG', ['Arsenal FC']],
    ['Aston Villa', 'Birmingham', 'ENG', ['Villa']],
    ['Bournemouth', 'Bournemouth', 'ENG', ['AFC Bournemouth']],
    ['Brentford', 'London', 'ENG', ['Brentford FC']],
    ['Brighton & Hove Albion', 'Brighton', 'ENG', ['Brighton']],
    ['Chelsea', 'London', 'ENG', ['Chelsea FC']],
    ['Crystal Palace', 'London', 'ENG', ['Palace']],
    ['Everton', 'Liverpool', 'ENG', ['Everton FC']],
    ['Fulham', 'London', 'ENG', ['Fulham FC']],
    ['Ipswich Town', 'Ipswich', 'ENG', ['Ipswich']],
    ['Leicester City', 'Leicester', 'ENG', ['Leicester']],
    ['Liverpool', 'Liverpool', 'ENG', ['Liverpool FC']],
    ['Manchester City', 'Manchester', 'ENG', ['Man City']],
    ['Manchester United', 'Manchester', 'ENG', ['Man United']],
    ['Newcastle United', 'Newcastle', 'ENG', ['Newcastle']],
    ['Nottingham Forest', 'Nottingham', 'ENG', ['Forest']],
    ['Southampton', 'Southampton', 'ENG', ['Southampton FC']],
    ['Tottenham Hotspur', 'London', 'ENG', ['Tottenham', 'Spurs']],
    ['West Ham United', 'London', 'ENG', ['West Ham']],
    ['Wolverhampton Wanderers', 'Wolverhampton', 'ENG', ['Wolves']]
  ]),
  league('LA_LIGA', 'La Liga', '🇪🇸', 'soccer', [
    ['Alaves', 'Vitoria-Gasteiz', 'ES', ['Deportivo Alaves']],
    ['Athletic Club', 'Bilbao', 'ES', ['Athletic Bilbao']],
    ['Atletico Madrid', 'Madrid', 'ES', ['Atletico']],
    ['Barcelona', 'Barcelona', 'ES', ['FC Barcelona', 'Barca']],
    ['Celta Vigo', 'Vigo', 'ES', ['Celta']],
    ['Espanyol', 'Barcelona', 'ES', ['RCD Espanyol']],
    ['Getafe', 'Getafe', 'ES', ['Getafe CF']],
    ['Girona', 'Girona', 'ES', ['Girona FC']],
    ['Las Palmas', 'Las Palmas', 'ES', ['UD Las Palmas']],
    ['Leganes', 'Leganes', 'ES', ['CD Leganes']],
    ['Mallorca', 'Palma', 'ES', ['RCD Mallorca']],
    ['Osasuna', 'Pamplona', 'ES', ['CA Osasuna']],
    ['Rayo Vallecano', 'Madrid', 'ES', ['Rayo']],
    ['Real Betis', 'Seville', 'ES', ['Betis']],
    ['Real Madrid', 'Madrid', 'ES', ['Madrid']],
    ['Real Sociedad', 'San Sebastian', 'ES', ['Sociedad']],
    ['Sevilla', 'Seville', 'ES', ['Sevilla FC']],
    ['Valencia', 'Valencia', 'ES', ['Valencia CF']],
    ['Valladolid', 'Valladolid', 'ES', ['Real Valladolid']],
    ['Villarreal', 'Villarreal', 'ES', ['Villarreal CF']]
  ])
];

const normalizeToken = (value) => String(value || '').trim().toLowerCase();

const toSlug = (value = '') => normalizeToken(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const SPORTS_TEAMS = LEAGUE_CATALOG.flatMap((group) => group.teams.map(([team, city, state, variants]) => {
  const id = `${toSlug(group.id)}:${toSlug(team)}`;
  return {
    id,
    league: group.id,
    leagueLabel: group.label,
    icon: group.icon,
    sport: group.sport,
    team,
    city,
    state,
    country: ['ENG', 'ES'].includes(state) ? state : 'US',
    variants: [team, city, ...(variants || [])]
  };
}));

const SORTED_SPORTS_TEAMS = [...SPORTS_TEAMS].sort((a, b) => {
  if (a.league !== b.league) return a.league.localeCompare(b.league);
  return a.team.localeCompare(b.team);
});

const buildTokenMatchers = () => {
  const tokenMap = new Map();
  for (const team of SORTED_SPORTS_TEAMS) {
    const tokens = [...new Set((team.variants || []).map(normalizeToken).filter(Boolean))];
    for (const token of tokens) {
      if (!tokenMap.has(token)) tokenMap.set(token, []);
      tokenMap.get(token).push(team);
    }
  }
  return Array.from(tokenMap.entries()).map(([token, teams]) => ({
    token,
    teams,
    pattern: new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i')
  }));
};

const TEAM_TOKEN_MATCHERS = buildTokenMatchers();

const inferSportsTeamsFromText = (text = '') => {
  const normalizedText = normalizeToken(text);
  if (!normalizedText) return [];

  const matches = new Map();
  for (const matcher of TEAM_TOKEN_MATCHERS) {
    if (!matcher.pattern.test(normalizedText)) continue;
    for (const team of matcher.teams) {
      const existing = matches.get(team.id);
      if (!existing || matcher.token.length > existing.token.length) {
        matches.set(team.id, { team, token: matcher.token });
      }
    }
  }

  return Array.from(matches.values())
    .sort((a, b) => b.token.length - a.token.length)
    .map((entry) => entry.team);
};

const inferSportsLocationFromText = (text = '') => inferSportsTeamsFromText(text)[0] || null;

const getSportsTeamsByLeague = () => {
  const leagues = LEAGUE_CATALOG.map((group) => {
    const teams = SORTED_SPORTS_TEAMS
      .filter((team) => team.league === group.id)
      .sort((a, b) => a.team.localeCompare(b.team))
      .map((team) => ({
        id: team.id,
        league: team.league,
        leagueLabel: team.leagueLabel,
        icon: team.icon,
        team: team.team,
        city: team.city,
        state: team.state,
        country: team.country
      }));
    return {
      id: group.id,
      label: group.label,
      icon: group.icon,
      sport: group.sport,
      teams
    };
  });

  return leagues;
};

module.exports = {
  LEAGUE_CATALOG,
  SPORTS_TEAMS: SORTED_SPORTS_TEAMS,
  getSportsTeamsByLeague,
  inferSportsTeamsFromText,
  inferSportsLocationFromText
};
