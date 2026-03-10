import React from 'react';

const KeywordHitsCard = ({ keywords = [], articles = [], onKeywordClick }) => {
  if (keywords.length === 0) return null;

  // Count how many articles mention each keyword in title or description
  const keywordCounts = keywords.map((kw) => {
    const term = kw.keyword.toLowerCase();
    const count = articles.filter((a) => {
      const text = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
      return text.includes(term);
    }).length;
    return { keyword: kw.keyword, count };
  });

  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/70 p-5">
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3"># Keyword Hits</h2>
      <div className="space-y-1.5">
        {keywordCounts.map((item) => (
          <button
            key={item.keyword}
            onClick={() => onKeywordClick?.(item.keyword)}
            className="flex items-center justify-between w-full px-2 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors text-xs"
          >
            <span className="text-gray-700 font-medium">{item.keyword}</span>
            <span className="text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full min-w-[24px] text-center">
              {item.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default KeywordHitsCard;
