jest.mock('../models/Notification', () => ({
  create: jest.fn()
}));
jest.mock('../models/DeliveryAttempt', () => ({
  insertMany: jest.fn()
}));
jest.mock('../models/User', () => ({
  findById: jest.fn(),
  updateOne: jest.fn()
}));

const Notification = require('../models/Notification');
const DeliveryAttempt = require('../models/DeliveryAttempt');
const User = require('../models/User');
const {
  publish,
  createNotification,
  getUserNotificationPreferences,
  toPayload,
  isInQuietHours,
  setNotificationIo
} = require('./notifications');

describe('notifications service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setNotificationIo(null);
  });

  describe('getUserNotificationPreferences', () => {
    it('returns defaults when user has no preferences', () => {
      const prefs = getUserNotificationPreferences({});
      expect(prefs.likes).toEqual({ inApp: true, email: false, push: false });
      expect(prefs.comments).toEqual({ inApp: true, email: true, push: false });
      expect(prefs.realtime).toEqual({ enabled: true, typingIndicators: true, presence: true });
      expect(prefs.quietHours).toEqual({ enabled: false, start: '22:00', end: '08:00', timezone: 'UTC' });
      expect(prefs.digestMode).toEqual({ enabled: false, frequency: 'daily' });
    });

    it('merges user preferences over defaults', () => {
      const prefs = getUserNotificationPreferences({
        notificationPreferences: {
          likes: { inApp: false, email: true, push: true },
          quietHours: { enabled: true, start: '23:00', end: '07:00', timezone: 'US/Central' },
          digestMode: { enabled: true, frequency: 'weekly' }
        }
      });
      expect(prefs.likes).toEqual({ inApp: false, email: true, push: true });
      expect(prefs.comments).toEqual({ inApp: true, email: true, push: false });
      expect(prefs.quietHours).toEqual({ enabled: true, start: '23:00', end: '07:00', timezone: 'US/Central' });
      expect(prefs.digestMode).toEqual({ enabled: true, frequency: 'weekly' });
    });

    it('rejects invalid digest frequency values', () => {
      const prefs = getUserNotificationPreferences({
        notificationPreferences: {
          digestMode: { enabled: true, frequency: 'hourly' }
        }
      });
      expect(prefs.digestMode.frequency).toBe('daily');
    });
  });

  describe('isInQuietHours', () => {
    it('returns false when quiet hours are disabled', () => {
      expect(isInQuietHours({ quietHours: { enabled: false, start: '22:00', end: '08:00' } })).toBe(false);
    });

    it('returns false when no quiet hours preference exists', () => {
      expect(isInQuietHours({})).toBe(false);
      expect(isInQuietHours(null)).toBe(false);
    });
  });

  describe('toPayload', () => {
    it('includes event, category, and priority in the payload', () => {
      const payload = toPayload({
        _id: 'n1',
        recipientId: 'r1',
        senderId: 's1',
        type: 'like',
        event: 'like',
        category: 'likes',
        priority: 'normal',
        title: 'New like',
        body: 'Someone liked your post',
        data: { postId: 'p1', url: '/social' },
        channels: { inApp: true, email: false, push: false },
        isRead: false,
        readAt: null,
        status: 'active',
        acknowledgedAt: null,
        dismissedAt: null,
        groupKey: 'like:s1',
        createdAt: new Date()
      });
      expect(payload.event).toBe('like');
      expect(payload.category).toBe('likes');
      expect(payload.priority).toBe('normal');
      expect(payload.type).toBe('like');
    });
  });

  describe('createNotification (legacy)', () => {
    it('returns null when required fields are missing', async () => {
      expect(await createNotification({ recipientId: null, type: 'like', title: 'test' })).toBeNull();
      expect(await createNotification({ recipientId: 'r1', type: null, title: 'test' })).toBeNull();
      expect(await createNotification({ recipientId: 'r1', type: 'like', title: '' })).toBeNull();
    });

    it('returns null when sender equals recipient', async () => {
      expect(await createNotification({ recipientId: 'u1', senderId: 'u1', type: 'like', title: 'test' })).toBeNull();
    });

    it('returns null when recipient not found or inactive', async () => {
      User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });
      expect(await createNotification({ recipientId: 'r1', type: 'like', title: 'test' })).toBeNull();
    });

    it('creates notification when all fields are valid', async () => {
      const recipient = { _id: 'r1', registrationStatus: 'active', notificationPreferences: {} };
      User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(recipient) }) });
      const mockNotification = {
        _id: 'n1', recipientId: 'r1', senderId: 's1', type: 'like',
        title: 'New like', body: 'liked', data: {}, channels: { inApp: true, email: false, push: false },
        isRead: false, readAt: null, status: 'active', groupKey: 'like:s1', createdAt: new Date()
      };
      Notification.create.mockResolvedValue(mockNotification);
      User.updateOne.mockResolvedValue({});

      const result = await createNotification({
        recipientId: 'r1', senderId: 's1', type: 'like', title: 'New like', body: 'liked', data: { postId: 'p1' }
      });

      expect(result).toBeDefined();
      expect(Notification.create).toHaveBeenCalledTimes(1);
      expect(User.updateOne).toHaveBeenCalledWith({ _id: 'r1' }, { $inc: { unreadNotificationCount: 1 } });
    });
  });

  describe('publish', () => {
    it('returns null when recipientId is missing', async () => {
      expect(await publish('like', {})).toBeNull();
    });

    it('returns null when sender equals recipient', async () => {
      expect(await publish('like', { recipientId: 'u1', senderId: 'u1' })).toBeNull();
    });

    it('returns null when recipient is inactive', async () => {
      User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ registrationStatus: 'pending' }) }) });
      expect(await publish('like', { recipientId: 'r1', senderId: 's1' })).toBeNull();
    });

    it('creates notification and delivery attempts for a valid publish', async () => {
      const recipient = { _id: 'r1', registrationStatus: 'active', notificationPreferences: {} };
      User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(recipient) }) });

      const createdNotification = {
        _id: 'n1', recipientId: 'r1', senderId: 's1', type: 'like',
        event: 'like', category: 'likes', priority: 'normal',
        title: 'New like', body: 'alice liked your post',
        data: { postId: 'p1', url: '/social' },
        channels: { inApp: true, email: false, push: false },
        isRead: false, readAt: null, status: 'active',
        groupKey: 'like:s1', createdAt: new Date()
      };
      Notification.create.mockResolvedValue(createdNotification);
      DeliveryAttempt.insertMany.mockResolvedValue([]);
      User.updateOne.mockResolvedValue({});

      const result = await publish('like', {
        recipientId: 'r1',
        senderId: 's1',
        senderLabel: 'alice',
        postId: 'p1'
      });

      expect(result).toBeDefined();
      expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({
        recipientId: 'r1',
        senderId: 's1',
        type: 'like',
        event: 'like',
        category: 'likes',
        priority: 'normal'
      }));
      expect(DeliveryAttempt.insertMany).toHaveBeenCalledTimes(1);
      expect(User.updateOne).toHaveBeenCalledWith({ _id: 'r1' }, { $inc: { unreadNotificationCount: 1 } });
    });

    it('resolves sub-events to system model type', async () => {
      const recipient = { _id: 'r1', registrationStatus: 'active', notificationPreferences: {} };
      User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(recipient) }) });
      Notification.create.mockResolvedValue({
        _id: 'n2', recipientId: 'r1', senderId: 's1', type: 'system',
        event: 'friend_request_accepted', category: 'system', priority: 'normal',
        title: 'Friend request accepted', body: 'alice accepted',
        data: { url: '/social' }, channels: { inApp: true, email: true, push: false },
        isRead: false, readAt: null, status: 'active', groupKey: 'system:s1', createdAt: new Date()
      });
      DeliveryAttempt.insertMany.mockResolvedValue([]);
      User.updateOne.mockResolvedValue({});

      await publish('friend_request_accepted', {
        recipientId: 'r1',
        senderId: 's1',
        senderLabel: 'alice'
      });

      expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'system',
        event: 'friend_request_accepted',
        category: 'system'
      }));
    });

    it('falls back to system template for unknown events', async () => {
      const recipient = { _id: 'r1', registrationStatus: 'active', notificationPreferences: {} };
      User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(recipient) }) });
      Notification.create.mockResolvedValue({
        _id: 'n3', recipientId: 'r1', type: 'system', event: 'unknown_event',
        title: 'System notification', body: '',
        data: { url: '/' }, channels: { inApp: true, email: true, push: false },
        isRead: false, readAt: null, status: 'active', createdAt: new Date()
      });
      DeliveryAttempt.insertMany.mockResolvedValue([]);
      User.updateOne.mockResolvedValue({});

      await publish('unknown_event', { recipientId: 'r1' });

      expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'system',
        event: 'unknown_event'
      }));
    });

    it('emits realtime event when ioInstance is set', async () => {
      const mockIo = {
        to: jest.fn().mockReturnValue({ emit: jest.fn() })
      };
      setNotificationIo(mockIo);

      const recipient = { _id: 'r1', registrationStatus: 'active', notificationPreferences: {} };
      User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(recipient) }) });
      Notification.create.mockResolvedValue({
        _id: 'n4', recipientId: 'r1', senderId: 's1', type: 'like',
        event: 'like', title: 'New like', body: 'Test',
        data: { url: '/social' }, channels: { inApp: true, email: false, push: false },
        isRead: false, readAt: null, status: 'active', createdAt: new Date()
      });
      DeliveryAttempt.insertMany.mockResolvedValue([]);
      User.updateOne.mockResolvedValue({});

      await publish('like', { recipientId: 'r1', senderId: 's1', senderLabel: 'alice', postId: 'p1' });

      expect(mockIo.to).toHaveBeenCalledWith('user:r1');
      expect(mockIo.to('user:r1').emit).toHaveBeenCalledWith('notification', expect.any(Object));
    });
  });
});
