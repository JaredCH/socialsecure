# E2EE Backend Acceptance Criteria Checklist

## Security proof points

- [x] E2EE message endpoints reject plaintext fields (`content`, `encryptedContent`) and only accept envelope payloads.
- [x] Server stores envelope metadata and ciphertext only; no server-side message decryption logic exists in chat routes.
- [x] Sender device ownership is enforced for envelope submission and migration (`DeviceKey` must belong to authenticated user and not be revoked).
- [x] Replay protection is enforced through sender-device + client-message identity uniqueness checks and unique index semantics.
- [x] Envelope tamper-boundary checks reject malformed cryptographic fields (e.g., non-hex hash, non-base64url-like nonce/ciphertext/signature).
- [x] Legacy plaintext migration tombstones prior plaintext and legacy encrypted fields to null after envelope migration.
- [x] Migration metadata is persisted (`migrationFlag`, `migratedAt`, `plaintextTombstoned`, `migratedFromMessageFormat`, migration actor reference).
- [x] Migration endpoint behavior is idempotent for same envelope on already migrated message and rejects conflicting second envelopes.
- [x] Message retrieval supports bounded limits and cursor mode for large-history rooms.
- [x] Frontend chat history loading consumes server cursor pagination (`nextCursor`) instead of synthetic page counters.
- [x] Frontend-produced E2EE envelopes follow backend boundary contract (base64url-like nonce/ciphertext/signature + hex `ciphertextHash`).
- [x] Backend boundary test coverage exists for plaintext rejection, tampered envelope rejection, replay protection, sender-device enforcement, migration sender auth, migration device ownership, migration idempotency, and cursor limit bounding.
- [x] Server compromise does not reveal plaintext for migrated/native E2EE messages because only envelope artifacts are retained.

