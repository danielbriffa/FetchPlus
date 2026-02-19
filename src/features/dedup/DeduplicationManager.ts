import type { DeduplicationConfig, InFlightRequest } from '../../types/dedup.js';
import { generateDedupKeySync } from '../../utils/dedupKey.js';

/**
 * Default deduplication config
 */
const DEFAULT_DEDUP_CONFIG: Required<DeduplicationConfig> = {
  enabled: false,
  keyGenerator: generateDedupKeySync,
};

/**
 * Manages request deduplication
 */
export class DeduplicationManager {
  private inFlightRequests: Map<string, InFlightRequest> = new Map();
  private config: Required<DeduplicationConfig>;

  constructor(config: DeduplicationConfig = {}) {
    this.config = { ...DEFAULT_DEDUP_CONFIG, ...config };
  }

  /**
   * Get or create a request
   * Returns existing promise if request is in-flight
   */
  async deduplicate(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    fetchFn: () => Promise<Response>
  ): Promise<Response> {
    const key = this.config.keyGenerator(input, init);

    // Check if request is in-flight
    const inFlight = this.inFlightRequests.get(key);
    if (inFlight) {
      // Return cloned response to prevent stream consumption issues
      const response = await inFlight.promise;
      return response.clone();
    }

    // Create new request with cloning built in
    // The first caller gets a clone, and we store a clone for future waiters
    const promise = fetchFn().then(response => {
      // Clone the response so we can return it multiple times
      return response.clone();
    });

    // Store in-flight request
    this.inFlightRequests.set(key, {
      promise,
      timestamp: Date.now(),
    });

    // Clean up after completion or error
    const cleanup = () => {
      this.inFlightRequests.delete(key);
    };

    promise.then(cleanup, cleanup);

    return promise;
  }

  /**
   * Check if a request is currently in-flight
   */
  hasInFlight(input: RequestInfo | URL, init?: RequestInit): boolean {
    const key = this.config.keyGenerator(input, init);
    return this.inFlightRequests.has(key);
  }

  /**
   * Clear all in-flight requests
   */
  clearAll(): void {
    this.inFlightRequests.clear();
  }

  /**
   * Get count of in-flight requests
   */
  getInFlightCount(): number {
    return this.inFlightRequests.size;
  }
}
