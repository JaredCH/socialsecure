import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import ArticleDrawer from './ArticleDrawer';

describe('ArticleDrawer', () => {
  let container;
  let root;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

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

  it('renders the selected article metadata and opens the original link in a new tab', async () => {
    await act(async () => {
      root.render(
        <ArticleDrawer
          article={{
            _id: 'article-1',
            title: 'San Marcos update',
            description: 'Only RSS metadata is available here.',
            source: 'Google News',
            publishedAt: '2026-03-14T22:14:46.000Z',
            url: 'https://example.com/article-1',
            category: 'general',
            locationTags: {
              cities: ['San Marcos'],
              states: ['Texas'],
            },
            topics: ['local', 'campus'],
          }}
          onClose={() => {}}
        />
      );
    });

    expect(document.body.textContent).toContain('San Marcos update');
    expect(document.body.textContent).toContain('Only RSS metadata is available here.');
    expect(document.body.textContent).toContain('San Marcos, Texas');

    const link = document.body.querySelector('a[href="https://example.com/article-1"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.textContent).toContain('Open Original Article');
  });

  it('calls onClose from the close button and falls back when the image fails', async () => {
    const onClose = jest.fn();

    await act(async () => {
      root.render(
        <ArticleDrawer
          article={{
            _id: 'article-2',
            title: 'Image-backed article',
            description: 'RSS image should not block close controls.',
            source: 'Local RSS',
            imageUrl: 'https://example.com/article-image.jpg',
            publishedAt: '2026-03-14T22:14:46.000Z'
          }}
          onClose={onClose}
        />
      );
    });

    const image = document.body.querySelector('img[src="https://example.com/article-image.jpg"]');
    expect(image).not.toBeNull();

    await act(async () => {
      image.dispatchEvent(new Event('error'));
    });

    expect(document.body.querySelector('img[src="https://example.com/article-image.jpg"]')).toBeNull();
    expect(document.body.textContent).toContain('Image-backed article');

    const closeButton = document.body.querySelector('button[aria-label="Close article drawer"]');
    expect(closeButton).not.toBeNull();
    expect(closeButton.textContent).toContain('Close preview');

    await act(async () => {
      closeButton.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
