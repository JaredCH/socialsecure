jest.mock('axios', () => ({
  create: () => ({
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    }
  })
}));

import { evaluateRegisterPassword, normalizeApiBaseUrl, resolveUploadMediaUrl } from './api';

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

  it('preserves protocol-relative URLs', () => {
    expect(normalizeApiBaseUrl('//example.com/api')).toBe('//example.com/api');
  });
});

describe('resolveUploadMediaUrl', () => {
  it('keeps non-upload URLs unchanged', () => {
    expect(resolveUploadMediaUrl('https://cdn.example.com/image.jpg', 'https://api.example.com/api')).toBe('https://cdn.example.com/image.jpg');
  });

  it('resolves /uploads paths against an absolute API base URL', () => {
    expect(resolveUploadMediaUrl('/uploads/gallery/user-1/image.jpg', 'https://api.example.com/api')).toBe('https://api.example.com/uploads/gallery/user-1/image.jpg');
  });

  it('resolves /uploads paths to the current origin when API base URL is relative', () => {
    expect(resolveUploadMediaUrl('/uploads/gallery/user-1/image.jpg', '/api')).toBe('http://localhost/uploads/gallery/user-1/image.jpg');
  });
});
