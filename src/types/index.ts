import type { RetryConfig } from './retry.js';

/**
 * Cache persistence strategy
 */
export type CachePersistence = 'forever' | 'session' | 'memory';

/**
 * Options for caching a response
 */
export interface CacheOptions {
    /** Time-to-live in milliseconds. If not set, cache persists based on persistence type */
    ttl?: number;
    /** Cache persistence strategy */
    persistence?: CachePersistence;
}

/**
 * Standard cache interface that all cache implementations must follow
 */
export interface CacheInterface {
    /**
     * Get a cached response by key
     * @param key Cache key
     * @returns Cached response or null if not found/expired
     */
    get(key: string): Promise<Response | null>;

    /**
     * Store a response in cache
     * @param key Cache key
     * @param response Response to cache
     * @param options Cache options
     */
    set(key: string, response: Response, options?: CacheOptions): Promise<void>;

    /**
     * Delete a cached response
     * @param key Cache key
     * @returns true if deleted, false if not found
     */
    delete(key: string): Promise<boolean>;

    /**
     * Clear all cached responses
     */
    clear(): Promise<void>;

    /**
     * Check if a key exists in cache
     * @param key Cache key
     * @returns true if exists and not expired
     */
    has(key: string): Promise<boolean>;
}

/**
 * Request interceptor function
 */
export type RequestInterceptor = (
    input: RequestInfo | URL,
    init?: RequestInit
) => RequestInfo | URL | Promise<RequestInfo | URL> | { input: RequestInfo | URL; init?: RequestInit };

/**
 * Response interceptor function
 */
export type ResponseInterceptor = (response: Response) => Response | Promise<Response>;

/**
 * Error interceptor function
 */
export type ErrorInterceptor = (error: Error) => Response | Promise<Response> | void | Promise<void>;

/**
 * Interceptor ID for removal
 */
export type InterceptorId = number;

/**
 * FetchPlus configuration options
 */
export interface FetchPlusConfig {
    /**
     * Cache implementation to use
     * @default CacheStorageCache
     */
    cache?: CacheInterface;

    /**
     * Default cache options for all requests
     */
    cacheOptions?: CacheOptions;

    /**
     * Enable caching by default for GET requests
     * @default true
     */
    enableCaching?: boolean;

    /**
     * Only cache requests with these HTTP methods
     * @default ['GET']
     */
    cacheableMethods?: string[];

    /**
     * Replace global fetch function
     * @default true
     */
    replaceGlobalFetch?: boolean;

    /**
     * Cache name for Cache Storage API
     * @default 'fetchplus-v1'
     */
    cacheName?: string;

    /**
     * Enable cross-tab cache synchronization via BroadcastChannel
     * When enabled, cache updates in one tab are reflected in all other tabs
     * @default false
     */
    enableSync?: boolean;

    /**
     * Custom sync channel name for BroadcastChannel
     * @default 'fetchplus-sync'
     */
    syncChannelName?: string;

    /**
     * Global retry configuration
     * Set to false to disable retries globally
     * @default undefined (no retries)
     */
    retry?: RetryConfig | false;
}

/**
 * Extended request init with FetchPlus options
 * Uses Omit to avoid conflict with native RequestInit.cache property
 */
export interface FetchPlusRequestInit extends Omit<RequestInit, 'cache'> {
    /**
     * Cache configuration for this specific request
     * - CacheOptions: Use default cache with these options
     * - CacheInterface: Use this cache implementation for this request
     * - false: Disable caching for this request
     */
    fetchPlusCache?: CacheOptions | CacheInterface | false;

    /**
     * Skip interceptors for this request
     */
    skipInterceptors?: boolean;

    /**
     * Enable/disable cross-tab sync for this specific request
     * Overrides global enableSync setting
     */
    enableSync?: boolean;

    /**
     * Force a fresh network request, bypassing cache read
     * The fresh response will still be cached for future requests
     * Useful for implementing "pull to refresh" functionality
     * @default false
     */
    forceRefresh?: boolean;

    /**
     * Native cache mode (from standard RequestInit)
     * Preserved for full backward compatibility with standard fetch
     */
    cache?: RequestCache;

    /**
     * Retry configuration for this specific request
     * - RetryConfig: Enable retries with these options
     * - false: Disable retries for this request
     * - undefined: Use global retry config
     */
    retry?: RetryConfig | false;
}

// Re-export retry types
export type { BackoffStrategy, RetryConfig, RetryState, RetryResult } from './retry.js';
