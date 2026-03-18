# SocialSecure

SocialSecure is a full-stack social platform with real-time chat, discovery, news aggregation, and privacy-focused account controls.

## Setup

### Prerequisites
- Node.js 18+
- npm
- MongoDB

### Install
```bash
npm ci
npm --prefix frontend ci
```

### Environment
Copy `/home/runner/work/socialsecure/socialsecure/.env.example` to `.env` and set required values:

- `MONGODB_URI`
- `JWT_SECRET`
- `CLIENT_URL`

Optional deployment variables are documented in `/home/runner/work/socialsecure/socialsecure/.env.railway.template`.

### Run locally
```bash
npm run dev
```

### Test
```bash
npm test -- --runInBand --ci
CI=true npm --prefix frontend test -- --watchAll=false --runInBand
```

## Project Structure

- `routes/` — Express route modules for auth, chat, discovery, feed, market, moderation, public APIs, and news APIs.
- `services/` — Shared backend logic for ingestion, location normalization/caching, realtime, lifecycle jobs, and admin utilities.
- `utils/` — Shared utility helpers used by routes/services (normalization, telemetry helpers, filters, preference mappers).
- `middleware/` — Request middleware, including auth parsing and shared error handling hooks.
- `models/` — Mongoose models for users, posts, chat, moderation, ingestion, preferences, and social features.
- `data/` — Static/reference datasets (for example sports and location reference maps).
- `scripts/` — Operational helper scripts used for one-off maintenance and diagnostics.
- `frontend/` — React application (pages/components/tests/build config).

## Shared Utilities (Prompt 5)

- `utils/normalizeToken.js`  
  Normalizes free-form token-like values into lowercase alphanumeric strings for stable indexing and comparisons.

- `middleware/parseAuthToken.js`  
  Provides shared Bearer token parsing/verification middleware (`requireAuth`, `optionalAuth`) plus auth error handling helpers.

- `utils/logEvent.js`  
  Emits structured event payloads with request metadata (IP/user-agent) for reusable route/service telemetry.
