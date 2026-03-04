import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { authAPI } from '../utils/api';

const PROFILE_THEMES = ['default', 'light', 'dark', 'sunset', 'forest'];
const ENCRYPTION_PASSWORD_MIN_LENGTH = 8;

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

function UserSettings({
  user,
  setUser,
  encryptionPasswordStatus,
  refreshEncryptionPasswordStatus,
  encryptionPasswordRequired
}) {
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

    const trimmedPublicKey = pgpPublicKey.trim();
    if (!trimmedPublicKey) {
      setPgpErrorMessage('Public PGP key is required.');
      return;
    }

    if (!trimmedPublicKey.includes('-----BEGIN PGP PUBLIC KEY BLOCK-----')) {
      setPgpErrorMessage('Please provide a valid PGP public key block.');
      return;
    }

    setSavingPgpPublicKey(true);
    try {
      await authAPI.setupPGP(trimmedPublicKey);
      setUser((prev) => ({
        ...(prev || {}),
        pgpPublicKey: trimmedPublicKey,
        hasPGP: true
      }));
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
        <p className="text-sm text-gray-600">
          Add your existing <span className="font-medium">public</span> key so other people can encrypt messages to you.
          Never paste or upload your private key.
        </p>

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
          placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
        />

        <button
          type="submit"
          disabled={savingPgpPublicKey}
          className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
        >
          {savingPgpPublicKey ? 'Saving...' : 'Save Public Key'}
        </button>
      </form>
    </div>
  );
}

export default UserSettings;
