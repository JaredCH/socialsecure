import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { authAPI, chatAPI, userAPI } from '../utils/api';

const CHANNELS = [
  { key: 'zip', label: 'Zip Rooms' },
  { key: 'dm', label: 'Direct Messages' },
  { key: 'profile', label: 'Profile Threads' }
];

const CHAT_THEMES = [
  {
    key: 'classic',
    label: 'Classic Light',
    shell: 'bg-white text-gray-900',
    panel: 'bg-white border-gray-300',
    accent: 'bg-blue-600 text-white hover:bg-blue-700',
    subtle: 'bg-gray-100 text-gray-700 border-gray-200',
    messages: 'bg-gray-50 border-gray-200',
    input: 'bg-white border-gray-300 text-gray-900'
  },
  {
    key: 'midnight',
    label: 'Midnight',
    shell: 'bg-slate-900 text-slate-100',
    panel: 'bg-slate-800 border-slate-700',
    accent: 'bg-indigo-500 text-white hover:bg-indigo-600',
    subtle: 'bg-slate-700 text-slate-100 border-slate-600',
    messages: 'bg-slate-950 border-slate-700',
    input: 'bg-slate-900 border-slate-600 text-slate-100'
  },
  {
    key: 'ocean',
    label: 'Ocean',
    shell: 'bg-cyan-950 text-cyan-50',
    panel: 'bg-cyan-900 border-cyan-700',
    accent: 'bg-cyan-400 text-cyan-950 hover:bg-cyan-300',
    subtle: 'bg-cyan-800 text-cyan-50 border-cyan-700',
    messages: 'bg-cyan-950 border-cyan-700',
    input: 'bg-cyan-900 border-cyan-600 text-cyan-50'
  },
  {
    key: 'terminal',
    label: 'Terminal',
    shell: 'bg-zinc-950 text-lime-200',
    panel: 'bg-zinc-900 border-lime-800',
    accent: 'bg-lime-500 text-zinc-950 hover:bg-lime-400',
    subtle: 'bg-zinc-800 text-lime-200 border-lime-800',
    messages: 'bg-zinc-950 border-lime-900',
    input: 'bg-zinc-900 border-lime-700 text-lime-200'
  },
  {
    key: 'sunset',
    label: 'Sunset',
    shell: 'bg-orange-50 text-orange-950',
    panel: 'bg-white border-orange-300',
    accent: 'bg-orange-600 text-white hover:bg-orange-700',
    subtle: 'bg-orange-100 text-orange-900 border-orange-200',
    messages: 'bg-amber-50 border-orange-200',
    input: 'bg-white border-orange-300 text-orange-950'
  },
  {
    key: 'lavender',
    label: 'Lavender',
    shell: 'bg-violet-50 text-violet-950',
    panel: 'bg-white border-violet-300',
    accent: 'bg-violet-600 text-white hover:bg-violet-700',
    subtle: 'bg-violet-100 text-violet-900 border-violet-200',
    messages: 'bg-violet-50 border-violet-200',
    input: 'bg-white border-violet-300 text-violet-950'
  }
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
  const [dmSuggestions, setDmSuggestions] = useState([]);
  const [dmSearchLoading, setDmSearchLoading] = useState(false);

  const [roomQuery, setRoomQuery] = useState('');
  const [theme, setTheme] = useState(CHAT_THEMES[0].key);
  const [roomUsers, setRoomUsers] = useState([]);
  const [roomUsersLoading, setRoomUsersLoading] = useState(false);

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

  const allRooms = useMemo(() => {
    const withSearchLabel = (room, channel) => {
      const label = getConversationLabel(room);
      return {
        ...room,
        __channel: channel,
        __label: label,
        __labelLower: label.toLowerCase()
      };
    };
    const zipRooms = [
      ...(hubData?.zip?.current ? [withSearchLabel(hubData.zip.current, 'zip')] : []),
      ...((hubData?.zip?.nearby || []).map((room) => withSearchLabel(room, 'zip')))
    ];
    const dmRooms = (hubData?.dm || []).map((room) => withSearchLabel(room, 'dm'));
    const profileRooms = (hubData?.profile || []).map((room) => withSearchLabel(room, 'profile'));
    return [...zipRooms, ...dmRooms, ...profileRooms];
  }, [hubData]);

  const activeTheme = useMemo(
    () => CHAT_THEMES.find((themeOption) => themeOption.key === theme) || CHAT_THEMES[0],
    [theme]
  );

  const resolvedZipCode = useMemo(
    () => profile?.zipCode || hubData?.zip?.current?.zipCode || null,
    [profile, hubData]
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

  useEffect(() => {
    const loadRoomUsers = async () => {
      if (!activeConversationId) {
        setRoomUsers([]);
        return;
      }

      setRoomUsersLoading(true);
      try {
        const { data } = await chatAPI.getConversationUsers(activeConversationId);
        setRoomUsers(Array.isArray(data?.users) ? data.users : []);
      } catch (error) {
        setRoomUsers([]);
        toast.error(error.response?.data?.error || 'Failed to load room users');
      } finally {
        setRoomUsersLoading(false);
      }
    };

    loadRoomUsers();
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
      setDmSuggestions([]);
      setDmQuery('');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to start DM');
    }
  };

  useEffect(() => {
    const query = dmQuery.trim();
    if (query.length < 2) {
      setDmSuggestions([]);
      setDmSearchLoading(false);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      setDmSearchLoading(true);
      userAPI.search(query)
        .then(({ data }) => {
          if (cancelled) return;
          const users = Array.isArray(data?.users) ? data.users : [];
          setDmSuggestions(users.filter((user) => String(user._id) !== String(profile?._id)));
        })
        .catch((error) => {
          if (cancelled) return;
          setDmSuggestions([]);
          toast.error(error.response?.data?.error || 'Failed to search users');
        })
        .finally(() => {
          if (!cancelled) setDmSearchLoading(false);
        });
    }, 300);

    return () => {
      clearTimeout(handle);
      cancelled = true;
    };
  }, [dmQuery, profile]);

  const roomSuggestions = useMemo(() => {
    const query = roomQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    return allRooms
      .filter((room) => room.__labelLower.includes(query))
      .slice(0, 8);
  }, [roomQuery, allRooms]);

  const selectRoomSuggestion = (room) => {
    setActiveChannel(room.__channel || 'zip');
    setActiveConversationId(String(room._id));
    setRoomQuery(room.__label || getConversationLabel(room));
  };

  if (loadingHub) {
    return (
      <div className="h-full w-full grid place-items-center bg-white">
        <div className="text-sm opacity-80">Loading unified chat hub...</div>
      </div>
    );
  }

  return (
    <div className={`h-full w-full min-h-0 overflow-hidden flex flex-col ${activeTheme.shell}`}>
      <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Classic Chat Lounge</h2>
          <p className="text-sm opacity-90">
            IRC/AIM-inspired flow: pick a channel, pick a room, then jump into the conversation.
          </p>
          {resolvedZipCode ? (
            <p className="text-xs mt-1 opacity-80">Your default zip room: {resolvedZipCode}</p>
          ) : null}
        </div>
        <label className="text-sm font-medium flex items-center gap-2">
          Theme
          <select
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
            className={`border rounded px-2 py-1 text-sm ${activeTheme.input}`}
          >
            {CHAT_THEMES.map((themeOption) => (
              <option key={themeOption.key} value={themeOption.key}>
                {themeOption.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid flex-1 min-h-0 grid-cols-1 gap-0 lg:grid-cols-12">
        <aside className={`lg:col-span-3 min-h-0 border-b p-3 space-y-3 overflow-hidden lg:border-b-0 lg:border-r ${activeTheme.panel}`}>
          <h3 className="font-semibold">Channels & Actions</h3>
          <div className="space-y-2">
            {CHANNELS.map((channel) => (
              <button
                key={channel.key}
                type="button"
                onClick={() => setActiveChannel(channel.key)}
                className={`w-full text-left border rounded px-2 py-2 text-sm ${activeChannel === channel.key ? activeTheme.subtle : 'opacity-90'}`}
              >
                {channel.label}
              </button>
            ))}
          </div>

          <div className="border-t pt-3 space-y-2">
            <label className="text-xs font-semibold block">Find Rooms</label>
            <input
              value={roomQuery}
              onChange={(event) => setRoomQuery(event.target.value)}
              className={`w-full border rounded p-2 text-sm ${activeTheme.input}`}
              placeholder="Search room names..."
            />
            {roomSuggestions.length > 0 ? (
              <ul className={`max-h-36 overflow-auto border rounded divide-y text-xs ${activeTheme.panel}`}>
                {roomSuggestions.map((room) => (
                  <li key={String(room._id)}>
                    <button
                      type="button"
                      onClick={() => selectRoomSuggestion(room)}
                      className="w-full text-left p-2 hover:opacity-80"
                    >
                      {room.__label || getConversationLabel(room)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="border-t pt-3 space-y-2">
            <label className="text-xs font-semibold block">Find Users (DM)</label>
            <input
              value={dmQuery}
              onChange={(event) => setDmQuery(event.target.value)}
              className={`w-full border rounded p-2 text-sm ${activeTheme.input}`}
              placeholder="Search username or name..."
            />
            {dmSearchLoading ? (
              <p className="text-xs opacity-80">Searching users...</p>
            ) : null}
            {dmSuggestions.length > 0 ? (
              <ul className={`max-h-40 overflow-auto border rounded divide-y text-xs ${activeTheme.panel}`}>
                {dmSuggestions.map((user) => (
                  <li key={String(user._id)} className="p-2 flex justify-between items-center gap-2">
                    <span>@{user.username || user.realName || 'user'}</span>
                    <button
                      type="button"
                      onClick={() => handleStartDM(user._id)}
                      className={`border rounded px-2 py-1 ${activeTheme.subtle}`}
                    >
                      Start DM
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-semibold">Rooms in this channel</p>
            {conversationList.length === 0 ? (
              <p className="text-xs opacity-80">No rooms available in this channel yet.</p>
            ) : (
              <ul className="space-y-2 max-h-52 overflow-auto pr-1">
                {conversationList.map((conversation) => {
                  const selected = String(conversation._id) === String(activeConversationId);
                  return (
                    <li key={String(conversation._id)}>
                      <button
                        type="button"
                        onClick={() => setActiveConversationId(String(conversation._id))}
                        className={`w-full text-left border rounded px-2 py-2 text-sm ${selected ? activeTheme.subtle : ''}`}
                      >
                        <div className="font-medium">{getConversationLabel(conversation)}</div>
                        {conversation.lastMessageAt ? (
                          <div className="text-xs opacity-80">Last active {new Date(conversation.lastMessageAt).toLocaleString()}</div>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <section className={`lg:col-span-6 border-b p-3 space-y-3 flex flex-col min-h-0 lg:border-b-0 lg:border-r ${activeTheme.panel}`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{activeConversation ? getConversationLabel(activeConversation) : 'Select a room'}</h3>
            <div className="text-xs opacity-80">Guided Flow: 1) Channel 2) Room 3) Chat</div>
          </div>
          {messagesError ? (
            <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded p-2">{messagesError}</div>
          ) : null}

          <div className={`flex-1 min-h-0 overflow-y-auto border rounded p-2 space-y-2 ${activeTheme.messages}`}>
            {messagesLoading ? (
              <p className="text-sm opacity-80">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm opacity-80">No messages yet.</p>
            ) : (
              messages.map((message) => (
                <div key={String(message._id)} className="text-sm">
                  <div className="text-xs opacity-80">
                    @{message.userId?.username || message.userId?.realName || 'user'} · {new Date(message.createdAt).toLocaleString()}
                  </div>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              className={`flex-1 border rounded p-2 ${activeTheme.input}`}
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              maxLength={2000}
              disabled={!activeConversationId || sending}
              placeholder={activeConversationId ? 'Type your message' : 'Choose a conversation to message'}
            />
            <button
              type="submit"
              disabled={!activeConversationId || !composerValue.trim() || sending}
              className={`rounded px-4 py-2 disabled:opacity-50 ${activeTheme.accent}`}
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </form>
        </section>

        <aside className={`lg:col-span-3 p-3 space-y-2 min-h-0 flex flex-col ${activeTheme.panel}`}>
          <h3 className="font-semibold">Users in Room</h3>
          {activeConversation ? (
            <p className="text-xs opacity-80">{getConversationLabel(activeConversation)}</p>
          ) : (
            <p className="text-xs opacity-80">Select a room to view users.</p>
          )}
          <div className="border rounded overflow-hidden flex-1 min-h-0">
            {roomUsersLoading ? (
              <p className="text-xs p-2 opacity-80">Loading users...</p>
            ) : roomUsers.length === 0 ? (
              <p className="text-xs p-2 opacity-80">No users to display.</p>
            ) : (
              <ul className="divide-y">
                {roomUsers.map((user) => (
                  <li key={String(user._id)} className="p-2 text-sm">
                    @{user.username || user.realName || 'user'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Chat;
