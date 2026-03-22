import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function NewsTopNav({ locationLabel = 'Local', onLocationClick }) {
  const navigate = useNavigate();

  return (
    <div className="bg-[var(--bg2)] border-b border-[var(--border)] h-[44px] flex items-center px-4 gap-2 shrink-0">
      <div className="font-[var(--display)] text-[22px] tracking-[2px] text-[var(--text)] mr-2 cursor-pointer" onClick={() => navigate('/')}>
        Social<span className="text-[var(--accent)]">Secure</span>
      </div>
      
      <nav className="flex gap-[2px] flex-1">
        <div className="text-[12px] font-medium text-[var(--text2)] px-3 py-[5px] rounded-[var(--radius)] cursor-pointer transition-all hover:bg-[var(--bg3)] hover:text-[var(--text)] tracking-[0.3px]" onClick={() => navigate('/')}>
          Feed
        </div>
        <div className="text-[12px] font-medium text-[var(--accent)] px-3 py-[5px] rounded-[var(--radius)] cursor-pointer transition-all bg-[rgba(0,212,255,0.1)] tracking-[0.3px]">
          News
        </div>
      </nav>
      
      <div className="flex items-center gap-2">
        <button 
          onClick={onLocationClick}
          className="flex items-center gap-[6px] bg-[var(--bg3)] border border-[var(--border2)] rounded-[var(--radius)] px-[10px] py-[5px] text-[11px] text-[var(--text2)] cursor-pointer transition-all font-[var(--mono)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <div className="w-[6px] h-[6px] rounded-full bg-[var(--green)] animate-[pulse_2s_infinite]" />
          {locationLabel}
        </button>
        <button className="w-[30px] h-[30px] rounded-[var(--radius)] bg-[var(--bg3)] border border-[var(--border)] text-[var(--text2)] flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--bg4)] hover:text-[var(--text)]">
          <span className="material-symbols-outlined text-[18px]">notifications</span>
        </button>
        <button className="w-[30px] h-[30px] rounded-[var(--radius)] bg-[var(--bg3)] border border-[var(--border)] text-[var(--text2)] flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--bg4)] hover:text-[var(--text)]" onClick={() => navigate('/profile')}>
          <span className="material-symbols-outlined text-[18px]">person</span>
        </button>
      </div>
    </div>
  );
}
