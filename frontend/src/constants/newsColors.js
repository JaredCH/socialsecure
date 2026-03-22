/**
 * Centralized color mapping for news categories.
 * Based on the prototype design system.
 */
export const CATEGORY_COLORS = {
  breaking: '#ff4757',      // Coral Red
  tech: '#00d4ff',          // Electric Blue
  technology: '#00d4ff',
  politics: '#f5a623',      // Amber
  science: '#7c3aed',       // Violet
  markets: '#00c47a',       // Emerald
  finance: '#00c47a',
  health: '#ff6b35',        // Orange Burst
  sports: '#facc15',        // Bright Yellow
  entertainment: '#ec4899',   // Pink
  world: '#3b82f6',         // Royal Blue
  business: '#10b981',      // Teal
  gaming: '#8b5cf6',        // Purple
  general: '#64748b',       // Slate
  nature: '#22c55e',        // Green
  conspiracy: '#ef4444',    // Red
  marijuana: '#059669',     // Deep Green
  programming: '#3b82f6',   // Blue
  space: '#0ea5e9',         // Sky Blue
  war: '#dc2626',           // Crimson
  ai: '#a855f7',            // Light Purple
};

export const DEFAULT_CATEGORY_COLOR = '#555b6e';

/**
 * Get color for a category string
 * @param {string} category 
 * @returns {string} hex color
 */
export function getCategoryColor(category) {
  if (!category) return DEFAULT_CATEGORY_COLOR;
  return CATEGORY_COLORS[category.toLowerCase()] || DEFAULT_CATEGORY_COLOR;
}
