import React, { useState, useRef } from 'react';

export default function KeywordsPanel({ keywords, onAddKeyword, onRemoveKeyword, onRenameKeyword, newKeyword, setNewKeyword }) {
  const [editingKeyword, setEditingKeyword] = useState(null);
  const [editValue, setEditValue] = useState('');
  const escPressedRef = useRef(false);

  const startEditing = (keyword) => {
    setEditingKeyword(keyword);
    setEditValue(keyword);
    escPressedRef.current = false;
  };

  const cancelEditing = () => {
    setEditingKeyword(null);
    setEditValue('');
  };

  const handleRename = async (oldKeyword) => {
    if (escPressedRef.current) {
      cancelEditing();
      return;
    }
    if (editValue.trim() && editValue.trim().toLowerCase() !== oldKeyword.toLowerCase()) {
      if (onRenameKeyword) {
        await onRenameKeyword(oldKeyword, editValue.trim());
      }
    }
    cancelEditing();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Tracked Keywords</h3>
        <span className="text-xs text-gray-400">{keywords.length} keywords</span>
      </div>

      <form onSubmit={onAddKeyword} className="flex gap-2">
        <input
          type="text"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          placeholder="Add keyword (e.g., Bitcoin, AI, Iran…)"
          className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
        >
          Add
        </button>
      </form>

      {keywords.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {keywords.map((item) => (
            <span
              key={item.keyword}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium ring-1 ring-emerald-200/60"
            >
              {editingKeyword === item.keyword ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleRename(item.keyword); }}
                  className="inline-flex items-center gap-1"
                >
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-24 px-1 py-0.5 text-sm bg-white border border-emerald-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    autoFocus
                    onBlur={() => handleRename(item.keyword)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { escPressedRef.current = true; e.target.blur(); } }}
                  />
                </form>
              ) : (
                <>
                  <button
                    onClick={() => startEditing(item.keyword)}
                    className="hover:underline cursor-pointer bg-transparent border-none p-0 text-emerald-700 text-sm font-medium"
                    aria-label={`Edit keyword ${item.keyword}`}
                  >
                    {item.keyword}
                  </button>
                  <button
                    onClick={() => onRemoveKeyword(item.keyword)}
                    className="text-emerald-400 hover:text-red-500 transition-colors ml-1"
                    aria-label={`Remove keyword ${item.keyword}`}
                  >
                    ×
                  </button>
                </>
              )}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-4">No keywords tracked yet. Add keywords to personalize your feed.</p>
      )}
    </div>
  );
}
