jest.mock('../utils/api', () => ({ mapsAPI: {} }));

import { resolveLeafletModule, withDataFallback } from './Maps';

describe('resolveLeafletModule', () => {
  it('uses default export when it contains Leaflet map API', () => {
    const defaultExport = { map: jest.fn() };
    const moduleShape = { default: defaultExport, map: undefined };

    expect(resolveLeafletModule(moduleShape)).toBe(defaultExport);
  });

  it('uses module object when map API is on the top-level export', () => {
    const moduleShape = { map: jest.fn() };

    expect(resolveLeafletModule(moduleShape)).toBe(moduleShape);
  });

  it('falls back to module object when default export has no map function', () => {
    const moduleShape = { default: { map: null }, map: jest.fn() };

    expect(resolveLeafletModule(moduleShape)).toBe(moduleShape);
  });

  it('throws when no valid map API exists on either export shape', () => {
    expect(() => resolveLeafletModule({ default: {} })).toThrow('Leaflet map API is unavailable');
  });
});

describe('withDataFallback', () => {
  it('returns request response when request succeeds', async () => {
    const response = { data: { spotlights: [{ _id: '1' }] } };

    await expect(withDataFallback(Promise.resolve(response), { spotlights: [] }))
      .resolves
      .toBe(response);
  });

  it('returns fallback response when request fails', async () => {
    await expect(withDataFallback(Promise.reject(new Error('boom')), { spotlights: [] }))
      .resolves
      .toEqual({ data: { spotlights: [] } });
  });
});
