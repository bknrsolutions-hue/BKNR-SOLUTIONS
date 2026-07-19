import { afterEach, describe, expect, it, vi } from 'vitest';

import { sessionFetch } from './sessionFetch';

describe('sessionFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches bknr:session-expired and throws on a 401 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{}', { status: 401 }),
    ));

    const listener = vi.fn();
    window.addEventListener('bknr:session-expired', listener);

    await expect(sessionFetch('/reports/gate_entry?format=json')).rejects.toThrow(
      'Session expired',
    );

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener('bknr:session-expired', listener);
  });
});
