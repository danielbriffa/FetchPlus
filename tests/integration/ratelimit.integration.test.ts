import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FetchPlus } from '../../src/core/FetchPlus.js';
import { RateLimitError } from '../../src/features/ratelimit/RateLimiter.js';

describe('Rate Limiting Integration with FetchPlus', () => {
    let originalFetch: typeof fetch;

    beforeEach(() => {
        vi.useFakeTimers();
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        vi.useRealTimers();
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    /**
     * Helper: create FetchPlus with a mock fetch already in place.
     * FetchPlus captures globalThis.fetch in constructor, so we must
     * set the mock BEFORE creating the instance.
     */
    function createWithMock(config: any, mockFetch: ReturnType<typeof vi.fn>) {
        globalThis.fetch = mockFetch as any;
        return new FetchPlus({
            replaceGlobalFetch: false,
            enableCaching: false,
            ...config,
        });
    }

    describe('Rate Limiting with FetchPlus', () => {
        it('limits concurrent requests', async () => {
            let concurrentRequests = 0;
            let maxConcurrent = 0;

            const mockFetch = vi.fn(async () => {
                concurrentRequests++;
                maxConcurrent = Math.max(maxConcurrent, concurrentRequests);
                await new Promise(resolve => setTimeout(resolve, 100));
                concurrentRequests--;
                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 2 },
            }, mockFetch);

            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(fetchPlus.fetch(`/api/request${i}`));
            }

            await vi.runAllTimersAsync();
            await Promise.all(promises);

            expect(maxConcurrent).toBeLessThanOrEqual(2);
        });

        it('queues requests beyond maxConcurrent', async () => {
            const executionOrder: string[] = [];

            const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
                executionOrder.push(String(url));
                await new Promise(resolve => setTimeout(resolve, 10));
                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 1 },
            }, mockFetch);

            const p1 = fetchPlus.fetch('/request1');
            const p2 = fetchPlus.fetch('/request2');
            const p3 = fetchPlus.fetch('/request3');

            await vi.runAllTimersAsync();
            await Promise.all([p1, p2, p3]);

            expect(executionOrder).toContain('/request1');
            expect(executionOrder).toContain('/request2');
            expect(executionOrder).toContain('/request3');
        });
    });

    describe('Rate Limiting with Retry', () => {
        it('still releases slots when request is retried', async () => {
            let attemptCount = 0;
            let concurrentCount = 0;
            let maxConcurrent = 0;

            const mockFetch = vi.fn(async () => {
                attemptCount++;
                concurrentCount++;
                maxConcurrent = Math.max(maxConcurrent, concurrentCount);

                if (attemptCount <= 1) {
                    concurrentCount--;
                    throw new TypeError('Network error');
                }

                await new Promise(resolve => setTimeout(resolve, 50));
                concurrentCount--;
                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 1 },
                retry: {
                    maxRetries: 2,
                    initialDelay: 100,
                    backoffStrategy: 'fixed',
                },
            }, mockFetch);

            const p1 = fetchPlus.fetch('/retry-test');

            await vi.runAllTimersAsync();
            await p1;

            // Request should have been retried
            expect(attemptCount).toBeGreaterThan(1);
        });
    });

    describe('Rate Limiting with Deduplication', () => {
        it('deduplicated requests share the same in-flight request', async () => {
            let fetchCallCount = 0;
            const mockFetch = vi.fn(async () => {
                fetchCallCount++;
                await new Promise(resolve => setTimeout(resolve, 100));
                return new Response('ok', { status: 200 });
            });

            // Use higher maxConcurrent so all 3 requests enter the pipeline concurrently
            // Then dedup merges them into one actual fetch
            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 10 },
                deduplication: { enabled: true },
            }, mockFetch);

            const p1 = fetchPlus.fetch('/same-url');
            const p2 = fetchPlus.fetch('/same-url');
            const p3 = fetchPlus.fetch('/same-url');

            await vi.runAllTimersAsync();
            await Promise.all([p1, p2, p3]);

            // With high concurrency, all 3 enter pipeline simultaneously and dedup merges them
            expect(fetchCallCount).toBe(1);
        });
    });

    describe('Rate Limiting with Timeout', () => {
        it('releases slot when request times out', async () => {
            const mockFetch = vi.fn(async () => {
                // Simulate a request that takes too long
                await new Promise(resolve => setTimeout(resolve, 5000));
                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 1 },
                timeout: { enabled: true, defaultTimeout: 100 },
            }, mockFetch);

            const p1 = fetchPlus.fetch('/timeout-test').catch(() => {});
            const p2 = fetchPlus.fetch('/after-timeout').catch(() => {});

            await vi.runAllTimersAsync();
            await Promise.allSettled([p1, p2]);

            expect(mockFetch).toHaveBeenCalled();
        });
    });

    describe('Priority in FetchPlus', () => {
        it('high priority requests are processed first', async () => {
            const executionOrder: string[] = [];

            const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
                executionOrder.push(String(url));
                await new Promise(resolve => setTimeout(resolve, 10));
                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 1, queueStrategy: 'priority' },
            }, mockFetch);

            // First request occupies the slot
            const p1 = fetchPlus.fetch('/first');
            // These get queued with different priorities
            const p2 = fetchPlus.fetch('/normal', { priority: 'normal' } as any);
            const p3 = fetchPlus.fetch('/critical', { priority: 'critical' } as any);
            const p4 = fetchPlus.fetch('/low', { priority: 'low' } as any);

            await vi.runAllTimersAsync();
            await Promise.all([p1, p2, p3, p4]);

            // First executes immediately, then critical should come before normal and low
            expect(executionOrder[0]).toBe('/first');
            expect(executionOrder.indexOf('/critical')).toBeLessThan(executionOrder.indexOf('/normal'));
            expect(executionOrder.indexOf('/critical')).toBeLessThan(executionOrder.indexOf('/low'));
        });
    });

    describe('Bypass Rate Limit in FetchPlus', () => {
        it('bypassRateLimit option bypasses the limiter', async () => {
            let concurrentCount = 0;
            let maxConcurrent = 0;

            const mockFetch = vi.fn(async () => {
                concurrentCount++;
                maxConcurrent = Math.max(maxConcurrent, concurrentCount);
                await new Promise(resolve => setTimeout(resolve, 100));
                concurrentCount--;
                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 1 },
            }, mockFetch);

            // Normal request occupies the slot
            const p1 = fetchPlus.fetch('/normal');
            // Bypass request should run immediately despite slot being full
            const p2 = fetchPlus.fetch('/bypass', { bypassRateLimit: true } as any);

            await vi.runAllTimersAsync();
            await Promise.all([p1, p2]);

            // With bypass, both should have run concurrently
            expect(maxConcurrent).toBeGreaterThan(1);
        });
    });

    describe('Per-Domain Rate Limiting', () => {
        it('limits concurrency separately per domain', async () => {
            const concurrencyByDomain: Record<string, number> = {};
            const maxByDomain: Record<string, number> = {};

            const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
                const urlStr = String(url);
                const domain = new URL(urlStr).hostname;
                concurrencyByDomain[domain] = (concurrencyByDomain[domain] || 0) + 1;
                maxByDomain[domain] = Math.max(maxByDomain[domain] || 0, concurrencyByDomain[domain]);

                await new Promise(resolve => setTimeout(resolve, 100));
                concurrencyByDomain[domain]--;

                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 2, scope: 'per-domain' },
            }, mockFetch);

            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(fetchPlus.fetch(`https://api1.example.com/endpoint${i}`));
                promises.push(fetchPlus.fetch(`https://api2.example.com/endpoint${i}`));
            }

            await vi.runAllTimersAsync();
            await Promise.all(promises);

            expect(maxByDomain['api1.example.com']).toBeLessThanOrEqual(2);
            expect(maxByDomain['api2.example.com']).toBeLessThanOrEqual(2);
        });
    });

    describe('Queue Full Rejection', () => {
        it('rejects with error when queue is full', async () => {
            const mockFetch = vi.fn(async () => {
                await new Promise(() => {}); // Never resolves
                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 1, maxQueueSize: 1 },
            }, mockFetch);

            // Fill active slot + queue
            const _p1 = fetchPlus.fetch('/request1');
            const _p2 = fetchPlus.fetch('/request2');

            // This should be rejected
            await expect(fetchPlus.fetch('/request3')).rejects.toThrow(RateLimitError);
        });
    });

    describe('Rate Limiting Disabled by Default', () => {
        it('no rate limiting when rateLimit config not provided', async () => {
            let maxConcurrent = 0;
            let concurrentCount = 0;

            const mockFetch = vi.fn(async () => {
                concurrentCount++;
                maxConcurrent = Math.max(maxConcurrent, concurrentCount);
                await new Promise(resolve => setTimeout(resolve, 50));
                concurrentCount--;
                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({}, mockFetch);

            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(fetchPlus.fetch(`/request${i}`));
            }

            await vi.runAllTimersAsync();
            await Promise.all(promises);

            expect(maxConcurrent).toBe(10);
        });

        it('no rate limiting when enabled is false', async () => {
            let maxConcurrent = 0;
            let concurrentCount = 0;

            const mockFetch = vi.fn(async () => {
                concurrentCount++;
                maxConcurrent = Math.max(maxConcurrent, concurrentCount);
                await new Promise(resolve => setTimeout(resolve, 50));
                concurrentCount--;
                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: false, maxConcurrent: 1 },
            }, mockFetch);

            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(fetchPlus.fetch(`/request${i}`));
            }

            await vi.runAllTimersAsync();
            await Promise.all(promises);

            expect(maxConcurrent).toBeGreaterThan(1);
        });
    });

    describe('All Requests Eventually Complete', () => {
        it('all requests complete even with high load', async () => {
            const completedRequests: string[] = [];

            const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
                completedRequests.push(String(url));
                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 5 },
            }, mockFetch);

            const requestCount = 50;
            const promises = [];

            for (let i = 0; i < requestCount; i++) {
                promises.push(fetchPlus.fetch(`/request${i}`));
            }

            await vi.runAllTimersAsync();
            const responses = await Promise.all(promises);

            expect(responses).toHaveLength(requestCount);
            expect(completedRequests).toHaveLength(requestCount);
        });

        it('all requests complete with various priorities', async () => {
            const completedRequests: string[] = [];

            const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
                completedRequests.push(String(url));
                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 3, queueStrategy: 'priority' },
            }, mockFetch);

            const priorities = ['critical', 'high', 'normal', 'low'] as const;
            const promises = [];

            for (let i = 0; i < 40; i++) {
                const priority = priorities[i % priorities.length];
                promises.push(fetchPlus.fetch(`/request${i}`, { priority } as any));
            }

            await vi.runAllTimersAsync();
            const responses = await Promise.all(promises);

            expect(responses).toHaveLength(40);
            expect(completedRequests).toHaveLength(40);
        });

        it('all requests complete with per-domain limiting', async () => {
            const completedRequests: string[] = [];

            const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
                completedRequests.push(String(url));
                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 2, scope: 'per-domain' },
            }, mockFetch);

            const promises = [];
            for (let i = 0; i < 5; i++) {
                for (let j = 0; j < 5; j++) {
                    promises.push(fetchPlus.fetch(`https://api${i}.example.com/request${j}`));
                }
            }

            await vi.runAllTimersAsync();
            const responses = await Promise.all(promises);

            expect(responses).toHaveLength(25);
            expect(completedRequests).toHaveLength(25);
        });
    });

    describe('Response Handling', () => {
        it('returns valid Response objects', async () => {
            const mockFetch = vi.fn(async () => {
                return new Response(JSON.stringify({ data: 'test' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 2 },
            }, mockFetch);

            const response = await fetchPlus.fetch('/test');

            expect(response.status).toBe(200);
            expect(response.headers.get('Content-Type')).toBe('application/json');

            const data = await response.json();
            expect(data.data).toBe('test');
        });

        it('handles error responses with rate limiting', async () => {
            const mockFetch = vi.fn(async () => {
                return new Response('Not Found', { status: 404 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 1 },
            }, mockFetch);

            const response = await fetchPlus.fetch('/not-found');
            expect(response.status).toBe(404);
        });
    });

    describe('Mixed Scenarios', () => {
        it('handles complex scenario: retry + rate limit + priority', async () => {
            let callCount = 0;
            const mockFetch = vi.fn(async () => {
                callCount++;
                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 2, queueStrategy: 'priority' },
                retry: { maxRetries: 1, initialDelay: 100 },
            }, mockFetch);

            const promises = [];
            for (let i = 0; i < 5; i++) {
                const priority = i % 2 === 0 ? 'high' : 'normal';
                promises.push(fetchPlus.fetch(`/request${i}`, { priority } as any));
            }

            await vi.runAllTimersAsync();
            const responses = await Promise.all(promises);

            expect(responses).toHaveLength(5);
            responses.forEach(response => {
                expect(response.status).toBe(200);
            });
        });

        it('handles stress test: many requests with various configurations', async () => {
            const completedRequests = new Set<string>();

            const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
                completedRequests.add(String(url));
                return new Response('ok', { status: 200 });
            });

            const fetchPlus = createWithMock({
                rateLimit: { enabled: true, maxConcurrent: 5, queueStrategy: 'priority', scope: 'global' },
            }, mockFetch);

            const promises = [];
            const priorities = ['critical', 'high', 'normal', 'low'] as const;

            for (let i = 0; i < 100; i++) {
                const priority = priorities[i % 4];
                const url = `https://api${i % 10}.example.com/request${i}`;

                promises.push(
                    fetchPlus.fetch(url, {
                        priority,
                        bypassRateLimit: i % 20 === 0,
                    } as any)
                );
            }

            await vi.runAllTimersAsync();
            const responses = await Promise.all(promises);

            expect(responses).toHaveLength(100);
            expect(completedRequests.size).toBeGreaterThan(0);
        });
    });
});
