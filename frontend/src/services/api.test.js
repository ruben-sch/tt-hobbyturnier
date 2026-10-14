import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTeam, getAdminPin, setAdminPin, subscribeAdminPin, verifyAdminPin } from './api';

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

describe('admin PIN handling', () => {
  beforeEach(() => {
    setAdminPin(null);
    globalThis.fetch = vi.fn();
  });

  it('sends the stored PIN on admin calls', async () => {
    setAdminPin('4711');
    fetch.mockResolvedValue(jsonResponse(200, { id: 1 }));

    await createTeam(1, { name: 'T' });

    const [, options] = fetch.mock.calls[0];
    expect(options.headers['X-Admin-Pin']).toBe('4711');
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('forgets a rejected PIN and notifies listeners', async () => {
    setAdminPin('alt');
    const listener = vi.fn();
    const unsubscribe = subscribeAdminPin(listener);
    fetch.mockResolvedValue(jsonResponse(403, { detail: 'Falsche Admin-PIN.' }));

    await expect(createTeam(1, { name: 'T' })).rejects.toThrow('Falsche Admin-PIN.');

    expect(getAdminPin()).toBeNull();
    expect(sessionStorage.getItem('adminPin')).toBeNull();
    expect(listener).toHaveBeenCalledWith(null);
    unsubscribe();
  });

  it('keeps the PIN on other errors', async () => {
    setAdminPin('4711');
    fetch.mockResolvedValue(jsonResponse(400, { detail: 'Runde 1 ist noch aktiv.' }));

    await expect(createTeam(1, { name: 'T' })).rejects.toThrow('Runde 1 ist noch aktiv.');
    expect(getAdminPin()).toBe('4711');
  });

  it('verifyAdminPin reports wrong PINs as false', async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, {}));
    expect(await verifyAdminPin(1, 'richtig')).toBe(true);
    fetch.mockResolvedValueOnce(jsonResponse(403, {}));
    expect(await verifyAdminPin(1, 'falsch')).toBe(false);
  });
});
