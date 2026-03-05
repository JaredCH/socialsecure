# Discovery Feature Notes

## Endpoints

- `GET /api/discovery/users`
- `GET /api/discovery/posts`
- `POST /api/discovery/events`

## Ranking Signals

### User discovery weights

- `textMatch`: `0.40`
- `socialSignal` (`friendCount` log-scaled): `0.25`
- `locationSignal` (`city/state/country` affinity): `0.20`
- `freshness` (account recency): `0.15`
- `alreadyFriend` bonus: `+0.05`

### Post discovery weights

- `engagement` (`likes + 2 * comments`, capped): `0.35`
- `freshness` (post recency): `0.30`
- `socialSignal` (friend author boost): `0.20`
- `textMatch` (query relevance): `0.15`

## Tuning Knobs

- Cache TTL: `30s`
- Rate limit: `60 discovery requests / minute / IP`
- Max page size: `25`
- Candidate pool cap before ranking: `300`

## Analytics Events

- Server-emitted impressions:
  - `discovery_user_impression`
  - `discovery_post_impression`
- Client action events (`POST /api/discovery/events`):
  - `profile_click`
  - `post_click`
  - `follow_click`
