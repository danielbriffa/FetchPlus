import { TimeoutError } from '../../errors/TimeoutError.js';

/**
 * Manages request timeouts
 */
export class TimeoutManager {
  /**
   * Execute a fetch with timeout
   * Combines user's AbortSignal with timeout AbortSignal
   */
  static async executeWithTimeout(
    fetchFn: (signal?: AbortSignal) => Promise<Response>,
    timeoutMs: number | null,
    userSignal?: AbortSignal
  ): Promise<Response> {
    // If timeout is null or undefined, execute without timeout
    if (timeoutMs === null || timeoutMs === undefined) {
      return await fetchFn(userSignal);
    }

    // Check if user signal is already aborted
    if (userSignal?.aborted) {
      throw new DOMException('The operation was aborted', 'AbortError');
    }

    // Create timeout abort controller
    const timeoutController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Create a promise that rejects when timeout fires
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timeoutController.abort();
        reject(new TimeoutError(
          `Request timeout after ${timeoutMs}ms`,
          timeoutMs
        ));
      }, timeoutMs);
    });

    // Create a promise that rejects when user aborts
    const userAbortPromise = userSignal ? new Promise<never>((_, reject) => {
      userSignal.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted', 'AbortError'));
      }, { once: true });
    }) : new Promise<never>(() => {}); // Never resolves if no user signal

    try {
      // Combine user signal and timeout signal
      const combinedSignal = userSignal
        ? this.combineSignals(userSignal, timeoutController.signal)
        : timeoutController.signal;

      // Race the fetch against the timeout and user abort
      const response: Response = await Promise.race([
        fetchFn(combinedSignal),
        timeoutPromise,
        userAbortPromise
      ]);

      // Clear the timeout if request completed successfully
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      return response;
    } catch (error) {
      // Clear the timeout on error
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      // Re-throw the error as-is
      // The error will be either TimeoutError or AbortError depending on which fired first
      throw error;
    }
  }

  /**
   * Combine two AbortSignals
   * Returns a signal that aborts when either signal aborts
   */
  static combineSignals(
    signal1: AbortSignal | null | undefined,
    signal2: AbortSignal | null | undefined
  ): AbortSignal {
    // If either signal is null/undefined, return the other one
    if (!signal1) return signal2!;
    if (!signal2) return signal1;

    // If either signal is already aborted, create an already-aborted signal
    if (signal1.aborted || signal2.aborted) {
      const controller = new AbortController();
      controller.abort();
      return controller.signal;
    }

    const controller = new AbortController();

    // Abort if either signal aborts
    const abort = () => controller.abort();

    signal1.addEventListener('abort', abort, { once: true });
    signal2.addEventListener('abort', abort, { once: true });

    return controller.signal;
  }

  /**
   * Determine timeout value for a request
   */
  static getTimeoutValue(
    requestTimeout?: number,
    defaultTimeout?: number
  ): number | null {
    // If requestTimeout is explicitly set, return it (including 0)
    if (requestTimeout !== undefined) {
      return requestTimeout;
    }

    // Use defaultTimeout if set (including 0)
    if (defaultTimeout !== undefined) {
      return defaultTimeout;
    }

    return null;
  }
}
