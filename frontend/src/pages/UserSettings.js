import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import { authAPI, chatAPI } from '../utils/api';
import { generatePGPKeyPair, validatePublicKey } from '../utils/pgp';
import FriendsManager from '../components/FriendsManager';
import RecoveryKitManager from '../components/RecoveryKitManager';
import SecurityScore from '../components/SecurityScore';
import PasswordField from '../components/PasswordField';

const ENCRYPTION_PASSWORD_MIN_LENGTH = 8;
const MAX_PGP_PUBLIC_KEY_LENGTH = 20000;
const PGP_PUBLIC_KEY_BEGIN = '-----BEGIN PGP PUBLIC KEY BLOCK-----';
const PGP_PUBLIC_KEY_END = '-----END PGP PUBLIC KEY BLOCK-----';
const PGP_PRIVATE_KEY_BEGIN = '-----BEGIN PGP PRIVATE KEY BLOCK-----';
const PGP_PRIVATE_KEY_END = '-----END PGP PRIVATE KEY BLOCK-----';
const SETTINGS_SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'profile', label: 'Profile' },
  { id: 'encryption', label: 'Encryption' },
  { id: 'security', label: 'Security center' },
  { id: 'pgp', label: 'PGP tools' },
  { id: 'messages', label: 'Profile thread' },
  { id: 'friends', label: 'Friends' },
  { id: 'recovery', label: 'Recovery kit' }
];

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

export const getSettingsSectionFromHash = (hash) => {
  const normalized = String(hash || '').replace(/^#/, '');
  if (SETTINGS_SECTIONS.some((section) => section.id === normalized)) {
    return normalized;
  }
  return SETTINGS_SECTIONS[0]?.id || 'account';
};

export const formatSecurityEventType = (eventType) => {
  const normalized = String(eventType || '').trim();
  if (!normalized) return 'Unknown event';
  return normalized
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');
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
    enableMaturityWordCensor: true
  });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [savingAccountPassword, setSavingAccountPassword] = useState(false);
  const [accountPasswordError, setAccountPasswordError] = useState('');
  const [accountPasswordSuccess, setAccountPasswordSuccess] = useState('');
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
  const [activeSection, setActiveSection] = useState(getSettingsSectionFromHash(location.hash));
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityData, setSecurityData] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [events, setEvents] = useState([]);
  const [respondingAddressRequestId, setRespondingAddressRequestId] = useState('');

  const hasEncryptionPassword = !!encryptionPasswordStatus?.hasEncryptionPassword;
  const profileUserId = user?._id || null;
  const activeDeviceKeys = useMemo(() => devices.filter((device) => !device.isRevoked), [devices]);

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
      enableMaturityWordCensor: user.enableMaturityWordCensor !== false
    });
    setPgpPublicKey(user.pgpPublicKey || '');
    setPgpGenerationForm((prev) => ({
      ...prev,
      name: prev.name || user.realName || ''
    }));
  }, [user]);

  useEffect(() => {
    setActiveSection(getSettingsSectionFromHash(location.hash));
  }, [location.hash]);

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
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
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

  const handlePasswordFieldChange = (e) => {
    setPasswordForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSaveAccountPassword = async (e) => {
    e.preventDefault();
    setSavingAccountPassword(true);
    setAccountPasswordError('');
    setAccountPasswordSuccess('');

    try {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        setAccountPasswordError('Password confirmation does not match.');
        return;
      }

      const { data } = await authAPI.changePassword(passwordForm);
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setAccountPasswordSuccess('Login password updated successfully.');
      if (typeof setUser === 'function' && data?.user) {
        setUser(data.user);
      }
      toast.success('Password changed');
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.errors?.[0]?.msg || 'Failed to change account password';
      setAccountPasswordError(message);
      toast.error(message);
    } finally {
      setSavingAccountPassword(false);
    }
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

  const loadSecurityData = useCallback(async () => {
    setSecurityLoading(true);
    try {
      const [securityRes, sessionsRes, devicesRes, eventsRes] = await Promise.all([
        authAPI.getSecurityCenter(),
        authAPI.getSessions(),
        authAPI.getDeviceKeys(),
        authAPI.getSecurityEvents(1, 50)
      ]);

      setSecurityData(securityRes.data);
      setSessions(sessionsRes.data.sessions || []);
      setDevices(devicesRes.data.devices || []);
      setEvents(eventsRes.data.events || []);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load security center');
    } finally {
      setSecurityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!profileUserId) return;
    loadSecurityData();
  }, [loadSecurityData, profileUserId]);

  const handleSectionClick = (sectionId) => {
    setActiveSection(sectionId);
    const target = document.getElementById(`settings-section-${sectionId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (window.history?.replaceState) {
      window.history.replaceState(null, '', `${window.location.pathname}#${sectionId}`);
    } else {
      window.location.hash = sectionId;
    }
  };

  const revokeSession = async (sessionId) => {
    try {
      await authAPI.revokeSession(sessionId);
      toast.success('Session revoked');
      await loadSecurityData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to revoke session');
    }
  };

  const revokeAllOthers = async () => {
    try {
      await authAPI.revokeAllOtherSessions();
      toast.success('Other sessions revoked');
      await loadSecurityData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to revoke sessions');
    }
  };

  const revokeDevice = async (deviceId) => {
    try {
      await authAPI.revokeDeviceKey(deviceId);
      toast.success('Device key revoked');
      await loadSecurityData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to revoke device key');
    }
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

  const handleAddressApprovalDecision = async (requestId, decision) => {
    setRespondingAddressRequestId(requestId);
    try {
      const { data } = await authAPI.respondToAddressApproval(requestId, decision);
      if (data?.user && typeof setUser === 'function') {
        setUser(data.user);
      }
      toast.success(decision === 'approved' ? 'Address approved' : 'Address denied');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to respond to address request');
    } finally {
      setRespondingAddressRequestId('');
    }
  };

  if (!user) {
    return <div className="bg-white p-6 rounded shadow">Loading profile...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 pb-8">
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-xl">
        <h2 className="text-2xl font-semibold">User Settings</h2>
        <p className="mt-2 text-sm text-blue-100">
          Manage your profile, privacy, and account security from one place.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Sections</p>
            <div className="space-y-1">
              {SETTINGS_SECTIONS.map((section) => {
                const isActive = section.id === activeSection;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => handleSectionClick(section.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {section.label}
                  </button>
                );
              })}
            </div>
          </nav>
        </aside>

        <div className="space-y-6">
          <section id="settings-section-account" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            {encryptionPasswordRequired ? (
              <div className="mb-3 text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded p-3" role="alert">
                You must set an encryption password before you can use the rest of the app.
              </div>
            ) : null}
            {cameFromDeprecatedPgpRoute ? (
              <div className="mb-3 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded p-3" role="status">
                The standalone PGP tools page has been deprecated. Public PGP key setup now lives in User Settings.
              </div>
            ) : null}
            <h3 className="text-lg font-semibold text-gray-900">Account overview</h3>
            <div className="mt-3 grid gap-3 text-sm text-gray-700 md:grid-cols-2">
              <p className="rounded border border-gray-200 bg-gray-50 p-3"><span className="font-semibold">Username:</span> @{user.username}</p>
              <p className="rounded border border-gray-200 bg-gray-50 p-3"><span className="font-semibold">Registration:</span> {user.registrationStatus}</p>
              <p className="rounded border border-gray-200 bg-gray-50 p-3"><span className="font-semibold">PGP Enabled:</span> {user.hasPGP ? 'Yes' : 'No'}</p>
              <p className="rounded border border-gray-200 bg-gray-50 p-3"><span className="font-semibold">Encryption Password:</span> {hasEncryptionPassword ? 'Set' : 'Not set'}</p>
            </div>
            {user.mustResetPassword ? (
              <div className="mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded p-3" role="alert">
                Your password was reset by an administrator. You must set a new password now.
              </div>
            ) : null}
            {user.pendingStreetAddressStatus === 'pending' && user.pendingStreetAddress ? (
              <div className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3" role="status">
                Your address <span className="font-medium">{user.pendingStreetAddress}</span> is pending approval from an existing resident.
              </div>
            ) : null}
            {Array.isArray(user.addressApprovalRequests) && user.addressApprovalRequests.length > 0 ? (
              <div className="mt-4 space-y-2 rounded border border-gray-200 bg-gray-50 p-3">
                <p className="text-sm font-semibold text-gray-900">Address approval requests</p>
                {user.addressApprovalRequests.map((request) => (
                  <div key={request.requestId} className="rounded border border-gray-200 bg-white p-3 text-sm">
                    <p className="text-gray-800">
                      <span className="font-medium">{request.requesterRealName || request.requesterUsername || 'A user'}</span>
                      {' '}requested to register with your home address:
                    </p>
                    <p className="mt-1 font-medium text-gray-900">{request.address}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={respondingAddressRequestId === request.requestId}
                        onClick={() => handleAddressApprovalDecision(request.requestId, 'approved')}
                        className="rounded bg-green-600 px-3 py-1.5 text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={respondingAddressRequestId === request.requestId}
                        onClick={() => handleAddressApprovalDecision(request.requestId, 'denied')}
                        className="rounded bg-red-600 px-3 py-1.5 text-white disabled:opacity-50"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <form onSubmit={handleSaveAccountPassword} className="mt-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-900">Change login password</h4>
              {accountPasswordError ? (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3" role="alert">
                  {accountPasswordError}
                </div>
              ) : null}
              {accountPasswordSuccess ? (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3" role="status">
                  {accountPasswordSuccess}
                </div>
              ) : null}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <PasswordField
                  name="currentPassword"
                  placeholder="Current password"
                  value={passwordForm.currentPassword}
                  onChange={handlePasswordFieldChange}
                  className="border rounded p-2"
                  autoComplete="current-password"
                  required
                />
                <PasswordField
                  name="newPassword"
                  placeholder="New password"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordFieldChange}
                  className="border rounded p-2"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <PasswordField
                  name="confirmPassword"
                  placeholder="Confirm new password"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordFieldChange}
                  className="border rounded p-2"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <button type="submit" disabled={savingAccountPassword} className="rounded bg-indigo-600 text-white px-4 py-2 disabled:opacity-50">
                {savingAccountPassword ? 'Updating...' : 'Update login password'}
              </button>
            </form>
          </section>

          <section id="settings-section-encryption" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <form onSubmit={handleSaveEncryptionPassword} className="space-y-3">
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
                  <PasswordField
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
                <PasswordField
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
                <PasswordField
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
          </section>

          <form onSubmit={handleSave} className="space-y-6">
            <section id="settings-section-profile" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
              <h3 className="text-lg font-semibold text-gray-800">Profile</h3>
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
              <label className="flex items-start gap-3 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="enableMaturityWordCensor"
                  checked={form.enableMaturityWordCensor}
                  onChange={handleChange}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="block font-medium text-gray-900">Sensitive word censor</span>
                  <span className="block text-xs text-gray-500">
                    When enabled, maturity-censored site words are masked everywhere you view feed posts and chat room messages.
                  </span>
                </span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-3 text-xs text-gray-500">
                  Location can only be changed once every 7 days.
                </div>
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
            </section>

            <section id="settings-section-pgp" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
              <h3 className="text-lg font-semibold text-gray-800">PGP tools</h3>
              <div className="space-y-3">
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
          </section>
            </form>

          <section id="settings-section-messages" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-800">Profile Thread Chat</h3>
              <p className="text-sm text-gray-600">
                This is the same profile-specific thread available from the Chat hub.
              </p>
              <div className="max-h-48 overflow-y-auto border rounded p-2 bg-gray-50 space-y-2">
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
          </section>

          <section id="settings-section-friends" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <FriendsManager currentUser={user} onUserUpdate={setUser} />
          </section>

          <section id="settings-section-recovery" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <RecoveryKitManager
              encryptionPassword={encryptionForm.encryptionPassword || encryptionForm.currentEncryptionPassword}
              pgpPrivateKey={generatedPrivateKey}
              userId={user?._id}
              username={user?.username}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

export default UserSettings;
