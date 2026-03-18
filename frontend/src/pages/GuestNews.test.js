import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import GuestNews from './GuestNews';
import News from './News';

jest.mock('./News', () => jest.fn(() => <div data-testid="news-page">News Page</div>));

describe('GuestNews', () => {
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
    jest.clearAllMocks();
  });

  it('renders the full News page layout in guest mode', () => {
    act(() => {
      root.render(<GuestNews />);
    });

    expect(News).toHaveBeenCalled();
    expect(News.mock.calls[0][0]).toEqual(expect.objectContaining({ isGuestMode: true }));
  });
});
