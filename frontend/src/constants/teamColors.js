/**
 * Team color lookup map — maps team IDs (lowercase, colon-separated)
 * to { primary, secondary } hex colors for NFL, NBA, MLB, NHL, and MLS teams.
 *
 * Usage:
 *   import { TEAM_COLORS, getTeamColors } from '../constants/teamColors';
 *   const colors = getTeamColors('nfl:dallas-cowboys');
 *   // => { primary: '#003594', secondary: '#869397' }
 */

const TEAM_COLORS = {
  // ── NFL ────────────────────────────────────────────────────────────────────
  'nfl:arizona-cardinals':       { primary: '#97233F', secondary: '#000000' },
  'nfl:atlanta-falcons':         { primary: '#A71930', secondary: '#000000' },
  'nfl:baltimore-ravens':        { primary: '#241773', secondary: '#9E7C0C' },
  'nfl:buffalo-bills':           { primary: '#00338D', secondary: '#C60C30' },
  'nfl:carolina-panthers':       { primary: '#0085CA', secondary: '#101820' },
  'nfl:chicago-bears':           { primary: '#0B162A', secondary: '#C83803' },
  'nfl:cincinnati-bengals':      { primary: '#FB4F14', secondary: '#000000' },
  'nfl:cleveland-browns':        { primary: '#311D00', secondary: '#FF3C00' },
  'nfl:dallas-cowboys':          { primary: '#003594', secondary: '#869397' },
  'nfl:denver-broncos':          { primary: '#FB4F14', secondary: '#002244' },
  'nfl:detroit-lions':           { primary: '#0076B6', secondary: '#B0B7BC' },
  'nfl:green-bay-packers':       { primary: '#203731', secondary: '#FFB612' },
  'nfl:houston-texans':          { primary: '#03202F', secondary: '#A71930' },
  'nfl:indianapolis-colts':      { primary: '#002C5F', secondary: '#A2AAAD' },
  'nfl:jacksonville-jaguars':    { primary: '#006778', secondary: '#9F792C' },
  'nfl:kansas-city-chiefs':      { primary: '#E31837', secondary: '#FFB81C' },
  'nfl:las-vegas-raiders':       { primary: '#000000', secondary: '#A5ACAF' },
  'nfl:los-angeles-chargers':    { primary: '#0080C6', secondary: '#FFC20E' },
  'nfl:los-angeles-rams':        { primary: '#003594', secondary: '#FFA300' },
  'nfl:miami-dolphins':          { primary: '#008E97', secondary: '#FC4C02' },
  'nfl:minnesota-vikings':       { primary: '#4F2683', secondary: '#FFC62F' },
  'nfl:new-england-patriots':    { primary: '#002244', secondary: '#C60C30' },
  'nfl:new-orleans-saints':      { primary: '#D3BC8D', secondary: '#101820' },
  'nfl:new-york-giants':         { primary: '#0B2265', secondary: '#A71930' },
  'nfl:new-york-jets':           { primary: '#125740', secondary: '#000000' },
  'nfl:philadelphia-eagles':     { primary: '#004C54', secondary: '#A5ACAF' },
  'nfl:pittsburgh-steelers':     { primary: '#FFB612', secondary: '#101820' },
  'nfl:san-francisco-49ers':     { primary: '#AA0000', secondary: '#B3995D' },
  'nfl:seattle-seahawks':        { primary: '#002244', secondary: '#69BE28' },
  'nfl:tampa-bay-buccaneers':    { primary: '#D50A0A', secondary: '#34302B' },
  'nfl:tennessee-titans':        { primary: '#0C2340', secondary: '#4B92DB' },
  'nfl:washington-commanders':   { primary: '#5A1414', secondary: '#FFB612' },

  // ── NBA ────────────────────────────────────────────────────────────────────
  'nba:atlanta-hawks':           { primary: '#E03A3E', secondary: '#C1D32F' },
  'nba:boston-celtics':           { primary: '#007A33', secondary: '#BA9653' },
  'nba:brooklyn-nets':           { primary: '#000000', secondary: '#FFFFFF' },
  'nba:charlotte-hornets':       { primary: '#1D1160', secondary: '#00788C' },
  'nba:chicago-bulls':           { primary: '#CE1141', secondary: '#000000' },
  'nba:cleveland-cavaliers':     { primary: '#860038', secondary: '#FDBB30' },
  'nba:dallas-mavericks':        { primary: '#00538C', secondary: '#B8C4CA' },
  'nba:denver-nuggets':          { primary: '#0E2240', secondary: '#FEC524' },
  'nba:detroit-pistons':         { primary: '#C8102E', secondary: '#1D42BA' },
  'nba:golden-state-warriors':   { primary: '#1D428A', secondary: '#FFC72C' },
  'nba:houston-rockets':         { primary: '#CE1141', secondary: '#000000' },
  'nba:indiana-pacers':          { primary: '#002D62', secondary: '#FDBB30' },
  'nba:la-clippers':             { primary: '#C8102E', secondary: '#1D428A' },
  'nba:los-angeles-lakers':      { primary: '#552583', secondary: '#FDB927' },
  'nba:memphis-grizzlies':       { primary: '#5D76A9', secondary: '#12173F' },
  'nba:miami-heat':              { primary: '#98002E', secondary: '#F9A01B' },
  'nba:milwaukee-bucks':         { primary: '#00471B', secondary: '#EEE1C6' },
  'nba:minnesota-timberwolves':  { primary: '#0C2340', secondary: '#236192' },
  'nba:new-orleans-pelicans':    { primary: '#0C2340', secondary: '#C8102E' },
  'nba:new-york-knicks':         { primary: '#006BB6', secondary: '#F58426' },
  'nba:oklahoma-city-thunder':   { primary: '#007AC1', secondary: '#EF6100' },
  'nba:orlando-magic':           { primary: '#0077C0', secondary: '#C4CED4' },
  'nba:philadelphia-76ers':      { primary: '#006BB6', secondary: '#ED174C' },
  'nba:phoenix-suns':            { primary: '#1D1160', secondary: '#E56020' },
  'nba:portland-trail-blazers':  { primary: '#E03A3E', secondary: '#000000' },
  'nba:sacramento-kings':        { primary: '#5A2D81', secondary: '#63727A' },
  'nba:san-antonio-spurs':       { primary: '#C4CED4', secondary: '#000000' },
  'nba:toronto-raptors':         { primary: '#CE1141', secondary: '#000000' },
  'nba:utah-jazz':               { primary: '#002B5C', secondary: '#F9A01B' },
  'nba:washington-wizards':      { primary: '#002B5C', secondary: '#E31837' },

  // ── MLB ────────────────────────────────────────────────────────────────────
  'mlb:arizona-diamondbacks':    { primary: '#A71930', secondary: '#E3D4AD' },
  'mlb:atlanta-braves':          { primary: '#CE1141', secondary: '#13274F' },
  'mlb:baltimore-orioles':       { primary: '#DF4601', secondary: '#000000' },
  'mlb:boston-red-sox':           { primary: '#BD3039', secondary: '#0C2340' },
  'mlb:chicago-cubs':            { primary: '#0E3386', secondary: '#CC3433' },
  'mlb:chicago-white-sox':       { primary: '#27251F', secondary: '#C4CED4' },
  'mlb:cincinnati-reds':         { primary: '#C6011F', secondary: '#000000' },
  'mlb:cleveland-guardians':     { primary: '#00385D', secondary: '#E50022' },
  'mlb:colorado-rockies':        { primary: '#33006F', secondary: '#C4CED4' },
  'mlb:detroit-tigers':          { primary: '#0C2340', secondary: '#FA4616' },
  'mlb:houston-astros':          { primary: '#002D62', secondary: '#EB6E1F' },
  'mlb:kansas-city-royals':      { primary: '#004687', secondary: '#BD9B60' },
  'mlb:los-angeles-angels':      { primary: '#BA0021', secondary: '#003263' },
  'mlb:los-angeles-dodgers':     { primary: '#005A9C', secondary: '#EF3E42' },
  'mlb:miami-marlins':           { primary: '#00A3E0', secondary: '#EF3340' },
  'mlb:milwaukee-brewers':       { primary: '#12284B', secondary: '#FFC52F' },
  'mlb:minnesota-twins':         { primary: '#002B5C', secondary: '#D31145' },
  'mlb:new-york-mets':           { primary: '#002D72', secondary: '#FF5910' },
  'mlb:new-york-yankees':        { primary: '#003087', secondary: '#C4CED4' },
  'mlb:oakland-athletics':       { primary: '#003831', secondary: '#EFB21E' },
  'mlb:philadelphia-phillies':   { primary: '#E81828', secondary: '#002D72' },
  'mlb:pittsburgh-pirates':      { primary: '#27251F', secondary: '#FDB827' },
  'mlb:san-diego-padres':        { primary: '#2F241D', secondary: '#FFC425' },
  'mlb:san-francisco-giants':    { primary: '#FD5A1E', secondary: '#27251F' },
  'mlb:seattle-mariners':        { primary: '#0C2C56', secondary: '#005C5C' },
  'mlb:st-louis-cardinals':      { primary: '#C41E3A', secondary: '#0C2340' },
  'mlb:tampa-bay-rays':          { primary: '#092C5C', secondary: '#8FBCE6' },
  'mlb:texas-rangers':           { primary: '#003278', secondary: '#C0111F' },
  'mlb:toronto-blue-jays':       { primary: '#134A8E', secondary: '#1D2D5C' },
  'mlb:washington-nationals':    { primary: '#AB0003', secondary: '#14225A' },

  // ── NHL ────────────────────────────────────────────────────────────────────
  'nhl:anaheim-ducks':           { primary: '#F47A38', secondary: '#B9975B' },
  'nhl:arizona-coyotes':         { primary: '#8C2633', secondary: '#E2D6B5' },
  'nhl:boston-bruins':            { primary: '#FFB81C', secondary: '#000000' },
  'nhl:buffalo-sabres':          { primary: '#002654', secondary: '#FCB514' },
  'nhl:calgary-flames':          { primary: '#D2001C', secondary: '#FAAF19' },
  'nhl:carolina-hurricanes':     { primary: '#CC0000', secondary: '#000000' },
  'nhl:chicago-blackhawks':      { primary: '#CF0A2C', secondary: '#000000' },
  'nhl:colorado-avalanche':      { primary: '#6F263D', secondary: '#236192' },
  'nhl:columbus-blue-jackets':   { primary: '#002654', secondary: '#CE1141' },
  'nhl:dallas-stars':            { primary: '#006847', secondary: '#8F8F8C' },
  'nhl:detroit-red-wings':       { primary: '#CE1141', secondary: '#FFFFFF' },
  'nhl:edmonton-oilers':         { primary: '#041E42', secondary: '#FF4C00' },
  'nhl:florida-panthers':        { primary: '#041E42', secondary: '#C8102E' },
  'nhl:los-angeles-kings':       { primary: '#111111', secondary: '#A2AAAD' },
  'nhl:minnesota-wild':          { primary: '#154734', secondary: '#A6192E' },
  'nhl:montreal-canadiens':      { primary: '#AF1E2D', secondary: '#192168' },
  'nhl:nashville-predators':     { primary: '#FFB81C', secondary: '#041E42' },
  'nhl:new-jersey-devils':       { primary: '#CE1141', secondary: '#000000' },
  'nhl:new-york-islanders':      { primary: '#00539B', secondary: '#F47D30' },
  'nhl:new-york-rangers':        { primary: '#0038A8', secondary: '#CE1141' },
  'nhl:ottawa-senators':         { primary: '#C52032', secondary: '#C2912C' },
  'nhl:philadelphia-flyers':     { primary: '#F74902', secondary: '#000000' },
  'nhl:pittsburgh-penguins':     { primary: '#FCB514', secondary: '#000000' },
  'nhl:san-jose-sharks':         { primary: '#006D75', secondary: '#EA7200' },
  'nhl:seattle-kraken':          { primary: '#001628', secondary: '#99D9D9' },
  'nhl:st-louis-blues':          { primary: '#002F87', secondary: '#FCB514' },
  'nhl:tampa-bay-lightning':     { primary: '#002868', secondary: '#FFFFFF' },
  'nhl:toronto-maple-leafs':     { primary: '#00205B', secondary: '#FFFFFF' },
  'nhl:utah-hockey-club':        { primary: '#010101', secondary: '#69B3E7' },
  'nhl:vancouver-canucks':       { primary: '#00205B', secondary: '#00843D' },
  'nhl:vegas-golden-knights':    { primary: '#B4975A', secondary: '#333F42' },
  'nhl:washington-capitals':     { primary: '#C8102E', secondary: '#041E42' },
  'nhl:winnipeg-jets':           { primary: '#041E42', secondary: '#004C97' },

  // ── MLS ────────────────────────────────────────────────────────────────────
  'mls:atlanta-united':          { primary: '#80000B', secondary: '#221F1F' },
  'mls:austin-fc':               { primary: '#00B140', secondary: '#000000' },
  'mls:charlotte-fc':            { primary: '#1A85C8', secondary: '#000000' },
  'mls:chicago-fire':            { primary: '#FF0000', secondary: '#0A174A' },
  'mls:colorado-rapids':         { primary: '#960A2C', secondary: '#9CC2EA' },
  'mls:columbus-crew':           { primary: '#FEDD00', secondary: '#000000' },
  'mls:fc-cincinnati':           { primary: '#F05323', secondary: '#263B80' },
  'mls:fc-dallas':               { primary: '#BF0D3E', secondary: '#002B5C' },
  'mls:houston-dynamo':          { primary: '#FF6B00', secondary: '#101820' },
  'mls:inter-miami':             { primary: '#F7B5CD', secondary: '#231F20' },
  'mls:la-galaxy':               { primary: '#00245D', secondary: '#FFD200' },
  'mls:lafc':                    { primary: '#C39E6D', secondary: '#000000' },
  'mls:minnesota-united':        { primary: '#E4E5E6', secondary: '#231F20' },
  'mls:montreal-cf':             { primary: '#003DA5', secondary: '#000000' },
  'mls:nashville-sc':            { primary: '#ECE83A', secondary: '#1F1646' },
  'mls:new-england-revolution':  { primary: '#0A2141', secondary: '#CE0037' },
  'mls:new-york-city-fc':        { primary: '#6CACE4', secondary: '#041E42' },
  'mls:new-york-red-bulls':      { primary: '#ED1E36', secondary: '#27251F' },
  'mls:orlando-city':            { primary: '#633492', secondary: '#FDE192' },
  'mls:philadelphia-union':      { primary: '#002B5C', secondary: '#B18F2B' },
  'mls:portland-timbers':         { primary: '#004812', secondary: '#D69A00' },
  'mls:real-salt-lake':          { primary: '#B30838', secondary: '#013A81' },
  'mls:san-jose-earthquakes':    { primary: '#0067B1', secondary: '#000000' },
  'mls:seattle-sounders':        { primary: '#005595', secondary: '#658D1B' },
  'mls:sporting-kansas-city':    { primary: '#002F65', secondary: '#91B0D5' },
  'mls:st-louis-city':           { primary: '#D22630', secondary: '#0A1E3F' },
  'mls:toronto-fc':              { primary: '#B81137', secondary: '#455560' },
  'mls:vancouver-whitecaps':     { primary: '#00245D', secondary: '#9DC2EA' },
  'mls:dc-united':               { primary: '#EF3E42', secondary: '#000000' },
};

/** Generate a deterministic hue from a string (0-359). */
function stringToHue(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 360);
}

/** Convert HSL to Hex. */
function hslToHex(h, s, l) {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Generate a vibrant fallback primary and dark secondary color pair. */
function generateFallbackColors(teamName) {
  const hue = stringToHue(teamName || 'unknown');
  return {
    primary: hslToHex(hue, 80, 45), // Vibrant primary
    secondary: hslToHex((hue + 180) % 360, 40, 20), // Dark contrasting secondary
  };
}

/**
 * Look up team colors by team ID (case-insensitive).
 * Returns { primary, secondary } hex strings.
 * Falls back to deterministic generated colors if not mapped.
 */
export function getTeamColors(teamId) {
  if (!teamId) return { primary: '#6B7280', secondary: '#E5E7EB' };
  const mappedColor = TEAM_COLORS[String(teamId).toLowerCase()];
  if (mappedColor) return mappedColor;
  
  // Try to find a partial match (e.g. if passed "Real Madrid" instead of "la-liga:real-madrid")
  // Just in case opponent names are passed in.
  const query = String(teamId).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [key, color] of Object.entries(TEAM_COLORS)) {
    if (key.replace(/[^a-z0-9]/g, '').includes(query) || query.includes(key.replace(/[^a-z0-9]/g, ''))) {
      return color;
    }
  }

  return generateFallbackColors(teamId);
}

export { TEAM_COLORS };
export default TEAM_COLORS;
