import React from 'react';

export default function FeedToolbar({ 
  activeFilter = 'Top', 
  onFilterChange, 
  storyCount = 0,
  viewMode = 'list', 
  onViewChange 
}) {
  return (
    <div className="flex items-center gap-[8px] px-[14px] py-[10px] border-b border-[var(--border)] shrink-0 bg-[var(--bg)] sticky top-0 z-[5]">
      <div className="flex items-baseline gap-2 mr-4">
        <div className="font-[var(--display)] text-[20px] tracking-[2px] text-[var(--text)] uppercase">BRIEFING</div>
        <div className="font-[var(--mono)] text-[10px] text-[var(--text3)] mb-[2px]">{storyCount} STORIES</div>
      </div>
      
      {['Top', 'Latest', 'Nearby', 'Saved'].map(filter => (
        <button
          key={filter}
          onClick={() => onFilterChange?.(filter)}
          className={`font-[var(--mono)] text-[10px] px-[10px] py-[4px] rounded-[4px] border tracking-[0.5px] cursor-pointer transition-all ${
            activeFilter === filter 
              ? 'bg-[rgba(0,212,255,0.1)] border-[var(--accent)] text-[var(--accent)]' 
              : 'border-[var(--border2)] text-[var(--text2)] bg-transparent hover:border-[var(--accent)] hover:text-[var(--accent)]'
          }`}
        >
          {filter}
        </button>
      ))}

      <div className="flex-1" />

      <div className="flex gap-[2px] bg-[var(--bg3)] rounded-[5px] p-[2px]">
        <div 
          onClick={() => onViewChange?.('list')}
          className={`w-[26px] h-[22px] rounded-[3px] flex items-center justify-center text-[11px] cursor-pointer transition-all ${viewMode === 'list' ? 'bg-[var(--bg4)] text-[var(--text)]' : 'text-[var(--text3)]'}`}
        >
          <span className="material-symbols-outlined text-[14px]">view_list</span>
        </div>
        <div 
          onClick={() => onViewChange?.('card')}
          className={`w-[26px] h-[22px] rounded-[3px] flex items-center justify-center text-[11px] cursor-pointer transition-all ${viewMode === 'card' ? 'bg-[var(--bg4)] text-[var(--text)]' : 'text-[var(--text3)]'}`}
        >
          <span className="material-symbols-outlined text-[14px]">grid_view</span>
        </div>
      </div>
    </div>
  );
}
