jest.mock('axios', () => ({
  create: () => ({
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    }
  })
}));

import { evaluateRegisterPassword, normalizeApiBaseUrl } from './api';

describe('evaluateRegisterPassword', () => {
  it('marks all requirements unmet for an empty password', () => {
    const evaluation = evaluateRegisterPassword('');

    expect(evaluation.allRequirementsMet).toBe(false);
    expect(evaluation.requirementChecks.every((requirement) => !requirement.met)).toBe(true);
    expect(evaluation.strengthLabel).toBe('Weak');
  });

  it('returns all requirements met for backend-valid password', () => {
    const evaluation = evaluateRegisterPassword('Abcdefg1');

    expect(evaluation.allRequirementsMet).toBe(true);
    expect(evaluation.requirementChecks.every((requirement) => requirement.met)).toBe(true);
    expect(evaluation.strengthLabel).toBe('Good');
  });

  it('returns fair when only one requirement is satisfied', () => {
    const evaluation = evaluateRegisterPassword('abcdefgh');

    expect(evaluation.allRequirementsMet).toBe(false);
    expect(evaluation.strengthLabel).toBe('Fair');
  });

  it('returns strong when requirements are met and password is longer', () => {
    const evaluation = evaluateRegisterPassword('LongerPassword1');

    expect(evaluation.allRequirementsMet).toBe(true);
    expect(evaluation.strengthLabel).toBe('Strong');
  });
});

describe('normalizeApiBaseUrl', () => {
  it('uses /api when no value is provided', () => {
    expect(normalizeApiBaseUrl()).toBe('/api');
  });

  it('ensures relative base URLs are rooted from the app origin', () => {
    expect(normalizeApiBaseUrl('api')).toBe('/api');
  });

  it('keeps already rooted base URLs unchanged', () => {
    expect(normalizeApiBaseUrl('/api')).toBe('/api');
  });

  it('keeps absolute API URLs unchanged', () => {
    expect(normalizeApiBaseUrl('https://example.com/api')).toBe('https://example.com/api');
  });
});
