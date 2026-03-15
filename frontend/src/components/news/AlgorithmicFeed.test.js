import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AlgorithmicFeed from './AlgorithmicFeed';
import { newsAPI } from '../../utils/api';

jest.mock('../../utils/api', () => ({
  newsAPI: {
    getFeed: jest.fn(),
    searchArticles: jest.fn(),
    reportImpressions: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('AlgorithmicFeed', () => {
  let container;
  let root;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    global.IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    window.sessionStorage.clear();
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
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('retries an empty initial feed when registration prefetch is pending', async () => {
    window.sessionStorage.setItem('registrationNewsPrefetchStatus', JSON.stringify({ status: 'queued', zipCode: '78666' }));

    newsAPI.getFeed
      .mockResolvedValueOnce({
        data: {
          sections: { keyword: [], local: [], state: [], national: [], trending: [] },
          feed: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          sections: { keyword: [], local: [], state: [], national: [], trending: [] },
          feed: [
            {
              _id: 'article-1',
              title: 'San Marcos update',
              description: 'Fresh article after ingest',
              category: 'general',
              publishedAt: '2026-03-14T23:30:00.000Z',
              source: 'Google News',
            },
          ],
        },
      });

    await act(async () => {
      root.render(
        <AlgorithmicFeed
          categories={[{ key: 'general', label: 'General' }]}
          activeCategory={null}
          activeRegion={null}
          activeDate="all"
          searchQuery=""
        />
      );
    });

    expect(newsAPI.getFeed).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
    });

    expect(newsAPI.getFeed).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('San Marcos update');
    expect(window.sessionStorage.getItem('registrationNewsPrefetchStatus')).toBeNull();
  });
});