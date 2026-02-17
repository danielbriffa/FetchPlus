import type { CacheInterface, CacheOptions } from '../types/index.js';

/**
 * In-memory cache implementation using a Map
 * Cache is cleared on page reload
 */
export class InMemoryCache implements CacheInterface {
    private cache: Map<string, { response: Response; expiresAt?: number; lastAccessed: number }> = new Map();
    private maxEntries: number;

    constructor(maxEntries: number = 500) {
        this.maxEntries = maxEntries;
    }

    async get(key: string): Promise<Response | null> {
        const cached = this.cache.get(key);

        if (!cached) {
            return null;
        }

        // Check if expired
        if (cached.expiresAt && Date.now() > cached.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        // Update last accessed time
        cached.lastAccessed = Date.now();

        // Clone the response to prevent stream consumption
        return cached.response.clone();
    }

    async set(key: string, response: Response, options?: CacheOptions): Promise<void> {
        const expiresAt = options?.ttl ? Date.now() + options.ttl : undefined;

        // Check if we need to evict before adding new entry
        if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
            this.evictOldest();
        }

        // Clone to store the response
        this.cache.set(key, {
            response: response.clone(),
            expiresAt,
            lastAccessed: Date.now(),
        });
    }

    async delete(key: string): Promise<boolean> {
        return this.cache.delete(key);
    }

    async clear(): Promise<void> {
        this.cache.clear();
    }

    async has(key: string): Promise<boolean> {
        const cached = this.cache.get(key);

        if (!cached) {
            return false;
        }

        // Check if expired
        if (cached.expiresAt && Date.now() > cached.expiresAt) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    private evictOldest(): void {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [key, value] of this.cache.entries()) {
            if (value.lastAccessed < oldestTime) {
                oldestTime = value.lastAccessed;
                oldestKey = key;
            }
        }
        if (oldestKey !== null) {
            this.cache.delete(oldestKey);
        }
    }
}
