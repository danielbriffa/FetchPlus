export type RequestPriority = 'low' | 'normal' | 'high' | 'critical';
export type QueueStrategy = 'fifo' | 'priority';
export type RateLimitScope = 'global' | 'per-domain';

export interface QueuedRequestEntry {
  id: string;
  input: RequestInfo | URL;
  init?: RequestInit;
  priority: RequestPriority;
  timestamp: number;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  fetchFn: () => Promise<Response>;
}

export interface RateLimitConfig {
  enabled?: boolean;           // default false
  maxConcurrent?: number;      // default 6
  queueStrategy?: QueueStrategy;  // default 'fifo'
  scope?: RateLimitScope;      // default 'global'
  maxQueueSize?: number;       // default 100
  onQueued?: (queueLength: number) => void;
  onDequeued?: (queueLength: number) => void;
}
