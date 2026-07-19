import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AuthContainer from './AuthContainer';


describe('AuthContainer', () => {
  it('uses the backend login page and ignores cross-origin auth messages', async () => {
    const handleLoginSuccess = vi.fn().mockResolvedValue(undefined);
    render(<AuthContainer handleLoginSuccess={handleLoginSuccess} />);
    const iframe = screen.getByTitle('SVBK ERP Website and Login');
    expect(iframe).toHaveAttribute('src', '/auth/login');

    fireEvent(
      window,
      new MessageEvent('message', {
        origin: 'https://attacker.example',
        source: iframe.contentWindow,
        data: { type: 'BKNR_AUTH_SUCCESS' },
      }),
    );
    await waitFor(() => expect(handleLoginSuccess).not.toHaveBeenCalled());
  });

  it('accepts one same-origin login completion message from its own iframe', async () => {
    const handleLoginSuccess = vi.fn().mockResolvedValue(undefined);
    render(<AuthContainer handleLoginSuccess={handleLoginSuccess} />);
    const iframe = screen.getByTitle('SVBK ERP Website and Login');
    const event = new MessageEvent('message', {
      origin: window.location.origin,
      source: iframe.contentWindow,
      data: { type: 'BKNR_AUTH_SUCCESS' },
    });
    window.dispatchEvent(event);
    window.dispatchEvent(event);
    await waitFor(() => expect(handleLoginSuccess).toHaveBeenCalledTimes(1));
  });
});
