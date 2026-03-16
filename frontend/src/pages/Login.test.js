import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import { authAPI, evaluateRegisterPassword, getAuthToken } from '../utils/api';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn()
}));

jest.mock('../utils/api', () => ({
  authAPI: {
    login: jest.fn()
  },
  evaluateRegisterPassword: jest.fn(),
  getAuthToken: jest.fn()
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
    mockNavigate.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    evaluateRegisterPassword.mockImplementation((password = '') => ({
      strengthLabel: password.length >= 10 ? 'Strong' : 'Weak'
    }));
    getAuthToken.mockReturnValue('token');
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

  it('shows login guidance copy above the form', async () => {
    await renderLogin();

    expect(container.textContent).toContain(
      'Sign in with your email or username to get back to your secure conversations and settings.'
    );
  });

  it('updates the password field value when the password changes', async () => {
    await renderLogin();

    const passwordInput = container.querySelector('input[name="password"]');

    await setInputValue(passwordInput, 'LongerPass1');

    expect(passwordInput.value).toBe('LongerPass1');
  });

  it('redirects successful logins to the news page', async () => {
    authAPI.login.mockResolvedValueOnce({
      data: {
        token: 'token',
        user: { onboardingStatus: 'pending' }
      }
    });

    await renderLogin();

    const identifierInput = container.querySelector('input[name="identifier"]');
    const passwordInput = container.querySelector('input[name="password"]');
    const form = container.querySelector('form');

    await setInputValue(identifierInput, 'demo-user');
    await setInputValue(passwordInput, 'password123');

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(authAPI.login).toHaveBeenCalledWith({
      identifier: 'demo-user',
      password: 'password123'
    });
    expect(mockNavigate).toHaveBeenCalledWith('/news');
  });
});
