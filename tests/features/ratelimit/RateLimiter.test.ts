import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter, RateLimitError } from '../../../src/features/ratelimit/RateLimiter.js';

describe('RateLimiter', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Basic Rate Limiting', () => {
        it('queues requests beyond maxConcurrent', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 2,
            });

            let inProgressCount = 0;
            let maxInProgress = 0;

            const executeTask = async () => {
                inProgressCount++;
                maxInProgress = Math.max(maxInProgress, inProgressCount);
                await new Promise(resolve => setTimeout(resolve, 100));
                inProgressCount--;
            };

            const tasks = [
                limiter.acquire(() => executeTask()),
                limiter.acquire(() => executeTask()),
                limiter.acquire(() => executeTask()),
                limiter.acquire(() => executeTask()),
                limiter.acquire(() => executeTask()),
            ];

            await vi.runAllTimersAsync();
            await Promise.all(tasks);

            expect(maxInProgress).toBeLessThanOrEqual(2);
        });

        it('never exceeds maxConcurrent limit', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 3,
            });

            let concurrentCount = 0;
            let maxConcurrentObserved = 0;

            const trackConcurrency = async () => {
                concurrentCount++;
                maxConcurrentObserved = Math.max(maxConcurrentObserved, concurrentCount);
                await new Promise(resolve => setTimeout(resolve, 50));
                concurrentCount--;
            };

            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(limiter.acquire(trackConcurrency));
            }

            await vi.runAllTimersAsync();
            await Promise.all(promises);

            expect(maxConcurrentObserved).toBeLessThanOrEqual(3);
        });

        it('processes queue when slot becomes available', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
            });

            const executionOrder: string[] = [];

            const task = (id: string) => async () => {
                executionOrder.push(id);
                await new Promise(resolve => setTimeout(resolve, 10));
            };

            const p1 = limiter.acquire(task('first'));
            const p2 = limiter.acquire(task('second'));
            const p3 = limiter.acquire(task('third'));

            await vi.runAllTimersAsync();
            await Promise.all([p1, p2, p3]);

            expect(executionOrder).toEqual(['first', 'second', 'third']);
        });

        it('releases slot after task completion', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
            });

            const execution: string[] = [];

            const task1 = limiter.acquire(async () => {
                execution.push('task1-start');
                await new Promise(resolve => setTimeout(resolve, 100));
                execution.push('task1-end');
            });

            const task2 = limiter.acquire(async () => {
                execution.push('task2-start');
                await new Promise(resolve => setTimeout(resolve, 50));
                execution.push('task2-end');
            });

            await vi.runAllTimersAsync();
            await Promise.all([task1, task2]);

            // Task2 should not start until task1 finishes
            expect(execution.indexOf('task2-start')).toBeGreaterThan(
                execution.indexOf('task1-end')
            );
        });
    });

    describe('Priority Queue Strategy', () => {
        it('processes high priority before normal priority', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
                queueStrategy: 'priority',
            });

            const executionOrder: string[] = [];

            // First task occupies the only slot
            const p1 = limiter.acquire(async () => {
                executionOrder.push('first');
                await new Promise(resolve => setTimeout(resolve, 10));
            }, 'normal');

            // These get queued
            const p2 = limiter.acquire(async () => {
                executionOrder.push('normal2');
                await new Promise(resolve => setTimeout(resolve, 10));
            }, 'normal');

            const p3 = limiter.acquire(async () => {
                executionOrder.push('high');
                await new Promise(resolve => setTimeout(resolve, 10));
            }, 'high');

            const p4 = limiter.acquire(async () => {
                executionOrder.push('low');
                await new Promise(resolve => setTimeout(resolve, 10));
            }, 'low');

            await vi.runAllTimersAsync();
            await Promise.all([p1, p2, p3, p4]);

            // First executes immediately, then high (priority), then normal2, then low
            expect(executionOrder[0]).toBe('first');
            expect(executionOrder[1]).toBe('high');
        });

        it('maintains FIFO within same priority level', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
                queueStrategy: 'priority',
            });

            const executionOrder: string[] = [];

            const task = (id: string) => async () => {
                executionOrder.push(id);
                await new Promise(resolve => setTimeout(resolve, 10));
            };

            const p1 = limiter.acquire(task('high1'), 'high');
            const p2 = limiter.acquire(task('high2'), 'high');
            const p3 = limiter.acquire(task('high3'), 'high');

            await vi.runAllTimersAsync();
            await Promise.all([p1, p2, p3]);

            expect(executionOrder).toEqual(['high1', 'high2', 'high3']);
        });

        it('prioritizes critical over high, high over normal, normal over low', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
                queueStrategy: 'priority',
            });

            const executionOrder: string[] = [];

            const task = (id: string) => async () => {
                executionOrder.push(id);
                await new Promise(resolve => setTimeout(resolve, 10));
            };

            // First task occupies the slot
            const p0 = limiter.acquire(task('blocker'), 'normal');
            // Queue: normal, low, critical, high
            const p1 = limiter.acquire(task('normal'), 'normal');
            const p2 = limiter.acquire(task('low'), 'low');
            const p3 = limiter.acquire(task('critical'), 'critical');
            const p4 = limiter.acquire(task('high'), 'high');

            await vi.runAllTimersAsync();
            await Promise.all([p0, p1, p2, p3, p4]);

            expect(executionOrder[0]).toBe('blocker');
            expect(executionOrder[1]).toBe('critical');
            expect(executionOrder[2]).toBe('high');
            expect(executionOrder[3]).toBe('normal');
            expect(executionOrder[4]).toBe('low');
        });
    });

    describe('FIFO Queue Strategy', () => {
        it('processes requests in insertion order', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
                queueStrategy: 'fifo',
            });

            const executionOrder: string[] = [];

            const task = (id: string) => async () => {
                executionOrder.push(id);
                await new Promise(resolve => setTimeout(resolve, 10));
            };

            const p1 = limiter.acquire(task('first'), 'normal');
            const p2 = limiter.acquire(task('second'), 'high');
            const p3 = limiter.acquire(task('third'), 'low');

            await vi.runAllTimersAsync();
            await Promise.all([p1, p2, p3]);

            // FIFO ignores priority
            expect(executionOrder).toEqual(['first', 'second', 'third']);
        });

        it('ignores priority in FIFO mode', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
                queueStrategy: 'fifo',
            });

            const executionOrder: string[] = [];

            const task = (id: string) => async () => {
                executionOrder.push(id);
                await new Promise(resolve => setTimeout(resolve, 10));
            };

            const p1 = limiter.acquire(task('p1'), 'low');
            const p2 = limiter.acquire(task('p2'), 'critical');
            const p3 = limiter.acquire(task('p3'), 'high');
            const p4 = limiter.acquire(task('p4'), 'normal');

            await vi.runAllTimersAsync();
            await Promise.all([p1, p2, p3, p4]);

            expect(executionOrder).toEqual(['p1', 'p2', 'p3', 'p4']);
        });
    });

    describe('Per-Domain Limiting', () => {
        it('limits concurrency separately for each domain', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 2,
                scope: 'per-domain',
            });

            const concurrencyByDomain: Record<string, number> = {
                'api1.example.com': 0,
                'api2.example.com': 0,
            };

            const maxByDomain: Record<string, number> = {
                'api1.example.com': 0,
                'api2.example.com': 0,
            };

            const trackConcurrency = (domain: string) => {
                return async () => {
                    concurrencyByDomain[domain]++;
                    maxByDomain[domain] = Math.max(
                        maxByDomain[domain],
                        concurrencyByDomain[domain]
                    );
                    await new Promise(resolve => setTimeout(resolve, 100));
                    concurrencyByDomain[domain]--;
                };
            };

            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(
                    limiter.acquire(trackConcurrency('api1.example.com'), 'normal', 'api1.example.com')
                );
                promises.push(
                    limiter.acquire(trackConcurrency('api2.example.com'), 'normal', 'api2.example.com')
                );
            }

            await vi.runAllTimersAsync();
            await Promise.all(promises);

            expect(maxByDomain['api1.example.com']).toBeLessThanOrEqual(2);
            expect(maxByDomain['api2.example.com']).toBeLessThanOrEqual(2);
        });

        it('allows full concurrency for different domains', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 2,
                scope: 'per-domain',
            });

            let totalConcurrent = 0;
            let maxTotalConcurrent = 0;

            const trackConcurrency = async () => {
                totalConcurrent++;
                maxTotalConcurrent = Math.max(maxTotalConcurrent, totalConcurrent);
                await new Promise(resolve => setTimeout(resolve, 50));
                totalConcurrent--;
            };

            const promises = [];
            for (let i = 0; i < 4; i++) {
                promises.push(
                    limiter.acquire(trackConcurrency, 'normal', 'domain1.com')
                );
                promises.push(
                    limiter.acquire(trackConcurrency, 'normal', 'domain2.com')
                );
            }

            await vi.runAllTimersAsync();
            await Promise.all(promises);

            // With per-domain limiting, should allow up to 4 concurrent (2 per domain)
            expect(maxTotalConcurrent).toBeGreaterThan(2);
        });
    });

    describe('Global Limiting', () => {
        it('limits total concurrency across all domains', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 2,
                scope: 'global',
            });

            let totalConcurrent = 0;
            let maxTotalConcurrent = 0;

            const trackConcurrency = async () => {
                totalConcurrent++;
                maxTotalConcurrent = Math.max(maxTotalConcurrent, totalConcurrent);
                await new Promise(resolve => setTimeout(resolve, 50));
                totalConcurrent--;
            };

            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(
                    limiter.acquire(trackConcurrency, 'normal', 'domain1.com')
                );
                promises.push(
                    limiter.acquire(trackConcurrency, 'normal', 'domain2.com')
                );
            }

            await vi.runAllTimersAsync();
            await Promise.all(promises);

            expect(maxTotalConcurrent).toBeLessThanOrEqual(2);
        });
    });

    describe('Max Queue Size', () => {
        it('rejects with RateLimitError when queue exceeds maxQueueSize', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
                maxQueueSize: 2,
            });

            // Fire-and-forget: occupies the slot (never resolves)
            const _blocking = limiter.acquire(() => new Promise(() => {}));

            // Queue two more (fills queue to max)
            const _q1 = limiter.acquire(async () => {});
            const _q2 = limiter.acquire(async () => {});

            // Third queue entry should exceed maxQueueSize
            await expect(
                limiter.acquire(async () => {})
            ).rejects.toThrow(RateLimitError);
        });

        it('throws error with descriptive message', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
                maxQueueSize: 1,
            });

            // Fire-and-forget: occupies the slot
            const _blocking = limiter.acquire(() => new Promise(() => {}));

            // Fill queue
            const _q1 = limiter.acquire(async () => {});

            try {
                await limiter.acquire(async () => {});
                expect.fail('Should have thrown RateLimitError');
            } catch (error) {
                expect(error).toBeInstanceOf(RateLimitError);
                expect((error as Error).message).toContain('queue');
            }
        });
    });

    describe('Bypass Rate Limit', () => {
        it('executes immediately without rate limiting', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
            });

            let executed = false;

            // Fire-and-forget: occupies the slot
            const _blocking = limiter.acquire(() => new Promise(() => {}));

            // Bypass should execute immediately
            await limiter.bypassRateLimit(async () => {
                executed = true;
            });

            expect(executed).toBe(true);
        });

        it('bypassRateLimit works even when queue is full', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
                maxQueueSize: 1,
            });

            let executed = false;

            // Fill the slot and queue
            const _blocking = limiter.acquire(() => new Promise(() => {}));
            const _q1 = limiter.acquire(async () => {});

            // Bypass should still work
            const result = await limiter.bypassRateLimit(async () => {
                executed = true;
                return 'done';
            });

            expect(executed).toBe(true);
            expect(result).toBe('done');
        });

        it('bypassRateLimit propagates errors', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
            });

            await expect(
                limiter.bypassRateLimit(async () => {
                    throw new Error('Test error');
                })
            ).rejects.toThrow('Test error');
        });
    });

    describe('Callbacks', () => {
        it('calls onQueued when request is queued', async () => {
            const onQueued = vi.fn();
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
                onQueued,
            });

            // Fire-and-forget: occupies the slot
            const _blocking = limiter.acquire(() => new Promise(() => {}));

            // These get queued
            const _q1 = limiter.acquire(async () => {});
            const _q2 = limiter.acquire(async () => {});

            expect(onQueued).toHaveBeenCalledTimes(2);
            expect(onQueued).toHaveBeenNthCalledWith(1, 1); // queue length after first enqueue
            expect(onQueued).toHaveBeenNthCalledWith(2, 2); // queue length after second enqueue
        });

        it('calls onDequeued when request starts executing', async () => {
            const onDequeued = vi.fn();
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
                onDequeued,
            });

            const task = (id: string) => async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
            };

            const p1 = limiter.acquire(task('first'));
            const p2 = limiter.acquire(task('second'));

            await vi.runAllTimersAsync();
            await Promise.all([p1, p2]);

            expect(onDequeued).toHaveBeenCalled();
        });

        it('onQueued receives correct queue length', async () => {
            const queueLengths: number[] = [];
            const onQueued = (length: number) => {
                queueLengths.push(length);
            };

            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
                onQueued,
            });

            // Fire-and-forget: occupies the slot
            const _blocking = limiter.acquire(() => new Promise(() => {}));

            limiter.acquire(async () => {});
            limiter.acquire(async () => {});
            limiter.acquire(async () => {});

            expect(queueLengths).toEqual([1, 2, 3]);
        });
    });

    describe('Active Request Tracking', () => {
        it('tracks active request count', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 3,
            });

            const task = async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
            };

            const p1 = limiter.acquire(task);
            const p2 = limiter.acquire(task);
            const p3 = limiter.acquire(task);

            // All three should start immediately (slots available)
            expect(limiter.getActiveCount()).toBe(3);

            await vi.runAllTimersAsync();
            await Promise.all([p1, p2, p3]);

            expect(limiter.getActiveCount()).toBe(0);
        });

        it('returns total queue size', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
            });

            // Fire-and-forget: occupies the slot
            const _blocking = limiter.acquire(() => new Promise(() => {}));

            limiter.acquire(async () => {});
            limiter.acquire(async () => {});

            expect(limiter.getTotalQueueSize()).toBe(2);
        });
    });

    describe('Error Handling', () => {
        it('releases slot when task throws error', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
            });

            const executionOrder: string[] = [];

            const failingTask = limiter.acquire(async () => {
                executionOrder.push('task1');
                throw new Error('Task failed');
            });

            const secondTask = limiter.acquire(async () => {
                executionOrder.push('task2');
            });

            await failingTask.catch(() => {});
            await secondTask;

            expect(executionOrder).toEqual(['task1', 'task2']);
        });

        it('releases slot even if task times out', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
            });

            const executionOrder: string[] = [];

            // Task that takes very long
            const p1 = limiter.acquire(async () => {
                executionOrder.push('task1');
                await new Promise(resolve => setTimeout(resolve, 10000));
            });

            const p2 = limiter.acquire(async () => {
                executionOrder.push('task2');
            });

            await vi.runAllTimersAsync();
            await Promise.all([p1, p2]);

            expect(executionOrder).toEqual(['task1', 'task2']);
        });
    });

    describe('Disabled Rate Limiting', () => {
        it('passes through when enabled is false', async () => {
            const limiter = new RateLimiter({
                enabled: false,
            });

            let concurrentCount = 0;
            let maxConcurrent = 0;

            const trackConcurrency = async () => {
                concurrentCount++;
                maxConcurrent = Math.max(maxConcurrent, concurrentCount);
                await new Promise(resolve => setTimeout(resolve, 50));
                concurrentCount--;
            };

            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(limiter.acquire(trackConcurrency));
            }

            await vi.runAllTimersAsync();
            await Promise.all(promises);

            // All should run concurrently (no limiting)
            expect(maxConcurrent).toBe(10);
        });

        it('never queues when disabled', async () => {
            const limiter = new RateLimiter({
                enabled: false,
                maxConcurrent: 1,
                maxQueueSize: 0,
            });

            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(limiter.acquire(async () => {}));
            }

            await expect(Promise.all(promises)).resolves.toBeDefined();
        });
    });

    describe('Edge Cases', () => {
        it('handles maxConcurrent of 1 (serial execution)', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
            });

            let concurrent = 0;
            let maxConcurrentSeen = 0;

            const task = async () => {
                concurrent++;
                maxConcurrentSeen = Math.max(maxConcurrentSeen, concurrent);
                await new Promise(resolve => setTimeout(resolve, 10));
                concurrent--;
            };

            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(limiter.acquire(task));
            }

            await vi.runAllTimersAsync();
            await Promise.all(promises);

            expect(maxConcurrentSeen).toBe(1);
        });

        it('handles very high maxConcurrent', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1000,
            });

            let concurrent = 0;
            let maxConcurrentSeen = 0;

            const task = async () => {
                concurrent++;
                maxConcurrentSeen = Math.max(maxConcurrentSeen, concurrent);
                await new Promise(resolve => setTimeout(resolve, 10));
                concurrent--;
            };

            const promises = [];
            for (let i = 0; i < 100; i++) {
                promises.push(limiter.acquire(task));
            }

            await vi.runAllTimersAsync();
            await Promise.all(promises);

            expect(maxConcurrentSeen).toBeGreaterThan(1);
        });

        it('handles task that completes synchronously', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 2,
            });

            const p1 = limiter.acquire(() => 'done');
            const p2 = limiter.acquire(() => 'done');
            const p3 = limiter.acquire(() => 'done');

            const results = await Promise.all([p1, p2, p3]);

            expect(results).toEqual(['done', 'done', 'done']);
        });

        it('handles all requests eventually completing even with mixed priorities', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 2,
                queueStrategy: 'priority',
            });

            const priorities = ['critical', 'high', 'normal', 'low'] as const;
            const promises = [];

            for (let i = 0; i < 20; i++) {
                const priority = priorities[i % priorities.length];
                promises.push(
                    limiter.acquire(
                        async () => {
                            await new Promise(resolve => setTimeout(resolve, 10));
                        },
                        priority
                    )
                );
            }

            await vi.runAllTimersAsync();
            const results = await Promise.all(promises);

            expect(results).toHaveLength(20);
        });
    });

    describe('Configuration Defaults', () => {
        it('uses default maxConcurrent of 6 when not specified', async () => {
            const limiter = new RateLimiter({
                enabled: true,
            });

            let concurrent = 0;
            let maxConcurrent = 0;

            const task = async () => {
                concurrent++;
                maxConcurrent = Math.max(maxConcurrent, concurrent);
                await new Promise(resolve => setTimeout(resolve, 50));
                concurrent--;
            };

            const promises = [];
            for (let i = 0; i < 12; i++) {
                promises.push(limiter.acquire(task));
            }

            await vi.runAllTimersAsync();
            await Promise.all(promises);

            expect(maxConcurrent).toBeLessThanOrEqual(6);
            expect(maxConcurrent).toBeGreaterThan(1);
        });

        it('uses FIFO as default queue strategy', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 1,
            });

            const order: string[] = [];

            const task = (id: string) => async () => {
                order.push(id);
                await new Promise(resolve => setTimeout(resolve, 10));
            };

            const p1 = limiter.acquire(task('first'), 'low');
            const p2 = limiter.acquire(task('second'), 'critical');
            const p3 = limiter.acquire(task('third'), 'high');

            await vi.runAllTimersAsync();
            await Promise.all([p1, p2, p3]);

            // FIFO should be default, so insertion order matters
            expect(order).toEqual(['first', 'second', 'third']);
        });

        it('uses global as default scope', async () => {
            const limiter = new RateLimiter({
                enabled: true,
                maxConcurrent: 2,
            });

            let globalConcurrent = 0;
            let maxGlobalConcurrent = 0;

            const task = async () => {
                globalConcurrent++;
                maxGlobalConcurrent = Math.max(maxGlobalConcurrent, globalConcurrent);
                await new Promise(resolve => setTimeout(resolve, 50));
                globalConcurrent--;
            };

            const promises = [];
            for (let i = 0; i < 4; i++) {
                promises.push(limiter.acquire(task, 'normal', `domain${i}.com`));
            }

            await vi.runAllTimersAsync();
            await Promise.all(promises);

            expect(maxGlobalConcurrent).toBeLessThanOrEqual(2);
        });
    });
});
