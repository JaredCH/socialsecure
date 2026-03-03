import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { authAPI } from '../utils/api';

function Profile({ user, setUser }) {
  const [form, setForm] = useState({ realName: '', city: '', state: '', country: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      realName: user.realName || '',
      city: user.city || '',
      state: user.state || '',
      country: user.country || ''
    });
  }, [user]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await authAPI.updateProfile(form);
      setUser(data.user);
      toast.success('Profile updated');
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.errors?.[0]?.msg || 'Failed to update profile';
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Real Name</label>
          <input name="realName" value={form.realName} onChange={handleChange} className="w-full border rounded p-2" required />
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
