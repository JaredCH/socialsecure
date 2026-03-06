import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Calendar from './Calendar';

jest.mock('../utils/api', () => ({
  authAPI: {
    getProfile: jest.fn(),
  },
  calendarAPI: {
    getMyCalendar: jest.fn(),
    getMyEvents: jest.fn(),
    getUserCalendar: jest.fn(),
    getUserCalendarEvents: jest.fn(),
    updateMyCalendarSettings: jest.fn(),
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    deleteEvent: jest.fn(),
  },
}));

jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Calendar layout sizing', () => {
  let container;
  let root;

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
    localStorage.clear();
  });

  it('uses full-height shell classes to avoid page-level overflow', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Calendar />
        </MemoryRouter>
      );
    });

    const shell = container.querySelector('[data-testid="calendar-page-shell"]');
    const grid = container.querySelector('[data-testid="calendar-page-grid"]');
    const mainPanel = container.querySelector('[data-testid="calendar-main-panel"]');
    const monthGrid = container.querySelector('[data-testid="calendar-month-grid"]');

    expect(shell).not.toBeNull();
    expect(shell.className).toContain('h-full');
    expect(shell.className).toContain('min-h-0');

    expect(grid).not.toBeNull();
    expect(grid.className).toContain('flex-1');
    expect(grid.className).toContain('min-h-0');

    expect(mainPanel).not.toBeNull();
    expect(mainPanel.className).toContain('overflow-hidden');

    expect(monthGrid).not.toBeNull();
    expect(monthGrid.className).toContain('flex-1');
    expect(monthGrid.className).toContain('min-h-0');
  });
});
