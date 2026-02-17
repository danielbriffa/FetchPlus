import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCache } from '../../src/cache/InMemoryCache.js';

describe('InMemoryCache', () => {
    let cache: InMemoryCache;

    beforeEach(() => {
        cache = new InMemoryCache();
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

    describe('Bug #6 regression: LRU Eviction', () => {
        it('evicts oldest entry when maxEntries is reached', async () => {
            const smallCache = new InMemoryCache(3); // maxEntries = 3

            await smallCache.set('key1', new Response('data1'));
            await smallCache.set('key2', new Response('data2'));
            await smallCache.set('key3', new Response('data3'));

            // All three should exist
            expect(await smallCache.has('key1')).toBe(true);
            expect(await smallCache.has('key2')).toBe(true);
            expect(await smallCache.has('key3')).toBe(true);

            // Adding 4th item should evict key1 (oldest)
            await smallCache.set('key4', new Response('data4'));

            expect(await smallCache.has('key1')).toBe(false); // Evicted
            expect(await smallCache.has('key2')).toBe(true);
            expect(await smallCache.has('key3')).toBe(true);
            expect(await smallCache.has('key4')).toBe(true);
        });

        it('updates LRU on get access', async () => {
            vi.useFakeTimers();
            const smallCache = new InMemoryCache(3);

            vi.setSystemTime(1000);
            await smallCache.set('key1', new Response('data1'));
            vi.setSystemTime(2000);
            await smallCache.set('key2', new Response('data2'));
            vi.setSystemTime(3000);
            await smallCache.set('key3', new Response('data3'));

            // Access key1 to make it most recently used
            vi.setSystemTime(4000);
            await smallCache.get('key1');

            // Add key4, should evict key2 (oldest unaccessed)
            vi.setSystemTime(5000);
            await smallCache.set('key4', new Response('data4'));

            expect(await smallCache.has('key1')).toBe(true); // Kept (recently accessed)
            expect(await smallCache.has('key2')).toBe(false); // Evicted
            expect(await smallCache.has('key3')).toBe(true);
            expect(await smallCache.has('key4')).toBe(true);

            vi.useRealTimers();
        });

        it('updates LRU on set overwrite', async () => {
            vi.useFakeTimers();
            const smallCache = new InMemoryCache(3);

            vi.setSystemTime(1000);
            await smallCache.set('key1', new Response('data1'));
            vi.setSystemTime(2000);
            await smallCache.set('key2', new Response('data2'));
            vi.setSystemTime(3000);
            await smallCache.set('key3', new Response('data3'));

            // Overwrite key1
            vi.setSystemTime(4000);
            await smallCache.set('key1', new Response('data1-updated'));

            // Add key4, should evict key2 (oldest)
            vi.setSystemTime(5000);
            await smallCache.set('key4', new Response('data4'));

            expect(await smallCache.has('key1')).toBe(true); // Kept (recently updated)
            expect(await smallCache.has('key2')).toBe(false); // Evicted
            expect(await smallCache.has('key3')).toBe(true);
            expect(await smallCache.has('key4')).toBe(true);

            vi.useRealTimers();
        });

        it('handles custom maxEntries correctly', async () => {
            const customCache = new InMemoryCache(5);

            for (let i = 1; i <= 5; i++) {
                await customCache.set(`key${i}`, new Response(`data${i}`));
            }

            // All 5 should exist
            for (let i = 1; i <= 5; i++) {
                expect(await customCache.has(`key${i}`)).toBe(true);
            }

            // Adding 6th should evict key1
            await customCache.set('key6', new Response('data6'));

            expect(await customCache.has('key1')).toBe(false);
            expect(await customCache.has('key6')).toBe(true);
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

        it('get() removes expired entries', async () => {
            const response = new Response('test');
            await cache.set('test-key', response, { ttl: 50 });

            await new Promise((resolve) => setTimeout(resolve, 100));

            const result = await cache.get('test-key');
            expect(result).toBeNull();
        });

        it('has() removes expired entries', async () => {
            const response = new Response('test');
            await cache.set('test-key', response, { ttl: 50 });

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(await cache.has('test-key')).toBe(false);
        });

        it('entries without TTL do not expire', async () => {
            const response = new Response('test');
            await cache.set('test-key', response);

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(await cache.has('test-key')).toBe(true);
        });
    });

    describe('Response Cloning', () => {
        it('stores cloned response without consuming original', async () => {
            const original = new Response('test data');
            await cache.set('test-key', original);

            // Original should still be readable
            const originalText = await original.text();
            expect(originalText).toBe('test data');

            // Cached response should also be readable
            const cached = await cache.get('test-key');
            const cachedText = await cached!.text();
            expect(cachedText).toBe('test data');
        });

        it('returns cloned response that can be read multiple times', async () => {
            const response = new Response('test data');
            await cache.set('test-key', response);

            // Get the same cached response multiple times
            const cached1 = await cache.get('test-key');
            const cached2 = await cache.get('test-key');

            const text1 = await cached1!.text();
            const text2 = await cached2!.text();

            expect(text1).toBe('test data');
            expect(text2).toBe('test data');
        });

        it('caches different responses with different keys correctly', async () => {
            await cache.set('key1', new Response('data1'));
            await cache.set('key2', new Response('data2'));
            await cache.set('key3', new Response('data3'));

            const res1 = await cache.get('key1');
            const res2 = await cache.get('key2');
            const res3 = await cache.get('key3');

            expect(await res1!.text()).toBe('data1');
            expect(await res2!.text()).toBe('data2');
            expect(await res3!.text()).toBe('data3');
        });
    });
});
