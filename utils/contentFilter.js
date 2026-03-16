const WORD_TOKEN_REGEX = /[a-z0-9']+/gi;

const normalizeFilterWord = (value) => String(value || '').trim().toLowerCase();

const normalizeFilterWords = (values = []) => {
  const source = Array.isArray(values) ? values : [];
  const seen = new Set();
  const normalized = [];

  for (const value of source) {
    const trimmed = String(value || '').trim();
    const key = normalizeFilterWord(trimmed);
    if (!trimmed || !key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
};

const buildFilterLookup = (values = []) => {
  const lookup = new Map();
  normalizeFilterWords(values).forEach((value) => {
    lookup.set(normalizeFilterWord(value), value);
  });
  return lookup;
};

const findExactFilterWord = (text, values = []) => {
  const lookup = buildFilterLookup(values);
  if (!lookup.size) return null;

  const source = String(text || '');
  let match;
  while ((match = WORD_TOKEN_REGEX.exec(source)) !== null) {
    const normalized = normalizeFilterWord(match[0]);
    if (lookup.has(normalized)) {
      return lookup.get(normalized);
    }
  }

  return null;
};

const maskSensitiveWord = (value) => {
  const text = String(value || '');
  if (!text) return text;
  if (text.length === 1) return '*';
  if (text.length === 2) return `${text.charAt(0)}*`;
  return `${text.charAt(0)}${'*'.repeat(text.length - 2)}${text.charAt(text.length - 1)}`;
};

const censorMaturityText = (text, values = []) => {
  const lookup = buildFilterLookup(values);
  if (!lookup.size) return String(text || '');

  return String(text || '').replace(WORD_TOKEN_REGEX, (token) => {
    const normalized = normalizeFilterWord(token);
    return lookup.has(normalized) ? maskSensitiveWord(token) : token;
  });
};

module.exports = {
  normalizeFilterWord,
  normalizeFilterWords,
  findExactFilterWord,
  censorMaturityText
};
