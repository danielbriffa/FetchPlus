import type { CacheInterface, CacheOptions, CacheEntryMetadata } from '../types/index.js';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

interface CachedItem {
    response: {
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: string;
    };
    expiresAt?: number;
    metadata?: CacheEntryMetadata;
}

/**
 * Local storage cache implementation
 * Cache persists across browser sessions until explicitly cleared
 */
export class LocalStorageCache implements CacheInterface {
    private prefix = 'fetchplus:';

    async get(key: string): Promise<Response | null> {
        if (typeof localStorage === 'undefined') {
            return null;
        }

        try {
            const data = localStorage.getItem(this.prefix + key);

            if (!data) {
                return null;
            }

            const cached: CachedItem = JSON.parse(data);

            // Check if expired
            if (cached.expiresAt && Date.now() > cached.expiresAt) {
                localStorage.removeItem(this.prefix + key);
                return null;
            }

            // Reconstruct Response from stored data
            const bodyBuffer = base64ToArrayBuffer(cached.response.body);
            return new Response(bodyBuffer, {
                status: cached.response.status,
                statusText: cached.response.statusText,
                headers: new Headers(cached.response.headers),
            });
        } catch (error) {
            // Invalid cache data, remove it
            localStorage.removeItem(this.prefix + key);
            return null;
        }
    }

    async set(key: string, response: Response, options?: CacheOptions): Promise<void> {
        if (typeof localStorage === 'undefined') {
            return;
        }

        try {
            // Clone and read the response body
            const cloned = response.clone();
            const bodyBuffer = await cloned.arrayBuffer();
            const body = arrayBufferToBase64(bodyBuffer);

            // Convert headers to plain object
            const headers: Record<string, string> = {};
            cloned.headers.forEach((value, key) => {
                headers[key] = value;
            });

            const expiresAt = options?.ttl ? Date.now() + options.ttl : undefined;

            const cached: CachedItem = {
                response: {
                    status: cloned.status,
                    statusText: cloned.statusText,
                    headers,
                    body,
                },
                expiresAt,
                metadata: options?.metadata,
            };

            localStorage.setItem(this.prefix + key, JSON.stringify(cached));
        } catch (error) {
            // Storage quota exceeded or other error, silently fail
            console.warn('Failed to cache in localStorage:', error);
        }
    }

    async delete(key: string): Promise<boolean> {
        if (typeof localStorage === 'undefined') {
            return false;
        }

        const existed = localStorage.getItem(this.prefix + key) !== null;
        localStorage.removeItem(this.prefix + key);
        return existed;
    }

    async clear(): Promise<void> {
        if (typeof localStorage === 'undefined') {
            return;
        }

        // Remove only fetchplus keys
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(this.prefix)) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach((key) => localStorage.removeItem(key));
    }

    async has(key: string): Promise<boolean> {
        if (typeof localStorage === 'undefined') {
            return false;
        }

        try {
            const data = localStorage.getItem(this.prefix + key);

            if (!data) {
                return false;
            }

            const cached: CachedItem = JSON.parse(data);

            // Check if expired
            if (cached.expiresAt && Date.now() > cached.expiresAt) {
                localStorage.removeItem(this.prefix + key);
                return false;
            }

            return true;
        } catch {
            return false;
        }
    }

    async getMetadata(key: string): Promise<CacheEntryMetadata | null> {
        if (typeof localStorage === 'undefined') {
            return null;
        }

        try {
            const data = localStorage.getItem(this.prefix + key);
            if (!data) {
                return null;
            }

            const cached: CachedItem = JSON.parse(data);
            return cached.metadata || null;
        } catch {
            return null;
        }
    }

    async setMetadata(key: string, metadata: CacheEntryMetadata): Promise<void> {
        if (typeof localStorage === 'undefined') {
            return;
        }

        try {
            const data = localStorage.getItem(this.prefix + key);
            if (!data) {
                return;
            }

            const cached: CachedItem = JSON.parse(data);
            cached.metadata = metadata;
            localStorage.setItem(this.prefix + key, JSON.stringify(cached));
        } catch (error) {
            console.warn('Failed to set metadata in localStorage:', error);
        }
    }
}
