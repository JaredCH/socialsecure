import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';
import { authAPI } from '../utils/api';

jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn()
}));

jest.mock('../utils/api', () => ({
  authAPI: {
    register: jest.fn(),
    checkUsernameAvailability: jest.fn()
  }
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Register minimal onboarding-first flow', () => {
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
    jest.useFakeTimers();
    authAPI.checkUsernameAvailability.mockResolvedValue({ data: { available: true } });
    authAPI.register.mockResolvedValue({ data: { token: 't', user: { _id: 'u1' } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
  });

  it('renders only the required registration fields', async () => {
    await renderRegister();

    expect(container.textContent).toContain('Basic details');
    expect(container.querySelector('input[name="firstName"]')).not.toBeNull();
    expect(container.querySelector('input[name="lastName"]')).not.toBeNull();
    expect(container.querySelector('input[name="username"]')).not.toBeNull();
    expect(container.querySelector('input[name="email"]')).not.toBeNull();
    expect(container.querySelector('input[name="password"]')).toBeNull();
    expect(container.querySelector('[data-testid="register-submit-footer"]')).not.toBeNull();
  });

  it('checks username availability live and only enables submit when available', async () => {
    await renderRegister();

    const usernameInput = container.querySelector('input[name="username"]');
    const submitButton = container.querySelector('button[type="submit"]');

    expect(submitButton.disabled).toBe(true);

    await setInputValue(usernameInput, 'new_user');

    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(authAPI.checkUsernameAvailability).toHaveBeenCalledWith('new_user');
    expect(container.textContent).toContain('Username is available.');
    expect(submitButton.disabled).toBe(false);
  });
});
