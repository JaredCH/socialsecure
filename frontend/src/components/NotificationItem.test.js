import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import NotificationItem from './NotificationItem';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('NotificationItem', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    container = null;
    root = null;
  });

  const renderItem = async (props) => {
    await act(async () => {
      root.render(<NotificationItem {...props} />);
    });
  };

  const noop = () => {};

  describe('direct message notifications (type: message)', () => {
    const dmNotification = {
      _id: 'dm-1',
      type: 'message',
      title: 'New message',
      body: 'alice sent you a message',
      isRead: false,
      createdAt: new Date().toISOString(),
      senderId: 'sender-1',
      data: { roomId: 'room-1' },
    };

    it('shows Mark Read, Dismiss, and View buttons', async () => {
      await renderItem({
        notification: dmNotification,
        onOpen: noop,
        onMarkRead: noop,
        onDelete: noop,
        onAcknowledge: noop,
        onDismiss: noop,
        onView: noop,
        onFriendRequestAction: noop,
        onFriendCircleChange: noop,
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const labels = buttons.map((b) => b.textContent.trim());

      expect(labels).toContain('Mark Read');
      expect(labels).toContain('Dismiss');
      expect(labels).toContain('View');
    });

    it('does NOT show Acknowledge or Delete buttons', async () => {
      await renderItem({
        notification: dmNotification,
        onOpen: noop,
        onMarkRead: noop,
        onDelete: noop,
        onAcknowledge: noop,
        onDismiss: noop,
        onView: noop,
        onFriendRequestAction: noop,
        onFriendCircleChange: noop,
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const labels = buttons.map((b) => b.textContent.trim());

      expect(labels).not.toContain('Acknowledge');
      expect(labels).not.toContain('Delete');
      expect(labels).not.toContain('Mark read');
    });

    it('calls onAcknowledge when Mark Read is clicked', async () => {
      const onAcknowledge = jest.fn();
      await renderItem({
        notification: dmNotification,
        onOpen: noop,
        onMarkRead: noop,
        onDelete: noop,
        onAcknowledge,
        onDismiss: noop,
        onView: noop,
        onFriendRequestAction: noop,
        onFriendCircleChange: noop,
      });

      const markReadBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.trim() === 'Mark Read');
      await act(async () => { markReadBtn.click(); });

      expect(onAcknowledge).toHaveBeenCalledWith('dm-1');
    });

    it('calls onDismiss when Dismiss is clicked', async () => {
      const onDismiss = jest.fn();
      await renderItem({
        notification: dmNotification,
        onOpen: noop,
        onMarkRead: noop,
        onDelete: noop,
        onAcknowledge: noop,
        onDismiss,
        onView: noop,
        onFriendRequestAction: noop,
        onFriendCircleChange: noop,
      });

      const dismissBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.trim() === 'Dismiss');
      await act(async () => { dismissBtn.click(); });

      expect(onDismiss).toHaveBeenCalledWith('dm-1');
    });

    it('calls onView with the notification when View is clicked', async () => {
      const onView = jest.fn();
      await renderItem({
        notification: dmNotification,
        onOpen: noop,
        onMarkRead: noop,
        onDelete: noop,
        onAcknowledge: noop,
        onDismiss: noop,
        onView,
        onFriendRequestAction: noop,
        onFriendCircleChange: noop,
      });

      const viewBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.trim() === 'View');
      await act(async () => { viewBtn.click(); });

      expect(onView).toHaveBeenCalledWith(dmNotification);
    });

    it('does not show DM actions in history mode', async () => {
      await renderItem({
        notification: { ...dmNotification, status: 'acknowledged', acknowledgedAt: new Date().toISOString() },
        isHistory: true,
        onOpen: noop,
        onMarkRead: noop,
        onDelete: noop,
        onAcknowledge: noop,
        onDismiss: noop,
        onView: noop,
        onFriendRequestAction: noop,
        onFriendCircleChange: noop,
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const labels = buttons.map((b) => b.textContent.trim());

      expect(labels).not.toContain('Mark Read');
      expect(labels).not.toContain('View');
      expect(container.textContent).toContain('Acknowledged');
    });
  });

  describe('non-message notifications', () => {
    const genericNotification = {
      _id: 'gen-1',
      type: 'like',
      title: 'New like',
      body: 'Someone liked your post',
      isRead: false,
      createdAt: new Date().toISOString(),
      senderId: 'sender-2',
    };

    it('shows Acknowledge, Dismiss, Mark read, and Delete buttons', async () => {
      await renderItem({
        notification: genericNotification,
        onOpen: noop,
        onMarkRead: noop,
        onDelete: noop,
        onAcknowledge: noop,
        onDismiss: noop,
        onView: noop,
        onFriendRequestAction: noop,
        onFriendCircleChange: noop,
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const labels = buttons.map((b) => b.textContent.trim());

      expect(labels).toContain('Acknowledge');
      expect(labels).toContain('Dismiss');
      expect(labels).toContain('Mark read');
      expect(labels).toContain('Delete');
      expect(labels).not.toContain('View');
      expect(labels).not.toContain('Mark Read');
    });
  });
});
