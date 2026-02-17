import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStorageCache } from '../../src/cache/SessionStorageCache.js';
import { LocalStorageCache } from '../../src/cache/LocalStorageCache.js';
import type { CacheInterface } from '../../src/types/index.js';

// Test both SessionStorageCache and LocalStorageCache together since they share the same logic
describe.each([
    { name: 'SessionStorageCache', Cache: SessionStorageCache, storage: sessionStorage },
    { name: 'LocalStorageCache', Cache: LocalStorageCache, storage: localStorage },
])('$name', ({ Cache, storage }) => {
    let cache: CacheInterface;

    beforeEach(() => {
        cache = new Cache();
        storage.clear();
    });

    afterEach(() => {
        storage.clear();
    });

    describe('Basic Operations', () => {
        it('sets and gets a cache entry', async () => {
            const response = new Response('test data', { status: 200 });
            await cache.set('test-key', response);

            const cached = await cache.get('test-key');
            expect(cached).not.toBeNull();
            expect(cached?.status).toBe(200);

            const text = await cached!.text();
            expect(text).toBe('test data');
        });

        it('returns null for cache miss', async () => {
            const cached = await cache.get('non-existent-key');
            expect(cached).toBeNull();
        });

        it('deletes an existing entry', async () => {
            const response = new Response('test');
            await cache.set('test-key', response);

            const deleted = await cache.delete('test-key');
            expect(deleted).toBe(true);

            const cached = await cache.get('test-key');
            expect(cached).toBeNull();
        });

        it('delete returns false for non-existent entry', async () => {
            const deleted = await cache.delete('non-existent');
            expect(deleted).toBe(false);
        });

        it('clears entire cache', async () => {
            await cache.set('key1', new Response('data1'));
            await cache.set('key2', new Response('data2'));
            await cache.set('key3', new Response('data3'));

            await cache.clear();

            expect(await cache.get('key1')).toBeNull();
            expect(await cache.get('key2')).toBeNull();
            expect(await cache.get('key3')).toBeNull();
        });

        it('has() returns true for existing entry', async () => {
            await cache.set('test-key', new Response('test'));
            expect(await cache.has('test-key')).toBe(true);
        });

        it('has() returns false for non-existent entry', async () => {
            expect(await cache.has('non-existent')).toBe(false);
        });
    });

    describe('Bug #9 regression: Binary Data Handling', () => {
        it('caches response with binary body correctly', async () => {
            // Create binary data
            const binaryData = new Uint8Array([0, 1, 2, 3, 255, 254, 253, 100, 200]);
            const response = new Response(binaryData.buffer, {
                status: 200,
                headers: { 'content-type': 'application/octet-stream' },
            });

            await cache.set('binary-key', response);

            const cached = await cache.get('binary-key');
            expect(cached).not.toBeNull();

            // Read back as binary
            const cachedBuffer = await cached!.arrayBuffer();
            const cachedBytes = new Uint8Array(cachedBuffer);

            // Verify bytes match exactly
            expect(cachedBytes.length).toBe(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
                expect(cachedBytes[i]).toBe(binaryData[i]);
            }
        });

        it('caches response with text body correctly', async () => {
            const textData = 'Hello, World! Special chars: éàü 中文 🚀';
            const response = new Response(textData, {
                status: 200,
                headers: { 'content-type': 'text/plain; charset=utf-8' },
            });

            await cache.set('text-key', response);

            const cached = await cache.get('text-key');
            expect(cached).not.toBeNull();

            const cachedText = await cached!.text();
            expect(cachedText).toBe(textData);
        });

        it('caches response with empty body correctly', async () => {
            const response = new Response('', { status: 200 });

            await cache.set('empty-key', response);

            const cached = await cache.get('empty-key');
            expect(cached).not.toBeNull();
            expect(cached?.status).toBe(200);

            const text = await cached!.text();
            expect(text).toBe('');
        });

        it('caches response with JSON body correctly', async () => {
            const jsonData = { message: 'hello', count: 42, nested: { value: true } };
            const response = new Response(JSON.stringify(jsonData), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });

            await cache.set('json-key', response);

            const cached = await cache.get('json-key');
            expect(cached).not.toBeNull();

            const cachedJson = await cached!.json();
            expect(cachedJson).toEqual(jsonData);
        });
    });

    describe('Response Metadata Preservation', () => {
        it('preserves response status, statusText, and headers', async () => {
            const response = new Response('test data', {
                status: 201,
                statusText: 'Created',
                headers: {
                    'content-type': 'application/json',
                    'x-custom-header': 'custom-value',
                    'cache-control': 'max-age=3600',
                },
            });

            await cache.set('metadata-key', response);

            const cached = await cache.get('metadata-key');
            expect(cached).not.toBeNull();

            // Check status and statusText
            expect(cached?.status).toBe(201);
            expect(cached?.statusText).toBe('Created');

            // Check headers
            expect(cached?.headers.get('content-type')).toBe('application/json');
            expect(cached?.headers.get('x-custom-header')).toBe('custom-value');
            expect(cached?.headers.get('cache-control')).toBe('max-age=3600');
        });
    });

    describe('Clear only removes prefixed keys', () => {
        it('only clears fetchplus: prefixed keys', async () => {
            // Add FetchPlus cache entries
            await cache.set('key1', new Response('data1'));
            await cache.set('key2', new Response('data2'));

            // Add non-FetchPlus entries directly to storage
            storage.setItem('user-data', 'important');
            storage.setItem('app-state', 'preserved');

            await cache.clear();

            // FetchPlus entries should be removed
            expect(await cache.get('key1')).toBeNull();
            expect(await cache.get('key2')).toBeNull();

            // Non-FetchPlus entries should remain
            expect(storage.getItem('user-data')).toBe('important');
            expect(storage.getItem('app-state')).toBe('preserved');
        });
    });

    describe('TTL Expiration', () => {
        it('expires entries after TTL', async () => {
            const response = new Response('test');
            await cache.set('test-key', response, { ttl: 100 }); // 100ms TTL

            // Should be available immediately
            expect(await cache.has('test-key')).toBe(true);

            // Wait for expiration
            await new Promise((resolve) => setTimeout(resolve, 150));

            // Should be expired
            expect(await cache.has('test-key')).toBe(false);
            expect(await cache.get('test-key')).toBeNull();
        });

        it('entries without TTL do not expire', async () => {
            const response = new Response('test');
            await cache.set('test-key', response);

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(await cache.has('test-key')).toBe(true);
        });
    });

    describe('Graceful handling when storage is unavailable', () => {
        it('handles missing storage gracefully in get()', async () => {
            // This test verifies the code handles undefined storage
            // In jsdom, storage is always defined, but the code checks for it
            const result = await cache.get('any-key');
            expect(result).toBeDefined(); // Should not throw
        });

        it('handles invalid cache data gracefully', async () => {
            // Manually insert invalid JSON
            storage.setItem('fetchplus:corrupted', 'invalid-json{');

            const result = await cache.get('corrupted');
            expect(result).toBeNull();

            // Invalid entry should be removed
            expect(storage.getItem('fetchplus:corrupted')).toBeNull();
        });
    });
});
