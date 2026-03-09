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

jest.mock('../utils/api', () => ({
  authAPI: {
    setEncryptionPassword: jest.fn(),
    setupPGP: jest.fn(),
    updateOnboardingProgress: jest.fn(),
    completeOnboarding: jest.fn(),
    updateProfile: jest.fn(),
    getAddressSuggestions: jest.fn()
  },
  evaluateRegisterPassword: jest.fn(() => ({
    requirementChecks: [],
    allRequirementsMet: true,
    strengthScore: 3,
    strengthLabel: 'Strong'
  }))
}));

jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn()
}));

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import toast from 'react-hot-toast';
import {
  createRecoveryPhraseQrCodeDataUrl,
  INFO_VISIBILITY_OPTIONS,
  resolveInitialStep,
} from './OnboardingWizard';
import OnboardingWizard from './OnboardingWizard';
import { authAPI } from '../utils/api';

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

  it('uses select menus for sex/race and normalizes phone before submit', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    authAPI.updateProfile.mockResolvedValue({ data: {} });

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

    const sexSelect = container.querySelector('select');
    const phoneInput = container.querySelector('input[type="tel"]');
    expect(sexSelect).not.toBeNull();
    expect(phoneInput).not.toBeNull();

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      nativeInputValueSetter.call(phoneInput, '5551112222');
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(authAPI.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      phone: '+15551112222'
    }));

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

describe('OnboardingWizard step 1 existing encryption password flow', () => {
  let container;
  let root;
  let onProgressSaved;
  let onCompleted;
  let refreshEncryptionPasswordStatus;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onProgressSaved = jest.fn().mockResolvedValue(undefined);
    onCompleted = jest.fn().mockResolvedValue(undefined);
    refreshEncryptionPasswordStatus = jest.fn().mockResolvedValue(undefined);

    authAPI.setEncryptionPassword.mockResolvedValue({ data: {} });
    authAPI.setupPGP.mockResolvedValue({ data: {} });
    authAPI.updateOnboardingProgress.mockResolvedValue({ data: {} });
    authAPI.completeOnboarding.mockResolvedValue({ data: {} });
    authAPI.updateProfile.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    jest.clearAllMocks();
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
  });

  it('shows encryption password input when account has existing encryption password', async () => {
    await act(async () => {
      root.render(
        <OnboardingWizard
          user={{ _id: 'u1', email: 'user@example.com', hasEncryptionPassword: true, hasPGP: false }}
          onboarding={{ currentStep: 1 }}
          onProgressSaved={onProgressSaved}
          onCompleted={onCompleted}
          refreshEncryptionPasswordStatus={refreshEncryptionPasswordStatus}
        />
      );
    });

    expect(
      container.querySelector('input[placeholder="Enter encryption password to generate local PGP keys"]')
    ).not.toBeNull();
  });

  it('blocks submit with clear message when local key generation lacks encryption password', async () => {
    await act(async () => {
      root.render(
        <OnboardingWizard
          user={{ _id: 'u1', email: 'user@example.com', hasEncryptionPassword: true, hasPGP: false }}
          onboarding={{ currentStep: 1 }}
          onProgressSaved={onProgressSaved}
          onCompleted={onCompleted}
          refreshEncryptionPasswordStatus={refreshEncryptionPasswordStatus}
        />
      );
    });

    const form = container.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(toast.error).toHaveBeenCalledWith(
      'Enter your encryption password to generate a local PGP key pair, or provide a BYOPGP public key.'
    );
    expect(authAPI.updateOnboardingProgress).not.toHaveBeenCalled();
  });
});
