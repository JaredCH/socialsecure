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
  INFO_VISIBILITY_OPTIONS,
  resolveInitialStep,
} from './OnboardingWizard';

describe('OnboardingWizard helpers', () => {
  it('resolves initial step within supported onboarding bounds', () => {
    const outOfBoundsStep = 999;

    expect(resolveInitialStep(undefined)).toBe(1);
    expect(resolveInitialStep(2)).toBe(2);
    expect(resolveInitialStep(outOfBoundsStep)).toBe(3);
  });

  it('generates a local QR data URL for recovery phrase text', async () => {
    const dataUrl = await createRecoveryPhraseQrCodeDataUrl('alpha beta gamma');

    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    await expect(createRecoveryPhraseQrCodeDataUrl('')).resolves.toBe('');
  });

  it('exposes only social and secure visibility options for additional info onboarding', () => {
    expect(INFO_VISIBILITY_OPTIONS).toEqual([
      { value: 'social', label: 'Social level' },
      { value: 'secure', label: 'Secure level' }
    ]);
  });
});
