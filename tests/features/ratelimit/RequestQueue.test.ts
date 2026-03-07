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

    describe('getAll', () => {
        it('returns empty array when queue is empty', () => {
            const queue = new RequestQueue('fifo');
            const all = queue.getAll();

            expect(Array.isArray(all)).toBe(true);
            expect(all.length).toBe(0);
        });

        it('returns all enqueued entries', () => {
            const queue = new RequestQueue('fifo');

            const entry1 = { id: '1', priority: 'normal' } as any;
            const entry2 = { id: '2', priority: 'high' } as any;
            const entry3 = { id: '3', priority: 'low' } as any;

            queue.enqueue(entry1);
            queue.enqueue(entry2);
            queue.enqueue(entry3);

            const all = queue.getAll();

            expect(all.length).toBe(3);
            expect(all[0].id).toBe('1');
            expect(all[1].id).toBe('2');
            expect(all[2].id).toBe('3');
        });

        it('returns entries in queue order (FIFO)', () => {
            const queue = new RequestQueue('fifo');

            for (let i = 1; i <= 5; i++) {
                queue.enqueue({ id: String(i), priority: 'normal' } as any);
            }

            const all = queue.getAll();

            expect(all.length).toBe(5);
            for (let i = 0; i < 5; i++) {
                expect(all[i].id).toBe(String(i + 1));
            }
        });

        it('returns entries in priority order when using priority strategy', () => {
            const queue = new RequestQueue('priority');

            queue.enqueue({ id: 'normal1', priority: 'normal' } as any);
            queue.enqueue({ id: 'low1', priority: 'low' } as any);
            queue.enqueue({ id: 'high1', priority: 'high' } as any);
            queue.enqueue({ id: 'critical1', priority: 'critical' } as any);

            const all = queue.getAll();

            expect(all.length).toBe(4);
            expect(all[0].id).toBe('critical1');
            expect(all[1].id).toBe('high1');
            expect(all[2].id).toBe('normal1');
            expect(all[3].id).toBe('low1');
        });

        it('returned array is a copy (modifying it does not affect the queue)', () => {
            const queue = new RequestQueue('fifo');

            queue.enqueue({ id: '1', priority: 'normal' } as any);
            queue.enqueue({ id: '2', priority: 'normal' } as any);

            const all = queue.getAll();
            all.push({ id: '3', priority: 'normal' } as any);

            // Original queue should still have only 2 items
            expect(queue.size()).toBe(2);

            // Dequeue should get the original items
            const first = queue.dequeue();
            const second = queue.dequeue();

            expect(first?.id).toBe('1');
            expect(second?.id).toBe('2');
        });

        it('getAll() does not remove items from queue', () => {
            const queue = new RequestQueue('fifo');

            queue.enqueue({ id: '1', priority: 'normal' } as any);
            queue.enqueue({ id: '2', priority: 'normal' } as any);

            const all1 = queue.getAll();
            const all2 = queue.getAll();

            expect(all1.length).toBe(2);
            expect(all2.length).toBe(2);
            expect(queue.size()).toBe(2);
        });

        it('getAll() reflects current queue state', () => {
            const queue = new RequestQueue('fifo');

            queue.enqueue({ id: '1', priority: 'normal' } as any);
            expect(queue.getAll().length).toBe(1);

            queue.enqueue({ id: '2', priority: 'normal' } as any);
            expect(queue.getAll().length).toBe(2);

            queue.dequeue();
            expect(queue.getAll().length).toBe(1);
        });

        it('returned copy contains exact same item properties', () => {
            const queue = new RequestQueue('fifo');

            const resolve = vi.fn();
            const reject = vi.fn();
            const fetchFn = vi.fn();
            const timestamp = Date.now();

            const entry = {
                id: 'test-id',
                input: 'http://example.com',
                init: undefined,
                priority: 'high' as const,
                timestamp,
                resolve,
                reject,
                fetchFn,
            };

            queue.enqueue(entry);
            const all = queue.getAll();

            expect(all[0].id).toBe('test-id');
            expect(all[0].input).toBe('http://example.com');
            expect(all[0].priority).toBe('high');
            expect(all[0].timestamp).toBe(timestamp);
            expect(all[0].resolve).toBe(resolve);
            expect(all[0].reject).toBe(reject);
            expect(all[0].fetchFn).toBe(fetchFn);
        });

        it('getAll() with priority queue respects FIFO within priority level', () => {
            const queue = new RequestQueue('priority');

            queue.enqueue({ id: 'h1', priority: 'high' } as any);
            queue.enqueue({ id: 'h2', priority: 'high' } as any);
            queue.enqueue({ id: 'h3', priority: 'high' } as any);

            const all = queue.getAll();

            expect(all[0].id).toBe('h1');
            expect(all[1].id).toBe('h2');
            expect(all[2].id).toBe('h3');
        });

        it('getAll() with large queue returns all items', () => {
            const queue = new RequestQueue('fifo');
            const itemCount = 100;

            for (let i = 0; i < itemCount; i++) {
                queue.enqueue({ id: String(i), priority: 'normal' } as any);
            }

            const all = queue.getAll();

            expect(all.length).toBe(itemCount);
            for (let i = 0; i < itemCount; i++) {
                expect(all[i].id).toBe(String(i));
            }
        });

        it('getAll() on queue with mixed priorities returns correctly', () => {
            const queue = new RequestQueue('priority');

            queue.enqueue({ id: 'a', priority: 'normal' } as any);
            queue.enqueue({ id: 'b', priority: 'critical' } as any);
            queue.enqueue({ id: 'c', priority: 'low' } as any);
            queue.enqueue({ id: 'd', priority: 'high' } as any);
            queue.enqueue({ id: 'e', priority: 'normal' } as any);

            const all = queue.getAll();

            expect(all.length).toBe(5);
            // Critical first
            expect(all[0].id).toBe('b');
            // High second
            expect(all[1].id).toBe('d');
            // Normal (FIFO)
            expect(all[2].id).toBe('a');
            expect(all[3].id).toBe('e');
            // Low last
            expect(all[4].id).toBe('c');
        });

        it('returned array is shallow copy (array itself is different)', () => {
            const queue = new RequestQueue('fifo');

            queue.enqueue({ id: '1', priority: 'normal' } as any);
            queue.enqueue({ id: '2', priority: 'normal' } as any);

            const all1 = queue.getAll();
            const all2 = queue.getAll();

            // Arrays themselves should be different
            expect(all1).not.toBe(all2);
            expect(all2.length).toBe(2);
        });

        it('getAll() returns different array instances each time', () => {
            const queue = new RequestQueue('fifo');

            queue.enqueue({ id: '1', priority: 'normal' } as any);

            const all1 = queue.getAll();
            const all2 = queue.getAll();

            expect(all1).not.toBe(all2);
        });
    });
});
