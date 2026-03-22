import React from 'react';

export default function BreakingBanner({ text = "🚨 Major cybersecurity breach affects 50M users nationwide. Markets react violently as tech stocks tumble..." }) {
  if (!text) return null;

  return (
    <div 
      className="flex items-center gap-[10px] shrink-0 cursor-pointer transition-colors px-[16px] py-[8px] bg-gradient-to-br from-[rgba(255,71,87,0.15)] to-[rgba(255,107,53,0.08)] border-b border-[rgba(255,71,87,0.3)] hover:bg-[rgba(255,71,87,0.12)] w-full overflow-hidden"
    >
      <div className="font-[var(--mono)] text-[9px] font-semibold tracking-[2px] text-[var(--red)] bg-[rgba(255,71,87,0.15)] px-[6px] py-[2px] rounded-[3px] border border-[rgba(255,71,87,0.3)] whitespace-nowrap animate-[blink_1.5s_ease-in-out_infinite]">
        BREAKING
      </div>
      <div className="flex-1 text-[12px] text-[var(--text)] overflow-hidden">
        <span className="inline-block whitespace-nowrap animate-[breaking-move_20s_linear_infinite]">
          {text}
        </span>
      </div>
    </div>
  );
}
