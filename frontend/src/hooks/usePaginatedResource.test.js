import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import usePaginatedResource from './usePaginatedResource';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* ── Test harness: renders a component that exposes hook state via ref ── */
let hookRef;
function HookHost({ fetcher, options }) {
  const hook = usePaginatedResource(fetcher, options);
  hookRef = hook;
  return null;
}

function renderHook(fetcher, options = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<HookHost fetcher={fetcher} options={options} />); });
  return { root, container };
}

function cleanup(root, container) {
  act(() => { root.unmount(); });
  container.remove();
}

describe('usePaginatedResource', () => {
  const makeFetcher = (pages = 2) =>
    jest.fn(async (page) => ({
      data: {
        items: [{ _id: `item-${page}-1` }, { _id: `item-${page}-2` }],
        hasMore: page < pages,
      },
    }));

  it('auto-loads page 1 on mount', async () => {
    const fetcher = makeFetcher();
    const { root, container } = renderHook(fetcher);
    await act(async () => {});

    expect(fetcher).toHaveBeenCalledWith(1, 20);
    expect(hookRef.items).toHaveLength(2);
    expect(hookRef.page).toBe(1);
    expect(hookRef.hasMore).toBe(true);
    expect(hookRef.loading).toBe(false);
    expect(hookRef.error).toBeNull();
    cleanup(root, container);
  });

  it('skips auto-load when autoLoad=false', async () => {
    const fetcher = makeFetcher();
    const { root, container } = renderHook(fetcher, { autoLoad: false });
    await act(async () => {});
    expect(fetcher).not.toHaveBeenCalled();
    cleanup(root, container);
  });

  it('loads more items via loadMore', async () => {
    const fetcher = makeFetcher(3);
    const { root, container } = renderHook(fetcher);
    await act(async () => {});
    expect(hookRef.items).toHaveLength(2);

    await act(async () => { hookRef.loadMore(); });
    expect(fetcher).toHaveBeenCalledWith(2, 20);
    expect(hookRef.items).toHaveLength(4);
    expect(hookRef.page).toBe(2);
    expect(hookRef.hasMore).toBe(true);
    cleanup(root, container);
  });

  it('does not load more when hasMore is false', async () => {
    const fetcher = makeFetcher(1);
    const { root, container } = renderHook(fetcher);
    await act(async () => {});
    expect(hookRef.hasMore).toBe(false);

    await act(async () => { hookRef.loadMore(); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    cleanup(root, container);
  });

  it('refresh replaces items with fresh page 1', async () => {
    const fetcher = makeFetcher(3);
    const { root, container } = renderHook(fetcher);
    await act(async () => {});
    await act(async () => { hookRef.loadMore(); });
    expect(hookRef.items).toHaveLength(4);

    await act(async () => { hookRef.refresh(); });
    expect(hookRef.items).toHaveLength(2);
    expect(hookRef.page).toBe(1);
    cleanup(root, container);
  });

  it('sets error on fetch failure', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('Network error'));
    const { root, container } = renderHook(fetcher, { errorMessage: 'Custom error' });
    await act(async () => {});

    expect(hookRef.error).toBe('Custom error');
    expect(hookRef.items).toEqual([]);
    expect(hookRef.loading).toBe(false);
    cleanup(root, container);
  });

  it('uses custom extractItems and extractHasMore', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      data: { users: [{ id: 1 }, { id: 2 }], pagination: { hasMore: true } },
    });
    const { root, container } = renderHook(fetcher, {
      extractItems: (res) => res.data.users,
      extractHasMore: (res) => res.data.pagination.hasMore,
    });
    await act(async () => {});

    expect(hookRef.items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(hookRef.hasMore).toBe(true);
    cleanup(root, container);
  });

  it('respects custom pageSize', async () => {
    const fetcher = makeFetcher();
    const { root, container } = renderHook(fetcher, { pageSize: 50 });
    await act(async () => {});
    expect(fetcher).toHaveBeenCalledWith(1, 50);
    cleanup(root, container);
  });

  it('extracts error from API response body', async () => {
    const apiError = new Error('fail');
    apiError.response = { data: { error: 'Server validation failed' } };
    const fetcher = jest.fn().mockRejectedValue(apiError);
    const { root, container } = renderHook(fetcher);
    await act(async () => {});
    expect(hookRef.error).toBe('Server validation failed');
    cleanup(root, container);
  });
});
