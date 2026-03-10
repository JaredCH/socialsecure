import React, { useState, useEffect, useCallback } from 'react';
import { newsAPI } from '../../utils/api';

const formatRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
};

const ArticleDrawer = ({ articleId, onClose }) => {
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchArticle = useCallback(async () => {
    if (!articleId) return;
    try {
      setLoading(true);
      const res = await newsAPI.getArticle(articleId);
      setArticle(res.data.article);
    } catch (err) {
      console.error('Error loading article:', err);
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  if (!articleId) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Article Detail</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close article drawer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-200 rounded w-4/5" />
              <div className="h-4 bg-gray-100 rounded w-full" />
              <div className="h-4 bg-gray-100 rounded w-3/5" />
              <div className="h-40 bg-gray-100 rounded" />
            </div>
          ) : article ? (
            <div>
              {article.imageUrl && (
                <img
                  src={article.imageUrl}
                  alt=""
                  className="w-full h-48 object-cover rounded-xl mb-4"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}

              <h2 className="text-xl font-bold text-gray-900 leading-snug mb-3">{article.title}</h2>

              {/* Metadata */}
              <div className="flex items-center flex-wrap gap-2 text-xs text-gray-500 mb-4">
                <span className="font-semibold text-gray-700">{article.source}</span>
                <span className="text-gray-300">·</span>
                <span>{formatRelativeTime(article.publishedAt)}</span>
                {article.category && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="px-2 py-0.5 bg-gray-100 rounded-md text-gray-500">{article.category}</span>
                  </>
                )}
                {article.localityLevel && article.localityLevel !== 'global' && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-indigo-500 font-medium">{article.localityLevel}</span>
                  </>
                )}
              </div>

              {/* Description / Summary */}
              {article.description && (
                <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed mb-4">
                  <p>{article.description}</p>
                </div>
              )}

              {/* Tags */}
              {article.keywords && article.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {article.keywords.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]">{tag}</span>
                  ))}
                </div>
              )}

              {/* Open full article */}
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Read Full Article
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Article not found.</p>
          )}
        </div>
      </div>
    </>
  );
};

export default ArticleDrawer;
