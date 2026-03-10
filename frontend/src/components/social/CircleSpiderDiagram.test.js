import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import CircleSpiderDiagram from './CircleSpiderDiagram';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('CircleSpiderDiagram', () => {
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

  it('renders circles and shows mutual summary plus node popup', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <CircleSpiderDiagram
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

    expect(container.textContent).toContain('Circle web');
    expect(container.textContent).toContain('2 members');
    expect(container.textContent).toContain('1 mutual');
    expect(container.textContent).toContain('@alice');

    const memberNode = container.querySelector('[data-testid="circle-web-member-2"]');
    await act(async () => {
      memberNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Two');
    expect(container.textContent).toContain('@two');
  });

  it('shows View Full Profile link when a member node is selected', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <CircleSpiderDiagram
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

    const memberNode = container.querySelector('[data-testid="circle-web-member-u1"]');
    await act(async () => {
      memberNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const profileLink = container.querySelector('a[href*="carol"]');
    expect(profileLink).toBeTruthy();
    expect(profileLink.textContent).toContain('View Full Profile');
  });
});
