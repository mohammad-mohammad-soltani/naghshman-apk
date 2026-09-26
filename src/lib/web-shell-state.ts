export type WebShellState = {
  initialReady: boolean;
  initialFailed: boolean;
  online: boolean;
};

export type WebShellEvent =
  | { type: 'load-succeeded' }
  | { type: 'load-failed' }
  | { type: 'retry-started' }
  | { type: 'http-error'; statusCode: number }
  | { type: 'network-changed'; online: boolean };

export const INITIAL_WEB_SHELL_STATE: WebShellState = {
  initialReady: false,
  initialFailed: false,
  online: true,
};

export function reduceWebShellState(
  state: WebShellState,
  event: WebShellEvent,
): WebShellState {
  switch (event.type) {
    case 'load-succeeded':
      return state.initialReady
        ? state
        : { ...state, initialReady: true, initialFailed: false };
    case 'load-failed':
      return state.initialReady ? state : { ...state, initialFailed: true };
    case 'retry-started':
      return state.initialReady ? state : { ...state, initialFailed: false };
    case 'http-error':
      return state.initialReady || event.statusCode < 500
        ? state
        : { ...state, initialFailed: true };
    case 'network-changed':
      return state.online === event.online ? state : { ...state, online: event.online };
  }
}

export function shouldRetryInitialLoad(
  previous: WebShellState,
  nextOnline: boolean,
): boolean {
  return (
    !previous.initialReady &&
    previous.initialFailed &&
    !previous.online &&
    nextOnline
  );
}
