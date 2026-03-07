# FetchPlus

A powerful, lightweight enhancement for JavaScript's native `fetch()` API. Add automatic caching, cross-tab synchronization, and Axios-like interceptors while maintaining 100% backward compatibility.

[![npm version](https://img.shields.io/npm/v/fetchplus.svg)](https://www.npmjs.com/package/fetchplus)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Table of Contents

- [Why FetchPlus?](#why-fetchplus)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Caching](#caching)
  - [Basic Caching](#basic-caching)
  - [Cache with TTL (Time-to-Live)](#cache-with-ttl-time-to-live)
  - [Per-Request Cache Options](#per-request-cache-options)
  - [Force Refresh (Bypass Cache)](#force-refresh-bypass-cache)
  - [Disabling Caching Per-Request](#disabling-caching-per-request)
  - [Cache Key Generation](#cache-key-generation)
  - [What Gets Cached (and What Doesn't)](#what-gets-cached-and-what-doesnt)
  - [Clearing the Cache](#clearing-the-cache)
- [Cache Storage Strategies](#cache-storage-strategies)
  - [Cache Storage API (Default)](#cache-storage-api-default)
  - [localStorage](#localstorage)
  - [sessionStorage](#sessionstorage)
  - [In-Memory](#in-memory)
  - [Comparison Table](#comparison-table)
  - [Custom Cache Implementation](#custom-cache-implementation)
- [Automatic Retry](#automatic-retry)
  - [Basic Retry](#basic-retry)
  - [Backoff Strategies](#backoff-strategies)
  - [Retry-After Header](#retry-after-header)
  - [Per-Request Retry Config](#per-request-retry-config)
  - [Disabling Retry](#disabling-retry)
  - [onRetry Callback](#onretry-callback)
  - [Retry with AbortController](#retry-with-abortcontroller)
- [Request Deduplication](#request-deduplication)
  - [Basic Deduplication](#basic-deduplication)
  - [Custom Key Generator](#custom-key-generator)
  - [Per-Request Dedup Control](#per-request-dedup-control)
  - [Monitoring In-Flight Requests](#monitoring-in-flight-requests)
- [Request Timeout](#request-timeout)
  - [Basic Timeout](#basic-timeout)
  - [Per-Request Timeout](#per-request-timeout)
  - [Timeout with AbortController](#timeout-with-abortcontroller)
  - [Disabling Timeout](#disabling-timeout)
  - [TimeoutError](#timeouterror)
- [Offline Fallback](#offline-fallback)
  - [Basic Offline Setup](#basic-offline-setup)
  - [Offline Strategies](#offline-strategies)
  - [Request Queuing](#request-queuing)
  - [Per-Request Offline Control](#per-request-offline-control)
  - [Offline Callbacks](#offline-callbacks)
- [Stale-While-Revalidate (SWR)](#stale-while-revalidate-swr)
  - [Basic SWR Setup](#basic-swr-setup)
  - [Fresh and Stale Durations](#fresh-and-stale-durations)
  - [Per-Request SWR](#per-request-swr)
  - [Revalidation Callbacks](#revalidation-callbacks)
- [Interceptors](#interceptors)
  - [Request Interceptors](#request-interceptors)
  - [Response Interceptors](#response-interceptors)
  - [Error Interceptors](#error-interceptors)
  - [Removing Interceptors](#removing-interceptors)
  - [Skipping Interceptors Per-Request](#skipping-interceptors-per-request)
  - [Interceptor Execution Order](#interceptor-execution-order)
- [Cross-Tab Synchronization](#cross-tab-synchronization)
  - [Enabling Sync](#enabling-sync)
  - [How Sync Works](#how-sync-works)
  - [Per-Request Sync Override](#per-request-sync-override)
- [Configuration Reference](#configuration-reference)
  - [FetchPlusConfig](#fetchplusconfig)
  - [FetchPlusRequestInit](#fetchplusrequestinit)
  - [CacheOptions](#cacheoptions)
  - [CacheInterface](#cacheinterface)
- [API Reference](#api-reference)
  - [FetchPlus Class](#fetchplus-class)
  - [InterceptorManager](#interceptormanager)
  - [CacheSyncManager](#cachesyncmanager)
- [Recipes](#recipes)
  - [Authentication Headers](#authentication-headers)
  - [Automatic Retry on Failure](#automatic-retry-on-failure)
  - [Request Logging](#request-logging)
  - [Offline Fallback](#offline-fallback)
  - [API Base URL](#api-base-url)
  - [Response Transformation](#response-transformation)
  - [Stale-While-Revalidate Pattern](#stale-while-revalidate-pattern)
- [TypeScript Support](#typescript-support)
- [Browser Compatibility](#browser-compatibility)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Why FetchPlus?

The native `fetch()` API is great, but it lacks built-in caching, interceptors, and cross-tab coordination. Libraries like Axios add these features but introduce a completely different API. FetchPlus gives you the best of both worlds:

- **Zero learning curve** - if you know `fetch()`, you already know FetchPlus
- **Drop-in replacement** - swap `fetch()` globally with one line, and all existing code works unchanged
- **Opt-in features** - caching, interceptors, and sync are all configurable and optional
- **Zero dependencies** - lightweight and self-contained

```javascript
// Before: plain fetch
const res = await fetch('https://api.example.com/users');

// After: FetchPlus initialized — same code, now with caching + interceptors
const res = await fetch('https://api.example.com/users');
```

Nothing changes in your calling code. FetchPlus enhances `fetch()` transparently.

---

## Features

| Feature | Description |
|---|---|
| **100% Backward Compatible** | Works as a drop-in replacement for native `fetch()` |
| **Automatic Caching** | Out-of-the-box caching with multiple storage strategies |
| **Automatic Retry** | Configurable retry with exponential, linear, or fixed backoff |
| **Request Deduplication** | Identical in-flight requests share a single network call |
| **Request Timeout** | Configurable per-request and global timeouts with AbortSignal integration |
| **Offline Fallback** | Automatic offline detection with cache strategies and request queuing |
| **Stale-While-Revalidate** | Serve cached responses instantly while refreshing in the background |
| **Cross-Tab Sync** | Cache updates sync across browser tabs via BroadcastChannel |
| **Force Refresh** | Bypass cache and fetch fresh data when needed |
| **Interceptors** | Axios-like request, response, and error interceptors |
| **Flexible Config** | Global and per-request configuration |
| **Multiple Storage Backends** | Cache Storage API, localStorage, sessionStorage, or in-memory |
| **TTL Support** | Automatic cache expiration with time-to-live |
| **TypeScript** | Full type definitions included |
| **Zero Dependencies** | Lightweight and self-contained |

---

## Installation

```bash
npm install fetchplus
```

```bash
yarn add fetchplus
```

```bash
pnpm add fetchplus
```

### Using via CDN / Script Tag

```html
<script type="module">
  import FetchPlus from './dist/index.js';

  const fp = new FetchPlus({ enableCaching: true });
  fp.init();
</script>
```

---

## Quick Start

### Minimal Setup (Global Fetch Replacement)

```typescript
import FetchPlus from 'fetchplus';

const fp = new FetchPlus({
  enableCaching: true,
  cacheOptions: { ttl: 60000 } // cache for 1 minute
});

fp.init(); // replaces globalThis.fetch

// Now every fetch() call in your app is enhanced automatically
const response = await fetch('https://api.example.com/data');
const data = await response.json();
```

### Without Replacing Global Fetch

If you prefer not to replace the global `fetch`, set `replaceGlobalFetch: false` and call the instance method directly:

```typescript
import { FetchPlus } from 'fetchplus';

const fp = new FetchPlus({
  replaceGlobalFetch: false,
  enableCaching: true
});

fp.init();

// Use fp.fetch() instead of global fetch()
const response = await fp.fetch('https://api.example.com/data');
const data = await response.json();
```

### Using the Default Singleton

FetchPlus exports a pre-created instance for convenience:

```typescript
import fetchPlus from 'fetchplus';

fetchPlus.init();

// Global fetch is now enhanced
const response = await fetch('https://api.example.com/data');
```

---

## How It Works

When you call `fp.init()`, FetchPlus replaces `globalThis.fetch` with its own enhanced version. Every subsequent `fetch()` call flows through this pipeline:

```
fetch('https://api.example.com/data')
  │
  ▼
┌─────────────────────────┐
│  Request Interceptors   │  Modify URL, headers, body, etc.
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Cache Lookup           │  Check if a valid cached response exists
│  (skip if forceRefresh) │
└────────────┬────────────┘
         ┌───┴───┐
     hit │       │ miss
         ▼       ▼
    [cached]   [network fetch]
         │       │
         │       ├──▶ Store in cache (if cacheable)
         │       │
         └───┬───┘
             │
             ▼
┌─────────────────────────┐
│  Response Interceptors  │  Log, transform, validate, etc.
└────────────┬────────────┘
             │
             ▼
        [Response]
```

If a network error occurs, the **error interceptor** chain runs instead, giving you the opportunity to return a fallback response or rethrow.

---

## Caching

### Basic Caching

By default, FetchPlus caches all successful `GET` requests. The first call hits the network; subsequent calls for the same URL return the cached response instantly.

```typescript
import FetchPlus from 'fetchplus';

const fp = new FetchPlus();
fp.init();

// 1st call: network request, response is cached
const res1 = await fetch('https://api.example.com/users');
const users1 = await res1.json();

// 2nd call: served from cache (instant, no network request)
const res2 = await fetch('https://api.example.com/users');
const users2 = await res2.json();
```

### Cache with TTL (Time-to-Live)

Set a global TTL so cached responses expire automatically:

```typescript
const fp = new FetchPlus({
  cacheOptions: {
    ttl: 5 * 60 * 1000 // 5 minutes in milliseconds
  }
});

fp.init();

// This response is cached for 5 minutes
const res = await fetch('https://api.example.com/users');

// After 5 minutes, the next call will hit the network again
```

Without a TTL, cached entries persist indefinitely (until the cache storage is cleared or the browser evicts them).

### Per-Request Cache Options

Override the global cache settings for individual requests:

```typescript
// Cache this specific request for only 10 seconds
const res = await fetch('https://api.example.com/live-scores', {
  fetchPlusCache: {
    ttl: 10000
  }
});

// Cache this request for 1 hour (overrides global 5-minute TTL)
const res2 = await fetch('https://api.example.com/static-config', {
  fetchPlusCache: {
    ttl: 60 * 60 * 1000
  }
});
```

### Force Refresh (Bypass Cache)

Sometimes you need fresh data even if a cached version exists. Use `forceRefresh` to skip the cache read while still updating the cache with the fresh response:

```typescript
// Always hits the network, but the new response is still cached
const res = await fetch('https://api.example.com/data', {
  forceRefresh: true
});
```

This is useful for "pull to refresh" functionality or when you know the data has changed.

### Disabling Caching Per-Request

To skip caching entirely for a request (no cache read, no cache write):

```typescript
// This request will not read from or write to the cache
const res = await fetch('https://api.example.com/analytics', {
  fetchPlusCache: false
});
```

### Cache Key Generation

FetchPlus generates cache keys in the format `METHOD:normalized_url`. The URL is normalized for consistency:

- **Query parameters are sorted alphabetically**, so `/api?b=2&a=1` and `/api?a=1&b=2` produce the same cache key
- **Trailing slashes are removed**, so `/api/data/` and `/api/data` match
- **HTTP method is included**, so `GET /api/data` and `POST /api/data` are cached separately

```typescript
// These all produce the same cache key:
await fetch('https://api.example.com/users?sort=name&page=1');
await fetch('https://api.example.com/users?page=1&sort=name');
await fetch('https://api.example.com/users/?sort=name&page=1');

// These produce different cache keys (different methods):
await fetch('https://api.example.com/users');                           // GET:https://api.example.com/users
await fetch('https://api.example.com/users', { method: 'POST' });      // POST:https://api.example.com/users
```

### What Gets Cached (and What Doesn't)

FetchPlus only caches responses that meet these criteria:

| Condition | Cached? |
|---|---|
| `GET` request with `2xx` response | Yes |
| `POST`, `PUT`, `DELETE` requests | No (by default) |
| Response with `Cache-Control: no-store` header | No |
| `4xx` or `5xx` error responses | No |
| `3xx` redirect responses | No |

You can customize which HTTP methods are cacheable:

```typescript
const fp = new FetchPlus({
  cacheableMethods: ['GET', 'HEAD'] // also cache HEAD requests
});
```

### Clearing the Cache

```typescript
// Clear ALL cached responses
await fp.clearCache();

// Delete a single cache entry by its key
await fp.deleteCache('GET:https://api.example.com/users');
```

If cross-tab sync is enabled, both operations are broadcast to all other tabs.

---

## Cache Storage Strategies

FetchPlus ships with four cache backends. Choose the one that fits your use case.

### Cache Storage API (Default)

Uses the browser's [Cache Storage API](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage). This is the default because it handles `Response` objects natively, supports large payloads, and persists across browser sessions.

```typescript
import FetchPlus, { CacheStorageCache } from 'fetchplus';

// These are equivalent (CacheStorageCache is the default):
const fp1 = new FetchPlus();
const fp2 = new FetchPlus({ cache: new CacheStorageCache() });

// Use a custom cache name to isolate from other apps:
const fp3 = new FetchPlus({
  cache: new CacheStorageCache('my-app-cache-v2')
});
```

### localStorage

Persists across browser sessions and tabs. Responses are serialized to JSON with base64-encoded bodies, so it works best for text/JSON responses under ~5 MB.

```typescript
import FetchPlus, { LocalStorageCache } from 'fetchplus';

const fp = new FetchPlus({
  cache: new LocalStorageCache()
});

fp.init();

// Cached data survives browser restarts
const res = await fetch('https://api.example.com/config');
```

### sessionStorage

Persists only during the current browser session (cleared when the tab/window closes). Same serialization as localStorage.

```typescript
import FetchPlus, { SessionStorageCache } from 'fetchplus';

const fp = new FetchPlus({
  cache: new SessionStorageCache()
});

fp.init();

// Cached data is cleared when the user closes the tab
const res = await fetch('https://api.example.com/session-data');
```

### In-Memory

Stored in a JavaScript `Map`. Fastest option, but cleared on page reload. Includes LRU eviction to prevent unbounded memory growth (default limit: 500 entries).

```typescript
import FetchPlus, { InMemoryCache } from 'fetchplus';

// Default: 500 max entries
const fp1 = new FetchPlus({
  cache: new InMemoryCache()
});

// Custom limit
const fp2 = new FetchPlus({
  cache: new InMemoryCache(100) // max 100 entries
});

fp1.init();
```

When the entry limit is reached, the least recently accessed entry is evicted.

### Comparison Table

| Storage | Persists Across Sessions | Persists Across Tabs | Size Limit | Speed | Best For |
|---|---|---|---|---|---|
| **Cache Storage** (default) | Yes | Yes | Large (browser-managed) | Fast | General use, large responses |
| **localStorage** | Yes | Yes | ~5-10 MB | Fast | Small config/text data |
| **sessionStorage** | No | No | ~5-10 MB | Fast | Session-scoped data |
| **In-Memory** | No | No | JS heap (configurable max entries) | Fastest | SPAs, short-lived data |

### Custom Cache Implementation

You can provide your own cache by implementing the `CacheInterface`:

```typescript
import type { CacheInterface, CacheOptions } from 'fetchplus';

class MyRedisCache implements CacheInterface {
  async get(key: string): Promise<Response | null> {
    // fetch from your backend/Redis
  }

  async set(key: string, response: Response, options?: CacheOptions): Promise<void> {
    // store in your backend/Redis
  }

  async delete(key: string): Promise<boolean> {
    // delete from your backend/Redis
  }

  async clear(): Promise<void> {
    // clear all entries
  }

  async has(key: string): Promise<boolean> {
    // check if key exists
  }
}

const fp = new FetchPlus({
  cache: new MyRedisCache()
});
```

You can also use a custom cache for a single request:

```typescript
const specialCache = new InMemoryCache(50);

const res = await fetch('https://api.example.com/data', {
  fetchPlusCache: specialCache // use this cache only for this request
});
```

---

## Automatic Retry

FetchPlus can automatically retry failed requests with configurable backoff strategies. Retries are triggered by network errors and specific HTTP status codes (429, 500, 502, 503, 504 by default).

### Basic Retry

Enable retry globally or per-request:

```typescript
// Global: retry all failed requests up to 3 times
const fp = new FetchPlus({
  retry: {
    maxRetries: 3,
  },
});

fp.init();

// All fetch() calls now automatically retry on failure
const res = await fetch('https://api.example.com/data');
```

### Backoff Strategies

Three strategies control the delay between retries:

```typescript
// Exponential (default): 1s, 2s, 4s, 8s...
const fp = new FetchPlus({
  retry: {
    backoffStrategy: 'exponential',
    initialDelay: 1000,
    backoffMultiplier: 2,
    maxDelay: 30000, // cap at 30 seconds
  },
});

// Linear: 1s, 2s, 3s, 4s...
const fp = new FetchPlus({
  retry: {
    backoffStrategy: 'linear',
    initialDelay: 1000,
  },
});

// Fixed: 1s, 1s, 1s...
const fp = new FetchPlus({
  retry: {
    backoffStrategy: 'fixed',
    initialDelay: 1000,
  },
});
```

### Retry-After Header

When a server responds with a `Retry-After` header (common with 429 Too Many Requests), FetchPlus respects it automatically:

```typescript
const fp = new FetchPlus({
  retry: {
    maxRetries: 3,
    respectRetryAfter: true, // default: true
  },
});
```

The `Retry-After` header supports both seconds (`Retry-After: 120`) and HTTP-date (`Retry-After: Wed, 21 Oct 2025 07:28:00 GMT`) formats. The delay is capped at `maxDelay`.

Set `respectRetryAfter: false` to always use the backoff calculation instead.

### Per-Request Retry Config

Override global retry settings for individual requests:

```typescript
// Use a more aggressive retry for this critical request
const res = await fetch('https://api.example.com/payment', {
  retry: {
    maxRetries: 5,
    backoffStrategy: 'exponential',
    initialDelay: 500,
    retryableStatusCodes: [429, 502, 503],
  },
});
```

### Disabling Retry

```typescript
// Disable retry for a specific request (even if globally enabled)
const res = await fetch('https://api.example.com/fire-and-forget', {
  retry: false,
});

// Disable retry globally
const fp = new FetchPlus({
  retry: false,
});
```

### onRetry Callback

Get notified before each retry attempt for logging, metrics, or UI updates:

```typescript
const res = await fetch('https://api.example.com/data', {
  retry: {
    maxRetries: 3,
    onRetry: (error, attemptNumber, delayMs) => {
      console.log(`Retry ${attemptNumber}/3 in ${delayMs}ms: ${error.message}`);
      // Update a loading spinner, increment a metric, etc.
    },
  },
});
```

### Retry with AbortController

Retries respect `AbortController` — aborting the request stops all retry attempts immediately:

```typescript
const controller = new AbortController();

// Cancel after 10 seconds (including retries)
setTimeout(() => controller.abort(), 10000);

try {
  const res = await fetch('https://api.example.com/data', {
    signal: controller.signal,
    retry: { maxRetries: 5 },
  });
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request and retries were cancelled');
  }
}
```

### Retry Configuration Reference

| Property | Type | Default | Description |
|---|---|---|---|
| `maxRetries` | `number` | `3` | Maximum retry attempts (capped at 10) |
| `backoffStrategy` | `'exponential' \| 'linear' \| 'fixed'` | `'exponential'` | Delay calculation strategy |
| `initialDelay` | `number` | `1000` | Initial delay in ms before the first retry |
| `maxDelay` | `number` | `30000` | Maximum delay between retries in ms |
| `backoffMultiplier` | `number` | `2` | Multiplier for exponential backoff |
| `retryableStatusCodes` | `number[]` | `[408, 429, 500, 502, 503, 504]` | HTTP status codes that trigger a retry |
| `retryOnNetworkError` | `boolean` | `true` | Whether to retry on network failures (TypeError) |
| `respectRetryAfter` | `boolean` | `true` | Respect the Retry-After response header |
| `onRetry` | `function` | - | Callback `(error, attemptNumber, delayMs) => void` |

### How Retry Fits in the Pipeline

```
fetch('https://api.example.com/data')
  │
  ▼
Request Interceptors (run once)
  │
  ▼
Cache Lookup (if hit, return immediately — no retry needed)
  │ (cache miss)
  ▼
┌────────────────────────────┐
│  Native fetch()            │◄──┐
│                            │   │ retry (with backoff delay)
│  → success? return         │   │
│  → retryable error/status? ├───┘
│  → all retries exhausted?  │──► throw RetryError
└────────────────────────────┘
  │ (success)
  ▼
Cache Storage (cache the successful response)
  │
  ▼
Response Interceptors (run once on final response)
  │
  ▼
Return to caller
```

Request interceptors run **once** before the retry loop. Response interceptors run **once** after the final successful attempt. If all retries are exhausted, a `RetryError` is thrown (which error interceptors can handle).

### RetryError

When all retry attempts are exhausted, a `RetryError` is thrown with metadata:

```typescript
import { RetryError } from 'fetchplus';

try {
  await fetch('https://api.example.com/unstable');
} catch (error) {
  if (error instanceof RetryError) {
    console.log(error.message);    // "Request failed after 4 attempts"
    console.log(error.attempts);   // 4
    console.log(error.lastError);  // The underlying TypeError or Error
    console.log(error.totalDelay); // Total ms spent waiting between retries
  }
}
```

---

## Request Deduplication

When multiple parts of your application request the same resource simultaneously (e.g., 5 React components mounting and all fetching `/api/user`), FetchPlus can consolidate them into a single network call. All callers receive the same response.

### Basic Deduplication

```typescript
const fp = new FetchPlus({
  deduplication: { enabled: true },
});

fp.init();

// These fire at the same time — only 1 network call is made
const promise1 = fetch('https://api.example.com/user');
const promise2 = fetch('https://api.example.com/user');
const promise3 = fetch('https://api.example.com/user');

// All three resolve with the same data
const [res1, res2, res3] = await Promise.all([promise1, promise2, promise3]);
```

Deduplication only applies while a request is **in-flight**. Once the first request completes, subsequent calls trigger a new network request (or hit the cache, if caching is enabled).

Requests are considered identical when they have the same HTTP method and normalized URL. POST/PUT/PATCH requests with different bodies are **not** deduplicated.

### Custom Key Generator

Override how FetchPlus determines whether two requests are "identical":

```typescript
const fp = new FetchPlus({
  deduplication: {
    enabled: true,
    keyGenerator: (input, init) => {
      // Ignore query parameters — /api/users?page=1 and /api/users?page=2
      // are treated as the same request
      const url = typeof input === 'string' ? new URL(input) : new URL(input.toString());
      return `${init?.method || 'GET'}:${url.origin}${url.pathname}`;
    },
  },
});
```

### Per-Request Dedup Control

```typescript
// Force a new network call even if an identical request is in-flight
const res = await fetch('https://api.example.com/data', {
  deduplicate: false,
});

// Enable dedup for a single request (even if globally disabled)
const res = await fetch('https://api.example.com/data', {
  deduplicate: true,
});
```

### Monitoring In-Flight Requests

```typescript
import { DeduplicationManager } from 'fetchplus';

// Access via the FetchPlus instance's dedup manager
// Or create standalone for advanced use:
const dedup = new DeduplicationManager({ enabled: true });

dedup.getInFlightCount(); // number of unique in-flight requests
dedup.hasInFlight('https://api.example.com/data'); // true if in-flight
dedup.clearAll(); // cancel tracking of all in-flight requests
```

### How Dedup Fits in the Pipeline

```
fetch('https://api.example.com/data')
  │
  ▼
Request Interceptors (run for each call)
  │
  ▼
┌─────────────────────────────────┐
│  Dedup Check                    │
│  Is an identical request        │
│  already in-flight?             │
│                                 │
│  YES → wait for it, return      │
│         cloned response         │
│                                 │
│  NO → proceed ↓                 │
└────────────┬────────────────────┘
             │
             ▼
     Cache Check → Retry → Network fetch
             │
             ▼
  Response Interceptors (run for each call)
             │
             ▼
        Return to caller
```

---

## Request Timeout

FetchPlus supports configurable request timeouts at both global and per-request levels. When a request exceeds the timeout, a `TimeoutError` is thrown and the request is automatically aborted.

### Basic Timeout

Set a global default timeout for all requests:

```typescript
const fp = new FetchPlus({
  timeout: {
    defaultTimeout: 10000, // 10 seconds for all requests
  },
});

fp.init();

// This request will throw TimeoutError if it takes longer than 10 seconds
const res = await fetch('https://api.example.com/data');
```

### Per-Request Timeout

Override the global timeout for individual requests:

```typescript
const fp = new FetchPlus({
  timeout: { defaultTimeout: 10000 }, // global 10s timeout
});

fp.init();

// This request has a 30-second timeout (overrides the global 10s)
const res = await fetch('https://api.example.com/large-download', {
  timeout: 30000,
});

// This request has a tight 2-second timeout
const res2 = await fetch('https://api.example.com/health', {
  timeout: 2000,
});
```

### Timeout with AbortController

Timeouts work seamlessly with user-provided `AbortController` signals. Whichever fires first (your abort or the timeout) cancels the request:

```typescript
const controller = new AbortController();

// Cancel manually after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  const res = await fetch('https://api.example.com/data', {
    signal: controller.signal,
    timeout: 10000, // 10s timeout
  });
} catch (error) {
  if (error.name === 'TimeoutError') {
    console.log('Request timed out');
  } else if (error.name === 'AbortError') {
    console.log('Request was manually aborted');
  }
}
```

### Disabling Timeout

```typescript
// Disable timeout for a specific request (even if globally configured)
const res = await fetch('https://api.example.com/long-running', {
  timeout: 0, // 0 disables timeout for this request
});
```

### TimeoutError

When a request times out, a `TimeoutError` is thrown with metadata:

```typescript
import { TimeoutError } from 'fetchplus';

try {
  await fetch('https://api.example.com/slow', { timeout: 5000 });
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log(error.message);   // "Request timeout after 5000ms"
    console.log(error.timeoutMs); // 5000
  }
}
```

### How Timeout Fits in the Pipeline

```
fetch('https://api.example.com/data', { timeout: 5000 })
  │
  ▼
Request Interceptors (run once)
  │
  ▼
┌────────────────────────────────────────┐
│  Timeout Wrapper                       │
│  Starts countdown timer                │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  Dedup → Cache → Retry → Network│  │
│  └──────────────────────────────────┘  │
│                                        │
│  Timer fires? → abort + throw          │
│                TimeoutError            │
└────────────────────────────────────────┘
  │ (success before timeout)
  ▼
Response Interceptors (run once)
  │
  ▼
Return to caller
```

Timeout wraps the entire core fetch pipeline (deduplication, cache lookup, retry, and network call). If retry is enabled, the timeout applies to the **total** time including all retry attempts.

### Timeout Configuration Reference

| Property | Type | Default | Description |
|---|---|---|---|
| `defaultTimeout` | `number` | `undefined` | Default timeout in ms for all requests. `undefined` means no timeout |

---

## Offline Fallback

FetchPlus can automatically detect when the browser goes offline and serve responses from cache instead of hitting the network. Optionally, failed requests can be queued and retried when connectivity is restored.

### Basic Offline Setup

```typescript
const fp = new FetchPlus({
  enableCaching: true,
  offline: {
    enabled: true,
    strategy: 'cache-first', // default
  },
});

fp.init();

// When online: fetches from network (caches the response)
const res1 = await fetch('https://api.example.com/data');

// When offline: automatically serves the cached response
const res2 = await fetch('https://api.example.com/data');
```

### Offline Strategies

Three strategies control how requests are handled:

**Cache-First (default):** Check cache first. If cache miss, try the network. Best for most offline scenarios.

```typescript
const fp = new FetchPlus({
  offline: {
    enabled: true,
    strategy: 'cache-first',
  },
});
```

**Network-First:** Try the network first. If it fails, fall back to cache. Best when fresh data is preferred but stale data is acceptable.

```typescript
const fp = new FetchPlus({
  offline: {
    enabled: true,
    strategy: 'network-first',
  },
});
```

**Cache-Only:** Only serve from cache, never make network requests through the offline manager. Useful for fully offline-first applications.

```typescript
const fp = new FetchPlus({
  offline: {
    enabled: true,
    strategy: 'cache-only',
  },
});
```

### Request Queuing

When offline, failed requests can be queued and automatically retried when the browser comes back online:

```typescript
const fp = new FetchPlus({
  offline: {
    enabled: true,
    queueRequests: true,
    maxQueueSize: 50, // default: 50 requests
    onQueuedRequestRetry: (request, response, error) => {
      if (response) {
        console.log(`Queued request succeeded: ${request.input}`);
      } else {
        console.log(`Queued request failed: ${error?.message}`);
      }
    },
  },
});

fp.init();

// If this request fails while offline, it's automatically queued
// and retried when the browser comes back online
try {
  await fetch('https://api.example.com/submit', { method: 'POST', body: data });
} catch (error) {
  console.log('Request queued for retry when online');
}
```

When the queue reaches `maxQueueSize`, the oldest request is discarded (FIFO).

### Per-Request Offline Control

Override the global offline strategy and queueing for individual requests:

```typescript
// Use network-first for this request even if global strategy is cache-first
const res = await fetch('https://api.example.com/live-data', {
  offlineStrategy: 'network-first',
});

// Disable queueing for this request even if globally enabled
const res2 = await fetch('https://api.example.com/analytics', {
  queueIfOffline: false,
});

// Enable queueing for this request even if globally disabled
const res3 = await fetch('https://api.example.com/important', {
  queueIfOffline: true,
});
```

### Offline Callbacks

Get notified when the browser goes offline or online:

```typescript
const fp = new FetchPlus({
  offline: {
    enabled: true,
    onOffline: () => {
      console.log('Browser went offline');
      showOfflineBanner();
    },
    onOnline: () => {
      console.log('Browser is back online');
      hideOfflineBanner();
    },
  },
});
```

### Offline Configuration Reference

| Property | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Enable offline detection and fallback |
| `strategy` | `'cache-first' \| 'network-first' \| 'cache-only'` | `'cache-first'` | How requests are handled |
| `queueRequests` | `boolean` | `false` | Queue failed requests for retry when back online |
| `maxQueueSize` | `number` | `50` | Maximum number of queued requests |
| `onOffline` | `() => void` | - | Callback when going offline |
| `onOnline` | `() => void` | - | Callback when going online |
| `onQueuedRequestRetry` | `(request, response, error) => void` | - | Callback when a queued request is retried |

### How Offline Fits in the Pipeline

```
fetch('https://api.example.com/data')
  │
  ▼
Request Interceptors (run once)
  │
  ▼
Dedup → Timeout →
  │
  ▼
┌───────────────────────────────────┐
│  Offline Handler                  │
│                                   │
│  Online?                          │
│  → Execute with strategy          │
│    (cache-first / network-first)  │
│                                   │
│  Offline?                         │
│  → Try cache                      │
│  → Queue request if enabled       │
│  → Throw if no cache available    │
└───────────────────────────────────┘
  │
  ▼
Cache → Retry → Network
  │
  ▼
Response Interceptors
  │
  ▼
Return to caller
```

---

## Stale-While-Revalidate (SWR)

FetchPlus supports the stale-while-revalidate caching pattern: serve a cached response immediately (even if stale) while fetching fresh data in the background. This gives users instant responses while keeping the cache up to date.

### Basic SWR Setup

```typescript
const fp = new FetchPlus({
  enableCaching: true,
  staleWhileRevalidate: {
    enabled: true,
    freshDuration: 5000,  // 5s — cache considered fresh
    staleDuration: 60000, // 60s — cache can still be served as stale
  },
});

fp.init();

// 1st call: cache miss — fetches from network, caches response
const res1 = await fetch('https://api.example.com/data');

// 2nd call (within 5s): cache is fresh — served instantly, no revalidation
const res2 = await fetch('https://api.example.com/data');

// 3rd call (after 5s, within 60s): cache is stale — served instantly,
// fresh data fetched in background and cache is updated
const res3 = await fetch('https://api.example.com/data');

// 4th call (after 60s): cache expired — fetches from network normally
const res4 = await fetch('https://api.example.com/data');
```

### Fresh and Stale Durations

The two durations control SWR behavior:

```
 0s         5s (freshDuration)      60s (staleDuration)
 |── fresh ──|────── stale ──────────|── expired ──>
 │           │                       │
 │ Return    │ Return cached +       │ Normal fetch
 │ cached    │ bg revalidation       │ (cache miss)
```

- **Fresh** (`age < freshDuration`): Return cache, no network call
- **Stale** (`freshDuration <= age < staleDuration`): Return cache immediately + fetch fresh data in background
- **Expired** (`age >= staleDuration`): Treat as cache miss, fetch from network

```typescript
// Always revalidate (freshDuration: 0 = never fresh)
const fp = new FetchPlus({
  staleWhileRevalidate: {
    enabled: true,
    freshDuration: 0,       // always revalidate in background
    staleDuration: Infinity, // serve stale forever
  },
});

// Conservative: keep fresh for 30s, allow stale up to 5 minutes
const fp2 = new FetchPlus({
  staleWhileRevalidate: {
    enabled: true,
    freshDuration: 30000,
    staleDuration: 5 * 60 * 1000,
  },
});
```

### Per-Request SWR

Override or disable SWR for individual requests:

```typescript
// Use different SWR settings for this request
const res = await fetch('https://api.example.com/live', {
  staleWhileRevalidate: {
    enabled: true,
    freshDuration: 1000,    // very short fresh window
    staleDuration: 10000,
  },
});

// Disable SWR for this request (uses normal caching)
const res2 = await fetch('https://api.example.com/critical', {
  staleWhileRevalidate: false,
});
```

### Revalidation Callbacks

Get notified when background revalidation completes:

```typescript
const fp = new FetchPlus({
  staleWhileRevalidate: {
    enabled: true,
    freshDuration: 5000,
    staleDuration: 60000,
    onRevalidationComplete: (response, error) => {
      if (response) {
        console.log('Cache updated with fresh data');
      } else {
        console.error('Background revalidation failed:', error?.message);
        // The stale cached response is still preserved
      }
    },
  },
});
```

If background revalidation fails, the stale cache is preserved — users still get data, just not the freshest.

### SWR Configuration Reference

| Property | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Enable stale-while-revalidate |
| `freshDuration` | `number` | `0` | Time in ms a cached response is considered fresh (no revalidation) |
| `staleDuration` | `number` | `Infinity` | Time in ms a cached response can be served as stale |
| `onRevalidationComplete` | `(response, error) => void` | - | Callback when background revalidation completes |

### How SWR Fits in the Pipeline

```
fetch('https://api.example.com/data')
  │
  ▼
Request Interceptors
  │
  ▼
Dedup → Timeout → Offline →
  │
  ▼
┌────────────────────────────────┐
│  SWR Check                     │
│                                │
│  Fresh? → return cache         │
│  Stale? → return cache +       │
│           bg revalidation      │
│  Expired/None? → ↓             │
└────────────────────────────────┘
  │
  ▼
Retry → Network → Cache response
  │
  ▼
Response Interceptors
  │
  ▼
Return to caller
```

SWR replaces the regular cache check when enabled. Background revalidation runs through the full retry + network pipeline.

---

## Interceptors

Interceptors let you run logic before requests, after responses, or when errors occur. They work like middleware and execute in the order they were registered.

### Request Interceptors

Request interceptors run **before** every fetch call. They can modify the URL, headers, body, or any other request option.

**Adding an auth token to every request:**

```typescript
const fp = new FetchPlus();
fp.init();

fp.getInterceptors().addRequestInterceptor((input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${getToken()}`);

  return {
    input,
    init: { ...init, headers }
  };
});

// Every request now includes the Authorization header
const res = await fetch('https://api.example.com/protected');
```

**Rewriting the URL (e.g., adding a base URL):**

```typescript
fp.getInterceptors().addRequestInterceptor((input, init) => {
  if (typeof input === 'string' && input.startsWith('/')) {
    return {
      input: `https://api.example.com${input}`,
      init
    };
  }
  return { input, init };
});

// This now calls https://api.example.com/users
const res = await fetch('/users');
```

**Return formats:** A request interceptor can return:
- An object `{ input, init }` (recommended) to modify both the URL and options
- Just a URL string, `URL` object, or `Request` object to modify only the URL

### Response Interceptors

Response interceptors run **after** every successful fetch (including cached responses). They receive the `Response` object and must return a `Response`.

**Logging all responses:**

```typescript
fp.getInterceptors().addResponseInterceptor((response) => {
  console.log(`[${response.status}] ${response.url}`);
  return response; // always return the response
});
```

**Throwing on non-OK responses:**

```typescript
fp.getInterceptors().addResponseInterceptor(async (response) => {
  if (!response.ok) {
    const body = await response.clone().text();
    throw new Error(`API Error ${response.status}: ${body}`);
  }
  return response;
});
```

**Transforming response data:**

```typescript
fp.getInterceptors().addResponseInterceptor(async (response) => {
  // Wrap all JSON responses with metadata
  if (response.headers.get('content-type')?.includes('application/json')) {
    const data = await response.clone().json();
    const wrapped = {
      data,
      fetchedAt: new Date().toISOString(),
      cached: response.headers.has('X-FetchPlus-Expires')
    };
    return new Response(JSON.stringify(wrapped), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }
  return response;
});
```

### Error Interceptors

Error interceptors run when the fetch call itself throws (network failure, DNS errors, etc.). They receive the `Error` and can either:

- **Return a `Response`** to recover from the error (the fetch call resolves with this response instead of rejecting)
- **Return `void`** to observe the error without handling it (the error is re-thrown)

**Global error logging:**

```typescript
fp.getInterceptors().addErrorInterceptor((error) => {
  console.error('Network request failed:', error.message);
  // Returning void — the error is still thrown to the caller
});
```

**Returning a fallback response:**

```typescript
fp.getInterceptors().addErrorInterceptor((error) => {
  // Return a synthetic error response instead of throwing
  return new Response(
    JSON.stringify({ error: 'Service unavailable', offline: true }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    }
  );
});

// This will resolve (not reject) even if the network is down
const res = await fetch('https://api.example.com/data');
const data = await res.json();
// data.offline === true when the network is down
```

**Multiple error interceptors:** When the first error interceptor returns a `Response`, the remaining error interceptors are skipped and the response is returned to the caller. If all error interceptors return `void`, the original error is thrown.

### Removing Interceptors

Every `add*Interceptor` method returns a numeric ID you can use to remove it later:

```typescript
const authId = fp.getInterceptors().addRequestInterceptor((input, init) => {
  // ... add auth header
  return { input, init };
});

const loggerId = fp.getInterceptors().addResponseInterceptor((response) => {
  console.log(response.status);
  return response;
});

// Remove specific interceptors
fp.getInterceptors().removeInterceptor(authId);
fp.getInterceptors().removeInterceptor(loggerId);

// Or remove all interceptors at once
fp.getInterceptors().clearAll();
```

### Skipping Interceptors Per-Request

For specific requests where you don't want interceptors to run (e.g., health checks, token refresh):

```typescript
// This request skips ALL interceptors (request, response, and error)
const res = await fetch('https://api.example.com/health', {
  skipInterceptors: true
});
```

### Interceptor Execution Order

Interceptors execute in **registration order** (first registered = first executed):

```
Request:  interceptor1 → interceptor2 → interceptor3 → [fetch]
Response: interceptor1 → interceptor2 → interceptor3 → [return]
Error:    interceptor1 → interceptor2 → interceptor3 → [throw or return]
```

Each interceptor receives the output of the previous one, forming a pipeline.

---

## Cross-Tab Synchronization

FetchPlus can synchronize cache operations across browser tabs using the [BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel). When one tab clears or deletes cache entries, all other tabs are notified and update their caches accordingly.

### Enabling Sync

```typescript
const fp = new FetchPlus({
  enableSync: true,                   // turn on cross-tab sync
  syncChannelName: 'my-app-sync'      // optional custom channel name (default: 'fetchplus-sync')
});

fp.init();
```

### How Sync Works

| Event in Tab A | Effect in Tab B |
|---|---|
| `fp.deleteCache('GET:...')` | The same cache entry is deleted |
| `fp.clearCache()` | The entire cache is cleared |
| A new response is cached | Tab B is notified (but fetches independently when needed) |

Cache **set** events notify other tabs that data is available, but the actual response data is not transferred over BroadcastChannel. Each tab reads from the shared cache storage (Cache Storage API or localStorage) independently.

### Per-Request Sync Override

Override the global sync setting for individual requests:

```typescript
// Disable sync for this specific request
const res = await fetch('https://api.example.com/private', {
  enableSync: false
});

// Enable sync even if globally disabled
const res2 = await fetch('https://api.example.com/shared', {
  enableSync: true
});
```

### Checking Sync Status

```typescript
if (fp.isSyncAvailable()) {
  console.log('Cross-tab sync is active');
} else {
  console.log('BroadcastChannel not supported or sync disabled');
}
```

---

## Configuration Reference

### FetchPlusConfig

Passed to the `FetchPlus` constructor or to `init()`.

```typescript
interface FetchPlusConfig {
  cache?: CacheInterface;
  cacheOptions?: CacheOptions;
  enableCaching?: boolean;
  cacheableMethods?: string[];
  replaceGlobalFetch?: boolean;
  cacheName?: string;
  enableSync?: boolean;
  syncChannelName?: string;
  retry?: RetryConfig | false;
  deduplication?: DeduplicationConfig;
  timeout?: TimeoutConfig;
  offline?: OfflineConfig;
  staleWhileRevalidate?: StaleWhileRevalidateConfig;
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `cache` | `CacheInterface` | `CacheStorageCache` | The cache backend to use |
| `cacheOptions` | `CacheOptions` | `{}` | Default cache options applied to all requests |
| `enableCaching` | `boolean` | `true` | Whether caching is enabled globally |
| `cacheableMethods` | `string[]` | `['GET']` | HTTP methods eligible for caching |
| `replaceGlobalFetch` | `boolean` | `true` | Whether `init()` replaces `globalThis.fetch` |
| `cacheName` | `string` | `'fetchplus-v1'` | Name for the Cache Storage API cache |
| `enableSync` | `boolean` | `false` | Whether cross-tab sync is enabled |
| `syncChannelName` | `string` | `'fetchplus-sync'` | BroadcastChannel name for sync |
| `retry` | `RetryConfig \| false` | `undefined` | Global retry config. See [Automatic Retry](#automatic-retry) |
| `deduplication` | `DeduplicationConfig` | `{ enabled: false }` | Request deduplication config. See [Request Deduplication](#request-deduplication) |
| `timeout` | `TimeoutConfig` | `undefined` | Global timeout config. See [Request Timeout](#request-timeout) |
| `offline` | `OfflineConfig` | `{ enabled: false }` | Offline fallback config. See [Offline Fallback](#offline-fallback) |
| `staleWhileRevalidate` | `StaleWhileRevalidateConfig` | `{ enabled: false }` | SWR config. See [Stale-While-Revalidate](#stale-while-revalidate-swr) |

### FetchPlusRequestInit

Extends the standard `RequestInit` with additional options. Pass these as the second argument to `fetch()`.

```typescript
interface FetchPlusRequestInit extends RequestInit {
  fetchPlusCache?: CacheOptions | CacheInterface | false;
  skipInterceptors?: boolean;
  enableSync?: boolean;
  forceRefresh?: boolean;
  retry?: RetryConfig | false;
  deduplicate?: boolean;
  timeout?: number;
  offlineStrategy?: OfflineStrategy;
  queueIfOffline?: boolean;
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `fetchPlusCache` | `CacheOptions \| CacheInterface \| false` | (uses global) | Cache config for this request. Pass `false` to disable caching, `CacheOptions` to customize TTL, or a `CacheInterface` to use a different cache backend |
| `skipInterceptors` | `boolean` | `false` | Skip all interceptors for this request |
| `enableSync` | `boolean` | (uses global) | Override global sync setting for this request |
| `forceRefresh` | `boolean` | `false` | Bypass cache read and fetch from network. The fresh response is still cached |
| `retry` | `RetryConfig \| false` | (uses global) | Retry config for this request. Pass `false` to disable retry. See [Automatic Retry](#automatic-retry) |
| `deduplicate` | `boolean` | (uses global) | Enable/disable deduplication for this request. See [Request Deduplication](#request-deduplication) |
| `timeout` | `number` | (uses global) | Timeout in ms for this request. Pass `0` to disable timeout. See [Request Timeout](#request-timeout) |
| `offlineStrategy` | `OfflineStrategy` | (uses global) | Offline strategy for this request. See [Offline Fallback](#offline-fallback) |
| `queueIfOffline` | `boolean` | (uses global) | Whether to queue this request if offline. See [Offline Fallback](#offline-fallback) |
| `staleWhileRevalidate` | `StaleWhileRevalidateConfig \| false` | (uses global) | SWR config for this request. Pass `false` to disable. See [Stale-While-Revalidate](#stale-while-revalidate-swr) |

All standard `fetch()` options (`method`, `headers`, `body`, `signal`, etc.) are fully supported.

### CacheOptions

```typescript
interface CacheOptions {
  ttl?: number;
  persistence?: CachePersistence;
}

type CachePersistence = 'forever' | 'session' | 'memory';
```

| Property | Type | Default | Description |
|---|---|---|---|
| `ttl` | `number` | `undefined` (no expiry) | Time-to-live in **milliseconds**. The cache entry expires after this duration |
| `persistence` | `CachePersistence` | `undefined` | Hint for cache persistence strategy |

### CacheInterface

All cache backends implement this interface. Implement it to create your own custom cache.

```typescript
interface CacheInterface {
  get(key: string): Promise<Response | null>;
  set(key: string, response: Response, options?: CacheOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}
```

| Method | Returns | Description |
|---|---|---|
| `get(key)` | `Promise<Response \| null>` | Retrieve a cached response, or `null` if not found/expired |
| `set(key, response, options?)` | `Promise<void>` | Store a response in the cache |
| `delete(key)` | `Promise<boolean>` | Delete an entry. Returns `true` if it existed |
| `clear()` | `Promise<void>` | Remove all entries from the cache |
| `has(key)` | `Promise<boolean>` | Check if a non-expired entry exists |

---

## API Reference

### FetchPlus Class

```typescript
import { FetchPlus } from 'fetchplus';
const fp = new FetchPlus(config?: FetchPlusConfig);
```

| Method | Signature | Description |
|---|---|---|
| `init` | `init(config?: FetchPlusConfig): void` | Initialize FetchPlus. Optionally pass config overrides. Replaces `globalThis.fetch` if `replaceGlobalFetch` is `true`. Can only be called once (logs a warning on subsequent calls) |
| `fetch` | `fetch(input: RequestInfo \| URL, init?: FetchPlusRequestInit): Promise<Response>` | The enhanced fetch method. 100% compatible with the native `fetch()` signature |
| `getInterceptors` | `getInterceptors(): InterceptorManager` | Returns the interceptor manager for adding/removing interceptors |
| `clearCache` | `clearCache(): Promise<void>` | Clear all cached responses. Broadcasts to other tabs if sync is enabled |
| `deleteCache` | `deleteCache(key: string): Promise<boolean>` | Delete a specific cache entry by key. Broadcasts to other tabs if sync is enabled |
| `isSyncAvailable` | `isSyncAvailable(): boolean` | Returns `true` if cross-tab sync is enabled and the BroadcastChannel API is available |
| `restore` | `restore(): void` | Restore the original `globalThis.fetch`, close sync channels, and reset initialization state |

### InterceptorManager

Returned by `fp.getInterceptors()`.

| Method | Signature | Description |
|---|---|---|
| `addRequestInterceptor` | `addRequestInterceptor(handler): InterceptorId` | Register a request interceptor. Returns a numeric ID |
| `addResponseInterceptor` | `addResponseInterceptor(handler): InterceptorId` | Register a response interceptor. Returns a numeric ID |
| `addErrorInterceptor` | `addErrorInterceptor(handler): InterceptorId` | Register an error interceptor. Returns a numeric ID |
| `removeInterceptor` | `removeInterceptor(id: InterceptorId): boolean` | Remove an interceptor by ID. Returns `true` if found and removed |
| `clearAll` | `clearAll(): void` | Remove all interceptors of all types |

**Interceptor function signatures:**

```typescript
// Request interceptor
type RequestInterceptor = (
  input: RequestInfo | URL,
  init?: RequestInit
) => RequestInfo | URL | Promise<RequestInfo | URL> | { input: RequestInfo | URL; init?: RequestInit };

// Response interceptor
type ResponseInterceptor = (response: Response) => Response | Promise<Response>;

// Error interceptor
type ErrorInterceptor = (error: Error) => Response | Promise<Response> | void | Promise<void>;
```

### CacheSyncManager

Available as a direct export for advanced use cases.

```typescript
import { CacheSyncManager } from 'fetchplus';

const sync = new CacheSyncManager('my-channel');

sync.broadcast('set', 'GET:https://api.example.com/data');
sync.broadcast('delete', 'GET:https://api.example.com/data');
sync.broadcast('clear');

sync.addListener('my-listener', (message) => {
  console.log(message.type, message.key, message.timestamp);
});

sync.removeListener('my-listener');
sync.isAvailable(); // true if BroadcastChannel is supported
sync.close();       // close the channel
```

---

## Recipes

### Authentication Headers

Add a bearer token to every request, refreshing it when expired:

```typescript
const fp = new FetchPlus();
fp.init();

fp.getInterceptors().addRequestInterceptor(async (input, init) => {
  let token = localStorage.getItem('access_token');

  // Refresh if expired
  if (isTokenExpired(token)) {
    token = await refreshAccessToken();
    localStorage.setItem('access_token', token);
  }

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);

  return { input, init: { ...init, headers } };
});
```

### Automatic Retry on Failure

Retry failed requests with built-in retry support:

```typescript
const fp = new FetchPlus({
  retry: {
    maxRetries: 3,
    backoffStrategy: 'exponential',
    initialDelay: 1000,
    onRetry: (error, attempt, delay) => {
      console.log(`Retry attempt ${attempt} in ${delay}ms: ${error.message}`);
    },
  },
});

fp.init();

// All requests now automatically retry on failure
const res = await fetch('https://api.example.com/data');
```

See [Automatic Retry](#automatic-retry) for full documentation.

### Request Logging

Log all outgoing requests and incoming responses for debugging:

```typescript
fp.getInterceptors().addRequestInterceptor((input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method || 'GET';
  console.log(`[FetchPlus] --> ${method} ${url}`);
  return { input, init };
});

fp.getInterceptors().addResponseInterceptor((response) => {
  console.log(`[FetchPlus] <-- ${response.status} ${response.url} (${response.headers.get('content-type')})`);
  return response;
});

fp.getInterceptors().addErrorInterceptor((error) => {
  console.error(`[FetchPlus] !!! ${error.message}`);
});
```

### Offline Fallback

Return cached data when the network is unavailable:

```typescript
fp.getInterceptors().addErrorInterceptor(async (error) => {
  if (!navigator.onLine) {
    // Try to serve from cache even for expired entries
    console.warn('Offline: serving potentially stale cached response');
    return new Response(
      JSON.stringify({ error: 'offline', message: 'You are currently offline.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
  // Online but still failed — let the error propagate
});
```

### API Base URL

Prefix all relative URLs with a base URL:

```typescript
const API_BASE = 'https://api.example.com/v2';

fp.getInterceptors().addRequestInterceptor((input, init) => {
  if (typeof input === 'string' && !input.startsWith('http')) {
    return { input: `${API_BASE}${input}`, init };
  }
  return { input, init };
});

// Now you can use short paths:
await fetch('/users');           // → https://api.example.com/v2/users
await fetch('/users/123');       // → https://api.example.com/v2/users/123
await fetch('https://other.com'); // unchanged (already absolute)
```

### Response Transformation

Automatically unwrap API envelope responses:

```typescript
fp.getInterceptors().addResponseInterceptor(async (response) => {
  if (response.headers.get('content-type')?.includes('application/json')) {
    const json = await response.clone().json();

    // If the API wraps data in { data: ..., meta: ... }, unwrap it
    if (json.data !== undefined) {
      return new Response(JSON.stringify(json.data), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }
  }
  return response;
});
```

### Stale-While-Revalidate Pattern

Serve cached data immediately while fetching fresh data in the background:

```typescript
async function fetchWithSWR(url: string): Promise<Response> {
  // Get cached response (may be stale)
  const cached = await fetch(url);

  // Fire off a background refresh
  fetch(url, { forceRefresh: true }).catch(() => {
    // silently ignore background refresh failures
  });

  return cached;
}
```

---

## TypeScript Support

FetchPlus is written in TypeScript and ships with full type definitions. All types are exported for your use:

```typescript
import FetchPlus, {
  // Classes
  CacheStorageCache,
  LocalStorageCache,
  SessionStorageCache,
  InMemoryCache,
  InterceptorManager,
  CacheSyncManager,
  RetryManager,
  DeduplicationManager,
  TimeoutManager,
  OfflineManager,
  StaleWhileRevalidate,

  // Errors
  FetchPlusError,
  RetryError,
  TimeoutError,

  // Types
  FetchPlusConfig,
  FetchPlusRequestInit,
  CacheInterface,
  CacheOptions,
  CachePersistence,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
  InterceptorId,
  RetryConfig,
  BackoffStrategy,
  DeduplicationConfig,
  TimeoutConfig,
  OfflineConfig,
  OfflineStrategy,
  QueuedRequest,
  StaleWhileRevalidateConfig,
  RevalidationCallback,
  CacheEntryMetadata,
} from 'fetchplus';
```

**Typing a custom interceptor:**

```typescript
import type { RequestInterceptor, ResponseInterceptor } from 'fetchplus';

const authInterceptor: RequestInterceptor = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${getToken()}`);
  return { input, init: { ...init, headers } };
};

const loggingInterceptor: ResponseInterceptor = (response) => {
  console.log(response.status);
  return response;
};
```

---

## Browser Compatibility

| Browser | Supported | Notes |
|---|---|---|
| Chrome / Edge | 80+ | Full support |
| Firefox | 78+ | Full support |
| Safari | 14+ | Full support |
| Opera | 67+ | Full support |
| Node.js | 18+ | Requires `fetch` polyfill for older versions; no Cache Storage API |

**Feature-specific requirements:**
- **Cache Storage API**: Supported in all modern browsers. Falls back gracefully (returns `null`) if unavailable.
- **BroadcastChannel** (cross-tab sync): Supported in all modern browsers. Degrades silently if unavailable.
- **localStorage / sessionStorage**: Universally supported. Gracefully handles environments where storage is disabled (e.g., private browsing in some browsers).

---

## Troubleshooting

**"FetchPlus already initialized" warning**
You called `fp.init()` more than once. FetchPlus only initializes once to prevent double-wrapping `fetch`. If you need to reinitialize, call `fp.restore()` first.

```typescript
fp.restore();
fp.init(newConfig);
```

**Cached response body is empty or already consumed**
Remember that `Response` bodies can only be read once. FetchPlus clones responses before caching, but if your interceptors consume the body, make sure to clone first:

```typescript
// Wrong - consumes the body
fp.getInterceptors().addResponseInterceptor(async (response) => {
  const data = await response.json(); // body is now consumed!
  return response; // the caller can't read the body again
});

// Correct - clone before reading
fp.getInterceptors().addResponseInterceptor(async (response) => {
  const data = await response.clone().json(); // read from clone
  console.log(data);
  return response; // original body is intact for the caller
});
```

**POST requests aren't being cached**
By default, only `GET` requests are cached. To cache other methods, configure `cacheableMethods`:

```typescript
const fp = new FetchPlus({
  cacheableMethods: ['GET', 'POST']
});
```

**Cross-tab sync isn't working**
1. Make sure `enableSync: true` is set in your config
2. Check that both tabs are on the same origin (BroadcastChannel is same-origin only)
3. Verify `BroadcastChannel` is available: `typeof BroadcastChannel !== 'undefined'`
4. If using a custom `syncChannelName`, ensure both tabs use the same name

**Cache entries aren't expiring**
Make sure you've set a `ttl` value in milliseconds (not seconds):

```typescript
// Wrong: 60 = 60 milliseconds (expires almost instantly)
{ ttl: 60 }

// Correct: 60 seconds
{ ttl: 60 * 1000 }

// Correct: 5 minutes
{ ttl: 5 * 60 * 1000 }
```

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Run the tests (`npm test`)
4. Commit your changes (`git commit -m 'Add my feature'`)
5. Push to the branch (`git push origin feature/my-feature`)
6. Open a Pull Request

### Development Setup

```bash
git clone https://github.com/yourusername/fetchplus.git
cd fetchplus
npm install
npm run build       # build the library
npm test            # run tests
npm run dev         # watch mode for development
npm run examples    # build and serve examples on port 3000
```

---

## License

MIT
