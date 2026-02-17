import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FetchPlus } from '../../src/core/FetchPlus.js';
import { InMemoryCache } from '../../src/cache/InMemoryCache.js';

describe('FetchPlus', () => {
    let fetchPlus: FetchPlus;
    let mockFetch: ReturnType<typeof vi.fn>;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        // Save original fetch
        originalFetch = globalThis.fetch;

        // Create mock fetch
        mockFetch = vi.fn();
        globalThis.fetch = mockFetch;

        // Create FetchPlus instance with InMemoryCache and without global replacement
        fetchPlus = new FetchPlus({
            cache: new InMemoryCache(),
            replaceGlobalFetch: false,
        });
    });

    afterEach(() => {
        // Restore original fetch
        globalThis.fetch = originalFetch;
        fetchPlus.restore();
    });

    describe('Basic Fetch Functionality', () => {
        it('passes through basic fetch call', async () => {
            const mockResponse = new Response('test data', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse);

            const response = await fetchPlus.fetch('https://api.example.com/data');

            expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', undefined);
            expect(response.status).toBe(200);
            const text = await response.text();
            expect(text).toBe('test data');
        });

        it('passes init options to native fetch', async () => {
            const mockResponse = new Response('ok', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse);

            await fetchPlus.fetch('https://api.example.com/data', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
            });

            expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
            });
        });
    });

    describe('Caching Behavior', () => {
        it('caches GET request on second call', async () => {
            const mockResponse1 = new Response('first', { status: 200 });
            const mockResponse2 = new Response('second', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse1);
            mockFetch.mockResolvedValueOnce(mockResponse2);

            // First call - should hit network
            const response1 = await fetchPlus.fetch('https://api.example.com/data');
            expect(await response1.text()).toBe('first');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // Second call - should return cached response
            const response2 = await fetchPlus.fetch('https://api.example.com/data');
            expect(await response2.text()).toBe('first'); // Same as first
            expect(mockFetch).toHaveBeenCalledTimes(1); // No additional call
        });

        it('does not cache POST request by default', async () => {
            const mockResponse1 = new Response('first', { status: 200 });
            const mockResponse2 = new Response('second', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse1);
            mockFetch.mockResolvedValueOnce(mockResponse2);

            // First POST
            await fetchPlus.fetch('https://api.example.com/data', { method: 'POST' });
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // Second POST - should hit network again
            await fetchPlus.fetch('https://api.example.com/data', { method: 'POST' });
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        describe('Bug #2 regression: forceRefresh bypasses cache', () => {
            it('forceRefresh bypasses cache and fetches fresh data', async () => {
                const mockResponse1 = new Response('first', { status: 200 });
                const mockResponse2 = new Response('second', { status: 200 });
                mockFetch.mockResolvedValueOnce(mockResponse1);
                mockFetch.mockResolvedValueOnce(mockResponse2);

                // First call - caches response
                const response1 = await fetchPlus.fetch('https://api.example.com/data');
                expect(await response1.text()).toBe('first');
                expect(mockFetch).toHaveBeenCalledTimes(1);

                // Second call with forceRefresh - should bypass cache
                const response2 = await fetchPlus.fetch('https://api.example.com/data', {
                    forceRefresh: true,
                });
                expect(await response2.text()).toBe('second');
                expect(mockFetch).toHaveBeenCalledTimes(2);

                // Third call without forceRefresh - should return new cached response
                const response3 = await fetchPlus.fetch('https://api.example.com/data');
                expect(await response3.text()).toBe('second'); // Updated cache
                expect(mockFetch).toHaveBeenCalledTimes(2); // No new fetch
            });
        });

        describe('Bug #2/3 regression: skipInterceptors', () => {
            it('skipInterceptors skips all interceptors', async () => {
                const mockResponse = new Response('data', { status: 200 });
                mockFetch.mockResolvedValueOnce(mockResponse);

                const requestInterceptor = vi.fn((input) => input);
                const responseInterceptor = vi.fn((res) => res);

                fetchPlus.getInterceptors().addRequestInterceptor(requestInterceptor);
                fetchPlus.getInterceptors().addResponseInterceptor(responseInterceptor);

                await fetchPlus.fetch('https://api.example.com/data', {
                    skipInterceptors: true,
                });

                expect(requestInterceptor).not.toHaveBeenCalled();
                expect(responseInterceptor).not.toHaveBeenCalled();
            });
        });

        it('fetchPlusCache: false disables caching for request', async () => {
            const mockResponse1 = new Response('first', { status: 200 });
            const mockResponse2 = new Response('second', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse1);
            mockFetch.mockResolvedValueOnce(mockResponse2);

            // First call with caching disabled
            await fetchPlus.fetch('https://api.example.com/data', {
                fetchPlusCache: false,
            });
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // Second call with caching disabled - should hit network
            await fetchPlus.fetch('https://api.example.com/data', {
                fetchPlusCache: false,
            });
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('does not cache error responses', async () => {
            const mockResponse1 = new Response('Not Found', { status: 404 });
            const mockResponse2 = new Response('Still Not Found', { status: 404 });
            mockFetch.mockResolvedValueOnce(mockResponse1);
            mockFetch.mockResolvedValueOnce(mockResponse2);

            await fetchPlus.fetch('https://api.example.com/data');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // Second call should hit network because 404 is not cacheable
            await fetchPlus.fetch('https://api.example.com/data');
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('does not cache responses with cache-control: no-store', async () => {
            const mockResponse1 = new Response('data', {
                status: 200,
                headers: { 'cache-control': 'no-store' },
            });
            const mockResponse2 = new Response('data2', {
                status: 200,
                headers: { 'cache-control': 'no-store' },
            });
            mockFetch.mockResolvedValueOnce(mockResponse1);
            mockFetch.mockResolvedValueOnce(mockResponse2);

            await fetchPlus.fetch('https://api.example.com/data');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // Should hit network again
            await fetchPlus.fetch('https://api.example.com/data');
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('Interceptors', () => {
        it('executes request interceptor', async () => {
            const mockResponse = new Response('data', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse);

            let interceptorCalled = false;
            fetchPlus.getInterceptors().addRequestInterceptor((input, init) => {
                interceptorCalled = true;
                return { input: 'https://modified.example.com', init };
            });

            await fetchPlus.fetch('https://api.example.com/data');

            expect(interceptorCalled).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith('https://modified.example.com', undefined);
        });

        it('executes response interceptor', async () => {
            const mockResponse = new Response('original', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse);

            fetchPlus.getInterceptors().addResponseInterceptor(async (response) => {
                return new Response('modified', { status: response.status });
            });

            const response = await fetchPlus.fetch('https://api.example.com/data');
            const text = await response.text();

            expect(text).toBe('modified');
        });

        it('executes error interceptor on fetch failure', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const fallbackResponse = new Response('fallback', { status: 200 });
            fetchPlus.getInterceptors().addErrorInterceptor(() => fallbackResponse);

            const response = await fetchPlus.fetch('https://api.example.com/data');
            const text = await response.text();

            expect(text).toBe('fallback');
        });

        it('error propagates when error interceptor returns void', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            fetchPlus.getInterceptors().addErrorInterceptor((error) => {
                // Just log, don't handle
                console.log(error.message);
            });

            await expect(fetchPlus.fetch('https://api.example.com/data')).rejects.toThrow(
                'Network error'
            );
        });
    });

    describe('init() and restore()', () => {
        it('init() replaces globalThis.fetch', () => {
            const customFetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
            });

            customFetchPlus.init({ replaceGlobalFetch: true });

            // fetch is replaced (not the original mock anymore)
            expect(globalThis.fetch).not.toBe(originalFetch);

            customFetchPlus.restore();
        });

        it('restore() restores original fetch', () => {
            const customFetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
                replaceGlobalFetch: false,
            });

            const beforeInit = globalThis.fetch;
            customFetchPlus.init({ replaceGlobalFetch: true });

            expect(globalThis.fetch).not.toBe(beforeInit);

            customFetchPlus.restore();

            // After restore, fetch should work as the original (bound copy)
            expect(globalThis.fetch).not.toBe(customFetchPlus.fetch);
        });
    });

    describe('Bug #7 regression: Constructor handles missing fetch gracefully', () => {
        it('constructor handles missing fetch without throwing', () => {
            const savedFetch = globalThis.fetch;
            // @ts-ignore - testing runtime behavior
            delete globalThis.fetch;

            expect(() => {
                const customFetchPlus = new FetchPlus({
                    cache: new InMemoryCache(),
                });
                // Constructor should not throw
                expect(customFetchPlus).toBeDefined();
            }).not.toThrow();

            // Restore fetch
            globalThis.fetch = savedFetch;
        });

        it('throws meaningful error when fetch is called without available fetch', async () => {
            const savedFetch = globalThis.fetch;
            // @ts-ignore
            delete globalThis.fetch;

            const customFetchPlus = new FetchPlus({
                cache: new InMemoryCache(),
            });

            await expect(customFetchPlus.fetch('https://api.example.com')).rejects.toThrow(
                'globalThis.fetch is not available'
            );

            // Restore fetch
            globalThis.fetch = savedFetch;
        });
    });

    describe('POST/PUT with headers and body', () => {
        it('passes JSON body and headers through to native fetch on POST', async () => {
            const mockResponse = new Response('{"id":1}', {
                status: 201,
                headers: { 'content-type': 'application/json' },
            });
            mockFetch.mockResolvedValueOnce(mockResponse);

            const body = JSON.stringify({ name: 'Alice', email: 'alice@example.com' });
            const response = await fetchPlus.fetch('https://api.example.com/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer test-token',
                },
                body,
            });

            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [calledUrl, calledInit] = mockFetch.mock.calls[0];
            expect(calledUrl).toBe('https://api.example.com/users');
            expect(calledInit.method).toBe('POST');
            expect(calledInit.body).toBe(body);
            expect(calledInit.headers['Content-Type']).toBe('application/json');
            expect(calledInit.headers['Authorization']).toBe('Bearer test-token');

            expect(response.status).toBe(201);
            const data = await response.json();
            expect(data).toEqual({ id: 1 });
        });

        it('passes JSON body and headers through to native fetch on PUT', async () => {
            const mockResponse = new Response('{"id":1,"name":"Bob"}', {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
            mockFetch.mockResolvedValueOnce(mockResponse);

            const body = JSON.stringify({ name: 'Bob' });
            const response = await fetchPlus.fetch('https://api.example.com/users/1', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body,
            });

            const [calledUrl, calledInit] = mockFetch.mock.calls[0];
            expect(calledUrl).toBe('https://api.example.com/users/1');
            expect(calledInit.method).toBe('PUT');
            expect(calledInit.body).toBe(body);
            expect(calledInit.headers['Content-Type']).toBe('application/json');

            const data = await response.json();
            expect(data).toEqual({ id: 1, name: 'Bob' });
        });

        it('passes FormData body on POST without mangling it', async () => {
            const mockResponse = new Response('ok', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse);

            const formData = new FormData();
            formData.append('field1', 'value1');
            formData.append('field2', 'value2');

            await fetchPlus.fetch('https://api.example.com/upload', {
                method: 'POST',
                body: formData,
            });

            const [, calledInit] = mockFetch.mock.calls[0];
            expect(calledInit.method).toBe('POST');
            expect(calledInit.body).toBe(formData);
        });

        it('passes Headers object (not just plain object) correctly on POST', async () => {
            const mockResponse = new Response('ok', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse);

            const headers = new Headers();
            headers.set('Content-Type', 'application/json');
            headers.set('X-Custom-Header', 'custom-value');

            const body = JSON.stringify({ data: true });
            await fetchPlus.fetch('https://api.example.com/data', {
                method: 'POST',
                headers,
                body,
            });

            const [, calledInit] = mockFetch.mock.calls[0];
            expect(calledInit.method).toBe('POST');
            expect(calledInit.body).toBe(body);
            expect(calledInit.headers).toBe(headers);
        });

        it('POST with body is not cached by default', async () => {
            const body = JSON.stringify({ query: 'test' });
            mockFetch
                .mockResolvedValueOnce(new Response('{"result":1}', { status: 200 }))
                .mockResolvedValueOnce(new Response('{"result":2}', { status: 200 }));

            const res1 = await fetchPlus.fetch('https://api.example.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });
            const data1 = await res1.json();

            const res2 = await fetchPlus.fetch('https://api.example.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });
            const data2 = await res2.json();

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(data1.result).toBe(1);
            expect(data2.result).toBe(2);
        });

        it('request interceptor can modify headers while preserving body on POST', async () => {
            const mockResponse = new Response('ok', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse);

            fetchPlus.getInterceptors().addRequestInterceptor((input, init) => {
                const headers = new Headers(init?.headers);
                headers.set('Authorization', 'Bearer injected-token');
                return { input, init: { ...init, headers } };
            });

            const body = JSON.stringify({ action: 'create' });
            await fetchPlus.fetch('https://api.example.com/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });

            const [, calledInit] = mockFetch.mock.calls[0];
            expect(calledInit.method).toBe('POST');
            expect(calledInit.body).toBe(body);
            // Headers were converted to a Headers object by the interceptor
            expect(calledInit.headers.get('Authorization')).toBe('Bearer injected-token');
            expect(calledInit.headers.get('Content-Type')).toBe('application/json');
        });

        it('request interceptor can modify body on PUT', async () => {
            const mockResponse = new Response('ok', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse);

            fetchPlus.getInterceptors().addRequestInterceptor((input, init) => {
                // Interceptor wraps the original body in an envelope
                const originalBody = init?.body ? JSON.parse(init.body as string) : {};
                const wrappedBody = JSON.stringify({ data: originalBody, timestamp: 12345 });
                return { input, init: { ...init, body: wrappedBody } };
            });

            await fetchPlus.fetch('https://api.example.com/items/1', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'updated' }),
            });

            const [, calledInit] = mockFetch.mock.calls[0];
            expect(calledInit.method).toBe('PUT');
            const sentBody = JSON.parse(calledInit.body as string);
            expect(sentBody).toEqual({ data: { name: 'updated' }, timestamp: 12345 });
        });

        it('response interceptor works correctly with POST response', async () => {
            const mockResponse = new Response('{"id":42,"name":"test"}', {
                status: 201,
                headers: { 'content-type': 'application/json' },
            });
            mockFetch.mockResolvedValueOnce(mockResponse);

            fetchPlus.getInterceptors().addResponseInterceptor(async (response) => {
                const data = await response.clone().json();
                data.intercepted = true;
                return new Response(JSON.stringify(data), {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                });
            });

            const response = await fetchPlus.fetch('https://api.example.com/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'test' }),
            });

            expect(response.status).toBe(201);
            const data = await response.json();
            expect(data).toEqual({ id: 42, name: 'test', intercepted: true });
        });

        it('error interceptor fires on POST network failure', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

            const errorHandler = vi.fn(() => {
                return new Response('{"error":"offline"}', {
                    status: 503,
                    headers: { 'content-type': 'application/json' },
                });
            });
            fetchPlus.getInterceptors().addErrorInterceptor(errorHandler);

            const response = await fetchPlus.fetch('https://api.example.com/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'test' }),
            });

            expect(errorHandler).toHaveBeenCalledTimes(1);
            expect(response.status).toBe(503);
            const data = await response.json();
            expect(data).toEqual({ error: 'offline' });
        });

        it('PATCH with body and custom headers works correctly', async () => {
            const mockResponse = new Response('{"patched":true}', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse);

            const body = JSON.stringify({ name: 'patched-name' });
            await fetchPlus.fetch('https://api.example.com/users/1', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'If-Match': 'etag-123',
                },
                body,
            });

            const [calledUrl, calledInit] = mockFetch.mock.calls[0];
            expect(calledUrl).toBe('https://api.example.com/users/1');
            expect(calledInit.method).toBe('PATCH');
            expect(calledInit.body).toBe(body);
            expect(calledInit.headers['If-Match']).toBe('etag-123');
        });

        it('DELETE with body works correctly', async () => {
            const mockResponse = new Response('', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse);

            const body = JSON.stringify({ reason: 'user requested' });
            await fetchPlus.fetch('https://api.example.com/users/1', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body,
            });

            const [, calledInit] = mockFetch.mock.calls[0];
            expect(calledInit.method).toBe('DELETE');
            expect(calledInit.body).toBe(body);
        });

        it('multiple interceptors preserve body and headers through the chain on POST', async () => {
            const mockResponse = new Response('ok', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse);

            // Interceptor 1: adds auth header
            fetchPlus.getInterceptors().addRequestInterceptor((input, init) => {
                const headers = new Headers(init?.headers);
                headers.set('Authorization', 'Bearer token');
                return { input, init: { ...init, headers } };
            });

            // Interceptor 2: adds a tracing header (body should still be intact)
            fetchPlus.getInterceptors().addRequestInterceptor((input, init) => {
                const headers = new Headers(init?.headers);
                headers.set('X-Trace-Id', 'trace-abc');
                return { input, init: { ...init, headers } };
            });

            const body = JSON.stringify({ payload: 'important' });
            await fetchPlus.fetch('https://api.example.com/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });

            const [, calledInit] = mockFetch.mock.calls[0];
            expect(calledInit.method).toBe('POST');
            expect(calledInit.body).toBe(body);
            expect(calledInit.headers.get('Authorization')).toBe('Bearer token');
            expect(calledInit.headers.get('X-Trace-Id')).toBe('trace-abc');
            expect(calledInit.headers.get('Content-Type')).toBe('application/json');
        });

        it('skipInterceptors preserves body and headers on POST', async () => {
            const mockResponse = new Response('ok', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse);

            // This interceptor should NOT run
            fetchPlus.getInterceptors().addRequestInterceptor((input, init) => {
                return { input, init: { ...init, body: 'REPLACED' } };
            });

            const body = JSON.stringify({ secret: true });
            await fetchPlus.fetch('https://api.example.com/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                skipInterceptors: true,
            });

            const [, calledInit] = mockFetch.mock.calls[0];
            expect(calledInit.body).toBe(body);
            expect(calledInit.method).toBe('POST');
        });

        it('POST with URLSearchParams body works correctly', async () => {
            const mockResponse = new Response('ok', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse);

            const params = new URLSearchParams();
            params.append('username', 'alice');
            params.append('password', 'secret');

            await fetchPlus.fetch('https://api.example.com/login', {
                method: 'POST',
                body: params,
            });

            const [, calledInit] = mockFetch.mock.calls[0];
            expect(calledInit.method).toBe('POST');
            expect(calledInit.body).toBe(params);
        });
    });

    describe('Cache Management', () => {
        it('clearCache() clears all cache entries', async () => {
            const mockResponse1 = new Response('data1', { status: 200 });
            const mockResponse2 = new Response('data2', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse1);
            mockFetch.mockResolvedValueOnce(mockResponse2);

            // Make two cacheable requests
            await fetchPlus.fetch('https://api.example.com/data1');
            await fetchPlus.fetch('https://api.example.com/data2');

            // Clear cache
            await fetchPlus.clearCache();

            // Both should hit network again
            const mockResponse3 = new Response('fresh1', { status: 200 });
            const mockResponse4 = new Response('fresh2', { status: 200 });
            mockFetch.mockResolvedValueOnce(mockResponse3);
            mockFetch.mockResolvedValueOnce(mockResponse4);

            await fetchPlus.fetch('https://api.example.com/data1');
            await fetchPlus.fetch('https://api.example.com/data2');

            expect(mockFetch).toHaveBeenCalledTimes(4); // 2 initial + 2 after clear
        });
    });
});
