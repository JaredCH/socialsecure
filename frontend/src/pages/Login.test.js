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
    evaluateRegisterPassword.mockReturnValue({
      strengthLabel: 'Strong'
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

    expect(container.textContent).toContain('Strength: Strong');
    expect(container.innerHTML).toContain('hidden text-xs text-gray-600 sm:block');
  });
});
