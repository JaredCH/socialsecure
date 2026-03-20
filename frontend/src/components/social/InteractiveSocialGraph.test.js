import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import InteractiveSocialGraph from './InteractiveSocialGraph';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Stub canvas context so tests run in jsdom (no real <canvas>)
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      clearRect: () => {},
      fillRect: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: (text) => ({ width: text.length * 6 }),
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      arcTo: () => {},
      fill: () => {},
      stroke: () => {},
      clip: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      drawImage: () => {},
      createLinearGradient: () => ({
        addColorStop: () => {},
      }),
      createRadialGradient: () => ({
        addColorStop: () => {},
      }),
      setLineDash: () => {},
      roundRect: () => {},
      globalAlpha: 1,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
      shadowColor: '',
      shadowBlur: 0,
    };
  };
});

describe('InteractiveSocialGraph', () => {
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
  });

  it('renders empty state when no circles provided', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <InteractiveSocialGraph circles={[]} profileLabel="alice" />
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain('No circles available yet.');
    expect(container.querySelector('[data-testid="interactive-social-graph"]')).toBeNull();
  });

  it('renders the interactive graph with mode toggle buttons', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <InteractiveSocialGraph
            profileLabel="alice"
            circles={[
              {
                name: 'Secure Crew',
                color: '#f59e0b',
                relationshipAudience: 'secure',
                members: [
                  { _id: '1', username: 'one', realName: 'One', isMutual: true },
                  { _id: '2', username: 'two', realName: 'Two', isMutual: false }
                ]
              }
            ]}
          />
        </MemoryRouter>
      );
    });

    expect(container.querySelector('[data-testid="interactive-social-graph"]')).toBeTruthy();
    expect(container.textContent).toContain('Interactive circle map');
    expect(container.textContent).toContain('2 members');
    expect(container.textContent).toContain('1 mutual');
    expect(container.textContent).toContain('@alice');

    const orbitBtn = container.querySelector('[data-testid="mode-toggle-orbit"]');
    const graphBtn = container.querySelector('[data-testid="mode-toggle-graph"]');
    expect(orbitBtn).toBeTruthy();
    expect(graphBtn).toBeTruthy();
    expect(orbitBtn.textContent).toBe('Orbit');
    expect(graphBtn.textContent).toBe('Graph');
  });

  it('renders a canvas element', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <InteractiveSocialGraph
            profileLabel="bob"
            circles={[
              {
                name: 'Friends',
                color: '#3B82F6',
                relationshipAudience: 'social',
                members: [
                  { _id: 'u1', username: 'carol', realName: 'Carol', isMutual: false }
                ]
              }
            ]}
          />
        </MemoryRouter>
      );
    });

    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(560);
  });

  it('switches mode when graph button is clicked', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <InteractiveSocialGraph
            profileLabel="dave"
            circles={[
              {
                name: 'Work',
                color: '#10B981',
                relationshipAudience: 'social',
                members: [
                  { _id: 'm1', username: 'eve', realName: 'Eve', isMutual: true }
                ]
              }
            ]}
          />
        </MemoryRouter>
      );
    });

    const graphBtn = container.querySelector('[data-testid="mode-toggle-graph"]');
    await act(async () => {
      graphBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // After clicking Graph, the graph button should have the active style class
    expect(graphBtn.className).toContain('bg-white/90');
  });

  it('renders zoom controls', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <InteractiveSocialGraph
            profileLabel="zoe"
            circles={[
              {
                name: 'Family',
                color: '#EF4444',
                relationshipAudience: 'social',
                members: []
              }
            ]}
          />
        </MemoryRouter>
      );
    });

    const zoomIn = container.querySelector('[aria-label="Zoom in"]');
    const zoomOut = container.querySelector('[aria-label="Zoom out"]');
    const resetView = container.querySelector('[aria-label="Reset view"]');
    expect(zoomIn).toBeTruthy();
    expect(zoomOut).toBeTruthy();
    expect(resetView).toBeTruthy();
  });

  it('handles multiple circles and deduplicates shared members', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <InteractiveSocialGraph
            profileLabel="multi"
            circles={[
              {
                name: 'A',
                color: '#3B82F6',
                relationshipAudience: 'social',
                members: [
                  { _id: 'shared', username: 'shared', realName: 'Shared', isMutual: true }
                ]
              },
              {
                name: 'B',
                color: '#EF4444',
                relationshipAudience: 'secure',
                members: [
                  { _id: 'shared', username: 'shared', realName: 'Shared', isMutual: true },
                  { _id: 'unique', username: 'unique', realName: 'Unique', isMutual: false }
                ]
              }
            ]}
          />
        </MemoryRouter>
      );
    });

    // 2 unique members (shared is counted once)
    expect(container.textContent).toContain('2 members');
    expect(container.textContent).toContain('1 mutual');
  });
});
