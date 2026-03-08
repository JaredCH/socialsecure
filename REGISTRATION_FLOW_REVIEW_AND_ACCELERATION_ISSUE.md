# Issue: Registration flow review, acceleration, and encryption onboarding validation

## Goal

Review and improve the user registration/onboarding process to reduce friction and speed up completion while validating and tightening encryption-related steps (BYO PGP verification, generated PGP option, encryption-password usage in DM security model).

## Why this issue exists

Product expectations describe:
- Option to bring your own PGP key with proof-of-ownership challenge.
- Option for SocialSecure-generated keypair.
- Encryption password as a critical factor for message decrypt workflows.

Current implementation supports key setup and local key generation, but does not implement a server-side BYO PGP ownership challenge-response flow during registration.

## Repository evidence (current state)

- Registration endpoint creates account with basic identity/location/password fields only:
  - `/routes/auth.js:263-383`.
- Encryption password set/change/verify endpoints exist:
  - `/routes/auth.js:831-1113`.
- PGP public key setup endpoint exists and stores public key after format validation:
  - `/routes/auth.js:1327-1367`.
- Onboarding step 1 handles:
  - Encryption password,
  - Vault unlock/create,
  - BYO public key or local keypair generation + upload public key:
  - `/frontend/src/components/OnboardingWizard.js:176-263`.
- Local PGP key generation + parsing is available:
  - `/frontend/src/utils/pgp.js:1-48`.

## Required outcomes

1. **Faster registration**
   - Reduce perceived and actual onboarding time.
   - Avoid blocking heavy cryptographic operations on initial account-creation screen.
   - Improve progress clarity and recoverability across steps.

2. **BYO PGP ownership verification**
   - Add challenge-response flow:
     - Server generates encrypted/signature verification challenge tied to account + expiry.
     - User decrypts/signs challenge using private key.
     - Server verifies proof before marking BYO key as verified.
   - Prevent “paste arbitrary public key” without proof.

3. **SocialSecure-generated key path hardening**
   - Preserve current local generation option.
   - Improve UX for private key handling (backup reminders, irreversible-loss warning, explicit acknowledgment).
   - Ensure private key never leaves client.

4. **Encryption-password workflow validation**
   - Confirm and document where encryption password is required and how it participates in unlock/decrypt flows.
   - Ensure unlock sessions and expiration behavior match security expectations.
   - Prepare alignment with DM offline decrypt flow requirements.

## Scope of implementation tasks

### A) Registration and onboarding UX performance review

- Measure current funnel timings (client instrumentation):
  - account creation latency,
  - step-1 completion time,
  - drop-off points.
- Reduce synchronous waits in onboarding step 1.
- Improve resumability:
  - persist step state safely,
  - allow user to continue after refresh/session change.

### B) BYO PGP verification protocol

- Add backend endpoints (example shape, naming flexible):
  - `POST /auth/pgp/challenge/init`
  - `POST /auth/pgp/challenge/verify`
- Persist challenge state with:
  - userId, key fingerprint, issuedAt, expiresAt, nonce, status, attempts.
- Verify ownership with one of:
  - decrypt challenge payload and return nonce,
  - or detached signature over nonce+context using private key.
- Mark key as verified; reject unverified BYO keys for trust-sensitive features.

### C) Generated-key path improvements

- Keep current local generation in onboarding/settings.
- Add explicit “I saved my private key” checkpoint.
- Offer secure recovery-kit integration path where applicable.

### D) Encryption-password process review

- Validate current endpoints and UX:
  - set/change/verify/status/unlock.
- Confirm timeout semantics and lock behavior.
- Ensure unlock indicators are clear across app surfaces that require decryption.

## Acceptance criteria

- [ ] Registration median completion time is reduced (define baseline + target in implementation).
- [ ] BYO PGP keys cannot be marked trusted without proof-of-ownership.
- [ ] Generated private keys remain client-only and are never transmitted to backend.
- [ ] Encryption password flows are documented and consistent between onboarding, settings, and chat decryption.
- [ ] Onboarding can be resumed without data loss across refresh/navigation.
- [ ] Existing auth/onboarding tests pass, with new tests for challenge-response added.

## Test plan

### Backend tests

- Extend auth route tests (new test file if needed) for:
  - challenge init constraints,
  - successful/failed verification,
  - expiry handling,
  - retry/attempt limits,
  - replay protection.

### Frontend tests

- Extend onboarding/settings tests:
  - `/frontend/src/components/OnboardingWizard.test.js`
  - `/frontend/src/pages/UserSettings.test.js`
- Verify:
  - BYO challenge UX,
  - generated key acknowledgments,
  - resumable onboarding state.

### Manual verification

- New user path: account creation → onboarding step 1 completion under improved timing.
- BYO path: paste key → receive challenge → decrypt/sign challenge → verified status shown.
- Generated path: create keypair locally, download key, acknowledgment checkpoint.

## Security constraints

- [ ] No private key material in API requests, logs, or telemetry.
- [ ] Challenge records expire and cannot be replayed.
- [ ] Attempt limits and rate limiting on challenge verify endpoint.
- [ ] Verification status changes are auditable.

## Rollout plan

1. Ship PGP challenge endpoints behind feature flag.
2. Enable BYO verification requirement for new users first.
3. Migrate existing BYO users with phased re-verification policy.
4. Roll out UX speed improvements progressively and monitor conversion/drop-off.

