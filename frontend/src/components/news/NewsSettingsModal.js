import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * NewsSettingsModal — Full settings popup matching the prototype.
 * 3 setting groups: Location, Feed Preferences, Display.
 * Renders as a centered 520px overlay with backdrop blur.
 */
export default function NewsSettingsModal({ isOpen, onClose, preferences, onUpdatePreferences }) {
  const [local, setLocal] = useState({});

  useEffect(() => {
    if (isOpen && preferences) {
      setLocal({
        homeLocation: preferences.homeLocation ?? '',
        radius: preferences.radius ?? 50,
        autoRefresh: preferences.autoRefresh ?? '5 min',
        defaultSort: preferences.defaultSort ?? 'Latest',
        showExcerpts: preferences.showExcerpts ?? true,
        breakingAlerts: preferences.breakingAlerts ?? true,
        tickerSpeed: preferences.tickerSpeed ?? 'Normal',
        denseMode: preferences.denseMode ?? true,
      });
    }
  }, [isOpen, preferences]);

  const set = useCallback((key, value) => {
    setLocal(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggle = useCallback((key) => {
    setLocal(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSave = useCallback(() => {
    onUpdatePreferences?.(local);
    onClose?.();
  }, [local, onUpdatePreferences, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  /* ── Shared sub-components ─────────────────────────────────────────────── */

  const GroupTitle = ({ children }) => (
    <div
      className="font-[var(--mono)] text-[9px] tracking-[2px] text-[var(--text3)] uppercase mb-[8px]"
    >
      {children}
    </div>
  );

  const SettingRow = ({ label, desc, children }) => (
    <div className="flex items-center gap-[10px] py-[8px] border-b border-[var(--border)]">
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-[var(--text)]">{label}</div>
        {desc && <div className="text-[10px] text-[var(--text3)]">{desc}</div>}
      </div>
      {children}
    </div>
  );

  const Toggle = ({ on, onClick, ariaLabel }) => (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={`relative w-[28px] h-[15px] rounded-[8px] border transition-colors duration-200 flex-shrink-0 cursor-pointer ${
        on
          ? 'bg-[var(--accent)] border-[var(--accent)]'
          : 'bg-[var(--bg4)] border-[var(--border2)]'
      }`}
    >
      <span
        className={`absolute top-[1px] w-[11px] h-[11px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-transform duration-200 ${
          on ? 'left-[15px]' : 'left-[1px]'
        }`}
      />
    </button>
  );

  const Select = ({ value, onChange, options }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[var(--bg3)] border border-[var(--border)] rounded-[5px] px-[10px] py-[5px] text-[11px] text-[var(--text)] font-[var(--mono)] outline-none cursor-pointer w-[140px] focus:border-[var(--accent)] transition-colors"
    >
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );

  const TextInput = ({ value, onChange, placeholder, type = 'text', ...rest }) => (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-[var(--bg3)] border border-[var(--border)] rounded-[5px] px-[10px] py-[5px] text-[11px] text-[var(--text)] font-[var(--mono)] outline-none w-[140px] focus:border-[var(--accent)] transition-colors"
      {...rest}
    />
  );

  /* ── Modal markup ──────────────────────────────────────────────────────── */

  const modal = (
    <div className="news-theme">
      <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-[4px]" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="News Settings"
          className="pointer-events-auto w-[520px] max-w-[calc(100vw-2rem)] max-h-[80vh] overflow-y-auto rounded-[10px] border border-[var(--border2)] bg-[var(--bg2)] shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
          style={{ animation: 'popIn 0.2s cubic-bezier(0.34,1.56,0.64,1)' }}
        >
          {/* Header */}
          <div className="flex items-center gap-[10px] px-[18px] py-[16px] border-b border-[var(--border)]">
            <div className="font-[var(--display)] text-[20px] tracking-[1px] text-[var(--text)] flex-1">
              ⚙ Settings
            </div>
            <button
              onClick={onClose}
              className="w-[26px] h-[26px] rounded-full bg-[var(--bg3)] border border-[var(--border)] flex items-center justify-center text-[12px] text-[var(--text2)] cursor-pointer hover:bg-[var(--red)] hover:border-[var(--red)] hover:text-white transition-all"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="px-[18px] py-[16px] flex flex-col gap-[14px]">

            {/* ── Group 1: Location ──────────────────────────────────── */}
            <div>
              <GroupTitle>Location</GroupTitle>
              <SettingRow label="Home Location" desc="Used for local news & weather">
                <TextInput
                  value={local.homeLocation || ''}
                  onChange={(v) => set('homeLocation', v)}
                  placeholder="City, ST ZIP"
                />
              </SettingRow>
              <SettingRow label="Radius" desc="Local news radius (miles)">
                <TextInput
                  type="number"
                  value={local.radius ?? 50}
                  onChange={(v) => set('radius', Number(v))}
                  min={5}
                  max={500}
                />
              </SettingRow>
            </div>

            {/* ── Group 2: Feed Preferences ──────────────────────────── */}
            <div>
              <GroupTitle>Feed Preferences</GroupTitle>
              <SettingRow label="Auto-Refresh" desc="Refresh feed every">
                <TextInput
                  value={local.autoRefresh || '5 min'}
                  onChange={(v) => set('autoRefresh', v)}
                />
              </SettingRow>
              <SettingRow label="Default Sort">
                <Select
                  value={local.defaultSort || 'Latest'}
                  onChange={(v) => set('defaultSort', v)}
                  options={['Latest', 'Top Stories', 'Nearby']}
                />
              </SettingRow>
              <SettingRow label="Show Excerpts">
                <Toggle
                  on={local.showExcerpts}
                  onClick={() => toggle('showExcerpts')}
                  ariaLabel="Toggle show excerpts"
                />
              </SettingRow>
              <SettingRow label="Breaking Alerts">
                <Toggle
                  on={local.breakingAlerts}
                  onClick={() => toggle('breakingAlerts')}
                  ariaLabel="Toggle breaking alerts"
                />
              </SettingRow>
            </div>

            {/* ── Group 3: Display ───────────────────────────────────── */}
            <div>
              <GroupTitle>Display</GroupTitle>
              <SettingRow label="Ticker Speed">
                <Select
                  value={local.tickerSpeed || 'Normal'}
                  onChange={(v) => set('tickerSpeed', v)}
                  options={['Slow', 'Normal', 'Fast']}
                />
              </SettingRow>
              <SettingRow label="Dense Mode" desc="More articles per screen">
                <Toggle
                  on={local.denseMode}
                  onClick={() => toggle('denseMode')}
                  ariaLabel="Toggle dense mode"
                />
              </SettingRow>
            </div>

          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-[10px] px-[18px] py-[14px] border-t border-[var(--border)] bg-[var(--bg3)] rounded-b-[10px]">
            <button
              onClick={onClose}
              className="px-[16px] py-[8px] rounded-[var(--radius)] text-[12px] text-[var(--text2)] font-medium hover:bg-[var(--bg4)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-[20px] py-[8px] rounded-[var(--radius)] bg-[var(--accent)] text-white text-[12px] font-bold tracking-[0.5px] hover:opacity-90 transition-opacity flex items-center gap-[6px] shadow-[0_4px_12px_rgba(0,212,255,0.2)]"
            >
              <span className="material-symbols-outlined text-[16px]">save</span>
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
