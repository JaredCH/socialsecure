const User = require('../models/User');
const NewsLocation = require('../models/NewsLocation');
const { canonicalizeNewsLocation } = require('../utils/newsLocationTaxonomy');
const { resolveZipLocation, resolveZipLocationByCityState } = require('./zipLocationIndex');
const normalizeToken = require('../utils/normalizeToken');

const buildCanonicalName = (canonical = {}) => {
  const parts = [
    canonical.city,
    canonical.stateCode || canonical.state,
    canonical.countryCode || canonical.country
  ].filter(Boolean);
  if (parts.length === 0 && canonical.zipCode) {
    return [canonical.zipCode, canonical.countryCode || canonical.country].filter(Boolean).join(', ');
  }
  return parts.join(', ');
};

const buildLocationKey = (canonical = {}) => {
  if (canonical.cityKey) {
    return canonical.cityKey;
  }
  if (canonical.zipCode) {
    return `ZIP:${canonical.zipCode}`;
  }
  const stateToken = canonical.stateCode || normalizeToken(canonical.state).toUpperCase();
  const countryToken = canonical.countryCode || normalizeToken(canonical.country).toUpperCase();
  if (stateToken && countryToken) {
    return `STATE:${countryToken}:${stateToken}`;
  }
  // Country-only data is too broad for a valid master location key
  // Return null to indicate insufficient granularity
  return null;
};

const buildAliasSet = (canonical = {}, original = {}) => {
  const aliases = new Set();
  const maybeAdd = (value) => {
    const normalized = normalizeToken(value);
    if (normalized) aliases.add(normalized);
  };

  maybeAdd(original.city);
  maybeAdd(original.state);
  maybeAdd(original.country);
  maybeAdd(original.county);
  maybeAdd(original.zipCode);
  maybeAdd(canonical.city);
  maybeAdd(canonical.state);
  maybeAdd(canonical.stateCode);
  maybeAdd(canonical.country);
  maybeAdd(canonical.countryCode);
  maybeAdd(canonical.county);
  maybeAdd(canonical.zipCode);

  return [...aliases];
};

const canonicalizeLocationInput = (raw = {}) => {
  const canonical = canonicalizeNewsLocation({
    city: normalizeToken(raw.city),
    state: normalizeToken(raw.state),
    country: normalizeToken(raw.country || raw.countryCode),
    county: normalizeToken(raw.county),
    zipCode: normalizeToken(raw.zipCode)
  });

  const locationKey = buildLocationKey(canonical);
  if (!locationKey) {
    return null;
  }

  return {
    canonical,
    locationKey,
    canonicalName: buildCanonicalName(canonical),
    aliases: buildAliasSet(canonical, raw)
  };
};

const resolveCanonicalLocationInput = async (raw = {}, options = {}) => {
  const normalizedRaw = {
    city: normalizeToken(raw.city),
    state: normalizeToken(raw.state || raw.stateCode),
    country: normalizeToken(raw.country || raw.countryCode),
    county: normalizeToken(raw.county),
    zipCode: normalizeToken(raw.zipCode)
  };

  let canonical = canonicalizeNewsLocation(normalizedRaw);
  let resolvedZipLocation = null;

  const needsZipBackfill = Boolean(canonical.zipCode) && (!canonical.city || !canonical.stateCode || !canonical.countryCode || !canonical.county);
  if (needsZipBackfill) {
    resolvedZipLocation = await resolveZipLocation(canonical.zipCode, options);
  }

  const canResolveByCityState = !resolvedZipLocation && canonical.city && (canonical.stateCode || canonical.state);
  const needsCityStateBackfill = canResolveByCityState && (!canonical.zipCode || !canonical.countryCode || !canonical.county);
  if (needsCityStateBackfill) {
    resolvedZipLocation = await resolveZipLocationByCityState({
      city: canonical.city,
      state: canonical.stateCode || canonical.state,
      countryCode: canonical.countryCode || canonical.country
    }, options);
  }

  if (resolvedZipLocation) {
    canonical = canonicalizeNewsLocation({
      city: normalizedRaw.city || resolvedZipLocation.city,
      state: normalizedRaw.state || resolvedZipLocation.stateCode || resolvedZipLocation.state,
      country: normalizedRaw.country || resolvedZipLocation.countryCode || resolvedZipLocation.country,
      county: normalizedRaw.county || resolvedZipLocation.county,
      zipCode: normalizedRaw.zipCode || resolvedZipLocation.zipCode
    });
  }

  const locationKey = buildLocationKey(canonical);
  if (!locationKey) {
    return null;
  }

  return {
    canonical,
    locationKey,
    canonicalName: buildCanonicalName(canonical),
    aliases: buildAliasSet(canonical, { ...raw, ...(resolvedZipLocation || {}) }),
    coordinates: resolvedZipLocation && Number.isFinite(Number(resolvedZipLocation.latitude)) && Number.isFinite(Number(resolvedZipLocation.longitude))
      ? { lat: Number(resolvedZipLocation.latitude), lon: Number(resolvedZipLocation.longitude) }
      : null,
    resolvedZipLocation
  };
};

const upsertMasterLocationFromUser = async ({ userId, location = {}, coordinates = null, queueOnDemand = false }) => {
  const normalized = await resolveCanonicalLocationInput(location);
  if (!normalized) {
    return null;
  }

  const now = new Date();
  const pipeline = [
    {
      $set: {
        locationKey: normalized.locationKey,
        canonicalName: normalized.canonicalName,
        canonicalCity: normalized.canonical.city || null,
        canonicalState: normalized.canonical.state || null,
        canonicalStateCode: normalized.canonical.stateCode || null,
        canonicalCountry: normalized.canonical.country || null,
        canonicalCountryCode: normalized.canonical.countryCode || null,
        canonicalCounty: normalized.canonical.county || null,
        canonicalZipCode: normalized.canonical.zipCode || null,
        aliases: {
          $setUnion: [
            { $ifNull: ['$aliases', []] },
            normalized.aliases
          ]
        },
        isActive: true
      }
    }
  ];

  const effectiveCoordinates = coordinates && Number.isFinite(Number(coordinates.lat)) && Number.isFinite(Number(coordinates.lon))
    ? { lat: Number(coordinates.lat), lon: Number(coordinates.lon) }
    : normalized.coordinates;

  if (effectiveCoordinates && Number.isFinite(Number(effectiveCoordinates.lat)) && Number.isFinite(Number(effectiveCoordinates.lon))) {
    pipeline.push({
      $set: {
        coordinates: {
          lat: Number(effectiveCoordinates.lat),
          lon: Number(effectiveCoordinates.lon)
        }
      }
    });
  }

  if (userId) {
    pipeline.push({
      $set: {
        userIds: {
          $setUnion: [
            { $ifNull: ['$userIds', []] },
            [userId]
          ]
        }
      }
    });
    pipeline.push({
      $set: {
        userCount: { $size: { $ifNull: ['$userIds', []] } }
      }
    });
  }

  if (queueOnDemand) {
    pipeline.push({
      $set: {
        onDemandRequestedAt: now,
        onDemandStatus: 'queued'
      }
    });
  }

  const updated = await NewsLocation.findOneAndUpdate(
    { locationKey: normalized.locationKey },
    pipeline,
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  return updated;
};

const syncMasterLocationsFromUsers = async ({ limit = 2000 } = {}) => {
  const users = await User.find({
    registrationStatus: 'active',
    $or: [
      { city: { $exists: true, $ne: '' } },
      { state: { $exists: true, $ne: '' } },
      { zipCode: { $exists: true, $ne: '' } }
    ]
  })
    .select('_id city state country county zipCode location')
    .limit(limit)
    .lean();

  const upsertResults = await Promise.all(
    users.map((user) => {
      const coordinates = Array.isArray(user.location?.coordinates)
        ? { lon: user.location.coordinates[0], lat: user.location.coordinates[1] }
        : null;
      return upsertMasterLocationFromUser({
        userId: user._id,
        location: {
          city: user.city,
          state: user.state,
          country: user.country,
          county: user.county,
          zipCode: user.zipCode
        },
        coordinates,
        queueOnDemand: false
      });
    })
  );
  const touched = upsertResults.filter(Boolean).length;

  return {
    usersScanned: users.length,
    locationsTouched: touched
  };
};

module.exports = {
  canonicalizeLocationInput,
  resolveCanonicalLocationInput,
  upsertMasterLocationFromUser,
  syncMasterLocationsFromUsers,
  buildLocationKey,
  buildCanonicalName,
  buildAliasSet
};
