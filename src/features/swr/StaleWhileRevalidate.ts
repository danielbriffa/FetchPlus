import type {
  StaleWhileRevalidateConfig,
  CacheEntryMetadata,
} from '../../types/swr.js';
import type { CacheInterface, CacheOptions } from '../../types/index.js';

/**
 * Default SWR configuration
 */
const DEFAULT_SWR_CONFIG: Required<StaleWhileRevalidateConfig> = {
  enabled: false,
  freshDuration: 0,
  staleDuration: Infinity,
  onRevalidationComplete: () => {},
};

/**
 * Manages stale-while-revalidate caching strategy
 */
export class StaleWhileRevalidate {
  private config: Required<StaleWhileRevalidateConfig>;
  private revalidatingKeys: Set<string> = new Set();

  constructor(config: StaleWhileRevalidateConfig = {}) {
    this.config = { ...DEFAULT_SWR_CONFIG, ...config };
  }

  /**
   * Check cache status
   * Returns: 'fresh' | 'stale' | 'expired' | 'none'
   */
  async checkCacheStatus(
    cacheKey: string,
    cache: CacheInterface
  ): Promise<'fresh' | 'stale' | 'expired' | 'none'> {
    const cached = await cache.get(cacheKey);
    if (!cached) {
      return 'none';
    }

    // Get metadata
    const metadata = await this.getMetadata(cache, cacheKey);
    if (!metadata?.cachedAt) {
      // No metadata - treat as stale
      return 'stale';
    }

    const age = Date.now() - metadata.cachedAt;

    // Check if fresh
    if (age < this.config.freshDuration) {
      return 'fresh';
    }

    // Check if stale but serveable
    if (age < this.config.staleDuration) {
      return 'stale';
    }

    // Expired
    return 'expired';
  }

  /**
   * Execute fetch with SWR strategy
   */
  async executeWithSWR(
    cacheKey: string,
    cache: CacheInterface,
    fetchFn: () => Promise<Response>,
    cacheOptions?: CacheOptions
  ): Promise<Response> {
    // If SWR is disabled, just do normal fetch
    if (!this.config.enabled) {
      return await fetchFn();
    }

    const status = await this.checkCacheStatus(cacheKey, cache);

    // If fresh, return cached response without revalidation
    if (status === 'fresh') {
      return (await cache.get(cacheKey))!;
    }

    // If stale, serve stale and revalidate in background
    if (status === 'stale') {
      const cachedResponse = await cache.get(cacheKey);

      // Start background revalidation (fire-and-forget)
      void this.revalidateInBackground(
        cacheKey,
        cache,
        fetchFn,
        cacheOptions
      );

      return cachedResponse!;
    }

    // If expired or no cache, fetch normally
    // The fetchFn will handle caching with metadata
    return await fetchFn();
  }

  /**
   * Revalidate cache in background
   */
  private async revalidateInBackground(
    cacheKey: string,
    cache: CacheInterface,
    fetchFn: () => Promise<Response>,
    cacheOptions?: CacheOptions
  ): Promise<void> {
    // Prevent duplicate revalidations
    if (this.revalidatingKeys.has(cacheKey)) {
      return;
    }

    this.revalidatingKeys.add(cacheKey);

    // Get current metadata to preserve cachedAt during revalidation
    const currentMetadata = await this.getMetadata(cache, cacheKey);
    const cachedAt = currentMetadata?.cachedAt || Date.now();

    // Update metadata to mark as revalidating
    await this.setMetadata(cache, cacheKey, {
      cachedAt,
      revalidating: true,
    });

    try {
      // Fetch fresh response
      const response = await fetchFn();

      // Update cache with fresh response
      await cache.set(cacheKey, response.clone(), {
        ...cacheOptions,
        metadata: {
          cachedAt: Date.now(),
          revalidating: false,
        },
      });

      // Call callback (wrapped in try-catch)
      try {
        this.config.onRevalidationComplete(response, null);
      } catch (callbackError) {
        console.error('Error in onRevalidationComplete callback:', callbackError);
      }
    } catch (error) {
      // Revalidation failed - keep stale cache
      // Update metadata to mark as not revalidating
      const metadata = await this.getMetadata(cache, cacheKey);
      if (metadata) {
        await this.setMetadata(cache, cacheKey, {
          ...metadata,
          revalidating: false,
        });
      }

      // Call callback with error (wrapped in try-catch)
      try {
        this.config.onRevalidationComplete(null, error as Error);
      } catch (callbackError) {
        console.error('Error in onRevalidationComplete callback:', callbackError);
      }
    } finally {
      this.revalidatingKeys.delete(cacheKey);
    }
  }

  /**
   * Get metadata from cache
   */
  private async getMetadata(
    cache: CacheInterface,
    cacheKey: string
  ): Promise<CacheEntryMetadata | null> {
    // Check if cache has getMetadata method
    if ('getMetadata' in cache && typeof cache.getMetadata === 'function') {
      return await (cache as any).getMetadata(cacheKey);
    }
    return null;
  }

  /**
   * Set metadata in cache
   */
  private async setMetadata(
    cache: CacheInterface,
    cacheKey: string,
    metadata: CacheEntryMetadata
  ): Promise<void> {
    // Check if cache has setMetadata method
    if ('setMetadata' in cache && typeof cache.setMetadata === 'function') {
      await (cache as any).setMetadata(cacheKey, metadata);
    }
  }

  /**
   * Merge global and per-request SWR configs
   */
  static mergeConfigs(
    globalConfig?: StaleWhileRevalidateConfig,
    requestConfig?: StaleWhileRevalidateConfig | false
  ): StaleWhileRevalidateConfig | null {
    // Request explicitly disables SWR
    if (requestConfig === false) {
      return null;
    }

    // Request provides config
    if (requestConfig && typeof requestConfig === 'object') {
      return requestConfig;
    }

    // Use global config if provided (even if enabled is false)
    if (globalConfig && typeof globalConfig === 'object') {
      return globalConfig;
    }

    // No SWR config
    return null;
  }
}
