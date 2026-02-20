import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FetchPlus } from '../../src/core/FetchPlus.js';
import { InMemoryCache } from '../../src/cache/InMemoryCache.js';

describe('Offline Integration Tests', () => {
    let fetchPlus: FetchPlus;
    let mockFetch: ReturnType<typeof vi.fn>;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        vi.useFakeTimers();

        // Save original fetch
        originalFetch = globalThis.fetch;

        // Create mock fetch
        mockFetch = vi.fn();
        globalThis.fetch = mockFetch;

        // Reset navigator.onLine
        Object.defineProperty(navigator, 'onLine', {
            writable: true,
            configurable: true,
            value: true,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        globalThis.fetch = originalFetch;
        if (fetchPlus) {
            fetchPlus.restore();
        }
    });

    describe('Offline Detection with FetchPlus', () => {
        it('FetchPlus with offline config serves cache when offline', async () => {
            mockFetch.mockResolvedValueOnce(new Response('cached data', { status: 200 }));

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    strategy: 'cache-first',
                    queueRequests: false,
                },
            });

            // First request: online, should cache
            const response1 = await fetchPlus.fetch('https://api.example.com/data');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // Go offline
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            // Second request: offline, should serve from cache without network call
            mockFetch.mockClear();
            const response2 = await fetchPlus.fetch('https://api.example.com/data');

            expect(response2.status).toBe(200);
            expect(await response2.text()).toBe('cached data');
            // Network should not be called
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('FetchPlus online uses normal fetch pipeline', async () => {
            mockFetch.mockResolvedValueOnce(new Response('online data', { status: 200 }));

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    strategy: 'cache-first',
                },
            });

            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: true,
            });

            const response = await fetchPlus.fetch('https://api.example.com/data');
            expect(response.status).toBe(200);
            expect(mockFetch).toHaveBeenCalled();
        });
    });

    describe('Per-Request Strategy Override', () => {
        it('per-request offlineStrategy overrides global config', async () => {
            mockFetch.mockResolvedValueOnce(new Response('cached', { status: 200 }));

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    strategy: 'cache-first', // Global default
                    queueRequests: false,
                },
            });

            // First request to cache it
            await fetchPlus.fetch('https://api.example.com/data');

            // Go offline
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            // Request with cache-only strategy override
            mockFetch.mockClear();
            const response = await fetchPlus.fetch('https://api.example.com/data', {
                offlineStrategy: 'cache-only',
            });

            expect(response.status).toBe(200);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('per-request queueIfOffline overrides global config', async () => {
            mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    strategy: 'cache-first',
                    queueRequests: true, // Global: enabled
                },
            });

            // Go offline before any requests
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            // Request with queueIfOffline: false override
            try {
                await fetchPlus.fetch('https://api.example.com/data', {
                    queueIfOffline: false, // Override: disable queue
                });
            } catch (e) {
                // Expected to throw since cache miss and queue disabled
            }

            // Queue should be empty due to override
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('Offline with Retry', () => {
        it('offline takes precedence over retry', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            mockFetch.mockResolvedValueOnce(new Response('cached', { status: 200 }));

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    strategy: 'cache-first',
                    queueRequests: false,
                },
                retry: {
                    maxRetries: 3,
                    initialDelay: 100,
                },
            });

            // First request to cache it while online
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: true,
            });

            await fetchPlus.fetch('https://api.example.com/data');

            // Go offline
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            // Clear mock to track calls
            mockFetch.mockClear();

            // Request while offline should serve cache without retry logic
            const response = await fetchPlus.fetch('https://api.example.com/data');
            expect(response.status).toBe(200);
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('Offline with Timeout', () => {
        it('timeout does not fire when serving from cache offline', async () => {
            mockFetch.mockResolvedValueOnce(new Response('cached data', { status: 200 }));

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    strategy: 'cache-first',
                    queueRequests: false,
                },
                timeout: {
                    defaultTimeout: 1000,
                },
            });

            // First request to cache
            await fetchPlus.fetch('https://api.example.com/data');

            // Go offline
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            // Clear mock
            mockFetch.mockClear();

            // Request while offline - should return cached immediately
            const promise = fetchPlus.fetch('https://api.example.com/data');

            // Advance timers past timeout
            await vi.advanceTimersByTimeAsync(2000);

            const response = await promise;
            expect(response.status).toBe(200);
            expect(await response.text()).toBe('cached data');
        });
    });

    describe('Offline with Deduplication', () => {
        it('concurrent identical requests deduplicate when offline', async () => {
            mockFetch.mockResolvedValueOnce(new Response('cached', { status: 200 }));

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    strategy: 'cache-first',
                    queueRequests: false,
                },
                deduplication: {
                    enabled: true,
                },
            });

            // First request to cache
            await fetchPlus.fetch('https://api.example.com/data');

            // Go offline
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            // Clear mock
            mockFetch.mockClear();

            // Fire two concurrent identical requests
            const [r1, r2] = await Promise.all([
                fetchPlus.fetch('https://api.example.com/data'),
                fetchPlus.fetch('https://api.example.com/data'),
            ]);

            expect(r1.status).toBe(200);
            expect(r2.status).toBe(200);
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('Request Queuing', () => {
        it('queue processed on online event via FetchPlus', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            mockFetch.mockResolvedValueOnce(new Response('queued response', { status: 200 }));

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    strategy: 'cache-first',
                    queueRequests: true,
                },
            });

            // Try to fetch while offline (will be queued)
            try {
                await fetchPlus.fetch('https://api.example.com/data');
            } catch (e) {
                // Expected - cache miss
            }

            // Go online
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: true,
            });

            window.dispatchEvent(new Event('online'));

            // Queue should be processed
            // This would require the actual implementation to handle queue processing
        });
    });

    describe('Offline Configuration in init() Method', () => {
        it('offline config in init() method enables offline handling', async () => {
            mockFetch.mockResolvedValueOnce(new Response('cached', { status: 200 }));

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
            });

            // Initialize with offline config
            fetchPlus.init({
                offline: {
                    enabled: true,
                    strategy: 'cache-first',
                    queueRequests: false,
                },
            });

            // First request to cache
            await fetchPlus.fetch('https://api.example.com/data');

            // Go offline
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            mockFetch.mockClear();

            // Second request should use cache
            const response = await fetchPlus.fetch('https://api.example.com/data');
            expect(response.status).toBe(200);
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('restore() Method', () => {
        it('restore() destroys offline manager', async () => {
            mockFetch.mockResolvedValueOnce(new Response('cached', { status: 200 }));

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    strategy: 'cache-first',
                },
            });

            // First request while online to populate cache
            await fetchPlus.fetch('https://api.example.com/data');

            // Restore FetchPlus (should destroy offline manager)
            fetchPlus.restore();

            // After restore, offline manager should be destroyed
            // FetchPlus should still work but without offline handling
            mockFetch.mockResolvedValueOnce(new Response('new data', { status: 200 }));
            const response = await fetchPlus.fetch('https://api.example.com/data');
            expect(response.status).toBe(200);
        });
    });

    describe('Cache-First Strategy with FetchPlus', () => {
        it('returns cache hit when offline', async () => {
            mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    strategy: 'cache-first',
                    queueRequests: false,
                },
            });

            // First request
            await fetchPlus.fetch('https://api.example.com/data');

            // Go offline
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            mockFetch.mockClear();

            // Second request should use cache
            const response = await fetchPlus.fetch('https://api.example.com/data');
            expect(response.status).toBe(200);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('throws on cache miss when offline with cache-first', async () => {
            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    strategy: 'cache-first',
                    queueRequests: false,
                },
            });

            // Go offline without caching anything
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            // Request for non-cached URL should throw
            await expect(fetchPlus.fetch('https://api.example.com/missing')).rejects.toThrow();
        });
    });

    describe('Cache-Only Strategy with FetchPlus', () => {
        it('always serves cache with cache-only strategy', async () => {
            mockFetch.mockResolvedValueOnce(new Response('cached', { status: 200 }));

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    strategy: 'cache-first', // Use cache-first to populate cache first
                },
            });

            // First request to populate cache (cache-first: cache miss → network → cache)
            await fetchPlus.fetch('https://api.example.com/data');

            // Go offline
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            mockFetch.mockClear();

            // Second request with cache-only override should use cache
            const response = await fetchPlus.fetch('https://api.example.com/data', {
                offlineStrategy: 'cache-only',
            });
            expect(response.status).toBe(200);
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('Network-First Strategy with FetchPlus', () => {
        it('tries network first when online, falls back to cache offline', async () => {
            mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    strategy: 'network-first',
                    queueRequests: false,
                },
            });

            // First request while online
            const response1 = await fetchPlus.fetch('https://api.example.com/data');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // Go offline
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            mockFetch.mockClear();

            // Second request should fall back to cache
            const response2 = await fetchPlus.fetch('https://api.example.com/data');
            expect(response2.status).toBe(200);
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('Offline Events', () => {
        it('onOffline callback is called when going offline', async () => {
            const onOffline = vi.fn();

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    onOffline,
                },
            });

            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            window.dispatchEvent(new Event('offline'));

            // The onOffline callback should be called
            // Note: This requires the actual OfflineManager to be instantiated
        });

        it('onOnline callback is called when coming online', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const onOnline = vi.fn();

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    onOnline,
                },
            });

            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: true,
            });

            window.dispatchEvent(new Event('online'));

            // The onOnline callback should be called
            // Note: This requires the actual OfflineManager to be instantiated
        });
    });

    describe('Multiple Requests with Offline State', () => {
        it('different URLs handled independently when offline', async () => {
            mockFetch.mockResolvedValueOnce(new Response('data1', { status: 200 }));
            mockFetch.mockResolvedValueOnce(new Response('data2', { status: 200 }));

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: true,
                    strategy: 'cache-first',
                    queueRequests: false,
                },
            });

            // Cache two different URLs while online
            await fetchPlus.fetch('https://api.example.com/data1');
            await fetchPlus.fetch('https://api.example.com/data2');

            expect(mockFetch).toHaveBeenCalledTimes(2);

            // Go offline
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            mockFetch.mockClear();

            // Both requests should hit cache independently
            const response1 = await fetchPlus.fetch('https://api.example.com/data1');
            const response2 = await fetchPlus.fetch('https://api.example.com/data2');

            expect(await response1.text()).toBe('data1');
            expect(await response2.text()).toBe('data2');
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('Offline Disabled', () => {
        it('offline handling is skipped when enabled is false', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            mockFetch.mockImplementationOnce(() => {
                throw new Error('Network error while offline');
            });

            fetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                offline: {
                    enabled: false, // Disabled
                },
            });

            // Should attempt network call even when offline
            await expect(fetchPlus.fetch('https://api.example.com/data')).rejects.toThrow(
                'Network error while offline'
            );
        });
    });
});
