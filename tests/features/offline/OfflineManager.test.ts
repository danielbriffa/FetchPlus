import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OfflineManager } from '../../../src/features/offline/OfflineManager.js';
import type { CacheInterface } from '../../../src/types/index.js';

describe('OfflineManager', () => {
    let mockCache: CacheInterface;

    beforeEach(() => {
        // Create a mock cache
        mockCache = {
            get: vi.fn(async () => null),
            set: vi.fn(async () => {}),
            delete: vi.fn(async () => true),
            clear: vi.fn(async () => {}),
            has: vi.fn(async () => false),
        };

        // Reset navigator.onLine
        Object.defineProperty(navigator, 'onLine', {
            writable: true,
            configurable: true,
            value: true,
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Offline Detection', () => {
        it('detects online status via navigator.onLine', async () => {
            const manager = new OfflineManager({ enabled: true });
            expect(manager.getOnlineStatus()).toBe(true);
        });

        it('detects offline status via navigator.onLine', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({ enabled: true });
            expect(manager.getOnlineStatus()).toBe(false);
        });

        it('listens to offline event', async () => {
            const manager = new OfflineManager({ enabled: true });
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            window.dispatchEvent(new Event('offline'));

            expect(manager.getOnlineStatus()).toBe(false);
        });

        it('listens to online event', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({ enabled: true });
            expect(manager.getOnlineStatus()).toBe(false);

            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: true,
            });

            window.dispatchEvent(new Event('online'));

            expect(manager.getOnlineStatus()).toBe(true);
        });
    });

    describe('Cache-First Strategy', () => {
        it('returns cached response when offline', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({
                enabled: true,
                strategy: 'cache-first',
                queueRequests: false,
            });

            const cachedResponse = new Response('cached data', { status: 200 });
            (mockCache.get as any).mockResolvedValueOnce(cachedResponse);

            const response = await manager.executeWithOfflineHandling(
                'https://api.example.com/data',
                undefined,
                mockCache,
                async () => {
                    throw new Error('Should not call network');
                }
            );

            expect(response).toBe(cachedResponse);
            expect(mockCache.get).toHaveBeenCalled();
        });

        it('throws error when offline with cache miss and no queuing', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({
                enabled: true,
                strategy: 'cache-first',
                queueRequests: false,
            });

            (mockCache.get as any).mockResolvedValueOnce(null);

            await expect(
                manager.executeWithOfflineHandling(
                    'https://api.example.com/data',
                    undefined,
                    mockCache,
                    async () => {
                        throw new Error('Should not call network');
                    }
                )
            ).rejects.toThrow('no cached response available');
        });

        it('falls back to network on cache miss when online', async () => {
            const manager = new OfflineManager({
                enabled: true,
                strategy: 'cache-first',
            });

            (mockCache.get as any).mockResolvedValueOnce(null);
            const networkResponse = new Response('network data', { status: 200 });
            const fetchFn = vi.fn(async () => networkResponse);

            const response = await manager.executeWithOfflineHandling(
                'https://api.example.com/data',
                undefined,
                mockCache,
                fetchFn
            );

            expect(response).toBe(networkResponse);
            expect(fetchFn).toHaveBeenCalled();
        });
    });

    describe('Network-First Strategy', () => {
        it('tries network first when online', async () => {
            const manager = new OfflineManager({
                enabled: true,
                strategy: 'network-first',
            });

            const networkResponse = new Response('network data', { status: 200 });
            const fetchFn = vi.fn(async () => networkResponse);

            const response = await manager.executeWithOfflineHandling(
                'https://api.example.com/data',
                undefined,
                mockCache,
                fetchFn
            );

            expect(response).toBe(networkResponse);
            expect(fetchFn).toHaveBeenCalled();
        });

        it('falls back to cache on network error when offline', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({
                enabled: true,
                strategy: 'network-first',
                queueRequests: false,
            });

            const cachedResponse = new Response('cached data', { status: 200 });
            (mockCache.get as any).mockResolvedValueOnce(cachedResponse);

            const response = await manager.executeWithOfflineHandling(
                'https://api.example.com/data',
                undefined,
                mockCache,
                async () => {
                    throw new Error('Network error');
                }
            );

            expect(response).toBe(cachedResponse);
        });

        it('throws error when offline with cache miss and no cache available', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({
                enabled: true,
                strategy: 'network-first',
                queueRequests: false,
            });

            (mockCache.get as any).mockResolvedValueOnce(null);

            await expect(
                manager.executeWithOfflineHandling(
                    'https://api.example.com/data',
                    undefined,
                    mockCache,
                    async () => {
                        throw new Error('Network error');
                    }
                )
            ).rejects.toThrow('no cached response available');
        });
    });

    describe('Cache-Only Strategy', () => {
        it('always serves from cache', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({
                enabled: true,
                strategy: 'cache-only',
            });

            const cachedResponse = new Response('cached data', { status: 200 });
            (mockCache.get as any).mockResolvedValueOnce(cachedResponse);

            const response = await manager.executeWithOfflineHandling(
                'https://api.example.com/data',
                undefined,
                mockCache,
                async () => {
                    throw new Error('Should not call network');
                }
            );

            expect(response).toBe(cachedResponse);
        });

        it('throws error if no cache available', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({
                enabled: true,
                strategy: 'cache-only',
            });

            (mockCache.get as any).mockResolvedValueOnce(null);

            await expect(
                manager.executeWithOfflineHandling(
                    'https://api.example.com/data',
                    undefined,
                    mockCache,
                    async () => {
                        throw new Error('Should not call network');
                    }
                )
            ).rejects.toThrow('no cached response available');
        });
    });

    describe('Request Queuing', () => {
        it('queues failed requests when offline', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({
                enabled: true,
                queueRequests: true,
                strategy: 'cache-first',
            });

            (mockCache.get as any).mockResolvedValueOnce(null);

            try {
                await manager.executeWithOfflineHandling(
                    'https://api.example.com/data',
                    undefined,
                    mockCache,
                    async () => {
                        throw new Error('Network error');
                    }
                );
            } catch (e) {
                // Expected to throw
            }

            const queue = manager.getQueue();
            expect(queue.length).toBe(1);
            expect(queue[0].input).toBe('https://api.example.com/data');
        });

        it('enforces max queue size', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({
                enabled: true,
                queueRequests: true,
                maxQueueSize: 3,
                strategy: 'cache-first',
            });

            (mockCache.get as any).mockResolvedValue(null);

            // Queue 5 requests, max size is 3
            for (let i = 0; i < 5; i++) {
                try {
                    await manager.executeWithOfflineHandling(
                        `https://api.example.com/data${i}`,
                        undefined,
                        mockCache,
                        async () => {
                            throw new Error('Network error');
                        }
                    );
                } catch (e) {
                    // Expected
                }
            }

            const queue = manager.getQueue();
            expect(queue.length).toBe(3);

            // First two requests should be discarded (FIFO)
            expect(queue[0].input).toBe('https://api.example.com/data2');
            expect(queue[1].input).toBe('https://api.example.com/data3');
            expect(queue[2].input).toBe('https://api.example.com/data4');
        });

        it('processes queue when coming online', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const mockFetchFn = vi.fn(async () => new Response('ok', { status: 200 }));

            const manager = new OfflineManager({
                enabled: true,
                queueRequests: true,
                strategy: 'cache-first',
            }, mockFetchFn as unknown as typeof fetch);

            (mockCache.get as any).mockResolvedValue(null);

            try {
                await manager.executeWithOfflineHandling(
                    'https://api.example.com/data',
                    undefined,
                    mockCache,
                    async () => {
                        throw new Error('Network error');
                    }
                );
            } catch (e) {
                // Expected
            }

            expect(manager.getQueue().length).toBe(1);

            // Go online
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: true,
            });

            window.dispatchEvent(new Event('online'));

            // Wait for async queue processing to complete
            await new Promise(resolve => setTimeout(resolve, 10));

            // Queue should be cleared after processing
            expect(manager.getQueue().length).toBe(0);
        });
    });

    describe('Callbacks', () => {
        it('calls onOffline callback when going offline', async () => {
            const onOffline = vi.fn();

            const manager = new OfflineManager({
                enabled: true,
                onOffline,
            });

            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            window.dispatchEvent(new Event('offline'));

            expect(onOffline).toHaveBeenCalled();
        });

        it('calls onOnline callback when going online', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const onOnline = vi.fn();

            const manager = new OfflineManager({
                enabled: true,
                onOnline,
            });

            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: true,
            });

            window.dispatchEvent(new Event('online'));

            expect(onOnline).toHaveBeenCalled();
        });
    });

    describe('Configuration', () => {
        it('per-request strategy override works', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({
                enabled: true,
                strategy: 'cache-first', // Global default
                queueRequests: false,
            });

            const cachedResponse = new Response('cached', { status: 200 });
            (mockCache.get as any).mockResolvedValueOnce(cachedResponse);

            // Override with 'cache-only'
            const response = await manager.executeWithOfflineHandling(
                'https://api.example.com/data',
                undefined,
                mockCache,
                async () => {
                    throw new Error('Should not call network');
                },
                'cache-only' // Per-request override
            );

            expect(response).toBe(cachedResponse);
        });

        it('per-request queueIfOffline overrides global queueRequests', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({
                enabled: true,
                queueRequests: true, // Global: enabled
                strategy: 'cache-first',
            });

            (mockCache.get as any).mockResolvedValueOnce(null);

            try {
                await manager.executeWithOfflineHandling(
                    'https://api.example.com/data',
                    undefined,
                    mockCache,
                    async () => {
                        throw new Error('Network error');
                    },
                    undefined,
                    false // Per-request override: disable queue
                );
            } catch (e) {
                // Expected
            }

            // Queue should be empty due to per-request override
            expect(manager.getQueue().length).toBe(0);
        });

        it('default config values are set correctly', async () => {
            const manager = new OfflineManager({
                enabled: true,
            });

            expect(manager.getOnlineStatus()).toBe(true); // Online by default

            // Queue should be empty initially
            expect(manager.getQueue().length).toBe(0);
        });
    });

    describe('Edge Cases', () => {
        it('handles rapid offline/online cycles', async () => {
            const manager = new OfflineManager({ enabled: true });

            for (let i = 0; i < 10; i++) {
                Object.defineProperty(navigator, 'onLine', {
                    writable: true,
                    configurable: true,
                    value: false,
                });
                window.dispatchEvent(new Event('offline'));

                Object.defineProperty(navigator, 'onLine', {
                    writable: true,
                    configurable: true,
                    value: true,
                });
                window.dispatchEvent(new Event('online'));
            }

            // Should handle gracefully
            expect(manager.getOnlineStatus()).toBe(true);
        });

        it('queueRequest stores initialization data correctly', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({
                enabled: true,
                queueRequests: true,
                strategy: 'cache-first',
            });

            (mockCache.get as any).mockResolvedValue(null);

            const init: RequestInit = {
                method: 'POST',
                body: JSON.stringify({ id: 1 }),
                headers: { 'Content-Type': 'application/json' },
            };

            try {
                await manager.executeWithOfflineHandling(
                    'https://api.example.com/data',
                    init,
                    mockCache,
                    async () => {
                        throw new Error('Network error');
                    }
                );
            } catch (e) {
                // Expected
            }

            const queue = manager.getQueue();
            expect(queue.length).toBe(1);
            expect(queue[0].init).toEqual(init);
        });

        it('destroy cleans up event listeners and queue', async () => {
            const manager = new OfflineManager({
                enabled: true,
                queueRequests: true,
                strategy: 'cache-first',
            });

            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            (mockCache.get as any).mockResolvedValue(null);

            try {
                await manager.executeWithOfflineHandling(
                    'https://api.example.com/data',
                    undefined,
                    mockCache,
                    async () => {
                        throw new Error('Network error');
                    }
                );
            } catch (e) {
                // Expected
            }

            expect(manager.getQueue().length).toBe(1);

            manager.destroy();

            expect(manager.getQueue().length).toBe(0);
        });

        it('clearQueue removes all queued requests', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({
                enabled: true,
                queueRequests: true,
                strategy: 'cache-first',
            });

            (mockCache.get as any).mockResolvedValue(null);

            // Queue multiple requests
            for (let i = 0; i < 5; i++) {
                try {
                    await manager.executeWithOfflineHandling(
                        `https://api.example.com/data${i}`,
                        undefined,
                        mockCache,
                        async () => {
                            throw new Error('Network error');
                        }
                    );
                } catch (e) {
                    // Expected
                }
            }

            expect(manager.getQueue().length).toBe(5);

            manager.clearQueue();

            expect(manager.getQueue().length).toBe(0);
        });

        it('disabled offline manager bypasses all offline handling', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({
                enabled: false,
            });

            const networkResponse = new Response('network data', { status: 200 });
            const fetchFn = vi.fn(async () => networkResponse);

            const response = await manager.executeWithOfflineHandling(
                'https://api.example.com/data',
                undefined,
                mockCache,
                fetchFn
            );

            expect(response).toBe(networkResponse);
            expect(fetchFn).toHaveBeenCalled();
        });
    });

    describe('Queue ID Generation', () => {
        it('generates unique IDs for queued requests', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                configurable: true,
                value: false,
            });

            const manager = new OfflineManager({
                enabled: true,
                queueRequests: true,
                strategy: 'cache-first',
            });

            (mockCache.get as any).mockResolvedValue(null);

            try {
                await manager.executeWithOfflineHandling(
                    'https://api.example.com/data1',
                    undefined,
                    mockCache,
                    async () => {
                        throw new Error('Network error');
                    }
                );
            } catch (e) {
                // Expected
            }

            try {
                await manager.executeWithOfflineHandling(
                    'https://api.example.com/data2',
                    undefined,
                    mockCache,
                    async () => {
                        throw new Error('Network error');
                    }
                );
            } catch (e) {
                // Expected
            }

            const queue = manager.getQueue();
            expect(queue[0].id).not.toBe(queue[1].id);
        });
    });
});
