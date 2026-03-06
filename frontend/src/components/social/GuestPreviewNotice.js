import React from 'react';

const GuestPreviewNotice = ({ sectionId, isGuestPreview, onExitPreview }) => {
  if (!isGuestPreview) return null;

  return (
    <div
      id={sectionId}
      data-social-section={sectionId}
      className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
    >
      <span className="font-semibold">Guest Preview</span>
      <span className="text-amber-700">You are previewing how your profile appears to non-authenticated visitors.</span>
      <button
        type="button"
        onClick={onExitPreview}
        className="ml-auto shrink-0 rounded border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
      >
        Exit Preview
      </button>
    </div>
  );
};

export default GuestPreviewNotice;
