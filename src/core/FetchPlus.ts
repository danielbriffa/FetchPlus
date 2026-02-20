import type { CacheInterface, FetchPlusConfig, FetchPlusRequestInit, CacheOptions, RetryConfig, DeduplicationConfig, TimeoutConfig, OfflineConfig } from '../types/index.js';
import { InterceptorManager } from '../interceptors/InterceptorManager.js';
import { CacheStorageCache } from '../cache/CacheStorageCache.js';
import { generateCacheKey } from '../utils/cacheKey.js';
import { isCacheable } from '../utils/responseClone.js';
import { CacheSyncManager } from '../sync/CacheSyncManager.js';
import { RetryManager } from '../features/retry/RetryManager.js';
import { DeduplicationManager } from '../features/dedup/DeduplicationManager.js';
import { TimeoutManager } from '../features/timeout/TimeoutManager.js';
import { OfflineManager } from '../features/offline/OfflineManager.js';

/**
 * Main FetchPlus class that orchestrates caching and interceptors
 */
export class FetchPlus {
    private config: Omit<Required<FetchPlusConfig>, 'retry' | 'deduplication' | 'timeout' | 'offline'> & { retry?: RetryConfig | false; deduplication?: DeduplicationConfig; timeout?: TimeoutConfig; offline?: OfflineConfig };
    private interceptors: InterceptorManager;
    private syncManager: CacheSyncManager | null = null;
    private deduplicationManager: DeduplicationManager | null = null;
    private offlineManager: OfflineManager | null = null;
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

            // Check if deduplication should be applied (after interceptors)
            // If deduplicate: true is explicitly set, create a manager on-demand
            if (processedInit?.deduplicate === true && !this.deduplicationManager) {
                this.deduplicationManager = new DeduplicationManager();
            }

            const shouldDeduplicate =
                processedInit?.deduplicate !== false &&
                this.deduplicationManager !== null;

            // If deduplication is enabled, wrap the core fetch logic (cache + retry + network)
            if (shouldDeduplicate) {
                // Strip deduplicate property from init before processing
                const initWithoutDedup = processedInit ? { ...processedInit } : undefined;
                if (initWithoutDedup && 'deduplicate' in initWithoutDedup) {
                    delete initWithoutDedup.deduplicate;
                }

                const response = await this.deduplicationManager!.deduplicate(
                    processedInput,
                    initWithoutDedup,
                    async () => {
                        return await this.executeCoreFetch(processedInput, initWithoutDedup);
                    }
                );

                // Execute response interceptors
                if (!init?.skipInterceptors) {
                    return await this.interceptors.executeResponseInterceptors(response);
                }

                return response;
            }

            // Otherwise, execute core fetch directly
            const response = await this.executeCoreFetch(processedInput, processedInit);

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

        // Try to get from cache if caching is enabled AND not forcing refresh
        if (shouldCache && cache && !processedInit?.forceRefresh) {
            const cacheKey = generateCacheKey(processedInput, processedInit);
            const cachedResponse = await cache.get(cacheKey);

            if (cachedResponse) {
                return cachedResponse;
            }
        }

        // Determine retry config
        const retryConfig = RetryManager.mergeConfigs(
            this.config.retry,
            processedInit?.retry
        );

        // Strip retry, deduplicate, timeout, and offline properties from init before passing to native fetch
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
            const cacheKey = generateCacheKey(processedInput, processedInit);
            const cacheOptions = this.getCacheOptionsForRequest(processedInit);
            await cache.set(cacheKey, responseToCache, cacheOptions);

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

        this.isInitialized = false;
    }
}
