import { createContext, useContext, useEffect, useRef } from 'react';

// Events that change the tournament's structure (rounds, KO phase, settings).
// App reloads the tournament on these, and every view refetches because its
// loader depends on the `tournament` object.
export const TOURNAMENT_EVENTS = [
  'TOURNAMENT_UPDATED',
  'ROUND_GENERATED',
  'ROUND_COMPLETED',
  'KO_STARTED',
  'KO_ADVANCED',
];

// Frequent events inside a round. Views subscribe to the ones they display.
export const MATCH_EVENTS = ['SCORE_UPDATE', 'ROUND_UPDATED'];
export const TEAM_EVENTS = ['TEAMS_UPDATED'];

export function createLiveEvents() {
  const subscribers = new Set();
  return {
    emit(msg) {
      subscribers.forEach((cb) => cb(msg));
    },
    subscribe(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
  };
}

export const LiveEventsContext = createContext(null);

// Calls handler(msg) for WebSocket events whose type is in `types`.
// Without a provider (e.g. in component tests) it does nothing.
export function useLiveEvent(types, handler) {
  const events = useContext(LiveEventsContext);
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const typesKey = types.join(',');
  useEffect(() => {
    if (!events) return undefined;
    const wanted = typesKey.split(',');
    return events.subscribe((msg) => {
      if (wanted.includes(msg.type)) handlerRef.current(msg);
    });
  }, [events, typesKey]);
}
