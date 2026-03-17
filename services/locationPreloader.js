'use strict';

const { getArticlesForLocation } = require('./locationCacheService');

const PRELOAD_CITIES = [
  { city: 'new_york', state: 'ny', country: 'us' },
  { city: 'los_angeles', state: 'ca', country: 'us' },
  { city: 'chicago', state: 'il', country: 'us' },
  { city: 'houston', state: 'tx', country: 'us' },
  { city: 'phoenix', state: 'az', country: 'us' },
  { city: 'philadelphia', state: 'pa', country: 'us' },
  { city: 'san_antonio', state: 'tx', country: 'us' },
  { city: 'san_diego', state: 'ca', country: 'us' },
  { city: 'dallas', state: 'tx', country: 'us' },
  { city: 'san_jose', state: 'ca', country: 'us' },
  { city: 'austin', state: 'tx', country: 'us' },
  { city: 'san_marcos', state: 'tx', country: 'us' }
];

const STATE_REPRESENTATIVE_CITIES = [
  ['montgomery', 'al'], ['juneau', 'ak'], ['phoenix', 'az'], ['little_rock', 'ar'], ['sacramento', 'ca'],
  ['denver', 'co'], ['hartford', 'ct'], ['dover', 'de'], ['washington', 'dc'], ['tallahassee', 'fl'],
  ['atlanta', 'ga'], ['honolulu', 'hi'], ['boise', 'id'], ['springfield', 'il'], ['indianapolis', 'in'],
  ['des_moines', 'ia'], ['topeka', 'ks'], ['frankfort', 'ky'], ['baton_rouge', 'la'], ['augusta', 'me'],
  ['annapolis', 'md'], ['boston', 'ma'], ['lansing', 'mi'], ['saint_paul', 'mn'], ['jackson', 'ms'],
  ['jefferson_city', 'mo'], ['helena', 'mt'], ['lincoln', 'ne'], ['carson_city', 'nv'], ['concord', 'nh'],
  ['trenton', 'nj'], ['santa_fe', 'nm'], ['albany', 'ny'], ['raleigh', 'nc'], ['bismarck', 'nd'],
  ['columbus', 'oh'], ['oklahoma_city', 'ok'], ['salem', 'or'], ['harrisburg', 'pa'], ['providence', 'ri'],
  ['columbia', 'sc'], ['pierre', 'sd'], ['nashville', 'tn'], ['austin', 'tx'], ['salt_lake_city', 'ut'],
  ['montpelier', 'vt'], ['richmond', 'va'], ['olympia', 'wa'], ['charleston', 'wv'], ['madison', 'wi'],
  ['cheyenne', 'wy']
].map(([city, state]) => ({ city, state, country: 'us' }));

async function preloadCommonLocations() {
  const seen = new Set();
  for (const entry of [...PRELOAD_CITIES, ...STATE_REPRESENTATIVE_CITIES]) {
    const key = `${entry.city}_${entry.state}_${entry.country}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await getArticlesForLocation(key);
    } catch (_) {
      // Best-effort warm-up only.
    }
  }
}

module.exports = {
  PRELOAD_CITIES,
  STATE_REPRESENTATIVE_CITIES,
  preloadCommonLocations
};
