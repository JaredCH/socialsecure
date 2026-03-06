# /news Local Sourcing & Scope-Tagging Improvement Plan

## 1) Why this plan is needed (current code findings)
Current `/news` ingestion and ranking already attempts location inference, but there are reliability gaps for US-local matching:

1. Ingestion builds location tokens mostly from source/category/title text and simple regex extraction (`inferLocationTokensFromText`) rather than a normalized ZIP→city/state/country registry.
   - Code: `/home/runner/work/socialsecure/socialsecure/routes/news.js:164-235`
2. `resolveAssignedZipCode` can geocode per article using `source.name`/query fallback, which can be noisy for generic sources and expensive at scale.
   - Code: `/home/runner/work/socialsecure/socialsecure/routes/news.js:270-298`
3. Scope matching does support ZIP/city/county/state/country tiers, but quality depends on upstream tagging accuracy.
   - Code: `/home/runner/work/socialsecure/socialsecure/routes/news.js:644-726`

## 2) Internet research summary (free sources + location tooling)

### A. Free/low-cost news ingestion options

1. **Continue RSS/Atom (recommended core)**
   - RSS 2.0 official spec and best practices are stable and open.
   - Sources:
     - RSS 2.0 spec: https://www.rssboard.org/rss-specification
     - RSS profile/best practices: https://www.rssboard.org/rss-profile
2. **Google News RSS (already used in code, community-documented URL patterns)**
   - Current code already ingests Google News RSS queries (`fetchGoogleNewsSource`).
   - Source examples for parameters/usage (`hl`, `gl`, `ceid`, `q`): https://docs.feedly.com/article/375-what-are-some-of-the-advanced-keyword-alerts-google-news-search-parameters
3. **GDELT 2.0 events (free/open global stream with geolocation fields)**
   - Official data/docs: https://www.gdeltproject.org/data.html
   - Can be used as supplemental source for geolocated event detection.
4. **Commercial APIs with free tiers (not ideal as primary “free production” dependency)**
   - NewsAPI pricing: https://newsapi.org/pricing (dev free tier; production requires paid plan)
   - GNews docs: https://docs.gnews.io/
   - NewsData pricing/docs:
     - https://newsdata.io/pricing
     - https://newsdata.io/documentation
     - https://newsdata.io/blog/newsdata-rate-limit/

### B. Free location normalization sources for US ZIP scope

1. **US Census ZCTA/TIGER/Gazetteer (authoritative US geography files)**
   - ZCTA overview: https://www.census.gov/programs-surveys/geography/guidance/geo-areas/zctas.html
   - TIGER files: https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html
   - Gazetteer files: https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html
2. **HUD USPS ZIP crosswalk (ZIP↔county/state relationships, frequently used in analytics)**
   - https://www.huduser.gov/portal/datasets/usps_crosswalk.html
3. **Nominatim usage policy (if we retain geocoder fallback)**
   - https://operations.osmfoundation.org/policies/nominatim/

### C. Free NLP/entity tools for better location extraction

- spaCy EntityRuler + NER docs:
  - https://spacy.io/api/entityruler/
  - https://spacy.io/usage/rule-based-matching/

## 3) Proposed implementation plan (real, minimal-risk, phased)

### Phase 0 — Data model & migration prep
1. Add normalized location fields on `Article` (if not already present in schema):
   - `locationTags`: `{ zipCodes: [], cities: [], counties: [], states: [], countries: [] }`
   - `scopeConfidence`: number (0..1)
   - `scopeReason`: short string enum (`zip_match`, `city_match`, `state_match`, `country_match`, `nlp_only`, `source_default`)
2. Keep existing fields (`locations`, `assignedZipCode`, `localityLevel`) for backward compatibility.

### Phase 1 — Build ZIP normalization registry (US)
1. Create a periodic job (daily/weekly) that imports Census/HUD ZIP mapping into a local lookup collection, e.g. `ZipLocationIndex`:
   - key: ZIP
   - values: canonical city/county/state/country + aliases + lat/lng (if available)
2. Update request-time location context resolution to use this local registry first (instead of geocoding each article).

### Phase 2 — Improve ingestion tagging pipeline
1. For each ingested article (RSS/Google News/GDELT):
   - Extract raw location candidates from title/description/categories/source metadata.
   - Resolve any ZIP token directly via `ZipLocationIndex`.
   - Resolve city/state tokens via deterministic alias map (state abbreviations, common city aliases).
   - Use geocoding fallback only when deterministic resolution fails.
2. Assign scope deterministically:
   - local: article has ZIP match or city match in user ZIP’s metro/city context
   - regional: state match
   - national: country match with same country as user
   - global: none of the above
3. Persist `scopeReason` + `scopeConfidence` for observability.

### Phase 3 — Source strategy (free-first)
1. Keep curated RSS source list as primary (truly free + stable).
2. Expand local coverage by adding more local publisher RSS feeds grouped by US state/metro.
3. Keep Google News RSS as supplemental discovery source (already implemented).
4. Add GDELT ingest adapter as optional enrichment source for additional geolocated events.

### Phase 4 — Retrieval/ranking and fallback behavior
1. Use explicit scope labels (`local/regional/national/global`) from `locationTags` + user location context.
2. Keep current fallback behavior but expose reasons in API response (already partially present) and logs.
3. Add per-scope quality metrics:
   - % articles with deterministic ZIP/state/country tags
   - % scope fallbacks by scope requested
   - median ingest→publish latency

### Phase 5 — Rollout and safety
1. Feature flag new tagger (`NEWS_LOCATION_TAGGER_V2`).
2. Shadow mode for 1 week:
   - compute v2 tags while serving v1
   - compare precision/recall using admin dashboard samples
3. Gradual rollout: 10% → 50% → 100%

## 4) Concrete validation plan (includes required ZIPs)

### API acceptance tests (automated)
Add/extend route tests in `routes/news.scope.test.js`:
1. ZIP `78666` user profile:
   - ingest sample local/state/national/global articles
   - assert `/api/news/feed?scope=local` returns at least one location-matched local article first
   - assert scope metadata: `requestedScope=local`, `activeScope=local`
2. ZIP `70726` user profile:
   - same assertions as above
3. Regional check for both ZIPs:
   - `/api/news/feed?scope=regional` prioritizes state-matched articles
4. Fallback correctness:
   - if no local/regional items exist, fallback reason is explicit and deterministic

### Runtime smoke test (manual)
After deployment in staging:
1. Seed/test users with ZIPs `78666` and `70726`.
2. Trigger ingestion.
3. Verify each user gets non-empty local/regional/national/global feeds and that top local items have deterministic `scopeReason` values.
4. Verify no per-article geocode storm in logs/metrics.

## 5) Exact implementation checklist
- [x] Add `ZipLocationIndex` model + importer job (Census/HUD source files)
- [x] Add `locationTags`, `scopeReason`, `scopeConfidence` fields to `Article`
- [x] Implement deterministic location resolver utility using ZIP registry
- [x] Refactor `resolveAssignedZipCode` / ingestion flow to use resolver first, geocoder fallback second
- [ ] Add optional GDELT adapter + source toggles
- [x] Update feed scoring to prefer deterministic matches
- [x] Add tests for ZIPs `78666` and `70726`
- [ ] Add metrics/logging for scope quality
- [x] Roll out behind `NEWS_LOCATION_TAGGER_V2` flag

## 6) Recommendation for approval
Approve implementation of **Phase 0–2 first** (highest impact, lowest risk, still fully free-centric), then phase in source expansion (Phase 3) after tagging quality is measurable.
