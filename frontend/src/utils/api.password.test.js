import { evaluateRegisterPassword } from './api';

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

  it('returns strong when requirements are met and password is longer', () => {
    const evaluation = evaluateRegisterPassword('LongerPassword1');

    expect(evaluation.allRequirementsMet).toBe(true);
    expect(evaluation.strengthLabel).toBe('Strong');
  });
});
