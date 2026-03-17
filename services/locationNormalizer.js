'use strict';

const { resolveZipLocation } = require('./zipLocationIndex');
const {
  canonicalizeCountryCode,
  canonicalizeStateCode,
  US_STATES_AND_TERRITORIES
} = require('../utils/newsLocationTaxonomy');

const STATE_CODE_TO_NAME = new Map(US_STATES_AND_TERRITORIES.map((entry) => [entry.code, entry.name]));

function slugifyToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function normalizeCountry(value) {
  return (canonicalizeCountryCode(value) || 'US').toLowerCase();
}

function buildLocationKey(normalizedLocation = {}) {
  const city = slugifyToken(normalizedLocation.city);
  const state = slugifyToken(normalizedLocation.state);
  const country = slugifyToken(normalizedLocation.country || 'us');
  return [city, state, country].filter(Boolean).join('_');
}

function parseLocationKey(locationKey = '') {
  const normalizedKey = String(locationKey || '').trim().toLowerCase();
  if (!normalizedKey) return null;

  const parts = normalizedKey.split('_').filter(Boolean);
  if (parts.length < 3) return null;

  const country = parts.pop();
  const state = parts.pop();
  const city = parts.join('_');
  const stateFull = String(STATE_CODE_TO_NAME.get(state.toUpperCase()) || state).toLowerCase();

  return {
    locationKey: normalizedKey,
    city,
    state,
    stateFull: slugifyToken(stateFull),
    country
  };
}

function coerceLocationInput(input) {
  if (input && typeof input === 'object') return { ...input };

  const raw = String(input || '').trim();
  if (!raw) return {};
  if (/^\d{5}(?:-\d{4})?$/.test(raw)) return { zipCode: raw };

  const parts = raw.split(',').map((segment) => segment.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { city: parts[0], state: parts[1], country: parts[2] || 'US' };
  }

  return { city: raw };
}

async function normalizeLocationInput(input = {}) {
  const raw = coerceLocationInput(input);
  const zipCode = String(raw.zip || raw.zipCode || '').trim();

  let city = raw.city || null;
  let stateInput = raw.stateCode || raw.state || null;
  let countryInput = raw.countryCode || raw.country || 'US';

  if (zipCode) {
    const resolved = await resolveZipLocation(zipCode, { allowGeocode: true, persist: true });
    if (resolved) {
      city = city || resolved.city;
      stateInput = stateInput || resolved.stateCode || resolved.state;
      countryInput = countryInput || resolved.countryCode || resolved.country;
    }
  }

  const stateCode = canonicalizeStateCode(stateInput);
  const stateFull = STATE_CODE_TO_NAME.get(stateCode) || String(stateInput || '').trim();
  const normalized = {
    city: slugifyToken(city),
    state: slugifyToken(stateCode || stateInput),
    stateFull: slugifyToken(stateFull),
    country: normalizeCountry(countryInput)
  };

  if (!normalized.city && zipCode) {
    normalized.city = slugifyToken(zipCode);
  }

  normalized.locationKey = buildLocationKey(normalized);
  return normalized;
}

async function resolvePrimaryLocation(preferencesLocation = null, userProfile = null) {
  const primaryInput = preferencesLocation || userProfile || {};
  const normalized = await normalizeLocationInput(primaryInput);
  if (normalized.locationKey) return normalized;
  return null;
}

module.exports = {
  buildLocationKey,
  coerceLocationInput,
  normalizeLocationInput,
  parseLocationKey,
  resolvePrimaryLocation,
  slugifyToken,
  STATE_CODE_TO_NAME
};
