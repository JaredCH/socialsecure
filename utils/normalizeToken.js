'use strict';

const normalizeToken = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

module.exports = normalizeToken;
