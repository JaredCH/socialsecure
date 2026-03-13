# News Location Fix Plan

## Confirmed Root Causes

1. **Onboarding captures street address instead of ZIP code**: The onboarding Step 3 form collects `streetAddress` but the news localization system relies on `zipCode` for hyperlocal news matching.

2. **Profile payload mismatch**: The frontend sends `streetAddress` in the onboarding profile update, but the backend news location services expect `zipCode` for location-based news filtering.

3. **No ZIP code validation**: The existing address input has no validation for US ZIP code format, causing inconsistent location data.

4. **Address suggestions API dependency**: The onboarding form uses an address suggestions API that may not reliably resolve to ZIP codes needed for news localization.

## Exact Fixes by File

### 1. `frontend/src/components/OnboardingWizard.js`
- **Line 31**: Replace `streetAddress` field definition with `zipCode` in `ADDITIONAL_INFO_FIELDS`
- **Lines 158-175**: Update initial state to use `zipCode` instead of `streetAddress`
- **Lines 193-220**: Remove address suggestions effect (no longer needed for ZIP input)
- **Lines 419-431**: Update `handleStepThree` to normalize and send `zipCode` instead of `streetAddress`
- **Lines 650-687**: Update Step 3 form rendering to show ZIP input with validation
- **Lines 670-682**: Remove datalist address suggestions, add ZIP validation pattern

### 2. `frontend/src/utils/api.js`
- No changes required - `updateProfile` already sends arbitrary data object; payload compatibility is maintained

### 3. `frontend/src/components/OnboardingWizard.test.js`
- Update tests to validate ZIP code requirement
- Update mock data to use `zipCode` instead of `streetAddress`
- Add test for ZIP code validation (5-digit US format)

## Implementation Order

1. **Documentation** - Create this fix plan document
2. **Component update** - Modify `OnboardingWizard.js` Step 3 to capture ZIP code
3. **Test updates** - Update existing tests and add ZIP validation tests
4. **Verification** - Run frontend tests to confirm changes work correctly

## Verification Checklist

- [ ] Step 3 form displays ZIP code input instead of street address
- [ ] ZIP code field is marked as mandatory with clear label explaining it powers local news
- [ ] ZIP validation accepts US 5-digit format (e.g., `12345`)
- [ ] ZIP validation accepts US 5+4 format (e.g., `12345-6789`)
- [ ] Invalid ZIP codes show validation error
- [ ] On submit, `zipCode` is sent to backend via `updateProfile`
- [ ] `streetAddress` is no longer sent as required field
- [ ] Existing tests pass with updated field names
- [ ] New ZIP validation tests pass
- [ ] Other onboarding fields (phone, ageGroup, sex, race, hobbies) remain unchanged

## Technical Notes

- ZIP code regex pattern: `/^\d{5}(?:-\d{4})?$/` for US 5-digit or 5+4 format
- ZIP code is used by:
  - `chatAPI.getNearbyZipRooms()` for zip-based chat rooms
  - `locationAPI.getZipLocation()` for location services
  - News ingestion for hyperlocal article assignment
- Backend profile update endpoint (`PUT /api/auth/profile`) already handles `zipCode` field
- 7-day cooldown applies to location updates including ZIP code changes
