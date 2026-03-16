import React from 'react';
import { getPresenceMeta } from '../utils/presence';

const PresenceIndicator = ({ presence }) => {
  const [referenceTime, setReferenceTime] = React.useState(() => Date.now());

  React.useEffect(() => {
    const intervalId = window.setInterval(() => {
      setReferenceTime(Date.now());
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  const { label, dotClassName } = getPresenceMeta(presence, referenceTime);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500" title={label}>
      <span className={`w-2.5 h-2.5 rounded-full ${dotClassName}`} />
      <span>{label}</span>
    </span>
  );
};

export default PresenceIndicator;
