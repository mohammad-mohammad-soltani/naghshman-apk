/**
 * Decides, at launch, whether the WebView may be opened at all. Until the site
 * has answered once, the app stays on its splash; offline, it says so there.
 */
export type LaunchGateState = {
  status: 'checking' | 'online' | 'offline';
  /** True once offline was shown, so a retry keeps the offline card up. */
  wasOffline: boolean;
};

export type LaunchGateEvent =
  | { type: 'probe-started' }
  | { type: 'probe-finished'; reachable: boolean }
  | { type: 'network-changed'; connected: boolean | null | undefined };

export const INITIAL_LAUNCH_GATE: LaunchGateState = {
  status: 'checking',
  wasOffline: false,
};

export const OPEN_LAUNCH_GATE: LaunchGateState = {
  status: 'online',
  wasOffline: false,
};

/** The site must answer within this window, or the launch counts as offline. */
export const LAUNCH_PROBE_TIMEOUT_MS = 5000;

export function reduceLaunchGate(
  state: LaunchGateState,
  event: LaunchGateEvent,
): LaunchGateState {
  // Once the app is open, later outages belong to the WebView recovery flow.
  if (state.status === 'online') return state;

  switch (event.type) {
    case 'probe-started':
      return state.status === 'checking' ? state : { ...state, status: 'checking' };
    case 'probe-finished':
      return event.reachable
        ? { status: 'online', wasOffline: state.wasOffline }
        : { status: 'offline', wasOffline: true };
    case 'network-changed':
      // Only a definite "no network" skips the probe; unknown waits for it.
      return event.connected === false
        ? { status: 'offline', wasOffline: true }
        : state;
  }
}

/** The offline card stays up while a retry is in flight. */
export function showsOfflineCard(state: LaunchGateState): boolean {
  return state.status === 'offline' || (state.status === 'checking' && state.wasOffline);
}

export function isRetryingLaunch(state: LaunchGateState): boolean {
  return state.status === 'checking' && state.wasOffline;
}
