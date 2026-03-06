jest.mock('../utils/api', () => ({
  authAPI: {},
  chatAPI: {},
  discoveryAPI: {}
}));
jest.mock('../utils/pgp', () => ({
  generatePGPKeyPair: jest.fn(),
  validatePublicKey: jest.fn()
}));

import { formatSecurityEventType, getSettingsSectionFromHash } from './UserSettings';

describe('getSettingsSectionFromHash', () => {
  it('returns security section when hash matches security', () => {
    expect(getSettingsSectionFromHash('#security')).toBe('security');
  });

  it('strips hash prefix and accepts direct section id', () => {
    expect(getSettingsSectionFromHash('pgp')).toBe('pgp');
  });

  it('falls back to account for unknown section hashes', () => {
    expect(getSettingsSectionFromHash('#not-real')).toBe('account');
  });
});

describe('formatSecurityEventType', () => {
  it('formats underscored security events into title case', () => {
    expect(formatSecurityEventType('login_failed')).toBe('Login Failed');
  });

  it('returns unknown event for empty values', () => {
    expect(formatSecurityEventType('')).toBe('Unknown event');
    expect(formatSecurityEventType(null)).toBe('Unknown event');
  });
});
