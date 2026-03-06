jest.mock('../utils/api', () => ({ mapsAPI: {} }));

const { resolveLeafletModule } = require('./Maps');

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
});
