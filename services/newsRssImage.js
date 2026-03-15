'use strict';

const HTML_IMAGE_PATTERN = /<img[^>]+(?:src|data-src)=["']([^"']+)["']/i;

const sanitizeRssImageUrl = (value) => {
  if (typeof value !== 'string') return null;

  try {
    const normalized = value.trim();
    if (!normalized) return null;

    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (/\.svg(?:$|\?)/i.test(parsed.pathname)) return null;

    return parsed.toString();
  } catch {
    return null;
  }
};

const extractHtmlImage = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const match = value.match(HTML_IMAGE_PATTERN);
  return sanitizeRssImageUrl(match ? match[1] : null);
};

const getNestedUrls = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => getNestedUrls(entry));
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object') return [];

  return [
    value.url,
    value.href,
    value.src,
    value.$?.url,
    value.$?.href,
    value.$?.src
  ].filter(Boolean);
};

const extractRssImageUrl = (item = {}) => {
  const directCandidates = [
    ...getNestedUrls(item['media:content']),
    ...getNestedUrls(item['media:thumbnail']),
    ...getNestedUrls(item['media:group']),
    ...getNestedUrls(item.enclosure),
    ...getNestedUrls(item.enclosures),
    ...getNestedUrls(item.image),
    ...getNestedUrls(item.thumbnail),
    ...getNestedUrls(item['itunes:image'])
  ];

  for (const candidate of directCandidates) {
    const sanitized = sanitizeRssImageUrl(candidate);
    if (sanitized) return sanitized;
  }

  return (
    extractHtmlImage(item['content:encoded']) ||
    extractHtmlImage(item.content) ||
    extractHtmlImage(item.summary) ||
    extractHtmlImage(item.description) ||
    null
  );
};

module.exports = {
  extractRssImageUrl,
  sanitizeRssImageUrl
};