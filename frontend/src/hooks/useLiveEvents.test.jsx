import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { LiveEventsContext, createLiveEvents, useLiveEvent } from './useLiveEvents';
import { useWebSocket } from './useWebSocket';

describe('useLiveEvent', () => {
  it('calls the handler only for subscribed event types', () => {
    const events = createLiveEvents();
    const handler = vi.fn();
    const wrapper = ({ children }) => (
      <LiveEventsContext.Provider value={events}>{children}</LiveEventsContext.Provider>
    );
    const { unmount } = renderHook(() => useLiveEvent(['SCORE_UPDATE'], handler), { wrapper });

    events.emit({ type: 'SCORE_UPDATE', match_id: 1 });
    events.emit({ type: 'TEAMS_UPDATED' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: 'SCORE_UPDATE', match_id: 1 });

    unmount();
    events.emit({ type: 'SCORE_UPDATE' });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('useWebSocket', () => {
  const OriginalWebSocket = globalThis.WebSocket;

  afterEach(() => {
    globalThis.WebSocket = OriginalWebSocket;
    vi.useRealTimers();
  });

  it('calls onOpen again after a reconnect so views can catch up', () => {
    vi.useFakeTimers();
    const sockets = [];
    globalThis.WebSocket = class {
      constructor() { sockets.push(this); }
      close() { this.onclose && this.onclose(); }
    };
    const onOpen = vi.fn();
    renderHook(() => useWebSocket(() => {}, onOpen));

    act(() => sockets[0].onopen());
    expect(onOpen).toHaveBeenCalledTimes(1);

    act(() => sockets[0].onclose());
    act(() => vi.advanceTimersByTime(3000));
    act(() => sockets[1].onopen());
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
