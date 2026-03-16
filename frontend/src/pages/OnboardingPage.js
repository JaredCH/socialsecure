import React from 'react';
import OnboardingWizard from '../components/OnboardingWizard';

function OnboardingPage({
  user,
  onboarding,
  refreshOnboardingStatus,
  onCompleted,
  refreshEncryptionPasswordStatus
}) {
  return (
    <div className="min-h-[70vh] bg-gradient-to-b from-slate-50 via-blue-50/50 to-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <OnboardingWizard
          user={user}
          onboarding={onboarding}
          onProgressSaved={refreshOnboardingStatus}
          onCompleted={onCompleted}
          refreshEncryptionPasswordStatus={refreshEncryptionPasswordStatus}
        />
      </div>
    </div>
  );
}

export default OnboardingPage;
