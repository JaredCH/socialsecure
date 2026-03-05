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
    <div className="min-h-[70vh] p-4 sm:p-6">
      <OnboardingWizard
        user={user}
        onboarding={onboarding}
        onProgressSaved={refreshOnboardingStatus}
        onCompleted={onCompleted}
        refreshEncryptionPasswordStatus={refreshEncryptionPasswordStatus}
      />
    </div>
  );
}

export default OnboardingPage;
