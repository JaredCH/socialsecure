import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { authAPI, evaluateRegisterPassword } from '../utils/api';
import { unlockOrCreateVault } from '../utils/e2ee';
import { generatePGPKeyPair, validatePublicKey } from '../utils/pgp';

const TOTAL_STEPS = 4;
const ENCRYPTION_PASSWORD_MIN_LENGTH = 8;
const MAX_PGP_PUBLIC_KEY_LENGTH = 20000;
const PGP_PUBLIC_KEY_BEGIN = '-----BEGIN PGP PUBLIC KEY BLOCK-----';
const PGP_PUBLIC_KEY_END = '-----END PGP PUBLIC KEY BLOCK-----';
const PGP_PRIVATE_KEY_BEGIN = '-----BEGIN PGP PRIVATE KEY BLOCK-----';
const PGP_PRIVATE_KEY_END = '-----END PGP PRIVATE KEY BLOCK-----';
const STEP_LABELS = [
  'Encryption & PGP Setup',
  'Recovery Kit Seed Phrase',
  'Security Preferences',
  'Finish'
];
export const SESSION_TIMEOUT_OPTIONS = [
  { value: 'per_message', label: 'Per message - require password' },
  { value: '10', label: '10 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '60 minutes' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
  { value: '360', label: '6 Hours' },
  { value: '1440', label: 'Once Daily' }
];
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

const normalizePgpPublicKey = (value) => {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim();
};

const getPgpPublicKeyValidationError = (publicKey) => {
  if (!publicKey) {
    return 'Public PGP key is required.';
  }

  if (publicKey.length > MAX_PGP_PUBLIC_KEY_LENGTH) {
    return `Public PGP key must be at most ${MAX_PGP_PUBLIC_KEY_LENGTH} characters.`;
  }

  if (publicKey.includes(PGP_PRIVATE_KEY_BEGIN) || publicKey.includes(PGP_PRIVATE_KEY_END)) {
    return 'Private key blocks are not allowed. Only paste a public key block.';
  }

  if (!publicKey.includes(PGP_PUBLIC_KEY_BEGIN) || !publicKey.includes(PGP_PUBLIC_KEY_END)) {
    return 'Please provide a valid armored PGP public key block.';
  }

  return null;
};

const randomSeedWord = () => {
  const index = Math.floor(Math.random() * SEED_WORD_BANK.length);
  return SEED_WORD_BANK[index];
};

const generateSeedPhrase = () => Array.from({ length: 12 }, randomSeedWord).join(' ');

export const resolveInitialStep = (currentStep) => {
  const parsedStep = Number.isInteger(currentStep) ? currentStep : 1;
  return Math.max(Math.min(parsedStep, TOTAL_STEPS), 1);
};

export const createRecoveryPhraseQrCodeDataUrl = async (phrase) => {
  const normalizedPhrase = typeof phrase === 'string' ? phrase.trim() : '';
  if (!normalizedPhrase) return '';

  return QRCode.toDataURL(normalizedPhrase, {
    width: 150,
    margin: 1,
    errorCorrectionLevel: 'M'
  });
};

export const getSessionTimeoutSelectValue = (preferences) => {
  if (preferences?.requirePasswordForSensitive && preferences?.sessionTimeout === 5) {
    return 'per_message';
  }

  const timeoutValue = String(preferences?.sessionTimeout ?? '');
  const hasMatchingOption = SESSION_TIMEOUT_OPTIONS.some((option) => option.value === timeoutValue);
  return hasMatchingOption ? timeoutValue : '60';
};

function OnboardingWizard({
  user,
  onboarding,
  onProgressSaved,
  onCompleted,
  refreshEncryptionPasswordStatus
}) {
  const [submitting, setSubmitting] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [confirmEncryptionPassword, setConfirmEncryptionPassword] = useState('');
  const [byoPgpPublicKey, setByoPgpPublicKey] = useState('');
  const [generatedPrivateKey, setGeneratedPrivateKey] = useState('');
  const [seedPhrase, setSeedPhrase] = useState('');
  const [seedPhraseQrDataUrl, setSeedPhraseQrDataUrl] = useState('');
  const [securityPreferences, setSecurityPreferences] = useState(
    onboarding?.securityPreferences || {
      loginNotifications: true,
      sessionTimeout: 60,
      requirePasswordForSensitive: true
    }
  );

  const initialStep = useMemo(() => {
    return resolveInitialStep(onboarding?.currentStep);
  }, [onboarding?.currentStep]);

  const [step, setStep] = useState(initialStep);

  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  useEffect(() => {
    let cancelled = false;

    if (!seedPhrase) {
      setSeedPhraseQrDataUrl('');
    } else {
      createRecoveryPhraseQrCodeDataUrl(seedPhrase)
        .then((qrDataUrl) => {
          if (!cancelled) {
            setSeedPhraseQrDataUrl(qrDataUrl);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSeedPhraseQrDataUrl('');
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [seedPhrase]);

  const passwordEvaluation = useMemo(
    () => evaluateRegisterPassword(encryptionPassword),
    [encryptionPassword]
  );

  const handleDownloadPrivateKey = () => {
    if (!generatedPrivateKey) return;

    const blob = new Blob([generatedPrivateKey], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'SocialSecure-private-key.asc';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleStepOne = async (event) => {
    event.preventDefault();

    if (!user?._id) {
      toast.error('Missing user context for onboarding setup.');
      return;
    }

    const hasExistingEncryptionPassword = !!user?.hasEncryptionPassword;
    const normalizedPublicKey = normalizePgpPublicKey(byoPgpPublicKey);
    const usingByoPgp = normalizedPublicKey.length > 0;

    if (!hasExistingEncryptionPassword) {
      if (!passwordEvaluation.allRequirementsMet) {
        toast.error('Please satisfy all encryption password requirements before continuing.');
        return;
      }

      if (encryptionPassword !== confirmEncryptionPassword) {
        toast.error('Encryption password confirmation does not match.');
        return;
      }
    }

    if (usingByoPgp) {
      const basicValidationError = getPgpPublicKeyValidationError(normalizedPublicKey);
      if (basicValidationError) {
        toast.error(basicValidationError);
        return;
      }

      const parsedValidation = await validatePublicKey(normalizedPublicKey);
      if (!parsedValidation.valid) {
        toast.error('Public key format is invalid or unreadable. Please verify the armored public key block.');
        return;
      }
    }

    const vaultPassword = hasExistingEncryptionPassword ? encryptionPassword || null : encryptionPassword;

    if (!vaultPassword && !hasExistingEncryptionPassword) {
      toast.error('Encryption password is required.');
      return;
    }

    setSubmitting(true);
    try {
      if (!hasExistingEncryptionPassword) {
        await authAPI.setEncryptionPassword({
          encryptionPassword,
          confirmEncryptionPassword
        });
      }

      if (vaultPassword) {
        await unlockOrCreateVault({ userId: user._id, password: vaultPassword });
      }

      if (usingByoPgp) {
        await authAPI.setupPGP(normalizedPublicKey);
      } else if (!user?.hasPGP) {
        const pgpPassphrase = vaultPassword || encryptionPassword;
        if (!pgpPassphrase || pgpPassphrase.length < ENCRYPTION_PASSWORD_MIN_LENGTH) {
          throw new Error(`Encryption password must be at least ${ENCRYPTION_PASSWORD_MIN_LENGTH} characters to generate PGP keys.`);
        }

        const identityName = user?.realName || user?.username || 'SocialSecure User';
        const identityEmail = user?.email || 'user@socialsecure.local';
        const { privateKey, publicKey } = await generatePGPKeyPair(identityName, identityEmail, pgpPassphrase);

        setGeneratedPrivateKey(privateKey);
        await authAPI.setupPGP(publicKey);
      }

      await authAPI.updateOnboardingProgress(1, {
        e2eeVaultReady: true,
        pgpConfigured: true
      });
      await refreshEncryptionPasswordStatus();
      await onProgressSaved();
      setStep(2);
      toast.success('Step 1 complete');
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Failed to complete encryption setup');
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

  const handleStepTwo = async () => {
    if (!seedPhrase) {
      toast.error('Generate a recovery seed phrase first.');
      return;
    }

    setSubmitting(true);
    try {
      await authAPI.updateOnboardingProgress(2, {
        recoveryKitGeneratedAt: new Date().toISOString(),
        recoveryKitMethod: 'seed_phrase_qr'
      });
      await onProgressSaved();
      setStep(3);
      toast.success('Step 2 complete');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save recovery step');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStepThree = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    const normalizedSecurityPreferences = {
      ...securityPreferences,
      sessionTimeout: !securityPreferences.requirePasswordForSensitive && securityPreferences.sessionTimeout === 5
        ? 10
        : securityPreferences.sessionTimeout
    };

    try {
      await authAPI.updateOnboardingProgress(3, {
        securityPreferences: normalizedSecurityPreferences
      });
      await onProgressSaved();
      setStep(4);
      toast.success('Step 3 complete');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save security preferences');
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

      <p className="text-xs uppercase tracking-wide text-gray-500 mb-4">{STEP_LABELS[step - 1]}</p>

      {step === 1 && (
        <form onSubmit={handleStepOne} className="space-y-4">
          <h2 className="text-lg font-medium">Step 1: Encryption Password & PGP Setup</h2>
          <p className="text-sm text-gray-600">
            Set your encryption password and configure PGP. Paste a BYOPGP public key, or leave it blank to generate one locally.
          </p>

          {user?.hasEncryptionPassword ? (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
              Encryption password already configured for this account.
            </div>
          ) : (
            <>
              <input
                type="password"
                value={encryptionPassword}
                onChange={(event) => setEncryptionPassword(event.target.value)}
                className="w-full border rounded p-2"
                placeholder="Set encryption password"
                minLength={ENCRYPTION_PASSWORD_MIN_LENGTH}
                required
              />
              <input
                type="password"
                value={confirmEncryptionPassword}
                onChange={(event) => setConfirmEncryptionPassword(event.target.value)}
                className="w-full border rounded p-2"
                placeholder="Confirm encryption password"
                minLength={ENCRYPTION_PASSWORD_MIN_LENGTH}
                required
              />
              <div className="rounded border border-gray-200 bg-gray-50 p-3">
                <p className="text-sm font-medium text-gray-700">Encryption password requirements</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {passwordEvaluation.requirementChecks.map((requirement) => (
                    <li
                      key={requirement.id}
                      className={`flex items-center justify-between gap-2 ${
                        requirement.met ? 'text-green-700' : 'text-gray-600'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true">{requirement.met ? '✓' : '○'}</span>
                        <span>{requirement.label}</span>
                      </span>
                      <span className="text-xs">{requirement.met ? 'Met' : 'Not met'}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-gray-700" aria-live="polite" role="status">
                  Strength: <span className="font-medium">{passwordEvaluation.strengthLabel}</span>
                </p>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">BYOPGP Public Key (optional)</label>
            <textarea
              value={byoPgpPublicKey}
              onChange={(event) => setByoPgpPublicKey(event.target.value)}
              className="w-full border rounded p-2"
              rows={6}
              placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave blank to generate a key pair locally from your encryption password.
            </p>
          </div>

          <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
            {submitting ? 'Configuring...' : 'Save and Continue'}
          </button>
        </form>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Step 2: Recovery Kit Seed Phrase</h2>
          <p className="text-sm text-gray-600">
            Generate and save your 12-word recovery phrase. Keep it private and offline.
          </p>

          {generatedPrivateKey ? (
            <div className="space-y-2 border border-yellow-300 bg-yellow-50 rounded p-3">
              <p className="text-sm text-yellow-900 font-medium">
                A PGP private key was generated for your account. Save it securely before continuing.
              </p>
              <button type="button" onClick={handleDownloadPrivateKey} className="bg-yellow-700 text-white rounded px-3 py-2">
                Download Generated Private Key
              </button>
            </div>
          ) : (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
              BYOPGP public key flow selected (or key already configured). No private key is stored by SocialSecure.
            </div>
          )}

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
                {seedPhraseQrDataUrl ? (
                  <img
                    src={seedPhraseQrDataUrl}
                    alt="Recovery phrase QR code"
                    width={150}
                    height={150}
                  />
                ) : (
                  <p className="text-sm text-gray-600">Generating QR code...</p>
                )}
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={handleStepTwo}
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'I Saved My Recovery Phrase'}
              </button>
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <form onSubmit={handleStepThree} className="space-y-4">
          <h2 className="text-lg font-medium">Step 3: Security Preferences</h2>
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
            <select
              value={getSessionTimeoutSelectValue(securityPreferences)}
              onChange={(event) => setSecurityPreferences((prev) => ({
                ...prev,
                sessionTimeout: event.target.value === 'per_message'
                  ? 5
                  : Number.parseInt(event.target.value, 10) || 60,
                requirePasswordForSensitive: event.target.value === 'per_message'
                  ? true
                  : prev.requirePasswordForSensitive
              }))}
              className="w-full border rounded p-2 mt-1"
            >
              {SESSION_TIMEOUT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={securityPreferences.requirePasswordForSensitive}
              onChange={(event) => setSecurityPreferences((prev) => ({
                ...prev,
                requirePasswordForSensitive: event.target.checked,
                sessionTimeout: !event.target.checked && prev.sessionTimeout === 5
                  ? 10
                  : prev.sessionTimeout
              }))}
            />
            Require password for sensitive actions
          </label>

          <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save and Continue'}
          </button>
        </form>
      )}

      {step === 4 && (
        <form onSubmit={handleStepFour} className="space-y-4">
          <h2 className="text-lg font-medium">Step 4: Finish Security Onboarding</h2>
          <p className="text-sm text-gray-600">
            Finalize onboarding to unlock all SocialSecure features.
          </p>

          <button type="submit" disabled={submitting} className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50">
            {submitting ? 'Completing...' : 'Complete Onboarding'}
          </button>
        </form>
      )}
    </div>
  );
}

export default OnboardingWizard;
