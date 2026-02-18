import type { RetryConfig } from '../../types/retry.js';

/**
 * Calculate delay for next retry attempt
 */
export function calculateRetryDelay(
  attemptNumber: number,
  config: Required<RetryConfig>
): number {
  const { backoffStrategy, initialDelay, maxDelay, backoffMultiplier } = config;

  // Ensure initialDelay is non-negative
  const safeInitialDelay = Math.max(0, initialDelay);

  let delay: number;

  switch (backoffStrategy) {
    case 'exponential':
      delay = safeInitialDelay * Math.pow(backoffMultiplier, attemptNumber - 1);
      break;

    case 'linear':
      delay = safeInitialDelay * attemptNumber;
      break;

    case 'fixed':
      delay = safeInitialDelay;
      break;

    default:
      delay = safeInitialDelay;
  }

  // Cap at maxDelay
  return Math.min(delay, maxDelay);
}

/**
 * Parse Retry-After header value
 * @param retryAfter - Header value (seconds or HTTP date)
 * @returns Delay in milliseconds or null if parsing failed
 */
export function parseRetryAfter(retryAfter: string | null): number | null {
  if (!retryAfter) {
    return null;
  }

  // Try parsing as seconds
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    const delay = date.getTime() - Date.now();
    return delay > 0 ? delay : 0;
  }

  return null;
}
