/**
 * Admin API Routes
 *
 * Provides a secured, key-authenticated surface for remote database inspection
 * and targeted data migration on the live Railway deployment.
 *
 * Security model:
 *  - All endpoints require the `X-Admin-API-Key` header whose value must match
 *    the `ADMIN_SECRET` environment variable exactly (constant-time comparison).
 *  - If `ADMIN_SECRET` is not set the server returns 503 so the API is never
 *    accidentally open in a misconfigured environment.
 *  - Password / encryption-password hashes are NEVER included in any response.
 *  - Write endpoints use a strict field whitelist; raw MongoDB operators in
 *    request bodies are rejected.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/User');
const NewsPreferences = require('../models/NewsPreferences');
const NewsLocation = require('../models/NewsLocation');
const ZipLocationIndex = require('../models/ZipLocationIndex');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fields that are safe to include in user responses (no credential material).
 */
const USER_SAFE_FIELDS = [
  '_id', 'universalId', 'realName', 'username', 'email', 'phone', 'bio',
  'avatarUrl', 'bannerUrl', 'links', 'profileTheme', 'socialPagePreferences',
  'country', 'city', 'state', 'county', 'zipCode', 'streetAddress',
  'location', 'worksAt', 'hobbies', 'ageGroup', 'sex', 'race',
  'registrationStatus', 'isAdmin', 'onboardingStatus', 'onboardingStep',
  'mustResetPassword', 'encryptionPasswordVersion', 'encryptionPasswordSetAt',
  'stripImageMetadataOnUpload', 'profileFieldVisibility',
  'createdAt', 'updatedAt',
].join(' ');

/**
 * Fields that admin may directly write on a User document.
 * Excludes anything credential-related or system-integrity-critical.
 */
const USER_PATCHABLE_FIELDS = new Set([
  'zipCode', 'city', 'state', 'country', 'county',
  'streetAddress', 'location',
]);

/**
 * Fields that admin may directly write on a NewsPreferences document.
 */
const NEWS_PREFS_PATCHABLE_FIELDS = new Set([
  'weatherLocations', 'followedSportsTeams', 'locations',
  'defaultScope', 'localPriorityEnabled', 'googleNewsEnabled',
  'gdletEnabled', 'refreshInterval',
]);

/**
 * Fields that admin may directly write on a NewsLocation document.
 */
const NEWS_LOCATION_PATCHABLE_FIELDS = new Set([
  'coordinates', 'canonicalName', 'canonicalCity', 'canonicalState',
  'canonicalStateCode', 'canonicalCountry', 'canonicalCountryCode',
  'canonicalCounty', 'canonicalZipCode', 'geoIdentifier', 'aliases',
]);

/** San Marcos, TX – the canonical fallback for ZIP 78666. */
const ZIP_78666_FALLBACK = {
  zipCode: '78666',
  city: 'San Marcos',
  county: 'Hays County',
  state: 'Texas',
  stateCode: 'TX',
  country: 'United States',
  countryCode: 'US',
  latitude: 29.8833,
  longitude: -97.9414,
  timezone: 'America/Chicago',
};

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------

/**
 * Requires `X-Admin-API-Key` to match `process.env.ADMIN_SECRET`.
 * Uses a constant-time comparison to prevent timing-oracle attacks.
 */
function requireAdminApiKey(req, res, next) {
  const secret = process.env.ADMIN_SECRET;

  // Fail closed: if ADMIN_SECRET is not configured the endpoint is unavailable.
  if (!secret || secret.trim() === '') {
    return res.status(503).json({
      error: 'Admin API is not configured on this server (ADMIN_SECRET missing)',
    });
  }

  const provided = req.headers['x-admin-api-key'];
  if (typeof provided !== 'string' || provided.length === 0) {
    return res.status(401).json({ error: 'Missing X-Admin-API-Key header' });
  }

  // Pad to equal length before comparison to avoid length-based timing leaks.
  const secretBuf = Buffer.from(secret);
  const providedBuf = Buffer.alloc(secretBuf.length);
  providedBuf.write(provided.slice(0, secretBuf.length));

  let equal = false;
  try {
    equal = crypto.timingSafeEqual(secretBuf, providedBuf);
  } catch {
    equal = false;
  }

  // Also verify length equality after constant-time check (prevents length oracle).
  if (!equal || provided.length !== secret.length) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  return next();
}

/**
 * Rejects any value that is a plain object whose keys start with `$` or `.`,
 * which would indicate an attempted MongoDB operator injection.
 */
function containsMongoOperator(value) {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsMongoOperator);
  return Object.keys(value).some(
    (k) => k.startsWith('$') || k.startsWith('.') || containsMongoOperator(value[k]),
  );
}

function rejectMongoOperators(obj) {
  if (containsMongoOperator(obj)) {
    throw Object.assign(new Error('Request body contains prohibited MongoDB operators'), { status: 400 });
  }
}

// Apply auth middleware to every route in this router.
router.use(requireAdminApiKey);

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/health
 * Confirms the admin API is reachable and authenticated.
 */
router.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Users – read
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/users
 * Returns all user records with safe fields only.
 */
router.get('/users', async (_req, res) => {
  try {
    const users = await User.find({}).select(USER_SAFE_FIELDS).lean();
    res.json({ count: users.length, users });
  } catch (err) {
    console.error('[admin] GET /users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /api/admin/users/:username
 * Returns a single user record (safe fields).
 */
router.get('/users/:username', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim().toLowerCase();
    if (!username) return res.status(400).json({ error: 'username is required' });

    const user = await User.findOne({ username }).select(USER_SAFE_FIELDS).lean();
    if (!user) return res.status(404).json({ error: `User '${username}' not found` });

    res.json({ user });
  } catch (err) {
    console.error('[admin] GET /users/:username error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ---------------------------------------------------------------------------
// Users – write
// ---------------------------------------------------------------------------

/**
 * PATCH /api/admin/users/:username
 * Applies a whitelisted partial update to a user document.
 *
 * Body fields (all optional):
 *   zipCode, city, state, country, county, streetAddress,
 *   location: { coordinates: [lon, lat] }
 */
router.patch('/users/:username', async (req, res) => {
  try {
    rejectMongoOperators(req.body);

    const username = String(req.params.username || '').trim().toLowerCase();
    if (!username) return res.status(400).json({ error: 'username is required' });

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: `User '${username}' not found` });

    const updates = {};

    for (const field of USER_PATCHABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        if (field === 'location') {
          // Only allow updating GeoJSON coordinates sub-field.
          const loc = req.body.location;
          if (loc && Array.isArray(loc.coordinates) && loc.coordinates.length === 2) {
            const [lon, lat] = loc.coordinates;
            if (typeof lon === 'number' && typeof lat === 'number') {
              updates['location.coordinates'] = [lon, lat];
            } else {
              return res.status(400).json({ error: 'location.coordinates must be [number, number]' });
            }
          }
        } else {
          const val = req.body[field];
          if (val !== undefined) updates[field] = val;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No patchable fields supplied' });
    }

    await User.updateOne({ username }, { $set: updates });

    const updated = await User.findOne({ username }).select(USER_SAFE_FIELDS).lean();
    res.json({ ok: true, user: updated });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[admin] PATCH /users/:username error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ---------------------------------------------------------------------------
// News preferences – read
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/news-preferences/:username
 * Returns the NewsPreferences document for the given user.
 */
router.get('/news-preferences/:username', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim().toLowerCase();
    if (!username) return res.status(400).json({ error: 'username is required' });

    const user = await User.findOne({ username }).select('_id username').lean();
    if (!user) return res.status(404).json({ error: `User '${username}' not found` });

    const prefs = await NewsPreferences.findOne({ user: user._id }).lean();
    res.json({ user: { _id: user._id, username: user.username }, preferences: prefs || null });
  } catch (err) {
    console.error('[admin] GET /news-preferences/:username error:', err);
    res.status(500).json({ error: 'Failed to fetch news preferences' });
  }
});

// ---------------------------------------------------------------------------
// News preferences – write
// ---------------------------------------------------------------------------

/**
 * PATCH /api/admin/news-preferences/:username
 * Applies a whitelisted partial update to a user's NewsPreferences document.
 * Creates the document if it does not exist.
 */
router.patch('/news-preferences/:username', async (req, res) => {
  try {
    rejectMongoOperators(req.body);

    const username = String(req.params.username || '').trim().toLowerCase();
    if (!username) return res.status(400).json({ error: 'username is required' });

    const user = await User.findOne({ username }).select('_id').lean();
    if (!user) return res.status(404).json({ error: `User '${username}' not found` });

    const updates = {};
    for (const field of NEWS_PREFS_PATCHABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No patchable fields supplied' });
    }

    const prefs = await NewsPreferences.findOneAndUpdate(
      { user: user._id },
      { $set: updates },
      { new: true, upsert: true },
    ).lean();

    res.json({ ok: true, preferences: prefs });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[admin] PATCH /news-preferences/:username error:', err);
    res.status(500).json({ error: 'Failed to update news preferences' });
  }
});

// ---------------------------------------------------------------------------
// NewsLocation – read
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/news-location/:locationKey
 * Returns a single NewsLocation master record.
 * The colon separator in keys like "ZIP:78666" should be URL-encoded as "ZIP%3A78666".
 */
router.get('/news-location/:locationKey', async (req, res) => {
  try {
    const locationKey = decodeURIComponent(String(req.params.locationKey || '').trim());
    if (!locationKey) return res.status(400).json({ error: 'locationKey is required' });

    const record = await NewsLocation.findOne({ locationKey }).lean();
    if (!record) return res.status(404).json({ error: `NewsLocation '${locationKey}' not found` });

    res.json({ newsLocation: record });
  } catch (err) {
    console.error('[admin] GET /news-location/:locationKey error:', err);
    res.status(500).json({ error: 'Failed to fetch news location' });
  }
});

// ---------------------------------------------------------------------------
// NewsLocation – write
// ---------------------------------------------------------------------------

/**
 * PATCH /api/admin/news-location/:locationKey
 * Updates editable fields on a NewsLocation master record.
 *
 * To update coordinates supply:
 *   { coordinates: { lat: <number>, lon: <number> } }
 */
router.patch('/news-location/:locationKey', async (req, res) => {
  try {
    rejectMongoOperators(req.body);

    const locationKey = decodeURIComponent(String(req.params.locationKey || '').trim());
    if (!locationKey) return res.status(400).json({ error: 'locationKey is required' });

    const record = await NewsLocation.findOne({ locationKey });
    if (!record) return res.status(404).json({ error: `NewsLocation '${locationKey}' not found` });

    const updates = {};
    for (const field of NEWS_LOCATION_PATCHABLE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;

      if (field === 'coordinates') {
        const coords = req.body.coordinates;
        if (coords && typeof coords.lat === 'number' && typeof coords.lon === 'number') {
          updates['coordinates.lat'] = coords.lat;
          updates['coordinates.lon'] = coords.lon;
        } else {
          return res.status(400).json({ error: 'coordinates must be { lat: number, lon: number }' });
        }
      } else {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No patchable fields supplied' });
    }

    await NewsLocation.updateOne({ locationKey }, { $set: updates });
    const updated = await NewsLocation.findOne({ locationKey }).lean();

    res.json({ ok: true, newsLocation: updated });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[admin] PATCH /news-location/:locationKey error:', err);
    res.status(500).json({ error: 'Failed to update news location' });
  }
});

// ---------------------------------------------------------------------------
// ZipLocationIndex – read
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/zip-location/:zipCode
 * Returns the ZipLocationIndex record for a ZIP code.
 */
router.get('/zip-location/:zipCode', async (req, res) => {
  try {
    const zipCode = String(req.params.zipCode || '').trim().toUpperCase();
    if (!zipCode) return res.status(400).json({ error: 'zipCode is required' });

    const record = await ZipLocationIndex.findOne({ zipCode }).lean();
    if (!record) return res.status(404).json({ error: `No ZipLocationIndex record for '${zipCode}'` });

    res.json({ zipLocation: record });
  } catch (err) {
    console.error('[admin] GET /zip-location/:zipCode error:', err);
    res.status(500).json({ error: 'Failed to fetch zip location' });
  }
});

// ---------------------------------------------------------------------------
// Migration: admin account preferences
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/migrate/admin-preferences
 *
 * Idempotent migration that brings the universal ADMIN account into alignment
 * with the current schema expectations for:
 *
 *  1. User location coordinates (GeoJSON) for ZIP 78666 (San Marcos, TX)
 *  2. NewsPreferences.weatherLocations – primary entry with resolved lat/lon
 *  3. NewsPreferences.locations – primary entry with canonical cityKey
 *  4. NewsPreferences.followedSportsTeams – normalised to array of lowercase
 *     string IDs (migrates any legacy object entries)
 *  5. NewsLocation record for the ZIP:78666 key – coordinates backfilled if
 *     lat/lon are null
 *
 * All changes are only applied where the current value is absent or incorrect;
 * this migration is safe to run multiple times.
 */
router.post('/migrate/admin-preferences', async (req, res) => {
  const ADMIN_USERNAME = 'admin';
  const TARGET_ZIP = '78666';

  const report = {
    userLocationUpdated: false,
    newsPreferencesWeatherUpdated: false,
    newsPreferencesLocationsUpdated: false,
    newsPreferencesSportsTeamsNormalized: false,
    newsLocationCoordinatesBackfilled: false,
    details: [],
  };

  try {
    // ------------------------------------------------------------------
    // 1. Resolve canonical data for ZIP 78666
    // ------------------------------------------------------------------
    let zipData = await ZipLocationIndex.findOne({ zipCode: TARGET_ZIP }).lean();
    if (!zipData) {
      report.details.push(`ZipLocationIndex has no record for ${TARGET_ZIP}; using hardcoded San Marcos, TX fallback`);
      zipData = ZIP_78666_FALLBACK;
    } else {
      report.details.push(`ZipLocationIndex record found for ${TARGET_ZIP}: ${zipData.city}, ${zipData.stateCode}`);
    }

    const canonicalLat = zipData.latitude || ZIP_78666_FALLBACK.latitude;
    const canonicalLon = zipData.longitude || ZIP_78666_FALLBACK.longitude;
    const canonicalCity = zipData.city || ZIP_78666_FALLBACK.city;
    const canonicalState = zipData.state || ZIP_78666_FALLBACK.state;
    const canonicalStateCode = zipData.stateCode || ZIP_78666_FALLBACK.stateCode;
    const canonicalCountry = zipData.country || ZIP_78666_FALLBACK.country;
    const canonicalCountryCode = zipData.countryCode || ZIP_78666_FALLBACK.countryCode;
    const canonicalCounty = zipData.county || ZIP_78666_FALLBACK.county;

    // ------------------------------------------------------------------
    // 2. Locate the admin user
    // ------------------------------------------------------------------
    const adminUser = await User.findOne({ username: ADMIN_USERNAME });
    if (!adminUser) {
      return res.status(404).json({ error: 'Admin user not found', report });
    }

    // ------------------------------------------------------------------
    // 3. Update user location fields
    // ------------------------------------------------------------------
    const userUpdates = {};

    if (adminUser.zipCode !== TARGET_ZIP) {
      userUpdates.zipCode = TARGET_ZIP;
    }
    if (adminUser.city !== canonicalCity) {
      userUpdates.city = canonicalCity;
    }
    if (adminUser.state !== canonicalState) {
      userUpdates.state = canonicalState;
    }
    if (adminUser.country !== canonicalCountry) {
      userUpdates.country = canonicalCountry;
    }
    if (adminUser.county !== canonicalCounty) {
      userUpdates.county = canonicalCounty;
    }

    // GeoJSON stores [longitude, latitude]
    const existingCoords = adminUser.location && adminUser.location.coordinates;
    const needsCoordsUpdate =
      !existingCoords ||
      existingCoords.length !== 2 ||
      existingCoords[0] !== canonicalLon ||
      existingCoords[1] !== canonicalLat;

    if (needsCoordsUpdate) {
      userUpdates['location.type'] = 'Point';
      userUpdates['location.coordinates'] = [canonicalLon, canonicalLat];
    }

    if (Object.keys(userUpdates).length > 0) {
      await User.updateOne({ username: ADMIN_USERNAME }, { $set: userUpdates });
      report.userLocationUpdated = true;
      report.details.push(`User location updated: ${JSON.stringify(userUpdates)}`);
    } else {
      report.details.push('User location fields already correct – no update needed');
    }

    // ------------------------------------------------------------------
    // 4. NewsPreferences – get or create
    // ------------------------------------------------------------------
    let prefs = await NewsPreferences.findOne({ user: adminUser._id });
    if (!prefs) {
      prefs = await NewsPreferences.create({ user: adminUser._id });
      report.details.push('NewsPreferences document created for admin');
    }

    // ------------------------------------------------------------------
    // 5. Weather locations – ensure primary entry for ZIP 78666
    // ------------------------------------------------------------------
    const weatherLocations = prefs.weatherLocations ? [...prefs.weatherLocations] : [];

    const existingWeatherIdx = weatherLocations.findIndex(
      (w) => w.zipCode === TARGET_ZIP,
    );

    const correctWeatherEntry = {
      label: `${canonicalCity}, ${canonicalStateCode}`,
      city: canonicalCity,
      state: canonicalState,
      country: canonicalCountry,
      countryCode: canonicalCountryCode,
      zipCode: TARGET_ZIP,
      lat: canonicalLat,
      lon: canonicalLon,
      timezone: ZIP_78666_FALLBACK.timezone,
      isPrimary: true,
    };

    let weatherNeedsUpdate = false;

    if (existingWeatherIdx === -1) {
      // Demote any other primary entries before inserting ours.
      weatherLocations.forEach((w, i) => {
        if (w.isPrimary) {
          weatherLocations[i] = { ...w.toObject ? w.toObject() : w, isPrimary: false };
        }
      });
      weatherLocations.unshift(correctWeatherEntry);
      weatherNeedsUpdate = true;
      report.details.push('Weather location for ZIP 78666 inserted as primary');
    } else {
      const existing = weatherLocations[existingWeatherIdx];
      const hasMissingCoords = existing.lat == null || existing.lon == null;
      const hasWrongPrimary = !existing.isPrimary;

      if (hasMissingCoords || hasWrongPrimary) {
        weatherLocations[existingWeatherIdx] = {
          ...(existing.toObject ? existing.toObject() : existing),
          ...correctWeatherEntry,
        };
        weatherNeedsUpdate = true;
        report.details.push('Weather location for ZIP 78666 updated (fixed coords/primary flag)');
      } else {
        report.details.push('Weather location for ZIP 78666 already correct');
      }
    }

    // ------------------------------------------------------------------
    // 6. News locations – ensure primary entry with canonical cityKey
    // ------------------------------------------------------------------
    const cityKey = `ZIP:${TARGET_ZIP}`;
    const newsLocations = prefs.locations ? [...prefs.locations] : [];

    const existingNewsLocIdx = newsLocations.findIndex(
      (l) => l.cityKey === cityKey || l.zipCode === TARGET_ZIP,
    );

    const correctNewsLocEntry = {
      city: canonicalCity,
      zipCode: TARGET_ZIP,
      county: canonicalCounty,
      state: canonicalState,
      stateCode: canonicalStateCode,
      country: canonicalCountry,
      countryCode: canonicalCountryCode,
      cityKey,
      isPrimary: true,
    };

    let newsLocsNeedUpdate = false;

    if (existingNewsLocIdx === -1) {
      newsLocations.forEach((l, i) => {
        if (l.isPrimary) {
          newsLocations[i] = { ...l.toObject ? l.toObject() : l, isPrimary: false };
        }
      });
      newsLocations.unshift(correctNewsLocEntry);
      newsLocsNeedUpdate = true;
      report.details.push('News location entry for ZIP 78666 inserted as primary');
    } else {
      const existing = newsLocations[existingNewsLocIdx];
      if (!existing.cityKey || !existing.isPrimary) {
        newsLocations[existingNewsLocIdx] = {
          ...(existing.toObject ? existing.toObject() : existing),
          ...correctNewsLocEntry,
        };
        newsLocsNeedUpdate = true;
        report.details.push('News location entry for ZIP 78666 updated (fixed cityKey/primary)');
      } else {
        report.details.push('News location entry for ZIP 78666 already correct');
      }
    }

    // ------------------------------------------------------------------
    // 7. Sports teams – normalise to array of lowercase string IDs
    // ------------------------------------------------------------------
    const rawTeams = prefs.followedSportsTeams || [];
    const normalizedTeams = rawTeams.map((entry) => {
      if (typeof entry === 'string') return entry.toLowerCase().trim();
      // Legacy object form: { teamId, id, _id, name, ... }
      const id = entry.teamId || entry.id || String(entry._id || '');
      return id.toLowerCase().trim();
    }).filter(Boolean);

    const teamsChanged =
      normalizedTeams.length !== rawTeams.length ||
      normalizedTeams.some((t, i) => t !== rawTeams[i]);

    // ------------------------------------------------------------------
    // 8. Persist NewsPreferences changes if any
    // ------------------------------------------------------------------
    const prefsUpdates = {};
    if (weatherNeedsUpdate) prefsUpdates.weatherLocations = weatherLocations;
    if (newsLocsNeedUpdate) prefsUpdates.locations = newsLocations;
    if (teamsChanged) prefsUpdates.followedSportsTeams = normalizedTeams;

    if (Object.keys(prefsUpdates).length > 0) {
      await NewsPreferences.updateOne({ user: adminUser._id }, { $set: prefsUpdates });
      if (weatherNeedsUpdate) report.newsPreferencesWeatherUpdated = true;
      if (newsLocsNeedUpdate) report.newsPreferencesLocationsUpdated = true;
      if (teamsChanged) {
        report.newsPreferencesSportsTeamsNormalized = true;
        report.details.push(`Sports teams normalised: ${normalizedTeams.join(', ') || '(none)'}`);
      }
    } else {
      report.details.push('NewsPreferences already up-to-date – no update needed');
    }

    // ------------------------------------------------------------------
    // 9. NewsLocation master record – backfill coordinates if missing
    // ------------------------------------------------------------------
    const newsLocationRecord = await NewsLocation.findOne({ locationKey: cityKey });
    if (newsLocationRecord) {
      if (newsLocationRecord.coordinates.lat == null || newsLocationRecord.coordinates.lon == null) {
        await NewsLocation.updateOne(
          { locationKey: cityKey },
          {
            $set: {
              'coordinates.lat': canonicalLat,
              'coordinates.lon': canonicalLon,
              canonicalZipCode: TARGET_ZIP,
              canonicalCity,
              canonicalState,
              canonicalStateCode,
              canonicalCountry,
              canonicalCountryCode,
            },
          },
        );
        report.newsLocationCoordinatesBackfilled = true;
        report.details.push(`NewsLocation '${cityKey}' coordinates backfilled`);
      } else {
        report.details.push(`NewsLocation '${cityKey}' coordinates already present`);
      }
    } else {
      report.details.push(`NewsLocation record for '${cityKey}' not found in master table (will be created on next poll)`);
    }

    // ------------------------------------------------------------------
    // Done
    // ------------------------------------------------------------------
    return res.json({ ok: true, report });
  } catch (err) {
    console.error('[admin] POST /migrate/admin-preferences error:', err);
    return res.status(500).json({ error: 'Migration failed', message: err.message, report });
  }
});

// ---------------------------------------------------------------------------
// Migration: dry-run inspection
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/migrate/admin-preferences/preview
 * Returns current state of the admin account data without making any changes.
 * Useful for pre-flight inspection before running the migration.
 */
router.get('/migrate/admin-preferences/preview', async (_req, res) => {
  const ADMIN_USERNAME = 'admin';
  const TARGET_ZIP = '78666';

  try {
    const adminUser = await User.findOne({ username: ADMIN_USERNAME })
      .select(USER_SAFE_FIELDS)
      .lean();
    if (!adminUser) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    const prefs = await NewsPreferences.findOne({ user: adminUser._id }).lean();
    const zipRecord = await ZipLocationIndex.findOne({ zipCode: TARGET_ZIP }).lean();
    const newsLocationRecord = await NewsLocation.findOne({ locationKey: `ZIP:${TARGET_ZIP}` }).lean();

    res.json({
      adminUser,
      newsPreferences: prefs || null,
      zipLocationIndex: zipRecord || null,
      newsLocationMaster: newsLocationRecord || null,
    });
  } catch (err) {
    console.error('[admin] GET /migrate/admin-preferences/preview error:', err);
    res.status(500).json({ error: 'Preview failed' });
  }
});

module.exports = router;
