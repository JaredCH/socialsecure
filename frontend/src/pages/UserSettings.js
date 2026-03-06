import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import { authAPI, chatAPI, discoveryAPI } from '../utils/api';
import { generatePGPKeyPair, validatePublicKey } from '../utils/pgp';
import FriendsManager from '../components/FriendsManager';
import RecoveryKitManager from '../components/RecoveryKitManager';

const PROFILE_THEMES = ['default', 'light', 'dark', 'sunset', 'forest'];
const SOCIAL_ACCENT_TOKENS = ['blue', 'violet', 'emerald', 'rose', 'amber'];
const SOCIAL_SECTION_IDS = ['header', 'shortcuts', 'snapshot', 'guestLookup', 'composer', 'circles', 'timeline', 'gallery', 'moderation', 'chatPanel', 'communityNotes'];
const SOCIAL_MANDATORY_SECTION_IDS = ['header'];
const SOCIAL_PRIMARY_SECTION_IDS = ['timeline', 'gallery'];
const SOCIAL_MODULE_IDS = ['marketplaceShortcut', 'calendarShortcut', 'settingsShortcut', 'referShortcut', 'chatPanel', 'communityNotes'];
const SOCIAL_SECTION_LABELS = {
  header: 'Hero Header',
  shortcuts: 'Shortcuts',
  snapshot: 'Social Snapshot',
  guestLookup: 'Guest Lookup',
  composer: 'Create Post',
  circles: 'Circles',
  timeline: 'Timeline',
  gallery: 'Gallery',
  moderation: 'Moderation Transparency',
  chatPanel: 'Chat Panel',
  communityNotes: 'Community Notes'
};
const SOCIAL_MODULE_LABELS = {
  marketplaceShortcut: 'Marketplace Shortcut',
  calendarShortcut: 'Calendar Shortcut',
  settingsShortcut: 'User Settings Shortcut',
  referShortcut: 'Refer Friend Shortcut',
  chatPanel: 'Chat Panel',
  communityNotes: 'Community Notes'
};
const THEME_TO_ALLOWED_ACCENTS = {
  default: ['blue', 'violet', 'emerald', 'rose'],
  light: ['blue', 'violet', 'emerald'],
  dark: ['blue', 'violet', 'emerald', 'rose', 'amber'],
  sunset: ['rose', 'amber', 'violet'],
  forest: ['emerald', 'blue', 'amber']
};
const THEME_TO_DEFAULT_ACCENT = {
  default: 'blue',
  light: 'violet',
  dark: 'emerald',
  sunset: 'rose',
  forest: 'emerald'
};
const ENCRYPTION_PASSWORD_MIN_LENGTH = 8;
const MAX_PGP_PUBLIC_KEY_LENGTH = 20000;
const PGP_PUBLIC_KEY_BEGIN = '-----BEGIN PGP PUBLIC KEY BLOCK-----';
const PGP_PUBLIC_KEY_END = '-----END PGP PUBLIC KEY BLOCK-----';
const PGP_PRIVATE_KEY_BEGIN = '-----BEGIN PGP PRIVATE KEY BLOCK-----';
const PGP_PRIVATE_KEY_END = '-----END PGP PRIVATE KEY BLOCK-----';

const linksToText = (links) => {
  if (!Array.isArray(links)) return '';
  return links
    .map((link) => {
      if (typeof link === 'string') return link;
      if (link && typeof link === 'object' && typeof link.url === 'string') return link.url;
      return '';
    })
    .filter(Boolean)
    .join('\n');
};

const textToLinks = (value) => {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
};

const normalizePgpPublicKey = (value) => {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim();
};

const uniqueStrings = (items) => {
  if (!Array.isArray(items)) return [];
  return [...new Set(items.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
};

const getDefaultSocialPreferences = (profileTheme = 'default') => {
  const resolvedTheme = PROFILE_THEMES.includes(profileTheme) ? profileTheme : 'default';
  return {
    themePreset: resolvedTheme,
    accentColorToken: THEME_TO_DEFAULT_ACCENT[resolvedTheme] || 'blue',
    sectionOrder: [...SOCIAL_SECTION_IDS],
    hiddenSections: [],
    hiddenModules: [],
    version: 1
  };
};

const normalizeSocialPreferences = (input, profileTheme = 'default') => {
  const defaults = getDefaultSocialPreferences(profileTheme);
  const value = input && typeof input === 'object' ? input : {};
  const themePreset = PROFILE_THEMES.includes(value.themePreset) ? value.themePreset : defaults.themePreset;
  const allowedAccents = THEME_TO_ALLOWED_ACCENTS[themePreset] || THEME_TO_ALLOWED_ACCENTS.default;
  const accentColorToken = allowedAccents.includes(value.accentColorToken)
    ? value.accentColorToken
    : (allowedAccents.includes(defaults.accentColorToken) ? defaults.accentColorToken : allowedAccents[0]);
  const requestedOrder = uniqueStrings(value.sectionOrder).filter((id) => SOCIAL_SECTION_IDS.includes(id));
  const sectionOrder = [...requestedOrder, ...SOCIAL_SECTION_IDS.filter((id) => !requestedOrder.includes(id))];
  const hiddenSections = uniqueStrings(value.hiddenSections)
    .filter((id) => SOCIAL_SECTION_IDS.includes(id))
    .filter((id) => !SOCIAL_MANDATORY_SECTION_IDS.includes(id));
  if (SOCIAL_PRIMARY_SECTION_IDS.every((id) => hiddenSections.includes(id))) {
    const restoreSectionId = SOCIAL_PRIMARY_SECTION_IDS[0];
    const restoreIndex = hiddenSections.indexOf(restoreSectionId);
    if (restoreIndex >= 0) hiddenSections.splice(restoreIndex, 1);
  }
  const hiddenModules = uniqueStrings(value.hiddenModules).filter((id) => SOCIAL_MODULE_IDS.includes(id));
  return {
    themePreset,
    accentColorToken,
    sectionOrder,
    hiddenSections,
    hiddenModules,
    version: Number.isInteger(value.version) && value.version > 0 ? value.version : 1
  };
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

function UserSettings({
  user,
  setUser,
  encryptionPasswordStatus,
  refreshEncryptionPasswordStatus,
  encryptionPasswordRequired
}) {
  const location = useLocation();
  const cameFromDeprecatedPgpRoute = new URLSearchParams(location.search).get('deprecated') === 'pgp';
  const [form, setForm] = useState({
    realName: '',
    city: '',
    state: '',
    country: '',
    bio: '',
    avatarUrl: '',
    bannerUrl: '',
    linksText: '',
    profileTheme: 'default',
    socialPagePreferences: getDefaultSocialPreferences('default')
  });
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [encryptionForm, setEncryptionForm] = useState({
    currentEncryptionPassword: '',
    encryptionPassword: '',
    confirmEncryptionPassword: ''
  });
  const [savingEncryptionPassword, setSavingEncryptionPassword] = useState(false);
  const [encryptionErrorMessage, setEncryptionErrorMessage] = useState('');
  const [encryptionSuccessMessage, setEncryptionSuccessMessage] = useState('');
  const [pgpPublicKey, setPgpPublicKey] = useState('');
  const [savingPgpPublicKey, setSavingPgpPublicKey] = useState(false);
  const [pgpErrorMessage, setPgpErrorMessage] = useState('');
  const [pgpSuccessMessage, setPgpSuccessMessage] = useState('');
  const [pgpGenerationForm, setPgpGenerationForm] = useState({
    name: '',
    email: '',
    passphrase: '',
    confirmPassphrase: ''
  });
  const [generatingPgpKey, setGeneratingPgpKey] = useState(false);
  const [generatedPrivateKey, setGeneratedPrivateKey] = useState('');
  const [profileThreadId, setProfileThreadId] = useState('');
  const [profileThreadMessages, setProfileThreadMessages] = useState([]);
  const [profileThreadLoading, setProfileThreadLoading] = useState(false);
  const [profileThreadInput, setProfileThreadInput] = useState('');
  const [profileThreadSending, setProfileThreadSending] = useState(false);

  const hasEncryptionPassword = !!encryptionPasswordStatus?.hasEncryptionPassword;
  const profileUserId = user?._id || null;

  useEffect(() => {
    if (!user) return;
    setForm({
      realName: user.realName || '',
      city: user.city || '',
      state: user.state || '',
      country: user.country || '',
      bio: user.bio || '',
      avatarUrl: user.avatarUrl || '',
      bannerUrl: user.bannerUrl || '',
      linksText: linksToText(user.links),
      profileTheme: user.profileTheme || 'default',
      socialPagePreferences: normalizeSocialPreferences(
        user.socialPagePreferences,
        user.profileTheme || 'default'
      )
    });
    setPgpPublicKey(user.pgpPublicKey || '');
    setPgpGenerationForm((prev) => ({
      ...prev,
      name: prev.name || user.realName || ''
    }));
  }, [user]);

  useEffect(() => {
    const loadProfileThread = async () => {
      if (!profileUserId) return;
      setProfileThreadLoading(true);
      try {
        const { data: threadData } = await chatAPI.getProfileThread(profileUserId);
        const threadId = threadData?.conversation?._id ? String(threadData.conversation._id) : '';
        setProfileThreadId(threadId);
        if (!threadId) {
          setProfileThreadMessages([]);
          return;
        }
        const { data: messageData } = await chatAPI.getConversationMessages(threadId, 1, 20);
        setProfileThreadMessages(Array.isArray(messageData?.messages) ? messageData.messages : []);
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to load profile thread');
      } finally {
        setProfileThreadLoading(false);
      }
    };

    loadProfileThread();
  }, [profileUserId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      if (name === 'profileTheme') {
        const normalizedSocialPreferences = normalizeSocialPreferences(
          {
            ...prev.socialPagePreferences,
            themePreset: value
          },
          value
        );
        return {
          ...prev,
          profileTheme: value,
          socialPagePreferences: normalizedSocialPreferences
        };
      }

      return { ...prev, [name]: value };
    });
  };

  const trackCustomizationEvent = async (eventType, metadata = {}) => {
    try {
      await discoveryAPI.trackEvent(eventType, metadata);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Failed to track customization event', eventType, error?.message || error);
      }
    }
  };

  const handleTogglePreview = () => {
    setPreviewOpen((prev) => {
      const next = !prev;
      if (next) {
        trackCustomizationEvent('social_customization_preview_opened', { source: 'settings' });
      }
      return next;
    });
  };

  const updateSocialPreferences = (updater) => {
    setForm((prev) => ({
      ...prev,
      socialPagePreferences: normalizeSocialPreferences(
        typeof updater === 'function'
          ? updater(prev.socialPagePreferences)
          : updater,
        prev.profileTheme
      )
    }));
  };

  const handleToggleSection = (sectionId) => {
    if (SOCIAL_MANDATORY_SECTION_IDS.includes(sectionId)) return;
    updateSocialPreferences((prev) => {
      const isHidden = prev.hiddenSections.includes(sectionId);
      return {
        ...prev,
        hiddenSections: isHidden
          ? prev.hiddenSections.filter((id) => id !== sectionId)
          : [...prev.hiddenSections, sectionId]
      };
    });
  };

  const handleMoveSection = (sectionId, direction) => {
    updateSocialPreferences((prev) => {
      const currentIndex = prev.sectionOrder.indexOf(sectionId);
      if (currentIndex === -1) return prev;
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= prev.sectionOrder.length) return prev;
      const nextOrder = [...prev.sectionOrder];
      [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];
      return {
        ...prev,
        sectionOrder: nextOrder
      };
    });
  };

  const handleToggleModule = (moduleId) => {
    updateSocialPreferences((prev) => {
      const isHidden = prev.hiddenModules.includes(moduleId);
      return {
        ...prev,
        hiddenModules: isHidden
          ? prev.hiddenModules.filter((id) => id !== moduleId)
          : [...prev.hiddenModules, moduleId]
      };
    });
  };

  const handleResetSocialPreferences = () => {
    setForm((prev) => ({
      ...prev,
      socialPagePreferences: getDefaultSocialPreferences(prev.profileTheme)
    }));
    trackCustomizationEvent('social_customization_reset', { source: 'settings' });
    toast.success('Social page customization reset');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const payload = {
        ...form,
        links: textToLinks(form.linksText),
        socialPagePreferences: normalizeSocialPreferences(form.socialPagePreferences, form.profileTheme)
      };
      delete payload.linksText;

      const { data } = await authAPI.updateProfile(payload);
      setUser(data.user);
      if (Object.prototype.hasOwnProperty.call(payload, 'socialPagePreferences')) {
        trackCustomizationEvent('social_customization_saved', {
          source: 'settings',
          themePreset: payload.socialPagePreferences.themePreset
        });
      }
      setSuccessMessage('Profile updated successfully.');
      toast.success('Profile updated');
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.errors?.[0]?.msg || 'Failed to update profile';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleEncryptionFieldChange = (e) => {
    setEncryptionForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const clearEncryptionForm = () => {
    setEncryptionForm({
      currentEncryptionPassword: '',
      encryptionPassword: '',
      confirmEncryptionPassword: ''
    });
  };

  const handleSaveEncryptionPassword = async (e) => {
    e.preventDefault();
    setEncryptionErrorMessage('');
    setEncryptionSuccessMessage('');

    const { currentEncryptionPassword, encryptionPassword, confirmEncryptionPassword } = encryptionForm;

    if (encryptionPassword.length < ENCRYPTION_PASSWORD_MIN_LENGTH) {
      setEncryptionErrorMessage(`Encryption password must be at least ${ENCRYPTION_PASSWORD_MIN_LENGTH} characters.`);
      return;
    }

    if (encryptionPassword !== confirmEncryptionPassword) {
      setEncryptionErrorMessage('Encryption password confirmation does not match.');
      return;
    }

    if (hasEncryptionPassword && !currentEncryptionPassword) {
      setEncryptionErrorMessage('Current encryption password is required to change it.');
      return;
    }

    if (hasEncryptionPassword && currentEncryptionPassword === encryptionPassword) {
      setEncryptionErrorMessage('New encryption password must be different from current password.');
      return;
    }

    setSavingEncryptionPassword(true);
    try {
      if (!hasEncryptionPassword) {
        await authAPI.setEncryptionPassword({
          encryptionPassword,
          confirmEncryptionPassword
        });
      } else {
        await authAPI.changeEncryptionPassword({
          currentEncryptionPassword,
          newEncryptionPassword: encryptionPassword,
          confirmNewEncryptionPassword: confirmEncryptionPassword
        });
      }

      await refreshEncryptionPasswordStatus();
      setUser((prev) => ({
        ...(prev || {}),
        hasEncryptionPassword: true
      }));
      clearEncryptionForm();

      const success = hasEncryptionPassword
        ? 'Encryption password changed successfully.'
        : 'Encryption password set successfully.';
      setEncryptionSuccessMessage(success);
      toast.success(success);
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.errors?.[0]?.msg || 'Failed to update encryption password';
      setEncryptionErrorMessage(message);
      toast.error(message);
    } finally {
      setSavingEncryptionPassword(false);
    }
  };

  const handleSavePgpPublicKey = async (e) => {
    e.preventDefault();
    setPgpErrorMessage('');
    setPgpSuccessMessage('');

    const normalizedPublicKey = normalizePgpPublicKey(pgpPublicKey);
    const basicValidationError = getPgpPublicKeyValidationError(normalizedPublicKey);
    if (basicValidationError) {
      setPgpErrorMessage(basicValidationError);
      return;
    }

    const parsedValidation = await validatePublicKey(normalizedPublicKey);
    if (!parsedValidation.valid) {
      setPgpErrorMessage('Public key format is invalid or unreadable. Please verify the armored public key block.');
      return;
    }

    setSavingPgpPublicKey(true);
    try {
      await authAPI.setupPGP(normalizedPublicKey);
      setUser((prev) => ({
        ...(prev || {}),
        pgpPublicKey: normalizedPublicKey,
        hasPGP: true
      }));
      setPgpPublicKey(normalizedPublicKey);
      setPgpSuccessMessage('Public PGP key saved successfully.');
      toast.success('Public PGP key saved');
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to save public PGP key';
      setPgpErrorMessage(message);
      toast.error(message);
    } finally {
      setSavingPgpPublicKey(false);
    }
  };

  const handlePgpGenerationFieldChange = (e) => {
    setPgpGenerationForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleGeneratePgpKeyPair = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setPgpErrorMessage('');
    setPgpSuccessMessage('');

    const { name, email, passphrase, confirmPassphrase } = pgpGenerationForm;

    if (!name.trim()) {
      setPgpErrorMessage('Name is required to generate a key pair.');
      return;
    }

    if (!email.trim()) {
      setPgpErrorMessage('Email is required to generate a key pair.');
      return;
    }

    if (!passphrase || passphrase.length < ENCRYPTION_PASSWORD_MIN_LENGTH) {
      setPgpErrorMessage(`Passphrase must be at least ${ENCRYPTION_PASSWORD_MIN_LENGTH} characters.`);
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setPgpErrorMessage('Passphrase confirmation does not match.');
      return;
    }

    setGeneratingPgpKey(true);
    try {
      const { privateKey, publicKey } = await generatePGPKeyPair(name.trim(), email.trim(), passphrase);
      setGeneratedPrivateKey(privateKey);
      setPgpPublicKey(publicKey);
      setPgpSuccessMessage('PGP key pair generated locally. Save your private key now, then submit your public key below.');
      toast.success('PGP key pair generated locally');
    } catch {
      setPgpErrorMessage('Failed to generate PGP key pair locally.');
      toast.error('PGP key generation failed');
    } finally {
      setGeneratingPgpKey(false);
    }
  };

  const handleDownloadPrivateKey = () => {
    if (!generatedPrivateKey) {
      return;
    }

    const blob = new Blob([generatedPrivateKey], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'socialsecure-private-key.asc';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSendProfileThreadMessage = async (event) => {
    event.preventDefault();
    const trimmed = profileThreadInput.trim();
    if (!trimmed || !profileThreadId) return;

    setProfileThreadSending(true);
    try {
      const { data } = await chatAPI.sendConversationMessage(profileThreadId, trimmed);
      setProfileThreadMessages((prev) => [...prev, data.message]);
      setProfileThreadInput('');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send profile thread message');
    } finally {
      setProfileThreadSending(false);
    }
  };

  if (!user) {
    return <div className="bg-white p-6 rounded shadow">Loading profile...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto bg-white rounded shadow p-6 space-y-4">
      <h2 className="text-xl font-semibold">User Settings</h2>

      {encryptionPasswordRequired ? (
        <div className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded p-3" role="alert">
          You must set an encryption password before you can use the rest of the app.
        </div>
      ) : null}

      {cameFromDeprecatedPgpRoute ? (
        <div className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded p-3" role="status">
          The standalone PGP tools page has been deprecated. Public PGP key setup now lives in User Settings.
        </div>
      ) : null}

      <div className="text-sm text-gray-700 bg-gray-50 border rounded p-3">
        <p><span className="font-semibold">Username:</span> @{user.username}</p>
        <p><span className="font-semibold">Registration:</span> {user.registrationStatus}</p>
        <p><span className="font-semibold">PGP Enabled:</span> {user.hasPGP ? 'Yes' : 'No'}</p>
        <p><span className="font-semibold">Encryption Password:</span> {hasEncryptionPassword ? 'Set' : 'Not set'}</p>
      </div>

      <form onSubmit={handleSaveEncryptionPassword} className="space-y-3 border rounded p-4 bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-800">
          {hasEncryptionPassword ? 'Change Encryption Password' : 'Set Encryption Password'}
        </h3>
        <p className="text-sm text-gray-600">
          This password is required to unlock full app usage and should be at least {ENCRYPTION_PASSWORD_MIN_LENGTH} characters.
        </p>

        {encryptionErrorMessage ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3" role="alert">
            {encryptionErrorMessage}
          </div>
        ) : null}
        {encryptionSuccessMessage ? (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3" role="status">
            {encryptionSuccessMessage}
          </div>
        ) : null}

        {hasEncryptionPassword ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Encryption Password</label>
            <input
              type="password"
              name="currentEncryptionPassword"
              value={encryptionForm.currentEncryptionPassword}
              onChange={handleEncryptionFieldChange}
              className="w-full border rounded p-2"
              autoComplete="current-password"
              required
            />
          </div>
        ) : null}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {hasEncryptionPassword ? 'New Encryption Password' : 'Encryption Password'}
          </label>
          <input
            type="password"
            name="encryptionPassword"
            value={encryptionForm.encryptionPassword}
            onChange={handleEncryptionFieldChange}
            className="w-full border rounded p-2"
            autoComplete="new-password"
            minLength={ENCRYPTION_PASSWORD_MIN_LENGTH}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {hasEncryptionPassword ? 'Confirm New Encryption Password' : 'Confirm Encryption Password'}
          </label>
          <input
            type="password"
            name="confirmEncryptionPassword"
            value={encryptionForm.confirmEncryptionPassword}
            onChange={handleEncryptionFieldChange}
            className="w-full border rounded p-2"
            autoComplete="new-password"
            minLength={ENCRYPTION_PASSWORD_MIN_LENGTH}
            required
          />
        </div>

        <button
          type="submit"
          disabled={savingEncryptionPassword}
          className="bg-indigo-600 text-white rounded px-4 py-2 disabled:opacity-50"
        >
          {savingEncryptionPassword
            ? (hasEncryptionPassword ? 'Changing...' : 'Setting...')
            : (hasEncryptionPassword ? 'Change Encryption Password' : 'Set Encryption Password')}
        </button>
      </form>

      <form onSubmit={handleSave} className="space-y-3">
        {errorMessage ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3" role="alert">
            {errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3" role="status">
            {successMessage}
          </div>
        ) : null}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Real Name</label>
          <input name="realName" value={form.realName} onChange={handleChange} className="w-full border rounded p-2" required />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
          <textarea
            name="bio"
            value={form.bio}
            onChange={handleChange}
            className="w-full border rounded p-2"
            rows={4}
            maxLength={500}
            placeholder="Tell people about yourself"
          />
          <p className="text-xs text-gray-500 mt-1">{form.bio.length}/500</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Avatar URL</label>
            <input
              name="avatarUrl"
              value={form.avatarUrl}
              onChange={handleChange}
              className="w-full border rounded p-2"
              placeholder="https://example.com/avatar.jpg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Banner URL</label>
            <input
              name="bannerUrl"
              value={form.bannerUrl}
              onChange={handleChange}
              className="w-full border rounded p-2"
              placeholder="https://example.com/banner.jpg"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Links (one URL per line, up to 10)</label>
          <textarea
            name="linksText"
            value={form.linksText}
            onChange={handleChange}
            className="w-full border rounded p-2"
            rows={4}
            placeholder="https://example.com\nhttps://github.com/username"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Profile Theme</label>
          <select
            name="profileTheme"
            value={form.profileTheme}
            onChange={handleChange}
            className="w-full border rounded p-2"
          >
            {PROFILE_THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {theme}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3 border rounded p-4 bg-gray-50">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-800">Social Page Customization</h3>
            <button
              type="button"
              onClick={handleResetSocialPreferences}
              className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
            >
              Reset defaults
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Accent Color Token</label>
            <select
              value={form.socialPagePreferences?.accentColorToken || 'blue'}
              onChange={(event) => {
                updateSocialPreferences((prev) => ({
                  ...prev,
                  accentColorToken: event.target.value
                }));
              }}
              className="w-full border rounded p-2"
            >
              {(THEME_TO_ALLOWED_ACCENTS[form.socialPagePreferences?.themePreset || form.profileTheme] || SOCIAL_ACCENT_TOKENS)
                .map((token) => (
                  <option key={token} value={token}>
                    {token}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Section Visibility</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {SOCIAL_SECTION_IDS.map((sectionId) => {
                const isMandatory = SOCIAL_MANDATORY_SECTION_IDS.includes(sectionId);
                const isChecked = !(form.socialPagePreferences?.hiddenSections || []).includes(sectionId);
                return (
                  <label key={sectionId} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isMandatory}
                      onChange={() => handleToggleSection(sectionId)}
                    />
                    <span>{SOCIAL_SECTION_LABELS[sectionId] || sectionId}</span>
                    {isMandatory ? <span className="text-xs text-gray-500">(required)</span> : null}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Section Order</p>
            <ul className="space-y-1">
              {(form.socialPagePreferences?.sectionOrder || []).map((sectionId, index, arr) => (
                <li key={sectionId} className="flex items-center justify-between border rounded bg-white px-3 py-2 text-sm">
                  <span>{SOCIAL_SECTION_LABELS[sectionId] || sectionId}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleMoveSection(sectionId, 'up')}
                      disabled={index === 0}
                      className="px-2 py-1 border rounded text-xs disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveSection(sectionId, 'down')}
                      disabled={index === arr.length - 1}
                      className="px-2 py-1 border rounded text-xs disabled:opacity-40"
                    >
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Optional Module Visibility</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {SOCIAL_MODULE_IDS.map((moduleId) => (
                <label key={moduleId} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={!(form.socialPagePreferences?.hiddenModules || []).includes(moduleId)}
                    onChange={() => handleToggleModule(moduleId)}
                  />
                  <span>{SOCIAL_MODULE_LABELS[moduleId] || moduleId}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleTogglePreview}
              className="text-sm px-3 py-1.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              {previewOpen ? 'Hide Live Preview' : 'Show Live Preview'}
            </button>
            {previewOpen ? (
              <div className="border rounded-lg bg-white p-3 space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Live preview (saved layout)</p>
                <p className="text-sm text-gray-700">
                  Theme: <span className="font-medium">{form.socialPagePreferences?.themePreset}</span> · Accent:{' '}
                  <span className="font-medium">{form.socialPagePreferences?.accentColorToken}</span>
                </p>
                <div className="space-y-1">
                  {(form.socialPagePreferences?.sectionOrder || [])
                    .filter((sectionId) => !(form.socialPagePreferences?.hiddenSections || []).includes(sectionId))
                    .map((sectionId) => (
                      <div key={`preview-${sectionId}`} className="rounded border bg-gray-50 px-3 py-2 text-sm text-gray-700">
                        {SOCIAL_SECTION_LABELS[sectionId] || sectionId}
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input name="city" value={form.city} onChange={handleChange} className="w-full border rounded p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <input name="state" value={form.state} onChange={handleChange} className="w-full border rounded p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
            <input name="country" value={form.country} onChange={handleChange} className="w-full border rounded p-2" />
          </div>
        </div>

        <button type="submit" disabled={saving} className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      <form onSubmit={handleSavePgpPublicKey} className="space-y-3 border rounded p-4 bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-800">Public PGP Key</h3>
        <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded p-3" role="alert">
          <span className="font-semibold">Security warning:</span> never paste or upload your private key here.
          Only your <span className="font-semibold">public key</span> is accepted and stored.
        </div>

        <div className="space-y-3 border rounded p-3 bg-white">
          <h4 className="font-semibold text-gray-800">Generate key pair locally (optional)</h4>
          <p className="text-xs text-gray-600">
            This happens in your browser. Your private key is never sent to the server.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              name="name"
              value={pgpGenerationForm.name}
              onChange={handlePgpGenerationFieldChange}
              className="w-full border rounded p-2"
              placeholder="Name"
            />
            <input
              name="email"
              value={pgpGenerationForm.email}
              onChange={handlePgpGenerationFieldChange}
              className="w-full border rounded p-2"
              placeholder="Email"
              type="email"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              name="passphrase"
              value={pgpGenerationForm.passphrase}
              onChange={handlePgpGenerationFieldChange}
              className="w-full border rounded p-2"
              placeholder="Key passphrase"
              type="password"
              minLength={ENCRYPTION_PASSWORD_MIN_LENGTH}
            />
            <input
              name="confirmPassphrase"
              value={pgpGenerationForm.confirmPassphrase}
              onChange={handlePgpGenerationFieldChange}
              className="w-full border rounded p-2"
              placeholder="Confirm passphrase"
              type="password"
              minLength={ENCRYPTION_PASSWORD_MIN_LENGTH}
            />
          </div>

          <button
            type="button"
            onClick={handleGeneratePgpKeyPair}
            disabled={generatingPgpKey}
            className="bg-indigo-600 text-white rounded px-4 py-2 disabled:opacity-50"
          >
            {generatingPgpKey ? 'Generating...' : 'Generate Key Pair Locally'}
          </button>

          {generatedPrivateKey ? (
            <div className="space-y-2 border border-yellow-300 bg-yellow-50 rounded p-3">
              <p className="text-xs text-yellow-900">
                Private key generated. Save it securely now. It is not sent to the server.
              </p>
              <textarea
                readOnly
                value={generatedPrivateKey}
                className="w-full border rounded p-2 font-mono text-xs"
                rows={6}
              />
              <div className="space-x-2">
                <button
                  type="button"
                  onClick={handleDownloadPrivateKey}
                  className="bg-gray-800 text-white rounded px-3 py-1 text-sm"
                >
                  Download Private Key
                </button>
                <button
                  type="button"
                  onClick={() => setGeneratedPrivateKey('')}
                  className="bg-gray-200 text-gray-800 rounded px-3 py-1 text-sm"
                >
                  Clear Private Key from Screen
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {pgpErrorMessage ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3" role="alert">
            {pgpErrorMessage}
          </div>
        ) : null}

        {pgpSuccessMessage ? (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3" role="status">
            {pgpSuccessMessage}
          </div>
        ) : null}

        <textarea
          value={pgpPublicKey}
          onChange={(e) => setPgpPublicKey(e.target.value)}
          className="w-full border rounded p-2 font-mono text-xs"
          rows={8}
          maxLength={MAX_PGP_PUBLIC_KEY_LENGTH}
          placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
        />
        <p className="text-xs text-gray-500">{pgpPublicKey.length}/{MAX_PGP_PUBLIC_KEY_LENGTH} characters</p>

        <button
          type="submit"
          disabled={savingPgpPublicKey}
          className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
        >
          {savingPgpPublicKey ? 'Saving...' : 'Save Public Key'}
        </button>
      </form>

      <div className="space-y-3 border rounded p-4 bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-800">Profile Thread Chat</h3>
        <p className="text-sm text-gray-600">
          This is the same profile-specific thread available from the Chat hub.
        </p>
        <div className="max-h-48 overflow-y-auto border rounded p-2 bg-white space-y-2">
          {profileThreadLoading ? (
            <p className="text-sm text-gray-500">Loading profile thread...</p>
          ) : profileThreadMessages.length === 0 ? (
            <p className="text-sm text-gray-500">No profile thread messages yet.</p>
          ) : (
            profileThreadMessages.map((message) => (
              <div key={String(message._id)} className="text-sm">
                <div className="text-xs text-gray-500">
                  @{message.userId?.username || message.userId?.realName || 'user'} · {new Date(message.createdAt).toLocaleString()}
                </div>
                <div className="whitespace-pre-wrap">{message.content}</div>
              </div>
            ))
          )}
        </div>
        <form onSubmit={handleSendProfileThreadMessage} className="flex gap-2">
          <input
            value={profileThreadInput}
            onChange={(event) => setProfileThreadInput(event.target.value)}
            className="flex-1 border rounded p-2"
            maxLength={2000}
            placeholder="Message on your profile thread"
            disabled={!profileThreadId || profileThreadSending}
          />
          <button
            type="submit"
            className="bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50"
            disabled={!profileThreadId || !profileThreadInput.trim() || profileThreadSending}
          >
            {profileThreadSending ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>

      {/* Friends Management Section */}
      <div className="mt-8">
        <FriendsManager currentUser={user} onUserUpdate={setUser} />
      </div>

      {/* Recovery Kit Section */}
      <div className="mt-8">
        <RecoveryKitManager
          encryptionPassword={encryptionForm.encryptionPassword || encryptionForm.currentEncryptionPassword}
          pgpPrivateKey={generatedPrivateKey}
          userId={user?._id}
          username={user?.username}
        />
      </div>
    </div>
  );
}

export default UserSettings;
