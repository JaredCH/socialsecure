import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
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

  it('renders circles and shows mutual summary', async () => {
    await act(async () => {
      root.render(
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
      );
    });

    expect(container.textContent).toContain('Spider diagram');
    expect(container.textContent).toContain('2 members');
    expect(container.textContent).toContain('1 mutual');
    expect(container.textContent).toContain('@alice');
  });
});
