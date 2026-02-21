import { describe, it, expect, beforeEach } from 'vitest';
import { RequestQueue } from '../../../src/features/ratelimit/RequestQueue.js';
import type { RequestPriority } from '../../../src/types/ratelimit.js';

describe('RequestQueue', () => {
    describe('FIFO Queue Behavior', () => {
        it('dequeues in insertion order for default FIFO mode', () => {
            const queue = new RequestQueue('fifo');

            queue.enqueue({ id: '1', priority: 'normal' } as any);
            queue.enqueue({ id: '2', priority: 'normal' } as any);
            queue.enqueue({ id: '3', priority: 'normal' } as any);

            const first = queue.dequeue();
            const second = queue.dequeue();
            const third = queue.dequeue();

            expect(first?.id).toBe('1');
            expect(second?.id).toBe('2');
            expect(third?.id).toBe('3');
        });

        it('returns null when dequeuing from empty FIFO queue', () => {
            const queue = new RequestQueue('fifo');
            const result = queue.dequeue();
            expect(result).toBeNull();
        });

        it('tracks size correctly in FIFO mode', () => {
            const queue = new RequestQueue('fifo');

            expect(queue.size()).toBe(0);
            queue.enqueue({ id: '1', priority: 'normal' } as any);
            expect(queue.size()).toBe(1);
            queue.enqueue({ id: '2', priority: 'normal' } as any);
            expect(queue.size()).toBe(2);
            queue.dequeue();
            expect(queue.size()).toBe(1);
            queue.dequeue();
            expect(queue.size()).toBe(0);
        });

        it('isEmpty returns true when empty', () => {
            const queue = new RequestQueue('fifo');
            expect(queue.isEmpty()).toBe(true);
        });

        it('isEmpty returns false when not empty', () => {
            const queue = new RequestQueue('fifo');
            queue.enqueue({ id: '1', priority: 'normal' } as any);
            expect(queue.isEmpty()).toBe(false);
        });
    });

    describe('Priority Queue Behavior', () => {
        it('dequeues by priority: critical > high > normal > low', () => {
            const queue = new RequestQueue('priority');

            queue.enqueue({ id: 'normal1', priority: 'normal' } as any);
            queue.enqueue({ id: 'low1', priority: 'low' } as any);
            queue.enqueue({ id: 'high1', priority: 'high' } as any);
            queue.enqueue({ id: 'critical1', priority: 'critical' } as any);

            const first = queue.dequeue();
            const second = queue.dequeue();
            const third = queue.dequeue();
            const fourth = queue.dequeue();

            expect(first?.id).toBe('critical1');
            expect(second?.id).toBe('high1');
            expect(third?.id).toBe('normal1');
            expect(fourth?.id).toBe('low1');
        });

        it('uses FIFO within same priority level', () => {
            const queue = new RequestQueue('priority');

            queue.enqueue({ id: 'high1', priority: 'high' } as any);
            queue.enqueue({ id: 'high2', priority: 'high' } as any);
            queue.enqueue({ id: 'high3', priority: 'high' } as any);

            const first = queue.dequeue();
            const second = queue.dequeue();
            const third = queue.dequeue();

            expect(first?.id).toBe('high1');
            expect(second?.id).toBe('high2');
            expect(third?.id).toBe('high3');
        });

        it('respects priority ordering with mixed insertion', () => {
            const queue = new RequestQueue('priority');

            queue.enqueue({ id: 'a', priority: 'normal' } as any);
            queue.enqueue({ id: 'b', priority: 'critical' } as any);
            queue.enqueue({ id: 'c', priority: 'low' } as any);
            queue.enqueue({ id: 'd', priority: 'high' } as any);
            queue.enqueue({ id: 'e', priority: 'normal' } as any);
            queue.enqueue({ id: 'f', priority: 'critical' } as any);

            const dequeued: string[] = [];
            while (!queue.isEmpty()) {
                const item = queue.dequeue();
                if (item) dequeued.push(item.id);
            }

            // Should be: critical (b, f), high (d), normal (a, e), low (c)
            expect(dequeued).toEqual(['b', 'f', 'd', 'a', 'e', 'c']);
        });

        it('tracks size correctly in priority mode', () => {
            const queue = new RequestQueue('priority');

            expect(queue.size()).toBe(0);
            queue.enqueue({ id: '1', priority: 'high' } as any);
            expect(queue.size()).toBe(1);
            queue.enqueue({ id: '2', priority: 'low' } as any);
            expect(queue.size()).toBe(2);
            queue.dequeue();
            expect(queue.size()).toBe(1);
            queue.dequeue();
            expect(queue.size()).toBe(0);
        });

        it('returns null when dequeuing from empty priority queue', () => {
            const queue = new RequestQueue('priority');
            const result = queue.dequeue();
            expect(result).toBeNull();
        });
    });

    describe('Clear Operation', () => {
        it('clears FIFO queue completely', () => {
            const queue = new RequestQueue('fifo');

            queue.enqueue({ id: '1', priority: 'normal' } as any);
            queue.enqueue({ id: '2', priority: 'normal' } as any);
            queue.enqueue({ id: '3', priority: 'normal' } as any);

            expect(queue.size()).toBe(3);
            expect(queue.isEmpty()).toBe(false);

            queue.clear();

            expect(queue.size()).toBe(0);
            expect(queue.isEmpty()).toBe(true);
            expect(queue.dequeue()).toBeNull();
        });

        it('clears priority queue completely', () => {
            const queue = new RequestQueue('priority');

            queue.enqueue({ id: '1', priority: 'high' } as any);
            queue.enqueue({ id: '2', priority: 'critical' } as any);
            queue.enqueue({ id: '3', priority: 'low' } as any);

            expect(queue.size()).toBe(3);
            expect(queue.isEmpty()).toBe(false);

            queue.clear();

            expect(queue.size()).toBe(0);
            expect(queue.isEmpty()).toBe(true);
            expect(queue.dequeue()).toBeNull();
        });

        it('allows new items after clear', () => {
            const queue = new RequestQueue('fifo');

            queue.enqueue({ id: '1', priority: 'normal' } as any);
            queue.clear();
            queue.enqueue({ id: '2', priority: 'normal' } as any);

            expect(queue.size()).toBe(1);
            expect(queue.dequeue()?.id).toBe('2');
        });
    });

    describe('Mixed Operations', () => {
        it('handles alternating enqueue and dequeue', () => {
            const queue = new RequestQueue('fifo');

            queue.enqueue({ id: '1', priority: 'normal' } as any);
            expect(queue.size()).toBe(1);

            queue.enqueue({ id: '2', priority: 'normal' } as any);
            expect(queue.size()).toBe(2);

            const first = queue.dequeue();
            expect(first?.id).toBe('1');
            expect(queue.size()).toBe(1);

            queue.enqueue({ id: '3', priority: 'normal' } as any);
            expect(queue.size()).toBe(2);

            const second = queue.dequeue();
            expect(second?.id).toBe('2');
            expect(queue.size()).toBe(1);

            const third = queue.dequeue();
            expect(third?.id).toBe('3');
            expect(queue.size()).toBe(0);
        });

        it('priority queue handles multiple operations', () => {
            const queue = new RequestQueue('priority');

            queue.enqueue({ id: 'a', priority: 'normal' } as any);
            queue.enqueue({ id: 'b', priority: 'low' } as any);

            const first = queue.dequeue();
            expect(first?.id).toBe('a');

            queue.enqueue({ id: 'c', priority: 'high' } as any);
            const second = queue.dequeue();
            expect(second?.id).toBe('c');

            const third = queue.dequeue();
            expect(third?.id).toBe('b');
        });
    });

    describe('Edge Cases', () => {
        it('handles single item', () => {
            const queue = new RequestQueue('fifo');
            queue.enqueue({ id: 'single', priority: 'normal' } as any);

            expect(queue.size()).toBe(1);
            expect(queue.isEmpty()).toBe(false);

            const item = queue.dequeue();
            expect(item?.id).toBe('single');
            expect(queue.isEmpty()).toBe(true);
        });

        it('handles large queue in FIFO mode', () => {
            const queue = new RequestQueue('fifo');
            const itemCount = 1000;

            for (let i = 0; i < itemCount; i++) {
                queue.enqueue({ id: String(i), priority: 'normal' } as any);
            }

            expect(queue.size()).toBe(itemCount);

            for (let i = 0; i < itemCount; i++) {
                const item = queue.dequeue();
                expect(item?.id).toBe(String(i));
            }

            expect(queue.isEmpty()).toBe(true);
        });

        it('handles large queue with priorities', () => {
            const queue = new RequestQueue('priority');
            const priorities: RequestPriority[] = ['low', 'normal', 'high', 'critical'];

            // Add 100 items of each priority
            for (let i = 0; i < 100; i++) {
                for (const priority of priorities) {
                    queue.enqueue({ id: `${priority}-${i}`, priority } as any);
                }
            }

            expect(queue.size()).toBe(400);

            // First 100 should be critical
            for (let i = 0; i < 100; i++) {
                const item = queue.dequeue();
                expect(item?.priority).toBe('critical');
            }

            // Next 100 should be high
            for (let i = 0; i < 100; i++) {
                const item = queue.dequeue();
                expect(item?.priority).toBe('high');
            }

            // Next 100 should be normal
            for (let i = 0; i < 100; i++) {
                const item = queue.dequeue();
                expect(item?.priority).toBe('normal');
            }

            // Last 100 should be low
            for (let i = 0; i < 100; i++) {
                const item = queue.dequeue();
                expect(item?.priority).toBe('low');
            }

            expect(queue.isEmpty()).toBe(true);
        });

        it('maintains FIFO ordering within priority level with large queue', () => {
            const queue = new RequestQueue('priority');

            // Add 50 normal priority items
            for (let i = 0; i < 50; i++) {
                queue.enqueue({ id: `normal-${i}`, priority: 'normal' } as any);
            }

            const dequeued: string[] = [];
            for (let i = 0; i < 50; i++) {
                const item = queue.dequeue();
                if (item) dequeued.push(item.id);
            }

            for (let i = 0; i < 50; i++) {
                expect(dequeued[i]).toBe(`normal-${i}`);
            }
        });

        it('all priority levels work with default "normal" priority', () => {
            const queue = new RequestQueue('priority');

            queue.enqueue({ id: '1', priority: 'normal' } as any);
            queue.enqueue({ id: '2', priority: 'normal' } as any);

            const item1 = queue.dequeue();
            const item2 = queue.dequeue();

            expect(item1?.priority).toBe('normal');
            expect(item2?.priority).toBe('normal');
        });
    });

    describe('Queue Properties', () => {
        it('preserves queue metadata on items', () => {
            const queue = new RequestQueue('fifo');

            const testItem = {
                id: 'test',
                priority: 'high' as const,
                url: 'http://example.com',
                timestamp: Date.now()
            };

            queue.enqueue(testItem);
            const retrieved = queue.dequeue();

            expect(retrieved?.url).toBe('http://example.com');
            expect(retrieved?.timestamp).toBe(testItem.timestamp);
        });

        it('works with requests containing resolve/reject functions', () => {
            const queue = new RequestQueue('fifo');

            let resolveFunc: (() => void) | undefined;
            const promise = new Promise<void>(resolve => {
                resolveFunc = resolve;
            });

            const item = {
                id: 'test',
                priority: 'normal' as const,
                resolve: resolveFunc!
            };

            queue.enqueue(item);
            const retrieved = queue.dequeue();

            expect(retrieved?.resolve).toBeDefined();
            expect(typeof retrieved?.resolve).toBe('function');
        });
    });
});
