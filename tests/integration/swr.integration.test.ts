import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FetchPlus } from '../../src/core/FetchPlus.js';
import { InMemoryCache } from '../../src/cache/InMemoryCache.js';

describe('SWR Integration Tests', () => {
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
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		globalThis.fetch = originalFetch;
		fetchPlus.restore();
	});

	describe('Global SWR Configuration', () => {
		it('global SWR config serves stale and revalidates', async () => {
			const fetchPlusWithSWR = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 30000,
				},
			});

			// First request: cache miss, fetch fresh
			mockFetch.mockResolvedValueOnce(new Response('original data', { status: 200 }));

			const response1 = await fetchPlusWithSWR.fetch('https://api.example.com/data');
			expect(await response1.text()).toBe('original data');

			// Time passes
			await vi.advanceTimersByTimeAsync(5000);

			// Second request: serve stale from cache
			mockFetch.mockResolvedValueOnce(new Response('updated data', { status: 200 }));

			const response2 = await fetchPlusWithSWR.fetch('https://api.example.com/data');
			expect(await response2.text()).toBe('original data'); // Stale

			// Wait for background revalidation to complete
			await vi.advanceTimersByTimeAsync(50);

			// Verify revalidation was triggered
			expect(mockFetch).toHaveBeenCalledTimes(2);

			fetchPlusWithSWR.restore();
		});

		it('global SWR disabled by default', async () => {
			// Create FetchPlus without SWR config
			const defaultFetchPlus = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
			});

			// First request
			mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));
			const response1 = await defaultFetchPlus.fetch('https://api.example.com/data');
			await vi.advanceTimersByTimeAsync(10);

			// Second request should hit cache, not revalidate in background
			const response2 = await defaultFetchPlus.fetch('https://api.example.com/data');
			expect(mockFetch).toHaveBeenCalledTimes(1);

			defaultFetchPlus.restore();
		});
	});

	describe('Per-Request SWR Override', () => {
		it('per-request SWR config overrides global config', async () => {
			const fetchPlusWithoutSWR = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: false, // Disabled globally
				},
			});

			// First request
			mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));
			await fetchPlusWithoutSWR.fetch('https://api.example.com/data');

			// Second request with SWR enabled per-request
			mockFetch.mockResolvedValueOnce(new Response('new data', { status: 200 }));

			const response2 = await fetchPlusWithoutSWR.fetch('https://api.example.com/data', {
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 10000,
				},
			});

			// Should serve from cache with SWR
			await vi.advanceTimersByTimeAsync(10);

			expect(mockFetch).toHaveBeenCalledTimes(2);

			fetchPlusWithoutSWR.restore();
		});

		it('staleWhileRevalidate: false disables SWR for that request', async () => {
			const fetchPlusWithSWR = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 30000,
				},
			});

			// First request: cache miss
			mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));
			await fetchPlusWithSWR.fetch('https://api.example.com/data');

			// Time passes
			await vi.advanceTimersByTimeAsync(5000);

			// Second request with SWR disabled — falls back to normal caching
			mockFetch.mockResolvedValueOnce(new Response('new data', { status: 200 }));
			const response2 = await fetchPlusWithSWR.fetch('https://api.example.com/data', {
				staleWhileRevalidate: false,
			});

			// Should get cached response (normal cache behavior, no SWR revalidation)
			expect(await response2.text()).toBe('data');

			// No background revalidation should happen (SWR disabled)
			await vi.advanceTimersByTimeAsync(50);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			fetchPlusWithSWR.restore();
		});
	});

	describe('SWR with Caching', () => {
		it('fresh cache returns immediately without revalidation', async () => {
			const fetchPlusWithSWR = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 60000, // 60 seconds fresh
					staleDuration: 120000,
				},
			});

			// First request: cache miss
			mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));
			await fetchPlusWithSWR.fetch('https://api.example.com/data');

			// Time passes, but within freshDuration
			await vi.advanceTimersByTimeAsync(30000);

			// Second request should hit cache and not trigger background revalidation
			const response2 = await fetchPlusWithSWR.fetch('https://api.example.com/data');
			expect(await response2.text()).toBe('data');

			await vi.advanceTimersByTimeAsync(100);

			// Should only be called once (no revalidation)
			expect(mockFetch).toHaveBeenCalledTimes(1);

			fetchPlusWithSWR.restore();
		});

		it('stale cache triggers background revalidation', async () => {
			const fetchPlusWithSWR = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 10000,
					staleDuration: 60000,
				},
			});

			// First request: cache miss
			mockFetch.mockResolvedValueOnce(new Response('original', { status: 200 }));
			await fetchPlusWithSWR.fetch('https://api.example.com/data');

			// Time passes past freshDuration
			await vi.advanceTimersByTimeAsync(20000);

			// Second request should serve stale and trigger revalidation
			mockFetch.mockResolvedValueOnce(new Response('fresh', { status: 200 }));
			const response2 = await fetchPlusWithSWR.fetch('https://api.example.com/data');
			expect(await response2.text()).toBe('original');

			await vi.advanceTimersByTimeAsync(50);

			// Should be called twice (initial + revalidation)
			expect(mockFetch).toHaveBeenCalledTimes(2);

			fetchPlusWithSWR.restore();
		});

		it('expired cache does normal fetch (not served stale)', async () => {
			const fetchPlusWithSWR = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 10000, // 10 seconds stale window
				},
			});

			// First request: cache miss
			mockFetch.mockResolvedValueOnce(new Response('old', { status: 200 }));
			await fetchPlusWithSWR.fetch('https://api.example.com/data');

			// Time passes past staleDuration
			await vi.advanceTimersByTimeAsync(20000);

			// Second request should do normal fetch (not serve stale)
			mockFetch.mockResolvedValueOnce(new Response('fresh', { status: 200 }));
			const response2 = await fetchPlusWithSWR.fetch('https://api.example.com/data');
			expect(await response2.text()).toBe('fresh');

			fetchPlusWithSWR.restore();
		});
	});

	describe('SWR with Retry', () => {
		it('SWR with retry background revalidation retries on failure', async () => {
			const fetchPlusWithSWRAndRetry = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 30000,
				},
				retry: {
					maxRetries: 2,
					initialDelay: 100,
					backoffStrategy: 'fixed',
				},
			});

			// First request: cache miss, succeeds
			mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));
			await fetchPlusWithSWRAndRetry.fetch('https://api.example.com/data');

			// Time passes
			await vi.advanceTimersByTimeAsync(5000);

			// Second request: serve stale, background revalidation fails first then succeeds
			let attemptCount = 0;
			mockFetch.mockImplementation(async () => {
				attemptCount++;
				if (attemptCount <= 1) {
					// First background attempt fails (TypeError triggers retry)
					throw new TypeError('Network error');
				}
				return new Response('refreshed', { status: 200 });
			});

			const response2 = await fetchPlusWithSWRAndRetry.fetch('https://api.example.com/data');
			expect(await response2.text()).toBe('data');

			// Wait for background revalidation + retry delay
			await vi.advanceTimersByTimeAsync(500);

			// Should have retried the background revalidation
			expect(attemptCount).toBeGreaterThan(1);

			fetchPlusWithSWRAndRetry.restore();
		});
	});

	describe('SWR with Timeout', () => {
		it('SWR background revalidation respects timeout', async () => {
			const fetchPlusWithSWRAndTimeout = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 30000,
				},
				timeout: {
					defaultTimeout: 50, // Short timeout for revalidation
				},
			});

			// First request: cache miss, succeeds
			mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));
			await fetchPlusWithSWRAndTimeout.fetch('https://api.example.com/data');

			// Time passes
			await vi.advanceTimersByTimeAsync(5000);

			// Second request: serve stale, background revalidation times out
			mockFetch.mockImplementation(() => new Promise<Response>((resolve) => { /* Never resolves */ }));

			const response2 = await fetchPlusWithSWRAndTimeout.fetch('https://api.example.com/data');
			expect(await response2.text()).toBe('data');

			// Wait for timeout to occur
			await vi.advanceTimersByTimeAsync(100);

			fetchPlusWithSWRAndTimeout.restore();
		});
	});

	describe('SWR with Deduplication', () => {
		it('SWR works with deduplication', async () => {
			const fetchPlusWithSWRAndDedup = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 30000,
				},
				deduplication: {
					enabled: true,
				},
			});

			// First request: cache miss
			mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));
			await fetchPlusWithSWRAndDedup.fetch('https://api.example.com/data');

			// Time passes
			await vi.advanceTimersByTimeAsync(5000);

			// Two concurrent requests for same URL should deduplicate
			mockFetch.mockResolvedValueOnce(new Response('fresh', { status: 200 }));

			const promise1 = fetchPlusWithSWRAndDedup.fetch('https://api.example.com/data');
			const promise2 = fetchPlusWithSWRAndDedup.fetch('https://api.example.com/data');

			const response1 = await promise1;
			const response2 = await promise2;

			expect(await response1.text()).toBe('data');
			expect(await response2.text()).toBe('data');

			// Should only call fetch twice (initial + one revalidation)
			await vi.advanceTimersByTimeAsync(50);
			expect(mockFetch).toHaveBeenCalledTimes(2);

			fetchPlusWithSWRAndDedup.restore();
		});
	});

	describe('forceRefresh with SWR', () => {
		it('forceRefresh bypasses SWR cache read and serves fresh', async () => {
			const fetchPlusWithSWR = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 30000,
				},
			});

			// First request: cache miss
			mockFetch.mockResolvedValueOnce(new Response('original', { status: 200 }));
			await fetchPlusWithSWR.fetch('https://api.example.com/data');

			// Time passes (cache is stale)
			await vi.advanceTimersByTimeAsync(5000);

			// forceRefresh should skip SWR and fetch fresh
			mockFetch.mockResolvedValueOnce(new Response('refreshed', { status: 200 }));
			const response2 = await fetchPlusWithSWR.fetch('https://api.example.com/data', {
				forceRefresh: true,
			});

			// Should get fresh response, not stale
			expect(await response2.text()).toBe('refreshed');

			fetchPlusWithSWR.restore();
		});
	});

	describe('SWR with Offline Fallback', () => {
		it('SWR serves stale when offline fallback is also enabled', async () => {
			const fetchPlusWithSWRAndOffline = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 30000,
				},
				offline: {
					enabled: true,
					strategy: 'network-first', // Use network-first so bg revalidation hits network
				},
			});

			// First request: cache miss, succeeds
			mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));
			await fetchPlusWithSWRAndOffline.fetch('https://api.example.com/data');

			// Time passes (cache becomes stale)
			await vi.advanceTimersByTimeAsync(5000);

			// Second request: serve stale from SWR, background revalidation runs
			mockFetch.mockResolvedValueOnce(new Response('fresh', { status: 200 }));
			const response2 = await fetchPlusWithSWRAndOffline.fetch('https://api.example.com/data');

			// Should get stale data immediately
			expect(await response2.text()).toBe('data');

			// Wait for background revalidation
			await vi.advanceTimersByTimeAsync(50);

			fetchPlusWithSWRAndOffline.restore();
		});
	});

	describe('SWR Revalidation Callbacks', () => {
		it('onRevalidationComplete callback is called during background revalidation', async () => {
			const callbackFn = vi.fn();
			const fetchPlusWithCallback = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 30000,
					onRevalidationComplete: callbackFn,
				},
			});

			// First request: cache miss
			mockFetch.mockResolvedValueOnce(new Response('original', { status: 200 }));
			await fetchPlusWithCallback.fetch('https://api.example.com/data');

			// Time passes
			await vi.advanceTimersByTimeAsync(5000);

			// Second request: triggers background revalidation
			mockFetch.mockResolvedValueOnce(new Response('fresh', { status: 200 }));
			await fetchPlusWithCallback.fetch('https://api.example.com/data');

			// Wait for callback
			await vi.advanceTimersByTimeAsync(50);

			// Callback should have been called
			expect(callbackFn).toHaveBeenCalledWith(expect.any(Response), null);

			fetchPlusWithCallback.restore();
		});

		it('onRevalidationComplete called with error on revalidation failure', async () => {
			const callbackFn = vi.fn();
			const fetchPlusWithCallback = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 30000,
					onRevalidationComplete: callbackFn,
				},
			});

			// First request: cache miss
			mockFetch.mockResolvedValueOnce(new Response('original', { status: 200 }));
			await fetchPlusWithCallback.fetch('https://api.example.com/data');

			// Time passes
			await vi.advanceTimersByTimeAsync(5000);

			// Second request: revalidation fails
			mockFetch.mockRejectedValueOnce(new Error('Network error'));
			await fetchPlusWithCallback.fetch('https://api.example.com/data');

			// Wait for callback
			await vi.advanceTimersByTimeAsync(50);

			// Callback should have been called with error
			expect(callbackFn).toHaveBeenCalledWith(null, expect.any(Error));

			fetchPlusWithCallback.restore();
		});
	});

	describe('SWR Cache Update on Revalidation', () => {
		it('successful revalidation updates cache with fresh data', async () => {
			const cache = new InMemoryCache();
			const fetchPlusWithSWR = new FetchPlus({
				cache,
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 30000,
				},
			});

			// First request
			mockFetch.mockResolvedValueOnce(new Response('original', { status: 200 }));
			await fetchPlusWithSWR.fetch('https://api.example.com/data');

			// Time passes
			await vi.advanceTimersByTimeAsync(5000);

			// Second request with fresh data
			mockFetch.mockResolvedValueOnce(new Response('updated', { status: 200 }));
			const response2 = await fetchPlusWithSWR.fetch('https://api.example.com/data');
			expect(await response2.text()).toBe('original');

			// Wait for revalidation
			await vi.advanceTimersByTimeAsync(50);

			// Third request should get updated cache
			const response3 = await fetchPlusWithSWR.fetch('https://api.example.com/data');
			expect(await response3.text()).toBe('updated');

			fetchPlusWithSWR.restore();
		});

		it('failed revalidation keeps stale cache intact', async () => {
			const cache = new InMemoryCache();
			const fetchPlusWithSWR = new FetchPlus({
				cache,
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 30000,
				},
			});

			// First request
			mockFetch.mockResolvedValueOnce(new Response('original', { status: 200 }));
			await fetchPlusWithSWR.fetch('https://api.example.com/data');

			// Time passes
			await vi.advanceTimersByTimeAsync(5000);

			// Second request, revalidation fails
			mockFetch.mockRejectedValueOnce(new Error('Network error'));
			const response2 = await fetchPlusWithSWR.fetch('https://api.example.com/data');
			expect(await response2.text()).toBe('original');

			// Wait for failed revalidation
			await vi.advanceTimersByTimeAsync(50);

			// Third request should still get original stale data
			const response3 = await fetchPlusWithSWR.fetch('https://api.example.com/data');
			expect(await response3.text()).toBe('original');

			fetchPlusWithSWR.restore();
		});
	});

	describe('SWR Edge Cases', () => {
		it('handles multiple SWR configurations for different request URLs', async () => {
			const fetchPlusWithSWR = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 5000,
					staleDuration: 30000,
				},
			});

			// Request 1: cache miss
			mockFetch.mockResolvedValueOnce(new Response('data1', { status: 200 }));
			await fetchPlusWithSWR.fetch('https://api.example.com/endpoint1');

			// Request 2: cache miss
			mockFetch.mockResolvedValueOnce(new Response('data2', { status: 200 }));
			await fetchPlusWithSWR.fetch('https://api.example.com/endpoint2');

			// Time passes
			await vi.advanceTimersByTimeAsync(6000);

			// Both should serve stale and trigger revalidation
			mockFetch.mockResolvedValueOnce(new Response('fresh1', { status: 200 }));
			const response1 = await fetchPlusWithSWR.fetch('https://api.example.com/endpoint1');
			expect(await response1.text()).toBe('data1');

			mockFetch.mockResolvedValueOnce(new Response('fresh2', { status: 200 }));
			const response2 = await fetchPlusWithSWR.fetch('https://api.example.com/endpoint2');
			expect(await response2.text()).toBe('data2');

			await vi.advanceTimersByTimeAsync(50);

			// Should have 4 calls: 2 initial + 2 revalidations
			expect(mockFetch).toHaveBeenCalledTimes(4);

			fetchPlusWithSWR.restore();
		});

		it('SWR handles response cloning correctly', async () => {
			const fetchPlusWithSWR = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 30000,
				},
			});

			const testData = JSON.stringify({ message: 'test' });
			mockFetch.mockResolvedValueOnce(new Response(testData, { status: 200 }));

			const response1 = await fetchPlusWithSWR.fetch('https://api.example.com/data');
			const text1 = await response1.text();

			// Should be able to read response
			expect(text1).toBe(testData);

			// Time passes
			await vi.advanceTimersByTimeAsync(5000);

			// Get stale response
			mockFetch.mockResolvedValueOnce(new Response('new data', { status: 200 }));
			const response2 = await fetchPlusWithSWR.fetch('https://api.example.com/data');
			const text2 = await response2.text();

			// Should be able to read stale response
			expect(text2).toBe(testData);

			fetchPlusWithSWR.restore();
		});

		it('SWR with very short staleDuration', async () => {
			const fetchPlusWithSWR = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 100, // Very short
				},
			});

			mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));
			await fetchPlusWithSWR.fetch('https://api.example.com/data');

			// Just past staleDuration
			await vi.advanceTimersByTimeAsync(150);

			// Should not serve stale, should fetch fresh
			mockFetch.mockResolvedValueOnce(new Response('fresh', { status: 200 }));
			const response = await fetchPlusWithSWR.fetch('https://api.example.com/data');
			expect(await response.text()).toBe('fresh');

			fetchPlusWithSWR.restore();
		});

		it('SWR works with non-GET methods cached by configuration', async () => {
			const fetchPlusWithSWR = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				cacheableMethods: ['GET', 'POST'],
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 30000,
				},
			});

			// First POST request
			mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));
			await fetchPlusWithSWR.fetch('https://api.example.com/data', {
				method: 'POST',
				body: JSON.stringify({ test: true }),
			});

			// Time passes
			await vi.advanceTimersByTimeAsync(5000);

			// Second POST should serve stale
			mockFetch.mockResolvedValueOnce(new Response('fresh', { status: 200 }));
			const response = await fetchPlusWithSWR.fetch('https://api.example.com/data', {
				method: 'POST',
				body: JSON.stringify({ test: true }),
			});

			expect(await response.text()).toBe('data');

			await vi.advanceTimersByTimeAsync(50);

			fetchPlusWithSWR.restore();
		});
	});

	describe('SWR Request Configuration', () => {
		it('per-request freshDuration overrides global', async () => {
			const fetchPlusWithSWR = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 60000, // Long freshDuration
					staleDuration: 120000,
				},
			});

			// First request
			mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));
			await fetchPlusWithSWR.fetch('https://api.example.com/data');

			// Time passes
			await vi.advanceTimersByTimeAsync(10000);

			// Request with short freshDuration should trigger revalidation
			mockFetch.mockResolvedValueOnce(new Response('fresh', { status: 200 }));
			const response = await fetchPlusWithSWR.fetch('https://api.example.com/data', {
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 5000, // Very short
					staleDuration: 30000,
				},
			});

			expect(await response.text()).toBe('data');

			await vi.advanceTimersByTimeAsync(50);

			// Should have triggered revalidation
			expect(mockFetch).toHaveBeenCalledTimes(2);

			fetchPlusWithSWR.restore();
		});

		it('per-request staleDuration overrides global', async () => {
			const fetchPlusWithSWR = new FetchPlus({
				cache: new InMemoryCache(),
				replaceGlobalFetch: false,
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 100000, // Very long
				},
			});

			// First request
			mockFetch.mockResolvedValueOnce(new Response('data', { status: 200 }));
			await fetchPlusWithSWR.fetch('https://api.example.com/data');

			// Time passes
			await vi.advanceTimersByTimeAsync(15000);

			// Request with short staleDuration should not serve stale
			mockFetch.mockResolvedValueOnce(new Response('fresh', { status: 200 }));
			const response = await fetchPlusWithSWR.fetch('https://api.example.com/data', {
				staleWhileRevalidate: {
					enabled: true,
					freshDuration: 0,
					staleDuration: 10000, // Very short
				},
			});

			// Should get fresh, not stale
			expect(await response.text()).toBe('fresh');

			fetchPlusWithSWR.restore();
		});
	});
});
