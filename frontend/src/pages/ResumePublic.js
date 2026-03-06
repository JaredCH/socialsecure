import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { resumeAPI } from '../utils/api';

const formatDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString();
};

const ResumePublic = () => {
  const { username = '' } = useParams();
  const normalizedUsername = useMemo(() => String(username || '').trim(), [username]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [resume, setResume] = useState(null);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await resumeAPI.getPublicResume(normalizedUsername);
        if (!active) return;
        setUser(response.data?.user || null);
        setResume(response.data?.resume || null);
        setCanManage(Boolean(response.data?.canManage));
      } catch (requestError) {
        if (!active) return;
        setError(requestError.response?.data?.error || 'Resume is unavailable.');
      } finally {
        if (active) setLoading(false);
      }
    };

    if (!normalizedUsername) {
      setLoading(false);
      setError('Resume is unavailable.');
      return undefined;
    }

    load();
    return () => {
      active = false;
    };
  }, [normalizedUsername]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">Loading resume...</div>
      </div>
    );
  }

  if (error || !resume || !user) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <h1 className="text-xl font-semibold">Resume unavailable</h1>
          <p className="mt-2 text-sm">{error || 'Resume is unavailable.'}</p>
          <Link to="/social" className="mt-4 inline-flex text-sm font-medium text-blue-700 hover:text-blue-800">
            Back to Social
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <article className="max-w-4xl mx-auto bg-white rounded-2xl shadow border border-slate-200 p-6 md:p-10 print:max-w-none print:rounded-none print:shadow-none print:border-0 print:p-0">
        <header className="border-b border-slate-200 pb-4 mb-6">
          <h1 className="text-3xl font-bold text-slate-900">{user.realName || `@${user.username}`}</h1>
          <p className="mt-1 text-slate-600">@{user.username}</p>
          {resume.basics?.headline && (
            <p className="mt-3 text-lg text-slate-800">{resume.basics.headline}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3 text-sm print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100"
            >
              Print
            </button>
            <Link
              to={`/social?user=${encodeURIComponent(user.username)}`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100"
            >
              View Profile
            </Link>
            {canManage && (
              <Link
                to="/settings"
                className="rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700"
              >
                Manage Resume
              </Link>
            )}
          </div>
        </header>

        {resume.basics?.summary && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-500">Summary</h2>
            <p className="mt-2 whitespace-pre-wrap text-slate-800 leading-relaxed">{resume.basics.summary}</p>
          </section>
        )}

        {(resume.sections || []).map((section, sectionIndex) => (
          <section key={`${section.title || 'section'}-${sectionIndex}`} className="mb-8">
            <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-500">
              {section.title || 'Section'}
            </h2>
            <div className="mt-3 space-y-4">
              {(section.items || []).map((item, itemIndex) => (
                <div key={`${item.title || 'item'}-${itemIndex}`}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-base font-semibold text-slate-900">{item.title || 'Untitled entry'}</h3>
                    {item.subtitle && <p className="text-slate-700">{item.subtitle}</p>}
                    {(item.startDate || item.endDate) && (
                      <p className="text-sm text-slate-500">
                        {item.startDate || ''}{item.startDate && item.endDate ? ' — ' : ''}{item.endDate || ''}
                      </p>
                    )}
                  </div>
                  {item.description && (
                    <p className="mt-2 whitespace-pre-wrap text-slate-700">{item.description}</p>
                  )}
                  {Array.isArray(item.bullets) && item.bullets.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
                      {item.bullets.map((bullet, bulletIndex) => (
                        <li key={`${bullet}-${bulletIndex}`}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        <footer className="border-t border-slate-200 pt-4 mt-8 text-xs text-slate-500">
          Last updated {formatDate(resume.updatedAt) || 'Unknown'}
        </footer>
      </article>
    </div>
  );
};

export default ResumePublic;
