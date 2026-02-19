// Main exports
export { FetchPlus } from './core/FetchPlus.js';

// Default cache implementation (imported automatically)
export { CacheStorageCache } from './cache/CacheStorageCache.js';

// Alternative cache implementations (require explicit import)
export { SessionStorageCache } from './cache/SessionStorageCache.js';
export { LocalStorageCache } from './cache/LocalStorageCache.js';
export { InMemoryCache } from './cache/InMemoryCache.js';

// Interceptor manager
export { InterceptorManager } from './interceptors/InterceptorManager.js';

// Cache sync manager
export { CacheSyncManager } from './sync/CacheSyncManager.js';

// Retry manager
export { RetryManager } from './features/retry/RetryManager.js';

// Deduplication manager
export { DeduplicationManager } from './features/dedup/DeduplicationManager.js';

// Errors
export { FetchPlusError, RetryError } from './errors/index.js';

// Types
export type {
    CacheInterface,
    CacheOptions,
    CachePersistence,
    FetchPlusConfig,
    FetchPlusRequestInit,
    RequestInterceptor,
    ResponseInterceptor,
    ErrorInterceptor,
    InterceptorId,
    BackoffStrategy,
    RetryConfig,
    RetryState,
    RetryResult,
    DeduplicationConfig,
    InFlightRequest,
} from './types/index.js';

// Create and export a default instance
import { FetchPlus } from './core/FetchPlus.js';
export default new FetchPlus();
