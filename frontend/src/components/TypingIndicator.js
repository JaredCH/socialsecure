import React from 'react';

const TypingIndicator = ({ labels = [], emptyMessage = '' }) => {
  const uniqueLabels = [...new Set((Array.isArray(labels) ? labels : []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (uniqueLabels.length === 0) {
    return emptyMessage ? <p className="text-xs text-gray-400">{emptyMessage}</p> : null;
  }

  const message = uniqueLabels.length === 1
    ? `${uniqueLabels[0]} is typing…`
    : `${uniqueLabels.slice(0, 2).join(', ')}${uniqueLabels.length > 2 ? ` +${uniqueLabels.length - 2} more` : ''} are typing…`;

  return (
    <div className="inline-flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1">
      <span className="inline-flex gap-1" aria-hidden="true">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.2s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.1s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" />
      </span>
      <span>{message}</span>
    </div>
  );
};

export default TypingIndicator;
