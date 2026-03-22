import React, { useState } from 'react';

export function Widget({ 
  id, 
  icon, 
  title, 
  statusText, 
  statusColor = 'var(--text3)', 
  defaultCollapsed = false,
  maxHeight = '500px',
  children 
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={`border-b border-[var(--border)] ${collapsed ? 'collapsed' : ''}`} id={id}>
      <div 
        className="flex items-center gap-[8px] px-[14px] pt-[10px] pb-[6px] cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.02)] select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-[13px]">{icon}</span>
        <span className="font-[var(--mono)] text-[9px] font-semibold tracking-[2px] uppercase text-[var(--text3)] flex-1">
          {title}
        </span>
        {statusText && (
          <span className="font-[var(--mono)] text-[9px]" style={{ color: statusColor }}>
            {statusText}
          </span>
        )}
        <span 
          className="text-[9px] text-[var(--text3)] transition-transform duration-200"
          style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </div>
      <div 
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out" 
        style={{ maxHeight: collapsed ? '0px' : maxHeight }}
      >
        {children}
      </div>
    </div>
  );
}

export default function RightSidebar({ children }) {
  return (
    <aside 
      id="sidebar-right" 
      className="bg-[var(--bg2)] border-l border-[var(--border)] overflow-y-auto flex flex-col w-full h-full [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[var(--bg4)] [&::-webkit-scrollbar-thumb]:rounded shrink-0"
    >
      {children}
    </aside>
  );
}
