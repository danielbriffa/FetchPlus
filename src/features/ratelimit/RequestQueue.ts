import type { QueuedRequestEntry, QueueStrategy } from '../../types/ratelimit.js';

/**
 * Priority values for sorting
 */
const PRIORITY_VALUES = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

/**
 * Priority queue for managing queued requests
 * Supports FIFO and priority-based strategies
 */
export class RequestQueue {
  private queue: QueuedRequestEntry[] = [];
  private strategy: QueueStrategy;

  constructor(strategy: QueueStrategy = 'fifo') {
    this.strategy = strategy;
  }

  /**
   * Add a request to the queue
   */
  enqueue(entry: QueuedRequestEntry): void {
    this.queue.push(entry);

    // Sort if using priority strategy
    if (this.strategy === 'priority') {
      this.queue.sort((a, b) => {
        const priorityDiff = PRIORITY_VALUES[b.priority] - PRIORITY_VALUES[a.priority];
        // If same priority, sort by timestamp (FIFO within same priority)
        return priorityDiff !== 0 ? priorityDiff : a.timestamp - b.timestamp;
      });
    }
  }

  /**
   * Remove and return the next request from the queue
   * Returns null if queue is empty
   */
  dequeue(): QueuedRequestEntry | null {
    return this.queue.shift() || null;
  }

  /**
   * Get the current queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Clear all queued requests
   */
  clear(): void {
    this.queue = [];
  }
}
