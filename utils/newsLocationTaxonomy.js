const citySubreddits = require('../data/news/us-city-subreddits.json');
const tvAffiliates = require('../data/news/us-tv-affiliates.json');
const newspapers = require('../data/news/us-newspapers.json');
const { SPORTS_TEAMS } = require('../data/news/sportsTeamLocationIndex');
const { US_CITY_LOCATION_ENTRIES } = require('../data/news/cityLocationIndex');

const US_COUNTRY_CANONICAL = 'US';

const US_STATES_AND_TERRITORIES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'AS', name: 'American Samoa' },
  { code: 'GU', name: 'Guam' },
  { code: 'MP', name: 'Northern Mariana Islands' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'VI', name: 'U.S. Virgin Islands' }
];

const normalizeToken = (value) => String(value || '').trim().toLowerCase();
const titleCase = (value) => String(value || '')
  .split(/\s+/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
  .join(' ');

const stateNameToCode = new Map(US_STATES_AND_TERRITORIES.map((entry) => [normalizeToken(entry.name), entry.code]));
const stateCodeToName = new Map(US_STATES_AND_TERRITORIES.map((entry) => [entry.code, entry.name]));

const canonicalizeStateCode = (stateInput = '') => {
  const trimmed = String(stateInput || '').trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (stateCodeToName.has(upper)) return upper;
  return stateNameToCode.get(normalizeToken(trimmed)) || null;
};

const canonicalizeCountryCode = (countryInput = '') => {
  const normalized = normalizeToken(countryInput);
  if (!normalized) return null;
  if (['us', 'usa', 'united states', 'united states of america', 'america'].includes(normalized)) {
    return US_COUNTRY_CANONICAL;
  }
  return String(countryInput || '').trim().toUpperCase();
};

const cityIndexByState = new Map();

const addCity = (city, state) => {
  const cityName = titleCase(city);
  const stateCode = canonicalizeStateCode(state);
  if (!cityName || !stateCode) return;
  if (!cityIndexByState.has(stateCode)) {
    cityIndexByState.set(stateCode, new Set());
  }
  cityIndexByState.get(stateCode).add(cityName);
};

for (const row of citySubreddits) {
  addCity(row.city, row.state || row.stateAbbrev);
}
for (const row of tvAffiliates) {
  addCity(row.market, row.state || row.stateAbbrev);
}
for (const row of newspapers) {
  addCity(row.city, row.state || row.stateAbbrev);
}
for (const team of SPORTS_TEAMS) {
  addCity(team.city, team.state);
}
for (const cityEntry of US_CITY_LOCATION_ENTRIES) {
  addCity(cityEntry.city, cityEntry.stateAbbrev);
}

const getCitiesForState = (stateCode) => {
  const normalized = canonicalizeStateCode(stateCode);
  if (!normalized) return [];
  return [...(cityIndexByState.get(normalized) || new Set())].sort((a, b) => a.localeCompare(b));
};

const toCityKey = ({ city, stateCode }) => {
  const normalizedCity = normalizeToken(city).replace(/[^a-z0-9]+/g, '-');
  return normalizedCity && stateCode ? `${stateCode}:${normalizedCity}` : null;
};

const canonicalizeNewsLocation = (location = {}) => {
  const stateCode = canonicalizeStateCode(location.state || location.stateCode);
  const city = titleCase(location.city || '');
  const county = titleCase(location.county || '');
  const zipCode = String(location.zipCode || '').trim().toUpperCase() || null;
  const rawCountry = location.country || location.countryCode;
  const hasMeaningfulCountryInput = rawCountry && String(rawCountry).trim().length > 0;
  const countryCode = hasMeaningfulCountryInput ? canonicalizeCountryCode(rawCountry) : null;
  const country = countryCode ? (countryCode === 'US' ? 'United States' : countryCode) : null;

  const canonicalCity = stateCode && city
    ? getCitiesForState(stateCode).find((candidate) => normalizeToken(candidate) === normalizeToken(city)) || city
    : city || null;

  return {
    city: canonicalCity || null,
    county: county || null,
    zipCode,
    state: stateCode ? stateCodeToName.get(stateCode) : null,
    stateCode,
    country,
    countryCode,
    cityKey: canonicalCity && stateCode ? toCityKey({ city: canonicalCity, stateCode }) : null
  };
};

const getLocationTaxonomyPayload = () => {
  const states = US_STATES_AND_TERRITORIES.map((entry) => ({ ...entry }));
  const citiesByState = {};
  for (const state of states) {
    citiesByState[state.code] = getCitiesForState(state.code);
  }
  return {
    country: { code: 'US', name: 'United States' },
    states,
    citiesByState
  };
};

module.exports = {
  US_STATES_AND_TERRITORIES,
  canonicalizeCountryCode,
  canonicalizeStateCode,
  canonicalizeNewsLocation,
  getCitiesForState,
  getLocationTaxonomyPayload,
  titleCase,
  toCityKey
};
