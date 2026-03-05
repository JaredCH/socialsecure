import React from 'react';

function SecurityScore({ score = 0, breakdown = {} }) {
  const normalized = Math.max(0, Math.min(100, Number(score) || 0));

  const factors = [
    { key: 'passwordStrength', label: 'Password Strength', max: 25 },
    { key: 'has2FA', label: '2FA', max: 25 },
    { key: 'backupCurrent', label: 'Backup Current', max: 25 },
    { key: 'sessionHealth', label: 'Session Health', max: 15 },
    { key: 'deviceKeyHealth', label: 'Device Key Health', max: 10 }
  ];

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Security Score</h2>
      <div className="flex items-center gap-6 mb-4">
        <div className="relative w-24 h-24">
          <svg viewBox="0 0 36 36" className="w-24 h-24">
            <path
              className="text-gray-200"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className={normalized >= 80 ? 'text-green-600' : normalized >= 50 ? 'text-yellow-500' : 'text-red-600'}
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${normalized}, 100`}
              d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-gray-900">
            {normalized}
          </div>
        </div>
        <div>
          <p className="text-gray-700">Overall account security posture.</p>
          <p className="text-sm text-gray-500">Target: 85+ for strong security hygiene.</p>
        </div>
      </div>

      <div className="space-y-2">
        {factors.map((factor) => {
          const value = Number(breakdown?.[factor.key] || 0);
          return (
            <div key={factor.key} className="flex justify-between text-sm">
              <span className="text-gray-700">{factor.label}</span>
              <span className="font-medium text-gray-900">{value}/{factor.max}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SecurityScore;
