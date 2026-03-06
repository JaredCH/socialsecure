import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ResumeBuilder from './ResumeBuilder';
import { resumeAPI } from '../utils/api';

jest.mock('../utils/api', () => ({
  resumeAPI: {
    getMyResume: jest.fn(),
    upsertMyResume: jest.fn(),
    deleteMyResume: jest.fn(),
    trackEvent: jest.fn(),
  },
}));

jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ResumeBuilder UX improvements', () => {
  let container;
  let root;

  const renderPage = async () => {
    await act(async () => {
      root.render(<ResumeBuilder />);
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    resumeAPI.getMyResume.mockResolvedValue({ data: { resume: null } });
    resumeAPI.upsertMyResume.mockResolvedValue({
      data: {
        resume: {
          basics: {
            fullName: 'Jane Smith',
            headline: 'Senior Engineer',
            email: 'jane@example.com',
            phone: '',
            city: '',
            state: '',
            country: '',
            website: '',
            profileLinks: [],
          },
          summary: '',
          experience: [],
          education: [],
          skills: [],
          certifications: [],
          projects: [],
          visibility: 'private',
        },
      },
    });
    resumeAPI.deleteMyResume.mockResolvedValue({ data: { success: true } });
    resumeAPI.trackEvent.mockResolvedValue({ data: { success: true } });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('shows helper copy and inline required-field messages in Basics', async () => {
    await renderPage();

    expect(container.textContent).toContain('Required fields are marked with *');
    expect(container.textContent).toContain('Completion progress');
    expect(container.textContent).toContain('Full name is required.');
    expect(container.textContent).toContain('Headline is required.');
    expect(container.textContent).toContain('Email is required.');
  });

  it('shows section helper text that reduces entry friction', async () => {
    await renderPage();

    expect(container.textContent).toContain('Add your most recent role first');
    expect(container.textContent).toContain('Prioritize role-relevant skills first');
    expect(container.textContent).toContain('Private keeps your resume hidden');
  });
});
