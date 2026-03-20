import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import usePreferencesResource from './usePreferencesResource';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let hookRef;
function HookHost({ fetchFn, saveFn, options }) {
  const hook = usePreferencesResource(fetchFn, saveFn, options);
  hookRef = hook;
  return null;
}

function mount(fetchFn, saveFn, options = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<HookHost fetchFn={fetchFn} saveFn={saveFn} options={options} />); });
  return { root, container };
}

function cleanup(root, container) {
  act(() => { root.unmount(); });
  container.remove();
}

describe('usePreferencesResource', () => {
  const makeFetchFn = (data = { theme: 'dark' }) =>
    jest.fn().mockResolvedValue({ data });

  const makeSaveFn = (data = { theme: 'light' }) =>
    jest.fn().mockResolvedValue({ data });

  it('auto-loads on mount', async () => {
    const fetchFn = makeFetchFn({ theme: 'dark' });
    const saveFn = makeSaveFn();
    const { root, container } = mount(fetchFn, saveFn);
    await act(async () => {});

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(hookRef.data).toEqual({ theme: 'dark' });
    expect(hookRef.loading).toBe(false);
    expect(hookRef.error).toBeNull();
    cleanup(root, container);
  });

  it('skips auto-load when autoLoad=false', async () => {
    const fetchFn = makeFetchFn();
    const saveFn = makeSaveFn();
    const { root, container } = mount(fetchFn, saveFn, { autoLoad: false });
    await act(async () => {});
    expect(fetchFn).not.toHaveBeenCalled();
    cleanup(root, container);
  });

  it('saves data and updates state', async () => {
    const fetchFn = makeFetchFn({ theme: 'dark' });
    const saveFn = makeSaveFn({ theme: 'light' });
    const { root, container } = mount(fetchFn, saveFn);
    await act(async () => {});

    let ok;
    await act(async () => { ok = await hookRef.save({ theme: 'light' }); });

    expect(ok).toBe(true);
    expect(saveFn).toHaveBeenCalledWith({ theme: 'light' });
    expect(hookRef.data).toEqual({ theme: 'light' });
    expect(hookRef.saving).toBe(false);
    expect(hookRef.error).toBeNull();
    cleanup(root, container);
  });

  it('sets error on load failure', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('fail'));
    const saveFn = makeSaveFn();
    const { root, container } = mount(fetchFn, saveFn, { loadError: 'Load failed' });
    await act(async () => {});

    expect(hookRef.error).toBe('Load failed');
    expect(hookRef.data).toBeNull();
    cleanup(root, container);
  });

  it('sets error on save failure', async () => {
    const fetchFn = makeFetchFn();
    const saveFn = jest.fn().mockRejectedValue(new Error('fail'));
    const { root, container } = mount(fetchFn, saveFn, { saveError: 'Save failed' });
    await act(async () => {});

    let ok;
    await act(async () => { ok = await hookRef.save({ theme: 'light' }); });

    expect(ok).toBe(false);
    expect(hookRef.error).toBe('Save failed');
    cleanup(root, container);
  });

  it('refresh reloads data', async () => {
    let callCount = 0;
    const fetchFn = jest.fn(async () => {
      callCount++;
      return { data: { version: callCount } };
    });
    const saveFn = makeSaveFn();
    const { root, container } = mount(fetchFn, saveFn);
    await act(async () => {});
    expect(hookRef.data).toEqual({ version: 1 });

    await act(async () => { hookRef.refresh(); });
    expect(hookRef.data).toEqual({ version: 2 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    cleanup(root, container);
  });

  it('uses custom extractData and extractSaved', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      data: { success: true, preferences: { lang: 'en' } },
    });
    const saveFn = jest.fn().mockResolvedValue({
      data: { success: true, preferences: { lang: 'fr' } },
    });
    const { root, container } = mount(fetchFn, saveFn, {
      extractData: (res) => res.data.preferences,
      extractSaved: (res) => res.data.preferences,
    });
    await act(async () => {});
    expect(hookRef.data).toEqual({ lang: 'en' });

    await act(async () => { await hookRef.save({ lang: 'fr' }); });
    expect(hookRef.data).toEqual({ lang: 'fr' });
    cleanup(root, container);
  });

  it('extracts error from API response body', async () => {
    const apiError = new Error('fail');
    apiError.response = { data: { error: 'Permission denied' } };
    const fetchFn = jest.fn().mockRejectedValue(apiError);
    const saveFn = makeSaveFn();
    const { root, container } = mount(fetchFn, saveFn);
    await act(async () => {});
    expect(hookRef.error).toBe('Permission denied');
    cleanup(root, container);
  });
});
