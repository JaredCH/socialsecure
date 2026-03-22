import React, { useState, useMemo } from 'react';
import { getCategoryIcon } from '../../constants/categoryIcons';

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
  regions = [
    { id: 'all', label: 'All Regions', count: 247 },
    { id: 'local', label: 'Local (TX)', count: 34 },
    { id: 'national', label: 'National', count: 89 },
    { id: 'world', label: 'World', count: 124 }
  ],
  activeRegion = 'all',
  onRegionChange,
  onOpenSettings
}) {
  const [kwInput, setKwInput] = useState('');
  const [secRegionsOpen, setSecRegionsOpen] = useState(true);
  const [secCategoriesOpen, setSecCategoriesOpen] = useState(true);
  const [secKeywordsOpen, setSecKeywordsOpen] = useState(true);

  const disabledSet = useMemo(
    () => new Set((disabledCategories || []).map((value) => String(value || '').trim()).filter(Boolean)),
    [disabledCategories]
  );

  const handleAddKeyword = () => {
    const trimmed = kwInput.trim().toLowerCase();
    if (!trimmed || keywords.includes(trimmed)) return;
    onAddKeyword?.(trimmed);
    setKwInput('');
  };

  return (
    <div 
      id="sidebar-left" 
      className="bg-[var(--bg2)] border-r border-[var(--border)] overflow-y-auto flex flex-col w-full h-full [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[var(--bg4)] [&::-webkit-scrollbar-thumb]:rounded shrink-0"
    >
      {/* Search Section */}
      <div className="border-b border-[var(--border)] py-[10px]">
        <div className="relative px-[10px] pt-0">
          <input 
            type="text" 
            placeholder="Search news..." 
            value={searchValue}
            onChange={(e) => onSearch?.(e.target.value)}
            className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-[var(--radius)] py-[6px] pr-[28px] pl-[10px] text-[11px] text-[var(--text)] font-[var(--sans)] transition-colors outline-none focus:border-[var(--accent)] placeholder:text-[var(--text3)]"
          />
          {searchValue ? (
             <span 
               className="absolute right-[18px] top-1/2 -translate-y-1/2 text-[var(--text3)] text-[12px] cursor-pointer hover:text-[var(--text)]"
               onClick={() => onSearch?.('')}
             >
               ✕
             </span>
          ) : (
            <span className="absolute right-[18px] top-1/2 -translate-y-1/2 text-[var(--text3)] text-[14px]">
              ⌕
            </span>
          )}
        </div>
      </div>

      {/* Regions Section */}
      <div className="border-b border-[var(--border)] py-[10px]">
        <div 
          className="flex items-center justify-between px-[14px] py-[4px] pb-[8px] text-[9px] font-[var(--mono)] tracking-[2px] text-[var(--text3)] uppercase cursor-pointer hover:text-[var(--text2)]"
          onClick={() => setSecRegionsOpen(!secRegionsOpen)}
        >
          <span>Regions</span>
          <span className={`text-[10px] transition-transform duration-200 ${!secRegionsOpen ? '-rotate-90' : ''}`}>▾</span>
        </div>
        
        {secRegionsOpen && (
          <div>
            {regions.map(r => {
              const isActive = activeRegion === r.id;
              return (
                <div 
                  key={r.id}
                  onClick={() => onRegionChange?.(r.id)}
                  className={`flex items-center gap-[8px] py-[6px] px-[14px] text-[11px] cursor-pointer transition-all border-l-2 ${isActive ? 'text-[var(--accent)] border-[var(--accent)] bg-[rgba(0,212,255,0.04)]' : 'text-[var(--text2)] border-transparent hover:text-[var(--text)] hover:bg-[rgba(255,255,255,0.03)]'}`}
                >
                  <div className={`w-[5px] h-[5px] rounded-full shrink-0 ${isActive ? 'bg-[var(--accent)]' : 'bg-[var(--text3)]'}`} />
                  {r.label}
                  <span className="ml-auto font-[var(--mono)] text-[9px] text-[var(--text3)]">{r.count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Categories Section */}
      <div className="border-b border-[var(--border)] py-[10px]">
        <div 
          className="flex items-center justify-between px-[14px] py-[4px] pb-[8px] text-[9px] font-[var(--mono)] tracking-[2px] text-[var(--text3)] uppercase cursor-pointer hover:text-[var(--text2)]"
          onClick={() => setSecCategoriesOpen(!secCategoriesOpen)}
        >
          <span>Categories</span>
          <span className={`text-[10px] transition-transform duration-200 ${!secCategoriesOpen ? '-rotate-90' : ''}`}>▾</span>
        </div>
        
        {secCategoriesOpen && (
          <div>
            {/* All News Toggle */}
            <div 
              className={`flex items-center gap-[8px] py-[5px] px-[14px] text-[11px] cursor-pointer transition-colors ${activeCategories.length === 0 ? 'bg-[rgba(255,255,255,0.04)] text-[var(--accent)]' : 'text-[var(--text2)] hover:bg-[rgba(255,255,255,0.02)] hover:text-[var(--text)]'}`}
            >
              <span 
                className="material-symbols-outlined w-[24px] text-left text-[18px] cursor-pointer"
                style={{ lineHeight: '1' }}
                onClick={() => onToggleCategory?.(null)}
              >
                apps
              </span>
              <span 
                className="flex-1"
                onClick={() => onToggleCategory?.(null)}
              >
                All News
              </span>
            </div>
            {categories.map((cat) => {
              const { symbol } = getCategoryIcon(cat.key);
              const isDisabled = disabledSet.has(cat.key);
              const isActive = activeCategories.includes(cat.key);
              
              return (
                <div 
                  key={cat.key}
                  className={`flex items-center gap-[8px] py-[5px] px-[14px] text-[11px] cursor-pointer transition-colors ${isActive ? 'bg-[rgba(255,255,255,0.04)] text-[var(--accent)]' : 'text-[var(--text2)] hover:bg-[rgba(255,255,255,0.02)] hover:text-[var(--text)]'}`}
                >
                  <span 
                    className="material-symbols-outlined w-[24px] text-left text-[18px] cursor-pointer"
                    style={{ lineHeight: '1' }}
                    onClick={() => !isDisabled && onToggleCategory?.(cat.key)}
                  >
                    {symbol}
                  </span>
                  <span 
                    className={`flex-1 ${isDisabled ? 'opacity-50 line-through' : ''}`}
                    onClick={() => !isDisabled && onToggleCategory?.(cat.key)}
                  >
                    {cat.label}
                  </span>
                  
                  {/* Custom Toggle Switch */}
                  <div 
                    onClick={() => onToggleCategoryEnabled?.(cat.key, isDisabled)}
                    className={`ml-auto w-[28px] h-[15px] rounded-[8px] border shrink-0 relative cursor-pointer transition-colors ${!isDisabled ? 'bg-[var(--accent)] border-[var(--accent)]' : 'bg-[var(--bg4)] border-[var(--border2)]'}`}
                  >
                    <div 
                      className={`absolute top-[1px] left-[1px] w-[11px] h-[11px] rounded-full bg-white transition-transform shadow-[0_1px_3px_rgba(0,0,0,0.4)] ${!isDisabled ? 'translate-x-[13px]' : 'translate-x-0'}`} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Keywords Section */}
      <div className="border-b border-[var(--border)] py-[10px]">
        <div 
          className="flex items-center justify-between px-[14px] py-[4px] pb-[8px] text-[9px] font-[var(--mono)] tracking-[2px] text-[var(--text3)] uppercase cursor-pointer hover:text-[var(--text2)]"
          onClick={() => setSecKeywordsOpen(!secKeywordsOpen)}
        >
          <span>Keywords</span>
          <span className={`text-[10px] transition-transform duration-200 ${!secKeywordsOpen ? '-rotate-90' : ''}`}>▾</span>
        </div>
        
        {secKeywordsOpen && (
          <div className="px-[10px] pt-[6px] pb-[8px]">
            <div className="flex gap-[4px] mb-[6px]">
              <input 
                type="text" 
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
                placeholder="Add keyword..." 
                className="flex-1 bg-[var(--bg3)] border border-[var(--border)] rounded-[4px] px-[8px] py-[5px] text-[10px] text-[var(--text)] outline-none font-[var(--sans)]"
              />
              <button 
                onClick={handleAddKeyword}
                className="bg-[var(--accent)] border-none rounded-[4px] px-[8px] py-[5px] text-[10px] text-[var(--bg)] cursor-pointer font-bold hover:brightness-110"
              >
                +
              </button>
            </div>
            
            <div className="flex flex-wrap gap-[4px]">
              {keywords.map(kw => (
                <span 
                  key={kw}
                  onClick={() => onRemoveKeyword?.(kw)}
                  className="font-[var(--mono)] text-[9px] px-[8px] py-[3px] rounded-[4px] border border-[var(--border2)] text-[var(--text3)] cursor-pointer transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] flex items-center gap-[4px]"
                >
                  {kw} <span className="text-[7px]">✕</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Settings Action */}
      <div className="mt-auto py-[16px] px-[14px]">
        <button 
          onClick={onOpenSettings}
          className="w-full flex items-center gap-[10px] py-[10px] px-[12px] bg-[var(--bg3)] rounded-[var(--radius)] text-[11px] text-[var(--text2)] hover:text-[var(--accent)] hover:border-[var(--accent)] border border-[var(--border)] transition-all cursor-pointer group"
        >
          <span className="material-symbols-outlined text-[16px] group-hover:rotate-90 transition-transform">tune</span>
          <span className="font-medium">Open Feed settings</span>
        </button>
      </div>
      
    </div>
  );
}
