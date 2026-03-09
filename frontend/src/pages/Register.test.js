import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';
import { evaluateRegisterPassword } from '../utils/api';

jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn()
}));

jest.mock('../utils/api', () => ({
  authAPI: {
    register: jest.fn()
  },
  evaluateRegisterPassword: jest.fn()
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Register mobile-first layout', () => {
  let container;
  let root;

  const setInputValue = async (input, value) => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;

    await act(async () => {
      nativeInputValueSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  const renderRegister = async (initialEntries = ['/register']) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={initialEntries}>
          <Register onSuccess={jest.fn()} onWelcomeRequired={jest.fn()} />
        </MemoryRouter>
      );
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    evaluateRegisterPassword.mockImplementation((password = '') => {
      const isStrong = password.length >= 10;
      return {
        strengthLabel: isStrong ? 'Strong' : 'Weak',
        allRequirementsMet: isStrong,
        requirementChecks: [
          { id: 'length', label: 'At least 8 characters', met: password.length >= 8 },
          { id: 'case', label: 'Upper and lower case letters', met: /[a-z]/.test(password) && /[A-Z]/.test(password) }
        ]
      };
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
  });

  it('groups registration content into mobile-friendly sections', async () => {
    await renderRegister();

    expect(container.textContent).toContain('Profile details');
    expect(container.textContent).toContain('Sign-in details');
    expect(container.textContent).toContain('Location');
    expect(container.textContent).toContain('Encryption setup (single step)');
    expect(container.textContent).toContain('Optional panel: Home & work');
    expect(container.textContent).toContain('Referral');
  });

  it('uses responsive location fields, expandable password rules, and a sticky mobile submit area', async () => {
    await renderRegister();

    const locationGrid = container.querySelector('[data-testid="location-grid"]');
    const passwordRequirements = container.querySelector('[data-testid="password-requirements"]');
    const submitFooter = container.querySelector('[data-testid="register-submit-footer"]');
    const submitButton = container.querySelector('button[type="submit"]');

    expect(locationGrid.className).toContain('sm:grid-cols-2');
    expect(passwordRequirements.tagName).toBe('DETAILS');
    expect(submitFooter.className).toContain('sticky');
    expect(submitFooter.className).toContain('bottom-0');
    expect(submitButton.className).toContain('min-h-[44px]');
  });

  it('updates the password summary and submit hint when password strength changes', async () => {
    await renderRegister();

    const passwordInput = container.querySelector('input[name="password"]');
    const encryptionPasswordInput = container.querySelector('input[name="encryptionPassword"]');
    const confirmEncryptionPasswordInput = container.querySelector('input[name="confirmEncryptionPassword"]');

    expect(container.textContent).toContain('Strength: Weak');
    expect(container.textContent).toContain('Complete all password requirements to enable account creation.');

    await setInputValue(passwordInput, 'StrongPass1');
    await setInputValue(encryptionPasswordInput, 'StrongPass1');
    await setInputValue(confirmEncryptionPasswordInput, 'StrongPass1');

    expect(container.textContent).toContain('Strength: Strong');
    expect(container.textContent).toContain('Password and encryption setup requirements satisfied.');
  });
});
