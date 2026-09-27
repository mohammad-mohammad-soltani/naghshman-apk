export type WebShellState = {
  /** The first successfully loaded app document must remain remembered. */
  initialReady: boolean;
  initialFailed: boolean;
  /** Unlike initialFailed, this also covers failed later navigations. */
  documentFailed: boolean;
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
  documentFailed: false,
  online: true,
};

export function reduceWebShellState(
  state: WebShellState,
  event: WebShellEvent,
): WebShellState {
  switch (event.type) {
    case 'load-succeeded':
      return state.initialReady && !state.initialFailed && !state.documentFailed
        ? state
        : { ...state, initialReady: true, initialFailed: false, documentFailed: false };
    case 'load-failed':
      return state.documentFailed
        ? state
        : {
            ...state,
            initialFailed: !state.initialReady,
            documentFailed: true,
          };
    case 'retry-started':
      return !state.initialFailed && !state.documentFailed
        ? state
        : { ...state, initialFailed: false, documentFailed: false };
    case 'http-error':
      return event.statusCode >= 500
        ? reduceWebShellState(state, { type: 'load-failed' })
        : state;
    case 'network-changed':
      return state.online === event.online
        ? state
        : { ...state, online: event.online };
  }
}

/** Never reload a healthy, already-rendered document just for reconnection. */
export function shouldRetryFailedLoad(
  previous: WebShellState,
  nextOnline: boolean,
): boolean {
  return previous.documentFailed && !previous.online && nextOnline;
}
