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
  { league: 'NCAA-DI', sport: 'baseball', team: 'Tennessee Volunteers', city: 'Knoxville', state: 'TN', variants: ['Tennessee Volunteers', 'Tennessee', 'Volunteers', 'Vols'] },

  // Additional NBA teams
  { league: 'NBA', sport: 'basketball', team: 'Atlanta Hawks', city: 'Atlanta', state: 'GA', variants: ['Atlanta Hawks', 'Hawks'] },
  { league: 'NBA', sport: 'basketball', team: 'Charlotte Hornets', city: 'Charlotte', state: 'NC', variants: ['Charlotte Hornets', 'Hornets'] },
  { league: 'NBA', sport: 'basketball', team: 'Cleveland Cavaliers', city: 'Cleveland', state: 'OH', variants: ['Cleveland Cavaliers', 'Cavaliers', 'Cavs'] },
  { league: 'NBA', sport: 'basketball', team: 'Denver Nuggets', city: 'Denver', state: 'CO', variants: ['Denver Nuggets', 'Nuggets'] },
  { league: 'NBA', sport: 'basketball', team: 'Detroit Pistons', city: 'Detroit', state: 'MI', variants: ['Detroit Pistons', 'Pistons'] },
  { league: 'NBA', sport: 'basketball', team: 'Indiana Pacers', city: 'Indianapolis', state: 'IN', variants: ['Indiana Pacers', 'Pacers'] },
  { league: 'NBA', sport: 'basketball', team: 'LA Clippers', city: 'Los Angeles', state: 'CA', variants: ['LA Clippers', 'Clippers'] },
  { league: 'NBA', sport: 'basketball', team: 'Memphis Grizzlies', city: 'Memphis', state: 'TN', variants: ['Memphis Grizzlies', 'Grizzlies'] },
  { league: 'NBA', sport: 'basketball', team: 'Milwaukee Bucks', city: 'Milwaukee', state: 'WI', variants: ['Milwaukee Bucks', 'Bucks'] },
  { league: 'NBA', sport: 'basketball', team: 'Minnesota Timberwolves', city: 'Minneapolis', state: 'MN', variants: ['Minnesota Timberwolves', 'Timberwolves', 'Wolves'] },
  { league: 'NBA', sport: 'basketball', team: 'New Orleans Pelicans', city: 'New Orleans', state: 'LA', variants: ['New Orleans Pelicans', 'Pelicans'] },
  { league: 'NBA', sport: 'basketball', team: 'Oklahoma City Thunder', city: 'Oklahoma City', state: 'OK', variants: ['Oklahoma City Thunder', 'Thunder'] },
  { league: 'NBA', sport: 'basketball', team: 'Orlando Magic', city: 'Orlando', state: 'FL', variants: ['Orlando Magic', 'Magic'] },
  { league: 'NBA', sport: 'basketball', team: 'Philadelphia 76ers', city: 'Philadelphia', state: 'PA', variants: ['Philadelphia 76ers', '76ers', 'Sixers'] },
  { league: 'NBA', sport: 'basketball', team: 'Phoenix Suns', city: 'Phoenix', state: 'AZ', variants: ['Phoenix Suns', 'Suns'] },
  { league: 'NBA', sport: 'basketball', team: 'Portland Trail Blazers', city: 'Portland', state: 'OR', variants: ['Portland Trail Blazers', 'Trail Blazers', 'Blazers'] },
  { league: 'NBA', sport: 'basketball', team: 'Sacramento Kings', city: 'Sacramento', state: 'CA', variants: ['Sacramento Kings', 'Kings'] },
  { league: 'NBA', sport: 'basketball', team: 'Toronto Raptors', city: 'Toronto', state: 'ON', variants: ['Toronto Raptors', 'Raptors'] },
  { league: 'NBA', sport: 'basketball', team: 'Utah Jazz', city: 'Salt Lake City', state: 'UT', variants: ['Utah Jazz', 'Jazz'] },
  { league: 'NBA', sport: 'basketball', team: 'Washington Wizards', city: 'Washington', state: 'DC', variants: ['Washington Wizards', 'Wizards'] },

  // Additional MLB teams
  { league: 'MLB', sport: 'baseball', team: 'Arizona Diamondbacks', city: 'Phoenix', state: 'AZ', variants: ['Arizona Diamondbacks', 'Diamondbacks', 'Dbacks'] },
  { league: 'MLB', sport: 'baseball', team: 'Baltimore Orioles', city: 'Baltimore', state: 'MD', variants: ['Baltimore Orioles', 'Orioles'] },
  { league: 'MLB', sport: 'baseball', team: 'Chicago White Sox', city: 'Chicago', state: 'IL', variants: ['Chicago White Sox', 'White Sox'] },
  { league: 'MLB', sport: 'baseball', team: 'Cincinnati Reds', city: 'Cincinnati', state: 'OH', variants: ['Cincinnati Reds', 'Reds'] },
  { league: 'MLB', sport: 'baseball', team: 'Cleveland Guardians', city: 'Cleveland', state: 'OH', variants: ['Cleveland Guardians', 'Guardians'] },
  { league: 'MLB', sport: 'baseball', team: 'Colorado Rockies', city: 'Denver', state: 'CO', variants: ['Colorado Rockies', 'Rockies'] },
  { league: 'MLB', sport: 'baseball', team: 'Detroit Tigers', city: 'Detroit', state: 'MI', variants: ['Detroit Tigers', 'Tigers'] },
  { league: 'MLB', sport: 'baseball', team: 'Kansas City Royals', city: 'Kansas City', state: 'MO', variants: ['Kansas City Royals', 'Royals'] },
  { league: 'MLB', sport: 'baseball', team: 'Los Angeles Angels', city: 'Anaheim', state: 'CA', variants: ['Los Angeles Angels', 'Angels'] },
  { league: 'MLB', sport: 'baseball', team: 'Miami Marlins', city: 'Miami', state: 'FL', variants: ['Miami Marlins', 'Marlins'] },
  { league: 'MLB', sport: 'baseball', team: 'Milwaukee Brewers', city: 'Milwaukee', state: 'WI', variants: ['Milwaukee Brewers', 'Brewers'] },
  { league: 'MLB', sport: 'baseball', team: 'Minnesota Twins', city: 'Minneapolis', state: 'MN', variants: ['Minnesota Twins', 'Twins'] },
  { league: 'MLB', sport: 'baseball', team: 'Oakland Athletics', city: 'Oakland', state: 'CA', variants: ['Oakland Athletics', 'Athletics', "A's"] },
  { league: 'MLB', sport: 'baseball', team: 'Philadelphia Phillies', city: 'Philadelphia', state: 'PA', variants: ['Philadelphia Phillies', 'Phillies'] },
  { league: 'MLB', sport: 'baseball', team: 'Pittsburgh Pirates', city: 'Pittsburgh', state: 'PA', variants: ['Pittsburgh Pirates', 'Pirates'] },
  { league: 'MLB', sport: 'baseball', team: 'San Diego Padres', city: 'San Diego', state: 'CA', variants: ['San Diego Padres', 'Padres'] },
  { league: 'MLB', sport: 'baseball', team: 'St. Louis Cardinals', city: 'St. Louis', state: 'MO', variants: ['St. Louis Cardinals', 'Cardinals'] },
  { league: 'MLB', sport: 'baseball', team: 'Tampa Bay Rays', city: 'Tampa Bay', state: 'FL', variants: ['Tampa Bay Rays', 'Rays'] },
  { league: 'MLB', sport: 'baseball', team: 'Toronto Blue Jays', city: 'Toronto', state: 'ON', variants: ['Toronto Blue Jays', 'Blue Jays'] },
  { league: 'MLB', sport: 'baseball', team: 'Washington Nationals', city: 'Washington', state: 'DC', variants: ['Washington Nationals', 'Nationals', 'Nats'] },

  // Additional NHL teams
  { league: 'NHL', sport: 'hockey', team: 'Anaheim Ducks', city: 'Anaheim', state: 'CA', variants: ['Anaheim Ducks', 'Ducks'] },
  { league: 'NHL', sport: 'hockey', team: 'Buffalo Sabres', city: 'Buffalo', state: 'NY', variants: ['Buffalo Sabres', 'Sabres'] },
  { league: 'NHL', sport: 'hockey', team: 'Calgary Flames', city: 'Calgary', state: 'AB', variants: ['Calgary Flames', 'Flames'] },
  { league: 'NHL', sport: 'hockey', team: 'Carolina Hurricanes', city: 'Raleigh', state: 'NC', variants: ['Carolina Hurricanes', 'Hurricanes', 'Canes'] },
  { league: 'NHL', sport: 'hockey', team: 'Columbus Blue Jackets', city: 'Columbus', state: 'OH', variants: ['Columbus Blue Jackets', 'Blue Jackets'] },
  { league: 'NHL', sport: 'hockey', team: 'Edmonton Oilers', city: 'Edmonton', state: 'AB', variants: ['Edmonton Oilers', 'Oilers'] },
  { league: 'NHL', sport: 'hockey', team: 'Florida Panthers', city: 'Sunrise', state: 'FL', variants: ['Florida Panthers', 'Panthers'] },
  { league: 'NHL', sport: 'hockey', team: 'Los Angeles Kings', city: 'Los Angeles', state: 'CA', variants: ['Los Angeles Kings', 'Kings'] },
  { league: 'NHL', sport: 'hockey', team: 'Minnesota Wild', city: 'St. Paul', state: 'MN', variants: ['Minnesota Wild', 'Wild'] },
  { league: 'NHL', sport: 'hockey', team: 'Montreal Canadiens', city: 'Montreal', state: 'QC', variants: ['Montreal Canadiens', 'Canadiens', 'Habs'] },
  { league: 'NHL', sport: 'hockey', team: 'Nashville Predators', city: 'Nashville', state: 'TN', variants: ['Nashville Predators', 'Predators', 'Preds'] },
  { league: 'NHL', sport: 'hockey', team: 'New Jersey Devils', city: 'Newark', state: 'NJ', variants: ['New Jersey Devils', 'Devils'] },
  { league: 'NHL', sport: 'hockey', team: 'Ottawa Senators', city: 'Ottawa', state: 'ON', variants: ['Ottawa Senators', 'Senators'] },
  { league: 'NHL', sport: 'hockey', team: 'Philadelphia Flyers', city: 'Philadelphia', state: 'PA', variants: ['Philadelphia Flyers', 'Flyers'] },
  { league: 'NHL', sport: 'hockey', team: 'Pittsburgh Penguins', city: 'Pittsburgh', state: 'PA', variants: ['Pittsburgh Penguins', 'Penguins', 'Pens'] },
  { league: 'NHL', sport: 'hockey', team: 'San Jose Sharks', city: 'San Jose', state: 'CA', variants: ['San Jose Sharks', 'Sharks'] },
  { league: 'NHL', sport: 'hockey', team: 'St. Louis Blues', city: 'St. Louis', state: 'MO', variants: ['St. Louis Blues', 'Blues'] },
  { league: 'NHL', sport: 'hockey', team: 'Tampa Bay Lightning', city: 'Tampa', state: 'FL', variants: ['Tampa Bay Lightning', 'Lightning'] },
  { league: 'NHL', sport: 'hockey', team: 'Toronto Maple Leafs', city: 'Toronto', state: 'ON', variants: ['Toronto Maple Leafs', 'Maple Leafs', 'Leafs'] },
  { league: 'NHL', sport: 'hockey', team: 'Utah Hockey Club', city: 'Salt Lake City', state: 'UT', variants: ['Utah Hockey Club', 'Utah HC'] },
  { league: 'NHL', sport: 'hockey', team: 'Vancouver Canucks', city: 'Vancouver', state: 'BC', variants: ['Vancouver Canucks', 'Canucks'] },
  { league: 'NHL', sport: 'hockey', team: 'Washington Capitals', city: 'Washington', state: 'DC', variants: ['Washington Capitals', 'Capitals', 'Caps'] },
  { league: 'NHL', sport: 'hockey', team: 'Winnipeg Jets', city: 'Winnipeg', state: 'MB', variants: ['Winnipeg Jets', 'Jets'] },

  // Additional MLS teams
  { league: 'MLS', sport: 'soccer', team: 'Atlanta United FC', city: 'Atlanta', state: 'GA', variants: ['Atlanta United'] },
  { league: 'MLS', sport: 'soccer', team: 'CF Montreal', city: 'Montreal', state: 'QC', variants: ['CF Montreal', 'Montreal'] },
  { league: 'MLS', sport: 'soccer', team: 'Charlotte FC', city: 'Charlotte', state: 'NC', variants: ['Charlotte FC'] },
  { league: 'MLS', sport: 'soccer', team: 'Chicago Fire FC', city: 'Chicago', state: 'IL', variants: ['Chicago Fire'] },
  { league: 'MLS', sport: 'soccer', team: 'Colorado Rapids', city: 'Denver', state: 'CO', variants: ['Colorado Rapids', 'Rapids'] },
  { league: 'MLS', sport: 'soccer', team: 'Columbus Crew', city: 'Columbus', state: 'OH', variants: ['Columbus Crew', 'Crew'] },
  { league: 'MLS', sport: 'soccer', team: 'D.C. United', city: 'Washington', state: 'DC', variants: ['DC United'] },
  { league: 'MLS', sport: 'soccer', team: 'FC Cincinnati', city: 'Cincinnati', state: 'OH', variants: ['FC Cincinnati'] },
  { league: 'MLS', sport: 'soccer', team: 'LAFC', city: 'Los Angeles', state: 'CA', variants: ['LAFC', 'Los Angeles FC'] },
  { league: 'MLS', sport: 'soccer', team: 'Minnesota United FC', city: 'St. Paul', state: 'MN', variants: ['Minnesota United'] },
  { league: 'MLS', sport: 'soccer', team: 'Nashville SC', city: 'Nashville', state: 'TN', variants: ['Nashville SC'] },
  { league: 'MLS', sport: 'soccer', team: 'New England Revolution', city: 'Foxborough', state: 'MA', variants: ['New England Revolution', 'Revolution'] },
  { league: 'MLS', sport: 'soccer', team: 'New York City FC', city: 'New York', state: 'NY', variants: ['New York City FC', 'NYCFC'] },
  { league: 'MLS', sport: 'soccer', team: 'New York Red Bulls', city: 'Harrison', state: 'NJ', variants: ['New York Red Bulls'] },
  { league: 'MLS', sport: 'soccer', team: 'Orlando City SC', city: 'Orlando', state: 'FL', variants: ['Orlando City'] },
  { league: 'MLS', sport: 'soccer', team: 'Philadelphia Union', city: 'Philadelphia', state: 'PA', variants: ['Philadelphia Union'] },
  { league: 'MLS', sport: 'soccer', team: 'Portland Timbers', city: 'Portland', state: 'OR', variants: ['Portland Timbers', 'Timbers'] },
  { league: 'MLS', sport: 'soccer', team: 'Real Salt Lake', city: 'Salt Lake City', state: 'UT', variants: ['Real Salt Lake', 'RSL'] },
  { league: 'MLS', sport: 'soccer', team: 'San Diego FC', city: 'San Diego', state: 'CA', variants: ['San Diego FC'] },
  { league: 'MLS', sport: 'soccer', team: 'San Jose Earthquakes', city: 'San Jose', state: 'CA', variants: ['San Jose Earthquakes', 'Quakes'] },
  { league: 'MLS', sport: 'soccer', team: 'Sporting Kansas City', city: 'Kansas City', state: 'KS', variants: ['Sporting Kansas City', 'Sporting KC'] },
  { league: 'MLS', sport: 'soccer', team: 'St. Louis City SC', city: 'St. Louis', state: 'MO', variants: ['St. Louis City SC'] },
  { league: 'MLS', sport: 'soccer', team: 'Toronto FC', city: 'Toronto', state: 'ON', variants: ['Toronto FC'] },
  { league: 'MLS', sport: 'soccer', team: 'Vancouver Whitecaps FC', city: 'Vancouver', state: 'BC', variants: ['Vancouver Whitecaps', 'Whitecaps'] },

  // Premier League
  { league: 'Premier League', sport: 'soccer', team: 'Arsenal', city: 'London', state: 'ENG', variants: ['Arsenal FC'] },
  { league: 'Premier League', sport: 'soccer', team: 'Aston Villa', city: 'Birmingham', state: 'ENG', variants: ['Aston Villa FC'] },
  { league: 'Premier League', sport: 'soccer', team: 'Bournemouth', city: 'Bournemouth', state: 'ENG', variants: ['AFC Bournemouth'] },
  { league: 'Premier League', sport: 'soccer', team: 'Brentford', city: 'London', state: 'ENG', variants: ['Brentford FC'] },
  { league: 'Premier League', sport: 'soccer', team: 'Brighton & Hove Albion', city: 'Brighton', state: 'ENG', variants: ['Brighton'] },
  { league: 'Premier League', sport: 'soccer', team: 'Chelsea', city: 'London', state: 'ENG', variants: ['Chelsea FC'] },
  { league: 'Premier League', sport: 'soccer', team: 'Crystal Palace', city: 'London', state: 'ENG', variants: ['Palace'] },
  { league: 'Premier League', sport: 'soccer', team: 'Everton', city: 'Liverpool', state: 'ENG', variants: ['Everton FC'] },
  { league: 'Premier League', sport: 'soccer', team: 'Fulham', city: 'London', state: 'ENG', variants: ['Fulham FC'] },
  { league: 'Premier League', sport: 'soccer', team: 'Ipswich Town', city: 'Ipswich', state: 'ENG', variants: ['Ipswich'] },
  { league: 'Premier League', sport: 'soccer', team: 'Leicester City', city: 'Leicester', state: 'ENG', variants: ['Leicester'] },
  { league: 'Premier League', sport: 'soccer', team: 'Liverpool', city: 'Liverpool', state: 'ENG', variants: ['Liverpool FC'] },
  { league: 'Premier League', sport: 'soccer', team: 'Manchester City', city: 'Manchester', state: 'ENG', variants: ['Man City'] },
  { league: 'Premier League', sport: 'soccer', team: 'Manchester United', city: 'Manchester', state: 'ENG', variants: ['Man United'] },
  { league: 'Premier League', sport: 'soccer', team: 'Newcastle United', city: 'Newcastle', state: 'ENG', variants: ['Newcastle'] },
  { league: 'Premier League', sport: 'soccer', team: 'Nottingham Forest', city: 'Nottingham', state: 'ENG', variants: ['Forest'] },
  { league: 'Premier League', sport: 'soccer', team: 'Southampton', city: 'Southampton', state: 'ENG', variants: ['Southampton FC'] },
  { league: 'Premier League', sport: 'soccer', team: 'Tottenham Hotspur', city: 'London', state: 'ENG', variants: ['Tottenham', 'Spurs'] },
  { league: 'Premier League', sport: 'soccer', team: 'West Ham United', city: 'London', state: 'ENG', variants: ['West Ham'] },
  { league: 'Premier League', sport: 'soccer', team: 'Wolverhampton Wanderers', city: 'Wolverhampton', state: 'ENG', variants: ['Wolves'] },

  // La Liga
  { league: 'La Liga', sport: 'soccer', team: 'Alaves', city: 'Vitoria-Gasteiz', state: 'ES', variants: ['Deportivo Alaves'] },
  { league: 'La Liga', sport: 'soccer', team: 'Athletic Club', city: 'Bilbao', state: 'ES', variants: ['Athletic Bilbao'] },
  { league: 'La Liga', sport: 'soccer', team: 'Atletico Madrid', city: 'Madrid', state: 'ES', variants: ['Atletico'] },
  { league: 'La Liga', sport: 'soccer', team: 'Barcelona', city: 'Barcelona', state: 'ES', variants: ['FC Barcelona', 'Barca'] },
  { league: 'La Liga', sport: 'soccer', team: 'Celta Vigo', city: 'Vigo', state: 'ES', variants: ['Celta'] },
  { league: 'La Liga', sport: 'soccer', team: 'Espanyol', city: 'Barcelona', state: 'ES', variants: ['RCD Espanyol'] },
  { league: 'La Liga', sport: 'soccer', team: 'Getafe', city: 'Getafe', state: 'ES', variants: ['Getafe CF'] },
  { league: 'La Liga', sport: 'soccer', team: 'Girona', city: 'Girona', state: 'ES', variants: ['Girona FC'] },
  { league: 'La Liga', sport: 'soccer', team: 'Las Palmas', city: 'Las Palmas', state: 'ES', variants: ['UD Las Palmas'] },
  { league: 'La Liga', sport: 'soccer', team: 'Leganes', city: 'Leganes', state: 'ES', variants: ['CD Leganes'] },
  { league: 'La Liga', sport: 'soccer', team: 'Mallorca', city: 'Palma', state: 'ES', variants: ['RCD Mallorca'] },
  { league: 'La Liga', sport: 'soccer', team: 'Osasuna', city: 'Pamplona', state: 'ES', variants: ['CA Osasuna'] },
  { league: 'La Liga', sport: 'soccer', team: 'Rayo Vallecano', city: 'Madrid', state: 'ES', variants: ['Rayo'] },
  { league: 'La Liga', sport: 'soccer', team: 'Real Betis', city: 'Seville', state: 'ES', variants: ['Betis'] },
  { league: 'La Liga', sport: 'soccer', team: 'Real Madrid', city: 'Madrid', state: 'ES', variants: ['Madrid'] },
  { league: 'La Liga', sport: 'soccer', team: 'Real Sociedad', city: 'San Sebastian', state: 'ES', variants: ['Sociedad'] },
  { league: 'La Liga', sport: 'soccer', team: 'Sevilla', city: 'Seville', state: 'ES', variants: ['Sevilla FC'] },
  { league: 'La Liga', sport: 'soccer', team: 'Valencia', city: 'Valencia', state: 'ES', variants: ['Valencia CF'] },
  { league: 'La Liga', sport: 'soccer', team: 'Valladolid', city: 'Valladolid', state: 'ES', variants: ['Real Valladolid'] },
  { league: 'La Liga', sport: 'soccer', team: 'Villarreal', city: 'Villarreal', state: 'ES', variants: ['Villarreal CF'] }
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

const inferSportsTeamsFromText = (text = '') => {
  const normalizedText = normalizeToken(text);
  if (!normalizedText) return [];

  const matched = new Map();
  for (const [variant, team] of SPORTS_TEAM_LOOKUP.entries()) {
    const pattern = new RegExp(`\\b${variant.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
    if (!pattern.test(normalizedText)) continue;
    const id = `${normalizeToken(team.league)}:${normalizeToken(team.team).replace(/[^a-z0-9]+/g, '-')}`;
    const existing = matched.get(id);
    if (!existing || variant.length > existing.variant.length) {
      matched.set(id, { ...team, id, leagueLabel: team.league, icon: '🏟️', variant });
    }
  }

  return Array.from(matched.values()).sort((a, b) => b.variant.length - a.variant.length);
};

const inferSportsLocationFromText = (text = '') => {
  const matched = inferSportsTeamsFromText(text);
  return matched[0] || null;
};

const getSportsTeamsByLeague = () => {
  const leagueIcons = {
    NFL: '🏈',
    NBA: '🏀',
    MLB: '⚾',
    NHL: '🏒',
    MLS: '⚽',
    'NCAA-DI': '🏟️',
    'NCAA Football': '🏟️',
    'NCAA Basketball': '⛹️',
    'Premier League': '🇬🇧',
    'La Liga': '🇪🇸'
  };

  const normalizeLeague = (team) => {
    if (team.league !== 'NCAA-DI') {
      return team.league;
    }

    if (team.sport === 'football') {
      return 'NCAA Football';
    }

    if (team.sport === 'basketball' || team.sport === 'women-basketball') {
      return 'NCAA Basketball';
    }

    return 'NCAA';
  };

  const byLeague = new Map();
  for (const team of SPORTS_TEAMS) {
    const leagueLabel = normalizeLeague(team);
    const leagueId = String(leagueLabel || '').replace(/\s+/g, '_').toUpperCase();
    if (!byLeague.has(leagueId)) {
      byLeague.set(leagueId, {
        id: leagueId,
        label: leagueLabel,
        icon: leagueIcons[leagueLabel] || leagueIcons[leagueId] || '🏟️',
        sport: team.sport,
        teams: []
      });
    }

    byLeague.get(leagueId).teams.push({
      id: `${normalizeToken(leagueLabel)}:${normalizeToken(team.team).replace(/[^a-z0-9]+/g, '-')}`,
      league: leagueId,
      leagueLabel,
      team: team.team,
      city: team.city,
      state: team.state,
      country: leagueLabel === 'Premier League' ? 'GB' : leagueLabel === 'La Liga' ? 'ES' : 'US'
    });
  }

  return Array.from(byLeague.values())
    .map((league) => ({
      ...league,
      teams: Array.from(new Map(league.teams.map((team) => [`${team.league}:${team.team}`, team])).values())
        .sort((a, b) => a.team.localeCompare(b.team))
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

module.exports = {
  SPORTS_TEAMS,
  getSportsTeamsByLeague,
  inferSportsTeamsFromText,
  inferSportsLocationFromText
};
