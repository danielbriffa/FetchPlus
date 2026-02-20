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

// Timeout manager
export { TimeoutManager } from './features/timeout/TimeoutManager.js';

// Offline manager
export { OfflineManager } from './features/offline/OfflineManager.js';

// Errors
export { FetchPlusError, RetryError, TimeoutError } from './errors/index.js';

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
    TimeoutConfig,
    OfflineConfig,
    OfflineStrategy,
    QueuedRequest,
} from './types/index.js';

// Create and export a default instance
import { FetchPlus } from './core/FetchPlus.js';
export default new FetchPlus();
