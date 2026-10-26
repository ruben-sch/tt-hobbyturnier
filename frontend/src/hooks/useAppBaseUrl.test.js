import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAppBaseUrl, monitorUrl } from './useAppBaseUrl';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  fetchServerInfo: vi.fn(),
}));

describe('useAppBaseUrl', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the server LAN address when opened on localhost', async () => {
    api.fetchServerInfo.mockResolvedValue({ lan_url: 'http://192.168.8.10:8000' });
    const { result } = renderHook(() => useAppBaseUrl());

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('http://192.168.8.10:8000'));
  });

  it('falls back to the page origin without a LAN address', async () => {
    api.fetchServerInfo.mockResolvedValue({ lan_url: null });
    const { result } = renderHook(() => useAppBaseUrl());
    await waitFor(() => expect(result.current).toBe(window.location.origin));
  });

  it('falls back to the page origin when the request fails', async () => {
    api.fetchServerInfo.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAppBaseUrl());
    await waitFor(() => expect(result.current).toBe(window.location.origin));
  });

  it('uses the page origin directly when opened via the network', () => {
    vi.stubGlobal('location', { hostname: '192.168.8.10', origin: 'http://192.168.8.10:8000' });
    const { result } = renderHook(() => useAppBaseUrl());

    expect(result.current).toBe('http://192.168.8.10:8000');
    expect(api.fetchServerInfo).not.toHaveBeenCalled();
  });
});

describe('monitorUrl', () => {
  it('links to the Hallen-Monitor', () => {
    expect(monitorUrl('http://10.0.0.2:8000')).toBe('http://10.0.0.2:8000/?tab=monitor');
  });
});
