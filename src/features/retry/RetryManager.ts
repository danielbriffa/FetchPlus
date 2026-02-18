import type { RetryConfig, RetryState } from '../../types/retry.js';
import { RetryError } from '../../errors/RetryError.js';
import { calculateRetryDelay, parseRetryAfter } from './backoff.js';

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  backoffStrategy: 'exponential',
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  retryOnNetworkError: true,
  respectRetryAfter: true,
  onRetry: () => {},
};

/**
 * Maximum allowed retries to prevent infinite loops
 */
const MAX_RETRIES_LIMIT = 10;

/**
 * Manages retry logic for failed requests
 */
export class RetryManager {
  private config: Required<RetryConfig>;

  constructor(config: RetryConfig = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };

    // Cap maxRetries at reasonable limit
    if (this.config.maxRetries > MAX_RETRIES_LIMIT) {
      this.config.maxRetries = MAX_RETRIES_LIMIT;
    }
  }

  /**
   * Execute a fetch with retry logic
   */
  async executeWithRetry(
    fetchFn: () => Promise<Response>,
    signal?: AbortSignal
  ): Promise<Response> {
    const state: RetryState = {
      attemptNumber: 0,
      lastError: null,
      totalDelay: 0,
    };

    while (state.attemptNumber <= this.config.maxRetries) {
      state.attemptNumber++;

      try {
        // Check if aborted before attempting
        if (signal?.aborted) {
          throw new Error('Request aborted');
        }

        const response = await fetchFn();

        // Check if response status is retryable
        if (this.shouldRetryResponse(response)) {
          // Clone response to read headers without consuming body
          const clonedResponse = response.clone();
          const retryAfter = clonedResponse.headers.get('Retry-After');

          // If we have retries left, retry
          if (state.attemptNumber <= this.config.maxRetries) {
            // Create error for callback
            const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
            const delay = await this.waitBeforeRetry(state.attemptNumber, retryAfter, error, signal);
            state.totalDelay += delay;
            continue;
          }

          // No retries left, return the error response
          return response;
        }

        // Success - return response
        return response;

      } catch (error) {
        state.lastError = error as Error;

        // Don't retry if aborted
        if (signal?.aborted || (error as Error).name === 'AbortError') {
          throw error;
        }

        // Check if we should retry this error
        if (!this.shouldRetryError(error as Error)) {
          throw error;
        }

        // If we're out of retries, throw RetryError
        if (state.attemptNumber > this.config.maxRetries) {
          throw new RetryError(
            `Request failed after ${state.attemptNumber} attempts`,
            state.attemptNumber,
            state.lastError,
            state.totalDelay
          );
        }

        // Wait before retry
        const delay = await this.waitBeforeRetry(state.attemptNumber, null, error as Error, signal);
        state.totalDelay += delay;
      }
    }

    // Should never reach here, but TypeScript needs it
    throw new RetryError(
      `Request failed after ${state.attemptNumber} attempts`,
      state.attemptNumber,
      state.lastError!,
      state.totalDelay
    );
  }

  /**
   * Determine if a response should trigger a retry
   */
  private shouldRetryResponse(response: Response): boolean {
    return this.config.retryableStatusCodes.includes(response.status);
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetryError(error: Error): boolean {
    // Network errors (TypeError from fetch) are retryable
    if (this.config.retryOnNetworkError && error instanceof TypeError) {
      return true;
    }

    return false;
  }

  /**
   * Wait before next retry attempt
   * Returns the actual delay used
   */
  private async waitBeforeRetry(
    attemptNumber: number,
    retryAfterHeader: string | null,
    error: Error,
    signal?: AbortSignal
  ): Promise<number> {
    let delay: number;

    // Check Retry-After header first
    if (this.config.respectRetryAfter && retryAfterHeader) {
      const parsedDelay = parseRetryAfter(retryAfterHeader);
      if (parsedDelay !== null) {
        delay = Math.min(parsedDelay, this.config.maxDelay);
      } else {
        delay = calculateRetryDelay(attemptNumber, this.config);
      }
    } else {
      delay = calculateRetryDelay(attemptNumber, this.config);
    }

    // Call onRetry callback, catch and log errors to prevent crashes
    if (this.config.onRetry) {
      try {
        this.config.onRetry(error, attemptNumber, delay);
      } catch (callbackError) {
        console.error('Error in onRetry callback:', callbackError);
      }
    }

    // Wait for the delay, but also listen for abort signal
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve();
      }, delay);

      const cleanup = () => {
        clearTimeout(timeout);
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      const onAbort = () => {
        cleanup();
        reject(new Error('Request aborted during retry wait'));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort);
        // Check if already aborted
        if (signal.aborted) {
          onAbort();
        }
      }
    });

    return delay;
  }

  /**
   * Merge global and per-request retry configs
   */
  static mergeConfigs(
    globalConfig?: RetryConfig | false,
    requestConfig?: RetryConfig | false
  ): RetryConfig | null {
    // Request explicitly disables retry
    if (requestConfig === false) {
      return null;
    }

    // Request provides config
    if (requestConfig && typeof requestConfig === 'object') {
      return requestConfig;
    }

    // Use global config
    if (globalConfig && typeof globalConfig === 'object') {
      return globalConfig;
    }

    // No retry config
    return null;
  }
}
