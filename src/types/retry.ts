/**
 * Backoff strategy for retries
 */
export type BackoffStrategy = 'exponential' | 'linear' | 'fixed';

/**
 * Retry configuration options
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxRetries?: number;

  /**
   * Backoff strategy to use
   * @default 'exponential'
   */
  backoffStrategy?: BackoffStrategy;

  /**
   * Initial delay in milliseconds before first retry
   * @default 1000
   */
  initialDelay?: number;

  /**
   * Maximum delay between retries in milliseconds
   * @default 30000 (30 seconds)
   */
  maxDelay?: number;

  /**
   * Multiplier for exponential backoff
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * HTTP status codes that should trigger a retry
   * @default [408, 429, 500, 502, 503, 504]
   */
  retryableStatusCodes?: number[];

  /**
   * Whether to retry on network errors (fetch failures)
   * @default true
   */
  retryOnNetworkError?: boolean;

  /**
   * Respect Retry-After header from server
   * @default true
   */
  respectRetryAfter?: boolean;

  /**
   * Callback function called before each retry attempt
   * @param error - The error that triggered the retry
   * @param attemptNumber - Current retry attempt (1-indexed)
   * @param delayMs - Delay before this retry
   */
  onRetry?: (error: Error, attemptNumber: number, delayMs: number) => void;
}

/**
 * Internal retry state
 */
export interface RetryState {
  attemptNumber: number;
  lastError: Error | null;
  totalDelay: number;
}

/**
 * Retry result with metadata
 */
export interface RetryResult {
  response?: Response;
  error?: Error;
  attempts: number;
  totalDelay: number;
}
