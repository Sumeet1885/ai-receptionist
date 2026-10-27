import { createContext, useContext } from 'react';
import type { AdminEvent } from './useAdminEvents';

// Live updates shared by the shell and every page: whether the socket is connected, the latest
// event and a counter that increments on every event so pages can simply re-fetch.
export interface LiveState {
  connected: boolean;
  version: number;
  lastEvent: AdminEvent | null;
}

export const LiveContext = createContext<LiveState>({ connected: false, version: 0, lastEvent: null });
export const useLive = () => useContext(LiveContext);
