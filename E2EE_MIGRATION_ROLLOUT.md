# E2EE Migration & Rollout Sequence (Backend)

## Goal

Transition legacy chat messages to E2EE envelope records while preserving availability and avoiding any server-side decryption.

## Sequence

1. **Dual-read coexistence period**
   - Existing legacy messages continue to be readable via current history endpoints.
   - Native E2EE messages are already stored as envelope-only records (`migrationFlag = native-e2ee`).

2. **Enable migration writes**
   - Clients call `POST /api/chat/rooms/:roomId/messages/:messageId/migrate-e2ee` with E2EE envelope.
   - Endpoint checks:
     - Authenticated user must be original sender of target message.
     - `senderDeviceId` must be an active device key for authenticated user.
     - Replay/duplicate `senderDeviceId + clientMessageId` is rejected.

3. **Tombstone plaintext safely**
   - On successful migration, backend sets:
     - `content = null`
     - `encryptedContent = null`
     - `isEncrypted = true`
     - `e2ee.enabled = true`
     - `e2ee.migrationFlag = migrated`
     - `e2ee.plaintextTombstoned = true`
   - Migration provenance metadata is retained (`migratedAt`, original format marker, actor user reference).

4. **Idempotent retry behavior**
   - Re-submitting the exact same envelope for already migrated message returns success (`idempotent = true`).
   - Submitting a different envelope for an already migrated message is rejected as conflict.

5. **Scale retrieval for large rooms**
   - Use cursor mode (`cursor`, `limit`) on `GET /api/chat/rooms/:roomId/messages` for efficient incremental history loading.
   - Hard bounded `limit` prevents pathological room-history fetches.
   - Frontend chat pagination must consume backend-provided `pagination.nextCursor`/`pagination.hasMore` (no synthetic page cursoring).

6. **Frontend envelope compatibility gate**
   - Client envelopes must satisfy backend validators:
     - `nonce`, `ciphertext`, `signature`: base64url-like encoding
     - `ciphertextHash`: lowercase/uppercase hex digest
   - Do not send plaintext fallback fields (`content`, `encryptedContent`) to E2EE or migration endpoints.

7. **Boundary test gate before rollout completion**
   - Keep automated backend tests covering:
     - plaintext rejection on E2EE + migration endpoints,
     - malformed/tampered envelope rejection,
     - replay (`senderDeviceId` + `clientMessageId`) protection,
     - device ownership enforcement,
     - migration idempotency and sender authorization.

## Operational notes

- Keep migration endpoint enabled until migration coverage goals are achieved.
- Monitor conflict/duplicate rates to detect client replay or sequencing bugs.
- Once migration coverage is complete and validated, legacy plaintext should remain tombstoned and inaccessible in API outputs.

