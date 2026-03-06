import React from 'react';

const TypingIndicator = ({ users = [] }) => {
  if (!Array.isArray(users) || users.length === 0) return null;
  const labels = users.filter(Boolean).slice(0, 3);
  if (labels.length === 0) return null;

  const message = labels.length === 1
    ? `${labels[0]} is typing...`
    : `${labels.join(', ')} are typing...`;

  return (
    <div className="text-xs text-gray-500 animate-pulse">
      {message}
    </div>
  );
};

export default TypingIndicator;
