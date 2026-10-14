import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from './useWebSocket';

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.closed = false;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

describe('useWebSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects to /ws on the current host and passes parsed messages on', () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket(onMessage));
    const ws = FakeWebSocket.instances[0];

    expect(ws.url).toBe(`ws://${window.location.host}/ws`);
    expect(result.current.isConnected).toBe(false);

    act(() => ws.onopen());
    expect(result.current.isConnected).toBe(true);

    act(() => ws.onmessage({ data: '{"type":"SCORE_UPDATE"}' }));
    expect(onMessage).toHaveBeenCalledWith({ type: 'SCORE_UPDATE' });
  });

  it('ignores messages that are not JSON', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onMessage = vi.fn();
    renderHook(() => useWebSocket(onMessage));

    act(() => FakeWebSocket.instances[0].onmessage({ data: 'kaputt' }));
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('reconnects 3 seconds after the connection closes', () => {
    const { result } = renderHook(() => useWebSocket(() => {}));
    const ws = FakeWebSocket.instances[0];

    act(() => ws.onopen());
    act(() => ws.onclose());
    expect(result.current.isConnected).toBe(false);
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => vi.advanceTimersByTime(3000));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('calls onOpen on every (re)connect so views can catch up', () => {
    const onOpen = vi.fn();
    renderHook(() => useWebSocket(() => {}, onOpen));

    act(() => FakeWebSocket.instances[0].onopen());
    expect(onOpen).toHaveBeenCalledTimes(1);

    act(() => FakeWebSocket.instances[0].onclose());
    act(() => vi.advanceTimersByTime(3000));
    act(() => FakeWebSocket.instances[1].onopen());
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('closes the socket on errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderHook(() => useWebSocket(() => {}));
    const ws = FakeWebSocket.instances[0];

    act(() => ws.onerror(new Event('error')));
    expect(ws.closed).toBe(true);
  });

  it('closes the socket on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket(() => {}));
    unmount();
    expect(FakeWebSocket.instances[0].closed).toBe(true);
  });
});
