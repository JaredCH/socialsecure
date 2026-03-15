/**
 * Shared helpers for news component formatting.
 */

/**
 * Format a date string as a relative time (e.g., "5m ago", "2h ago").
 */
export const formatRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
};

export const isRenderableNewsImageUrl = (value) => {
  if (typeof value !== 'string') return false;

  try {
    const normalized = value.trim();
    if (!normalized) return false;

    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (/\.svg(?:$|\?)/i.test(parsed.pathname)) return false;

    return true;
  } catch {
    return false;
  }
};

export const getRenderableNewsImageUrl = (article) => {
  const candidate = article?.imageUrl;
  return isRenderableNewsImageUrl(candidate) ? candidate.trim() : null;
};
