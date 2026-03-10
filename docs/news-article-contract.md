# News Article Schema Contract

> Canonical reference for adapter contributors integrating new news sources into SocialSecure.

## Source of Truth

- **Model**: `models/Article.js`
- **Normalization**: `buildIngestionNormalizedPayload()` in `routes/news.js`
- **Catalog Version**: `CATALOG_VERSION` in `config/newsSourceCatalog.js`

---

## Required Fields

| Field    | Type   | Notes                                  |
| -------- | ------ | -------------------------------------- |
| `title`  | String | Non-empty. Trimmed on insert.          |
| `source` | String | Human-readable source name.            |
| `url`    | String | **Unique**. Canonical article URL.     |

## Core Normalized Fields

| Field         | Type     | Default  | Notes                                         |
| ------------- | -------- | -------- | --------------------------------------------- |
| `description` | String   | `''`     | Plain-text summary of the article.            |
| `imageUrl`    | String   | `null`   | URL to lead image.                            |
| `publishedAt` | Date     | `null`   | ISO 8601 publication timestamp.               |
| `category`    | String   | `general`| Normalized to `STANDARDIZED_CATEGORIES` list. |
| `topics`      | [String] | `[]`     | Lowercase topic tags.                         |
| `locations`   | [String] | `[]`     | Lowercase location tokens.                    |
| `sourceType`  | String   | `rss`    | Enum: see Source Types below.                 |
| `sourceId`    | String   | `null`   | Source-specific unique identifier (GUID).     |

## Locality Fields

| Field                      | Type     | Default            | Notes                                                |
| -------------------------- | -------- | ------------------ | ---------------------------------------------------- |
| `assignedZipCode`          | String   | `null`             | ZIP code assigned during ingestion.                  |
| `locationTags.zipCodes`    | [String] | `[]`               | Extracted ZIP codes.                                 |
| `locationTags.cities`      | [String] | `[]`               | Extracted city names (lowercase).                    |
| `locationTags.counties`    | [String] | `[]`               | Extracted county names (lowercase).                  |
| `locationTags.states`      | [String] | `[]`               | Extracted state abbreviations.                       |
| `locationTags.countries`   | [String] | `[]`               | Extracted country codes.                             |
| `localityLevel`            | String   | `global`           | Enum: `city`, `county`, `state`, `country`, `global`.|
| `scopeConfidence`          | Number   | `0`                | 0–1 confidence of locality assignment.               |
| `scopeReason`              | String   | `source_default`   | Enum: `zip_match`, `city_match`, `state_match`, `country_match`, `nlp_only`, `source_default`. |

## Provider Enrichment Fields

| Field             | Type   | Default | Notes                                              |
| ----------------- | ------ | ------- | -------------------------------------------------- |
| `feedSource`      | String | `null`  | Provider identifier (e.g. `google-news`, `npr`).   |
| `feedCategory`    | String | `null`  | Raw category string from the source feed.          |
| `feedLanguage`    | String | `null`  | Language reported by the feed.                     |
| `feedMetadata`    | Mixed  | `{}`    | Free-form provider-specific metadata.              |
| `sourceTier`      | Number | `null`  | Local source tier (1–6).                           |
| `sourceProviderId` | String | `null` | Provider ID from local source catalog.             |

## Operational Fields

| Field               | Type    | Default     | Notes                                             |
| ------------------- | ------- | ----------- | ------------------------------------------------- |
| `normalizedUrlHash` | String  | (computed)  | SHA-256 hash of lowercase URL (first 16 chars).   |
| `ingestTimestamp`    | Date    | `Date.now`  | When the article was ingested.                    |
| `freshnessScore`    | Number  | `0`         | Computed freshness score.                         |
| `viralScore`        | Number  | `0`         | Composite viral/engagement score.                 |
| `viralSignals`      | Object  | (defaults)  | `{ freshness, urgencyTerms, sentimentIntensity, sourceMomentum, shareCueTerms }` |
| `isPromoted`        | Boolean | `false`     | Whether the article is editorially promoted.      |
| `language`          | String  | `en`        | ISO 639-1 language code.                          |
| `isActive`          | Boolean | `true`      | Soft-delete flag.                                 |

## Source Types Enum

```
rss | googleNews | youtube | podcast | government | gdlet | npr | bbc |
patch | redditLocal | tvAffiliate | localNewspaper | newsApi
```

---

## Adapter Contract

Every new source adapter **must** return an array of objects matching the following normalized shape. Use `buildIngestionNormalizedPayload()` for normalization before persistence.

### Minimal Adapter Output

```javascript
{
  title: 'Article Title',          // required
  source: 'Source Name',           // required
  url: 'https://example.com/...',  // required, unique
  description: '...',
  imageUrl: 'https://...',
  publishedAt: new Date(),
  category: 'general',             // normalize via normalizeToStandardCategory()
  topics: ['topic1', 'topic2'],
  locations: ['city', 'state'],
  sourceType: 'rss',               // use distinct enum value for first-class adapters
  sourceTier: null,                 // set for local sources (1-6)
  sourceProviderId: 'provider-id',
  feedSource: 'provider-id',
  feedCategory: 'raw-category',
  feedLanguage: 'en',
  feedMetadata: { /* provider-specific */ },
  scrapeTimestamp: new Date()
}
```

### Locality Enrichment (Optional)

If `NEWS_LOCATION_TAGGER_V2` is enabled, adapters should include:

```javascript
{
  locationTags: {
    zipCodes: [],
    cities: ['austin'],
    counties: [],
    states: ['tx'],
    countries: ['us']
  },
  localityLevel: 'city',
  scopeReason: 'city_match',
  scopeConfidence: 0.8
}
```

### Duplicate Detection

- Articles are deduplicated by `normalizedUrlHash` (SHA-256 of lowercased URL).
- If a duplicate is found, the existing article is updated with fresher metadata.
- `sourceId` is used as a secondary dedup check.

### Category Normalization

Use `normalizeToStandardCategory(rawCategory)` to map source-specific categories to the canonical set:

```
general | politics | business | technology | science | health |
entertainment | sports | world | environment | education | opinion
```

### Rate Limiting

Adapters should respect the `rateLimitHints` from `config/news/localSourceCatalog.js`:

| Tier | Provider        | Max Req/Min | Delay (ms) |
| ---- | --------------- | ----------- | ---------- |
| 1    | Google News     | 30          | 2000       |
| 2    | TV Affiliates   | 20          | 3000       |
| 3    | Patch.com       | 15          | 4000       |
| 4    | Local Newspapers| 15          | 4000       |
| 5    | NewsAPI         | 5           | 12000      |
| 6    | Reddit          | 10          | 6000       |

### Attribution

All articles must preserve the `source` field and `feedMetadata.attribution` when displaying to users. NewsAPI specifically requires attribution per their ToS.
