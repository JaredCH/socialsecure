import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { universalAPI } from '../utils/api';

function ReferFriend() {
  const [searchForm, setSearchForm] = useState({ email: '', phone: '' });
  const [inviteForm, setInviteForm] = useState({ email: '', phone: '', message: '' });
  const [searchResult, setSearchResult] = useState(null);
  const [inviteResult, setInviteResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);

  const onSearchChange = (e) => {
    setSearchForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onInviteChange = (e) => {
    setInviteForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setSearching(true);
    setInviteResult(null);

    try {
      const payload = {
        email: searchForm.email.trim() || undefined,
        phone: searchForm.phone.trim() || undefined
      };

      const { data } = await universalAPI.search(payload);
      setSearchResult(data);

      if (data.exists) {
        toast.success('User is already registered');
      } else {
        toast('User not found. You can send a referral invite.');
        setInviteForm((prev) => ({
          ...prev,
          email: payload.email || prev.email,
          phone: payload.phone || prev.phone
        }));
      }
    } catch (error) {
      const message = error.response?.data?.error || 'Search failed';
      toast.error(message);
      setSearchResult(null);
    } finally {
      setSearching(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setSending(true);

    try {
      const payload = {
        email: inviteForm.email.trim() || undefined,
        phone: inviteForm.phone.trim() || undefined,
        message: inviteForm.message.trim() || undefined
      };

      const { data } = await universalAPI.invite(payload);
      setInviteResult(data.invitation);
      toast.success('Referral invite created');
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.errors?.[0]?.msg || 'Failed to send invite';
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <section className="bg-white rounded shadow p-6 space-y-3">
        <h2 className="text-xl font-semibold">Find a person by universal account</h2>
        <p className="text-sm text-gray-600">
          Search by email or phone. If they are not registered yet, SocialSecure suggests “Refer a friend”.
        </p>

        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input name="email" value={searchForm.email} onChange={onSearchChange} className="w-full border rounded p-2" placeholder="friend@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input name="phone" value={searchForm.phone} onChange={onSearchChange} className="w-full border rounded p-2" placeholder="+1 555 555 5555" />
          </div>
          <button type="submit" disabled={searching} className="bg-blue-600 text-white rounded p-2 disabled:opacity-50">
            {searching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {searchResult && (
          <div className="border rounded p-3 bg-gray-50 text-sm">
            {searchResult.exists ? (
              <div>
                <p className="font-medium text-green-700">Registered user found</p>
                <p>
                  @{searchResult.user.username} ({searchResult.user.realName})
                </p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-amber-700">No registered account found</p>
                <p>{searchResult.message}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {searchResult && !searchResult.exists && (
        <section className="bg-white rounded shadow p-6 space-y-3">
          <h3 className="text-lg font-semibold">Refer a friend</h3>
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input name="email" value={inviteForm.email} onChange={onInviteChange} className="w-full border rounded p-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input name="phone" value={inviteForm.phone} onChange={onInviteChange} className="w-full border rounded p-2" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message (optional)</label>
              <textarea
                name="message"
                value={inviteForm.message}
                onChange={onInviteChange}
                className="w-full border rounded p-2"
                rows={3}
                placeholder="Join me on SocialSecure"
              />
            </div>
            <button type="submit" disabled={sending} className="bg-indigo-600 text-white rounded px-4 py-2 disabled:opacity-50">
              {sending ? 'Sending invite...' : 'Create referral invite'}
            </button>
          </form>

          {inviteResult && (
            <div className="border rounded p-3 bg-green-50 text-sm space-y-1">
              <p className="font-medium text-green-700">Invite created</p>
              <p><span className="font-semibold">Token:</span> {inviteResult.token}</p>
              <p><span className="font-semibold">Expires:</span> {new Date(inviteResult.expiresAt).toLocaleString()}</p>
              <p className="break-all"><span className="font-semibold">Link:</span> {inviteResult.inviteUrl}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default ReferFriend;
