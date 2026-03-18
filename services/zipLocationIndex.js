const fs = require('fs/promises');
const path = require('path');

const mongoose = require('mongoose');
const NodeGeocoder = require('node-geocoder');

const normalizeToken = require('../utils/normalizeToken');

const ZipLocationIndex = require('../models/ZipLocationIndex');

const STATIC_ZIP_LOCATION_INDEX = Object.freeze({
  '78666': {
    zipCode: '78666',
    city: 'San Marcos',
    county: 'Hays County',
    state: 'Texas',
    stateCode: 'TX',
    country: 'United States',
    countryCode: 'US',
    latitude: 29.8833,
    longitude: -97.9411,
    source: 'static-seed'
  },
  '70726': {
    zipCode: '70726',
    city: 'Denham Springs',
    county: 'Livingston Parish',
    state: 'Louisiana',
    stateCode: 'LA',
    country: 'United States',
    countryCode: 'US',
    latitude: 30.4735,
    longitude: -90.9568,
    source: 'static-seed'
  }
});

const escapeRegexCharacters = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeZipCode = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().toUpperCase().replace(/\s+/g, '').split('-')[0];
};
const normalizeCountryCode = (value) => {
  const token = normalizeToken(value);
  if (token === 'usa' || token === 'united states') return 'us';
  return token;
};

const geocoder = NodeGeocoder({
  provider: 'openstreetmap',
  formatter: null
});

const toZipIndexShape = (entry = {}) => {
  const zipCode = normalizeZipCode(entry.zipCode || entry.postalCode);
  if (!zipCode) return null;
  const aliases = [...new Set([
    entry.city,
    entry.county,
    entry.state,
    entry.country,
    ...(Array.isArray(entry.aliases) ? entry.aliases : [])
  ].map(normalizeToken).filter(Boolean))];
  return {
    zipCode,
    city: entry.city || null,
    county: entry.county || null,
    state: entry.state || null,
    stateCode: entry.stateCode || null,
    country: entry.country || null,
    countryCode: entry.countryCode || null,
    aliases,
    latitude: Number.isFinite(entry.latitude) ? entry.latitude : null,
    longitude: Number.isFinite(entry.longitude) ? entry.longitude : null,
    source: entry.source || 'seed',
    lastImportedAt: new Date()
  };
};

const toZipIndexShapeFromGeocode = (result = {}, zipCodeHint = '') => {
  if (!result) return null;
  return toZipIndexShape({
    zipCode: zipCodeHint || result.zipcode || result.postalcode || result.postalCode,
    city: result.city || result.town || result.village || result.hamlet || null,
    county: result.county || null,
    state: result.state || null,
    stateCode: result.stateCode || null,
    country: result.country || null,
    countryCode: result.countryCode || null,
    latitude: Number.isFinite(Number(result.latitude)) ? Number(result.latitude) : null,
    longitude: Number.isFinite(Number(result.longitude)) ? Number(result.longitude) : null,
    aliases: [result.administrativeLevels?.level2long, result.administrativeLevels?.level1long].filter(Boolean),
    source: 'geocode-fallback'
  });
};

const findStaticZipLocation = (zipCode) => {
  const normalizedZip = normalizeZipCode(zipCode);
  return normalizedZip ? STATIC_ZIP_LOCATION_INDEX[normalizedZip] || null : null;
};

const findZipLocation = async (zipCode) => {
  const normalizedZip = normalizeZipCode(zipCode);
  if (!normalizedZip) return null;
  if (mongoose.connection?.readyState === 1) {
    const fromDb = await ZipLocationIndex.findOne({ zipCode: normalizedZip }).lean();
    if (fromDb) return fromDb;
  }
  return findStaticZipLocation(normalizedZip);
};

const persistResolvedZipLocation = async (entry) => {
  const shaped = toZipIndexShape(entry);
  if (!shaped) return null;
  await upsertZipLocationIndexEntries([shaped], shaped.source || 'geocode-fallback');
  return shaped;
};

const resolveZipLocation = async (zipCode, { allowGeocode = true, persist = true } = {}) => {
  const normalizedZip = normalizeZipCode(zipCode);
  if (!normalizedZip) return null;

  const existing = await findZipLocation(normalizedZip);
  if (existing) return existing;
  if (!allowGeocode) return null;

  try {
    const results = await geocoder.geocode(`${normalizedZip}, United States`);
    const first = Array.isArray(results) ? results[0] : null;
    const resolved = toZipIndexShapeFromGeocode(first, normalizedZip);
    if (!resolved) return null;
    if (persist) {
      await persistResolvedZipLocation(resolved);
    }
    return resolved;
  } catch (error) {
    return null;
  }
};

const findZipLocationByCityState = async ({ city, state, countryCode } = {}) => {
  const normalizedCity = normalizeToken(city);
  const normalizedState = normalizeToken(state);
  const normalizedCountry = normalizeCountryCode(countryCode);
  if (!normalizedCity || !normalizedState) return null;

  if (mongoose.connection?.readyState === 1) {
    const escapedCity = escapeRegexCharacters(normalizedCity);
    const escapedState = escapeRegexCharacters(normalizedState);
    const cityRegex = new RegExp(`^${escapedCity}$`, 'i');
    const stateRegex = new RegExp(`^${escapedState}$`, 'i');
    const dbEntry = await ZipLocationIndex.findOne({
      city: { $regex: cityRegex },
      $or: [
        { state: stateRegex },
        { stateCode: stateRegex }
      ]
    }).lean();
    if (dbEntry && (!normalizedCountry || normalizeCountryCode(dbEntry.countryCode || dbEntry.country) === normalizedCountry)) {
      return dbEntry;
    }
  }

  return Object.values(STATIC_ZIP_LOCATION_INDEX).find((entry) => {
    if (normalizeToken(entry.city) !== normalizedCity) return false;
    const stateMatches = normalizeToken(entry.state) === normalizedState || normalizeToken(entry.stateCode) === normalizedState;
    if (!stateMatches) return false;
    if (!normalizedCountry) return true;
    return normalizeCountryCode(entry.countryCode || entry.country) === normalizedCountry;
  }) || null;
};

const resolveZipLocationByCityState = async ({ city, state, countryCode } = {}, { allowGeocode = true, persist = true } = {}) => {
  const existing = await findZipLocationByCityState({ city, state, countryCode });
  if (existing) return existing;
  if (!allowGeocode || !city || !state) return null;

  const query = [city, state, countryCode || 'US'].filter(Boolean).join(', ');
  try {
    const results = await geocoder.geocode(query);
    const first = Array.isArray(results) ? results[0] : null;
    const resolved = toZipIndexShapeFromGeocode(first);
    if (!resolved) return null;
    if (persist) {
      await persistResolvedZipLocation(resolved);
    }
    return resolved;
  } catch (error) {
    return null;
  }
};

const upsertZipLocationIndexEntries = async (entries = [], source = 'seed') => {
  if (mongoose.connection?.readyState !== 1 || !Array.isArray(entries) || entries.length === 0) {
    return { upserted: 0 };
  }

  const operations = entries
    .map((entry) => toZipIndexShape({ ...entry, source }))
    .filter(Boolean)
    .map((entry) => ({
      updateOne: {
        filter: { zipCode: entry.zipCode },
        update: { $set: entry },
        upsert: true
      }
    }));

  if (operations.length === 0) return { upserted: 0 };
  const result = await ZipLocationIndex.bulkWrite(operations, { ordered: false });
  return { upserted: result.upsertedCount || 0, modified: result.modifiedCount || 0 };
};

const importZipLocationIndexFromFile = async (filePath) => {
  const absolutePath = path.resolve(filePath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed) ? parsed : [];
  return upsertZipLocationIndexEntries(entries, path.basename(absolutePath));
};

module.exports = {
  findZipLocation,
  findZipLocationByCityState,
  resolveZipLocation,
  resolveZipLocationByCityState,
  importZipLocationIndexFromFile,
  upsertZipLocationIndexEntries,
  STATIC_ZIP_LOCATION_INDEX
};
