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
    evaluateRegisterPassword.mockReturnValue({
      strengthLabel: 'Strong',
      allRequirementsMet: true,
      requirementChecks: [
        { id: 'length', label: 'At least 8 characters', met: true },
        { id: 'case', label: 'Upper and lower case letters', met: true }
      ]
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
});
