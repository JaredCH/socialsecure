# Hyperlocal Google News Architecture (Expanded)

This design extends the existing RSS ingestion system without replacing it.

## What Was Added

- Master location registry: `models/NewsLocation.js`
- Location registry service: `services/newsLocationMaster.js`
- Google master polling engine (staggered, async, rate-safe): `routes/news.js`
- Registration-triggered on-demand queueing for location fetch: `routes/auth.js`
- Stronger article dedupe via content fingerprint: `models/Article.js`, `routes/news.js`
- Operational health endpoints:
  - `GET /api/news/google-master/health`
  - `GET /api/news/prefetch-status`

## Core Behavior

- A deduplicated location master list is maintained from active registered users.
- Locations are canonicalized (city/state/country, zip, aliases, keys) and stored once.
- Polling cycles query Google News by canonical location phrases plus `local news`.
- Polling is staggered, randomized, and concurrency-limited.
- Failures use exponential backoff per location.
- Registration queues an immediate location fetch, then continues normal flow.
- Existing RSS/system-wide ingestion remains active on current cadence.

## Rate-Safety Controls

Environment variables in `routes/news.js`:

- `NEWS_GOOGLE_MASTER_POLLING_ENABLED`
- `NEWS_GOOGLE_MASTER_POLL_CONCURRENCY`
- `NEWS_GOOGLE_MASTER_MAX_LOCATIONS_PER_CYCLE`
- `NEWS_GOOGLE_MASTER_POLL_BASE_INTERVAL_MS`
- `NEWS_GOOGLE_MASTER_POLL_JITTER_MS`
- `NEWS_GOOGLE_MASTER_REQUEST_DELAY_MIN_MS`
- `NEWS_GOOGLE_MASTER_REQUEST_DELAY_MAX_MS`
- `NEWS_GOOGLE_MASTER_BACKOFF_BASE_MS`
- `NEWS_GOOGLE_MASTER_BACKOFF_MAX_MS`

## Idempotency and Resilience

- URL hash + sourceId + content fingerprint dedupe.
- Poll state persisted per location (`lastPolledAt`, `nextPollAt`, failures, status).
- On-demand queue is persisted (`onDemandRequestedAt`, `onDemandStatus`).
- Interrupted cycles re-run safely from persisted state.

## Observability Signals

- Poll cycle summaries with inserted/updated/duplicates/errors.
- Location-level poll duration and status.
- Health endpoint anomaly signals:
  - low volume
  - elevated error rate
  - duplicate spike
  - stale location coverage

## Retention

Article and ingestion-record cleanup remains in existing retention path (`cleanupStaleNewsData`) and continues to run each ingestion cycle.
