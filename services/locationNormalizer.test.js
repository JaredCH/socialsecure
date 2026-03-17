jest.mock('./zipLocationIndex', () => ({
  resolveZipLocation: jest.fn()
}));

const { resolveZipLocation } = require('./zipLocationIndex');
const { normalizeLocationInput, parseLocationKey, buildLocationKey } = require('./locationNormalizer');

describe('locationNormalizer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes city/state strings into a stable location key', async () => {
    const normalized = await normalizeLocationInput('San Marcos, TX');
    expect(normalized).toMatchObject({
      city: 'san_marcos',
      state: 'tx',
      stateFull: 'texas',
      country: 'us',
      locationKey: 'san_marcos_tx_us'
    });
  });

  it('uses ZIP resolution when a zip code is provided', async () => {
    resolveZipLocation.mockResolvedValue({ city: 'San Marcos', stateCode: 'TX', countryCode: 'US' });
    const normalized = await normalizeLocationInput({ zipCode: '78666' });
    expect(resolveZipLocation).toHaveBeenCalledWith('78666', { allowGeocode: true, persist: true });
    expect(normalized.locationKey).toBe('san_marcos_tx_us');
  });

  it('parses and rebuilds location keys losslessly', () => {
    const parsed = parseLocationKey('san_marcos_tx_us');
    expect(parsed).toMatchObject({ city: 'san_marcos', state: 'tx', country: 'us', stateFull: 'texas' });
    expect(buildLocationKey(parsed)).toBe('san_marcos_tx_us');
  });
});
