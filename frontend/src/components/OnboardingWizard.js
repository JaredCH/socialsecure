import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { authAPI, newsAPI, evaluateRegisterPassword } from '../utils/api';
import { unlockOrCreateVault } from '../utils/e2ee';
import { generatePGPKeyPair, validatePublicKey } from '../utils/pgp';

const TOTAL_STEPS = 3;
const ENCRYPTION_PASSWORD_MIN_LENGTH = 8;
const MAX_PGP_PUBLIC_KEY_LENGTH = 20000;
const PGP_PUBLIC_KEY_BEGIN = '-----BEGIN PGP PUBLIC KEY BLOCK-----';
const PGP_PUBLIC_KEY_END = '-----END PGP PUBLIC KEY BLOCK-----';
const PGP_PRIVATE_KEY_BEGIN = '-----BEGIN PGP PRIVATE KEY BLOCK-----';
const PGP_PRIVATE_KEY_END = '-----END PGP PRIVATE KEY BLOCK-----';
const ADDITIONAL_INFO_PREVIEW_MAX_LENGTH = 44;
const STEP_LABELS = [
  'Encryption & PGP Setup',
  'Recovery Kit Seed Phrase',
  'Additional Information'
];
const DEFAULT_SECURITY_PREFERENCES = {
  loginNotifications: true,
  sessionTimeout: 60,
  requirePasswordForSensitive: true
};
export const INFO_VISIBILITY_OPTIONS = [
  { value: 'social', label: 'Social', color: 'green' },
  { value: 'secure', label: 'Secure', color: 'red' }
];
const PERSONAL_INFO_FIELDS = [
  { key: 'streetAddress', label: 'Home address', type: 'text', placeholder: '123 Main St, Apt 4' },
  { key: 'phone', label: 'Phone number', type: 'tel', placeholder: '+1 555-123-4567' },
  { key: 'ageGroup', label: 'Age', type: 'text', placeholder: '25' },
  { key: 'sex', label: 'Sex', type: 'select', placeholder: 'Select' },
  { key: 'race', label: 'Race', type: 'select', placeholder: 'Select' }
];
const NEWS_CATEGORIES = [
  { id: 'technology', name: 'Technology', icon: '\uD83D\uDCBB' },
  { id: 'science', name: 'Science', icon: '\uD83D\uDD2C' },
  { id: 'health', name: 'Health', icon: '\uD83C\uDFE5' },
  { id: 'business', name: 'Business', icon: '\uD83D\uDCBC' },
  { id: 'sports', name: 'Sports', icon: '\u26BD' },
  { id: 'entertainment', name: 'Entertainment', icon: '\uD83C\uDFAC' },
  { id: 'politics', name: 'Politics', icon: '\uD83C\uDFDB\uFE0F' },
  { id: 'finance', name: 'Finance', icon: '\uD83D\uDCC8' },
  { id: 'gaming', name: 'Gaming', icon: '\uD83C\uDFAE' },
  { id: 'ai', name: 'AI & Machine Learning', icon: '\uD83E\uDD16' },
  { id: 'world', name: 'World', icon: '\uD83C\uDF0D' },
  { id: 'general', name: 'General', icon: '\uD83D\uDCF0' }
];
const SEX_OPTIONS = ['Female', 'Male', 'Non-binary', 'Intersex', 'Prefer not to say', 'Other'];
const RACE_OPTIONS = [
  'American Indian or Alaska Native',
  'Asian',
  'Black or African American',
  'Hispanic or Latino',
  'Middle Eastern or North African',
  'Native Hawaiian or Pacific Islander',
  'White',
  'Multiracial',
  'Prefer not to say',
  'Other'
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
const shortenPreviewValue = (value, maxLength = ADDITIONAL_INFO_PREVIEW_MAX_LENGTH) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Not provided';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
};

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

const formatPhoneForInput = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  const normalizedDigits = digits.startsWith('1') ? digits.slice(1, 11) : digits.slice(0, 10);
  const area = normalizedDigits.slice(0, 3);
  const prefix = normalizedDigits.slice(3, 6);
  const line = normalizedDigits.slice(6, 10);

  if (!area) return '';
  if (!prefix) return `(${area}`;
  if (!line) return `(${area}) ${prefix}`;
  return `(${area}) ${prefix}-${line}`;
};

const normalizePhoneForSubmission = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  const normalizedDigits = digits.startsWith('1') ? digits.slice(1, 11) : digits.slice(0, 10);
  if (normalizedDigits.length !== 10) {
    return '';
  }
  return `+1${normalizedDigits}`;
};

const normalizeSportsTeamId = (value) => String(value || '').trim().toLowerCase();

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

  // Step 3 state — weather
  const [weatherLocations, setWeatherLocations] = useState(() => {
    const zip = user?.zipCode || '';
    return zip ? [{ zipCode: zip, label: `ZIP ${zip}`, isPrimary: true }] : [];
  });
  const [newWeatherZip, setNewWeatherZip] = useState('');

  // Step 3 state — news categories
  const [hiddenCategories, setHiddenCategories] = useState(['sports']);
  const [sportsEnabled, setSportsEnabled] = useState(false);
  const [sportsPanelOpen, setSportsPanelOpen] = useState(false);

  // Step 3 state — sports teams
  const [sportsTeamCatalog, setSportsTeamCatalog] = useState([]);
  const [followedTeams, setFollowedTeams] = useState([]);
  const [sportsTeamsLoading, setSportsTeamsLoading] = useState(false);
  const [expandedLeagues, setExpandedLeagues] = useState({});

  // Step 3 state — personal info
  const [personalInfo, setPersonalInfo] = useState({
    streetAddress: '',
    phone: '',
    ageGroup: '',
    sex: '',
    race: '',
    profileFieldVisibility: {
      streetAddress: 'social',
      phone: 'social',
      email: 'social',
      ageGroup: 'social',
      sex: 'social',
      race: 'social'
    }
  });

  const initialStep = useMemo(() => {
    return resolveInitialStep(onboarding?.currentStep);
  }, [onboarding?.currentStep]);

  const [step, setStep] = useState(initialStep);

  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  // Fetch sports team catalog when step 3 is reached
  const loadSportsTeams = useCallback(async () => {
    if (sportsTeamCatalog.length > 0 || sportsTeamsLoading) return;
    setSportsTeamsLoading(true);
    try {
      const { data } = await newsAPI.getSportsTeams();
      setSportsTeamCatalog(data.leagues || []);
    } catch {
      // Non-critical — user can still complete onboarding
    } finally {
      setSportsTeamsLoading(false);
    }
  }, [sportsTeamCatalog.length, sportsTeamsLoading]);

  useEffect(() => {
    if (step === 3) loadSportsTeams();
  }, [step, loadSportsTeams]);

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
    const needsEncryptionPassword = hasExistingEncryptionPassword && !usingByoPgp && !user?.hasPGP;

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

    if (needsEncryptionPassword && !encryptionPassword) {
      toast.error('Enter your encryption password to generate a local PGP key pair, or provide a BYOPGP public key.');
      return;
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

  // --- Weather helpers ---
  const handleAddWeatherZip = () => {
    const zip = newWeatherZip.trim();
    if (!/^\d{5}(?:-\d{4})?$/.test(zip)) {
      toast.error('Enter a valid US ZIP code.');
      return;
    }
    if (weatherLocations.some((loc) => loc.zipCode === zip)) {
      toast.error('This ZIP is already in your list.');
      return;
    }
    setWeatherLocations((prev) => [...prev, { zipCode: zip, label: `ZIP ${zip}`, isPrimary: false }]);
    setNewWeatherZip('');
  };

  const handleRemoveWeatherLocation = (index) => {
    setWeatherLocations((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length > 0 && !next.some((l) => l.isPrimary)) next[0].isPrimary = true;
      return next;
    });
  };

  // --- Category helpers ---
  const toggleCategory = (categoryId) => {
    if (categoryId === 'sports') {
      if (sportsEnabled) {
        setSportsPanelOpen(true);
      } else {
        setSportsEnabled(true);
        setSportsPanelOpen(true);
        setHiddenCategories((prev) => prev.filter((c) => c !== 'sports'));
      }
      return;
    }
    setHiddenCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((c) => c !== categoryId)
        : [...prev, categoryId]
    );
  };

  const toggleTeam = (teamId) => {
    const normalizedId = normalizeSportsTeamId(teamId);
    if (!normalizedId) return;
    setFollowedTeams((prev) =>
      prev.includes(normalizedId) ? prev.filter((t) => t !== normalizedId) : [...prev, normalizedId]
    );
  };

  const toggleLeague = (leagueId) => {
    setExpandedLeagues((prev) => ({ ...prev, [leagueId]: !prev[leagueId] }));
  };

  const handleDoneSportsSelection = () => {
    setSportsPanelOpen(false);
  };

  const handleDisableSports = () => {
    setSportsEnabled(false);
    setSportsPanelOpen(false);
    setHiddenCategories((prev) => (prev.includes('sports') ? prev : [...prev, 'sports']));
    setFollowedTeams([]);
  };

  // --- Personal info helpers ---
  const handlePersonalInfoChange = (field, value) => {
    const nextValue = field === 'phone' ? formatPhoneForInput(value) : value;
    setPersonalInfo((prev) => ({ ...prev, [field]: nextValue }));
  };

  const handleVisibilityToggle = (field, value) => {
    setPersonalInfo((prev) => ({
      ...prev,
      profileFieldVisibility: { ...prev.profileFieldVisibility, [field]: value }
    }));
  };

  // --- Step 3 submit ---
  const handleStepThree = async (event) => {
    event.preventDefault();

    // Validate sports: if enabled, must have at least one team
    if (sportsEnabled && followedTeams.length === 0) {
      toast.error('Please select at least one sports team, or disable the Sports category.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Save weather locations
      if (weatherLocations.length > 0) {
        await newsAPI.updateWeatherLocations(weatherLocations);
      }

      // 2. Save news category preferences + followed teams
      const normalizedFollowedTeams = Array.from(new Set(followedTeams.map(normalizeSportsTeamId).filter(Boolean)));
      await newsAPI.updatePreferences({
        followedSportsTeams: sportsEnabled ? normalizedFollowedTeams : []
      });
      await newsAPI.updateHiddenCategories(hiddenCategories);

      // 3. Save personal info + profile visibility
      const profilePayload = {
        streetAddress: personalInfo.streetAddress.trim(),
        phone: normalizePhoneForSubmission(personalInfo.phone),
        ageGroup: personalInfo.ageGroup.trim(),
        sex: personalInfo.sex.trim(),
        race: personalInfo.race.trim(),
        profileFieldVisibility: personalInfo.profileFieldVisibility
      };
      await authAPI.updateProfile(profilePayload);

      // 4. Complete onboarding
      await authAPI.completeOnboarding(onboarding?.securityPreferences || DEFAULT_SECURITY_PREFERENCES);
      await onProgressSaved();
      await onCompleted();
      toast.success('Onboarding completed');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save — please try again');
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
        Complete all 3 steps to unlock Feed, Chat, and Market features.
      </p>

      {stepIndicator}

      <p className="text-xs uppercase tracking-wide text-gray-500 mb-4">{STEP_LABELS[step - 1]}</p>

      {step === 1 && (
        <form onSubmit={handleStepOne} className="space-y-4">
          <h2 className="text-lg font-medium">Step 1: Encryption Setup</h2>
          <p className="text-sm text-gray-600">
            Add your encryption password and bring your own PGP public key. If you leave the key blank, we generate one locally.
          </p>

          {user?.hasEncryptionPassword ? (
            <>
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
                Encryption password already configured for this account.
              </div>
              <input
                type="password"
                value={encryptionPassword}
                onChange={(event) => setEncryptionPassword(event.target.value)}
                className="w-full border rounded p-2"
                placeholder="Enter encryption password to generate local PGP keys"
                minLength={ENCRYPTION_PASSWORD_MIN_LENGTH}
              />
              <p className="text-xs text-gray-500">
                If you do not paste a BYOPGP public key, enter your encryption password so we can generate a local key pair.
              </p>
            </>
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
          <h2 className="text-lg font-medium">Step 2: Recovery Seeds</h2>
          <p className="text-sm text-gray-600">
            Generate and save your 12-word recovery seed phrase. Keep it private and offline.
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
        <form onSubmit={handleStepThree} className="space-y-6">
          <h2 className="text-lg font-medium">Step 3: Additional Information</h2>
          <p className="text-sm text-gray-600">
            Help us personalize your experience. All personal fields below are optional.
          </p>

          {/* ─── Section A: Weather Locations ─── */}
          <fieldset className="rounded-lg border border-gray-200 p-4 space-y-3">
            <legend className="text-sm font-semibold text-gray-800 px-1">Weather Locations to Monitor</legend>
            <p className="text-xs text-gray-500">
              Your registration ZIP code is included by default. Add up to 2 more locations.
            </p>

            <ul className="space-y-2">
              {weatherLocations.map((loc, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 rounded border border-gray-200 bg-gray-50 px-3 py-1.5">
                    {loc.label || loc.zipCode}
                    {loc.isPrimary && <span className="ml-2 text-xs text-green-700 font-medium">(Primary)</span>}
                  </span>
                  {weatherLocations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveWeatherLocation(idx)}
                      className="text-red-500 hover:text-red-700 text-xs font-medium"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {weatherLocations.length < 3 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newWeatherZip}
                  onChange={(e) => setNewWeatherZip(e.target.value)}
                  placeholder="Add ZIP code"
                  inputMode="numeric"
                  maxLength={10}
                  className="flex-1 border rounded p-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddWeatherZip}
                  className="bg-blue-600 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            )}
          </fieldset>

          {/* ─── Section B: News Interests ─── */}
          <fieldset className="rounded-lg border border-gray-200 p-4 space-y-3">
            <legend className="text-sm font-semibold text-gray-800 px-1">News Interests</legend>
            <p className="text-xs text-gray-500">
              All categories are enabled by default (except Sports). Toggle off any you are not interested in.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {NEWS_CATEGORIES.map((cat) => {
                const isEnabled = !hiddenCategories.includes(cat.id);
                const isSports = cat.id === 'sports';
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      isEnabled
                        ? 'border-blue-300 bg-blue-50 text-blue-800'
                        : 'border-gray-200 bg-gray-50 text-gray-500'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span className="truncate">{cat.name}</span>
                    {isSports && isEnabled && <span className="ml-auto text-xs text-blue-600">*</span>}
                  </button>
                );
              })}
            </div>

            {/* Sports team selector — shown when sports is enabled */}
            {sportsEnabled && !sportsPanelOpen && (
              <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                <p className="text-sm text-blue-800">
                  {followedTeams.length > 0
                    ? `${followedTeams.length} team${followedTeams.length !== 1 ? 's' : ''} selected for Sports news.`
                    : 'Sports is enabled. Choose teams to personalize your Sports news.'}
                </p>
                <button
                  type="button"
                  onClick={() => setSportsPanelOpen(true)}
                  className="text-sm font-medium text-blue-700 hover:text-blue-900"
                >
                  Edit teams
                </button>
              </div>
            )}

            {sportsEnabled && sportsPanelOpen && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-yellow-900">
                    Select at least one team to enable Sports news, or disable Sports below.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDisableSports}
                      className="text-xs font-medium text-red-700 hover:text-red-900"
                    >
                      Disable Sports
                    </button>
                    <button
                      type="button"
                      onClick={handleDoneSportsSelection}
                      className="rounded border border-yellow-300 bg-white px-2.5 py-1 text-xs font-medium text-yellow-900 hover:bg-yellow-100"
                    >
                      Done
                    </button>
                  </div>
                </div>
                {sportsTeamsLoading ? (
                  <p className="text-sm text-gray-500">Loading teams...</p>
                ) : sportsTeamCatalog.length === 0 ? (
                  <p className="text-sm text-gray-500">Unable to load team list. You can configure teams later in News settings.</p>
                ) : (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {sportsTeamCatalog.map((league) => (
                      <div key={league.id}>
                        <button
                          type="button"
                          onClick={() => toggleLeague(league.id)}
                          className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-800 py-1 hover:bg-yellow-100 rounded px-1"
                        >
                          <span>{league.icon || '\u26BD'}</span>
                          <span>{league.label || league.name || league.id}</span>
                          <span className="ml-auto text-xs text-gray-500">
                            {expandedLeagues[league.id] ? '\u25B2' : '\u25BC'}
                          </span>
                        </button>
                        {expandedLeagues[league.id] && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pl-6 pb-2">
                            {league.teams.map((t) => {
                              const isFollowed = followedTeams.includes(t.id);
                              return (
                                <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isFollowed}
                                    onChange={() => toggleTeam(t.id)}
                                    className="accent-blue-600"
                                  />
                                  <span className={isFollowed ? 'text-blue-800 font-medium' : 'text-gray-700'}>
                                    {t.team || t.name || t.shortName || t.id}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {followedTeams.length > 0 && (
                  <p className="text-xs text-green-700">{followedTeams.length} team{followedTeams.length !== 1 ? 's' : ''} selected</p>
                )}
              </div>
            )}
          </fieldset>

          {/* ─── Section C: Personal Information ─── */}
          <fieldset className="rounded-lg border border-gray-200 p-4 space-y-3">
            <legend className="text-sm font-semibold text-gray-800 px-1">Personal Information (Optional)</legend>
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-sm text-blue-800">
                None of these fields are mandatory. Each field has a visibility toggle:
                <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800 border border-green-300">Social</span>
                {' '}= visible to your broader trusted friends &amp; circles,
                <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-300">Secure</span>
                {' '}= restricted to only your closest trusted contacts.
              </p>
              <p className="text-xs text-blue-700 mt-1">
                The public will never see this information. Only the circles or friends you explicitly grant access to through our Social V Secure system will have visibility.
              </p>
            </div>

            <div className="space-y-4">
              {PERSONAL_INFO_FIELDS.map((field) => {
                const visibility = personalInfo.profileFieldVisibility[field.key] || 'social';
                return (
                  <div key={field.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">{field.label}</label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleVisibilityToggle(field.key, 'social')}
                          className={`px-2 py-0.5 rounded text-xs font-semibold border transition ${
                            visibility === 'social'
                              ? 'bg-green-100 text-green-800 border-green-400'
                              : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-green-50'
                          }`}
                        >
                          Social
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVisibilityToggle(field.key, 'secure')}
                          className={`px-2 py-0.5 rounded text-xs font-semibold border transition ${
                            visibility === 'secure'
                              ? 'bg-red-100 text-red-800 border-red-400'
                              : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-red-50'
                          }`}
                        >
                          Secure
                        </button>
                      </div>
                    </div>
                    {field.type === 'select' ? (
                      <select
                        value={personalInfo[field.key]}
                        onChange={(e) => handlePersonalInfoChange(field.key, e.target.value)}
                        className="w-full border rounded p-2 text-sm"
                      >
                        <option value="">{field.placeholder}</option>
                        {(field.key === 'sex' ? SEX_OPTIONS : RACE_OPTIONS).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type}
                        value={personalInfo[field.key]}
                        onChange={(e) => handlePersonalInfoChange(field.key, e.target.value)}
                        className="w-full border rounded p-2 text-sm"
                        placeholder={field.placeholder}
                        inputMode={field.key === 'phone' ? 'tel' : undefined}
                        maxLength={field.key === 'phone' ? 14 : field.key === 'streetAddress' ? 200 : undefined}
                      />
                    )}
                  </div>
                );
              })}

              {/* Email visibility */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleVisibilityToggle('email', 'social')}
                      className={`px-2 py-0.5 rounded text-xs font-semibold border transition ${
                        (personalInfo.profileFieldVisibility.email || 'social') === 'social'
                          ? 'bg-green-100 text-green-800 border-green-400'
                          : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-green-50'
                      }`}
                    >
                      Social
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVisibilityToggle('email', 'secure')}
                      className={`px-2 py-0.5 rounded text-xs font-semibold border transition ${
                        (personalInfo.profileFieldVisibility.email || 'social') === 'secure'
                          ? 'bg-red-100 text-red-800 border-red-400'
                          : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-red-50'
                      }`}
                    >
                      Secure
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-600 bg-gray-50 border rounded p-2">{user?.email || 'Not set'}</p>
              </div>
            </div>
          </fieldset>

          <button type="submit" disabled={submitting} className="w-full bg-green-600 text-white px-4 py-3 rounded-lg font-medium disabled:opacity-50">
            {submitting ? 'Completing...' : 'Complete Onboarding'}
          </button>
        </form>
      )}
    </div>
  );
}

export default OnboardingWizard;
