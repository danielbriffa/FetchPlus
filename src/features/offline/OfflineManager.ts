import type { OfflineConfig, OfflineStrategy, QueuedRequest } from '../../types/offline.js';
import type { CacheInterface } from '../../types/index.js';
import { generateCacheKey } from '../../utils/cacheKey.js';

/**
 * Default offline configuration
 */
const DEFAULT_OFFLINE_CONFIG: Required<OfflineConfig> = {
  enabled: false,
  strategy: 'cache-first',
  queueRequests: false,
  maxQueueSize: 50,
  onOffline: () => {},
  onOnline: () => {},
  onQueuedRequestRetry: () => {},
};

/**
 * Manages offline detection and request queuing
 */
export class OfflineManager {
  private config: Required<OfflineConfig>;
  private isOnline: boolean;
  private requestQueue: QueuedRequest[] = [];
  private nextRequestId = 0;
  private originalFetch: typeof fetch;

  constructor(config: OfflineConfig = {}, originalFetch?: typeof fetch) {
    this.config = { ...DEFAULT_OFFLINE_CONFIG, ...config };
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.originalFetch = originalFetch || globalThis.fetch.bind(globalThis);

    // Listen for online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
  }

  /**
   * Handle online event
   */
  private handleOnline = (): void => {
    this.isOnline = true;

    // Call callback safely
    try {
      this.config.onOnline();
    } catch (error) {
      console.error('Error in onOnline callback:', error);
    }

    // Retry queued requests
    if (this.config.queueRequests) {
      // Don't await - process in background
      void this.processQueue();
    }
  };

  /**
   * Handle offline event
   */
  private handleOffline = (): void => {
    this.isOnline = false;

    // Call callback safely
    try {
      this.config.onOffline();
    } catch (error) {
      console.error('Error in onOffline callback:', error);
    }
  };

  /**
   * Check if currently online
   */
  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Execute fetch with offline handling
   */
  async executeWithOfflineHandling(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    cache: CacheInterface,
    fetchFn: () => Promise<Response>,
    strategy?: OfflineStrategy,
    queueIfOffline?: boolean
  ): Promise<Response> {
    // If offline handling is disabled, just execute the fetch directly
    if (!this.config.enabled) {
      return await fetchFn();
    }

    const effectiveStrategy = strategy || this.config.strategy;
    const shouldQueue = queueIfOffline !== undefined
      ? queueIfOffline
      : this.config.queueRequests;

    // Re-check navigator.onLine for accuracy (events may not have fired)
    if (typeof navigator !== 'undefined') {
      this.isOnline = navigator.onLine;
    }

    // If online, use strategy
    if (this.isOnline) {
      return await this.executeStrategy(
        input,
        init,
        cache,
        fetchFn,
        effectiveStrategy,
        shouldQueue
      );
    }

    // Offline - try cache or queue
    return await this.handleOfflineRequest(
      input,
      init,
      cache,
      shouldQueue
    );
  }

  /**
   * Execute request with specified strategy
   */
  private async executeStrategy(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    cache: CacheInterface,
    fetchFn: () => Promise<Response>,
    strategy: OfflineStrategy,
    shouldQueue: boolean
  ): Promise<Response> {
    const cacheKey = generateCacheKey(input, init);

    switch (strategy) {
      case 'cache-only':
        return await this.handleCacheOnly(cacheKey, cache);

      case 'network-first':
        return await this.handleNetworkFirst(
          input,
          init,
          cacheKey,
          cache,
          fetchFn,
          shouldQueue
        );

      case 'cache-first':
        return await this.handleCacheFirst(
          input,
          init,
          cacheKey,
          cache,
          fetchFn,
          shouldQueue
        );

      default:
        return await fetchFn();
    }
  }

  /**
   * Cache-only strategy
   */
  private async handleCacheOnly(
    cacheKey: string,
    cache: CacheInterface
  ): Promise<Response> {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    throw new Error('No cached response available (cache-only mode)');
  }

  /**
   * Network-first strategy
   */
  private async handleNetworkFirst(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    cacheKey: string,
    cache: CacheInterface,
    fetchFn: () => Promise<Response>,
    shouldQueue: boolean
  ): Promise<Response> {
    try {
      return await fetchFn();
    } catch (error) {
      // Network failed - try cache
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // No cache - queue if enabled
      if (shouldQueue) {
        this.queueRequest(input, init);
      }

      throw error;
    }
  }

  /**
   * Cache-first strategy
   */
  private async handleCacheFirst(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    cacheKey: string,
    cache: CacheInterface,
    fetchFn: () => Promise<Response>,
    shouldQueue: boolean
  ): Promise<Response> {
    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Cache miss - try network
    try {
      return await fetchFn();
    } catch (error) {
      // Queue if enabled
      if (shouldQueue) {
        this.queueRequest(input, init);
      }

      throw error;
    }
  }

  /**
   * Handle offline request
   */
  private async handleOfflineRequest(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    cache: CacheInterface,
    shouldQueue: boolean
  ): Promise<Response> {
    const cacheKey = generateCacheKey(input, init);
    const cached = await cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    // No cache - queue if enabled
    if (shouldQueue) {
      this.queueRequest(input, init);
    }

    throw new Error('Network offline and no cached response available');
  }

  /**
   * Queue a request for retry
   */
  private queueRequest(input: RequestInfo | URL, init?: RequestInit): void {
    // Check queue size
    if (this.requestQueue.length >= this.config.maxQueueSize) {
      // Remove oldest (FIFO)
      this.requestQueue.shift();
    }

    // Add to queue
    this.requestQueue.push({
      id: `req-${this.nextRequestId++}`,
      input,
      init,
      timestamp: Date.now(),
      retries: 0,
    });
  }

  /**
   * Process queued requests
   */
  private async processQueue(): Promise<void> {
    // Clone queue and clear it
    const queue = [...this.requestQueue];
    this.requestQueue = [];

    // Process each request in FIFO order
    for (const request of queue) {
      try {
        // Use the original fetch to retry (avoid infinite loops if FetchPlus replaced global fetch)
        const response = await this.originalFetch(request.input, request.init);

        // Call callback safely
        try {
          this.config.onQueuedRequestRetry(request, response, null);
        } catch (error) {
          console.error('Error in onQueuedRequestRetry callback:', error);
        }
      } catch (error) {
        // Re-queue on failure
        this.requestQueue.push({
          ...request,
          retries: request.retries + 1,
        });

        // Call callback safely
        try {
          this.config.onQueuedRequestRetry(request, null, error as Error);
        } catch (callbackError) {
          console.error('Error in onQueuedRequestRetry callback:', callbackError);
        }
      }
    }
  }

  /**
   * Get current queue (returns a copy)
   */
  getQueue(): QueuedRequest[] {
    return [...this.requestQueue];
  }

  /**
   * Clear queue
   */
  clearQueue(): void {
    this.requestQueue = [];
  }

  /**
   * Cleanup event listeners and queue
   */
  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    this.clearQueue();
  }
}
