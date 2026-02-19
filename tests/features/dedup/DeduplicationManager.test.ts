import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeduplicationManager } from '../../../src/features/dedup/DeduplicationManager.js';
import { generateCacheKey } from '../../../src/utils/cacheKey.js';

describe('DeduplicationManager', () => {
    let dedup: DeduplicationManager;

    beforeEach(() => {
        dedup = new DeduplicationManager();
    });

    afterEach(() => {
        dedup.clearAll();
    });

    describe('Basic Deduplication', () => {
        it('identical concurrent requests return same promise (only 1 network call)', async () => {
            const mockFetch = vi.fn(async () => new Response('data', { status: 200 }));

            // Fire two identical requests without awaiting
            const p1 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const p2 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);

            // Both should resolve to the same underlying fetch call
            const [r1, r2] = await Promise.all([p1, p2]);

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(r1.status).toBe(200);
            expect(r2.status).toBe(200);
        });

        it('different URLs are NOT deduplicated (2 network calls)', async () => {
            const mockFetch = vi.fn(async () => new Response('data', { status: 200 }));

            // Fire requests to different URLs
            const p1 = dedup.deduplicate('https://api.example.com/data1', undefined, mockFetch);
            const p2 = dedup.deduplicate('https://api.example.com/data2', undefined, mockFetch);

            await Promise.all([p1, p2]);

            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('different HTTP methods to same URL are NOT deduplicated', async () => {
            const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));

            const p1 = dedup.deduplicate('https://api.example.com/data', { method: 'GET' }, mockFetch);
            const p2 = dedup.deduplicate('https://api.example.com/data', { method: 'POST' }, mockFetch);

            await Promise.all([p1, p2]);

            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('requests with different bodies are NOT deduplicated', async () => {
            const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));

            const body1 = JSON.stringify({ id: 1 });
            const body2 = JSON.stringify({ id: 2 });

            const p1 = dedup.deduplicate(
                'https://api.example.com/search',
                { method: 'POST', body: body1 },
                mockFetch
            );
            const p2 = dedup.deduplicate(
                'https://api.example.com/search',
                { method: 'POST', body: body2 },
                mockFetch
            );

            await Promise.all([p1, p2]);

            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('Deduplication Lifecycle', () => {
        it('in-flight request removed after successful completion (next identical request = new call)', async () => {
            const mockFetch = vi.fn(async () => new Response('data1', { status: 200 }));

            // First request
            const p1 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const r1 = await p1;

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(r1.status).toBe(200);

            // Request is now cleaned up from in-flight
            expect(dedup.getInFlightCount()).toBe(0);

            // Second identical request should trigger new fetch
            mockFetch.mockResolvedValueOnce(new Response('data2', { status: 200 }));
            const p2 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const r2 = await p2;

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(r2.status).toBe(200);
        });

        it('in-flight request removed after error (next identical request = new call)', async () => {
            const mockFetch = vi.fn(async () => {
                throw new Error('Network error');
            });

            // First request errors
            const p1 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch).catch(e => e);
            const err1 = await p1;

            expect(err1).toBeInstanceOf(Error);
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // Request is cleaned up from in-flight
            expect(dedup.getInFlightCount()).toBe(0);

            // Second identical request should trigger new fetch
            mockFetch.mockImplementationOnce(async () => new Response('success', { status: 200 }));
            const p2 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const r2 = await p2;

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(r2.status).toBe(200);
        });

        it('response is cloned for each waiting request (both can read body independently)', async () => {
            const mockFetch = vi.fn(async () => new Response('shared-data', { status: 200 }));

            // Fire two concurrent identical requests
            const p1 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const p2 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);

            const [r1, r2] = await Promise.all([p1, p2]);

            // Both should be able to read the body independently
            const text1 = await r1.text();
            const text2 = await r2.text();

            expect(text1).toBe('shared-data');
            expect(text2).toBe('shared-data');
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('error propagated to ALL waiting requests', async () => {
            const networkError = new Error('Network timeout');
            const mockFetch = vi.fn(async () => {
                throw networkError;
            });

            // Fire three concurrent identical requests
            const p1 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch).catch(e => e);
            const p2 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch).catch(e => e);
            const p3 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch).catch(e => e);

            const [err1, err2, err3] = await Promise.all([p1, p2, p3]);

            // All three should get the same error
            expect(err1).toBeInstanceOf(Error);
            expect(err2).toBeInstanceOf(Error);
            expect(err3).toBeInstanceOf(Error);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('Concurrent Request Scenarios', () => {
        it('3+ identical concurrent requests all deduplicated (1 network call)', async () => {
            const mockFetch = vi.fn(async () => new Response('data', { status: 200 }));

            const p1 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const p2 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const p3 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const p4 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);

            const responses = await Promise.all([p1, p2, p3, p4]);

            expect(mockFetch).toHaveBeenCalledTimes(1);
            responses.forEach(r => {
                expect(r.status).toBe(200);
            });
        });

        it('request arriving AFTER first completes triggers new network call', async () => {
            const mockFetch = vi.fn(async () => new Response('data', { status: 200 }));

            // First request
            const p1 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            await p1;
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // Request is no longer in-flight
            expect(dedup.getInFlightCount()).toBe(0);

            // Second request arrives later
            mockFetch.mockResolvedValueOnce(new Response('fresh-data', { status: 200 }));
            const p2 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            await p2;

            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('10+ rapid-fire identical requests = 1 network call', async () => {
            const mockFetch = vi.fn(async () => new Response('data', { status: 200 }));

            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(dedup.deduplicate('https://api.example.com/data', undefined, mockFetch));
            }

            const responses = await Promise.all(promises);

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(responses).toHaveLength(10);
            responses.forEach(r => {
                expect(r.status).toBe(200);
            });
        });
    });

    describe('Configuration', () => {
        it('custom key generator is respected', async () => {
            const customGenerator = vi.fn((input, init) => {
                // Only use URL, ignore method/body
                return String(input);
            });

            const dedup2 = new DeduplicationManager({ keyGenerator: customGenerator });
            const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));

            // These normally would NOT deduplicate (different methods)
            // But with custom generator that ignores method, they WILL deduplicate
            const p1 = dedup2.deduplicate('https://api.example.com/data', { method: 'GET' }, mockFetch);
            const p2 = dedup2.deduplicate('https://api.example.com/data', { method: 'POST' }, mockFetch);

            await Promise.all([p1, p2]);

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(customGenerator).toHaveBeenCalled();

            dedup2.clearAll();
        });

        it('hasInFlight() returns correct status', async () => {
            const mockFetch = vi.fn(
                () => new Promise(resolve => {
                    setTimeout(() => resolve(new Response('data', { status: 200 })), 100);
                })
            );

            const url = 'https://api.example.com/data';

            // Before request
            expect(dedup.hasInFlight(url, undefined)).toBe(false);

            // During request
            const promise = dedup.deduplicate(url, undefined, mockFetch);
            expect(dedup.hasInFlight(url, undefined)).toBe(true);

            // After request
            await promise;
            expect(dedup.hasInFlight(url, undefined)).toBe(false);
        });

        it('getInFlightCount() returns accurate count', async () => {
            const mockFetch = vi.fn(
                () => new Promise(resolve => {
                    setTimeout(() => resolve(new Response('data', { status: 200 })), 50);
                })
            );

            expect(dedup.getInFlightCount()).toBe(0);

            // Start 3 requests
            const p1 = dedup.deduplicate('https://api.example.com/data1', undefined, mockFetch);
            expect(dedup.getInFlightCount()).toBe(1);

            const p2 = dedup.deduplicate('https://api.example.com/data2', undefined, mockFetch);
            expect(dedup.getInFlightCount()).toBe(2);

            const p3 = dedup.deduplicate('https://api.example.com/data3', undefined, mockFetch);
            expect(dedup.getInFlightCount()).toBe(3);

            await Promise.all([p1, p2, p3]);

            expect(dedup.getInFlightCount()).toBe(0);
        });

        it('clearAll() removes all tracked requests', async () => {
            const mockFetch = vi.fn(
                () => new Promise(resolve => {
                    setTimeout(() => resolve(new Response('data', { status: 200 })), 100);
                })
            );

            // Start multiple requests
            const p1 = dedup.deduplicate('https://api.example.com/data1', undefined, mockFetch);
            const p2 = dedup.deduplicate('https://api.example.com/data2', undefined, mockFetch);

            expect(dedup.getInFlightCount()).toBe(2);

            dedup.clearAll();

            expect(dedup.getInFlightCount()).toBe(0);
            expect(dedup.hasInFlight('https://api.example.com/data1', undefined)).toBe(false);
            expect(dedup.hasInFlight('https://api.example.com/data2', undefined)).toBe(false);
        });
    });

    describe('Memory Management', () => {
        it('completed requests are cleaned up (getInFlightCount drops to 0)', async () => {
            const mockFetch = vi.fn(async () => new Response('data', { status: 200 }));

            const p1 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const p2 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const p3 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);

            expect(dedup.getInFlightCount()).toBe(1);

            await Promise.all([p1, p2, p3]);

            expect(dedup.getInFlightCount()).toBe(0);
        });

        it('error cleanup works the same as success cleanup', async () => {
            const mockFetch = vi.fn(async () => {
                throw new Error('Test error');
            });

            const p1 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch).catch(() => {});
            const p2 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch).catch(() => {});

            expect(dedup.getInFlightCount()).toBe(1);

            await Promise.all([p1, p2]);

            expect(dedup.getInFlightCount()).toBe(0);
        });
    });

    describe('Default Key Generator Usage', () => {
        it('uses generateCacheKey by default for creating dedup keys', async () => {
            const dedup2 = new DeduplicationManager();
            const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));

            // The default key generator should match the cache key generator behavior
            const url = 'https://api.example.com/data';
            const init = { method: 'POST', body: '{"id":1}' };

            const p1 = dedup2.deduplicate(url, init, mockFetch);
            const p2 = dedup2.deduplicate(url, init, mockFetch);

            await Promise.all([p1, p2]);

            // Should deduplicate because same URL and init
            expect(mockFetch).toHaveBeenCalledTimes(1);

            dedup2.clearAll();
        });
    });

    describe('Response Cloning Edge Cases', () => {
        it('cloned responses have independent status codes', async () => {
            const mockFetch = vi.fn(async () => new Response('data', { status: 201 }));

            const p1 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const p2 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);

            const [r1, r2] = await Promise.all([p1, p2]);

            expect(r1.status).toBe(201);
            expect(r2.status).toBe(201);
        });

        it('cloned responses have independent headers', async () => {
            const mockFetch = vi.fn(
                async () => new Response('data', {
                    status: 200,
                    headers: { 'content-type': 'application/json', 'x-custom': 'value' }
                })
            );

            const p1 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const p2 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);

            const [r1, r2] = await Promise.all([p1, p2]);

            expect(r1.headers.get('content-type')).toBe('application/json');
            expect(r2.headers.get('content-type')).toBe('application/json');
            expect(r1.headers.get('x-custom')).toBe('value');
            expect(r2.headers.get('x-custom')).toBe('value');
        });

        it('cloned responses can be read multiple times independently', async () => {
            const mockFetch = vi.fn(async () => new Response('shared-data', { status: 200 }));

            const p1 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const p2 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);

            const [r1, r2] = await Promise.all([p1, p2]);

            // Read r1 twice
            const text1a = await r1.clone().text();
            const text1b = await r1.text();
            expect(text1a).toBe('shared-data');
            expect(text1b).toBe('shared-data');

            // Read r2 twice
            const text2a = await r2.clone().text();
            const text2b = await r2.text();
            expect(text2a).toBe('shared-data');
            expect(text2b).toBe('shared-data');

            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('Request Information Handling', () => {
        it('handles string URLs', async () => {
            const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));

            const p1 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const p2 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);

            await Promise.all([p1, p2]);

            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('handles URL objects', async () => {
            const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));

            const url1 = new URL('https://api.example.com/data');
            const url2 = new URL('https://api.example.com/data');

            const p1 = dedup.deduplicate(url1, undefined, mockFetch);
            const p2 = dedup.deduplicate(url2, undefined, mockFetch);

            await Promise.all([p1, p2]);

            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('handles Request objects', async () => {
            const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));

            const req1 = new Request('https://api.example.com/data', { method: 'GET' });
            const req2 = new Request('https://api.example.com/data', { method: 'GET' });

            const p1 = dedup.deduplicate(req1, undefined, mockFetch);
            const p2 = dedup.deduplicate(req2, undefined, mockFetch);

            await Promise.all([p1, p2]);

            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('JSON Response Handling', () => {
        it('cloned responses can independently parse JSON', async () => {
            const mockFetch = vi.fn(
                async () => new Response(JSON.stringify({ id: 42, name: 'test' }), { status: 200 })
            );

            const p1 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);
            const p2 = dedup.deduplicate('https://api.example.com/data', undefined, mockFetch);

            const [r1, r2] = await Promise.all([p1, p2]);

            const data1 = await r1.json();
            const data2 = await r2.json();

            expect(data1).toEqual({ id: 42, name: 'test' });
            expect(data2).toEqual({ id: 42, name: 'test' });
        });
    });
});
