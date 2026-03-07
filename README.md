# FetchPlus

A lightweight drop-in enhancement for the native `fetch()` API. Zero dependencies. Zero API changes.

Built with the help of Claude.

[![npm version](https://img.shields.io/npm/v/fetchplus.svg)](https://www.npmjs.com/package/@danielbriffa/fetchplus)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/danielbriffa/FetchPlus/actions/workflows/ci.yml/badge.svg)](https://github.com/danielbriffa/FetchPlus/actions/workflows/ci.yml)
![Coverage](./.github/badges/coverage.svg)

```bash
npm install fetchplus
```

> For full documentation see [EXTENDED_DOC.md](./EXTENDED_DOC.md).

---

## Full Configuration Example

Every option shown — annotated with its default and what it does:

```typescript
import FetchPlus, {
  InMemoryCache,          // or CacheStorageCache (default), LocalStorageCache, SessionStorageCache
  RetryError,
  TimeoutError,
} from 'fetchplus';

const fp = new FetchPlus({

  // ─── Caching ────────────────────────────────────────────────────────────────
  enableCaching: true,                    // default: true — cache successful GET responses
  cacheableMethods: ['GET'],              // default: ['GET'] — which methods are cached
  cache: new InMemoryCache(500),          // default: CacheStorageCache — storage backend
  cacheName: 'my-app-v1',                // default: 'fetchplus-v1' — Cache Storage API name
  cacheOptions: {
    ttl: 5 * 60 * 1000,                  // default: undefined (no expiry) — ms until entry expires
  },

  // ─── Automatic Retry ────────────────────────────────────────────────────────
  retry: {
    maxRetries: 3,                        // default: 3 — max retry attempts (cap: 10)
    backoffStrategy: 'exponential',       // 'exponential' | 'linear' | 'fixed' — delay growth
    initialDelay: 1000,                   // default: 1000ms — delay before first retry
    maxDelay: 30000,                      // default: 30000ms — max delay between retries
    backoffMultiplier: 2,                 // default: 2 — multiplier for exponential backoff
    retryableStatusCodes: [408, 429, 500, 502, 503, 504], // status codes that trigger retry
    retryOnNetworkError: true,            // default: true — retry on TypeError/network failures
    respectRetryAfter: true,             // default: true — honour server's Retry-After header
    onRetry: (error, attempt, delayMs) => {
      console.log(`Retry ${attempt} in ${delayMs}ms: ${error.message}`);
    },
  },
  // retry: false   ← disables retry globally

  // ─── Request Deduplication ──────────────────────────────────────────────────
  deduplication: {
    enabled: true,                        // default: false — merge identical in-flight requests
    keyGenerator: (input, init) => {      // optional — custom dedup key
      const url = new URL(input.toString());
      return `${init?.method ?? 'GET'}:${url.origin}${url.pathname}`;
    },
  },

  // ─── Request Timeout ────────────────────────────────────────────────────────
  timeout: {
    defaultTimeout: 10000,               // default: undefined (no timeout) — ms before TimeoutError
  },

  // ─── Offline Fallback ───────────────────────────────────────────────────────
  offline: {
    enabled: true,                        // default: false
    strategy: 'cache-first',             // 'cache-first' | 'network-first' | 'cache-only'
    queueRequests: true,                  // default: false — queue failed requests while offline
    maxQueueSize: 50,                     // default: 50 — oldest request dropped when full
    onOffline: () => showBanner(),
    onOnline: () => hideBanner(),
    onQueuedRequestRetry: (req, res, err) => {
      console.log(res ? 'Queued request succeeded' : `Failed: ${err?.message}`);
    },
  },

  // ─── Stale-While-Revalidate ─────────────────────────────────────────────────
  staleWhileRevalidate: {
    enabled: true,                        // default: false
    freshDuration: 5000,                  // default: 0 — ms a cached entry is "fresh" (no refetch)
    staleDuration: 60000,                 // default: Infinity — ms entry can be served as stale
    onRevalidationComplete: (res, err) => {
      if (err) console.error('Background revalidation failed:', err.message);
    },
  },

  // ─── Cross-Tab Sync ─────────────────────────────────────────────────────────
  enableSync: false,                      // default: false — sync cache ops via BroadcastChannel
  syncChannelName: 'fetchplus-sync',      // default: 'fetchplus-sync'

  // ─── Global Setup ───────────────────────────────────────────────────────────
  replaceGlobalFetch: true,               // default: true — fp.init() patches globalThis.fetch
});

fp.init(); // activate — now every fetch() in your app goes through FetchPlus
```

After `fp.init()`, your existing code is unchanged — just call `fetch()` as normal.

---

## Per-Request Options

Every option can be overridden (or set for the first time) on individual requests:

```typescript
const res = await fetch('https://api.example.com/data', {
  // Standard fetch options work unchanged:
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
  signal: controller.signal,

  // FetchPlus per-request overrides:
  fetchPlusCache: { ttl: 10000 },   // custom TTL for this request
  // fetchPlusCache: false           // disable caching for this request
  // fetchPlusCache: myCache         // use a different CacheInterface for this request

  forceRefresh: true,               // bypass cache read; fresh response is still cached

  retry: {                          // override global retry for this request
    maxRetries: 5,
    backoffStrategy: 'fixed',
    initialDelay: 500,
  },
  // retry: false                   // disable retry for this request

  deduplicate: true,                // enable/disable dedup for this request

  timeout: 30000,                   // override global timeout (ms); 0 = no timeout

  offlineStrategy: 'network-first', // override global offline strategy
  queueIfOffline: false,            // override global queueRequests

  staleWhileRevalidate: {           // override global SWR settings
    enabled: true,
    freshDuration: 1000,
    staleDuration: 10000,
  },
  // staleWhileRevalidate: false    // disable SWR for this request

  enableSync: false,                // override global cross-tab sync

  skipInterceptors: true,           // skip all interceptors for this request
});
```

---

## Interceptors

```typescript
const ic = fp.getInterceptors();

// Request — runs before every fetch, can modify URL/headers/body
const authId = ic.addRequestInterceptor((input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${getToken()}`);
  return { input, init: { ...init, headers } };
});

// Response — runs after every successful fetch (including cache hits)
const logId = ic.addResponseInterceptor((response) => {
  console.log(response.status, response.url);
  return response; // must return a Response
});

// Error — runs when fetch throws; return a Response to recover, or void to rethrow
const errId = ic.addErrorInterceptor((error) => {
  if (!navigator.onLine) {
    return new Response(JSON.stringify({ offline: true }), { status: 503 });
  }
  // return nothing → error is rethrown
});

ic.removeInterceptor(authId); // remove one
ic.clearAll();                // remove all
```

---

## Cache Backends

| Backend | Persists restarts | Cross-tab | Size | Use when |
|---|---|---|---|---|
| `CacheStorageCache` *(default)* | Yes | Yes | Large | General use |
| `LocalStorageCache` | Yes | Yes | ~5 MB | Small config/text data |
| `SessionStorageCache` | No (tab) | No | ~5 MB | Session-scoped data |
| `InMemoryCache(maxEntries?)` | No | No | JS heap | SPAs, fastest access |

```typescript
import { CacheStorageCache, LocalStorageCache, SessionStorageCache, InMemoryCache } from 'fetchplus';

new FetchPlus({ cache: new CacheStorageCache('my-cache-v2') });
new FetchPlus({ cache: new LocalStorageCache() });
new FetchPlus({ cache: new SessionStorageCache() });
new FetchPlus({ cache: new InMemoryCache(100) }); // evicts LRU at 100 entries
```

**Custom cache** — implement `CacheInterface`:
```typescript
class MyCache implements CacheInterface {
  async get(key: string): Promise<Response | null> { ... }
  async set(key: string, response: Response, options?: CacheOptions): Promise<void> { ... }
  async delete(key: string): Promise<boolean> { ... }
  async clear(): Promise<void> { ... }
  async has(key: string): Promise<boolean> { ... }
}
```

---

## Cache Keys & What Gets Cached

Keys are generated as `METHOD:normalized_url`. URL normalization:
- Query params sorted alphabetically (`?b=2&a=1` → same key as `?a=1&b=2`)
- Trailing slashes stripped

Only `GET` 2xx responses are cached by default. Responses with `Cache-Control: no-store` are never cached.

```typescript
await fp.clearCache();                              // clear all
await fp.deleteCache('GET:https://example.com/data'); // clear one entry
fp.isSyncAvailable();                               // cross-tab sync active?
fp.restore();                                       // unpatch globalThis.fetch
```

---

## Error Types

```typescript
import { RetryError, TimeoutError } from 'fetchplus';

try {
  await fetch('https://api.example.com/data', { timeout: 5000, retry: { maxRetries: 3 } });
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log(error.timeoutMs); // 5000
  }
  if (error instanceof RetryError) {
    console.log(error.attempts);   // 4 (1 original + 3 retries)
    console.log(error.lastError);  // underlying TypeError or Error
    console.log(error.totalDelay); // total ms spent waiting
  }
}
```

---

## SWR Cache Timeline

```
 0s         freshDuration           staleDuration
 |── fresh ─────|────── stale ───────────|── expired ──▶
 │             │                         │
 return cache  return cache              normal fetch
 (no network)  + background revalidate   (cache miss)
```

---

## License

MIT
