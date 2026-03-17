import React, { useEffect, useState } from 'react';
import { newsAPI } from '../utils/api';

const GuestNews = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await newsAPI.getFeed({ page: 1, limit: 20 });
        if (cancelled) return;
        setArticles(Array.isArray(data?.feed) ? data.feed : []);
      } catch {
        if (cancelled) return;
        setError('Unable to load guest news right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <p className="font-semibold">Guest mode: read-only news feed</p>
        <p className="mt-1 text-sm">Register to follow keywords, manage sources, and personalize your feed.</p>
      </div>
      {loading ? <p className="text-sm text-slate-500">Loading news…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!loading && !error && articles.length === 0 ? (
        <p className="text-sm text-slate-500">No public news available right now.</p>
      ) : null}
      <div className="space-y-3">
        {articles.map((article, index) => (
          <article key={String(article._id || article.url || article.link || index)} className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">{article.title || 'Untitled'}</h2>
            {article.summary ? <p className="mt-2 text-sm text-slate-600">{article.summary}</p> : null}
            {(article.url || article.link) ? (
              <a
                className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline"
                href={article.url || article.link}
                target="_blank"
                rel="noreferrer"
              >
                Read article
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
};

export default GuestNews;
