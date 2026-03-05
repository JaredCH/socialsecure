import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { authAPI } from '../utils/api';
import { unlockOrCreateVault } from '../utils/e2ee';

const TOTAL_STEPS = 4;

const strengthLabels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
const SEED_WORD_BANK = [
  'amber', 'anchor', 'apex', 'apple', 'arrow', 'atlas', 'aurora', 'autumn', 'badge', 'bamboo', 'beacon', 'binary',
  'blossom', 'breeze', 'bridge', 'cactus', 'candle', 'canvas', 'captain', 'carbon', 'cedar', 'cherry', 'cloud', 'cobalt',
  'comet', 'coral', 'cosmic', 'crystal', 'dawn', 'delta', 'dolphin', 'ember', 'falcon', 'feather', 'fossil', 'galaxy',
  'garden', 'glacier', 'golden', 'harbor', 'hazel', 'horizon', 'island', 'jasmine', 'jungle', 'kernel', 'lagoon', 'lantern',
  'legend', 'lilac', 'lotus', 'meadow', 'meteor', 'midnight', 'mint', 'mosaic', 'mountain', 'nebula', 'nectar', 'oasis',
  'olive', 'onyx', 'orchid', 'origin', 'pebble', 'phoenix', 'pine', 'planet', 'plume', 'prairie', 'quantum', 'quartz',
  'rainbow', 'raven', 'reef', 'river', 'rocket', 'saffron', 'sailor', 'sapphire', 'shadow', 'silver', 'solstice', 'spark',
  'spruce', 'stellar', 'summit', 'sunset', 'thunder', 'timber', 'topaz', 'trident', 'tulip', 'valley', 'velvet', 'violet',
  'voyage', 'willow', 'winter', 'zephyr'
];

const evaluatePasswordStrength = (password) => {
  const value = String(password || '');
  let score = 0;

  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;

  return {
    score: Math.min(score, 4),
    feedback: {
      suggestions: [
        value.length < 12 ? 'Use at least 12 characters.' : null,
        /[A-Z]/.test(value) ? null : 'Add an uppercase letter.',
        /[a-z]/.test(value) ? null : 'Add a lowercase letter.',
        /\d/.test(value) ? null : 'Add a number.',
        /[^A-Za-z0-9]/.test(value) ? null : 'Add a symbol for stronger protection.'
      ].filter(Boolean)
    }
  };
};

const randomSeedWord = () => {
  const index = Math.floor(Math.random() * SEED_WORD_BANK.length);
  return SEED_WORD_BANK[index];
};

const generateSeedPhrase = () => Array.from({ length: 12 }, randomSeedWord).join(' ');

function OnboardingWizard({
  user,
  onboarding,
  onProgressSaved,
  onCompleted,
  refreshEncryptionPasswordStatus
}) {
  const [step, setStep] = useState(onboarding?.currentStep || 1);
  const [submitting, setSubmitting] = useState(false);

  const [reviewPassword, setReviewPassword] = useState('');
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [confirmEncryptionPassword, setConfirmEncryptionPassword] = useState('');
  const [securityPreferences, setSecurityPreferences] = useState(
    onboarding?.securityPreferences || {
      loginNotifications: true,
      sessionTimeout: 60,
      requirePasswordForSensitive: true
    }
  );

  const [seedPhrase, setSeedPhrase] = useState('');

  const passwordStrength = useMemo(() => evaluatePasswordStrength(reviewPassword || ''), [reviewPassword]);
  const encryptionPasswordStrength = useMemo(() => evaluatePasswordStrength(encryptionPassword || ''), [encryptionPassword]);

  const handleStepOne = async (event) => {
    event.preventDefault();

    if (!reviewPassword) {
      toast.error('Enter a password to review strength.');
      return;
    }

    if (passwordStrength.score < 2) {
      toast.error('Password strength must be at least Fair before continuing.');
      return;
    }

    setSubmitting(true);
    try {
      await authAPI.updateOnboardingProgress(1, {
        passwordStrengthScore: passwordStrength.score
      });
      await onProgressSaved();
      setStep(2);
      toast.success('Step 1 complete');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save step 1');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStepTwo = async (event) => {
    event.preventDefault();

    if (!user?._id) {
      toast.error('Missing user context for vault setup.');
      return;
    }

    if (!user?.hasEncryptionPassword) {
      if (encryptionPassword.length < 8) {
        toast.error('Encryption password must be at least 8 characters.');
        return;
      }
      if (encryptionPassword !== confirmEncryptionPassword) {
        toast.error('Encryption password confirmation does not match.');
        return;
      }
      if (encryptionPasswordStrength.score < 2) {
        toast.error('Choose a stronger encryption password (Fair or better).');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (!user?.hasEncryptionPassword) {
        await authAPI.setEncryptionPassword({
          encryptionPassword,
          confirmEncryptionPassword
        });
      }

      const vaultPassword = encryptionPassword || reviewPassword;
      await unlockOrCreateVault({ userId: user._id, password: vaultPassword });

      await authAPI.updateOnboardingProgress(2, {
        e2eeVaultReady: true
      });
      await refreshEncryptionPasswordStatus();
      await onProgressSaved();
      setStep(3);
      toast.success('Step 2 complete');
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Failed to complete E2EE setup');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateSeed = () => {
    const nextSeed = generateSeedPhrase();
    setSeedPhrase(nextSeed);
    toast.success('Recovery seed generated');
  };

  const handleCopySeed = async () => {
    if (!seedPhrase) return;
    try {
      await navigator.clipboard.writeText(seedPhrase);
      toast.success('Seed phrase copied');
    } catch {
      toast.error('Unable to copy seed phrase');
    }
  };

  const handleStepThree = async () => {
    if (!seedPhrase) {
      toast.error('Generate a recovery seed phrase first.');
      return;
    }

    setSubmitting(true);
    try {
      await authAPI.updateOnboardingProgress(3, {
        recoveryKitGeneratedAt: new Date().toISOString(),
        recoveryKitMethod: 'seed_phrase_qr'
      });
      await onProgressSaved();
      setStep(4);
      toast.success('Step 3 complete');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save recovery step');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStepFour = async (event) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      await authAPI.completeOnboarding(securityPreferences);
      await onCompleted();
      toast.success('Security onboarding completed');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to complete onboarding');
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndicator = (
    <div className="flex items-center justify-between gap-2 mb-6">
      {Array.from({ length: TOTAL_STEPS }, (_, index) => index + 1).map((index) => {
        const completed = index < step;
        const active = index === step;

        return (
          <div key={index} className="flex-1">
            <div
              className={`h-2 rounded-full ${completed ? 'bg-green-500' : active ? 'bg-blue-500' : 'bg-gray-200'}`}
              aria-hidden="true"
            />
            <p className={`text-xs mt-1 text-center ${active ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
              Step {index}
            </p>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Security Onboarding</h1>
      <p className="text-sm text-gray-600 mt-1">
        Complete all 4 steps to unlock Feed, Chat, and Market features.
      </p>

      {stepIndicator}

      {step === 1 && (
        <form onSubmit={handleStepOne} className="space-y-4">
          <h2 className="text-lg font-medium">Step 1: Password Strength Review</h2>
          <p className="text-sm text-gray-600">Check that your password quality meets a secure baseline.</p>

          <input
            type="password"
            value={reviewPassword}
            onChange={(event) => setReviewPassword(event.target.value)}
            className="w-full border rounded p-2"
            placeholder="Type a password to evaluate"
            required
          />

          <div className="border rounded p-3 bg-gray-50">
            <p className="text-sm">
              Strength: <span className="font-semibold">{strengthLabels[passwordStrength.score]}</span>
            </p>
            <ul className="mt-2 text-xs text-gray-700 space-y-1 list-disc list-inside">
              {(passwordStrength.feedback?.suggestions || []).map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
              {!passwordStrength.feedback?.suggestions?.length && (
                <li>Password structure looks acceptable. Continue when ready.</li>
              )}
            </ul>
          </div>

          <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save and Continue'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleStepTwo} className="space-y-4">
          <h2 className="text-lg font-medium">Step 2: E2EE Vault Setup</h2>
          <p className="text-sm text-gray-600">
            Set your encryption password (if needed), then initialize your local encrypted key vault.
          </p>

          {user?.hasEncryptionPassword ? (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
              Encryption password already configured for this account.
            </p>
          ) : (
            <>
              <input
                type="password"
                value={encryptionPassword}
                onChange={(event) => setEncryptionPassword(event.target.value)}
                className="w-full border rounded p-2"
                placeholder="Set encryption password"
                required
              />
              <input
                type="password"
                value={confirmEncryptionPassword}
                onChange={(event) => setConfirmEncryptionPassword(event.target.value)}
                className="w-full border rounded p-2"
                placeholder="Confirm encryption password"
                required
              />
              <p className="text-xs text-gray-600">
                Strength: <span className="font-semibold">{strengthLabels[encryptionPasswordStrength.score]}</span>
              </p>
            </>
          )}

          <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
            {submitting ? 'Configuring...' : 'Initialize Vault and Continue'}
          </button>
        </form>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Step 3: Recovery Kit Seed Phrase</h2>
          <p className="text-sm text-gray-600">
            Generate and save your 12-word recovery phrase. Keep it private and offline.
          </p>

          {!seedPhrase ? (
            <button type="button" onClick={handleGenerateSeed} className="bg-blue-600 text-white px-4 py-2 rounded">
              Generate Seed Phrase
            </button>
          ) : (
            <>
              <div className="border rounded p-3 bg-gray-50">
                <p className="font-mono text-sm leading-6 break-words">{seedPhrase}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <button type="button" onClick={handleCopySeed} className="bg-gray-700 text-white px-3 py-2 rounded">
                  Copy Phrase
                </button>
                <button type="button" onClick={handleGenerateSeed} className="bg-gray-200 text-gray-900 px-3 py-2 rounded">
                  Regenerate
                </button>
              </div>

              <div className="border rounded p-4 inline-block bg-white">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(seedPhrase)}`}
                  alt="Recovery phrase QR code"
                  width={150}
                  height={150}
                />
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={handleStepThree}
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'I Saved My Recovery Phrase'}
              </button>
            </>
          )}
        </div>
      )}

      {step === 4 && (
        <form onSubmit={handleStepFour} className="space-y-4">
          <h2 className="text-lg font-medium">Step 4: Security Preferences</h2>
          <p className="text-sm text-gray-600">Set baseline preferences for account protection.</p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={securityPreferences.loginNotifications}
              onChange={(event) => setSecurityPreferences((prev) => ({
                ...prev,
                loginNotifications: event.target.checked
              }))}
            />
            Enable login notifications
          </label>

          <label className="block text-sm">
            Session timeout (minutes)
            <input
              type="number"
              min={5}
              max={1440}
              value={securityPreferences.sessionTimeout}
              onChange={(event) => setSecurityPreferences((prev) => ({
                ...prev,
                sessionTimeout: Number.parseInt(event.target.value, 10) || 60
              }))}
              className="w-full border rounded p-2 mt-1"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={securityPreferences.requirePasswordForSensitive}
              onChange={(event) => setSecurityPreferences((prev) => ({
                ...prev,
                requirePasswordForSensitive: event.target.checked
              }))}
            />
            Require password for sensitive actions
          </label>

          <button type="submit" disabled={submitting} className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50">
            {submitting ? 'Completing...' : 'Complete Onboarding'}
          </button>
        </form>
      )}
    </div>
  );
}

export default OnboardingWizard;
