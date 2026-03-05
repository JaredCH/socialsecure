import React, { useState } from 'react';

function BlockButton({ isBlocked, onBlock, onUnblock }) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      if (isBlocked) {
        await onUnblock();
      } else {
        const reason = window.prompt('Optional reason for blocking this user:', '') || '';
        await onBlock(reason);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`px-3 py-1.5 rounded border text-sm ${isBlocked ? 'border-green-600 text-green-700' : 'border-red-600 text-red-700'} disabled:opacity-60`}
    >
      {busy ? 'Saving...' : isBlocked ? 'Unblock User' : 'Block User'}
    </button>
  );
}

export default BlockButton;
