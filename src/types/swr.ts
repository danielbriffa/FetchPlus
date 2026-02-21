/**
 * Callback invoked when background revalidation completes
 * @param response - The fresh response if successful, null if failed
 * @param error - The error if failed, null if successful
 */
export type RevalidationCallback = (
  response: Response | null,
  error: Error | null
) => void;

/**
 * Stale-while-revalidate configuration
 */
export interface StaleWhileRevalidateConfig {
  /**
   * Enable stale-while-revalidate globally
   * @default false
   */
  enabled?: boolean;

  /**
   * How long a cached response is considered "fresh" (milliseconds)
   * Within this time, no background revalidation occurs
   * @default 0 (always revalidate)
   */
  freshDuration?: number;

  /**
   * How long a cached response can be served as "stale" (milliseconds)
   * After this time, cache is not used at all
   * @default Infinity (serve stale forever)
   */
  staleDuration?: number;

  /**
   * Callback called when background revalidation completes
   * Wrapped in try-catch to prevent crashes
   */
  onRevalidationComplete?: RevalidationCallback;
}

/**
 * Cache entry metadata for SWR
 */
export interface CacheEntryMetadata {
  /**
   * Timestamp when entry was cached (milliseconds)
   */
  cachedAt: number;

  /**
   * Whether entry is currently being revalidated
   */
  revalidating?: boolean;
}
