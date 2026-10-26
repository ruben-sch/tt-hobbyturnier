import { useState, useEffect } from 'react';
import { fetchServerInfo } from '../services/api';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// Base URL that phones on the tournament network can open. On the laptop
// itself the page runs on localhost, which a phone can't reach, so the
// server's LAN address is used instead. null while it is still loading.
export function useAppBaseUrl() {
  const isLocal = LOCAL_HOSTS.includes(window.location.hostname);
  const [baseUrl, setBaseUrl] = useState(isLocal ? null : window.location.origin);

  useEffect(() => {
    if (!isLocal) return;
    let cancelled = false;
    fetchServerInfo()
      .then((info) => info?.lan_url || window.location.origin)
      .catch(() => window.location.origin)
      .then((url) => { if (!cancelled) setBaseUrl(url); });
    return () => { cancelled = true; };
  }, [isLocal]);

  return baseUrl;
}

// Link that opens the Hallen-Monitor (live scores) on a phone.
export function monitorUrl(baseUrl) {
  return `${baseUrl}/?tab=monitor`;
}
