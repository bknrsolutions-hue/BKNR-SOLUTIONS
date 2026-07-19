import { describe, expect, it, vi } from 'vitest';

import { installActionFeedback } from './actionFeedback';


describe('installActionFeedback', () => {
  it('emits a success event for successful mutation responses', async () => {
    const nativeFetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'Saved synthetic row.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    window.fetch = nativeFetch;
    const listener = vi.fn();
    window.addEventListener('bknr:api-feedback', listener);
    const cleanup = installActionFeedback(window, window);

    await window.fetch('/processing/gate_entry/goods', { method: 'POST' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({
      type: 'success',
      message: 'Saved synthetic row.',
    });
    cleanup();
  });

  it('announces expired sessions on 401 responses', async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    const listener = vi.fn();
    window.addEventListener('bknr:session-expired', listener);
    const cleanup = installActionFeedback(window, window);

    await window.fetch('/reports/gate_entry?format=json');
    expect(listener).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
