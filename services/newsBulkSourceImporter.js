'use strict';

/**
 * News Bulk Source Importer
 *
 * Handles ingestion of news feed sources from a CSV or JSON payload.
 * Used by the admin bulk-import endpoint.
 *
 * Expected CSV columns (in order):
 *   network, station, city, state, feed_url, type, affiliate, market
 *
 * Feed type mapping:
 *   wire      → RssSource.type = 'wire',       scope = 'wire'
 *   national  → RssSource.type = 'national_tv', scope = 'national'
 *   local_tv  → RssSource.type = 'local_tv',    scope = 'local'
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const RssSource = require('../models/RssSource');

const STATE_NAME_TO_CODE = new Map([
  ['alabama','AL'],['alaska','AK'],['arizona','AZ'],['arkansas','AR'],['california','CA'],
  ['colorado','CO'],['connecticut','CT'],['delaware','DE'],['florida','FL'],['georgia','GA'],
  ['hawaii','HI'],['idaho','ID'],['illinois','IL'],['indiana','IN'],['iowa','IA'],
  ['kansas','KS'],['kentucky','KY'],['louisiana','LA'],['maine','ME'],['maryland','MD'],
  ['massachusetts','MA'],['michigan','MI'],['minnesota','MN'],['mississippi','MS'],['missouri','MO'],
  ['montana','MT'],['nebraska','NE'],['nevada','NV'],['new hampshire','NH'],['new jersey','NJ'],
  ['new mexico','NM'],['new york','NY'],['north carolina','NC'],['north dakota','ND'],['ohio','OH'],
  ['oklahoma','OK'],['oregon','OR'],['pennsylvania','PA'],['rhode island','RI'],['south carolina','SC'],
  ['south dakota','SD'],['tennessee','TN'],['texas','TX'],['utah','UT'],['vermont','VT'],
  ['virginia','VA'],['washington','WA'],['west virginia','WV'],['wisconsin','WI'],['wyoming','WY'],
  ['district of columbia','DC'],['puerto rico','PR'],['guam','GU'],['virgin islands','VI'],
]);

// Lower = higher priority. Unlisted groups default to 5.
const NETWORK_PRIORITY = {
  WIRE: 10, NATIONAL: 9,
  NBC: 8,
  HEARST: 7, GRAY: 7,
  NEXSTAR: 6, SINCLAIR: 6,
};

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function normalizeStateCode(raw) {
  if (!raw) return null;
  const t = raw.trim();
  if (t.toUpperCase() === 'NA') return null;
  if (t.length === 2 && /^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return STATE_NAME_TO_CODE.get(t.toLowerCase()) || null;
}

/**
 * Upgrade http:// to https:// and trim the URL.
 * Does NOT strip trailing slashes since /feed/ is a meaningful path segment.
 */
function normalizeFeedUrl(raw) {
  if (!raw) return '';
  return raw.trim().replace(/^http:\/\//i, 'https://');
}

/**
 * Produce a lowercase, slug-safe market key for deduplication comparisons.
 */
function normalizeMarket(raw) {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (t === 'na' || t === 'national') return null;
  return t.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || null;
}

function mapType(datasetType) {
  const t = (datasetType || '').toLowerCase().trim();
  if (t === 'wire') return 'wire';
  if (t === 'national') return 'national_tv';
  if (t === 'local_tv') return 'local_tv';
  return 'rss';
}

function mapScope(datasetType) {
  const t = (datasetType || '').toLowerCase().trim();
  if (t === 'wire') return 'wire';
  if (t === 'national') return 'national';
  if (t === 'local_tv') return 'local';
  return 'national';
}

function getPriority(networkGroup) {
  return NETWORK_PRIORITY[(networkGroup || '').toUpperCase()] ?? 5;
}

/**
 * Convert one raw dataset row into a RssSource-compatible document.
 */
function normalizeRow(row) {
  const networkGroup = (row.network || '').toUpperCase().trim();
  const stateCode = normalizeStateCode(row.state);
  const isGlobal = !row.state || row.state.toUpperCase() === 'NA';
  const city = isGlobal || (row.city || '').toLowerCase() === 'global' ? null : row.city.trim();
  const affiliate = (row.affiliate && row.affiliate.toUpperCase() !== 'NA')
    ? row.affiliate.toUpperCase().trim()
    : null;

  // Human-readable name for UI display
  let name;
  if (isGlobal || networkGroup === 'WIRE' || networkGroup === 'NATIONAL') {
    const loc = (!isGlobal && city) ? ` (${city})` : '';
    name = `${(row.station || '').trim()}${loc}`;
  } else {
    const loc = [city, stateCode].filter(Boolean).join(', ');
    name = `${(row.station || '').trim()}${loc ? ' - ' + loc : ''}`;
  }

  const marketSlug = normalizeMarket(row.market);

  return {
    name,
    url: normalizeFeedUrl(row.feed_url),
    type: mapType(row.type),
    scope: mapScope(row.type),
    category: affiliate ? affiliate.toLowerCase() : (isGlobal ? 'general' : 'local'),
    priority: getPriority(networkGroup),
    networkGroup: networkGroup || null,
    affiliate: affiliate || null,
    market: marketSlug,
    stationCallSign: (row.station || '').trim() || null,
    cityName: city || null,
    stateCode: stateCode || null,
    isActive: true,
    keywords: [],
  };
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

function splitCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  fields.push(current.trim());
  return fields;
}

const EXPECTED_HEADERS = ['network', 'station', 'city', 'state', 'feed_url', 'type', 'affiliate', 'market'];

/**
 * Parse a CSV string into an array of row objects.
 * Skips blank lines and lines beginning with '#'.
 */
function parseCsv(csvText) {
  const lines = (csvText || '').split(/\r?\n/);
  let headers = null;
  const rows = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const fields = splitCsvLine(line);

    if (!headers) {
      // Detect the header row by checking for expected column names
      const lower = fields.map(f => f.toLowerCase().trim());
      if (lower.includes('feed_url') && lower.includes('network')) {
        headers = lower;
      } else {
        // Assume default column order; this line may be data
        headers = EXPECTED_HEADERS;
        if (fields.length >= 5 && (fields[4] || '').startsWith('http')) {
          const obj = {};
          EXPECTED_HEADERS.forEach((h, i) => { obj[h] = (fields[i] || '').trim(); });
          rows.push(obj);
        }
      }
      continue;
    }

    if (fields.length < 5) continue;
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (fields[i] || '').trim(); });
    if (!obj.feed_url || !obj.feed_url.startsWith('http')) continue;
    rows.push(obj);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Deduplication (within a single import payload)
// ---------------------------------------------------------------------------

function deduplicateInput(rows) {
  const seen = new Set();
  const dupes = [];
  const unique = rows.filter(r => {
    const key = normalizeFeedUrl(r.feed_url).toLowerCase();
    if (!key || seen.has(key)) {
      dupes.push(r.feed_url || '');
      return false;
    }
    seen.add(key);
    return true;
  });
  return { unique, dupes };
}

// ---------------------------------------------------------------------------
// URL connectivity probe
// ---------------------------------------------------------------------------

/**
 * Attempt a HEAD request to verify the URL is reachable.
 * Falls back gracefully for servers that reject HEAD (405).
 *
 * Returns: { ok: boolean, status: number|0, reason: string }
 */
function probeUrl(rawUrl, timeoutMs = 6000) {
  return new Promise((resolve) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return resolve({ ok: false, status: 0, reason: 'invalid_url' });
    }

    const mod = parsedUrl.protocol === 'https:' ? https : http;
    const req = mod.request(rawUrl, {
      method: 'HEAD',
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'SocialSecure-NewsBot/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    }, (res) => {
      const s = res.statusCode;
      // 200-399 and 405 (HEAD not allowed but probably alive) are considered reachable
      const ok = s < 400 || s === 405;
      resolve({ ok, status: s, reason: ok ? 'ok' : `http_${s}` });
    });

    req.on('error', (e) => resolve({ ok: false, status: 0, reason: 'network_error', detail: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, reason: 'timeout' }); });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Database upsert
// ---------------------------------------------------------------------------

async function upsertSource(doc) {
  try {
    // new: false → returns the pre-update doc; null means it was a fresh insert
    const before = await RssSource.findOneAndUpdate(
      { url: doc.url },
      { $set: doc },
      { upsert: true, new: false, runValidators: true },
    );
    return { ok: true, operation: before === null ? 'inserted' : 'updated' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Import a batch of source rows.
 *
 * @param {object[]} sources   - Array of raw row objects (from JSON or parseCsv)
 * @param {object}   options
 * @param {boolean}  options.validate   - Probe each URL before importing (default true)
 * @param {boolean}  options.dryRun     - Build docs without writing to DB
 * @param {number}   options.concurrency - Parallel requests for probing/upserts
 *
 * @returns {Promise<{ summary, skipped, failed, dryRunDocs? }>}
 */
async function runBulkImport(sources, { validate = true, dryRun = false, concurrency = 10 } = {}) {
  const { unique, dupes } = deduplicateInput(sources);

  const summary = {
    total: sources.length,
    deduplicatedFromInput: dupes.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };
  const skipped = [];
  const failed = [];
  const dryRunDocs = [];

  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);

    // eslint-disable-next-line no-await-in-loop
    const batchResults = await Promise.all(batch.map(async (row) => {
      const doc = normalizeRow(row);

      if (!doc.url) {
        return { outcome: 'skipped', reason: 'empty_url', feed_url: row.feed_url, station: row.station };
      }

      if (validate) {
        const probe = await probeUrl(doc.url);
        if (!probe.ok) {
          // Hard failures (404, network error) → skip entirely
          if (probe.status === 404 || probe.reason === 'network_error') {
            return {
              outcome: 'skipped',
              reason: probe.reason,
              status: probe.status,
              feed_url: row.feed_url,
              station: row.station,
              network: row.network,
            };
          }
          // Soft failures (timeout, 502, 403 etc.) → import as inactive for later retry
          doc.isActive = false;
        }
      }

      if (dryRun) {
        return { outcome: 'dry_run', doc, feed_url: row.feed_url, station: row.station };
      }

      const result = await upsertSource(doc);
      if (!result.ok) {
        return { outcome: 'failed', error: result.error, feed_url: row.feed_url, station: row.station };
      }
      return { outcome: result.operation, feed_url: row.feed_url, station: row.station };
    }));

    for (const r of batchResults) {
      if (r.outcome === 'inserted') {
        summary.inserted++;
      } else if (r.outcome === 'updated') {
        summary.updated++;
      } else if (r.outcome === 'skipped') {
        summary.skipped++;
        skipped.push({ feed_url: r.feed_url, station: r.station, network: r.network, reason: r.reason, status: r.status });
      } else if (r.outcome === 'dry_run') {
        summary.skipped++;
        dryRunDocs.push(r.doc);
      } else if (r.outcome === 'failed') {
        summary.failed++;
        failed.push({ feed_url: r.feed_url, station: r.station, error: r.error });
      }
    }
  }

  // Record intra-payload duplicates as skipped
  for (const url of dupes) {
    skipped.push({ feed_url: url, reason: 'duplicate_in_input' });
  }

  const out = { summary, skipped, failed };
  if (dryRun) out.dryRunDocs = dryRunDocs;
  return out;
}

module.exports = { runBulkImport, parseCsv, normalizeRow, probeUrl };
