import React, { useEffect, useState } from 'react';
import { friendsAPI } from '../utils/api';
import toast from 'react-hot-toast';
import PresenceIndicator from './PresenceIndicator';
import { getRealtimeSocket, onFriendPresence } from '../utils/realtime';

function FriendsManager({ currentUser, onUserUpdate }) {
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [topFriends, setTopFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('friends');
  const [privacySettings, setPrivacySettings] = useState({
    friendListPrivacy: 'friends',
    topFriendsPrivacy: 'public'
  });
  const [friendCount, setFriendCount] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!currentUser?._id || currentUser?.realtimePreferences?.enabled === false) {
      return undefined;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      return undefined;
    }

    getRealtimeSocket({ token, userId: currentUser._id });

    const offFriendPresence = onFriendPresence((payload) => {
      const userId = String(payload?.userId || '').trim();
      if (!userId) return;

      setFriends((prev) => prev.map((friend) => (
        String(friend._id) === userId
          ? { ...friend, presence: { status: payload.status, lastSeen: payload.lastSeen || null } }
          : friend
      )));
    });

    return () => {
      offFriendPresence();
    };
  }, [currentUser?._id, currentUser?.realtimePreferences?.enabled]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [friendsRes, incomingRes, outgoingRes, privacyRes, countRes] = await Promise.all([
        friendsAPI.getFriends(),
        friendsAPI.getIncomingRequests(),
        friendsAPI.getOutgoingRequests(),
        friendsAPI.getPrivacySettings(),
        friendsAPI.getFriendCount()
      ]);

      setFriends(friendsRes.data.friends || []);
      setIncomingRequests(incomingRes.data.requests || []);
      setOutgoingRequests(outgoingRes.data.requests || []);
      setPrivacySettings(privacyRes.data.privacy || privacySettings);
      setFriendCount(countRes.data.count || 0);

      // Load top friends for current user
      if (currentUser?.username) {
        const topRes = await friendsAPI.getTopFriends(currentUser.username);
        setTopFriends(topRes.data.topFriends || []);
      }
    } catch (error) {
      console.error('Error loading friends data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = async (userId, message = '') => {
    try {
      await friendsAPI.sendRequest(userId, message);
      toast.success('Friend request sent');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send request');
    }
  };

  const handleAcceptRequest = async (friendshipId) => {
    try {
      await friendsAPI.acceptRequest(friendshipId);
      toast.success('Friend request accepted');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to accept request');
    }
  };

  const handleDeclineRequest = async (friendshipId) => {
    try {
      await friendsAPI.declineRequest(friendshipId);
      toast.success('Friend request declined');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to decline request');
    }
  };

  const handleRemoveFriend = async (friendshipId) => {
    if (!window.confirm('Are you sure you want to remove this friend?')) return;
    try {
      await friendsAPI.removeFriend(friendshipId);
      toast.success('Friend removed');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to remove friend');
    }
  };

  const handleBlockUser = async (friendshipId) => {
    if (!window.confirm('Are you sure you want to block this user?')) return;
    try {
      await friendsAPI.blockUser(friendshipId);
      toast.success('User blocked');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to block user');
    }
  };

  const handleUpdateTopFriends = async (friendIds) => {
    try {
      await friendsAPI.updateTopFriends(friendIds);
      toast.success('Top friends updated');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update top friends');
    }
  };

  const handleUpdatePrivacy = async (newSettings) => {
    try {
      await friendsAPI.updatePrivacySettings(newSettings);
      setPrivacySettings({ ...privacySettings, ...newSettings });
      toast.success('Privacy settings updated');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update privacy settings');
    }
  };

  const moveTopFriend = (index, direction) => {
    const newTopFriends = [...topFriends];
    if (direction === 'up' && index > 0) {
      [newTopFriends[index], newTopFriends[index - 1]] = [newTopFriends[index - 1], newTopFriends[index]];
    } else if (direction === 'down' && index < newTopFriends.length - 1) {
      [newTopFriends[index], newTopFriends[index + 1]] = [newTopFriends[index + 1], newTopFriends[index]];
    }
    handleUpdateTopFriends(newTopFriends.map(f => f._id));
  };

  const removeFromTopFriends = (friendId) => {
    const newTopFriends = topFriends.filter(f => f._id !== friendId);
    handleUpdateTopFriends(newTopFriends.map(f => f._id));
  };

  const addToTopFriends = (friend) => {
    if (topFriends.length >= 12) {
      toast.error('Maximum 12 top friends allowed');
      return;
    }
    if (topFriends.some(f => f._id === friend._id)) {
      toast.error('Already in top friends');
      return;
    }
    handleUpdateTopFriends([...topFriends.map(f => f._id), friend._id]);
  };

  if (loading) {
    return <div className="p-4 text-center">Loading friends...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-xl font-semibold mb-4">Friends</h2>
      
      {/* Friend Count */}
      <div className="mb-4 p-3 bg-gray-50 rounded">
        <span className="font-medium">{friendCount}</span> friends
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-4">
        {['friends', 'requests', 'top', 'privacy'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 capitalize ${activeTab === tab ? 'border-b-2 border-blue-500 font-medium' : 'text-gray-500'}`}
          >
            {tab === 'requests' ? `Requests (${incomingRequests.length})` : tab}
          </button>
        ))}
      </div>

      {/* Friends List */}
      {activeTab === 'friends' && (
        <div className="space-y-2">
          {friends.length === 0 ? (
            <p className="text-gray-500">No friends yet</p>
          ) : (
            friends.map(friend => (
              <div key={friend._id} className="flex items-center justify-between p-2 border rounded">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    {friend.avatarUrl ? (
                      <img src={friend.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <span className="text-lg">👤</span>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">@{friend.username}</p>
                    <p className="text-sm text-gray-500">{friend.realName}</p>
                    <PresenceIndicator presence={friend.presence} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => addToTopFriends(friend)}
                    className="text-sm px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    + Top
                  </button>
                  <button
                    onClick={() => handleRemoveFriend(friend.friendshipId)}
                    className="text-sm px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Friend Requests */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {/* Incoming Requests */}
          <div>
            <h3 className="font-medium mb-2">Incoming Requests ({incomingRequests.length})</h3>
            {incomingRequests.length === 0 ? (
              <p className="text-gray-500 text-sm">No pending requests</p>
            ) : (
              incomingRequests.map(req => (
                <div key={req._id} className="flex items-center justify-between p-2 border rounded mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      {req.user?.avatarUrl ? (
                        <img src={req.user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <span>👤</span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium">@{req.user?.username}</p>
                      <p className="text-xs text-gray-500">{req.user?.realName}</p>
                      {req.message && <p className="text-sm text-gray-600">"{req.message}"</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptRequest(req._id)}
                      className="text-sm px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleDeclineRequest(req._id)}
                      className="text-sm px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Outgoing Requests */}
          <div>
            <h3 className="font-medium mb-2">Sent Requests ({outgoingRequests.length})</h3>
            {outgoingRequests.length === 0 ? (
              <p className="text-gray-500 text-sm">No sent requests</p>
            ) : (
              outgoingRequests.map(req => (
                <div key={req._id} className="flex items-center justify-between p-2 border rounded mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      {req.user?.avatarUrl ? (
                        <img src={req.user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <span>👤</span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium">@{req.user?.username}</p>
                      <p className="text-xs text-gray-500">Pending...</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Top Friends */}
      {activeTab === 'top' && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500 mb-2">Drag to reorder or remove from top friends (max 12)</p>
          {topFriends.length === 0 ? (
            <p className="text-gray-500">No top friends set</p>
          ) : (
            topFriends.map((friend, index) => (
              <div key={friend._id} className="flex items-center justify-between p-2 border rounded bg-blue-50">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⭐</span>
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                    {friend.avatarUrl ? (
                      <img src={friend.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <span>👤</span>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">@{friend.username}</p>
                    <p className="text-xs text-gray-500">{friend.realName}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => moveTopFriend(index, 'up')}
                    disabled={index === 0}
                    className="text-sm px-2 py-1 bg-gray-100 rounded disabled:opacity-50"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveTopFriend(index, 'down')}
                    disabled={index === topFriends.length - 1}
                    className="text-sm px-2 py-1 bg-gray-100 rounded disabled:opacity-50"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeFromTopFriends(friend._id)}
                    className="text-sm px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Privacy Settings */}
      {activeTab === 'privacy' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Who can see your friend list?</label>
            <select
              value={privacySettings.friendListPrivacy}
              onChange={(e) => handleUpdatePrivacy({ friendListPrivacy: e.target.value })}
              className="w-full border rounded p-2"
            >
              <option value="public">Everyone</option>
              <option value="friends">Friends Only</option>
              <option value="private">Only Me</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Who can see your top friends?</label>
            <select
              value={privacySettings.topFriendsPrivacy}
              onChange={(e) => handleUpdatePrivacy({ topFriendsPrivacy: e.target.value })}
              className="w-full border rounded p-2"
            >
              <option value="public">Everyone</option>
              <option value="friends">Friends Only</option>
              <option value="private">Only Me</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

export default FriendsManager;
