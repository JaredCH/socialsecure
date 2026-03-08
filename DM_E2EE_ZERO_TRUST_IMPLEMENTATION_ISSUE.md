# Issue: Zero-trust user-to-user direct messaging encryption (server-compromise resistant)

## Goal

Implement user-to-user direct messaging (DM) so that SocialSecure servers cannot decrypt or read DM content, even if the server is compromised.

## Why this issue exists

Current code includes strong E2EE building blocks (device keys, envelope validation, room key packages, client vault) but DM endpoints still allow plaintext `content`, and DM data paths are not consistently using the E2EE envelope-only flow.

## Repository evidence (current state)

- DM conversation endpoints currently accept plaintext message body content:
  - `/routes/chat.js:2398-2465` (`POST /conversations/:conversationId/messages`).
- E2EE envelope-only endpoint exists, but for room-style messages:
  - `/routes/chat.js:1189-1348` (`POST /rooms/:roomId/messages/e2ee`).
- Device key registration and rotation already exist:
  - `/routes/chat.js:1350-1487`.
- Wrapped room key package publish/sync already exist:
  - `/routes/chat.js:1488-1661`.
- Client E2EE session/vault exists with WebCrypto and PBKDF2:
  - `/frontend/src/utils/e2ee.js:1-260`.
- Onboarding already initializes encryption password + vault and PGP setup:
  - `/frontend/src/components/OnboardingWizard.js:176-263`.

## Required architecture (must-haves)

1. **Envelope-only DM transport**
   - DM send APIs must reject plaintext `content` and legacy `encryptedContent`.
   - DM writes must only store E2EE envelope metadata + ciphertext package.
   - No server-side decrypt paths for DM content.

2. **Per-conversation symmetric message keying**
   - Use per-conversation key versions for DM encryption.
   - Sender encrypts once; key is wrapped per recipient device.
   - Room key package model/path can be reused/extended for DM conversations.

3. **Device-scoped trust model**
   - DM decrypt is only possible on registered, non-revoked recipient devices.
   - Key rotation and revocation must invalidate future decrypt capability for revoked devices.
   - Multi-device users must receive wrapped keys for each active device.

4. **Server compromise resistance**
   - Server stores ciphertext and wrapped keys only.
   - No plaintext message content in DB, caches, logs, analytics events, traces, or notifications.
   - Security logs must redact or exclude encrypted payload fields (`ciphertext`, `wrappedRoomKey`, signatures).

5. **Offline mode**
   - User can download recent/filtered encrypted DM messages + required wrapped keys while online.
   - Decrypt UI action is only enabled once app confirms offline state.
   - Returning online must clear/dehydrate decrypted message material from UI state, memory caches, and storage.
   - Offline and online transitions must be explicit, reversible, and auditable.

6. **Meetup/event payload support inside encrypted DM**
   - Invitation details (location/map pin, date/time, recurring/one-off schedule) must be represented as encrypted structured message payloads.
   - Server may index minimal non-sensitive routing metadata only (message type), never plaintext details.

## Scope of implementation tasks

### Backend

- Add/convert DM send endpoint(s) to E2EE envelope-only contract:
  - Add DM equivalent to room E2EE endpoint or refactor existing endpoint to enforce envelope-only for DM conversations.
- Add DM key-package publish/sync endpoints (or reuse existing package APIs with conversation scoping).
- Ensure DM history response returns envelope data only (no plaintext fallback fields).
- Enforce authz: only conversation participants can send/sync/decrypt-relevant payloads.
- Remove/disable any plaintext DM persistence path.
- Redact sensitive payloads from logs and security events.

### Frontend

- Chat DM composer path must encrypt before send and call DM E2EE endpoint.
- DM message list must decrypt client-side only after key material is available.
- Implement offline mode state machine for DM:
  - `online` -> `downloading_encrypted` -> `ready_offline` -> `decrypted_offline`.
- Add explicit “Go Offline”, “Decrypt Offline Messages”, and “Return Online” controls.
- Ensure online return wipes decrypted state and ephemeral keys from memory/storage.

### Data model

- Ensure DM messages store:
  - conversationId, sender identity, e2ee envelope, timestamps, type metadata.
- Ensure wrapped key packages store:
  - senderDeviceId, recipientDeviceId, conversationId, keyVersion, wrapped key, nonce/aad/signature/hash.
- Add indexes for efficient sync and replay protection.

### Cryptographic requirements

- Keep WebCrypto-based client primitives for encryption/decryption.
- Require authenticated encryption (AES-GCM) and signed envelope integrity checks.
- Keep strong KDF for local vault unlocking (`PBKDF2` currently used in `/frontend/src/utils/e2ee.js`).
- Do not use `Math.random()` for cryptographic operations.

## Acceptance criteria

- [ ] DM plaintext is never accepted by API in production DM send path.
- [ ] Compromised server DB snapshot cannot be used to recover plaintext DM content.
- [ ] DM works across at least 2 devices for one user and 1 device for another user.
- [ ] Revoked device cannot decrypt newly sent DM messages.
- [ ] Offline flow supports encrypted download, offline-only decrypt action, and secure online return wipe.
- [ ] Encrypted meetup invitation messages support map pin + date/time + recurrence payloads.
- [ ] No regressions in existing room/chat flows not targeted by this change.

## Testing plan

### Backend tests

- Extend/add tests around chat E2EE and DM routes:
  - Reuse patterns from `/routes/chat.e2ee.test.js`.
  - Add tests for DM plaintext rejection, E2EE acceptance, participant authz, duplicate client message id handling, revoked device handling.

### Frontend tests

- Extend/add chat page tests:
  - `/frontend/src/pages/Chat.test.js`.
  - Validate DM send uses encrypted payload path and offline mode transitions.

### Manual verification

- User A ↔ User B DM exchange with encryption only.
- Multi-device decrypt checks.
- Offline mode end-to-end:
  - Download encrypted,
  - Disconnect network,
  - Decrypt button appears and works,
  - Reconnect and verify wipe/reencrypt behavior.

## Security and privacy checklist

- [ ] No plaintext DM payload in DB writes
- [ ] No plaintext DM payload in API responses
- [ ] No plaintext DM payload in logs/events/errors
- [ ] No secrets/keys returned to unauthorized users
- [ ] Replay protections for client message ids
- [ ] Device revocation immediately enforced

## Rollout plan

1. Feature-flag DM E2EE enforcement.
2. Dual-read migration window for legacy DM display (read only), but no legacy plaintext writes.
3. Migrate active DM threads to envelope format where needed.
4. Remove legacy plaintext DM write path after migration confidence.

