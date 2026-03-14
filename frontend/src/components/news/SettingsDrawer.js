import React, { useEffect } from 'react';
import NewsControlPanel from './control/NewsControlPanel';

/**
 * SettingsDrawer — wraps NewsControlPanel in a slide-in drawer.
 *
 * On desktop: slides in from the right.
 * On mobile: slides up from the bottom.
 *
 * Accepts all NewsControlPanel props plus:
 *   isOpen   {bool}
 *   onClose  {Function}
 *   scopes   {Array}
 */
export default function SettingsDrawer({ isOpen, onClose, ...panelProps }) {
  // Trap scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="News Settings"
        className={`
          fixed z-50 bg-white shadow-2xl flex flex-col
          transition-transform duration-300 ease-in-out
          bottom-0 left-0 right-0 max-h-[92vh] rounded-t-2xl
          lg:top-0 lg:right-0 lg:left-auto lg:bottom-0 lg:w-[640px] lg:max-h-full lg:rounded-none lg:rounded-l-2xl
          ${isOpen
            ? 'translate-y-0 lg:translate-x-0 lg:translate-y-0'
            : 'translate-y-full lg:translate-x-full lg:translate-y-0'
          }
        `}
      >
        {/* NewsControlPanel manages its own header + tabs + close */}
        <NewsControlPanel
          {...panelProps}
          onClose={onClose}
        />
      </div>
    </>
  );
}
