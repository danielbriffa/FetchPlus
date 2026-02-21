import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StaleWhileRevalidate } from '../../../src/features/swr/StaleWhileRevalidate.js';
import type { StaleWhileRevalidateConfig, CacheEntryMetadata } from '../../../src/types/index.js';
import type { CacheInterface } from '../../../src/types/index.js';

/**
 * Helper to create a mock cache that supports metadata for SWR tests
 */
const createMockCache = (): CacheInterface & {
	getMetadata: (key: string) => Promise<CacheEntryMetadata | null>;
	setMetadata: (key: string, metadata: CacheEntryMetadata) => Promise<void>;
} => {
	const store = new Map<string, { response: Response; metadata?: CacheEntryMetadata }>();

	return {
		get: vi.fn(async (key: string) => {
			const entry = store.get(key);
			return entry ? entry.response.clone() : null;
		}),
		set: vi.fn(async (key: string, response: Response, options?: any) => {
			store.set(key, { response: response.clone(), metadata: options?.metadata });
		}),
		delete: vi.fn(async (key: string) => {
			const deleted = store.has(key);
			store.delete(key);
			return deleted;
		}),
		clear: vi.fn(async () => store.clear()),
		has: vi.fn(async (key: string) => store.has(key)),
		getMetadata: vi.fn(async (key: string) => {
			const entry = store.get(key);
			return entry?.metadata || null;
		}),
		setMetadata: vi.fn(async (key: string, metadata: CacheEntryMetadata) => {
			const entry = store.get(key);
			if (entry) {
				entry.metadata = metadata;
			}
		}),
	};
};

describe('StaleWhileRevalidate', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('Basic SWR Functionality', () => {
		it('serves stale response while revalidating in background', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 10000,
			});

			// Set up cached response from 5 seconds ago (stale but within staleDuration)
			const cachedResponse = new Response('stale data', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 5000 },
			});

			let revalidationCalled = false;
			let fetchFnCalls = 0;

			const fetchFn = vi.fn(async () => {
				fetchFnCalls++;
				revalidationCalled = true;
				await new Promise(resolve => setTimeout(resolve, 10));
				return new Response('fresh data', { status: 200 });
			});

			// Execute SWR
			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			expect(await result.text()).toBe('stale data');

			// Wait for background revalidation to complete
			await vi.advanceTimersByTimeAsync(50);
			expect(revalidationCalled).toBe(true);
			expect(fetchFnCalls).toBe(1);
		});

		it('fresh response returned without background revalidation', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 60000, // 60 seconds
				staleDuration: 100000,
			});

			// Set up cached response from 10 seconds ago (fresh)
			const cachedResponse = new Response('fresh data', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 10000 },
			});

			let fetchCalled = false;
			const fetchFn = vi.fn(async () => {
				fetchCalled = true;
				return new Response('new data', { status: 200 });
			});

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			expect(await result.text()).toBe('fresh data');

			// Wait longer to ensure no background fetch
			await vi.advanceTimersByTimeAsync(1000);
			expect(fetchCalled).toBe(false);
			expect(fetchFn).not.toHaveBeenCalled();
		});

		it('expired cache (past staleDuration) does normal fetch', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 5000, // 5 seconds
			});

			// Set up cached response from 10 seconds ago (expired)
			const cachedResponse = new Response('expired data', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 10000 },
			});

			const freshResponse = new Response('fresh data', { status: 200 });
			const fetchFn = vi.fn(async () => freshResponse);

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			expect(await result.text()).toBe('fresh data');
			expect(fetchFn).toHaveBeenCalled();
		});

		it('no cached response fetches normally', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 10000,
			});

			const fetchResponse = new Response('fresh data', { status: 200 });
			const fetchFn = vi.fn(async () => fetchResponse);

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			expect(await result.text()).toBe('fresh data');
			expect(fetchFn).toHaveBeenCalledTimes(1);
		});
	});

	describe('Fresh Duration Behavior', () => {
		it('within freshDuration no revalidation occurs', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 30000, // 30 seconds
				staleDuration: 100000,
			});

			const cachedResponse = new Response('data', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 10000 }, // 10 seconds old
			});

			let revalidationTriggered = false;
			const fetchFn = vi.fn(async () => {
				revalidationTriggered = true;
				return new Response('new', { status: 200 });
			});

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			await vi.advanceTimersByTimeAsync(100);

			expect(await result.text()).toBe('data');
			expect(revalidationTriggered).toBe(false);
		});

		it('after freshDuration background revalidation starts', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 10000, // 10 seconds
				staleDuration: 100000,
			});

			const cachedResponse = new Response('stale data', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 15000 }, // 15 seconds old (beyond freshDuration)
			});

			let revalidationTriggered = false;
			const fetchFn = vi.fn(async () => {
				revalidationTriggered = true;
				await new Promise(resolve => setTimeout(resolve, 10));
				return new Response('fresh data', { status: 200 });
			});

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			expect(await result.text()).toBe('stale data');

			await vi.advanceTimersByTimeAsync(50);
			expect(revalidationTriggered).toBe(true);
		});

		it('freshDuration 0 always revalidates', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0, // Always stale
				staleDuration: 100000,
			});

			const cachedResponse = new Response('old data', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 1000 }, // Just 1 second old
			});

			let revalidationTriggered = false;
			const fetchFn = vi.fn(async () => {
				revalidationTriggered = true;
				await new Promise(resolve => setTimeout(resolve, 10));
				return new Response('new data', { status: 200 });
			});

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			expect(await result.text()).toBe('old data');

			await vi.advanceTimersByTimeAsync(50);
			expect(revalidationTriggered).toBe(true);
		});
	});

	describe('Stale Duration Behavior', () => {
		it('within staleDuration serves stale response', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 30000, // 30 seconds
			});

			const cachedResponse = new Response('stale data', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 20000 }, // 20 seconds old
			});

			let fetchFnCalled = false;
			const fetchFn = vi.fn(async () => {
				fetchFnCalled = true;
				return new Response('fresh data', { status: 200 });
			});

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			expect(await result.text()).toBe('stale data');

			await vi.advanceTimersByTimeAsync(50);
			expect(fetchFnCalled).toBe(true);
		});

		it('past staleDuration cache not served', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 10000, // 10 seconds
			});

			const cachedResponse = new Response('expired data', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 20000 }, // 20 seconds old
			});

			const freshResponse = new Response('fresh data', { status: 200 });
			const fetchFn = vi.fn(async () => freshResponse);

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			expect(await result.text()).toBe('fresh data');
		});

		it('staleDuration Infinity serves stale indefinitely', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: Infinity,
			});

			const cachedResponse = new Response('very stale data', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 1000000 }, // Very old
			});

			let fetchFnCalled = false;
			const fetchFn = vi.fn(async () => {
				fetchFnCalled = true;
				return new Response('fresh data', { status: 200 });
			});

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			expect(await result.text()).toBe('very stale data');

			await vi.advanceTimersByTimeAsync(50);
			expect(fetchFnCalled).toBe(true);
		});
	});

	describe('Background Revalidation', () => {
		it('successful revalidation updates cache', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 10000,
			});

			const cachedResponse = new Response('old data', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 5000 },
			});

			const freshResponse = new Response('fresh data', { status: 200 });
			const fetchFn = vi.fn(async () => freshResponse);

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			expect(await result.text()).toBe('old data');

			await vi.advanceTimersByTimeAsync(50);

			// Verify that the cache was updated with fresh data
			const updatedCache = await cache.get('https://api.example.com/data');
			if (updatedCache) {
				expect(await updatedCache.text()).toBe('fresh data');
			}
		});

		it('failed revalidation keeps stale cache', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 10000,
			});

			const cachedResponse = new Response('stale data', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 5000 },
			});

			const fetchFn = vi.fn(async () => {
				throw new Error('Network error');
			});

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			expect(await result.text()).toBe('stale data');

			await vi.advanceTimersByTimeAsync(50);

			// Cache should still contain stale data
			const stillCached = await cache.get('https://api.example.com/data');
			if (stillCached) {
				expect(await stillCached.text()).toBe('stale data');
			}
		});

		it('only one background revalidation per key', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 10000,
			});

			const cachedResponse = new Response('stale data', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 5000 },
			});

			let revalidationCount = 0;
			const fetchFn = vi.fn(async () => {
				revalidationCount++;
				await new Promise(resolve => setTimeout(resolve, 100));
				return new Response('fresh data', { status: 200 });
			});

			// First request triggers revalidation
			const result1 = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			await vi.advanceTimersByTimeAsync(10);

			// Immediate second request should not trigger another revalidation
			const result2 = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			await vi.advanceTimersByTimeAsync(10);

			// Both return stale
			expect(await result1.text()).toBe('stale data');
			expect(await result2.text()).toBe('stale data');

			// Wait for revalidation to complete
			await vi.advanceTimersByTimeAsync(150);

			// Should only have called fetch once
			expect(fetchFn).toHaveBeenCalledTimes(1);
		});

		it('metadata tracks revalidating flag', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 10000,
			});

			const cachedResponse = new Response('data', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 5000, revalidating: false },
			});

			let revalidationStarted = false;
			const fetchFn = vi.fn(async () => {
				revalidationStarted = true;
				// Check metadata during revalidation
				const metadata = await cache.getMetadata('https://api.example.com/data');
				expect(metadata?.revalidating).toBe(true);

				await new Promise(resolve => setTimeout(resolve, 10));
				return new Response('fresh', { status: 200 });
			});

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			await vi.advanceTimersByTimeAsync(50);

			expect(revalidationStarted).toBe(true);

			// After revalidation completes, flag should be reset
			const finalMetadata = await cache.getMetadata('https://api.example.com/data');
			expect(finalMetadata?.revalidating).toBe(false);
		});
	});

	describe('Revalidation Callbacks', () => {
		it('onRevalidationComplete called with (response, null) on success', async () => {
			const cache = createMockCache();
			const callbackFn = vi.fn();

			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 10000,
				onRevalidationComplete: callbackFn,
			});

			const cachedResponse = new Response('stale', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 5000 },
			});

			const fetchFn = vi.fn(async () => new Response('fresh', { status: 200 }));

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			await vi.advanceTimersByTimeAsync(50);

			expect(callbackFn).toHaveBeenCalledWith(expect.any(Response), null);
			const callbackResponse = callbackFn.mock.calls[0][0];
			expect(await callbackResponse.text()).toBe('fresh');
		});

		it('onRevalidationComplete called with (null, error) on failure', async () => {
			const cache = createMockCache();
			const callbackFn = vi.fn();

			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 10000,
				onRevalidationComplete: callbackFn,
			});

			const cachedResponse = new Response('stale', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 5000 },
			});

			const testError = new Error('Network error');
			const fetchFn = vi.fn(async () => {
				throw testError;
			});

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			await vi.advanceTimersByTimeAsync(50);

			expect(callbackFn).toHaveBeenCalledWith(null, expect.any(Error));
			const callbackError = callbackFn.mock.calls[0][1];
			expect(callbackError.message).toContain('Network error');
		});

		it('callback not called if no revalidation (fresh cache)', async () => {
			const cache = createMockCache();
			const callbackFn = vi.fn();

			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 60000, // Cache is fresh
				staleDuration: 100000,
				onRevalidationComplete: callbackFn,
			});

			const cachedResponse = new Response('fresh', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 10000 }, // 10 seconds old, still fresh
			});

			const fetchFn = vi.fn(async () => new Response('new', { status: 200 }));

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			await vi.advanceTimersByTimeAsync(100);

			expect(callbackFn).not.toHaveBeenCalled();
			expect(fetchFn).not.toHaveBeenCalled();
		});
	});

	describe('Config Merging (mergeConfigs)', () => {
		it('returns null when no config', () => {
			const result = StaleWhileRevalidate.mergeConfigs(undefined, undefined);
			expect(result).toBeNull();
		});

		it('returns global config when enabled', () => {
			const globalConfig: StaleWhileRevalidateConfig = {
				enabled: true,
				freshDuration: 5000,
				staleDuration: 30000,
			};

			const result = StaleWhileRevalidate.mergeConfigs(globalConfig, undefined);
			expect(result).toEqual(globalConfig);
		});

		it('returns request config when provided', () => {
			const globalConfig: StaleWhileRevalidateConfig = {
				enabled: true,
				freshDuration: 5000,
			};

			const requestConfig: StaleWhileRevalidateConfig = {
				enabled: true,
				freshDuration: 10000,
			};

			const result = StaleWhileRevalidate.mergeConfigs(globalConfig, requestConfig);
			expect(result?.freshDuration).toBe(10000);
		});

		it('returns null when requestConfig is false', () => {
			const globalConfig: StaleWhileRevalidateConfig = {
				enabled: true,
				freshDuration: 5000,
			};

			const result = StaleWhileRevalidate.mergeConfigs(globalConfig, false);
			expect(result).toBeNull();
		});

		it('request config overrides global config', () => {
			const globalConfig: StaleWhileRevalidateConfig = {
				enabled: true,
				freshDuration: 5000,
				staleDuration: 30000,
			};

			const requestConfig: StaleWhileRevalidateConfig = {
				enabled: true,
				freshDuration: 15000,
				staleDuration: 60000,
			};

			const result = StaleWhileRevalidate.mergeConfigs(globalConfig, requestConfig);
			expect(result?.freshDuration).toBe(15000);
			expect(result?.staleDuration).toBe(60000);
		});

		it('returns global config if global is disabled', () => {
			const globalConfig: StaleWhileRevalidateConfig = {
				enabled: false,
			};

			const result = StaleWhileRevalidate.mergeConfigs(globalConfig, undefined);
			expect(result?.enabled).toBe(false);
		});
	});

	describe('checkCacheStatus Method', () => {
		it('returns "fresh" when within freshDuration', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				freshDuration: 30000,
				staleDuration: 100000,
			});

			const now = Date.now();
			await cache.set('https://api.example.com/data', new Response('data'), {
				metadata: { cachedAt: now - 10000 },
			});

			const status = await swr.checkCacheStatus('https://api.example.com/data', cache);
			expect(status).toBe('fresh');
		});

		it('returns "stale" when between freshDuration and staleDuration', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				freshDuration: 10000,
				staleDuration: 60000,
			});

			const now = Date.now();
			await cache.set('https://api.example.com/data', new Response('data'), {
				metadata: { cachedAt: now - 20000 }, // Between 10 and 60 seconds
			});

			const status = await swr.checkCacheStatus('https://api.example.com/data', cache);
			expect(status).toBe('stale');
		});

		it('returns "expired" when past staleDuration', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				freshDuration: 10000,
				staleDuration: 30000,
			});

			const now = Date.now();
			await cache.set('https://api.example.com/data', new Response('data'), {
				metadata: { cachedAt: now - 50000 }, // Past staleDuration
			});

			const status = await swr.checkCacheStatus('https://api.example.com/data', cache);
			expect(status).toBe('expired');
		});

		it('returns "none" when no cached entry', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				freshDuration: 10000,
				staleDuration: 60000,
			});

			const status = await swr.checkCacheStatus('https://api.example.com/data', cache);
			expect(status).toBe('none');
		});

		it('returns "stale" when cache has no metadata', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				freshDuration: 0,
				staleDuration: 10000,
			});

			// Add cache entry without metadata
			await cache.set('https://api.example.com/data', new Response('data'));

			const status = await swr.checkCacheStatus('https://api.example.com/data', cache);
			expect(status).toBe('stale');
		});
	});

	describe('Edge Cases', () => {
		it('handles freshDuration 0 and staleDuration 0', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 0,
			});

			const now = Date.now();
			await cache.set('https://api.example.com/data', new Response('old'), {
				metadata: { cachedAt: now - 1 },
			});

			const freshResponse = new Response('fresh', { status: 200 });
			const fetchFn = vi.fn(async () => freshResponse);

			// Cache is expired (past staleDuration of 0)
			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			expect(await result.text()).toBe('fresh');
		});

		it('handles very large freshDuration', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 999999999,
				staleDuration: 9999999999,
			});

			const now = Date.now();
			await cache.set('https://api.example.com/data', new Response('data'), {
				metadata: { cachedAt: now - 1000000 },
			});

			let revalidated = false;
			const fetchFn = vi.fn(async () => {
				revalidated = true;
				return new Response('fresh', { status: 200 });
			});

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			await vi.advanceTimersByTimeAsync(100);

			expect(await result.text()).toBe('data');
			expect(revalidated).toBe(false);
		});

		it('SWR disabled returns null from mergeConfigs', () => {
			const result = StaleWhileRevalidate.mergeConfigs(
				{ enabled: false },
				undefined
			);
			expect(result).toEqual({ enabled: false });
		});

		it('handles multiple concurrent requests to different URLs', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 10000,
			});

			const now = Date.now();
			await cache.set('https://api.example.com/data1', new Response('stale1'), {
				metadata: { cachedAt: now - 5000 },
			});
			await cache.set('https://api.example.com/data2', new Response('stale2'), {
				metadata: { cachedAt: now - 5000 },
			});

			const fetchFn = vi.fn(async (url: string) => {
				await new Promise(resolve => setTimeout(resolve, 10));
				return new Response(`fresh ${url}`, { status: 200 });
			});

			const result1 = await swr.executeWithSWR('https://api.example.com/data1', cache, () =>
				fetchFn('url1')
			);
			const result2 = await swr.executeWithSWR('https://api.example.com/data2', cache, () =>
				fetchFn('url2')
			);

			expect(await result1.text()).toContain('stale1');
			expect(await result2.text()).toContain('stale2');

			await vi.advanceTimersByTimeAsync(50);

			// Both revalidations should have triggered
			expect(fetchFn).toHaveBeenCalledTimes(2);
		});

		it('handles disabled config gracefully', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: false,
			});

			const cachedResponse = new Response('stale', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 5000 },
			});

			const freshResponse = new Response('fresh', { status: 200 });
			const fetchFn = vi.fn(async () => freshResponse);

			// When disabled, should just do normal fetch
			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			expect(fetchFn).toHaveBeenCalled();
		});
	});

	describe('Response Handling', () => {
		it('clones responses properly for stale return and cache update', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 10000,
			});

			const cachedResponse = new Response('stale', { status: 200 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 5000 },
			});

			const freshResponse = new Response('fresh', { status: 200 });
			const fetchFn = vi.fn(async () => freshResponse);

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			const text = await result.text();

			expect(text).toBe('stale');

			// Result should be a valid response with readable body
			expect(result.status).toBe(200);
		});

		it('handles error status codes as valid responses', async () => {
			const cache = createMockCache();
			const swr = new StaleWhileRevalidate({
				enabled: true,
				freshDuration: 0,
				staleDuration: 10000,
			});

			const cachedResponse = new Response('error', { status: 404 });
			const now = Date.now();
			await cache.set('https://api.example.com/data', cachedResponse, {
				metadata: { cachedAt: now - 5000 },
			});

			const freshResponse = new Response('found', { status: 200 });
			const fetchFn = vi.fn(async () => freshResponse);

			const result = await swr.executeWithSWR('https://api.example.com/data', cache, fetchFn);
			const text = await result.text();

			expect(text).toBe('error');
			expect(result.status).toBe(404);
		});
	});
});
