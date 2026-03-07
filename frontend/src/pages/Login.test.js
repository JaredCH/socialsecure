import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import { evaluateRegisterPassword } from '../utils/api';

jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn()
}));

jest.mock('../utils/api', () => ({
  authAPI: {
    login: jest.fn()
  },
  evaluateRegisterPassword: jest.fn()
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Login mobile-first layout', () => {
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

  const renderLogin = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Login onSuccess={jest.fn()} />
        </MemoryRouter>
      );
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    evaluateRegisterPassword.mockImplementation((password = '') => ({
      strengthLabel: password.length >= 10 ? 'Strong' : 'Weak'
    }));
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
  });

  it('uses larger touch targets for auth inputs and submit button', async () => {
    await renderLogin();

    const identifierInput = container.querySelector('input[name="identifier"]');
    const passwordInput = container.querySelector('input[name="password"]');
    const submitButton = container.querySelector('button[type="submit"]');

    expect(identifierInput.className).toContain('min-h-[44px]');
    expect(passwordInput.className).toContain('min-h-[44px]');
    expect(submitButton.className).toContain('min-h-[44px]');
  });

  it('keeps the advisory password helper visually quieter on small screens', async () => {
    await renderLogin();

    const advisory = container.querySelector('[data-testid="login-password-advisory"]');

    expect(container.textContent).toContain('Strength: Weak');
    expect(advisory.className).toContain('hidden');
    expect(advisory.className).toContain('sm:block');
  });

  it('updates the password strength label when the password changes', async () => {
    await renderLogin();

    const passwordInput = container.querySelector('input[name="password"]');

    await setInputValue(passwordInput, 'LongerPass1');

    expect(container.textContent).toContain('Strength: Strong');
  });
});
