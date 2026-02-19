/**
 * Deduplication configuration
 */
export interface DeduplicationConfig {
  /**
   * Enable request deduplication globally
   * @default false
   */
  enabled?: boolean;

  /**
   * Custom key generator for deduplication
   * Default uses method + URL (same as cache key)
   */
  keyGenerator?: (input: RequestInfo | URL, init?: RequestInit) => string;
}

/**
 * In-flight request entry
 */
export interface InFlightRequest {
  promise: Promise<Response>;
  timestamp: number;
}
