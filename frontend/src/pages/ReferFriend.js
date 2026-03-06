import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { universalAPI } from '../utils/api';

const REWARD_AMOUNT = Number(process.env.REACT_APP_REFERRAL_REWARD_AMOUNT || 100);

function ReferFriend() {
  const [searchForm, setSearchForm] = useState({ email: '', phone: '' });
  const [inviteForm, setInviteForm] = useState({ email: '', phone: '', message: '' });
  const [searchResult, setSearchResult] = useState(null);
  const [inviteResult, setInviteResult] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [stats, setStats] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);

  const statusStyles = {
    sent: 'bg-gray-100 text-gray-700',
    opened: 'bg-blue-100 text-blue-700',
    registered: 'bg-indigo-100 text-indigo-700',
    qualified: 'bg-amber-100 text-amber-700',
    rewarded: 'bg-green-100 text-green-700',
    expired: 'bg-red-100 text-red-700',
    revoked: 'bg-slate-200 text-slate-700'
  };

  const refreshReferralData = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const [invitesResponse, statsResponse] = await Promise.all([
        universalAPI.invitations(1, 20),
        universalAPI.getReferralStats()
      ]);
      setInvitations(invitesResponse.data?.invitations || []);
      setStats(statsResponse.data?.stats || null);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load referral progress');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    refreshReferralData();
  }, [refreshReferralData]);

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
      refreshReferralData();
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.errors?.[0]?.msg || 'Failed to send invite';
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const onCopyLink = async () => {
    if (!inviteResult?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteResult.inviteUrl);
      toast.success('Invite link copied');
    } catch (error) {
      toast.error('Unable to copy link');
    }
  };

  const onResend = async (invitationId) => {
    setActionLoadingId(invitationId);
    try {
      await universalAPI.resendInvitation(invitationId);
      toast.success('Invitation resent');
      refreshReferralData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to resend invitation');
    } finally {
      setActionLoadingId(null);
    }
  };

  const onRevoke = async (invitationId) => {
    setActionLoadingId(invitationId);
    try {
      await universalAPI.revokeInvitation(invitationId);
      toast.success('Invitation revoked');
      refreshReferralData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to revoke invitation');
    } finally {
      setActionLoadingId(null);
    }
  };

  const onQualify = async (invitationId) => {
    setActionLoadingId(invitationId);
    try {
      const { data } = await universalAPI.qualifyInvitation(invitationId);
      toast.success(data.alreadyRewarded ? 'Reward already processed' : 'Reward processed');
      refreshReferralData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to process qualification');
    } finally {
      setActionLoadingId(null);
    }
  };

  const rewardSummary = useMemo(() => {
    if (!stats) {
      return { earned: 0, pending: 0 };
    }

    const earned = Number(stats.totalRewards || 0);
    const pending = invitations
      .filter((invitation) => invitation.status === 'qualified' && invitation.rewardStatus !== 'processed')
      .reduce((sum, invitation) => sum + Number(invitation.rewardAmount || REWARD_AMOUNT), 0);

    return { earned, pending };
  }, [stats, invitations]);

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
              <button
                type="button"
                onClick={onCopyLink}
                className="text-xs font-medium text-indigo-700 underline"
              >
                Copy invite link
              </button>
            </div>
          )}
        </section>
      )}

      <section className="bg-white rounded shadow p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Referral progress</h3>
          <button
            type="button"
            onClick={refreshReferralData}
            disabled={loadingHistory}
            className="text-sm text-indigo-700 disabled:opacity-50"
          >
            {loadingHistory ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="border rounded p-3">
            <p className="text-gray-500">Total invites</p>
            <p className="text-xl font-semibold">{stats?.totalInvitations || 0}</p>
          </div>
          <div className="border rounded p-3">
            <p className="text-gray-500">Conversion</p>
            <p className="text-xl font-semibold">{stats?.conversionRate || 0}%</p>
          </div>
          <div className="border rounded p-3">
            <p className="text-gray-500">Pending rewards</p>
            <p className="text-xl font-semibold">{rewardSummary.pending}</p>
          </div>
          <div className="border rounded p-3">
            <p className="text-gray-500">Earned rewards</p>
            <p className="text-xl font-semibold">{rewardSummary.earned}</p>
          </div>
        </div>

        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">Invitee</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Milestones</th>
                <th className="text-left p-3">Reward</th>
                <th className="text-left p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500">
                    No referral invitations yet.
                  </td>
                </tr>
              ) : (
                invitations.map((invitation) => (
                  <tr key={invitation._id} className="border-t align-top">
                    <td className="p-3">
                      {invitation.inviteeEmail || invitation.inviteePhone || 'Unknown'}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusStyles[invitation.status] || 'bg-gray-100 text-gray-700'}`}>
                        {invitation.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-600 space-y-1">
                      <p>Sent: {invitation.sentAt ? new Date(invitation.sentAt).toLocaleDateString() : '-'}</p>
                      <p>Opened: {invitation.openedAt ? new Date(invitation.openedAt).toLocaleDateString() : '-'}</p>
                      <p>Registered: {invitation.registeredAt ? new Date(invitation.registeredAt).toLocaleDateString() : '-'}</p>
                      <p>Qualified: {invitation.qualifiedAt ? new Date(invitation.qualifiedAt).toLocaleDateString() : '-'}</p>
                      <p>Rewarded: {invitation.rewardedAt ? new Date(invitation.rewardedAt).toLocaleDateString() : '-'}</p>
                    </td>
                    <td className="p-3 text-xs">
                      <p>Amount: {invitation.rewardAmount || 0}</p>
                      <p className="capitalize">Status: {invitation.rewardStatus || 'pending'}</p>
                    </td>
                    <td className="p-3 text-xs space-y-2">
                      <button
                        type="button"
                        onClick={() => onResend(invitation._id)}
                        disabled={actionLoadingId === invitation._id || invitation.status === 'rewarded' || invitation.status === 'revoked'}
                        className="block text-indigo-700 disabled:opacity-50"
                      >
                        Resend
                      </button>
                      <button
                        type="button"
                        onClick={() => onRevoke(invitation._id)}
                        disabled={actionLoadingId === invitation._id || invitation.status === 'rewarded' || invitation.status === 'revoked'}
                        className="block text-red-700 disabled:opacity-50"
                      >
                        Revoke
                      </button>
                      <button
                        type="button"
                        onClick={() => onQualify(invitation._id)}
                        disabled={actionLoadingId === invitation._id || !['registered', 'qualified', 'rewarded'].includes(invitation.status)}
                        className="block text-green-700 disabled:opacity-50"
                      >
                        Qualify/Reward
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default ReferFriend;
