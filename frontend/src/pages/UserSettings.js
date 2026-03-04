import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import { authAPI } from '../utils/api';
import { generatePGPKeyPair, validatePublicKey } from '../utils/pgp';
import FriendsManager from '../components/FriendsManager';

const PROFILE_THEMES = ['default', 'light', 'dark', 'sunset', 'forest'];
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
    profileTheme: 'default'
  });
  const [saving, setSaving] = useState(false);
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

  const hasEncryptionPassword = !!encryptionPasswordStatus?.hasEncryptionPassword;

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
      profileTheme: user.profileTheme || 'default'
    });
    setPgpPublicKey(user.pgpPublicKey || '');
    setPgpGenerationForm((prev) => ({
      ...prev,
      name: prev.name || user.realName || ''
    }));
  }, [user]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const payload = {
        ...form,
        links: textToLinks(form.linksText)
      };
      delete payload.linksText;

      const { data } = await authAPI.updateProfile(payload);
      setUser(data.user);
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

      {/* Friends Management Section */}
      <div className="mt-8">
        <FriendsManager currentUser={user} onUserUpdate={setUser} />
      </div>
    </div>
  );
}

export default UserSettings;
