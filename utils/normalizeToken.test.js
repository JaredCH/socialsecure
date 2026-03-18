const normalizeToken = require('./normalizeToken');

describe('normalizeToken', () => {
  it('normalizes uppercase input', () => {
    expect(normalizeToken('HELLO')).toBe('hello');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeToken('  MixedCase  ')).toBe('mixedcase');
  });

  it('strips special characters', () => {
    expect(normalizeToken('A! B@-C_123')).toBe('abc123');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeToken('')).toBe('');
  });
});
