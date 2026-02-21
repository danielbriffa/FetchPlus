import type { RateLimitConfig, RequestPriority } from '../../types/ratelimit.js';
import { RequestQueue } from './RequestQueue.js';

/**
 * Error thrown when queue is full
 */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Default rate limit configuration
 */
const DEFAULT_CONFIG: Required<RateLimitConfig> = {
  enabled: false,
  maxConcurrent: 6,
  queueStrategy: 'fifo',
  scope: 'global',
  maxQueueSize: 100,
  onQueued: () => {},
  onDequeued: () => {},
};

/**
 * Extract domain from URL
 */
function extractDomain(input: RequestInfo | URL): string {
  try {
    let url: URL;
    if (input instanceof URL) {
      url = input;
    } else if (input instanceof Request) {
      url = new URL(input.url);
    } else {
      url = new URL(input);
    }
    return url.hostname;
  } catch {
    return 'default';
  }
}

/**
 * Rate limiter for managing concurrent requests
 */
export class RateLimiter {
  private config: Required<RateLimitConfig>;
  private activeRequests = 0;
  private globalQueue: RequestQueue;
  private perDomainQueues: Map<string, RequestQueue> = new Map();
  private perDomainActive: Map<string, number> = new Map();

  constructor(config: RateLimitConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.globalQueue = new RequestQueue(this.config.queueStrategy);
  }

  /**
   * Acquire a slot and execute a task (generic method for testing)
   */
  async acquire<T>(
    fn: () => Promise<T> | T,
    priority: RequestPriority = 'normal',
    domain?: string
  ): Promise<T> {
    // If disabled, execute immediately
    if (!this.config.enabled) {
      return Promise.resolve(fn());
    }

    // For testing purposes, construct input based on domain if provided
    const dummyInput = domain ? `http://${domain}` : 'http://example.com';
    const dummyInit = undefined;

    if (this.config.scope === 'per-domain') {
      return this.executePerDomain(dummyInput, dummyInit, fn as () => Promise<any>, priority) as Promise<T>;
    } else {
      return this.executeGlobal(dummyInput, dummyInit, fn as () => Promise<any>, priority) as Promise<T>;
    }
  }

  /**
   * Bypass rate limiting and execute immediately
   */
  async bypassRateLimit<T>(fn: () => Promise<T> | T): Promise<T> {
    return Promise.resolve(fn());
  }

  /**
   * Execute a request with rate limiting
   */
  async executeWithRateLimit(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    fetchFn: () => Promise<Response>,
    priority: RequestPriority = 'normal'
  ): Promise<Response> {
    if (this.config.scope === 'per-domain') {
      return this.executePerDomain(input, init, fetchFn, priority);
    } else {
      return this.executeGlobal(input, init, fetchFn, priority);
    }
  }

  /**
   * Execute with global scope
   */
  private async executeGlobal<T>(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    fetchFn: () => Promise<T>,
    priority: RequestPriority
  ): Promise<T> {
    // Check if we have available slots
    if (this.activeRequests < this.config.maxConcurrent) {
      this.activeRequests++;
      return this.executeRequest(fetchFn, () => {
        this.activeRequests--;
        this.processGlobalQueue();
      });
    }

    // Check if queue is full
    if (this.globalQueue.size() >= this.config.maxQueueSize) {
      throw new RateLimitError(`Rate limit queue is full (max: ${this.config.maxQueueSize})`);
    }

    // Queue the request
    return new Promise<T>((resolve, reject) => {
      const entry = {
        id: Math.random().toString(36).substring(7),
        input,
        init,
        priority,
        timestamp: Date.now(),
        resolve: resolve as (value: any) => void,
        reject,
        fetchFn: fetchFn as () => Promise<any>,
      };

      this.globalQueue.enqueue(entry);
      this.config.onQueued(this.globalQueue.size());
    });
  }

  /**
   * Execute with per-domain scope
   */
  private async executePerDomain<T>(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    fetchFn: () => Promise<T>,
    priority: RequestPriority
  ): Promise<T> {
    const domain = extractDomain(input);
    const currentActive = this.perDomainActive.get(domain) || 0;

    // Check if we have available slots for this domain
    if (currentActive < this.config.maxConcurrent) {
      this.perDomainActive.set(domain, currentActive + 1);
      return this.executeRequest(fetchFn, () => {
        const active = this.perDomainActive.get(domain) || 0;
        this.perDomainActive.set(domain, Math.max(0, active - 1));
        this.processPerDomainQueue(domain);
      });
    }

    // Get or create queue for this domain
    let queue = this.perDomainQueues.get(domain);
    if (!queue) {
      queue = new RequestQueue(this.config.queueStrategy);
      this.perDomainQueues.set(domain, queue);
    }

    // Check if queue is full
    if (queue.size() >= this.config.maxQueueSize) {
      throw new RateLimitError(`Rate limit queue for domain ${domain} is full (max: ${this.config.maxQueueSize})`);
    }

    // Queue the request
    return new Promise<T>((resolve, reject) => {
      const entry = {
        id: Math.random().toString(36).substring(7),
        input,
        init,
        priority,
        timestamp: Date.now(),
        resolve: resolve as (value: any) => void,
        reject,
        fetchFn: fetchFn as () => Promise<any>,
      };

      queue!.enqueue(entry);
      this.config.onQueued(queue!.size());
    });
  }

  /**
   * Execute a request and handle completion
   */
  private async executeRequest<T>(
    fetchFn: () => Promise<T> | T,
    onComplete: () => void
  ): Promise<T> {
    try {
      const response = await fetchFn();
      onComplete();
      return response;
    } catch (error) {
      onComplete();
      throw error;
    }
  }

  /**
   * Process the global queue
   */
  private processGlobalQueue(): void {
    while (this.activeRequests < this.config.maxConcurrent && !this.globalQueue.isEmpty()) {
      const entry = this.globalQueue.dequeue();
      if (!entry) break;

      this.config.onDequeued(this.globalQueue.size());
      this.activeRequests++;

      // Execute the queued request
      this.executeRequest(entry.fetchFn, () => {
        this.activeRequests--;
        this.processGlobalQueue();
      })
        .then(entry.resolve)
        .catch(entry.reject);
    }
  }

  /**
   * Process a per-domain queue
   */
  private processPerDomainQueue(domain: string): void {
    const queue = this.perDomainQueues.get(domain);
    if (!queue) return;

    while ((this.perDomainActive.get(domain) || 0) < this.config.maxConcurrent && !queue.isEmpty()) {
      const entry = queue.dequeue();
      if (!entry) break;

      this.config.onDequeued(queue.size());
      this.perDomainActive.set(domain, (this.perDomainActive.get(domain) || 0) + 1);

      // Execute the queued request
      this.executeRequest(entry.fetchFn, () => {
        const active = this.perDomainActive.get(domain) || 0;
        this.perDomainActive.set(domain, Math.max(0, active - 1));
        this.processPerDomainQueue(domain);
      })
        .then(entry.resolve)
        .catch(entry.reject);
    }

    // Clean up empty queue
    if (queue.isEmpty()) {
      this.perDomainQueues.delete(domain);
    }
  }

  /**
   * Get the count of currently active requests
   */
  getActiveCount(): number {
    if (this.config.scope === 'global') {
      return this.activeRequests;
    } else {
      let total = 0;
      for (const count of this.perDomainActive.values()) {
        total += count;
      }
      return total;
    }
  }

  /**
   * Get the total size of all queues
   */
  getTotalQueueSize(): number {
    if (this.config.scope === 'global') {
      return this.globalQueue.size();
    } else {
      let total = 0;
      for (const queue of this.perDomainQueues.values()) {
        total += queue.size();
      }
      return total;
    }
  }

  /**
   * Clear all queues
   */
  clearQueues(): void {
    this.globalQueue.clear();
    this.perDomainQueues.clear();
  }
}
