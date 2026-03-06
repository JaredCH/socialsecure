import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { authAPI, chatAPI, userAPI } from '../utils/api';

const CHANNELS = [
  { key: 'zip', label: 'Zip Rooms' },
  { key: 'dm', label: 'Direct Messages' },
  { key: 'profile', label: 'Profile Threads' }
];

const getConversationLabel = (conversation) => {
  if (!conversation) return '';

  if (conversation.type === 'zip-room') {
    return conversation.title || (conversation.zipCode ? `Zip ${conversation.zipCode}` : 'Zip room');
  }

  if (conversation.type === 'dm') {
    return conversation.peer?.username
      ? `@${conversation.peer.username}`
      : (conversation.peer?.realName || 'Direct message');
  }

  if (conversation.type === 'profile-thread') {
    return conversation.profileUser?.username
      ? `@${conversation.profileUser.username}`
      : (conversation.title || 'Profile thread');
  }

  return conversation.title || 'Conversation';
};

function Chat() {
  const [profile, setProfile] = useState(null);
  const [loadingHub, setLoadingHub] = useState(true);
  const [activeChannel, setActiveChannel] = useState('zip');
  const [hubData, setHubData] = useState({
    zip: { current: null, nearby: [] },
    dm: [],
    profile: []
  });
  const [activeConversationId, setActiveConversationId] = useState('');

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [composerValue, setComposerValue] = useState('');
  const [sending, setSending] = useState(false);

  const [dmQuery, setDmQuery] = useState('');
  const [dmSearchLoading, setDmSearchLoading] = useState(false);
  const [dmResults, setDmResults] = useState([]);

  const conversationList = useMemo(() => {
    if (activeChannel === 'zip') {
      const entries = [];
      if (hubData.zip.current) entries.push(hubData.zip.current);
      if (Array.isArray(hubData.zip.nearby)) {
        entries.push(...hubData.zip.nearby);
      }
      return entries;
    }

    if (activeChannel === 'dm') {
      return Array.isArray(hubData.dm) ? hubData.dm : [];
    }

    return Array.isArray(hubData.profile) ? hubData.profile : [];
  }, [activeChannel, hubData]);

  const activeConversation = useMemo(
    () => conversationList.find((conversation) => String(conversation._id) === String(activeConversationId)) || null,
    [conversationList, activeConversationId]
  );

  const applyDefaultConversationSelection = (channelKey, data) => {
    if (channelKey === 'zip') {
      const next = data?.zip?.current || (data?.zip?.nearby || [])[0] || null;
      setActiveConversationId(next ? String(next._id) : '');
      return;
    }

    if (channelKey === 'dm') {
      const next = (data?.dm || [])[0] || null;
      setActiveConversationId(next ? String(next._id) : '');
      return;
    }

    const next = (data?.profile || [])[0] || null;
    setActiveConversationId(next ? String(next._id) : '');
  };

  const refreshHub = async (channelToKeep = activeChannel) => {
    const [{ data: me }, { data: conversationsData }] = await Promise.all([
      authAPI.getProfile(),
      chatAPI.getConversations()
    ]);

    setProfile(me.user || null);
    const nextData = conversationsData?.conversations || { zip: { current: null, nearby: [] }, dm: [], profile: [] };
    setHubData(nextData);

    const stillExists = (() => {
      if (!activeConversationId) return false;

      if (channelToKeep === 'zip') {
        const candidates = [nextData?.zip?.current, ...(nextData?.zip?.nearby || [])].filter(Boolean);
        return candidates.some((conversation) => String(conversation._id) === String(activeConversationId));
      }

      if (channelToKeep === 'dm') {
        return (nextData?.dm || []).some((conversation) => String(conversation._id) === String(activeConversationId));
      }

      return (nextData?.profile || []).some((conversation) => String(conversation._id) === String(activeConversationId));
    })();

    if (!stillExists) {
      applyDefaultConversationSelection(channelToKeep, nextData);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      setLoadingHub(true);
      try {
        await refreshHub('zip');
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to load chat hub');
      } finally {
        setLoadingHub(false);
      }
    };

    bootstrap();
  }, []);

  useEffect(() => {
    applyDefaultConversationSelection(activeChannel, hubData);
  }, [activeChannel, hubData]);

  useEffect(() => {
    const loadMessages = async () => {
      if (!activeConversationId) {
        setMessages([]);
        setMessagesError('');
        return;
      }

      setMessagesLoading(true);
      setMessagesError('');
      try {
        const { data } = await chatAPI.getConversationMessages(activeConversationId, 1, 100);
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      } catch (error) {
        setMessages([]);
        setMessagesError(error.response?.data?.error || 'Failed to load conversation messages');
      } finally {
        setMessagesLoading(false);
      }
    };

    loadMessages();
  }, [activeConversationId]);

  const handleSend = async (event) => {
    event.preventDefault();
    const trimmed = composerValue.trim();
    if (!trimmed || !activeConversationId) return;

    setSending(true);
    try {
      const { data } = await chatAPI.sendConversationMessage(activeConversationId, trimmed);
      setMessages((prev) => [...prev, data.message]);
      setComposerValue('');
      await refreshHub(activeChannel);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleStartDM = async (targetUserId) => {
    try {
      const { data } = await chatAPI.startDM(targetUserId);
      await refreshHub('dm');
      setActiveChannel('dm');
      setActiveConversationId(String(data.conversation._id));
      setDmResults([]);
      setDmQuery('');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to start DM');
    }
  };

  const runDmSearch = async (event) => {
    event.preventDefault();
    if (!dmQuery.trim() || dmQuery.trim().length < 2) {
      setDmResults([]);
      return;
    }

    setDmSearchLoading(true);
    try {
      const { data } = await userAPI.search(dmQuery.trim());
      const users = Array.isArray(data?.users) ? data.users : [];
      setDmResults(users.filter((user) => String(user._id) !== String(profile?._id)));
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to search users');
    } finally {
      setDmSearchLoading(false);
    }
  };

  if (loadingHub) {
    return <div className="bg-white rounded-lg shadow p-6">Loading unified chat hub...</div>;
  }

  const defaultZipCode = profile?.zipCode || hubData?.zip?.current?.zipCode || '';

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Unified Chat Hub</h2>
        <p className="text-sm text-gray-600">
          Zip rooms, direct messages, and profile threads in one workspace.
        </p>
        {defaultZipCode ? (
          <p className="text-xs text-gray-500 mt-1">Your default zip room: {defaultZipCode}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <aside className="lg:col-span-3 border rounded p-3 space-y-3">
          <h3 className="font-semibold">Channels</h3>
          <div className="space-y-2">
            {CHANNELS.map((channel) => (
              <button
                key={channel.key}
                type="button"
                onClick={() => setActiveChannel(channel.key)}
                className={`w-full text-left border rounded px-2 py-2 text-sm ${activeChannel === channel.key ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'}`}
              >
                {channel.label}
              </button>
            ))}
          </div>

          {activeChannel === 'zip' ? (
            <div className="text-xs text-gray-600 border-t pt-3">
              Nearby zip rooms are shown only when active rooms exist.
            </div>
          ) : null}

          {activeChannel === 'dm' ? (
            <form onSubmit={runDmSearch} className="space-y-2 border-t pt-3">
              <label className="text-xs font-medium text-gray-700 block">Start DM</label>
              <input
                value={dmQuery}
                onChange={(event) => setDmQuery(event.target.value)}
                className="w-full border rounded p-2 text-sm"
                placeholder="Search users"
              />
              <button type="submit" className="w-full bg-blue-600 text-white rounded px-3 py-2 text-sm" disabled={dmSearchLoading}>
                {dmSearchLoading ? 'Searching...' : 'Search'}
              </button>
              {dmResults.length > 0 ? (
                <ul className="max-h-40 overflow-auto border rounded divide-y">
                  {dmResults.map((user) => (
                    <li key={String(user._id)} className="p-2 text-xs flex justify-between items-center gap-2">
                      <span>@{user.username || user.realName || 'user'}</span>
                      <button
                        type="button"
                        onClick={() => handleStartDM(user._id)}
                        className="border rounded px-2 py-1 hover:bg-gray-50"
                      >
                        DM
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </form>
          ) : null}
        </aside>

        <section className="lg:col-span-4 border rounded p-3">
          <h3 className="font-semibold mb-2">Conversations</h3>
          {conversationList.length === 0 ? (
            <p className="text-sm text-gray-500">No conversations in this channel yet.</p>
          ) : (
            <ul className="space-y-2">
              {conversationList.map((conversation) => {
                const selected = String(conversation._id) === String(activeConversationId);
                return (
                  <li key={String(conversation._id)}>
                    <button
                      type="button"
                      onClick={() => setActiveConversationId(String(conversation._id))}
                      className={`w-full text-left border rounded px-2 py-2 text-sm ${selected ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'}`}
                    >
                      <div className="font-medium">{getConversationLabel(conversation)}</div>
                      {conversation.lastMessageAt ? (
                        <div className="text-xs text-gray-500">Last active {new Date(conversation.lastMessageAt).toLocaleString()}</div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="lg:col-span-5 border rounded p-3 space-y-3">
          <h3 className="font-semibold">{activeConversation ? getConversationLabel(activeConversation) : 'Select a conversation'}</h3>
          {messagesError ? (
            <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded p-2">{messagesError}</div>
          ) : null}

          <div className="max-h-[420px] overflow-y-auto border rounded p-2 bg-gray-50 space-y-2">
            {messagesLoading ? (
              <p className="text-sm text-gray-500">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-gray-500">No messages yet.</p>
            ) : (
              messages.map((message) => (
                <div key={String(message._id)} className="text-sm">
                  <div className="text-xs text-gray-500">
                    @{message.userId?.username || message.userId?.realName || 'user'} · {new Date(message.createdAt).toLocaleString()}
                  </div>
                  <div className="text-gray-900 whitespace-pre-wrap">{message.content}</div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              className="flex-1 border rounded p-2"
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              maxLength={2000}
              disabled={!activeConversationId || sending}
              placeholder={activeConversationId ? 'Type your message' : 'Choose a conversation to message'}
            />
            <button
              type="submit"
              disabled={!activeConversationId || !composerValue.trim() || sending}
              className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default Chat;
