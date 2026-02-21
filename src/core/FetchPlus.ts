import type { CacheInterface, FetchPlusConfig, FetchPlusRequestInit, CacheOptions, RetryConfig, DeduplicationConfig, TimeoutConfig, OfflineConfig, StaleWhileRevalidateConfig, RateLimitConfig } from '../types/index.js';
import { InterceptorManager } from '../interceptors/InterceptorManager.js';
import { CacheStorageCache } from '../cache/CacheStorageCache.js';
import { generateCacheKey } from '../utils/cacheKey.js';
import { isCacheable } from '../utils/responseClone.js';
import { CacheSyncManager } from '../sync/CacheSyncManager.js';
import { RetryManager } from '../features/retry/RetryManager.js';
import { DeduplicationManager } from '../features/dedup/DeduplicationManager.js';
import { TimeoutManager } from '../features/timeout/TimeoutManager.js';
import { OfflineManager } from '../features/offline/OfflineManager.js';
import { StaleWhileRevalidate } from '../features/swr/StaleWhileRevalidate.js';
import { RateLimiter } from '../features/ratelimit/RateLimiter.js';

/**
 * Main FetchPlus class that orchestrates caching and interceptors
 */
export class FetchPlus {
    private config: Omit<Required<FetchPlusConfig>, 'retry' | 'deduplication' | 'timeout' | 'offline' | 'staleWhileRevalidate' | 'rateLimit'> & { retry?: RetryConfig | false; deduplication?: DeduplicationConfig; timeout?: TimeoutConfig; offline?: OfflineConfig; staleWhileRevalidate?: StaleWhileRevalidateConfig; rateLimit?: RateLimitConfig };
    private interceptors: InterceptorManager;
    private syncManager: CacheSyncManager | null = null;
    private deduplicationManager: DeduplicationManager | null = null;
    private offlineManager: OfflineManager | null = null;
    private rateLimiter: RateLimiter | null = null;
    private originalFetch: typeof fetch;
    private isInitialized = false;

    constructor(config: FetchPlusConfig = {}) {
        if (typeof globalThis.fetch === 'function') {
            this.originalFetch = globalThis.fetch.bind(globalThis);
        } else {
            this.originalFetch = (() => {
                throw new Error('globalThis.fetch is not available. Ensure a fetch polyfill is loaded before using FetchPlus.');
            }) as typeof fetch;
        }
        this.interceptors = new InterceptorManager();

        // Set defaults
        this.config = {
            cache: config.cache || new CacheStorageCache(config.cacheName),
            cacheOptions: config.cacheOptions || {},
            enableCaching: config.enableCaching !== false,
            cacheableMethods: config.cacheableMethods || ['GET'],
            replaceGlobalFetch: config.replaceGlobalFetch !== false,
            cacheName: config.cacheName || 'fetchplus-v1',
            enableSync: config.enableSync || false,
            syncChannelName: config.syncChannelName || 'fetchplus-sync',
            retry: config.retry,
            deduplication: config.deduplication,
            timeout: config.timeout,
            offline: config.offline,
            staleWhileRevalidate: config.staleWhileRevalidate,
            rateLimit: config.rateLimit,
        };

        // Initialize sync if enabled
        if (this.config.enableSync) {
            this.initSync();
        }

        // Initialize deduplication if enabled
        if (this.config.deduplication?.enabled) {
            this.deduplicationManager = new DeduplicationManager(this.config.deduplication);
        }

        // Initialize offline manager if enabled
        if (this.config.offline?.enabled) {
            this.offlineManager = new OfflineManager(this.config.offline, this.originalFetch);
        }

        // Initialize rate limiter if enabled
        if (this.config.rateLimit?.enabled) {
            this.rateLimiter = new RateLimiter(this.config.rateLimit);
        }
    }

    /**
     * Initialize cross-tab sync
     */
    private initSync(): void {
        this.syncManager = new CacheSyncManager(this.config.syncChannelName);

        // Listen for sync events from other tabs
        this.syncManager.addListener('main', async (message) => {
            const cache = this.config.cache;

            switch (message.type) {
                case 'delete':
                    if (message.key) {
                        await cache.delete(message.key);
                    }
                    break;
                case 'clear':
                    await cache.clear();
                    break;
                // 'set' events don't need cache action - other tabs will fetch independently
            }
        });
    }

    /**
     * Initialize FetchPlus and optionally replace global fetch
     */
    init(config?: FetchPlusConfig): void {
        if (this.isInitialized) {
            console.warn('FetchPlus already initialized');
            return;
        }

        // Update config if provided
        if (config) {
            Object.assign(this.config, config);

            // Initialize or close sync based on updated config
            if (config.enableSync && !this.syncManager) {
                this.initSync();
            } else if (config.enableSync === false && this.syncManager) {
                this.syncManager.close();
                this.syncManager = null;
            }

            // Initialize or clear deduplication based on updated config
            if (config.deduplication?.enabled && !this.deduplicationManager) {
                this.deduplicationManager = new DeduplicationManager(config.deduplication);
            } else if (config.deduplication?.enabled === false && this.deduplicationManager) {
                this.deduplicationManager.clearAll();
                this.deduplicationManager = null;
            }

            // Initialize or clear offline manager based on updated config
            if (config.offline?.enabled && !this.offlineManager) {
                this.offlineManager = new OfflineManager(config.offline, this.originalFetch);
            } else if (config.offline?.enabled === false && this.offlineManager) {
                this.offlineManager.destroy();
                this.offlineManager = null;
            }

            // Initialize or clear rate limiter based on updated config
            if (config.rateLimit?.enabled && !this.rateLimiter) {
                this.rateLimiter = new RateLimiter(config.rateLimit);
            } else if (config.rateLimit?.enabled === false && this.rateLimiter) {
                this.rateLimiter.clearQueues();
                this.rateLimiter = null;
            }
        }

        // Replace global fetch if enabled
        if (this.config.replaceGlobalFetch) {
            globalThis.fetch = this.fetch.bind(this) as typeof fetch;
        }

        this.isInitialized = true;
    }

    /**
     * Enhanced fetch function with caching and interceptors
     * 100% backward compatible with native fetch API
     */
    fetch = async (
        input: RequestInfo | URL,
        init?: FetchPlusRequestInit
    ): Promise<Response> => {
        // Execute fetch logic (interceptors run here, dedup happens inside)
        // Timeout is handled inside executeCoreFetch
        return await this.executeFetch(input, init);
    };

    /**
     * Internal fetch execution logic
     */
    private async executeFetch(
        input: RequestInfo | URL,
        init?: FetchPlusRequestInit
    ): Promise<Response> {
        try {
            // Execute request interceptors unless skipped
            let processedInput = input;
            let processedInit = init;

            if (!init?.skipInterceptors) {
                const intercepted = await this.interceptors.executeRequestInterceptors(input, init);
                processedInput = intercepted.input;
                processedInit = intercepted.init as FetchPlusRequestInit | undefined;
            }

            // Strip rate-limit-specific properties from init
            const priority = processedInit?.priority || 'normal';
            const initWithoutRateLimit = processedInit ? { ...processedInit } : undefined;
            if (initWithoutRateLimit) {
                if ('priority' in initWithoutRateLimit) {
                    delete initWithoutRateLimit.priority;
                }
                if ('bypassRateLimit' in initWithoutRateLimit) {
                    delete initWithoutRateLimit.bypassRateLimit;
                }
            }

            // Check if rate limiting should be applied (after interceptors, before dedup/timeout/offline/cache/retry)
            const shouldRateLimit = processedInit?.bypassRateLimit !== true && this.rateLimiter !== null;

            let response: Response;

            if (shouldRateLimit) {
                // Execute through rate limiter, which wraps dedup + core fetch
                response = await this.rateLimiter!.executeWithRateLimit(
                    processedInput,
                    initWithoutRateLimit,
                    async () => {
                        return await this.executeWithDedup(processedInput, initWithoutRateLimit);
                    },
                    priority
                );
            } else {
                // No rate limiting — go through dedup + core fetch directly
                response = await this.executeWithDedup(processedInput, initWithoutRateLimit);
            }

            // Execute response interceptors
            if (!init?.skipInterceptors) {
                return await this.interceptors.executeResponseInterceptors(response);
            }

            return response;
        } catch (error) {
            // Execute error interceptors
            if (!init?.skipInterceptors) {
                return await this.interceptors.executeErrorInterceptors(error as Error);
            }
            throw error;
        }
    }

    /**
     * Execute with deduplication (if enabled) then core fetch
     */
    private async executeWithDedup(
        processedInput: RequestInfo | URL,
        processedInit?: FetchPlusRequestInit
    ): Promise<Response> {
        // Check if deduplication should be applied
        if (processedInit?.deduplicate === true && !this.deduplicationManager) {
            this.deduplicationManager = new DeduplicationManager();
        }

        const shouldDeduplicate =
            processedInit?.deduplicate !== false &&
            this.deduplicationManager !== null;

        if (shouldDeduplicate) {
            // Strip deduplicate property from init before processing
            const initWithoutDedup = processedInit ? { ...processedInit } : undefined;
            if (initWithoutDedup && 'deduplicate' in initWithoutDedup) {
                delete initWithoutDedup.deduplicate;
            }

            return await this.deduplicationManager!.deduplicate(
                processedInput,
                initWithoutDedup,
                async () => {
                    return await this.executeCoreFetch(processedInput, initWithoutDedup);
                }
            );
        }

        return await this.executeCoreFetch(processedInput, processedInit);
    }

    /**
     * Core fetch logic (cache + retry + network, no interceptors)
     */
    private async executeCoreFetch(
        processedInput: RequestInfo | URL,
        processedInit?: FetchPlusRequestInit
    ): Promise<Response> {
        // Determine timeout value
        const timeoutMs = TimeoutManager.getTimeoutValue(
            processedInit?.timeout,
            this.config.timeout?.defaultTimeout
        );

        // If timeout is set and positive, wrap the core fetch with timeout
        // 0 or negative means disabled, null means not configured
        if (timeoutMs !== null && timeoutMs > 0) {
            return await TimeoutManager.executeWithTimeout(
                async (signal?: AbortSignal) => {
                    // Create new init with the combined signal
                    const initWithSignal: FetchPlusRequestInit | undefined = processedInit
                        ? { ...processedInit, signal }
                        : signal ? { signal } : undefined;

                    // Execute the core fetch with the combined signal
                    return await this.executeCoreFetchWithoutTimeout(processedInput, initWithSignal);
                },
                timeoutMs,
                processedInit?.signal ?? undefined
            );
        }

        // Execute core fetch without timeout
        return await this.executeCoreFetchWithoutTimeout(processedInput, processedInit);
    }

    /**
     * Core fetch logic without timeout wrapper
     */
    private async executeCoreFetchWithoutTimeout(
        processedInput: RequestInfo | URL,
        processedInit?: FetchPlusRequestInit
    ): Promise<Response> {
        // Get the cache to use for this request
        const cache = this.getCacheForRequest(processedInit);

        // If offline manager is enabled, wrap the entire fetch logic with offline handling
        if (this.offlineManager && cache) {
            // Strip offline-specific properties from init before passing to core logic
            const initWithoutOffline = processedInit ? { ...processedInit } : undefined;
            if (initWithoutOffline) {
                if ('offlineStrategy' in initWithoutOffline) {
                    delete initWithoutOffline.offlineStrategy;
                }
                if ('queueIfOffline' in initWithoutOffline) {
                    delete initWithoutOffline.queueIfOffline;
                }
            }

            return await this.offlineManager.executeWithOfflineHandling(
                processedInput,
                initWithoutOffline,
                cache,
                async () => {
                    return await this.executeCoreFetchLogic(processedInput, initWithoutOffline);
                },
                processedInit?.offlineStrategy,
                processedInit?.queueIfOffline
            );
        }

        // No offline manager - execute core fetch logic directly
        return await this.executeCoreFetchLogic(processedInput, processedInit);
    }

    /**
     * Core fetch logic (cache + retry + network)
     */
    private async executeCoreFetchLogic(
        processedInput: RequestInfo | URL,
        processedInit?: FetchPlusRequestInit
    ): Promise<Response> {

        // Determine if caching is enabled for this request
        const shouldCache = this.shouldCacheRequest(processedInput, processedInit);

        // Determine if sync is enabled for this request
        const shouldSync = this.shouldSync(processedInit);

        // Get the cache to use for this request
        const cache = this.getCacheForRequest(processedInit);

        // Check if SWR should be applied (must have caching enabled and not forcing refresh)
        const swrConfig = StaleWhileRevalidate.mergeConfigs(
            this.config.staleWhileRevalidate,
            processedInit?.staleWhileRevalidate
        );

        if (shouldCache && cache && !processedInit?.forceRefresh && swrConfig && swrConfig.enabled) {
            // SWR is enabled - use SWR strategy
            const swrManager = new StaleWhileRevalidate(swrConfig);
            const cacheKey = generateCacheKey(processedInput, processedInit);
            const cacheOptions = this.getCacheOptionsForRequest(processedInit);

            // Create fetchFn that does the full fetch + cache pipeline
            const fetchFn = async () => {
                // This is the fetch logic (retry + network + cache)
                return await this.executeFetchAndCache(
                    processedInput,
                    processedInit,
                    cache,
                    shouldSync,
                    cacheKey,
                    cacheOptions
                );
            };

            return await swrManager.executeWithSWR(cacheKey, cache, fetchFn, cacheOptions);
        }

        // Try to get from cache if caching is enabled AND not forcing refresh
        if (shouldCache && cache && !processedInit?.forceRefresh) {
            const cacheKey = generateCacheKey(processedInput, processedInit);
            const cachedResponse = await cache.get(cacheKey);

            if (cachedResponse) {
                return cachedResponse;
            }
        }

        // Regular cache miss or no cache - do normal fetch
        const cacheKey = generateCacheKey(processedInput, processedInit);
        const cacheOptions = this.getCacheOptionsForRequest(processedInit);

        return await this.executeFetchAndCache(
            processedInput,
            processedInit,
            cache,
            shouldSync,
            cacheKey,
            cacheOptions
        );
    }

    /**
     * Execute fetch with retry and cache the response
     */
    private async executeFetchAndCache(
        processedInput: RequestInfo | URL,
        processedInit: FetchPlusRequestInit | undefined,
        cache: CacheInterface | null,
        shouldSync: boolean,
        cacheKey: string,
        cacheOptions: CacheOptions
    ): Promise<Response> {
        // Determine if caching is enabled for this request
        const shouldCache = this.shouldCacheRequest(processedInput, processedInit);

        // Determine retry config
        const retryConfig = RetryManager.mergeConfigs(
            this.config.retry,
            processedInit?.retry
        );

        // Strip retry, deduplicate, timeout, offline, staleWhileRevalidate, and rateLimit properties from init before passing to native fetch
        const finalInit = processedInit ? { ...processedInit } : undefined;
        if (finalInit) {
            if ('retry' in finalInit) {
                delete finalInit.retry;
            }
            if ('deduplicate' in finalInit) {
                delete finalInit.deduplicate;
            }
            if ('timeout' in finalInit) {
                delete finalInit.timeout;
            }
            if ('offlineStrategy' in finalInit) {
                delete finalInit.offlineStrategy;
            }
            if ('queueIfOffline' in finalInit) {
                delete finalInit.queueIfOffline;
            }
            if ('staleWhileRevalidate' in finalInit) {
                delete finalInit.staleWhileRevalidate;
            }
            if ('priority' in finalInit) {
                delete finalInit.priority;
            }
            if ('bypassRateLimit' in finalInit) {
                delete finalInit.bypassRateLimit;
            }
        }

        // Create retry manager if needed
        const retryManager = retryConfig ? new RetryManager(retryConfig) : null;

        // Make the actual fetch call (either cache miss or forceRefresh)
        // Wrap in retry logic if retry is enabled
        const fetchFn = async () => {
            return await this.originalFetch(processedInput, finalInit);
        };

        const response = retryManager
            ? await retryManager.executeWithRetry(fetchFn, finalInit?.signal || undefined)
            : await fetchFn();

        // Clone response before caching (to avoid consuming the stream)
        const responseToCache = response.clone();

        // Cache the response if applicable
        if (shouldCache && cache && isCacheable(response)) {
            // Include metadata with cachedAt timestamp if not already provided
            const finalCacheOptions = {
                ...cacheOptions,
                metadata: cacheOptions.metadata || {
                    cachedAt: Date.now(),
                    revalidating: false,
                },
            };

            await cache.set(cacheKey, responseToCache, finalCacheOptions);

            // Broadcast cache update to other tabs if sync is enabled
            if (shouldSync && this.syncManager) {
                this.syncManager.broadcast('set', cacheKey);
            }
        }

        return response;
    }

    /**
     * Determine if a request should be cached
     */
    private shouldCacheRequest(input: RequestInfo | URL, init?: FetchPlusRequestInit): boolean {
        // Check if caching is explicitly disabled for this request
        if (init?.fetchPlusCache === false) {
            return false;
        }

        // Check if caching is globally disabled
        if (!this.config.enableCaching) {
            return false;
        }

        // Get the request method
        let method = 'GET';
        if (init?.method) {
            method = init.method.toUpperCase();
        } else if (input instanceof Request) {
            method = input.method.toUpperCase();
        }

        // Check if method is cacheable
        return this.config.cacheableMethods.includes(method);
    }

    /**
     * Determine if sync should be enabled for this request
     */
    private shouldSync(init?: FetchPlusRequestInit): boolean {
        // Per-request override takes precedence
        if (init?.enableSync !== undefined) {
            return init.enableSync;
        }

        // Fall back to global config
        return this.config.enableSync && this.syncManager !== null;
    }

    /**
     * Get the cache implementation to use for this request
     */
    private getCacheForRequest(init?: FetchPlusRequestInit): CacheInterface | null {
        // If a cache implementation is provided for this request, use it
        if (init?.fetchPlusCache && typeof init.fetchPlusCache === 'object' && 'get' in init.fetchPlusCache) {
            return init.fetchPlusCache as CacheInterface;
        }

        // Otherwise use the default cache
        return this.config.cache;
    }

    /**
     * Get cache options for this request
     */
    private getCacheOptionsForRequest(init?: FetchPlusRequestInit): CacheOptions {
        // If cache options are provided for this request, use them
        if (init?.fetchPlusCache && typeof init.fetchPlusCache === 'object' && !('get' in init.fetchPlusCache)) {
            return { ...this.config.cacheOptions, ...init.fetchPlusCache };
        }

        // Otherwise use the default cache options
        return this.config.cacheOptions;
    }

    /**
     * Get the interceptor manager for adding/removing interceptors
     */
    getInterceptors(): InterceptorManager {
        return this.interceptors;
    }

    /**
     * Clear all caches
     */
    async clearCache(): Promise<void> {
        await this.config.cache.clear();

        // Broadcast clear to other tabs if sync is enabled
        if (this.syncManager) {
            this.syncManager.broadcast('clear');
        }
    }

    /**
     * Delete a specific cache entry
     */
    async deleteCache(key: string): Promise<boolean> {
        const deleted = await this.config.cache.delete(key);

        // Broadcast delete to other tabs if sync is enabled
        if (deleted && this.syncManager) {
            this.syncManager.broadcast('delete', key);
        }

        return deleted;
    }

    /**
     * Check if sync is available and enabled
     */
    isSyncAvailable(): boolean {
        return this.syncManager !== null && this.syncManager.isAvailable();
    }

    /**
     * Restore original fetch function
     */
    restore(): void {
        if (this.config.replaceGlobalFetch) {
            globalThis.fetch = this.originalFetch;
        }

        // Close sync channel
        if (this.syncManager) {
            this.syncManager.close();
            this.syncManager = null;
        }

        // Clear deduplication manager
        if (this.deduplicationManager) {
            this.deduplicationManager.clearAll();
            this.deduplicationManager = null;
        }

        // Destroy offline manager
        if (this.offlineManager) {
            this.offlineManager.destroy();
            this.offlineManager = null;
        }

        // Clear rate limiter
        if (this.rateLimiter) {
            this.rateLimiter.clearQueues();
            this.rateLimiter = null;
        }

        this.isInitialized = false;
    }
}
