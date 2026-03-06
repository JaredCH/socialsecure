const SCORE_VERSION = 'v1';

const DEFAULT_WEIGHTS = {
  freshness: 0.35,
  urgencyTerms: 0.2,
  sentimentIntensity: 0.15,
  sourceMomentum: 0.2,
  shareCueTerms: 0.1
};

const URGENCY_TERMS = {
  breaking: 18,
  major: 12,
  urgent: 16,
  wins: 9,
  record: 11,
  alert: 14,
  crisis: 15,
  shock: 10,
  exclusive: 8
};

const SHARE_CUE_TERMS = {
  watch: 12,
  viral: 14,
  trending: 10,
  reactions: 8,
  mustsee: 12,
  whathappened: 9,
  unbelievable: 10,
  reveals: 8
};

const PROFANITY_OR_SPAM_PATTERNS = [
  /\b(?:damn|shit|fuck)\b/i,
  /\b(?:buy\s+now|click\s+here|free\s+money)\b/i,
  /([!?])\1{3,}/
];

const toNumber = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const envNumber = (name, fallback) => toNumber(process.env[name], fallback);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeToken = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const getWeights = () => {
  const weights = {
    freshness: envNumber('NEWS_VIRAL_WEIGHT_FRESHNESS', DEFAULT_WEIGHTS.freshness),
    urgencyTerms: envNumber('NEWS_VIRAL_WEIGHT_URGENCY', DEFAULT_WEIGHTS.urgencyTerms),
    sentimentIntensity: envNumber('NEWS_VIRAL_WEIGHT_SENTIMENT', DEFAULT_WEIGHTS.sentimentIntensity),
    sourceMomentum: envNumber('NEWS_VIRAL_WEIGHT_SOURCE_MOMENTUM', DEFAULT_WEIGHTS.sourceMomentum),
    shareCueTerms: envNumber('NEWS_VIRAL_WEIGHT_SHARE_CUES', DEFAULT_WEIGHTS.shareCueTerms)
  };

  const total = Object.values(weights).reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, Math.max(0, value) / total])
  );
};

const computeFreshness = (publishedAt, now = new Date()) => {
  const publishedDate = publishedAt ? new Date(publishedAt) : null;
  if (!publishedDate || Number.isNaN(publishedDate.getTime())) return 0;
  const ageMs = Math.max(0, now.getTime() - publishedDate.getTime());
  const ageHours = ageMs / (60 * 60 * 1000);
  const halfLifeHours = envNumber('NEWS_VIRAL_FRESHNESS_HALF_LIFE_HOURS', 12);
  const score = 100 * Math.pow(0.5, ageHours / Math.max(1, halfLifeHours));
  return clamp(Math.round(score), 0, 100);
};

const computeDictionarySignal = (text, dictionary) => {
  const tokens = String(text || '').toLowerCase().split(/\s+/).map(normalizeToken);
  const tokenSet = new Set(tokens.filter(Boolean));
  const signal = Object.entries(dictionary).reduce((sum, [term, weight]) => {
    return sum + (tokenSet.has(term) ? weight : 0);
  }, 0);
  return clamp(signal, 0, 100);
};

const computeSentimentIntensity = (title, description) => {
  const headline = String(title || '');
  const body = String(description || '');
  const combined = `${headline} ${body}`.trim();
  if (!combined) return 0;

  const exclamationCount = (headline.match(/!/g) || []).length;
  const upperTokens = headline.split(/\s+/).filter(token => token.length >= 4 && token === token.toUpperCase());
  const noveltyHits = (combined.toLowerCase().match(/\b(?:first|new|unprecedented|sudden|historic)\b/g) || []).length;

  const signal = (exclamationCount * 7) + (upperTokens.length * 8) + (noveltyHits * 6);
  return clamp(signal, 0, 100);
};

const computeSpamPenalty = (text) => {
  if (!text) return 0;
  const matches = PROFANITY_OR_SPAM_PATTERNS.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
  return matches * 18;
};

const calculateViralScore = (article = {}, options = {}) => {
  const now = options.now ? new Date(options.now) : new Date();
  const sourceMomentumInput = toNumber(options.sourceMomentum, 0);
  const minScore = envNumber('NEWS_VIRAL_SCORE_MIN', 0);
  const maxScore = envNumber('NEWS_VIRAL_SCORE_MAX', 100);
  const promotedThreshold = envNumber('NEWS_VIRAL_PROMOTED_THRESHOLD', 65);
  const weights = getWeights();

  const title = String(article.title || '');
  const description = String(article.description || '');
  const signalText = `${title} ${description}`;

  const signals = {
    freshness: computeFreshness(article.publishedAt, now),
    urgencyTerms: computeDictionarySignal(title, URGENCY_TERMS),
    sentimentIntensity: computeSentimentIntensity(title, description),
    sourceMomentum: clamp(Math.round(sourceMomentumInput), 0, 100),
    shareCueTerms: computeDictionarySignal(signalText, SHARE_CUE_TERMS)
  };

  const weightedScore = Object.keys(signals).reduce((sum, key) => {
    return sum + (signals[key] * (weights[key] || 0));
  }, 0);

  const safetyPenalty = computeSpamPenalty(signalText);
  const score = clamp(Math.round(weightedScore - safetyPenalty), minScore, maxScore);

  return {
    score,
    scoreVersion: SCORE_VERSION,
    isPromoted: score >= promotedThreshold,
    lastScoredAt: now,
    signals
  };
};

const createMomentumMap = (articles = [], now = new Date()) => {
  const windowMinutes = envNumber('NEWS_VIRAL_MOMENTUM_WINDOW_MINUTES', 180);
  const windowMs = Math.max(1, windowMinutes) * 60 * 1000;
  const map = new Map();

  for (const article of articles) {
    const keyParts = [];
    if (Array.isArray(article.topics) && article.topics.length > 0) {
      keyParts.push(...article.topics.map(v => String(v || '').toLowerCase()));
    } else {
      keyParts.push(normalizeToken(String(article.title || '').split(/\s+/).slice(0, 4).join(' ')));
    }
    const uniqueKeys = Array.from(new Set(keyParts.filter(Boolean)));
    if (uniqueKeys.length === 0) continue;

    const publishedAt = article.publishedAt ? new Date(article.publishedAt) : now;
    if (now.getTime() - publishedAt.getTime() > windowMs) continue;

    for (const key of uniqueKeys) {
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(String(article.source || 'unknown'));
    }
  }

  return map;
};

const getArticleMomentumSignal = (article = {}, momentumMap = new Map()) => {
  const keys = (Array.isArray(article.topics) && article.topics.length > 0)
    ? article.topics.map(v => String(v || '').toLowerCase())
    : [normalizeToken(String(article.title || '').split(/\s+/).slice(0, 4).join(' '))];

  let maxSources = 1;
  for (const key of keys.filter(Boolean)) {
    const sourceSet = momentumMap.get(key);
    if (!sourceSet) continue;
    maxSources = Math.max(maxSources, sourceSet.size);
  }

  return clamp((maxSources - 1) * 25, 0, 100);
};

const summarizeSignals = (signals = {}) => {
  return {
    freshness: Math.round(toNumber(signals.freshness, 0)),
    urgencyTerms: Math.round(toNumber(signals.urgencyTerms, 0)),
    sentimentIntensity: Math.round(toNumber(signals.sentimentIntensity, 0)),
    sourceMomentum: Math.round(toNumber(signals.sourceMomentum, 0)),
    shareCueTerms: Math.round(toNumber(signals.shareCueTerms, 0))
  };
};

module.exports = {
  SCORE_VERSION,
  calculateViralScore,
  createMomentumMap,
  getArticleMomentumSignal,
  summarizeSignals
};
