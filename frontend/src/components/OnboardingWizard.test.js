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

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createRecoveryPhraseQrCodeDataUrl,
  INFO_VISIBILITY_OPTIONS,
  resolveInitialStep,
} from './OnboardingWizard';
import OnboardingWizard from './OnboardingWizard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

  it('renders additional info visibility as a category/value social-secure matrix', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <OnboardingWizard
          user={{ _id: 'u1', email: 'user@example.com' }}
          onboarding={{ currentStep: 3 }}
          onProgressSaved={jest.fn().mockResolvedValue(undefined)}
          onCompleted={jest.fn().mockResolvedValue(undefined)}
          refreshEncryptionPasswordStatus={jest.fn().mockResolvedValue(undefined)}
        />
      );
    });

    const matrix = container.querySelector('[data-testid="additional-info-visibility-matrix"]');
    expect(matrix).not.toBeNull();
    expect(matrix.textContent).toContain('Category');
    expect(matrix.textContent).toContain('What you entered');
    expect(matrix.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThanOrEqual(14);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
