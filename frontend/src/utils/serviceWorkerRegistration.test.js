import { registerServiceWorker } from './serviceWorkerRegistration';

describe('serviceWorkerRegistration', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalServiceWorker = navigator.serviceWorker;
  const originalAddEventListener = window.addEventListener;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      writable: true,
      value: originalServiceWorker
    });
    window.addEventListener = originalAddEventListener;
  });

  test('registers service worker in production on load', () => {
    process.env.NODE_ENV = 'production';
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

    expect(register).toHaveBeenCalledWith('/service-worker.js');
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

