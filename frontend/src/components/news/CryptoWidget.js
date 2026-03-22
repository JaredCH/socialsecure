import React from 'react';
import { Widget } from './RightSidebar';

const MOCK_CRYPTO = [
  { id: 'btc', sym: 'BTC', name: 'Bitcoin', price: '$51,432.10', change: '+1.2%', up: true },
  { id: 'eth', sym: 'ETH', name: 'Ethereum', price: '$2,981.45', change: '+2.4%', up: true },
  { id: 'sol', sym: 'SOL', name: 'Solana', price: '$102.30', change: '-0.8%', up: false }
];

export default function CryptoWidget() {
  const isUp = MOCK_CRYPTO[0].up; // usually BTC dictates status

  return (
    <Widget 
      id="crypto-widget" 
      icon="₿" 
      title="Crypto" 
      statusText={`${isUp ? '▲' : '▼'} Active`}
      statusColor={isUp ? 'var(--green)' : 'var(--red)'}
    >
      <div className="flex flex-col">
        {MOCK_CRYPTO.map((c) => (
          <div key={c.id} className="flex items-center justify-between p-[8px_14px] border-b border-[var(--border)] last:border-b-0 hover:bg-[rgba(255,255,255,0.02)]">
            <div className="flex items-center gap-[8px]">
              <span className="font-[var(--display)] text-[18px] text-[var(--text)] w-[40px] leading-none shrink-0">{c.sym}</span>
              <span className="font-[var(--sans)] text-[9px] text-[var(--text3)]">{c.name}</span>
            </div>
            <div className="flex items-center">
              <span className="font-[var(--mono)] text-[11px] mr-[12px] text-[var(--text)]">{c.price}</span>
              <span 
                className={`font-[var(--mono)] text-[10px] p-[2px_6px] rounded-[4px] font-semibold w-[45px] text-right ${
                  c.up ? 'bg-[rgba(0,196,122,0.1)] text-[var(--green)]' : 'bg-[rgba(255,71,87,0.1)] text-[var(--red)]'
                }`}
              >
                {c.change}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Widget>
  );
}
