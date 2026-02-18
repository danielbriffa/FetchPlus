import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FetchPlus } from '../../src/core/FetchPlus.js';
import { InMemoryCache } from '../../src/cache/InMemoryCache.js';

describe('Retry Integration with Other Features', () => {
    let fetchPlus: FetchPlus;
    let mockFetch: ReturnType<typeof vi.fn>;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        vi.useFakeTimers();
        originalFetch = globalThis.fetch;
        mockFetch = vi.fn();
        globalThis.fetch = mockFetch;

        fetchPlus = new FetchPlus({
            cache: new InMemoryCache(),
            replaceGlobalFetch: false,
            retry: {
                maxRetries: 2,
                initialDelay: 100,
                backoffStrategy: 'exponential',
            },
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        globalThis.fetch = originalFetch;
        fetchPlus.restore();
    });

    describe('Retry with Caching', () => {
        it('caches successful response after retry', async () => {
            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    throw new TypeError('Network error');
                }
                return new Response('cached data', { status: 200 });
            });

            // First request: fails, retries, succeeds, gets cached
            const promise1 = fetchPlus.fetch('https://api.example.com/data');
            await vi.advanceTimersByTimeAsync(100); // Wait for retry delay

            const response1 = await promise1;
            expect(await response1.text()).toBe('cached data');

            // Second identical request: should hit cache
            mockFetch.mockReset();
            mockFetch.mockImplementationOnce(async () => {
                throw new Error('Should not be called');
            });

            const response2 = await fetchPlus.fetch('https://api.example.com/data');
            expect(await response2.text()).toBe('cached data');
            expect(mockFetch).not.toHaveBeenCalled(); // Cache hit
        });

        it('does not cache failed retry attempts', async () => {
            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                throw new TypeError('Network error');
            });

            // First request: fails all retries
            const promise1 = fetchPlus.fetch('https://api.example.com/data').catch(e => e);
            await vi.advanceTimersByTimeAsync(100); // First retry delay
            await vi.advanceTimersByTimeAsync(200); // Second retry delay

            const result1 = await promise1;
            expect(result1).toBeInstanceOf(Error);
            expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries

            // Second request: should retry again (not cached)
            mockFetch.mockReset();
            attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                throw new TypeError('Network error');
            });

            const promise2 = fetchPlus.fetch('https://api.example.com/data').catch(e => e);
            await vi.advanceTimersByTimeAsync(100); // First retry delay
            await vi.advanceTimersByTimeAsync(200); // Second retry delay

            const result2 = await promise2;
            expect(result2).toBeInstanceOf(Error);
            expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries (not cached)
        });

        it('retry respects cache on subsequent requests', async () => {
            let attemptCount = 0;

            // First request with retry config
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    throw new TypeError('Network error');
                }
                return new Response('data', { status: 200 });
            });

            const promise1 = fetchPlus.fetch('https://api.example.com/data', {
                retry: { maxRetries: 1, initialDelay: 100 },
            });
            await vi.advanceTimersByTimeAsync(100);

            const response1 = await promise1;
            expect(await response1.text()).toBe('data');

            // Second request: should hit cache immediately
            mockFetch.mockReset();
            const response2 = await fetchPlus.fetch('https://api.example.com/data');
            expect(await response2.text()).toBe('data');
            expect(mockFetch).not.toHaveBeenCalled(); // Cache hit
        });

        it('forceRefresh bypasses cache but retries are applied', async () => {
            let attemptCount = 0;

            // First request: succeeds and gets cached
            mockFetch.mockImplementationOnce(async () => {
                return new Response('original', { status: 200 });
            });

            const response1 = await fetchPlus.fetch('https://api.example.com/data');
            expect(await response1.text()).toBe('original');

            // Second request with forceRefresh and retry
            attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    throw new TypeError('Network error');
                }
                return new Response('refreshed', { status: 200 });
            });

            const promise2 = fetchPlus.fetch('https://api.example.com/data', {
                forceRefresh: true,
                retry: { maxRetries: 1, initialDelay: 100 },
            });
            await vi.advanceTimersByTimeAsync(100);

            const response2 = await promise2;
            expect(await response2.text()).toBe('refreshed');

            // Third request: should hit new cached response
            mockFetch.mockReset();
            const response3 = await fetchPlus.fetch('https://api.example.com/data');
            expect(await response3.text()).toBe('refreshed');
            expect(mockFetch).not.toHaveBeenCalled(); // Cache hit
        });
    });

    describe('Retry with Interceptors', () => {
        it('response interceptor runs after final attempt', async () => {
            const responseInterceptor = vi.fn(async (res) => {
                const text = await res.text();
                return new Response(`intercepted: ${text}`, { status: res.status });
            });

            fetchPlus.getInterceptors().addResponseInterceptor(responseInterceptor);

            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    throw new TypeError('Network error');
                }
                return new Response('original', { status: 200 });
            });

            const promise = fetchPlus.fetch('https://api.example.com/data', {
                retry: { maxRetries: 1, initialDelay: 100 },
            });
            await vi.advanceTimersByTimeAsync(100);

            const response = await promise;
            const text = await response.text();
            expect(text).toBe('intercepted: original');

            // Interceptor should be called once (after final attempt)
            expect(responseInterceptor).toHaveBeenCalledTimes(1);
        });

        it('request interceptor runs before retry logic', async () => {
            const requestInterceptor = vi.fn((input, init) => {
                const headers = new Headers(init?.headers);
                headers.set('X-Intercepted', 'true');
                return { input, init: { ...init, headers } };
            });

            fetchPlus.getInterceptors().addRequestInterceptor(requestInterceptor);

            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    throw new TypeError('Network error');
                }
                return new Response('ok', { status: 200 });
            });

            const promise = fetchPlus.fetch('https://api.example.com/data', {
                retry: { maxRetries: 1, initialDelay: 100 },
            });
            await vi.advanceTimersByTimeAsync(100);

            const response = await promise;
            expect(response.status).toBe(200);

            // Request interceptor should be called once (before retry logic)
            // The processed request is then retried with the intercepted headers
            expect(requestInterceptor).toHaveBeenCalledTimes(1);
        });

        it('error interceptor is invoked if all retries fail', async () => {
            const errorInterceptor = vi.fn(() => {
                return new Response('fallback', { status: 200 });
            });

            fetchPlus.getInterceptors().addErrorInterceptor(errorInterceptor);

            mockFetch.mockImplementation(async () => {
                throw new TypeError('Network error');
            });

            const promise = fetchPlus.fetch('https://api.example.com/data', {
                retry: { maxRetries: 1, initialDelay: 100 },
            });
            await vi.advanceTimersByTimeAsync(100);

            const response = await promise;
            const text = await response.text();
            expect(text).toBe('fallback');

            // Error interceptor should handle the RetryError
            expect(errorInterceptor).toHaveBeenCalledTimes(1);
        });

        it('skipInterceptors still allows retries', async () => {
            const responseInterceptor = vi.fn(async (res) => {
                return new Response('should not run', { status: res.status });
            });

            fetchPlus.getInterceptors().addResponseInterceptor(responseInterceptor);

            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    throw new TypeError('Network error');
                }
                return new Response('original', { status: 200 });
            });

            const promise = fetchPlus.fetch('https://api.example.com/data', {
                skipInterceptors: true,
                retry: { maxRetries: 1, initialDelay: 100 },
            });
            await vi.advanceTimersByTimeAsync(100);

            const response = await promise;
            const text = await response.text();
            expect(text).toBe('original'); // Not intercepted

            // Interceptor should not run
            expect(responseInterceptor).not.toHaveBeenCalled();
            // But retry should have worked
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('Retry with Per-Request Configuration', () => {
        it('per-request retry config overrides global', async () => {
            // Global retry config
            const globalFetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                retry: {
                    maxRetries: 1,
                    initialDelay: 100,
                },
            });

            globalThis.fetch = mockFetch;

            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount <= 1) {
                    throw new TypeError('Network error');
                }
                return new Response('ok', { status: 200 });
            });

            // Override with more retries in request
            const promise = globalFetchPlus.fetch('https://api.example.com/data', {
                retry: { maxRetries: 3, initialDelay: 100 },
            });
            await vi.advanceTimersByTimeAsync(100);

            const response = await promise;
            expect(response.status).toBe(200);
            // Should have used request config (maxRetries: 3), not global (maxRetries: 1)
            expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry

            globalFetchPlus.restore();
        });

        it('per-request retry: false disables global retry', async () => {
            const globalFetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                retry: {
                    maxRetries: 3,
                    initialDelay: 100,
                },
            });

            globalThis.fetch = mockFetch;

            mockFetch.mockImplementation(async () => {
                throw new TypeError('Network error');
            });

            // Disable retry for this request
            const promise = globalFetchPlus.fetch('https://api.example.com/data', {
                retry: false,
            });

            await expect(promise).rejects.toThrow('Network error');
            // Should not retry
            expect(mockFetch).toHaveBeenCalledTimes(1);

            globalFetchPlus.restore();
        });

        it('partial per-request config merges with global', async () => {
            const globalFetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                retry: {
                    maxRetries: 3,
                    initialDelay: 1000,
                    backoffStrategy: 'exponential',
                },
            });

            globalThis.fetch = mockFetch;

            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    throw new TypeError('Network error');
                }
                return new Response('ok', { status: 200 });
            });

            // Override only initialDelay
            const promise = globalFetchPlus.fetch('https://api.example.com/data', {
                retry: { initialDelay: 500 }, // Different delay
            });
            await vi.advanceTimersByTimeAsync(500); // Wait for custom delay

            const response = await promise;
            expect(response.status).toBe(200);
            expect(mockFetch).toHaveBeenCalledTimes(2);

            globalFetchPlus.restore();
        });
    });

    describe('Retry with Custom Backoff Strategies', () => {
        it('uses linear backoff for specific request', async () => {
            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount <= 2) {
                    throw new TypeError('Network error');
                }
                return new Response('ok', { status: 200 });
            });

            const promise = fetchPlus.fetch('https://api.example.com/data', {
                retry: {
                    maxRetries: 2,
                    initialDelay: 1000,
                    backoffStrategy: 'linear',
                },
            });

            // Linear: 1000ms, 2000ms
            await vi.advanceTimersByTimeAsync(1000);
            await vi.advanceTimersByTimeAsync(2000);

            const response = await promise;
            expect(response.status).toBe(200);
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });

        it('uses fixed backoff for specific request', async () => {
            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount <= 1) {
                    throw new TypeError('Network error');
                }
                return new Response('ok', { status: 200 });
            });

            const promise = fetchPlus.fetch('https://api.example.com/data', {
                retry: {
                    maxRetries: 2,
                    initialDelay: 500,
                    backoffStrategy: 'fixed',
                },
            });

            // Fixed: 500ms
            await vi.advanceTimersByTimeAsync(500);

            const response = await promise;
            expect(response.status).toBe(200);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('respects custom backoff multiplier', async () => {
            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount <= 1) {
                    throw new TypeError('Network error');
                }
                return new Response('ok', { status: 200 });
            });

            const promise = fetchPlus.fetch('https://api.example.com/data', {
                retry: {
                    maxRetries: 2,
                    initialDelay: 1000,
                    backoffStrategy: 'exponential',
                    backoffMultiplier: 3, // 1000, 3000, 9000
                },
            });

            // Exponential with multiplier 3: 1000ms (1000 * 3^0)
            await vi.advanceTimersByTimeAsync(1000);

            const response = await promise;
            expect(response.status).toBe(200);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('Retry with Different HTTP Methods', () => {
        it('retries POST request on server error', async () => {
            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    return new Response(null, { status: 503 });
                }
                return new Response('{"id": 1}', { status: 201 });
            });

            const promise = fetchPlus.fetch('https://api.example.com/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'test' }),
                retry: { maxRetries: 1, initialDelay: 100 },
            });
            await vi.advanceTimersByTimeAsync(100);

            const response = await promise;
            expect(response.status).toBe(201);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('retries PUT request on network error', async () => {
            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    throw new TypeError('Network error');
                }
                return new Response('updated', { status: 200 });
            });

            const promise = fetchPlus.fetch('https://api.example.com/items/1', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'updated' }),
                retry: { maxRetries: 1, initialDelay: 100 },
            });
            await vi.advanceTimersByTimeAsync(100);

            const response = await promise;
            expect(response.status).toBe(200);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('retries DELETE request', async () => {
            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    throw new TypeError('Network error');
                }
                return new Response(null, { status: 204 });
            });

            const promise = fetchPlus.fetch('https://api.example.com/items/1', {
                method: 'DELETE',
                retry: { maxRetries: 1, initialDelay: 100 },
            });
            await vi.advanceTimersByTimeAsync(100);

            const response = await promise;
            expect(response.status).toBe(204);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('Retry Error Metadata', () => {
        it('RetryError includes attempt count and last error', async () => {
            mockFetch.mockImplementation(async () => {
                throw new TypeError('Network error');
            });

            const promise = fetchPlus.fetch('https://api.example.com/data', {
                retry: { maxRetries: 2, initialDelay: 100 },
            }).catch(e => e);
            await vi.advanceTimersByTimeAsync(100);
            await vi.advanceTimersByTimeAsync(200);

            const error = await promise;
            expect(error).toBeInstanceOf(Error);
            const err = error as any;
            expect(err.attempts).toBe(3); // Initial + 2 retries
            expect(err.lastError).toBeInstanceOf(TypeError);
            expect(err.lastError.message).toBe('Network error');
        });
    });

    describe('Retry with onRetry Callback', () => {
        it('onRetry callback receives error information', async () => {
            const onRetry = vi.fn();

            mockFetch.mockImplementation(async () => {
                throw new TypeError('Network error');
            });

            const promise = fetchPlus.fetch('https://api.example.com/data', {
                retry: {
                    maxRetries: 1,
                    initialDelay: 100,
                    onRetry,
                },
            }).catch(e => e);
            await vi.advanceTimersByTimeAsync(100);

            const result = await promise;
            expect(result).toBeInstanceOf(Error);

            expect(onRetry).toHaveBeenCalledTimes(1);
            const [error, attemptNumber, delay] = onRetry.mock.calls[0];
            expect(error).toBeInstanceOf(TypeError);
            expect(attemptNumber).toBe(1);
            expect(delay).toBe(100);
        });

        it('onRetry callback tracks retry progression', async () => {
            const retryLog: Array<{ attempt: number; delay: number }> = [];
            const onRetry = vi.fn((error, attempt, delay) => {
                retryLog.push({ attempt, delay });
            });

            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount <= 2) {
                    throw new TypeError('Network error');
                }
                return new Response('ok', { status: 200 });
            });

            const promise = fetchPlus.fetch('https://api.example.com/data', {
                retry: {
                    maxRetries: 2,
                    initialDelay: 1000,
                    backoffStrategy: 'exponential',
                    onRetry,
                },
            });
            // Advance timers in a single batch to avoid intermediate unhandled rejections
            await vi.advanceTimersByTimeAsync(3000); // 1000 + 2000

            const response = await promise;
            expect(response.status).toBe(200);

            expect(retryLog).toEqual([
                { attempt: 1, delay: 1000 },
                { attempt: 2, delay: 2000 },
            ]);
        });
    });

    describe('Retry with Retry-After Header', () => {
        it('respects Retry-After header from server', async () => {
            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    return new Response(null, {
                        status: 429,
                        headers: { 'Retry-After': '1' }, // 1 second
                    });
                }
                return new Response('ok', { status: 200 });
            });

            const promise = fetchPlus.fetch('https://api.example.com/data', {
                retry: {
                    maxRetries: 1,
                    initialDelay: 100,
                    respectRetryAfter: true,
                },
            });

            // Wait for Retry-After delay
            await vi.advanceTimersByTimeAsync(1000);

            const response = await promise;
            expect(response.status).toBe(200);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('ignores Retry-After when respectRetryAfter is false', async () => {
            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    return new Response(null, {
                        status: 429,
                        headers: { 'Retry-After': '10' }, // 10 seconds (should be ignored)
                    });
                }
                return new Response('ok', { status: 200 });
            });

            const promise = fetchPlus.fetch('https://api.example.com/data', {
                retry: {
                    maxRetries: 1,
                    initialDelay: 100,
                    respectRetryAfter: false,
                },
            });

            // Should use exponential backoff (100ms), not Retry-After (10 seconds)
            await vi.advanceTimersByTimeAsync(100);

            const response = await promise;
            expect(response.status).toBe(200);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('Global Retry Configuration', () => {
        it('applies global retry config to all requests', async () => {
            const globalFetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                retry: {
                    maxRetries: 2,
                    initialDelay: 100,
                },
            });

            globalThis.fetch = mockFetch;

            let attemptCount = 0;
            mockFetch.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    throw new TypeError('Network error');
                }
                return new Response('ok', { status: 200 });
            });

            const promise = globalFetchPlus.fetch('https://api.example.com/data');
            await vi.advanceTimersByTimeAsync(100);

            const response = await promise;
            expect(response.status).toBe(200);
            expect(mockFetch).toHaveBeenCalledTimes(2);

            globalFetchPlus.restore();
        });

        it('allows disabling global retry', async () => {
            const globalFetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
                retry: false,
            });

            globalThis.fetch = mockFetch;

            mockFetch.mockImplementation(async () => {
                throw new TypeError('Network error');
            });

            const promise = globalFetchPlus.fetch('https://api.example.com/data');

            await expect(promise).rejects.toThrow('Network error');
            expect(mockFetch).toHaveBeenCalledTimes(1); // No retry

            globalFetchPlus.restore();
        });
    });
});
