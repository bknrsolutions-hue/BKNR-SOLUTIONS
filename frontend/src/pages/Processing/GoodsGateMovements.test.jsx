import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SearchableDropdown } from './GoodsGateMovements';


describe('SearchableDropdown', () => {
  it('filters controlled lookup values and selects a result', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SearchableDropdown
        value=""
        onChange={onChange}
        options={['Peeling Plant Alpha', 'Peeling Plant Beta']}
        placeholder="Select Peeling At"
        required
      />,
    );

    const input = screen.getByPlaceholderText('Select Peeling At');
    await user.type(input, 'Beta');
    expect(screen.queryByText('Peeling Plant Alpha')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Peeling Plant Beta' }));
    expect(onChange).toHaveBeenLastCalledWith('Peeling Plant Beta');
    expect(input).toHaveValue('Peeling Plant Beta');
  });

  it('supports editable values only when explicitly enabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SearchableDropdown
        value=""
        onChange={onChange}
        options={[]}
        placeholder="Select or type party"
        allowCustom
      />,
    );
    await user.type(screen.getByPlaceholderText('Select or type party'), 'Synthetic Vendor');
    expect(onChange).toHaveBeenLastCalledWith('Synthetic Vendor');
    expect(screen.getByText('No matching lookup values')).toBeVisible();
  });
});
