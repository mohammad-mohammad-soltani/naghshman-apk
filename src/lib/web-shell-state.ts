export type WebShellState = {
  /** The first successfully loaded app document must remain remembered. */
  initialReady: boolean;
  initialFailed: boolean;
  /** A failure with nothing usable on screen; only this blocks the whole app. */
  documentFailed: boolean;
  online: boolean;
  /**
   * Consecutive failures of a later navigation, recovered silently while the
   * already working document stays on screen.
   */
  softFailures: number;
};

export type WebShellEvent =
  /** `blocking` forces the full recovery screen even for a later navigation. */
  | { type: 'load-failed'; blocking?: boolean }
  | { type: 'load-succeeded' }
  | { type: 'retry-started' }
  | { type: 'http-error'; statusCode: number }
  | { type: 'network-changed'; online: boolean };

export const INITIAL_WEB_SHELL_STATE: WebShellState = {
  initialReady: false,
  initialFailed: false,
  documentFailed: false,
  online: true,
  softFailures: 0,
};

/** The first silent retry delay; later retries of the same streak back off. */
export const SOFT_RETRY_DELAY_MS = 2000;
export const MAX_SOFT_RETRY_DELAY_MS = 30000;
/** One silent retry is attempted before the user is told anything at all. */
export const SOFT_NOTICE_THRESHOLD = 2;

export function reduceWebShellState(
  state: WebShellState,
  event: WebShellEvent,
): WebShellState {
  switch (event.type) {
    case 'load-succeeded':
      return state.initialReady &&
        !state.initialFailed &&
        !state.documentFailed &&
        state.softFailures === 0
        ? state
        : {
            ...state,
            initialReady: true,
            initialFailed: false,
            documentFailed: false,
            softFailures: 0,
          };
    case 'load-failed': {
      // Once a document works, a later failure must never replace it with an
      // error screen: it is retried silently behind the live page.
      if (state.initialReady && event.blocking !== true)
        return { ...state, softFailures: state.softFailures + 1 };
      return state.documentFailed
        ? state
        : {
            ...state,
            initialFailed: !state.initialReady,
            documentFailed: true,
          };
    }
    case 'retry-started':
      return !state.initialFailed && !state.documentFailed && state.softFailures === 0
        ? state
        : { ...state, initialFailed: false, documentFailed: false, softFailures: 0 };
    case 'http-error':
      return event.statusCode >= 400
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
  return (
    (previous.documentFailed || previous.softFailures > 0) &&
    !previous.online &&
    nextOnline
  );
}

/** Back off between silent retries so a long outage cannot busy-loop. */
export function softRetryDelay(softFailures: number): number {
  if (softFailures < 1) return SOFT_RETRY_DELAY_MS;
  return Math.min(
    SOFT_RETRY_DELAY_MS * 2 ** (softFailures - 1),
    MAX_SOFT_RETRY_DELAY_MS,
  );
}

/**
 * A single transient notice per failure streak: the first failure is retried
 * without any interruption, and recovery afterwards stays silent too.
 */
export function shouldAnnounceSoftFailure(
  previous: WebShellState,
  next: WebShellState,
): boolean {
  return (
    next.softFailures === SOFT_NOTICE_THRESHOLD &&
    previous.softFailures < SOFT_NOTICE_THRESHOLD
  );
}
