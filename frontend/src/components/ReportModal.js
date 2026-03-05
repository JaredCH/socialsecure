import React, { useState } from 'react';

const CATEGORIES = [
  'spam',
  'harassment',
  'hate_speech',
  'misinformation',
  'illegal_content',
  'self_harm',
  'other'
];

function ReportModal({ isOpen, targetType, targetId, targetUserId, onClose, onSubmit }) {
  const [category, setCategory] = useState('spam');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    await onSubmit({
      targetType,
      targetId,
      targetUserId,
      category,
      description: description.trim()
    });
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-white rounded-lg shadow-lg p-5 space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">Report Content</h3>
        <p className="text-sm text-gray-600">Help keep the community safe by reporting violations.</p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border rounded p-2">
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border rounded p-2"
            rows={4}
            maxLength={1000}
            placeholder="Provide context for moderators"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded border border-gray-300">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ReportModal;
