const { TextEncoder, TextDecoder } = require('util');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

jest.mock('axios', () => ({
  create: () => ({
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    }
  })
}));

jest.mock('../utils/e2ee', () => ({
  unlockOrCreateVault: jest.fn()
}));

jest.mock('../utils/pgp', () => ({
  generatePGPKeyPair: jest.fn(),
  validatePublicKey: jest.fn()
}));

import {
  createRecoveryPhraseQrCodeDataUrl,
  getSessionTimeoutSelectValue,
  resolveInitialStep,
  SESSION_TIMEOUT_OPTIONS
} from './OnboardingWizard';

describe('OnboardingWizard helpers', () => {
  it('resolves initial step within supported onboarding bounds', () => {
    const outOfBoundsStep = 999;

    expect(resolveInitialStep(undefined)).toBe(1);
    expect(resolveInitialStep(2)).toBe(2);
    expect(resolveInitialStep(outOfBoundsStep)).toBe(4);
  });

  it('generates a local QR data URL for recovery phrase text', async () => {
    const dataUrl = await createRecoveryPhraseQrCodeDataUrl('alpha beta gamma');

    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    await expect(createRecoveryPhraseQrCodeDataUrl('')).resolves.toBe('');
  });

  it('exposes the requested session timeout options and resolves select values safely', () => {
    expect(SESSION_TIMEOUT_OPTIONS.map((option) => option.label)).toEqual([
      'Per message - require password',
      '10 minutes',
      '30 minutes',
      '60 minutes',
      '2 hours',
      '4 hours',
      '6 Hours',
      'Once Daily'
    ]);

    expect(getSessionTimeoutSelectValue({
      requirePasswordForSensitive: true,
      sessionTimeout: 5
    })).toBe('per_message');
    expect(getSessionTimeoutSelectValue({
      requirePasswordForSensitive: false,
      sessionTimeout: 60
    })).toBe('60');
    expect(getSessionTimeoutSelectValue({
      requirePasswordForSensitive: false,
      sessionTimeout: 999
    })).toBe('60');
  });
});
