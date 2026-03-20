import React from 'react';

/**
 * ToggleSwitch
 *
 * An accessible toggle switch (role="switch").
 *
 * Props:
 *   checked   — boolean
 *   onChange  — (newValue: boolean) => void
 *   label     — accessible label text
 *   disabled  — boolean
 *   className — extra classes
 */
const ToggleSwitch = ({ checked, onChange, label, disabled = false, className = '' }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-[0.95rem] w-7 shrink-0 rounded-full border transition-colors ${
      checked
        ? 'border-blue-500 bg-blue-500'
        : 'border-gray-300 bg-gray-200'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
  >
    <span
      className={`absolute left-0.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-3.5' : 'translate-x-0'
      }`}
    />
  </button>
);

export default ToggleSwitch;
