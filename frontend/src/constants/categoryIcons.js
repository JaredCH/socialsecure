/**
 * categoryIcons.js
 *
 * Maps each news category key to a Google Material Symbol name and a
 * Tailwind CSS background/text colour pair used in article row icons.
 */

export const CATEGORY_ICONS = {
  general:       { symbol: 'newspaper',         bg: 'bg-slate-100',   text: 'text-slate-600' },
  breaking:      { symbol: 'breaking_news',       bg: 'bg-red-100',     text: 'text-red-600'   },
  technology:    { symbol: 'computer',            bg: 'bg-blue-100',    text: 'text-blue-600'  },
  science:       { symbol: 'science',             bg: 'bg-violet-100',  text: 'text-violet-600'},
  health:        { symbol: 'health_and_safety',   bg: 'bg-emerald-100', text: 'text-emerald-600'},
  business:      { symbol: 'business_center',     bg: 'bg-amber-100',   text: 'text-amber-600' },
  sports:        { symbol: 'sports_score',        bg: 'bg-red-100',     text: 'text-red-500'   },
  entertainment: { symbol: 'theater_comedy',      bg: 'bg-pink-100',    text: 'text-pink-600'  },
  politics:      { symbol: 'account_balance',     bg: 'bg-indigo-100',  text: 'text-indigo-600'},
  finance:       { symbol: 'candlestick_chart',   bg: 'bg-green-100',   text: 'text-green-600' },
  gaming:        { symbol: 'sports_esports',      bg: 'bg-purple-100',  text: 'text-purple-600'},
  ai:            { symbol: 'smart_toy',           bg: 'bg-cyan-100',    text: 'text-cyan-600'  },
  world:         { symbol: 'public',              bg: 'bg-blue-50',     text: 'text-blue-500'  },
  war:           { symbol: 'military_tech',       bg: 'bg-orange-100',  text: 'text-orange-700'},
  marijuana:     { symbol: 'eco',                 bg: 'bg-lime-100',    text: 'text-lime-700'  },
  conspiracy:    { symbol: 'manage_search',       bg: 'bg-gray-100',    text: 'text-gray-600'  },
  space:         { symbol: 'rocket_launch',       bg: 'bg-indigo-50',   text: 'text-indigo-500'},
  ocean:         { symbol: 'waves',               bg: 'bg-teal-100',    text: 'text-teal-600'  },
  nature:        { symbol: 'forest',              bg: 'bg-green-50',    text: 'text-green-500' },
  programming:   { symbol: 'code',                bg: 'bg-slate-100',   text: 'text-slate-700' },
};

/** Fallback for unknown categories */
export const DEFAULT_ICON = { symbol: 'article', bg: 'bg-gray-100', text: 'text-gray-500' };

/**
 * Get the icon config for a category key.
 * @param {string} categoryKey
 */
export function getCategoryIcon(categoryKey) {
  return CATEGORY_ICONS[categoryKey] || DEFAULT_ICON;
}
