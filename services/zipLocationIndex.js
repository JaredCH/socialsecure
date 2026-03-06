const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
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
    source: 'static-seed'
  }
});

const escapeRegexCharacters = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeZipCode = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().toUpperCase().replace(/\s+/g, '').split('-')[0];
};
const normalizeToken = (value) => String(value || '').trim().toLowerCase();
const normalizeCountryCode = (value) => {
  const token = normalizeToken(value);
  if (token === 'usa' || token === 'united states') return 'us';
  return token;
};

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
  importZipLocationIndexFromFile,
  upsertZipLocationIndexEntries,
  STATIC_ZIP_LOCATION_INDEX
};
