const normalizeToken = require('../../utils/normalizeToken');

const STATE_NAME_BY_ABBREV = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};

const US_STATE_TOP_CITIES = {
  AL: ['Birmingham', 'Huntsville', 'Montgomery', 'Mobile', 'Tuscaloosa'],
  AK: ['Anchorage', 'Fairbanks', 'Juneau', 'Badger', 'Knik-Fairview'],
  AZ: ['Phoenix', 'Tucson', 'Mesa', 'Chandler', 'Scottsdale'],
  AR: ['Little Rock', 'Fayetteville', 'Fort Smith', 'Springdale', 'Jonesboro'],
  CA: ['Los Angeles', 'San Diego', 'San Jose', 'San Francisco', 'Fresno'],
  CO: ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Lakewood'],
  CT: ['Bridgeport', 'Stamford', 'New Haven', 'Hartford', 'Waterbury'],
  DE: ['Wilmington', 'Dover', 'Newark', 'Middletown', 'Smyrna'],
  FL: ['Jacksonville', 'Miami', 'Tampa', 'Orlando', 'St. Petersburg'],
  GA: ['Atlanta', 'Columbus', 'Augusta', 'Macon', 'Savannah'],
  HI: ['Honolulu', 'East Honolulu', 'Pearl City', 'Hilo', 'Kailua'],
  ID: ['Boise', 'Meridian', 'Nampa', 'Idaho Falls', 'Caldwell'],
  IL: ['Chicago', 'Aurora', 'Joliet', 'Naperville', 'Rockford'],
  IN: ['Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend', 'Carmel'],
  IA: ['Des Moines', 'Cedar Rapids', 'Davenport', 'Sioux City', 'Iowa City'],
  KS: ['Wichita', 'Overland Park', 'Kansas City', 'Olathe', 'Topeka'],
  KY: ['Louisville', 'Lexington', 'Bowling Green', 'Owensboro', 'Covington'],
  LA: ['New Orleans', 'Baton Rouge', 'Shreveport', 'Lafayette', 'Lake Charles'],
  ME: ['Portland', 'Lewiston', 'Bangor', 'South Portland', 'Auburn'],
  MD: ['Baltimore', 'Frederick', 'Gaithersburg', 'Rockville', 'Bowie'],
  MA: ['Boston', 'Worcester', 'Springfield', 'Cambridge', 'Lowell'],
  MI: ['Detroit', 'Grand Rapids', 'Warren', 'Sterling Heights', 'Ann Arbor'],
  MN: ['Minneapolis', 'Saint Paul', 'Rochester', 'Duluth', 'Bloomington'],
  MS: ['Jackson', 'Gulfport', 'Southaven', 'Hattiesburg', 'Biloxi'],
  MO: ['Kansas City', 'St. Louis', 'Springfield', 'Independence', 'Columbia'],
  MT: ['Billings', 'Missoula', 'Great Falls', 'Bozeman', 'Butte'],
  NE: ['Omaha', 'Lincoln', 'Bellevue', 'Grand Island', 'Kearney'],
  NV: ['Las Vegas', 'Henderson', 'Reno', 'North Las Vegas', 'Sparks'],
  NH: ['Manchester', 'Nashua', 'Concord', 'Derry', 'Rochester'],
  NJ: ['Newark', 'Jersey City', 'Paterson', 'Elizabeth', 'Edison'],
  NM: ['Albuquerque', 'Las Cruces', 'Rio Rancho', 'Santa Fe', 'Roswell'],
  NY: ['New York City', 'Buffalo', 'Yonkers', 'Rochester', 'Syracuse'],
  NC: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem'],
  ND: ['Fargo', 'Bismarck', 'Grand Forks', 'Minot', 'West Fargo'],
  OH: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron'],
  OK: ['Oklahoma City', 'Tulsa', 'Norman', 'Broken Arrow', 'Edmond'],
  OR: ['Portland', 'Salem', 'Eugene', 'Gresham', 'Hillsboro'],
  PA: ['Philadelphia', 'Pittsburgh', 'Allentown', 'Reading', 'Erie'],
  RI: ['Providence', 'Warwick', 'Cranston', 'Pawtucket', 'East Providence'],
  SC: ['Charleston', 'Columbia', 'North Charleston', 'Mount Pleasant', 'Rock Hill'],
  SD: ['Sioux Falls', 'Rapid City', 'Aberdeen', 'Brookings', 'Watertown'],
  TN: ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga', 'Clarksville'],
  TX: ['Houston', 'San Antonio', 'Dallas', 'Austin', 'Fort Worth'],
  UT: ['Salt Lake City', 'West Valley City', 'West Jordan', 'Provo', 'Orem'],
  VT: ['Burlington', 'South Burlington', 'Rutland', 'Barre', 'Montpelier'],
  VA: ['Virginia Beach', 'Chesapeake', 'Norfolk', 'Richmond', 'Newport News'],
  WA: ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue'],
  WV: ['Charleston', 'Huntington', 'Morgantown', 'Parkersburg', 'Wheeling'],
  WI: ['Milwaukee', 'Madison', 'Green Bay', 'Kenosha', 'Racine'],
  WY: ['Cheyenne', 'Casper', 'Laramie', 'Gillette', 'Rock Springs']
};

const EUROPE_TOP_20_CITIES = [
  { city: 'Istanbul', country: 'Turkiye' },
  { city: 'Moscow', country: 'Russia' },
  { city: 'London', country: 'United Kingdom' },
  { city: 'Saint Petersburg', country: 'Russia' },
  { city: 'Berlin', country: 'Germany' },
  { city: 'Madrid', country: 'Spain' },
  { city: 'Kyiv', country: 'Ukraine' },
  { city: 'Rome', country: 'Italy' },
  { city: 'Paris', country: 'France' },
  { city: 'Bucharest', country: 'Romania' },
  { city: 'Vienna', country: 'Austria' },
  { city: 'Hamburg', country: 'Germany' },
  { city: 'Budapest', country: 'Hungary' },
  { city: 'Warsaw', country: 'Poland' },
  { city: 'Barcelona', country: 'Spain' },
  { city: 'Munich', country: 'Germany' },
  { city: 'Kharkiv', country: 'Ukraine' },
  { city: 'Milan', country: 'Italy' },
  { city: 'Belgrade', country: 'Serbia' },
  { city: 'Sofia', country: 'Bulgaria' }
];

const US_CITY_LOCATION_ENTRIES = Object.entries(US_STATE_TOP_CITIES)
  .flatMap(([stateAbbrev, cities]) => cities.map((city) => ({
    group: 'us',
    city,
    state: STATE_NAME_BY_ABBREV[stateAbbrev],
    stateAbbrev,
    country: 'United States',
    countryCode: 'US',
    variants: [
      city,
      `${city}, ${stateAbbrev}`,
      `${city}, ${STATE_NAME_BY_ABBREV[stateAbbrev]}`
    ]
  })));

if (US_CITY_LOCATION_ENTRIES.length !== 250) {
  throw new Error(`US city location dataset must contain exactly 250 entries. Received ${US_CITY_LOCATION_ENTRIES.length}.`);
}

const EUROPE_CITY_LOCATION_ENTRIES = EUROPE_TOP_20_CITIES.map((entry) => ({
  group: 'europe',
  city: entry.city,
  country: entry.country,
  countryCode: null,
  variants: [entry.city, `${entry.city}, ${entry.country}`]
}));

const CITY_LOCATION_ENTRIES = [...US_CITY_LOCATION_ENTRIES, ...EUROPE_CITY_LOCATION_ENTRIES];

const buildCityVariantLookup = () => {
  const variantLookup = new Map();
  for (const entry of CITY_LOCATION_ENTRIES) {
    for (const variant of entry.variants || []) {
      const normalized = normalizeToken(variant);
      if (!normalized) continue;
      if (!variantLookup.has(normalized)) {
        variantLookup.set(normalized, entry);
      }
    }
  }
  return variantLookup;
};

const CITY_VARIANT_LOOKUP = buildCityVariantLookup();

const inferCityLocationFromText = (text = '') => {
  if (!text) return null;

  let bestMatch = null;
  for (const [variant, location] of CITY_VARIANT_LOOKUP.entries()) {
    // Build a case-sensitive pattern using the original city casing (from the variant map
    // key, which is lowercased, so we reconstruct the proper-cased variant from the entry).
    // We match against the original text (preserving capitalisation) so that common English
    // words that happen to share a name with a city (e.g. "reading" the verb vs "Reading, PA")
    // are not treated as city names.
    const originalVariant = location.variants?.find(
      (v) => normalizeToken(v) === variant
    ) || variant;
    const escaped = originalVariant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`);
    if (!pattern.test(text)) continue;
    if (!bestMatch || variant.length > bestMatch.variant.length) {
      bestMatch = { variant, location };
    }
  }

  return bestMatch?.location || null;
};

module.exports = {
  US_CITY_LOCATION_ENTRIES,
  EUROPE_CITY_LOCATION_ENTRIES,
  CITY_LOCATION_ENTRIES,
  inferCityLocationFromText
};
