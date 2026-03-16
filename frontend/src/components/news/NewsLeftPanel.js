import React from 'react';
import { getCategoryIcon } from '../../constants/categoryIcons';

/**
 * NewsLeftPanel — desktop left sidebar (260px wide).
 *
 * Props:
 *   categories        {Array}    — [{ key, label }]
 *   activeCategories  {Array}    — currently active category keys
 *   multiSelect       {bool}     — true = multi-select mode
 *   onToggleCategory  {Function} — (key) => void
 *   onMultiSelectToggle {Function}
 *   keywords          {Array}    — [string]
 *   onRemoveKeyword   {Function} — (kw) => void
 *   onAddKeyword      {Function} — (kw) => void
 *   onSearch          {Function} — (q) => void
 *   onOpenSettings    {Function}
 */

export default function NewsLeftPanel({
  categories = [],
  activeCategories = [],
  disabledCategories = [],
  multiSelect = false,
  onToggleCategory,
  onToggleCategoryEnabled,
  onMultiSelectToggle,
  keywords = [],
  onRemoveKeyword,
  onAddKeyword,
  onSearch,
  searchValue = '',
  onOpenSettings,
}) {
  const [kwInput, setKwInput] = React.useState('');
  const disabledSet = React.useMemo(
    () => new Set((disabledCategories || []).map((value) => String(value || '').trim()).filter(Boolean)),
    [disabledCategories]
  );

  const handleAddKeyword = () => {
    const trimmed = kwInput.trim().toLowerCase();
    if (!trimmed || keywords.includes(trimmed)) return;
    onAddKeyword?.(trimmed);
    setKwInput('');
  };

  const isAllActive = activeCategories.length === 0;

  return (
    <aside className="w-[260px] shrink-0 flex flex-col h-full bg-white border-r border-gray-100 overflow-y-auto">
      {/* Search */}
      <div className="px-3 pt-4 pb-2">
        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2 focus-within:ring-2 focus-within:ring-blue-500">
          <span className="material-symbols-outlined text-base text-gray-400 leading-none" aria-hidden="true">search</span>
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearch?.(e.target.value)}
            placeholder="Search news…"
            className="flex-1 bg-transparent text-xs outline-none text-gray-700 placeholder-gray-400"
          />
          {searchValue && (
            <button onClick={() => onSearch?.('')} aria-label="Clear">
              <span className="material-symbols-outlined text-sm text-gray-400">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Settings */}
      <div className="px-3 pb-2">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-xs font-medium"
        >
          <span className="material-symbols-outlined text-base leading-none">settings</span>
          Settings
        </button>
      </div>

      {/* Quick Actions — Keywords */}
      <div className="px-3 pt-2 pb-2 border-t border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Keywords</p>
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-0.5 text-[11px] bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5 font-medium"
              >
                {kw}
                <button
                  aria-label={`Remove keyword ${kw}`}
                  onClick={() => onRemoveKeyword?.(kw)}
                  className="ml-0.5 leading-none hover:text-red-500"
                >
                  <span className="material-symbols-outlined text-xs leading-none">close</span>
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          <input
            type="text"
            value={kwInput}
            onChange={(e) => setKwInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
            placeholder="Add keyword…"
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
          />
          <button
            onClick={handleAddKeyword}
            disabled={!kwInput.trim()}
            className="px-2.5 py-1.5 text-xs bg-purple-600 text-white rounded-lg font-medium disabled:opacity-40 hover:bg-purple-700"
          >
            Add
          </button>
        </div>
      </div>

      {/* Categories header + multi-select toggle */}
      <div className="px-3 pt-2 pb-1 flex items-center justify-between border-t border-gray-100">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Categories</span>
        <button
          onClick={onMultiSelectToggle}
          className={`text-[10px] font-medium px-2 py-0.5 rounded border transition-colors ${
            multiSelect
              ? 'bg-blue-600 text-white border-blue-600'
              : 'text-gray-400 border-gray-200 hover:text-blue-600 hover:border-blue-300'
          }`}
        >
          Multi
        </button>
      </div>

      {/* Category list */}
      <nav className="flex-1 px-2 pb-2">
        {/* All */}
        <button
          onClick={() => onToggleCategory?.(null)}
          className={`w-full flex items-center gap-2 px-2 py-[0.2rem] rounded-xl mb-0.5 text-sm transition-colors ${
            isAllActive && !multiSelect
              ? 'bg-blue-50 text-blue-700 font-semibold'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          <span className="w-4 h-4 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[11px] text-gray-500 leading-none">newspaper</span>
          </span>
          <span className="flex-1 text-left text-[10px] leading-[1.2]">All</span>
        </button>

        {categories.map((cat) => {
          const { symbol, bg, text } = getCategoryIcon(cat.key);
          const active = activeCategories.includes(cat.key);
          const isDisabled = disabledSet.has(cat.key);
          return (
            <div
              key={cat.key}
              data-category-key={cat.key}
              data-disabled={isDisabled ? 'true' : 'false'}
              className={`mb-0.5 flex items-center gap-2 rounded-xl px-2 py-[0.1rem] ${isDisabled ? 'opacity-65' : ''}`}
            >
              <button
                onClick={() => !isDisabled && onToggleCategory?.(cat.key)}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-[0.1rem] text-sm transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : isDisabled
                      ? 'text-gray-400'
                      : 'text-gray-700 hover:bg-gray-50'
                }`}
                aria-label={`Filter by ${cat.label}`}
                disabled={isDisabled}
                type="button"
              >
                <span className={`w-4 h-4 rounded-md ${bg} flex items-center justify-center shrink-0`}>
                  <span className={`material-symbols-outlined text-[11px] leading-none ${text}`}>{symbol}</span>
                </span>
                <span className="flex-1 text-left text-[10px] leading-[1.2] truncate">{cat.label}</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleCategoryEnabled?.(cat.key, isDisabled)}
                aria-label={isDisabled ? `Enable category ${cat.label}` : `Disable category ${cat.label}`}
                role="switch"
                aria-checked={!isDisabled}
                className={`relative inline-flex h-[0.95rem] w-7 shrink-0 rounded-full border transition-colors ${
                  isDisabled ? 'border-gray-300 bg-gray-200' : 'border-blue-500 bg-blue-500'
                }`}
              >
                <span
                  className={`absolute left-0.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                    isDisabled ? 'translate-x-0' : 'translate-x-3.5'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
