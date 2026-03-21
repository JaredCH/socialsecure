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

  it('renders without crashing with 5 circles of 10 members each', async () => {
    const makeMember = (circleIdx, memberIdx) => ({
      _id: `c${circleIdx}-m${memberIdx}`,
      username: `user_c${circleIdx}_m${memberIdx}`,
      realName: `User ${circleIdx}-${memberIdx}`,
      avatarUrl: '',
      isMutual: memberIdx % 3 === 0,
    });

    const fiveCircles = Array.from({ length: 5 }, (_, ci) => ({
      name: `Circle ${ci + 1}`,
      color: ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'][ci],
      relationshipAudience: ci % 2 === 0 ? 'social' : 'secure',
      members: Array.from({ length: 10 }, (_, mi) => makeMember(ci, mi)),
    }));

    await act(async () => {
      root.render(
        <MemoryRouter>
          <InteractiveSocialGraph
            profileLabel="power_user"
            circles={fiveCircles}
            accentColor="#3B82F6"
          />
        </MemoryRouter>
      );
    });

    // Should render the graph without crashing
    expect(container.querySelector('[data-testid="interactive-social-graph"]')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeTruthy();
    // 50 unique members across 5 circles
    expect(container.textContent).toContain('50 members');
    // Mode toggle buttons should be present
    expect(container.querySelector('[data-testid="mode-toggle-orbit"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="mode-toggle-graph"]')).toBeTruthy();
    // Zoom controls should be present
    expect(container.querySelector('[aria-label="Zoom in"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Zoom out"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Reset view"]')).toBeTruthy();
  });

  it('renders without crashing with 3 circles containing shared members', async () => {
    const circles = [
      {
        name: 'Work',
        color: '#3B82F6',
        relationshipAudience: 'social',
        members: [
          { _id: 's1', username: 'alice', realName: 'Alice', isMutual: true },
          { _id: 's2', username: 'bob', realName: 'Bob', isMutual: false },
          { _id: 's3', username: 'carol', realName: 'Carol', isMutual: true },
        ]
      },
      {
        name: 'Family',
        color: '#EF4444',
        relationshipAudience: 'secure',
        members: [
          { _id: 's1', username: 'alice', realName: 'Alice', isMutual: true },
          { _id: 's4', username: 'dave', realName: 'Dave', isMutual: false },
        ]
      },
      {
        name: 'Gym',
        color: '#10B981',
        relationshipAudience: 'social',
        members: [
          { _id: 's2', username: 'bob', realName: 'Bob', isMutual: false },
          { _id: 's3', username: 'carol', realName: 'Carol', isMutual: true },
          { _id: 's5', username: 'eve', realName: 'Eve', isMutual: false },
        ]
      }
    ];

    await act(async () => {
      root.render(
        <MemoryRouter>
          <InteractiveSocialGraph
            profileLabel="multi_shared"
            circles={circles}
            accentColor="#3B82F6"
          />
        </MemoryRouter>
      );
    });

    expect(container.querySelector('[data-testid="interactive-social-graph"]')).toBeTruthy();
    // 5 unique members (s1-s5), deduplication should work
    expect(container.textContent).toContain('5 members');
    // alice and carol are mutual
    expect(container.textContent).toContain('2 mutual');
  });
});
