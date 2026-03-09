export const registerServiceWorker = () => {
  if (process.env.NODE_ENV !== 'production') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${process.env.PUBLIC_URL}/service-worker.js`).catch((error) => {
      // eslint-disable-next-line no-console
      console.warn('Service worker registration failed', error);
    });
  });
};
