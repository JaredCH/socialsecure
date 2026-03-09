const TYPE_TO_PREFERENCE_KEY = {
  like: 'likes',
  comment: 'comments',
  mention: 'mentions',
  follow: 'follows',
  message: 'messages',
  system: 'system',
  security_alert: 'securityAlerts',
  market_transaction: 'system'
};

export const isBrowserNotificationSupported = () => (
  typeof window !== 'undefined'
  && 'Notification' in window
);

export const getBrowserNotificationPermission = () => {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  return Notification.permission;
};

export const requestBrowserNotificationPermission = async () => {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;

  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
};

export const shouldDisplaySiteNotification = (notification, preferences) => {
  if (!notification) return false;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return false;
  if (getBrowserNotificationPermission() !== 'granted') return false;

  const preferenceKey = TYPE_TO_PREFERENCE_KEY[notification.type];
  if (!preferenceKey) return false;
  return Boolean(preferences?.[preferenceKey]?.push);
};

export const deliverSiteNotification = async (notification) => {
  if (!notification) return false;
  const title = notification.title || 'SocialSecure';
  const options = {
    body: notification.body || '',
    icon: `${process.env.PUBLIC_URL || ''}/icon-192x192.png`,
    badge: `${process.env.PUBLIC_URL || ''}/icon-192x192.png`,
    data: {
      url: notification.data?.url || '/notification-settings'
    }
  };

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration?.showNotification) {
        await registration.showNotification(title, options);
        return true;
      }
    } catch {
      // fallback to Notification API
    }
  }

  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
};

