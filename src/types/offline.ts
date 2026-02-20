/**
 * Offline cache strategy
 */
export type OfflineStrategy = 'cache-only' | 'network-first' | 'cache-first';

/**
 * Queued request for offline retry
 */
export interface QueuedRequest {
  /**
   * Unique identifier for the request
   */
  id: string;

  /**
   * Request input (URL or Request object)
   */
  input: RequestInfo | URL;

  /**
   * Request initialization options
   */
  init?: RequestInit;

  /**
   * Timestamp when request was queued
   */
  timestamp: number;

  /**
   * Number of retry attempts
   */
  retries: number;
}

/**
 * Offline configuration
 */
export interface OfflineConfig {
  /**
   * Enable offline detection and fallback
   * @default false
   */
  enabled?: boolean;

  /**
   * Offline cache strategy
   * - cache-only: Only serve from cache, throw if miss
   * - network-first: Try network, fall back to cache on error
   * - cache-first: Check cache first, fall back to network
   * @default 'cache-first'
   */
  strategy?: OfflineStrategy;

  /**
   * Queue failed requests for retry when back online
   * @default false
   */
  queueRequests?: boolean;

  /**
   * Maximum number of requests to queue
   * Oldest requests are discarded when limit is reached
   * @default 50
   */
  maxQueueSize?: number;

  /**
   * Callback when going offline
   */
  onOffline?: () => void;

  /**
   * Callback when going online
   */
  onOnline?: () => void;

  /**
   * Callback when a queued request is retried
   * @param request The queued request being retried
   * @param response The response if successful, null if failed
   * @param error The error if failed, null if successful
   */
  onQueuedRequestRetry?: (request: QueuedRequest, response: Response | null, error: Error | null) => void;
}
