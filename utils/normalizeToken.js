'use strict';

/** Normalize tokens to lowercase alphanumeric values for stable indexing and lookups. */
const normalizeToken = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

module.exports = normalizeToken;
