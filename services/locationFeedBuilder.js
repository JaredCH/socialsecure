'use strict';

function toTitleCase(value = '') {
  return String(value || '')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');
}

function buildFeedUrls(normalizedLocation = {}) {
  const city = String(normalizedLocation.city || '').trim();
  const state = String(normalizedLocation.state || '').trim().toUpperCase();
  const stateFull = toTitleCase(normalizedLocation.stateFull || normalizedLocation.state || '');
  const cityDisplay = city.replace(/_/g, ' ');

  return {
    local: `https://news.google.com/rss/search?q=${encodeURIComponent(`${cityDisplay} ${state}`.trim())}&hl=en-US&gl=US&ceid=US:en`,
    state: `https://news.google.com/rss/search?q=${encodeURIComponent(stateFull)}&hl=en-US&gl=US&ceid=US:en`,
    national: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en'
  };
}

module.exports = {
  buildFeedUrls,
  toTitleCase
};
