import type { CacheInterface, CacheOptions, CacheEntryMetadata } from '../types/index.js';
import { safeJSONParse } from '../utils/safeJSON.js';

const TTL_HEADER = 'X-FetchPlus-Expires';
const METADATA_HEADER = 'X-FetchPlus-Metadata';

/**
 * Sanitize metadata from response headers to prevent prototype pollution
 */
function sanitizeMetadata(raw: any): CacheEntryMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    cachedAt: typeof raw.cachedAt === 'number' ? raw.cachedAt : Date.now(),
    revalidating: typeof raw.revalidating === 'boolean' ? raw.revalidating : false,
  };
}

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

            // Add TTL or metadata headers if specified
            if (options?.ttl || options?.metadata) {
                const headers = new Headers(response.headers);

                if (options.ttl) {
                    const expiresAt = Date.now() + options.ttl;
                    headers.set(TTL_HEADER, expiresAt.toString());
                }

                if (options.metadata) {
                    headers.set(METADATA_HEADER, JSON.stringify(options.metadata));
                }

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

    async getMetadata(key: string): Promise<CacheEntryMetadata | null> {
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

            const metadataHeader = cached.headers.get(METADATA_HEADER);
            if (!metadataHeader) {
                return null;
            }

            const parsed = safeJSONParse<any>(metadataHeader);
            return sanitizeMetadata(parsed);
        } catch {
            return null;
        }
    }

    async setMetadata(key: string, metadata: CacheEntryMetadata): Promise<void> {
        const cache = await this.getCache();
        if (!cache) {
            return;
        }

        try {
            const [method, url] = this.parseKey(key);
            const request = new Request(url, { method });
            const cached = await cache.match(request);

            if (!cached) {
                return;
            }

            // Create new response with updated metadata header
            const headers = new Headers(cached.headers);
            headers.set(METADATA_HEADER, JSON.stringify(metadata));

            const body = await cached.arrayBuffer();
            const updatedResponse = new Response(body, {
                status: cached.status,
                statusText: cached.statusText,
                headers,
            });

            await cache.put(request, updatedResponse);
        } catch (error) {
            console.warn('Failed to set metadata in Cache Storage:', error);
        }
    }
}
