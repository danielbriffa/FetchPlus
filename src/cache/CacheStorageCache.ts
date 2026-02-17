import type { CacheInterface, CacheOptions } from '../types/index.js';

const TTL_HEADER = 'X-FetchPlus-Expires';

/**
 * Cache Storage API implementation
 * Provides persistent caching across browser sessions
 */
export class CacheStorageCache implements CacheInterface {
    private cacheName: string;

    constructor(cacheName: string = 'fetchplus-v1') {
        this.cacheName = cacheName;
    }

    private async getCache(): Promise<Cache | null> {
        if (typeof caches === 'undefined') {
            return null;
        }
        return caches.open(this.cacheName);
    }

    private parseKey(key: string): [string, string] {
        const colonIndex = key.indexOf(':');
        if (colonIndex === -1) {
            return ['GET', key];
        }
        const method = key.substring(0, colonIndex);
        const url = key.substring(colonIndex + 1);
        return [method, url];
    }

    async get(key: string): Promise<Response | null> {
        const cache = await this.getCache();
        if (!cache) {
            return null;
        }

        try {
            const [method, url] = this.parseKey(key);
            const request = new Request(url, { method });
            const cached = await cache.match(request);

            if (!cached) {
                return null;
            }

            // Check if expired using custom header
            const expiresHeader = cached.headers.get(TTL_HEADER);
            if (expiresHeader) {
                const expiresAt = parseInt(expiresHeader, 10);
                if (Date.now() > expiresAt) {
                    await cache.delete(request);
                    return null;
                }
            }

            return cached;
        } catch {
            return null;
        }
    }

    async set(key: string, response: Response, options?: CacheOptions): Promise<void> {
        const cache = await this.getCache();
        if (!cache) {
            return;
        }

        try {
            const [method, url] = this.parseKey(key);
            const request = new Request(url, { method });

            // Response is already cloned by the caller
            let responseToCache = response;

            // Add TTL header if specified
            if (options?.ttl) {
                const expiresAt = Date.now() + options.ttl;
                const headers = new Headers(response.headers);
                headers.set(TTL_HEADER, expiresAt.toString());

                // Create new response with updated headers
                const body = await response.arrayBuffer();
                responseToCache = new Response(body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers,
                });
            }

            await cache.put(request, responseToCache);
        } catch (error) {
            // Quota exceeded or other error, silently fail
            console.warn('Failed to cache in Cache Storage:', error);
        }
    }

    async delete(key: string): Promise<boolean> {
        const cache = await this.getCache();
        if (!cache) {
            return false;
        }

        const [method, url] = this.parseKey(key);
        const request = new Request(url, { method });
        return cache.delete(request);
    }

    async clear(): Promise<void> {
        if (typeof caches === 'undefined') {
            return;
        }

        await caches.delete(this.cacheName);
    }

    async has(key: string): Promise<boolean> {
        const cache = await this.getCache();
        if (!cache) {
            return false;
        }

        try {
            const [method, url] = this.parseKey(key);
            const request = new Request(url, { method });
            const cached = await cache.match(request);

            if (!cached) {
                return false;
            }

            // Check if expired
            const expiresHeader = cached.headers.get(TTL_HEADER);
            if (expiresHeader) {
                const expiresAt = parseInt(expiresHeader, 10);
                if (Date.now() > expiresAt) {
                    await cache.delete(request);
                    return false;
                }
            }

            return true;
        } catch {
            return false;
        }
    }
}
