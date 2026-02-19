import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FetchPlus } from '../../src/core/FetchPlus.js';
import { InMemoryCache } from '../../src/cache/InMemoryCache.js';
import { TimeoutError } from '../../src/errors/TimeoutError.js';

describe('Timeout Integration Tests', () => {
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

        // Create FetchPlus instance
        fetchPlus = new FetchPlus({
            cache: new InMemoryCache(),
            replaceGlobalFetch: false,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        globalThis.fetch = originalFetch;
        fetchPlus.restore();
    });

    describe('Global Timeout Configuration', () => {
        it('global timeout applies to requests', async () => {
            mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 2000 },
            });

            const promise = fetchPlusWithTimeout.fetch('https://api.example.com/data').catch(e => e);

            await vi.advanceTimersByTimeAsync(2000);

            const error = await promise;
            expect(error).toBeInstanceOf(TimeoutError);
            expect(error.timeoutMs).toBe(2000);

            fetchPlusWithTimeout.restore();
        });

        it('global timeout is skipped when timeout config is not provided', async () => {
            mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

            const promise = fetchPlus.fetch('https://api.example.com/data');

            await vi.advanceTimersByTimeAsync(10);
            const response = await promise;

            expect(response.status).toBe(200);
        });
    });

    describe('Per-Request Timeout Override', () => {
        it('per-request timeout overrides global default', async () => {
            mockFetch.mockImplementation(() => new Promise(() => {}));

            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 5000 }, // Global: 5000ms
            });

            const promise = fetchPlusWithTimeout
                .fetch('https://api.example.com/data', { timeout: 1000 }) // Request: 1000ms
                .catch(e => e);

            // Should timeout at 1000ms (request override), not 5000ms (global default)
            await vi.advanceTimersByTimeAsync(1000);

            const error = await promise;
            expect(error).toBeInstanceOf(TimeoutError);
            expect(error.timeoutMs).toBe(1000);

            fetchPlusWithTimeout.restore();
        });

        it('per-request timeout of 0 disables timeout even with global default', async () => {
            mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 2000 },
            });

            // Request with timeout: 0 should disable timeout
            const promise = fetchPlusWithTimeout.fetch('https://api.example.com/data', { timeout: 0 });

            await vi.advanceTimersByTimeAsync(10);
            const response = await promise;

            expect(response.status).toBe(200);

            fetchPlusWithTimeout.restore();
        });
    });

    describe('Timeout with Caching', () => {
        it('cache hit returns before timeout fires', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 5000 },
            });

            // First request succeeds and is cached
            mockFetch.mockResolvedValueOnce(new Response('cached data', { status: 200 }));
            const response1 = await fetchPlusWithTimeout.fetch('https://api.example.com/data');
            expect(await response1.text()).toBe('cached data');

            // Second request should hit cache, not timeout
            // (even if we set a shorter timeout on second request)
            const response2 = await fetchPlusWithTimeout.fetch('https://api.example.com/data', {
                timeout: 100, // Short timeout
            });

            // Should return cached response without hitting timeout
            expect(await response2.text()).toBe('cached data');
            expect(mockFetch).toHaveBeenCalledTimes(1); // Only first request hit network

            fetchPlusWithTimeout.restore();
        });

        it('timeout applies to cache miss even after cache hit on same URL', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 5000 },
            });

            // First request succeeds
            mockFetch.mockResolvedValueOnce(new Response('data1', { status: 200 }));
            const response1 = await fetchPlusWithTimeout.fetch('https://api.example.com/data');
            expect(await response1.text()).toBe('data1');

            // Force refresh on second request to bypass cache
            mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

            const promise = fetchPlusWithTimeout
                .fetch('https://api.example.com/data', { forceRefresh: true, timeout: 1000 })
                .catch(e => e);

            await vi.advanceTimersByTimeAsync(1000);

            const error = await promise;
            expect(error).toBeInstanceOf(TimeoutError);
            expect(error.timeoutMs).toBe(1000);

            fetchPlusWithTimeout.restore();
        });
    });

    describe('Timeout with Retry', () => {
        it('timeout applies to entire retry operation', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 3000 },
                retry: { maxRetries: 3, initialDelay: 1000 },
            });

            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                // Always fail with 503
                return new Response('Service Unavailable', { status: 503 });
            });

            const promise = fetchPlusWithTimeout.fetch('https://api.example.com/data').catch(e => e);

            // First attempt
            await vi.advanceTimersByTimeAsync(10);
            expect(attemptCount).toBe(1);

            // Retry delay (1000ms) + timeout window (3000ms total)
            // After 3000ms from start, we should timeout
            await vi.advanceTimersByTimeAsync(2990);

            const result = await promise;
            // Should timeout rather than complete all retries
            expect(result).toBeInstanceOf(TimeoutError);

            fetchPlusWithTimeout.restore();
        });

        it('successful retry before timeout returns response', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 5000 },
                retry: { maxRetries: 2, initialDelay: 500 },
            });

            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    throw new TypeError('Network error');
                }
                return new Response('success', { status: 200 });
            });

            const promise = fetchPlusWithTimeout.fetch('https://api.example.com/data').catch(e => e);

            // Advance enough for first attempt + retry delay + second attempt
            await vi.advanceTimersByTimeAsync(600);

            const result = await promise;
            expect(result).toBeInstanceOf(Response);
            expect(result.status).toBe(200);
            expect(attemptCount).toBe(2);

            fetchPlusWithTimeout.restore();
        });
    });

    describe('Timeout with Deduplication', () => {
        it('timeout fires and all deduplicated requests get TimeoutError', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 2000 },
                deduplication: { enabled: true },
            });

            mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

            // Fire three identical concurrent requests
            const promise1 = fetchPlusWithTimeout
                .fetch('https://api.example.com/data', { deduplicate: true })
                .catch(e => e);
            const promise2 = fetchPlusWithTimeout
                .fetch('https://api.example.com/data', { deduplicate: true })
                .catch(e => e);
            const promise3 = fetchPlusWithTimeout
                .fetch('https://api.example.com/data', { deduplicate: true })
                .catch(e => e);

            // Advance to timeout
            await vi.advanceTimersByTimeAsync(2000);

            const [error1, error2, error3] = await Promise.all([promise1, promise2, promise3]);

            // All should get TimeoutError
            expect(error1).toBeInstanceOf(TimeoutError);
            expect(error2).toBeInstanceOf(TimeoutError);
            expect(error3).toBeInstanceOf(TimeoutError);
            expect(error1.timeoutMs).toBe(2000);
            expect(error2.timeoutMs).toBe(2000);
            expect(error3.timeoutMs).toBe(2000);

            // Only one fetch should have been attempted
            expect(mockFetch).toHaveBeenCalledTimes(1);

            fetchPlusWithTimeout.restore();
        });

        it('timeout on one deduplicated group does not affect other URLs', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 2000 },
                deduplication: { enabled: true },
            });

            mockFetch.mockImplementation((url) => {
                // URL1 hangs, URL2 succeeds
                if (String(url).includes('data1')) {
                    return new Promise(() => {});
                }
                return Promise.resolve(new Response('ok', { status: 200 }));
            });

            // Request to URL1 times out
            const promise1 = fetchPlusWithTimeout
                .fetch('https://api.example.com/data1', { deduplicate: true })
                .catch(e => e);

            // Request to URL2 succeeds
            const promise2 = fetchPlusWithTimeout
                .fetch('https://api.example.com/data2', { deduplicate: true })
                .catch(e => e);

            await vi.advanceTimersByTimeAsync(2000);

            const error1 = await promise1;
            const response2 = await promise2;

            expect(error1).toBeInstanceOf(TimeoutError);
            expect(response2.status).toBe(200);

            fetchPlusWithTimeout.restore();
        });
    });

    describe('Timeout with Interceptors', () => {
        it('error interceptor can catch TimeoutError', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 1000 },
            });

            mockFetch.mockImplementation(() => new Promise(() => {}));

            const errorInterceptor = vi.fn(() => new Response('fallback', { status: 200 }));
            fetchPlusWithTimeout.getInterceptors().addErrorInterceptor(errorInterceptor);

            const promise = fetchPlusWithTimeout.fetch('https://api.example.com/data');

            await vi.advanceTimersByTimeAsync(1000);

            const response = await promise;
            expect(response.status).toBe(200);
            const text = await response.text();
            expect(text).toBe('fallback');

            // Error interceptor should have been called with TimeoutError
            expect(errorInterceptor).toHaveBeenCalledTimes(1);
            const calledError = errorInterceptor.mock.calls[0][0];
            expect(calledError).toBeInstanceOf(TimeoutError);

            fetchPlusWithTimeout.restore();
        });

        it('request interceptor does not affect timeout', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 1000 },
            });

            mockFetch.mockImplementation(() => new Promise(() => {}));

            // Add request interceptor
            fetchPlusWithTimeout.getInterceptors().addRequestInterceptor((input, init) => {
                // Interceptor modifies headers but timeout should still apply
                return { input, init: { ...init, headers: { 'X-Custom': 'header' } } };
            });

            const promise = fetchPlusWithTimeout.fetch('https://api.example.com/data').catch(e => e);

            await vi.advanceTimersByTimeAsync(1000);

            const error = await promise;
            expect(error).toBeInstanceOf(TimeoutError);

            fetchPlusWithTimeout.restore();
        });

        it('response interceptor does not prevent timeout on request', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 1000 },
            });

            mockFetch.mockImplementation(() => new Promise(() => {}));

            // Add response interceptor (won't run because request times out)
            const responseInterceptor = vi.fn((res) => res);
            fetchPlusWithTimeout.getInterceptors().addResponseInterceptor(responseInterceptor);

            const promise = fetchPlusWithTimeout.fetch('https://api.example.com/data').catch(e => e);

            await vi.advanceTimersByTimeAsync(1000);

            const error = await promise;
            expect(error).toBeInstanceOf(TimeoutError);

            // Response interceptor should not have run
            expect(responseInterceptor).not.toHaveBeenCalled();

            fetchPlusWithTimeout.restore();
        });
    });

    describe('Timeout with AbortSignal', () => {
        it('user AbortSignal aborts before timeout throws AbortError not TimeoutError', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 5000 },
            });

            mockFetch.mockImplementation(() => new Promise(() => {}));

            const controller = new AbortController();

            const promise = fetchPlusWithTimeout
                .fetch('https://api.example.com/data', { signal: controller.signal })
                .catch(e => e);

            // User aborts before timeout
            await vi.advanceTimersByTimeAsync(1000);
            controller.abort();
            await vi.advanceTimersByTimeAsync(1);

            const error = await promise;
            expect(error.name).toBe('AbortError');
            expect(error).not.toBeInstanceOf(TimeoutError);

            fetchPlusWithTimeout.restore();
        });

        it('timeout fires before user abort throws TimeoutError not AbortError', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 1000 },
            });

            mockFetch.mockImplementation(() => new Promise(() => {}));

            const controller = new AbortController();

            const promise = fetchPlusWithTimeout
                .fetch('https://api.example.com/data', { signal: controller.signal })
                .catch(e => e);

            // Timeout fires before user abort
            await vi.advanceTimersByTimeAsync(1000);

            const error = await promise;
            expect(error).toBeInstanceOf(TimeoutError);

            fetchPlusWithTimeout.restore();
        });
    });

    describe('Timeout Edge Cases', () => {
        it('successful response before timeout returns response', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 5000 },
            });

            mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));

            const promise = fetchPlusWithTimeout.fetch('https://api.example.com/data');

            // Request completes quickly
            await vi.advanceTimersByTimeAsync(10);

            const response = await promise;
            expect(response.status).toBe(200);

            fetchPlusWithTimeout.restore();
        });

        it('error response before timeout returns error response', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 5000 },
            });

            mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

            const promise = fetchPlusWithTimeout.fetch('https://api.example.com/data');

            await vi.advanceTimersByTimeAsync(10);

            const response = await promise;
            expect(response.status).toBe(404);

            fetchPlusWithTimeout.restore();
        });

        it('network error before timeout throws original error', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 5000 },
            });

            mockFetch.mockRejectedValueOnce(new Error('Network unavailable'));

            const promise = fetchPlusWithTimeout.fetch('https://api.example.com/data').catch(e => e);

            await vi.advanceTimersByTimeAsync(10);

            const error = await promise;
            expect(error.message).toBe('Network unavailable');
            expect(error).not.toBeInstanceOf(TimeoutError);

            fetchPlusWithTimeout.restore();
        });
    });

    describe('Timeout Disabled Scenarios', () => {
        it('no timeout when neither global nor per-request is set', async () => {
            const fetchPlusNoTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                // No timeout config
            });

            mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

            const promise = fetchPlusNoTimeout.fetch('https://api.example.com/data');

            await vi.advanceTimersByTimeAsync(10);

            const response = await promise;
            expect(response.status).toBe(200);

            fetchPlusNoTimeout.restore();
        });

        it('skipInterceptors does not affect timeout behavior', async () => {
            const fetchPlusWithTimeout = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                timeout: { defaultTimeout: 1000 },
            });

            mockFetch.mockImplementation(() => new Promise(() => {}));

            const promise = fetchPlusWithTimeout
                .fetch('https://api.example.com/data', { skipInterceptors: true })
                .catch(e => e);

            await vi.advanceTimersByTimeAsync(1000);

            const error = await promise;
            expect(error).toBeInstanceOf(TimeoutError);

            fetchPlusWithTimeout.restore();
        });
    });
});
