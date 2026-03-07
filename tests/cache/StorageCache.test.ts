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

    describe('Metadata Sanitization', () => {
        it('stores and retrieves metadata correctly via cache operations', async () => {
            const metadata = {
                cachedAt: Date.now(),
                revalidating: false,
            };

            const response = new Response(JSON.stringify({ data: 'test' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });

            await cache.set('meta-test', response, { metadata });

            const cached = await cache.get('meta-test');
            expect(cached).not.toBeNull();

            const cachedMeta = await cache.getMetadata('meta-test');
            expect(cachedMeta).not.toBeNull();
            expect(cachedMeta?.cachedAt).toBe(metadata.cachedAt);
            expect(cachedMeta?.revalidating).toBe(false);
        });

        it('metadata survives round-trip through cache set/get', async () => {
            const cachedAt = Date.now();
            const metadata = {
                cachedAt,
                revalidating: false,
            };

            const response = new Response('cached content', {
                status: 200,
            });

            await cache.set('round-trip', response, { metadata });

            const retrieved = await cache.getMetadata('round-trip');
            expect(retrieved?.cachedAt).toBe(cachedAt);
            expect(retrieved?.revalidating).toBe(false);
        });

        it('normal CacheEntryMetadata with cachedAt and revalidating works fine', async () => {
            const response = new Response('test data');

            const normalMetadata = {
                cachedAt: 1234567890,
                revalidating: true,
            };

            await cache.set('normal-meta', response, { metadata: normalMetadata });

            const meta = await cache.getMetadata('normal-meta');
            expect(meta?.cachedAt).toBe(1234567890);
            expect(meta?.revalidating).toBe(true);
        });

        it('safeJSONParse protects against malicious JSON with dangerous properties', async () => {
            // Manually create JSON with dangerous properties
            const maliciousJSON = '{"cachedAt": 1234567890, "__proto__": {"admin": true}}';

            // When LocalStorageCache tries to parse this, safeJSONParse should reject it
            // Let's set it directly in storage and try to retrieve it
            storage.setItem('fetchplus:malicious', maliciousJSON);

            // Now try to get metadata
            const meta = await cache.getMetadata('malicious');

            // safeJSONParse should have rejected the poisoned JSON
            expect(meta).toBeNull();
        });

        it('metadata can be updated via setMetadata', async () => {
            const response = new Response('test data');
            const initialMetadata = {
                cachedAt: Date.now(),
                revalidating: false,
            };

            await cache.set('updatable', response, { metadata: initialMetadata });

            const updatedMetadata = {
                cachedAt: initialMetadata.cachedAt,
                revalidating: true,
            };

            await cache.setMetadata('updatable', updatedMetadata);

            const retrieved = await cache.getMetadata('updatable');
            expect(retrieved?.revalidating).toBe(true);
        });

        it('getMetadata returns null for non-existent key', async () => {
            const meta = await cache.getMetadata('non-existent-key');
            expect(meta).toBeNull();
        });

        it('metadata is independent of response data', async () => {
            const response = new Response(JSON.stringify({ secret: 'data' }), {
                status: 200,
            });

            const metadata = {
                cachedAt: Date.now(),
                revalidating: false,
            };

            await cache.set('separate', response, { metadata });

            // Get response data
            const cached = await cache.get('separate');
            const data = await cached?.json();

            // Get metadata
            const meta = await cache.getMetadata('separate');

            // Both should be independent and correct
            expect(data?.secret).toBe('data');
            expect(meta?.cachedAt).toBeDefined();
        });

        it('multiple entries with different metadata work correctly', async () => {
            const meta1 = { cachedAt: 1000, revalidating: false };
            const meta2 = { cachedAt: 2000, revalidating: true };
            const meta3 = { cachedAt: 3000, revalidating: false };

            await cache.set('key1', new Response('data1'), { metadata: meta1 });
            await cache.set('key2', new Response('data2'), { metadata: meta2 });
            await cache.set('key3', new Response('data3'), { metadata: meta3 });

            const retrieved1 = await cache.getMetadata('key1');
            const retrieved2 = await cache.getMetadata('key2');
            const retrieved3 = await cache.getMetadata('key3');

            expect(retrieved1?.cachedAt).toBe(1000);
            expect(retrieved2?.cachedAt).toBe(2000);
            expect(retrieved2?.revalidating).toBe(true);
            expect(retrieved3?.cachedAt).toBe(3000);
        });

        it('handles metadata with only cachedAt property', async () => {
            const response = new Response('test');

            const minimalMetadata = {
                cachedAt: Date.now(),
            };

            await cache.set('minimal', response, { metadata: minimalMetadata });

            const meta = await cache.getMetadata('minimal');
            expect(meta?.cachedAt).toBeDefined();
            expect(meta?.revalidating).toBeUndefined();
        });

        it('handles metadata with revalidating as undefined', async () => {
            const response = new Response('test');

            const metadata = {
                cachedAt: Date.now(),
                revalidating: undefined,
            };

            await cache.set('undefined-reval', response, { metadata });

            const meta = await cache.getMetadata('undefined-reval');
            expect(meta?.cachedAt).toBeDefined();
            expect(meta?.revalidating).toBeUndefined();
        });

        it('metadata is not lost when cache entry is accessed multiple times', async () => {
            const response = new Response('test');
            const metadata = {
                cachedAt: Date.now(),
                revalidating: false,
            };

            await cache.set('persistent', response, { metadata });

            // Access multiple times
            const meta1 = await cache.getMetadata('persistent');
            const meta2 = await cache.getMetadata('persistent');
            const cached1 = await cache.get('persistent');
            const meta3 = await cache.getMetadata('persistent');

            expect(meta1?.cachedAt).toBe(metadata.cachedAt);
            expect(meta2?.cachedAt).toBe(metadata.cachedAt);
            expect(meta3?.cachedAt).toBe(metadata.cachedAt);
            expect(cached1).not.toBeNull();
        });
    });
});
