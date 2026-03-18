# Changelog

## 2026-03-18

### Files deleted
- `scripts/check_feed.js`
- `scripts/test_feed_api.js`
- `scripts/test_feed_api2.js`

### Files created
- `README.md`

### Files renamed
- `scripts/check_articles.js` → `scripts/checkArticles.js`

### Files significantly modified
- Import group normalization in backend non-test route/service modules under:
  - `/home/runner/work/socialsecure/socialsecure/routes/*.js`
  - `/home/runner/work/socialsecure/socialsecure/services/*.js`
- Shared utility documentation comments:
  - `utils/normalizeToken.js`
  - `middleware/parseAuthToken.js`
  - `utils/logEvent.js`
- Frontend test expectation alignment:
  - `frontend/src/pages/Chat.test.js`

### Dependency changes
- Existing dependency baseline retained.
- Project continues to use `lru-cache` (added previously for location cache support).
- No additional dependency removals/additions in this pass.

### Known remaining issues / deferred upgrades
- `multer` remains on `1.x`; deferred migration target is `multer@2`.
- AWS SDK v2 remains intentionally removed; any future AWS integration should use modular `@aws-sdk/client-*` v3 packages.

### Test status
- Frontend full suite command is executed via:
  - `CI=true npm --prefix frontend test -- --watchAll=false --runInBand`
- Root Jest command currently aggregates both backend and frontend tests and still has unrelated legacy failures in this branch; failures were not suppressed or skipped in this pass.
