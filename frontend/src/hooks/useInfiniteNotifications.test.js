import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useInfiniteNotifications from './useInfiniteNotifications';

jest.mock('../utils/api', () => ({
  notificationAPI: {
    getNotifications: jest.fn(),
    getHistory: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    acknowledgeNotification: jest.fn(),
    dismissNotification: jest.fn(),
    deleteNotification: jest.fn(),
  },
}));

const { notificationAPI } = require('../utils/api');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let hookRef;
function HookHost({ options }) {
  const hook = useInfiniteNotifications(options);
  hookRef = hook;
  return null;
}

function mount(options = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<HookHost options={options} />); });
  return { root, container };
}

function cleanup(root, container) {
  act(() => { root.unmount(); });
  container.remove();
}

const makeNotifications = (page, count = 2) =>
  Array.from({ length: count }, (_, i) => ({
    _id: `n-${page}-${i}`,
    type: 'info',
    message: `Notification ${page}-${i}`,
    isRead: false,
    createdAt: new Date().toISOString(),
  }));

describe('useInfiniteNotifications', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('loads page 1 on mount', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: { notifications: makeNotifications(1), pagination: { hasMore: true } },
    });
    const { root, container } = mount();
    await act(async () => {});

    expect(notificationAPI.getNotifications).toHaveBeenCalledWith(1, 20);
    expect(hookRef.notifications).toHaveLength(2);
    expect(hookRef.hasMore).toBe(true);
    expect(hookRef.loading).toBe(false);
    expect(hookRef.error).toBeNull();
    cleanup(root, container);
  });

  it('uses getHistory when history=true', async () => {
    notificationAPI.getHistory.mockResolvedValue({
      data: { notifications: makeNotifications(1), pagination: { hasMore: false } },
    });
    const { root, container } = mount({ history: true });
    await act(async () => {});

    expect(notificationAPI.getHistory).toHaveBeenCalledWith(1, 20);
    expect(notificationAPI.getNotifications).not.toHaveBeenCalled();
    cleanup(root, container);
  });

  it('loads more via loadMore', async () => {
    notificationAPI.getNotifications
      .mockResolvedValueOnce({
        data: { notifications: makeNotifications(1), pagination: { hasMore: true } },
      })
      .mockResolvedValueOnce({
        data: { notifications: makeNotifications(2), pagination: { hasMore: false } },
      });

    const { root, container } = mount();
    await act(async () => {});
    expect(hookRef.notifications).toHaveLength(2);

    await act(async () => { hookRef.loadMore(); });
    expect(hookRef.notifications).toHaveLength(4);
    expect(hookRef.hasMore).toBe(false);
    cleanup(root, container);
  });

  it('deduplicates notifications by _id', async () => {
    const dup = { _id: 'dup-1', type: 'info', message: 'dup', isRead: false, createdAt: new Date().toISOString() };
    notificationAPI.getNotifications
      .mockResolvedValueOnce({
        data: { notifications: [dup, ...makeNotifications(1)], pagination: { hasMore: true } },
      })
      .mockResolvedValueOnce({
        data: { notifications: [dup, ...makeNotifications(2)], pagination: { hasMore: false } },
      });

    const { root, container } = mount();
    await act(async () => {});
    await act(async () => { hookRef.loadMore(); });

    const ids = hookRef.notifications.map((n) => n._id);
    expect(new Set(ids).size).toBe(ids.length);
    cleanup(root, container);
  });

  it('prepends incoming real-time notification', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: { notifications: makeNotifications(1), pagination: { hasMore: false } },
    });
    // Mount without the incoming notification first
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<HookHost options={{}} />); });
    await act(async () => {});
    expect(hookRef.notifications).toHaveLength(2);

    // Now re-render with an incoming notification
    const incoming = { _id: 'rt-1', type: 'alert', message: 'New!', isRead: false, createdAt: new Date().toISOString() };
    act(() => { root.render(<HookHost options={{ incomingNotification: incoming }} />); });
    await act(async () => {});

    expect(hookRef.notifications[0]._id).toBe('rt-1');
    cleanup(root, container);
  });

  it('does not prepend incoming notification when history=true', async () => {
    notificationAPI.getHistory.mockResolvedValue({
      data: { notifications: makeNotifications(1), pagination: { hasMore: false } },
    });
    const incoming = { _id: 'rt-2', type: 'alert', message: 'New!' };

    const { root, container } = mount({ history: true, incomingNotification: incoming });
    await act(async () => {});

    const ids = hookRef.notifications.map((n) => n._id);
    expect(ids).not.toContain('rt-2');
    cleanup(root, container);
  });

  it('markRead updates the notification', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: { notifications: makeNotifications(1), pagination: { hasMore: false } },
    });
    notificationAPI.markAsRead.mockResolvedValue({});

    const { root, container } = mount();
    await act(async () => {});

    let success;
    await act(async () => { success = await hookRef.markRead('n-1-0'); });

    expect(success).toBe(true);
    expect(notificationAPI.markAsRead).toHaveBeenCalledWith('n-1-0');
    const updated = hookRef.notifications.find((n) => n._id === 'n-1-0');
    expect(updated.isRead).toBe(true);
    cleanup(root, container);
  });

  it('markAllRead updates all notifications', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: { notifications: makeNotifications(1), pagination: { hasMore: false } },
    });
    notificationAPI.markAllAsRead.mockResolvedValue({});

    const { root, container } = mount();
    await act(async () => {});

    await act(async () => { await hookRef.markAllRead(); });
    expect(hookRef.notifications.every((n) => n.isRead)).toBe(true);
    cleanup(root, container);
  });

  it('acknowledge removes the notification', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: { notifications: makeNotifications(1), pagination: { hasMore: false } },
    });
    notificationAPI.acknowledgeNotification.mockResolvedValue({});

    const { root, container } = mount();
    await act(async () => {});

    await act(async () => { await hookRef.acknowledge('n-1-0'); });
    const ids = hookRef.notifications.map((n) => n._id);
    expect(ids).not.toContain('n-1-0');
    expect(hookRef.notifications).toHaveLength(1);
    cleanup(root, container);
  });

  it('dismiss removes the notification', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: { notifications: makeNotifications(1), pagination: { hasMore: false } },
    });
    notificationAPI.dismissNotification.mockResolvedValue({});

    const { root, container } = mount();
    await act(async () => {});

    await act(async () => { await hookRef.dismiss('n-1-1'); });
    const ids = hookRef.notifications.map((n) => n._id);
    expect(ids).not.toContain('n-1-1');
    cleanup(root, container);
  });

  it('remove (delete) removes the notification', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: { notifications: makeNotifications(1), pagination: { hasMore: false } },
    });
    notificationAPI.deleteNotification.mockResolvedValue({});

    const { root, container } = mount();
    await act(async () => {});

    await act(async () => { await hookRef.remove('n-1-0'); });
    const ids = hookRef.notifications.map((n) => n._id);
    expect(ids).not.toContain('n-1-0');
    cleanup(root, container);
  });

  it('refresh reloads page 1', async () => {
    notificationAPI.getNotifications
      .mockResolvedValueOnce({
        data: { notifications: makeNotifications(1), pagination: { hasMore: true } },
      })
      .mockResolvedValueOnce({
        data: { notifications: makeNotifications(3, 1), pagination: { hasMore: false } },
      });

    const { root, container } = mount();
    await act(async () => {});
    expect(hookRef.notifications).toHaveLength(2);

    await act(async () => { hookRef.refresh(); });
    expect(hookRef.notifications).toHaveLength(1);
    cleanup(root, container);
  });

  it('sets error on fetch failure', async () => {
    notificationAPI.getNotifications.mockRejectedValue(new Error('Network'));

    const { root, container } = mount();
    await act(async () => {});

    expect(hookRef.error).toBe('Failed to load notifications');
    expect(hookRef.loading).toBe(false);
    cleanup(root, container);
  });

  it('mutation failure returns false', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: { notifications: makeNotifications(1), pagination: { hasMore: false } },
    });
    notificationAPI.markAsRead.mockRejectedValue(new Error('fail'));

    const { root, container } = mount();
    await act(async () => {});

    let success;
    await act(async () => { success = await hookRef.markRead('n-1-0'); });
    expect(success).toBe(false);
    cleanup(root, container);
  });
});
