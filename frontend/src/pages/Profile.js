import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { authAPI } from '../utils/api';

const PROFILE_THEMES = ['default', 'light', 'dark', 'sunset', 'forest'];

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

function Profile({ user, setUser }) {
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

  if (!user) {
    return <div className="bg-white p-6 rounded shadow">Loading profile...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto bg-white rounded shadow p-6 space-y-4">
      <h2 className="text-xl font-semibold">Profile</h2>

      <div className="text-sm text-gray-700 bg-gray-50 border rounded p-3">
        <p><span className="font-semibold">Username:</span> @{user.username}</p>
        <p><span className="font-semibold">Registration:</span> {user.registrationStatus}</p>
        <p><span className="font-semibold">PGP Enabled:</span> {user.hasPGP ? 'Yes' : 'No'}</p>
      </div>

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
    </div>
  );
}

export default Profile;
