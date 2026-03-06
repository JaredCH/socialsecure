import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { resumeAPI } from '../utils/api';

const LOCAL_DRAFT_KEY = 'resumeBuilderDraft:v1';

const emptyResume = {
  basics: {
    fullName: '',
    headline: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    country: '',
    website: '',
    profileLinks: []
  },
  summary: '',
  experience: [],
  education: [],
  skills: [],
  certifications: [],
  projects: [],
  visibility: 'private'
};

const emptyExperience = {
  employer: '',
  title: '',
  location: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
  bullets: []
};

const emptyEducation = {
  institution: '',
  degree: '',
  fieldOfStudy: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
  location: '',
  bullets: []
};

const emptyCertification = {
  name: '',
  issuer: '',
  issueDate: '',
  expirationDate: '',
  credentialId: '',
  url: ''
};

const emptyProject = {
  name: '',
  description: '',
  url: '',
  highlights: []
};

const splitLines = (input) => input
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const linesToText = (lines) => Array.isArray(lines) ? lines.join('\n') : '';

const normalizeForForm = (resume) => {
  if (!resume) return emptyResume;
  return {
    basics: {
      ...emptyResume.basics,
      ...(resume.basics || {}),
      profileLinks: Array.isArray(resume.basics?.profileLinks)
        ? resume.basics.profileLinks
        : []
    },
    summary: resume.summary || '',
    experience: Array.isArray(resume.experience) ? resume.experience : [],
    education: Array.isArray(resume.education) ? resume.education : [],
    skills: Array.isArray(resume.skills) ? resume.skills : [],
    certifications: Array.isArray(resume.certifications) ? resume.certifications : [],
    projects: Array.isArray(resume.projects) ? resume.projects : [],
    visibility: resume.visibility || 'private'
  };
};

const buildPayload = (resume, skillText) => ({
  ...resume,
  basics: {
    ...resume.basics,
    profileLinks: (resume.basics.profileLinks || [])
      .map((link) => ({
        label: String(link?.label || '').trim(),
        url: String(link?.url || '').trim()
      }))
      .filter((link) => link.url)
  },
  experience: (resume.experience || []).map((entry) => ({
    ...entry,
    bullets: Array.isArray(entry.bullets) ? entry.bullets : splitLines(entry.bulletsText || '')
  })),
  education: (resume.education || []).map((entry) => ({
    ...entry,
    bullets: Array.isArray(entry.bullets) ? entry.bullets : splitLines(entry.bulletsText || '')
  })),
  certifications: (resume.certifications || []).map((entry) => ({ ...entry })),
  projects: (resume.projects || []).map((entry) => ({
    ...entry,
    highlights: Array.isArray(entry.highlights) ? entry.highlights : splitLines(entry.highlightsText || '')
  })),
  skills: splitLines(skillText).slice(0, 50)
});

function ResumeBuilder() {
  const [resume, setResume] = useState(emptyResume);
  const [skillText, setSkillText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const loadResume = async () => {
      setLoading(true);
      setErrorMessage('');

      try {
        const draftRaw = localStorage.getItem(LOCAL_DRAFT_KEY);
        const draft = draftRaw ? JSON.parse(draftRaw) : null;

        const { data } = await resumeAPI.getMyResume();
        const normalized = normalizeForForm(data?.resume);
        const initialResume = draft && !data?.resume ? normalizeForForm(draft) : normalized;
        setResume(initialResume);
        setSkillText(linesToText(initialResume.skills));
        await resumeAPI.trackEvent('resume_builder_opened', { source: data?.resume ? 'saved' : 'new' });
      } catch (error) {
        const message = error.response?.data?.error || 'Failed to load resume';
        setErrorMessage(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    };

    loadResume();
  }, []);

  useEffect(() => {
    if (loading) return;
    const draftPayload = { ...resume, skills: splitLines(skillText) };
    localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(draftPayload));
  }, [loading, resume, skillText]);

  const previewResume = useMemo(() => buildPayload(resume, skillText), [resume, skillText]);

  const updateBasics = (name, value) => {
    setResume((prev) => ({
      ...prev,
      basics: {
        ...prev.basics,
        [name]: value
      }
    }));
  };

  const updateListItem = (field, index, key, value) => {
    setResume((prev) => ({
      ...prev,
      [field]: prev[field].map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        return { ...item, [key]: value };
      })
    }));
  };

  const addListItem = (field, item) => {
    setResume((prev) => ({
      ...prev,
      [field]: [...prev[field], item]
    }));
  };

  const removeListItem = (field, index) => {
    setResume((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, itemIndex) => itemIndex !== index)
    }));
  };

  const moveListItem = (field, index, direction) => {
    setResume((prev) => {
      const items = [...prev[field]];
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= items.length) return prev;
      [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
      return { ...prev, [field]: items };
    });
  };

  const saveResume = async () => {
    if (!resume.basics.fullName.trim() || !resume.basics.headline.trim() || !resume.basics.email.trim()) {
      toast.error('Full name, headline, and email are required.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    try {
      const payload = buildPayload(resume, skillText);
      const { data } = await resumeAPI.upsertMyResume(payload);
      const nextResume = normalizeForForm(data?.resume);
      setResume(nextResume);
      setSkillText(linesToText(nextResume.skills));
      localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(nextResume));
      toast.success('Resume saved');
    } catch (error) {
      const message = error.response?.data?.errors?.[0]?.msg || error.response?.data?.error || 'Failed to save resume';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const deleteResume = async () => {
    const confirmed = window.confirm('Delete your saved resume draft?');
    if (!confirmed) return;

    setDeleting(true);
    setErrorMessage('');
    try {
      await resumeAPI.deleteMyResume();
      setResume(emptyResume);
      setSkillText('');
      localStorage.removeItem(LOCAL_DRAFT_KEY);
      toast.success('Resume deleted');
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to delete resume';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const openPrintPreview = async () => {
    try {
      await resumeAPI.trackEvent('resume_print_preview_opened', {
        experienceCount: previewResume.experience.length,
        educationCount: previewResume.education.length
      });
    } catch {
      // best effort only
    }
    window.print();
  };

  if (loading) {
    return <div className="min-h-screen grid place-items-center">Loading resume builder...</div>;
  }

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          nav, .resume-builder-controls, .resume-builder-editor, .react-hot-toast {
            display: none !important;
          }
          body, .resume-preview-print {
            background: white !important;
          }
          .resume-preview-panel {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
          }
          main.container {
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }
        }
      `}</style>

      <div className="resume-builder-controls bg-white rounded-xl shadow p-4 border border-gray-100 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold text-gray-900">Resume Builder</h2>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveResume}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Resume'}
          </button>
          <button
            type="button"
            onClick={openPrintPreview}
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
          >
            Print Preview
          </button>
          <button
            type="button"
            onClick={deleteResume}
            disabled={deleting}
            className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete Resume'}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="resume-builder-editor space-y-4">
          <section className="bg-white rounded-xl shadow p-4 border border-gray-100 space-y-3">
            <h3 className="font-medium text-gray-900">Basics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input className="border rounded px-3 py-2" placeholder="Full name *" value={resume.basics.fullName} onChange={(e) => updateBasics('fullName', e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="Headline *" value={resume.basics.headline} onChange={(e) => updateBasics('headline', e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="Email *" value={resume.basics.email} onChange={(e) => updateBasics('email', e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="Phone" value={resume.basics.phone} onChange={(e) => updateBasics('phone', e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="City" value={resume.basics.city} onChange={(e) => updateBasics('city', e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="State" value={resume.basics.state} onChange={(e) => updateBasics('state', e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="Country" value={resume.basics.country} onChange={(e) => updateBasics('country', e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="Website" value={resume.basics.website} onChange={(e) => updateBasics('website', e.target.value)} />
            </div>
            <select
              className="border rounded px-3 py-2"
              value={resume.visibility}
              onChange={(e) => setResume((prev) => ({ ...prev, visibility: e.target.value }))}
            >
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </section>

          <section className="bg-white rounded-xl shadow p-4 border border-gray-100 space-y-2">
            <h3 className="font-medium text-gray-900">Professional Summary</h3>
            <textarea
              className="w-full border rounded px-3 py-2 min-h-[120px]"
              value={resume.summary}
              onChange={(e) => setResume((prev) => ({ ...prev, summary: e.target.value }))}
              placeholder="Summarize your background and strengths"
            />
          </section>

          <section className="bg-white rounded-xl shadow p-4 border border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Work Experience</h3>
              <button type="button" className="text-sm text-blue-600" onClick={() => addListItem('experience', emptyExperience)}>Add</button>
            </div>
            {resume.experience.map((item, index) => (
              <div key={`experience-${index}`} className="border rounded p-3 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input className="border rounded px-2 py-1" placeholder="Employer" value={item.employer || ''} onChange={(e) => updateListItem('experience', index, 'employer', e.target.value)} />
                  <input className="border rounded px-2 py-1" placeholder="Title" value={item.title || ''} onChange={(e) => updateListItem('experience', index, 'title', e.target.value)} />
                  <input className="border rounded px-2 py-1" placeholder="Location" value={item.location || ''} onChange={(e) => updateListItem('experience', index, 'location', e.target.value)} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!item.isCurrent} onChange={(e) => updateListItem('experience', index, 'isCurrent', e.target.checked)} />
                    Current role
                  </label>
                  <input className="border rounded px-2 py-1" placeholder="Start date (YYYY-MM)" value={item.startDate || ''} onChange={(e) => updateListItem('experience', index, 'startDate', e.target.value)} />
                  <input className="border rounded px-2 py-1" placeholder="End date (YYYY-MM)" disabled={!!item.isCurrent} value={item.endDate || ''} onChange={(e) => updateListItem('experience', index, 'endDate', e.target.value)} />
                </div>
                <textarea
                  className="w-full border rounded px-2 py-1 min-h-[90px]"
                  placeholder="One bullet per line"
                  value={linesToText(item.bullets)}
                  onChange={(e) => updateListItem('experience', index, 'bullets', splitLines(e.target.value))}
                />
                <div className="flex gap-2">
                  <button type="button" className="text-xs text-gray-600" onClick={() => moveListItem('experience', index, -1)}>Move Up</button>
                  <button type="button" className="text-xs text-gray-600" onClick={() => moveListItem('experience', index, 1)}>Move Down</button>
                  <button type="button" className="text-xs text-red-600" onClick={() => removeListItem('experience', index)}>Remove</button>
                </div>
              </div>
            ))}
          </section>

          <section className="bg-white rounded-xl shadow p-4 border border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Education</h3>
              <button type="button" className="text-sm text-blue-600" onClick={() => addListItem('education', emptyEducation)}>Add</button>
            </div>
            {resume.education.map((item, index) => (
              <div key={`education-${index}`} className="border rounded p-3 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input className="border rounded px-2 py-1" placeholder="Institution" value={item.institution || ''} onChange={(e) => updateListItem('education', index, 'institution', e.target.value)} />
                  <input className="border rounded px-2 py-1" placeholder="Degree" value={item.degree || ''} onChange={(e) => updateListItem('education', index, 'degree', e.target.value)} />
                  <input className="border rounded px-2 py-1" placeholder="Field of study" value={item.fieldOfStudy || ''} onChange={(e) => updateListItem('education', index, 'fieldOfStudy', e.target.value)} />
                  <input className="border rounded px-2 py-1" placeholder="Location" value={item.location || ''} onChange={(e) => updateListItem('education', index, 'location', e.target.value)} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!item.isCurrent} onChange={(e) => updateListItem('education', index, 'isCurrent', e.target.checked)} />
                    Current program
                  </label>
                  <input className="border rounded px-2 py-1" placeholder="Start date (YYYY-MM)" value={item.startDate || ''} onChange={(e) => updateListItem('education', index, 'startDate', e.target.value)} />
                  <input className="border rounded px-2 py-1" placeholder="End date (YYYY-MM)" disabled={!!item.isCurrent} value={item.endDate || ''} onChange={(e) => updateListItem('education', index, 'endDate', e.target.value)} />
                </div>
                <textarea
                  className="w-full border rounded px-2 py-1 min-h-[90px]"
                  placeholder="One bullet per line"
                  value={linesToText(item.bullets)}
                  onChange={(e) => updateListItem('education', index, 'bullets', splitLines(e.target.value))}
                />
                <div className="flex gap-2">
                  <button type="button" className="text-xs text-gray-600" onClick={() => moveListItem('education', index, -1)}>Move Up</button>
                  <button type="button" className="text-xs text-gray-600" onClick={() => moveListItem('education', index, 1)}>Move Down</button>
                  <button type="button" className="text-xs text-red-600" onClick={() => removeListItem('education', index)}>Remove</button>
                </div>
              </div>
            ))}
          </section>

          <section className="bg-white rounded-xl shadow p-4 border border-gray-100 space-y-2">
            <h3 className="font-medium text-gray-900">Skills (one per line)</h3>
            <textarea
              className="w-full border rounded px-3 py-2 min-h-[100px]"
              value={skillText}
              onChange={(e) => setSkillText(e.target.value)}
            />
          </section>

          <section className="bg-white rounded-xl shadow p-4 border border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Certifications (optional)</h3>
              <button type="button" className="text-sm text-blue-600" onClick={() => addListItem('certifications', emptyCertification)}>Add</button>
            </div>
            {resume.certifications.map((item, index) => (
              <div key={`cert-${index}`} className="border rounded p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                <input className="border rounded px-2 py-1" placeholder="Name" value={item.name || ''} onChange={(e) => updateListItem('certifications', index, 'name', e.target.value)} />
                <input className="border rounded px-2 py-1" placeholder="Issuer" value={item.issuer || ''} onChange={(e) => updateListItem('certifications', index, 'issuer', e.target.value)} />
                <input className="border rounded px-2 py-1" placeholder="Issue date (YYYY-MM)" value={item.issueDate || ''} onChange={(e) => updateListItem('certifications', index, 'issueDate', e.target.value)} />
                <input className="border rounded px-2 py-1" placeholder="Expiration date (YYYY-MM)" value={item.expirationDate || ''} onChange={(e) => updateListItem('certifications', index, 'expirationDate', e.target.value)} />
                <input className="border rounded px-2 py-1" placeholder="Credential ID" value={item.credentialId || ''} onChange={(e) => updateListItem('certifications', index, 'credentialId', e.target.value)} />
                <input className="border rounded px-2 py-1" placeholder="Credential URL" value={item.url || ''} onChange={(e) => updateListItem('certifications', index, 'url', e.target.value)} />
                <button type="button" className="text-xs text-red-600 md:col-span-2 justify-self-start" onClick={() => removeListItem('certifications', index)}>Remove</button>
              </div>
            ))}
          </section>

          <section className="bg-white rounded-xl shadow p-4 border border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Projects (optional)</h3>
              <button type="button" className="text-sm text-blue-600" onClick={() => addListItem('projects', emptyProject)}>Add</button>
            </div>
            {resume.projects.map((item, index) => (
              <div key={`project-${index}`} className="border rounded p-3 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input className="border rounded px-2 py-1" placeholder="Project name" value={item.name || ''} onChange={(e) => updateListItem('projects', index, 'name', e.target.value)} />
                  <input className="border rounded px-2 py-1" placeholder="Project URL" value={item.url || ''} onChange={(e) => updateListItem('projects', index, 'url', e.target.value)} />
                </div>
                <textarea className="w-full border rounded px-2 py-1" placeholder="Description" value={item.description || ''} onChange={(e) => updateListItem('projects', index, 'description', e.target.value)} />
                <textarea className="w-full border rounded px-2 py-1 min-h-[90px]" placeholder="Highlights (one per line)" value={linesToText(item.highlights)} onChange={(e) => updateListItem('projects', index, 'highlights', splitLines(e.target.value))} />
                <button type="button" className="text-xs text-red-600" onClick={() => removeListItem('projects', index)}>Remove</button>
              </div>
            ))}
          </section>
        </div>

        <aside className="resume-preview-print">
          <div className="resume-preview-panel bg-white rounded-xl shadow p-6 border border-gray-100 space-y-5">
            <header className="border-b pb-3">
              <h1 className="text-2xl font-bold text-gray-900">{previewResume.basics.fullName || 'Your Name'}</h1>
              <p className="text-gray-700 mt-1">{previewResume.basics.headline || 'Professional Headline'}</p>
              <p className="text-sm text-gray-600 mt-2">
                {[previewResume.basics.email, previewResume.basics.phone, previewResume.basics.city, previewResume.basics.state, previewResume.basics.country]
                  .filter(Boolean)
                  .join(' • ')}
              </p>
              {previewResume.basics.website ? (
                <p className="text-sm text-blue-700 mt-1">{previewResume.basics.website}</p>
              ) : null}
            </header>

            {previewResume.summary ? (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Summary</h2>
                <p className="text-sm text-gray-800 whitespace-pre-wrap mt-1">{previewResume.summary}</p>
              </section>
            ) : null}

            {previewResume.experience.length ? (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Experience</h2>
                <div className="mt-2 space-y-3">
                  {previewResume.experience.map((item, index) => (
                    <article key={`preview-exp-${index}`}>
                      <div className="flex justify-between gap-2">
                        <h3 className="font-medium text-gray-900">{item.title} · {item.employer}</h3>
                        <span className="text-xs text-gray-600">{item.startDate} - {item.isCurrent ? 'Present' : item.endDate}</span>
                      </div>
                      {item.location ? <p className="text-xs text-gray-600">{item.location}</p> : null}
                      {item.bullets?.length ? (
                        <ul className="list-disc list-inside text-sm text-gray-800 mt-1 space-y-1">
                          {item.bullets.map((bullet, bulletIndex) => (
                            <li key={`exp-bullet-${index}-${bulletIndex}`}>{bullet}</li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {previewResume.education.length ? (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Education</h2>
                <div className="mt-2 space-y-3">
                  {previewResume.education.map((item, index) => (
                    <article key={`preview-ed-${index}`}>
                      <div className="flex justify-between gap-2">
                        <h3 className="font-medium text-gray-900">{item.degree} · {item.institution}</h3>
                        <span className="text-xs text-gray-600">{item.startDate} - {item.isCurrent ? 'Present' : item.endDate}</span>
                      </div>
                      {item.fieldOfStudy ? <p className="text-xs text-gray-600">{item.fieldOfStudy}</p> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {previewResume.skills.length ? (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Skills</h2>
                <p className="text-sm text-gray-800 mt-1">{previewResume.skills.join(' • ')}</p>
              </section>
            ) : null}

            {previewResume.certifications.length ? (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Certifications</h2>
                <ul className="text-sm text-gray-800 mt-1 space-y-1">
                  {previewResume.certifications.map((item, index) => (
                    <li key={`preview-cert-${index}`}>{item.name}{item.issuer ? ` — ${item.issuer}` : ''}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {previewResume.projects.length ? (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Projects</h2>
                <div className="mt-2 space-y-2">
                  {previewResume.projects.map((item, index) => (
                    <article key={`preview-project-${index}`}>
                      <h3 className="font-medium text-gray-900">{item.name}</h3>
                      {item.description ? <p className="text-sm text-gray-800">{item.description}</p> : null}
                      {item.url ? <p className="text-xs text-blue-700">{item.url}</p> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default ResumeBuilder;
