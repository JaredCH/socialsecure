import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MobileProfile from './MobileProfile';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('MobileProfile', () => {
  let container;
  let root;

  const renderPage = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <MobileProfile
            user={{
              username: 'avery',
              realName: 'Avery Stone',
              city: 'Portland',
              state: 'OR'
            }}
          />
        </MemoryRouter>
      );
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
  });

  it('renders the feed by default and switches to directory and section views', async () => {
    await renderPage();

    expect(container.querySelector('[data-testid="mobile-profile-feed-view"]')).not.toBeNull();

    const directoryToggle = container.querySelector('button[aria-label="Open profile directory"]');
    expect(directoryToggle).not.toBeNull();

    await act(async () => {
      directoryToggle.click();
    });

    const directoryMenu = container.querySelector('[data-testid="mobile-profile-directory-menu"]');
    expect(directoryMenu).not.toBeNull();

    const resumeButton = Array.from(directoryMenu.querySelectorAll('button')).find((button) => button.textContent.includes('Resume'));
    expect(resumeButton).toBeTruthy();

    await act(async () => {
      resumeButton.click();
    });

    expect(container.querySelector('[data-testid="mobile-profile-resume-view"]')).not.toBeNull();

    const calendarButton = Array.from(container.querySelectorAll('.mobile-profile-section-button')).find((button) => button.textContent.includes('Calendar'));
    expect(calendarButton).toBeTruthy();

    await act(async () => {
      calendarButton.click();
    });

    expect(container.querySelector('[data-testid="mobile-profile-calendar-view"]')).not.toBeNull();

    const weekTab = Array.from(container.querySelectorAll('button[role="tab"]')).find((button) => button.textContent === 'week');
    expect(weekTab).toBeTruthy();

    await act(async () => {
      weekTab.click();
    });

    expect(container.querySelector('[data-testid="mobile-profile-calendar-week"]')).not.toBeNull();
  });

  it('starts with the sections bar expanded and allows collapsing it', async () => {
    await renderPage();

    const collapseButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Collapse');
    expect(collapseButton).toBeTruthy();
    expect(container.querySelector('[data-testid="mobile-profile-sections-grid"]')).not.toBeNull();

    await act(async () => {
      collapseButton.click();
    });

    expect(container.querySelector('[data-testid="mobile-profile-sections-grid"]')).toBeNull();
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Expand')).toBe(true);
  });
});