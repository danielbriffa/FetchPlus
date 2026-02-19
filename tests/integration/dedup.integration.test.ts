import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FetchPlus } from '../../src/core/FetchPlus.js';
import { InMemoryCache } from '../../src/cache/InMemoryCache.js';

describe('Deduplication Integration Tests', () => {
    let fetchPlus: FetchPlus;
    let mockFetch: ReturnType<typeof vi.fn>;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        mockFetch = vi.fn();
        globalThis.fetch = mockFetch;

        fetchPlus = new FetchPlus({
            cache: new InMemoryCache(),
            replaceGlobalFetch: false,
        });
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        fetchPlus.restore();
    });

    describe('Dedup with Caching', () => {
        it('only 1 network call for identical concurrent requests, response is cached', async () => {
            mockFetch.mockResolvedValue(new Response('cached-data', { status: 200 }));

            // Fire concurrent identical requests with dedup enabled
            const p1 = fetchPlus.fetch('https://api.example.com/data', { deduplicate: true });
            const p2 = fetchPlus.fetch('https://api.example.com/data', { deduplicate: true });

            const [r1, r2] = await Promise.all([p1, p2]);

            // Should have only 1 network call (both deduplicated)
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(await r1.text()).toBe('cached-data');
            expect(await r2.text()).toBe('cached-data');

            // Now make a third request - should come from cache, not network
            mockFetch.mockClear();
            const p3 = fetchPlus.fetch('https://api.example.com/data');
            const r3 = await p3;

            expect(mockFetch).toHaveBeenCalledTimes(0); // Cache hit
            expect(await r3.text()).toBe('cached-data');
        });

        it('second identical request after first completes hits cache', async () => {
            mockFetch.mockResolvedValue(new Response('data', { status: 200 }));

            // First request with dedup
            const r1 = await fetchPlus.fetch('https://api.example.com/data', { deduplicate: true });
            expect(mockFetch).toHaveBeenCalledTimes(1);

            mockFetch.mockClear();

            // Second request should hit cache (not network, not dedup)
            const r2 = await fetchPlus.fetch('https://api.example.com/data');
            expect(mockFetch).toHaveBeenCalledTimes(0);
            expect(await r2.text()).toBe('data');
        });
    });

    describe('Dedup with Interceptors', () => {
        it('interceptors run once per unique request', async () => {
            mockFetch.mockResolvedValue(new Response('data', { status: 200 }));

            const requestInterceptor = vi.fn((input, init) => ({ input, init }));
            fetchPlus.getInterceptors().addRequestInterceptor(requestInterceptor);

            // Fire 3 identical concurrent requests with dedup
            const p1 = fetchPlus.fetch('https://api.example.com/data', { deduplicate: true });
            const p2 = fetchPlus.fetch('https://api.example.com/data', { deduplicate: true });
            const p3 = fetchPlus.fetch('https://api.example.com/data', { deduplicate: true });

            await Promise.all([p1, p2, p3]);

            // Interceptor should run 3 times (once per fetch call)
            expect(requestInterceptor).toHaveBeenCalledTimes(3);

            // But underlying network call should only happen once
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('response interceptor works with deduplicated responses', async () => {
            mockFetch.mockResolvedValue(new Response('original', { status: 200 }));

            const responseInterceptor = vi.fn(async (response) => {
                const text = await response.clone().text();
                return new Response(text + '-modified', { status: response.status });
            });

            fetchPlus.getInterceptors().addResponseInterceptor(responseInterceptor);

            const p1 = fetchPlus.fetch('https://api.example.com/data', { deduplicate: true });
            const p2 = fetchPlus.fetch('https://api.example.com/data', { deduplicate: true });

            const [r1, r2] = await Promise.all([p1, p2]);

            // Response interceptor runs for each waiting request
            expect(responseInterceptor).toHaveBeenCalledTimes(2);

            // Both should get the modified response
            expect(await r1.text()).toBe('original-modified');
            expect(await r2.text()).toBe('original-modified');
        });
    });

    describe('Dedup with Retry', () => {
        it('retry applies to deduplicated request, all waiters get retried response', async () => {
            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    return new Response(null, { status: 503 });
                }
                return new Response('success', { status: 200 });
            });

            vi.useFakeTimers();

            try {
                // Fire concurrent requests with both dedup and retry
                const p1 = fetchPlus.fetch('https://api.example.com/data', {
                    deduplicate: true,
                    retry: { maxRetries: 1, initialDelay: 100 },
                });
                const p2 = fetchPlus.fetch('https://api.example.com/data', {
                    deduplicate: true,
                    retry: { maxRetries: 1, initialDelay: 100 },
                });

                // Advance timers for retry
                await vi.advanceTimersByTimeAsync(100);

                const [r1, r2] = await Promise.all([p1, p2]);

                // Should have 2 network calls (original + 1 retry, then deduplicated)
                expect(mockFetch).toHaveBeenCalledTimes(2);
                expect(r1.status).toBe(200);
                expect(r2.status).toBe(200);
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('Per-Request Deduplicate Control', () => {
        it('deduplicate: false bypasses dedup', async () => {
            mockFetch.mockResolvedValue(new Response('data', { status: 200 }));

            // Fire two concurrent requests, second one disables dedup
            const p1 = fetchPlus.fetch('https://api.example.com/data', { deduplicate: true });
            const p2 = fetchPlus.fetch('https://api.example.com/data', { deduplicate: false });

            await Promise.all([p1, p2]);

            // Should have 2 network calls (p2 bypassed dedup)
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('undefined deduplicate uses default (dedup disabled)', async () => {
            mockFetch.mockResolvedValue(new Response('data', { status: 200 }));

            // Fire two concurrent requests without deduplicate option
            const p1 = fetchPlus.fetch('https://api.example.com/data');
            const p2 = fetchPlus.fetch('https://api.example.com/data');

            await Promise.all([p1, p2]);

            // Should have 2 network calls (dedup not enabled by default)
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('Dedup Disabled Globally', () => {
        it('no deduplication occurs when dedup config not provided', async () => {
            mockFetch.mockResolvedValue(new Response('data', { status: 200 }));

            // Default FetchPlus has no dedup config
            const p1 = fetchPlus.fetch('https://api.example.com/data');
            const p2 = fetchPlus.fetch('https://api.example.com/data');

            await Promise.all([p1, p2]);

            // Should have 2 calls (no dedup)
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('Dedup with forceRefresh', () => {
        it('forceRefresh bypasses dedup cache', async () => {
            mockFetch.mockResolvedValue(new Response('data', { status: 200 }));

            // First request
            const r1 = await fetchPlus.fetch('https://api.example.com/data', { deduplicate: true });
            expect(mockFetch).toHaveBeenCalledTimes(1);

            mockFetch.mockClear();

            // Second request with forceRefresh should bypass both cache and dedup
            const r2 = await fetchPlus.fetch('https://api.example.com/data', {
                deduplicate: true,
                forceRefresh: true,
            });

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(await r1.text()).toBe('data');
            expect(await r2.text()).toBe('data');
        });
    });

    describe('Dedup with skipInterceptors', () => {
        it('skipInterceptors skips interceptors even with dedup', async () => {
            mockFetch.mockResolvedValue(new Response('data', { status: 200 }));

            const requestInterceptor = vi.fn((input, init) => ({ input, init }));
            fetchPlus.getInterceptors().addRequestInterceptor(requestInterceptor);

            // Request with skipInterceptors
            await fetchPlus.fetch('https://api.example.com/data', {
                deduplicate: true,
                skipInterceptors: true,
            });

            // Interceptor should not run
            expect(requestInterceptor).not.toHaveBeenCalled();
        });
    });

    describe('Dedup with Different Request Methods', () => {
        it('GET and POST to same URL are not deduplicated', async () => {
            mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

            const p1 = fetchPlus.fetch('https://api.example.com/data', {
                method: 'GET',
                deduplicate: true,
            });
            const p2 = fetchPlus.fetch('https://api.example.com/data', {
                method: 'POST',
                body: '{}',
                deduplicate: true,
            });

            await Promise.all([p1, p2]);

            // Should have 2 network calls (different methods)
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('PUT and PATCH to same URL are not deduplicated', async () => {
            mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

            const p1 = fetchPlus.fetch('https://api.example.com/data', {
                method: 'PUT',
                body: '{}',
                deduplicate: true,
            });
            const p2 = fetchPlus.fetch('https://api.example.com/data', {
                method: 'PATCH',
                body: '{}',
                deduplicate: true,
            });

            await Promise.all([p1, p2]);

            // Should have 2 network calls (different methods)
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('Dedup with Different Query Parameters', () => {
        it('different query parameters are not deduplicated', async () => {
            mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

            const p1 = fetchPlus.fetch('https://api.example.com/data?id=1', {
                deduplicate: true,
            });
            const p2 = fetchPlus.fetch('https://api.example.com/data?id=2', {
                deduplicate: true,
            });

            await Promise.all([p1, p2]);

            // Should have 2 network calls (different query params)
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('same query parameters in different order are deduplicated', async () => {
            mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

            // URLs with same params but different order should deduplicate
            // (assuming cache key generator normalizes them)
            const p1 = fetchPlus.fetch('https://api.example.com/data?a=1&b=2', {
                deduplicate: true,
            });
            const p2 = fetchPlus.fetch('https://api.example.com/data?b=2&a=1', {
                deduplicate: true,
            });

            await Promise.all([p1, p2]);

            // Should have 1 network call (normalized params)
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('Error Handling with Dedup', () => {
        it('all waiting requests receive the error', async () => {
            const testError = new Error('Network failure');
            mockFetch.mockRejectedValue(testError);

            const p1 = fetchPlus.fetch('https://api.example.com/data', {
                deduplicate: true,
            }).catch(e => e);
            const p2 = fetchPlus.fetch('https://api.example.com/data', {
                deduplicate: true,
            }).catch(e => e);
            const p3 = fetchPlus.fetch('https://api.example.com/data', {
                deduplicate: true,
            }).catch(e => e);

            const [err1, err2, err3] = await Promise.all([p1, p2, p3]);

            expect(err1).toBeInstanceOf(Error);
            expect(err2).toBeInstanceOf(Error);
            expect(err3).toBeInstanceOf(Error);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('error interceptor works with deduplicated error', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            const errorInterceptor = vi.fn(() => {
                return new Response('fallback', { status: 503 });
            });
            fetchPlus.getInterceptors().addErrorInterceptor(errorInterceptor);

            const p1 = fetchPlus.fetch('https://api.example.com/data', {
                deduplicate: true,
            });
            const p2 = fetchPlus.fetch('https://api.example.com/data', {
                deduplicate: true,
            });

            const [r1, r2] = await Promise.all([p1, p2]);

            expect(errorInterceptor).toHaveBeenCalledTimes(2);
            expect(r1.status).toBe(503);
            expect(r2.status).toBe(503);
        });
    });

    describe('Dedup with Various Response Types', () => {
        it('dedup works with JSON responses', async () => {
            const responseData = { id: 1, name: 'test' };
            mockFetch.mockResolvedValue(
                new Response(JSON.stringify(responseData), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            );

            const p1 = fetchPlus.fetch('https://api.example.com/data', {
                deduplicate: true,
            });
            const p2 = fetchPlus.fetch('https://api.example.com/data', {
                deduplicate: true,
            });

            const [r1, r2] = await Promise.all([p1, p2]);

            const data1 = await r1.json();
            const data2 = await r2.json();

            expect(data1).toEqual(responseData);
            expect(data2).toEqual(responseData);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('dedup works with text responses', async () => {
            mockFetch.mockResolvedValue(
                new Response('plain text response', { status: 200 })
            );

            const p1 = fetchPlus.fetch('https://api.example.com/data', {
                deduplicate: true,
            });
            const p2 = fetchPlus.fetch('https://api.example.com/data', {
                deduplicate: true,
            });

            const [r1, r2] = await Promise.all([p1, p2]);

            expect(await r1.text()).toBe('plain text response');
            expect(await r2.text()).toBe('plain text response');
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('dedup works with empty responses', async () => {
            mockFetch.mockResolvedValue(
                new Response(null, { status: 204 })
            );

            const p1 = fetchPlus.fetch('https://api.example.com/data', {
                deduplicate: true,
            });
            const p2 = fetchPlus.fetch('https://api.example.com/data', {
                deduplicate: true,
            });

            const [r1, r2] = await Promise.all([p1, p2]);

            expect(r1.status).toBe(204);
            expect(r2.status).toBe(204);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('Concurrent Dedup Operations', () => {
        it('multiple different concurrent dedup requests work independently', async () => {
            mockFetch.mockResolvedValue(new Response('data', { status: 200 }));

            // 2 requests to URL1, 3 requests to URL2
            const p1a = fetchPlus.fetch('https://api.example.com/data1', { deduplicate: true });
            const p1b = fetchPlus.fetch('https://api.example.com/data1', { deduplicate: true });
            const p2a = fetchPlus.fetch('https://api.example.com/data2', { deduplicate: true });
            const p2b = fetchPlus.fetch('https://api.example.com/data2', { deduplicate: true });
            const p2c = fetchPlus.fetch('https://api.example.com/data2', { deduplicate: true });

            await Promise.all([p1a, p1b, p2a, p2b, p2c]);

            // Should have 2 network calls (1 for URL1, 1 for URL2)
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('dedup request arriving after non-dedup request works correctly', async () => {
            mockFetch.mockResolvedValue(new Response('data', { status: 200 }));

            // Non-dedup request first
            const p1 = fetchPlus.fetch('https://api.example.com/data');
            await p1;
            expect(mockFetch).toHaveBeenCalledTimes(1);

            mockFetch.mockClear();

            // Now dedup request - should get from cache, not dedup
            const p2 = fetchPlus.fetch('https://api.example.com/data', { deduplicate: true });
            await p2;

            expect(mockFetch).toHaveBeenCalledTimes(0); // Cache hit
        });
    });
});
