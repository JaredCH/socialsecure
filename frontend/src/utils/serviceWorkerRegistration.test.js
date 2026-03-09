import { registerServiceWorker } from './serviceWorkerRegistration';

describe('serviceWorkerRegistration', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalPublicUrl = process.env.PUBLIC_URL;
  const originalServiceWorker = navigator.serviceWorker;
  const originalAddEventListener = window.addEventListener;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.PUBLIC_URL = originalPublicUrl;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      writable: true,
      value: originalServiceWorker
    });
    window.addEventListener = originalAddEventListener;
  });

  test('registers service worker in production on load', () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_URL = '/app';
    const register = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      writable: true,
      value: { register }
    });

    window.addEventListener = jest.fn((eventName, callback) => {
      if (eventName === 'load') callback();
    });

    registerServiceWorker();

    expect(register).toHaveBeenCalledWith('/app/service-worker.js');
  });

  test('does not register service worker outside production', () => {
    process.env.NODE_ENV = 'test';
    const register = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      writable: true,
      value: { register }
    });
    window.addEventListener = jest.fn();

    registerServiceWorker();

    expect(window.addEventListener).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
});
