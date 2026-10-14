import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPinPrompt from './AdminPinPrompt';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  verifyAdminPin: vi.fn(),
  setAdminPin: vi.fn(),
}));

describe('AdminPinPrompt', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('stores the PIN when the server accepts it', async () => {
    api.verifyAdminPin.mockResolvedValue(true);
    render(<AdminPinPrompt tournament={{ id: 3 }} />);

    await userEvent.type(screen.getByLabelText('Admin-PIN eingeben'), ' 4711 ');
    await userEvent.click(screen.getByRole('button', { name: 'Entsperren' }));

    expect(api.verifyAdminPin).toHaveBeenCalledWith(3, '4711');
    expect(api.setAdminPin).toHaveBeenCalledWith('4711');
  });

  it('shows an error and stays locked on a wrong PIN', async () => {
    api.verifyAdminPin.mockResolvedValue(false);
    render(<AdminPinPrompt tournament={{ id: 3 }} />);

    await userEvent.type(screen.getByLabelText('Admin-PIN eingeben'), 'falsch');
    await userEvent.click(screen.getByRole('button', { name: 'Entsperren' }));

    expect(await screen.findByText('Falsche Admin-PIN.')).toBeInTheDocument();
    expect(api.setAdminPin).not.toHaveBeenCalled();
  });
});
