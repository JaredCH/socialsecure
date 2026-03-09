import {
  deliverSiteNotification,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  shouldDisplaySiteNotification
} from './browserNotifications';

describe('browserNotifications', () => {
  const OriginalNotification = global.Notification;
  const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  const originalServiceWorker = navigator.serviceWorker;

  afterEach(() => {
    if (OriginalNotification) {
      global.Notification = OriginalNotification;
    } else {
      delete global.Notification;
    }
    if (originalVisibilityState) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityState);
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      writable: true,
      value: originalServiceWorker
    });
  });

  test('shouldDisplaySiteNotification returns true for hidden tab with granted push preference', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });

    global.Notification = {
      permission: 'granted'
    };

    expect(shouldDisplaySiteNotification(
      { type: 'message' },
      { messages: { push: true } }
    )).toBe(true);
  });

  test('shouldDisplaySiteNotification returns false when tab is visible', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });

    global.Notification = {
      permission: 'granted'
    };

    expect(shouldDisplaySiteNotification(
      { type: 'message' },
      { messages: { push: true } }
    )).toBe(false);
  });

  test('requestBrowserNotificationPermission requests when permission is default', async () => {
    const requestPermission = jest.fn().mockResolvedValue('granted');
    global.Notification = {
      permission: 'default',
      requestPermission
    };

    const result = await requestBrowserNotificationPermission();
    expect(result).toBe('granted');
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(getBrowserNotificationPermission()).toBe('default');
  });

  test('deliverSiteNotification uses service worker showNotification when available', async () => {
    const showNotification = jest.fn().mockResolvedValue(undefined);
    global.Notification = {
      permission: 'granted',
      requestPermission: jest.fn().mockResolvedValue('granted')
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      writable: true,
      value: {
        ready: Promise.resolve({ showNotification })
      }
    });

    const delivered = await deliverSiteNotification({
      title: 'Hello',
      body: 'Body text',
      data: { url: '/chat' }
    });

    expect(delivered).toBe(true);
    expect(showNotification).toHaveBeenCalledWith('Hello', expect.objectContaining({
      body: 'Body text',
      data: { url: '/chat' }
    }));
  });
});

