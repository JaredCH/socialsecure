import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { chatAPI, notificationAPI } from '../../utils/api';
import { SOCIAL_HERO_TABS, SOCIAL_HERO_TAB_LABELS } from '../../utils/socialPagePreferences';

const MOBILE_SOCIAL_MENU_LAYOUT_BY_TAB = {
  main: { x: -76, y: 2 },
  friends: { x: -90, y: -34 },
  gallery: { x: -84, y: -68 },
  chat: { x: -66, y: -102 },
  calendar: { x: -38, y: -134 }
};

const SITE_NAV_LINKS = [
  { id: 'chat', label: 'Chat', path: '/chat', icon: 'chat' },
  { id: 'news', label: 'News', path: '/news', icon: 'news' },
  { id: 'market', label: 'Market', path: '/market', icon: 'market' },
  { id: 'discover', label: 'Discover', path: '/discover', icon: 'discover' }
];

const buildMobileMenuLayout = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items.map((item, index) => {
    const fallback = {
      x: -76 + (index * 10),
      y: 2 - (index * 34)
    };

    return {
      ...item,
      ...(MOBILE_SOCIAL_MENU_LAYOUT_BY_TAB[item.id] || fallback)
    };
  });
};

const formatActivityTimestamp = (value) => {
  if (!value) return '';

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';

  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h`;
  return `${Math.floor(diffMinutes / 1440)}d`;
};

const TabIcon = ({ icon, className }) => {
  const icons = {
    home: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    chat: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    calendar: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    users: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-1a4 4 0 00-5.356-3.77M17 20H7m10 0v-1c0-.653-.126-1.278-.356-1.85M7 20H2v-1a4 4 0 015.356-3.77M7 20v-1c0-.653.126-1.278.356-1.85m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    photo: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16l4-4a3 3 0 014.243 0L16 16m-2-2l1-1a3 3 0 014.243 0L21 14m-6-8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    news: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
    market: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
    discover: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    )
  };

  return icons[icon] || null;
};

const buildSocialPath = (username, tabId) => {
  const params = new URLSearchParams();
  if (username) {
    params.set('user', username);
  }
  if (tabId && tabId !== 'main') {
    params.set('tab', tabId);
  }

  const query = params.toString();
  return query ? `/social?${query}` : '/social';
};

const resolveContextUsername = (pathname, search, currentUsername) => {
  const params = new URLSearchParams(search);
  const queryUser = String(params.get('user') || params.get('username') || '').trim();
  if (queryUser) {
    return queryUser;
  }

  const resumeMatch = pathname.match(/^\/resume\/([^/?#]+)/i);
  if (resumeMatch?.[1]) {
    return decodeURIComponent(resumeMatch[1]);
  }

  return String(currentUsername || '').trim();
};

const GlobalSocialLauncher = ({ currentUsername = '', unreadNotificationCount = 0, enabled = false }) => {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [activitySummary, setActivitySummary] = useState({
    notifications: [],
    messages: [],
    unreadMessageCount: 0
  });

  const socialMenuItems = useMemo(() => buildMobileMenuLayout(SOCIAL_HERO_TABS), []);
  const contextUsername = useMemo(
    () => resolveContextUsername(routeLocation.pathname, routeLocation.search, currentUsername),
    [routeLocation.pathname, routeLocation.search, currentUsername]
  );

  useEffect(() => {
    setIsOpen(false);
  }, [routeLocation.pathname, routeLocation.search]);

  useEffect(() => {
    if (!enabled || !isOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, isOpen]);

  useEffect(() => {
    if (!enabled || !isOpen) {
      return undefined;
    }

    let isCancelled = false;

    const loadActivity = async () => {
      const [notificationsResponse, conversationsResponse] = await Promise.all([
        notificationAPI.getNotifications(1, 3).catch(() => ({ data: { notifications: [] } })),
        chatAPI.getConversations().catch(() => ({ data: { conversations: { zip: { current: null, nearby: [] }, dm: [], profile: [] } } }))
      ]);

      if (isCancelled) {
        return;
      }

      const notifications = Array.isArray(notificationsResponse.data?.notifications)
        ? notificationsResponse.data.notifications.filter((item) => !item?.isRead).slice(0, 2)
        : [];

      const conversations = conversationsResponse.data?.conversations || {};
      const threadedMessages = [
        ...(Array.isArray(conversations.dm) ? conversations.dm : []),
        ...(Array.isArray(conversations.profile) ? conversations.profile : [])
      ];

      const unreadMessageCount = threadedMessages.reduce(
        (total, conversation) => total + Number(conversation?.unreadCount || conversation?.unreadMessages || 0),
        0
      );

      const messages = threadedMessages
        .filter((conversation) => Boolean(conversation?.lastMessageAt || conversation?.messageCount))
        .sort((left, right) => new Date(right?.lastMessageAt || 0).getTime() - new Date(left?.lastMessageAt || 0).getTime())
        .slice(0, 2)
        .map((conversation) => ({
          id: conversation?._id || conversation?.title || 'conversation',
          title: conversation?.type === 'dm'
            ? (conversation?.peer?.realName || conversation?.peer?.username || 'Direct message')
            : (conversation?.profileUser?.realName
              ? `${conversation.profileUser.realName}'s thread`
              : (conversation?.profileUser?.username ? `${conversation.profileUser.username}'s thread` : (conversation?.title || 'Profile thread'))),
          summary: unreadMessageCount > 0
            ? `${Number(conversation?.unreadCount || conversation?.unreadMessages || 0) || 0} unread messages`
            : `${Number(conversation?.messageCount || 0)} total messages`,
          timestamp: conversation?.lastMessageAt || null
        }));

      setActivitySummary({
        notifications,
        messages,
        unreadMessageCount
      });
    };

    loadActivity();

    return () => {
      isCancelled = true;
    };
  }, [enabled, isOpen]);

  if (!enabled) {
    return null;
  }

  const hasActivityRail = unreadNotificationCount > 0
    || activitySummary.unreadMessageCount > 0
    || activitySummary.notifications.length > 0
    || activitySummary.messages.length > 0;

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close social section menu"
          className="fixed inset-0 z-40 border-0 bg-[radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.18),rgba(2,6,23,0.88)_38%,rgba(2,6,23,0.7)_100%)] backdrop-blur-[3px] md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {hasActivityRail && isOpen && (
        <div className="pointer-events-none fixed inset-x-4 top-20 z-50 md:hidden">
          <div className="mx-auto flex max-w-sm flex-col gap-2">
            {(unreadNotificationCount > 0 || activitySummary.notifications.length > 0) && (
              <div className="rounded-3xl border border-white/15 bg-slate-950/78 p-3 text-white shadow-[0_20px_50px_rgba(2,6,23,0.32)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.28em] text-white/55">Notifications</p>
                    <p className="mt-1 text-sm font-semibold">{unreadNotificationCount > 0 ? `${unreadNotificationCount} unread` : 'Latest updates'}</p>
                  </div>
                  <span className="inline-flex min-w-[2rem] justify-center rounded-full bg-white/12 px-2 py-1 text-xs font-semibold text-white/88">
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount || activitySummary.notifications.length}
                  </span>
                </div>
                {activitySummary.notifications.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {activitySummary.notifications.map((item) => (
                      <div key={item._id || item.id || item.title} className="rounded-2xl border border-white/10 bg-white/6 px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <p className="line-clamp-2 text-sm font-medium text-white/92">{item.title || item.message || item.type || 'New activity'}</p>
                          <span className="shrink-0 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">{formatActivityTimestamp(item.createdAt || item.updatedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(activitySummary.unreadMessageCount > 0 || activitySummary.messages.length > 0) && (
              <div className="rounded-3xl border border-white/15 bg-slate-950/72 p-3 text-white shadow-[0_18px_46px_rgba(2,6,23,0.28)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.28em] text-white/55">Messages</p>
                    <p className="mt-1 text-sm font-semibold">{activitySummary.unreadMessageCount > 0 ? `${activitySummary.unreadMessageCount} unread` : 'Recent activity'}</p>
                  </div>
                  <span className="inline-flex min-w-[2rem] justify-center rounded-full bg-sky-500/20 px-2 py-1 text-xs font-semibold text-sky-100">
                    {activitySummary.unreadMessageCount > 99 ? '99+' : activitySummary.unreadMessageCount || activitySummary.messages.length}
                  </span>
                </div>
                {activitySummary.messages.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {activitySummary.messages.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-white/10 bg-white/6 px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white/92">{item.title}</p>
                            <p className="mt-0.5 line-clamp-1 text-xs text-white/56">{item.summary}</p>
                          </div>
                          <span className="shrink-0 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">{formatActivityTimestamp(item.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className="pointer-events-none fixed bottom-0 right-0 z-50 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        data-testid="global-social-launcher"
      >
        <div className="relative h-[20rem] w-72 overflow-visible">
          <div
            className={`absolute bottom-8 right-8 h-48 w-48 rounded-full transition-all duration-500 ${isOpen ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
            style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.16) 0%, rgba(15,23,42,0) 72%)' }}
            aria-hidden="true"
          />

          <nav
            aria-label="Site navigation shortcuts"
            className={`absolute bottom-[10.6rem] right-3 flex flex-col items-end gap-2 transition-all duration-300 ${isOpen ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0 pointer-events-none'}`}
          >
            {SITE_NAV_LINKS.map((link, index) => {
              const isRouteActive = routeLocation.pathname === link.path;

              return (
                <button
                  key={link.id}
                  type="button"
                  aria-label={`Open ${link.label}`}
                  onClick={() => {
                    navigate(link.path);
                    setIsOpen(false);
                  }}
                  className={`pointer-events-auto flex min-w-[6.4rem] items-center justify-between gap-2 rounded-full border px-3 py-2 text-left shadow-[0_12px_24px_rgba(2,6,23,0.24)] transition-all duration-300 ${isRouteActive ? 'border-white/24 bg-white text-slate-950' : 'border-white/10 bg-slate-950/72 text-white backdrop-blur-xl'}`}
                  style={{ transitionDelay: `${index * 26 + 20}ms` }}
                >
                  <span className="flex items-center gap-2">
                    <TabIcon icon={link.icon} className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-[0.58rem] font-semibold uppercase tracking-[0.14em]">{link.label}</span>
                  </span>
                  <span className={`h-1.5 w-1.5 rounded-full ${isRouteActive ? 'bg-slate-950/45' : 'bg-white/45'}`} aria-hidden="true" />
                </button>
              );
            })}
          </nav>

          <nav id="global-social-nav-menu" aria-label="Social sections" className="absolute inset-0">
            {isOpen && socialMenuItems.map((tab, index) => {
              const isActive = routeLocation.pathname === '/social'
                && new URLSearchParams(routeLocation.search).get('tab') === (tab.id === 'main' ? null : tab.id)
                && resolveContextUsername(routeLocation.pathname, routeLocation.search, currentUsername) === contextUsername;

              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-label={`Open ${SOCIAL_HERO_TAB_LABELS[tab.id]} section`}
                  onClick={() => {
                    navigate(buildSocialPath(contextUsername, tab.id));
                    setIsOpen(false);
                  }}
                  className={`pointer-events-auto absolute bottom-5 right-5 flex w-[4.85rem] origin-bottom-right items-center gap-1.5 rounded-full border px-2.5 py-[7px] text-left shadow-[0_10px_22px_rgba(2,6,23,0.24)] transition-all duration-300 ease-out ${isActive ? 'border-white/25 bg-white text-slate-950' : 'border-white/10 bg-slate-950/82 text-white backdrop-blur-xl'}`}
                  style={{
                    transform: `translate3d(${tab.x}px, ${tab.y}px, 0) scale(1)`,
                    transitionDelay: `${index * 28 + 24}ms`
                  }}
                >
                  <span className="shrink-0">
                    <TabIcon icon={tab.icon} className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate text-[0.55rem] font-semibold tracking-[0.02em]">
                    {SOCIAL_HERO_TAB_LABELS[tab.id]}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="absolute bottom-0 right-0 flex items-end gap-3">
            <button
              type="button"
              className={`pointer-events-auto absolute -bottom-4 -right-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border text-white transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${isOpen ? 'scale-105 border-white/22 bg-slate-950/78 backdrop-blur-xl' : 'scale-100 border-white/14 bg-slate-950/22 backdrop-blur-md'}`}
              style={{ boxShadow: isOpen ? '0 24px 50px rgba(15,23,42,0.33), 0 0 0 1px rgba(226,232,240,0.12)' : '0 18px 36px rgba(15,23,42,0.18), 0 0 0 1px rgba(226,232,240,0.12)' }}
              onClick={() => setIsOpen((prev) => !prev)}
              aria-expanded={isOpen}
              aria-controls="global-social-nav-menu"
              aria-label={isOpen ? 'Collapse social section menu' : 'Expand social section menu'}
            >
              <span className={`absolute inset-[8px] rounded-full border transition-opacity duration-300 ${isOpen ? 'border-white/14 opacity-100' : 'border-white/12 opacity-75'}`} aria-hidden="true" />
              <span className={`absolute inset-0 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-58'}`} aria-hidden="true" style={{ background: 'radial-gradient(circle at 35% 30%, rgba(59,130,246,0.8), rgba(15,23,42,0.08) 42%, transparent 75%)' }} />
              <span className="absolute inset-[15px] rounded-full bg-white/[0.03]" aria-hidden="true" />
              <span className="relative flex flex-col items-center justify-center leading-none">
                <span className="text-[2rem] font-black tracking-[-0.12em]">S</span>
                <span className="mt-1 text-[0.42rem] uppercase tracking-[0.28em] text-white/72">
                  {isOpen ? 'Close' : 'Menu'}
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default GlobalSocialLauncher;