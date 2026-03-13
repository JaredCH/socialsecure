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
  newsAPI: {
    getSportsTeams: jest.fn().mockResolvedValue({ data: { leagues: [] } }),
    updateWeatherLocations: jest.fn().mockResolvedValue({ data: {} }),
    updateHiddenCategories: jest.fn().mockResolvedValue({ data: {} }),
    updatePreferences: jest.fn().mockResolvedValue({ data: {} })
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
import { authAPI, newsAPI } from '../utils/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.setTimeout(15000);

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
      { value: 'social', label: 'Social', color: 'green' },
      { value: 'secure', label: 'Secure', color: 'red' }
    ]);
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

describe('OnboardingWizard Step 3 additional information flow', () => {
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

    authAPI.updateProfile.mockResolvedValue({ data: {} });
    authAPI.completeOnboarding.mockResolvedValue({ data: {} });
    newsAPI.getSportsTeams.mockResolvedValue({
      data: {
        leagues: [
          {
            id: 'nfl',
            label: 'NFL',
            icon: '🏈',
            teams: [
              { id: 'dal-cowboys', team: 'Dallas Cowboys' },
              { id: 'kc-chiefs', team: 'Kansas City Chiefs' }
            ]
          }
        ]
      }
    });
    newsAPI.updateWeatherLocations.mockResolvedValue({ data: {} });
    newsAPI.updateHiddenCategories.mockResolvedValue({ data: {} });
    newsAPI.updatePreferences.mockResolvedValue({ data: {} });
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

  it('shows the registration ZIP as the default primary weather location', async () => {
    await act(async () => {
      root.render(
        <OnboardingWizard
          user={{ _id: 'u1', email: 'user@example.com', zipCode: '75201' }}
          onboarding={{ currentStep: 3 }}
          onProgressSaved={onProgressSaved}
          onCompleted={onCompleted}
          refreshEncryptionPasswordStatus={refreshEncryptionPasswordStatus}
        />
      );
    });

    const addZipInput = container.querySelector('input[placeholder="Add ZIP code"]');
    expect(addZipInput).not.toBeNull();
    expect(addZipInput.getAttribute('inputmode')).toBe('numeric');
    expect(addZipInput.getAttribute('maxlength')).toBe('10');
    expect(container.textContent).toContain('ZIP 75201');
    expect(container.textContent).toContain('(Primary)');
  });

  it('blocks submit when Sports is enabled without any followed team', async () => {
    await act(async () => {
      root.render(
        <OnboardingWizard
          user={{ _id: 'u1', email: 'user@example.com' }}
          onboarding={{ currentStep: 3 }}
          onProgressSaved={onProgressSaved}
          onCompleted={onCompleted}
          refreshEncryptionPasswordStatus={refreshEncryptionPasswordStatus}
        />
      );
    });

    await act(async () => {});

    const sportsButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.includes('Sports')
    );

    await act(async () => {
      sportsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(toast.error).toHaveBeenCalledWith(
      'Please select at least one sports team, or disable the Sports category.'
    );
    expect(newsAPI.updatePreferences).not.toHaveBeenCalled();
    expect(authAPI.updateProfile).not.toHaveBeenCalled();
  });

  it('collapses the sports team panel when Done is clicked and can reopen it later', async () => {
    await act(async () => {
      root.render(
        <OnboardingWizard
          user={{ _id: 'u1', email: 'user@example.com' }}
          onboarding={{ currentStep: 3 }}
          onProgressSaved={onProgressSaved}
          onCompleted={onCompleted}
          refreshEncryptionPasswordStatus={refreshEncryptionPasswordStatus}
        />
      );
    });

    await act(async () => {});

    const sportsButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.includes('Sports')
    );

    await act(async () => {
      sportsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Select at least one team to enable Sports news');

    const doneButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Done'
    );

    await act(async () => {
      doneButton.click();
    });

    expect(container.textContent).not.toContain('Select at least one team to enable Sports news');
    expect(container.textContent).toContain('Sports is enabled. Choose teams to personalize your Sports news.');

    const editTeamsButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Edit teams'
    );

    await act(async () => {
      editTeamsButton.click();
    });

    expect(container.textContent).toContain('Select at least one team to enable Sports news');
  });

  it('saves weather locations, sports teams, and personal info on submit', async () => {
    await act(async () => {
      root.render(
        <OnboardingWizard
          user={{ _id: 'u1', email: 'user@example.com', zipCode: '75201' }}
          onboarding={{ currentStep: 3 }}
          onProgressSaved={onProgressSaved}
          onCompleted={onCompleted}
          refreshEncryptionPasswordStatus={refreshEncryptionPasswordStatus}
        />
      );
    });

    await act(async () => {});

    const sportsButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.includes('Sports')
    );

    await act(async () => {
      sportsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      const leagueButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent.includes('NFL')
      );
      leagueButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      const teamCheckbox = Array.from(container.querySelectorAll('input[type="checkbox"]')).find(
        (input) => input.parentElement.textContent.includes('Dallas Cowboys')
      );
      teamCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      const phoneInput = container.querySelector('input[type="tel"]');
      nativeInputValueSetter.call(phoneInput, '5551112222');
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(newsAPI.updateWeatherLocations).toHaveBeenCalledWith([
      { zipCode: '75201', label: 'ZIP 75201', isPrimary: true }
    ]);
    expect(newsAPI.updatePreferences).toHaveBeenCalledWith({
      followedSportsTeams: ['dal-cowboys']
    });
    expect(newsAPI.updateHiddenCategories.mock.calls[0][0]).not.toContain('sports');
    expect(authAPI.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      phone: '+15551112222',
      streetAddress: '',
      ageGroup: '',
      sex: '',
      race: '',
      profileFieldVisibility: expect.objectContaining({
        streetAddress: 'social',
        phone: 'social',
        email: 'social'
      })
    }));
    expect(authAPI.completeOnboarding).toHaveBeenCalled();
    expect(onProgressSaved).toHaveBeenCalled();
    expect(onCompleted).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Onboarding completed');
  });

  it('lets users switch a personal field to secure visibility', async () => {
    await act(async () => {
      root.render(
        <OnboardingWizard
          user={{ _id: 'u1', email: 'user@example.com' }}
          onboarding={{ currentStep: 3 }}
          onProgressSaved={onProgressSaved}
          onCompleted={onCompleted}
          refreshEncryptionPasswordStatus={refreshEncryptionPasswordStatus}
        />
      );
    });

    const homeAddressLabel = Array.from(container.querySelectorAll('label')).find(
      (label) => label.textContent.trim() === 'Home address'
    );
    const homeAddressHeaderRow = homeAddressLabel.parentElement;
    const homeAddressSecureButton = Array.from(homeAddressHeaderRow.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Secure'
    );

    await act(async () => {
      homeAddressSecureButton.click();
    });

    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(authAPI.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      profileFieldVisibility: expect.objectContaining({
        streetAddress: 'secure'
      })
    }));
  });
});
