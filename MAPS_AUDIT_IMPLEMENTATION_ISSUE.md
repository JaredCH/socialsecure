# Issue: Maps feature implementation audit and privacy-focused phased execution plan

## Scope and audit method

This issue documents an end-to-end implementation-versus-plan audit of the `/maps` feature, grounded in repository evidence. The audit covers frontend rendering, backend APIs, data models, scheduling and background jobs, permissions and authorization, privacy controls, telemetry and analytics, caching, and test coverage. Planning intent was reconstructed from code semantics, comments, naming, existing product copy, and available documentation; repository docs are sparse for maps-specific planning, so each conclusion is explicitly labeled as confirmed, partially supported, inferred, or unknown. Mandatory heatmap participation is treated in this issue as a fixed product constraint because it is explicitly stated as non-negotiable in the originating requirement.

Audit confidence labels in this issue use the following semantics. Confirmed means direct evidence in code. Partially supported means evidence exists but behavior is incomplete or only implied. Inferred means intent is reconstructed from naming, product copy, and design shape. Unknown means intent or behavior cannot be established from this repository snapshot.

## Baseline repository evidence and entry points

| Area | Evidence |
|---|---|
| Frontend map page entry | `frontend/src/pages/Maps.js:64-650` |
| Frontend map route and nav | `frontend/src/App.js:398-399`, `frontend/src/App.js:671-680` |
| Frontend maps API client | `frontend/src/utils/api.js:485-509` |
| Backend maps router and jobs | `routes/maps.js:1-569` |
| Presence model | `models/LocationPresence.js:1-270` |
| Spotlight model | `models/Spotlight.js:1-304` |
| Heatmap aggregation model | `models/HeatmapAggregation.js:1-266` |
| Home-page product intent signals | `frontend/src/pages/Home.js:7-10`, `frontend/src/pages/Home.js:49-52`, `frontend/src/pages/Home.js:95-96`, `frontend/src/pages/Home.js:140-141` |
| Available maps tests | `frontend/src/pages/Maps.test.js:1-74` |

## Implementation-versus-plan findings by domain

| Domain | Current behavior | Intended capability (reconstructed) | Status | Confidence | Evidence |
|---|---|---|---|---|---|
| Frontend map render | Leaflet map initializes and tiles render; geolocation fallback defaults to US center | User-facing local and community map views with location-aware overlays | Implemented but partial | Confirmed | `/frontend/src/pages/Maps.js:96-163` |
| Heatmap overlay render | Heatmap data is fetched into state but never rendered as a layer | Visible density overlay with visual intensity progression | Missing | Confirmed | `/frontend/src/pages/Maps.js:80`, `/frontend/src/pages/Maps.js:201-221`, `/frontend/src/pages/Maps.js:325-381` |
| Friend location marker positioning | Friends are shown at fixed `[39.8283,-98.5795]` marker position | Coarse friend-location markers at derived location cells | Missing | Confirmed | `/frontend/src/pages/Maps.js:337-353`, especially `/frontend/src/pages/Maps.js:349-351` |
| Spotlight marker positioning | Spotlights are shown at fixed `[39.8283,-98.5795]` marker position with production placeholder comments | Spotlights rendered at saved spotlight coordinates | Missing | Confirmed | `/frontend/src/pages/Maps.js:356-378`, especially `/frontend/src/pages/Maps.js:359-370` |
| Presence update API path | Presence endpoint calls model update API with location object + options | Persist rounded presence coordinates and privacy metadata | Defective call contract | Confirmed | `/routes/maps.js:78-89` and `/models/LocationPresence.js:141-156` |
| Presence coordinate validation | Truthy checks reject `0` latitude or longitude | Accept valid 0-based coordinates and reject only invalid numeric ranges | Defective | Confirmed | `/routes/maps.js:69-76` |
| Nearby spotlights authorization | Nearby endpoint is public (`optionalAuth`) and can query without state filter | Preserve `friends_only` visibility to authorized audiences only | Privacy leakage risk | Confirmed | `/routes/maps.js:274-287`, `/models/Spotlight.js:236-254` |
| Local/community spotlight filtering | Local returns `public_glow` only; community returns `trending` plus `public_glow` | Layered map views with staged visibility | Implemented but product intent unclear | Partially supported | `/routes/maps.js:399-404`, `/routes/maps.js:460-465` |
| Spotlight lifecycle | Cooldown, reactions, escalation, 24h expiry, manual deactivate exist | Creation-to-escalation lifecycle exists | Implemented but thin governance | Confirmed | `/models/Spotlight.js:156-182`, `/models/Spotlight.js:185-233`, `/models/Spotlight.js:288-300` |
| Spotlight moderation | No moderation queue, content policy checks, pre-publish review, or abuse scoring | Safe authoring and maintenance workflow with moderation controls | Missing | Confirmed | `/routes/maps.js:203-242`, `/models/Spotlight.js:61-88` |
| Heatmap aggregation and caching | Region recompute aggregates active presences and spotlights by geohash, `getTiles` returns last-hour tiles | Cached density aggregation for map retrieval | Implemented with gaps | Confirmed | `/models/HeatmapAggregation.js:77-203` |
| Heatmap privacy policy handling | `includedInHeatmap` exists but is never used in aggregation filters | Mandatory participation currently documented in UI; no opt-out path | Implemented as mandatory in practice, schema intent ambiguous | Confirmed + Inferred | `/models/LocationPresence.js:55-58`, `/models/HeatmapAggregation.js:84-100`, `/frontend/src/pages/Maps.js:490-492` |
| Friend sharing controls | Only binary `shareWithFriends` toggle exists | Fine-grained audience and pause/disable/re-enable controls | Missing | Confirmed | `/models/LocationPresence.js:50-53`, `/routes/maps.js:121-134`, `/frontend/src/pages/Maps.js:471-492` |
| Scheduled jobs and queues | Jobs use `setInterval`; no distributed lock or queue isolation | Reliable single-writer aggregation and cleanup in multi-instance deploys | Operationally fragile | Confirmed | `/routes/maps.js:523-553`, `/server.js:234-239` |
| Heatmap region coverage | Job only recomputes North America, Europe, Asia-Pacific bounds | Global population density coverage | Incomplete | Confirmed | `/routes/maps.js:526-533` |
| Heatmap retention | Model has cleanup method but router jobs do not invoke it | Bounded storage and predictable retention | Incomplete | Confirmed | `/models/HeatmapAggregation.js:259-262`, `/routes/maps.js:513-560` |
| Telemetry and auditability | Console logs only; no map event telemetry or access audit trail | Abuse detection, auditability, and operation metrics | Missing | Confirmed | `/routes/maps.js:221`, `/routes/maps.js:516`, `/routes/maps.js:536`, `/frontend/src/pages/Maps.js:224-225` |
| Access control for precise location | Friends endpoint strips precise coordinates and returns coarse attributes only | Separation between precise friend channel and public density channel | Partially implemented | Partially supported | `/routes/maps.js:171-186` |
| Existing social graph primitives | Circles and top-friends privacy primitives exist outside maps | Reuse these audiences for precise live sharing authorization | Available but unintegrated | Confirmed + Inferred | `/routes/circles.js:32-53`, `/routes/circles.js:158-199`, `/routes/friends.js:665-717`, `/models/User.js:147-173` |
| Tests by layer | Maps tests only cover module helpers and fallback functions, not maps API, authz, aggregation, jobs, or UI rendering paths | Multi-layer coverage for privacy-sensitive geospatial behavior | Missing | Confirmed | `/frontend/src/pages/Maps.test.js:1-74` |

## Contradictions between apparent product intent and current implementation

| Contradiction | Why it conflicts | Confidence | Evidence |
|---|---|---|---|
| Product copy promises “population density heatmaps,” but map page does not render any heatmap layer | Heatmap data is fetched and stored but never visualized | Confirmed | `/frontend/src/pages/Home.js:7-10`, `/frontend/src/pages/Maps.js:80`, `/frontend/src/pages/Maps.js:201-221`, `/frontend/src/pages/Maps.js:325-381` |
| Product framing suggests location-aware map interactions, but markers are hardcoded to US center | Friends and spotlight markers ignore persisted location data and collapse to one point | Confirmed | `/frontend/src/pages/Maps.js:349-351`, `/frontend/src/pages/Maps.js:359-370` |
| `friends_only` spotlight state implies restricted visibility, but public nearby endpoint can return unrestricted states | `Spotlight.getByLocation` only applies `state` filter if caller passes one | Confirmed | `/routes/maps.js:274-287`, `/models/Spotlight.js:253-254` |
| Presence model API signature implies location-data argument, but implementation reads latitude and longitude from options object | Endpoint passes coordinates in argument 2 while model expects them in argument 3, producing invalid rounding inputs | Confirmed | `/routes/maps.js:78-89`, `/models/LocationPresence.js:141-156` |

## Hidden coupling and migration risks

| Coupling or risk | Impact | Confidence | Evidence |
|---|---|---|---|
| Chat message route falls back to `User.location`, while maps presence writes to `LocationPresence` | Friend precise-sharing rollout can fragment location truth sources unless synchronized | Confirmed | `/routes/chat.js:937-940`, `/models/User.js:98-108`, `/models/LocationPresence.js:157-177` |
| Scheduled jobs run in every app instance via `setInterval` | Multi-instance deployments can produce duplicate recomputes and inconsistent tile writes | Confirmed | `/routes/maps.js:546-553`, `/server.js:234-239` |
| Geohash encoding logic is duplicated across models | Divergent bug fixes can desync cell keys and aggregation behavior | Confirmed | `/models/LocationPresence.js:101-138`, `/models/Spotlight.js:3-40`, `/models/HeatmapAggregation.js:206-256` |
| Heatmap tile computation has no minimum-k suppression and returns raw `userCount` | Low-density tiles can leak near-individual presence patterns | Confirmed | `/routes/maps.js:367-373`, `/models/HeatmapAggregation.js:103-110` |
| Truthy coordinate checks reject equator/prime-meridian users | Global rollout risk and silent data quality loss | Confirmed | `/routes/maps.js:69-70`, `/routes/maps.js:278-279`, `/routes/maps.js:394-395`, `/routes/maps.js:455-456` |

## Planning-signal reconstruction and ambiguity handling

| Signal | Strongest inference | Alternative plausible interpretation | Confidence | Evidence |
|---|---|---|---|---|
| Placeholder comments in map marker rendering | Team intended to ship real coordinate rendering later and left UI placeholders | Team intentionally removed precise display temporarily for privacy but has not implemented coarse geocell projection | Inferred | `/frontend/src/pages/Maps.js:359-370` |
| Presence schema comment “Always included in heatmap (non-toggleable per requirements)” | Mandatory heatmap participation was a deliberate policy requirement | Field was originally intended to support opt-out, then requirements changed and implementation did not remove legacy field | Partially supported | `/models/LocationPresence.js:54-58` |
| Home page marketing text about maps and density overlays | Product intent includes visible heatmap and location-driven discovery, not only data collection | Messaging may be aspirational roadmap copy, not committed GA functionality | Inferred | `/frontend/src/pages/Home.js:7-10`, `/frontend/src/pages/Home.js:49-52`, `/frontend/src/pages/Home.js:95-96` |
| Sparse docs and shallow history for maps | Maps was implemented primarily in code-first mode without formal ADRs | Planning artifacts may exist outside repository or were lost in shallow clone context | Unknown | `/DISCOVERY.md:1-42` contains no maps plan; `git log` for maps files shows shallow snapshot only |

## Gap matrix: current behavior vs required capabilities

| Capability area | Current state | Gap severity | Required end state |
|---|---|---|---|
| Spotlight authoring workflow | Single modal with minimal fields and no templates or draft flow | High | Structured authoring with drafts, validation, moderation status, and publish scheduling |
| Spotlight content model | Basic fields only; no ownership metadata beyond user and timestamps | High | Rich schema including editorial metadata, moderation state, visibility policy, and provenance |
| Spotlight moderation and operations | No moderation queue, abuse checks, or ownership dashboard | High | Moderation queue, escalation rules, owner assignment, and maintenance SLAs |
| Spotlight discoverability hooks | Local/community retrieval only, little ranking instrumentation | Medium | Ranked retrieval hooks, category-based feeds, and auditable recommendation inputs |
| Heatmap privacy transforms | No 1000-foot jitter or delayed temporal obfuscation | Critical | Mandatory spatial jitter up to 1000 feet and 30-minute delay with ±10-minute randomized offset |
| Heatmap leak resistance | Raw userCount in low-density cells; no anti-scrape hardening specific to maps | Critical | k-anonymity thresholds, differential query hardening, and endpoint abuse controls |
| Precise friend sharing | Coarse sharing toggle only; no circles/top-friends scoping, pause, or disable lifecycle | Critical | Separate precise channel scoped to selected circles/top friends with pause presets up to one week and disable/re-enable controls |
| Channel separation guarantees | No strict separation spec between precise channel and density channel | Critical | Explicit data-path isolation so precise coordinates cannot leak through heatmap outputs, caches, logs, telemetry, or side channels |
| Pipeline and storage controls | Presence, spotlights, and aggregations share broad tables without privacy tiering | High | Storage partitioning by sensitivity, key isolation, strict retention windows, and cryptographic controls |
| Observability and incident readiness | Console logs only for maps; no SLOs or alerting | High | Structured telemetry, SLO dashboards, abuse alerts, privacy audit logs, and rollback playbooks |
| Test coverage | Only frontend helper-unit tests for maps | Critical | Route/model/integration/e2e/privacy regression suite with synthetic adversarial tests |

## Concrete target architecture for required outcomes

## Spotlight acceleration architecture

The Spotlight path should move from single-shot creation to an editorial lifecycle with low-friction ownership. Add `SpotlightDraft` and evolve `Spotlight` into publication records with explicit lifecycle states such as `draft`, `submitted`, `approved`, `published`, `suppressed`, and `expired`. Persist structured validation metadata, moderation decisions, reviewer IDs, and reason codes. Add server-side schema validation for text lengths, category taxonomy, location sanity, and anti-spam fingerprints at API ingress before writes. Expose operator screens for queue triage and owner assignment, and automate stale-content reminders tied to ownership metadata.

Discoverability should be made explicit by introducing ranked retrieval inputs that combine locality, freshness, engagement velocity, and moderation confidence. Add instrumentation events for create, submit, approve, publish, suppress, react, and expire actions with immutable IDs for traceability. Preserve current reaction state progression only as one ranking signal, not as the publication gate itself.

## Safe live population-density heatmap architecture

The public heatmap path must operate only on obfuscated presence events and must not consume precise friend-location records directly. At ingest, every location update should fork into two channels. Channel A stores precise coordinates for authorized friend-sharing only. Channel B computes mandatory heatmap participation artifacts via spatial and temporal obfuscation before any durable write to heatmap event storage.

Spatial obfuscation should apply randomized jitter bounded within a 1000-foot radius around the true coordinate, equivalent to 304.8 meters maximum displacement. The jitter distribution should be cryptographically strong and unbiased by direction, using a CSPRNG source such as `crypto.randomBytes` on Node.js services and never `Math.random`. Temporal obfuscation should delay events with a uniform random distribution in the closed range of 20 to 40 minutes generated server-side with the same CSPRNG requirement. Aggregation workers should consume only delayed, jittered events and aggregate by fixed geocells with minimum-k suppression before tile publication.

Rendering should use subtle overlay intensity with progressively deeper red as density increases. Density normalization should be quantile-based per viewport to avoid exposing absolute raw counts at low density while retaining visual utility.

## Friend precise-sharing architecture and controls

Precise sharing must be a separate private channel from density participation. Audience selection should reuse existing circles and top-friends primitives by materializing an access-control list per sharing session. Add controls for pause durations through dropdown presets up to one week, and a hard disable/re-enable switch. Pause and disable states should be enforced server-side before publication to private recipients.

Authorization should require authenticated requester identity, audience membership validation, relationship status validation, and policy checks against owner controls. Delivery responses for precise sharing should contain only currently authorized coordinates and should never include heatmap IDs or aggregation keys.

## Request-path and pipeline placement of privacy and authorization controls

| Stage | Required control placement | Store | Must store | Must not store |
|---|---|---|---|---|
| Client location submission | Client sends precise coordinates over authenticated channel; no client-side obfuscation trusted | API ingress | Request metadata, auth context, anti-replay nonce | Unredacted location in client logs, analytics beacons, or URL params |
| API ingress validation | Numeric validation, replay nonce check, rate limit, audience policy checks | Presence ingress service | Validated event ID, user ID, normalized timestamp | Raw body dumps in error logs |
| Precise friend channel write | Encrypt precise coordinates at rest and tag with audience policy snapshot | `precise_location_events` | Encrypted coordinate blob, policy version, pause/disable state | Heatmap aggregation keys, public tile IDs |
| Heatmap obfuscation transform | Apply 1000-foot jitter and delayed timestamp (30m ±10m) before persistence | Obfuscation worker | Obfuscated coordinate, delayed bucket time, provenance hash | Original coordinate or exact original timestamp |
| Heatmap aggregation | Aggregate only obfuscated events into cells with minimum-k suppression and bounded resolution | `heatmap_cells` | Cell intensity bins, freshness window, compute version | User IDs, device IDs, raw event identifiers |
| Public heatmap API | Return visual-intensity payload only | Read model cache | Cell center, normalized intensity, freshness age | Raw counts for sparse cells, any recipient-specific data |
| Private precise API | Enforce ACL checks and return precise coordinate only for authorized recipients | Read model (precise) | Decrypted coordinate for authorized response path only | Heatmap linkage, unrelated users’ coordinates |
| Telemetry and logs | Write structured security and access logs with field redaction | Audit log store | Actor, action, policy decision, request ID | Precise lat/lng, raw payloads, secret material |

## Storage, retention, encryption, and key management expectations

| Data class | Retention window | Encryption expectation | Key management expectation |
|---|---|---|---|
| Precise friend location events | Short-lived operational window, default 24 hours with policy override for incidents | Envelope encryption at rest and TLS in transit | Service-managed KMS keys with periodic rotation, split key scopes by channel |
| Obfuscated heatmap events | 7 days raw obfuscated events for recompute and abuse forensics | Encryption at rest, no precise back-reference | Separate key namespace from precise channel to reduce blast radius |
| Aggregated heatmap cells | 30 days rolling tiles for trend continuity | Encryption at rest | Read-only serving keys separated from write worker keys |
| Spotlight drafts and moderation records | 90 days for operational review, then archive policy | Encryption at rest | Role-scoped keys for moderation systems and audited key usage |
| Access audit logs | 180 days minimum for abuse and policy audit | Immutable append-only log storage | Dedicated audit key with strict access controls and break-glass procedure |

## Anti-scraping, anti-stalking, abuse detection, replay resistance, and rate limits

| Control | Required implementation |
|---|---|
| Anti-scraping | Add endpoint-specific token-bucket limits for heatmap and precise APIs, adaptive throttling by account risk and IP reputation, and bounding-box query normalization to prevent high-resolution scan grids |
| Anti-stalking | Enforce minimum audience size checks for precise sharing history queries, abnormal-follow and rapid-audience-change detection, and emergency privacy freeze actions |
| Abuse detection | Emit structured events for repeated location pulls, denied access bursts, and suspicious audience churn, then route to moderation queues |
| Replay resistance | Require signed client event nonce and monotonic timestamp window on location updates; reject duplicate nonces per user and device |
| Rate limits | Apply stricter limits than global `/api` rate limiter for `/api/maps/heatmap` and precise-sharing endpoints; include per-user and per-target safeguards |
| Audit logging | Record policy decisions for every precise-location read and write with request correlation IDs and redacted context |

## Consent, permissions, and trust semantics

Friend precise sharing and heatmap participation have separate semantics and must remain separate in both policy and implementation. Friend precise sharing is explicit and user-directed through audience selection plus pause or disable controls. Heatmap participation remains mandatory per requirement, but mandatory participation introduces legal and trust risk that must be managed with strict minimization, transparency, and enforceable safeguards, including GDPR and CCPA purpose-limitation scrutiny, consent-transparency obligations, and user trust concerns around perceived covert tracking.

The hard requirement that users cannot opt out of heatmap participation should be accompanied by mitigation mechanisms that still satisfy the mandate. The product should provide clear disclosure at onboarding and in settings, publish a plain-language explanation of obfuscation and retention limits, enforce strict channel isolation with independent audits, and provide user-visible integrity indicators that no precise coordinates are exposed publicly. Policy and legal review must validate jurisdictional compliance before rollout.

## Phased delivery plan with acceptance criteria, metrics, dependencies, rollout, and rollback

| Phase | Objective | Core implementation | Dependencies | Acceptance criteria | Success metrics | Rollout and rollback |
|---|---|---|---|---|---|---|
| Phase 0 | Privacy and security foundation | Introduce dual-channel location architecture contracts, schema additions for precise channel and obfuscated channel, request validation hardening, replay nonce enforcement, and structured audit logging with call-site redaction guards that block coordinate fields by design | Security review, data model migration approval | API contracts merged, replay checks enabled in staging, redaction tests passing, audit logs emitted without coordinates | 100% location writes carry request IDs and nonce; structured logger rejects coordinate fields at write time; 0 precise coordinates in redaction verification scans | Roll out behind `maps_privacy_v2` flag; rollback by disabling new write path and falling back to existing presence writes |
| Phase 1 | Fix current correctness gaps and leakage risks | Correct presence update contract, numeric validation for 0 coordinates, enforce `friends_only` visibility constraints, and implement backend tests for maps routes/models | Phase 0 contracts | Presence writes persist valid coordinates; unauthorized callers cannot read `friends_only`; route/model tests pass | Reduced maps API error rate; privacy regression suite green | Canary release by percentage of users; rollback via feature flag reverting new auth filter path |
| Phase 2 | Spotlight authoring and maintenance acceleration | Add draft/publish lifecycle schemas and APIs, moderation queue endpoints, validation rules, operator ownership tooling, and discoverability event hooks | Phase 1 stable APIs, moderation UX signoff | Draft to publish lifecycle working end-to-end, moderation actions audited, ownership dashboards operational | Time-to-publish reduced, moderation turnaround SLA achieved, spotlight stale-content rate reduced | Start with internal moderators, then limited cohort; rollback by freezing publish transitions and preserving existing spotlights |
| Phase 3 | Obfuscated heatmap pipeline launch | Implement jitter plus delayed ingestion worker, aggregation with minimum-k suppression, subtle red overlay rendering, and anti-scrape controls | Phase 0 and Phase 1 complete, worker deployment capacity | Heatmap tiles are generated only from obfuscated delayed events; no precise fields in tile stores; UI overlay renders progressive red intensity | Heatmap freshness SLO met, privacy leakage tests pass, scrape-attempt detection rate increases | Progressive region rollout under `maps_heatmap_v2`; rollback to previous heatmap endpoint while preserving write-ahead queue |
| Phase 4 | Precise friend-sharing channel | Add audience selection via circles/top friends, pause dropdown presets up to one week, disable/re-enable controls, recipient authorization checks, and private map rendering for authorized viewers | Circles and top-friends API stability | Authorized recipients can see precise location; unauthorized recipients get denied; pause and disable state transitions enforced | Authorization denial accuracy, user control adoption rate, low false-positive abuse flags | Roll out to trusted beta cohort first; rollback by disabling precise read endpoints and retaining paused state metadata |
| Phase 5 | Production hardening and operations | Define SLOs, alerts, dashboards, incident runbooks, backfill strategy, and retention enforcement jobs including heatmap cleanup scheduling | Prior phase completion | On-call playbooks validated in game day; SLO dashboards live; retention jobs verified | Heatmap availability and latency SLO met, incident MTTR target met | Full rollout with staged traffic ramps; rollback by flagging off new channels and serving cached safe tiles |

## Phase 0 deliverable breakdown for implementation traceability

| Phase 0 workstream | Deliverable |
|---|---|
| Data contracts | Versioned schema definitions for precise and obfuscated channels plus migration compatibility adapters |
| Ingress hardening | Numeric validation, replay nonce validation, and scoped rate limiting for location submission endpoints |
| Logging safety | Structured logger redaction policy with compile-time or test-time field denylist enforcement for coordinate fields |
| Security verification | Automated regression tests for replay rejection, unauthorized access denial, and log redaction guarantees |
| Deployment controls | Feature flag wiring, staged rollout plan, and reversible fallback to legacy presence path |

## Migration and backfill strategy

Migration should introduce new collections without destructive changes first, then dual-write from ingress to both legacy and new schemas until verification gates pass. Backfill for heatmap should operate from obfuscated delayed events only and should not derive aggregates from historical precise presence records. Legacy `LocationPresence` can be retained for compatibility during transition, then gradually restricted to friend coarse-state compatibility usage until fully superseded by precise and obfuscated channel separation.

## Observability and SLO expectations

Define map API availability, privacy-policy decision latency, heatmap tile freshness, and precise-sharing authorization latency as first-class SLOs. Add dashboards for denied access rates, replay rejection rates, tile-generation lag, and geographic query anomalies. Alerting thresholds should distinguish expected high-traffic events from suspicious scraping patterns.

## Test strategy by layer

| Layer | Required coverage |
|---|---|
| Model tests | Coordinate validation, jitter bounds, delay windows, retention expirations, and channel-separation invariants |
| Route tests | Authz for precise sharing, `friends_only` spotlight access, heatmap suppression thresholds, replay nonce rejection |
| Worker tests | Obfuscation correctness, delayed scheduling semantics, aggregation determinism under randomization seeds |
| Integration tests | End-to-end flows from location update to heatmap tile publication and authorized precise retrieval |
| Security and privacy tests | Side-channel leakage checks for logs, telemetry, cache entries, and API payloads |
| Frontend tests | Overlay rendering gradient fidelity, pause/disable UX state transitions, audience selector behavior |

## Prioritized execution sequence to de-risk privacy and security first

Execution should begin with channel separation, obfuscation pipeline enforcement points, authorization hardening, and audit logging before any user-facing expansion. The second priority should correct existing data integrity and privacy leakage defects, because those defects invalidate safe rollout assumptions. The third priority should build Spotlight lifecycle and moderation tooling to increase operational velocity. Heatmap visual launch should occur only after privacy gates and anti-scraping controls meet acceptance criteria. Precise friend-sharing enhancements should follow with strict ACL enforcement and pause/disable controls. Final hardening should complete with SLOs, incident readiness, and rollback drills.
