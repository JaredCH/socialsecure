import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useMutationAction from './useMutationAction';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let hookRef;
function HookHost({ mutationFn, options }) {
  const hook = useMutationAction(mutationFn, options);
  hookRef = hook;
  return null;
}

function mount(mutationFn, options = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<HookHost mutationFn={mutationFn} options={options} />); });
  return { root, container };
}

function cleanup(root, container) {
  act(() => { root.unmount(); });
  container.remove();
}

describe('useMutationAction', () => {
  it('executes a mutation successfully', async () => {
    const mutationFn = jest.fn().mockResolvedValue({ data: { id: 1 } });
    const { root, container } = mount(mutationFn);

    let returnVal;
    await act(async () => { returnVal = await hookRef.execute('arg1', 'arg2'); });

    expect(mutationFn).toHaveBeenCalledWith('arg1', 'arg2');
    expect(returnVal).toEqual({ data: { id: 1 } });
    expect(hookRef.loading).toBe(false);
    expect(hookRef.error).toBeNull();
    cleanup(root, container);
  });

  it('sets error on failure', async () => {
    const mutationFn = jest.fn().mockRejectedValue(new Error('fail'));
    const { root, container } = mount(mutationFn, { errorMessage: 'Custom error' });

    await act(async () => { await hookRef.execute(); });

    expect(hookRef.error).toBe('Custom error');
    expect(hookRef.loading).toBe(false);
    cleanup(root, container);
  });

  it('extracts error from API response', async () => {
    const apiError = new Error('fail');
    apiError.response = { data: { error: 'Validation failed' } };
    const mutationFn = jest.fn().mockRejectedValue(apiError);
    const { root, container } = mount(mutationFn);

    await act(async () => { await hookRef.execute(); });
    expect(hookRef.error).toBe('Validation failed');
    cleanup(root, container);
  });

  it('calls onSuccess callback', async () => {
    const onSuccess = jest.fn();
    const mutationFn = jest.fn().mockResolvedValue({ id: 1 });
    const { root, container } = mount(mutationFn, { onSuccess });

    await act(async () => { await hookRef.execute('a', 'b'); });
    expect(onSuccess).toHaveBeenCalledWith({ id: 1 }, 'a', 'b');
    cleanup(root, container);
  });

  it('calls onError callback', async () => {
    const onError = jest.fn();
    const error = new Error('fail');
    const mutationFn = jest.fn().mockRejectedValue(error);
    const { root, container } = mount(mutationFn, { onError });

    await act(async () => { await hookRef.execute('x'); });
    expect(onError).toHaveBeenCalledWith(error, 'x');
    cleanup(root, container);
  });

  it('reset clears error', async () => {
    const mutationFn = jest.fn().mockRejectedValue(new Error('fail'));
    const { root, container } = mount(mutationFn);

    await act(async () => { await hookRef.execute(); });
    expect(hookRef.error).toBeTruthy();

    act(() => { hookRef.reset(); });
    expect(hookRef.error).toBeNull();
    cleanup(root, container);
  });

  it('returns undefined on failure', async () => {
    const mutationFn = jest.fn().mockRejectedValue(new Error('fail'));
    const { root, container } = mount(mutationFn);

    let returnVal;
    await act(async () => { returnVal = await hookRef.execute(); });
    expect(returnVal).toBeUndefined();
    cleanup(root, container);
  });
});
