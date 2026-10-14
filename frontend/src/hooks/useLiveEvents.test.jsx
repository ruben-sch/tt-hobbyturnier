import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { LiveEventsContext, createLiveEvents, useLiveEvent } from './useLiveEvents';

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
