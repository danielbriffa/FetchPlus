# FetchPlus Test Scenarios

This document outlines all test scenarios for the FetchPlus project. Each scenario is designed to verify core functionality, edge cases, and regression tests for previously discovered bugs.

---

## Core: FetchPlus.ts

### Initialization & Setup

**Scenario: Default singleton initialization**
- Description: Verify the default exported instance initializes correctly and can be used immediately
- Expected: Instance is ready to use with InMemoryCache and default config

**Scenario: Deferred fetch access (Bug #6 regression)**
- Description: Verify singleton doesn't access globalThis.fetch at import time
- Expected: Module can be imported in non-browser environments without errors; fetch is accessed only on first request

**Scenario: Custom cache provider initialization**
- Description: Verify FetchPlus can be initialized with CacheStorageCache, SessionStorageCache, or LocalStorageCache
- Expected: Each cache type is correctly set and used for subsequent requests

**Scenario: Global fetch replacement**
- Description: Verify replaceGlobalFetch() replaces window.fetch with FetchPlus instance
- Expected: window.fetch references the FetchPlus fetch method; can be called with standard fetch syntax

**Scenario: Global fetch restoration**
- Description: Verify restoreOriginalFetch() restores the original fetch implementation
- Expected: window.fetch is restored to original; subsequent calls bypass FetchPlus

### Caching Behavior

**Scenario: Basic cache hit**
- Description: Verify identical GET requests return cached response on second call
- Expected: First request hits network; second request returns cached response without network call

**Scenario: Cache miss on different URLs**
- Description: Verify different URLs are cached separately
- Expected: Each unique URL triggers its own network request and cache entry

**Scenario: Cache bypass with forceRefresh (Bug #2 regression)**
- Description: Verify forceRefresh option bypasses cache after interceptor processing
- Expected: Request with forceRefresh: true always hits network even if cached; cache is updated with fresh response

**Scenario: POST requests not cached by default**
- Description: Verify non-GET methods skip caching unless explicitly configured
- Expected: POST/PUT/DELETE requests always hit network; no cache storage or retrieval

**Scenario: Cache respects method in key generation (Bug #4 regression)**
- Description: Verify GET and POST to same URL are cached separately
- Expected: GET /api/data and POST /api/data have different cache keys and entries

### Interceptor Integration

**Scenario: Request interceptor modifies URL**
- Description: Verify request interceptors can modify the URL before fetch
- Expected: Modified URL is used for fetch; cache key reflects modified URL

**Scenario: Request interceptor adds headers**
- Description: Verify request interceptors can add/modify headers
- Expected: Headers are present in actual fetch request

**Scenario: Response interceptor transforms data**
- Description: Verify response interceptors can modify response before caching
- Expected: Transformed response is cached and returned to caller

**Scenario: Skip interceptors with skipInterceptors option (Bug #2 regression)**
- Description: Verify skipInterceptors option bypasses all interceptor chains after processing init
- Expected: Request with skipInterceptors: true skips all request/response/error interceptors

**Scenario: Error interceptor handles fetch failure**
- Description: Verify error interceptors receive network errors
- Expected: Error interceptor is called with error; can return fallback response

**Scenario: Interceptor chain order preserved**
- Description: Verify multiple interceptors execute in registration order for both request and response
- Expected: First registered interceptor runs first; order is preserved throughout the chain

### Error Handling

**Scenario: Network error without error interceptor**
- Description: Verify fetch errors propagate when no error interceptor is registered
- Expected: Promise rejects with original error

**Scenario: Network error with error interceptor returning void**
- Description: Verify error interceptor can observe error without handling it
- Expected: Error interceptor runs; original error is re-thrown

**Scenario: 404 response handling**
- Description: Verify 404 responses are not cached (Bug #9 regression)
- Expected: 404 responses bypass cache; subsequent identical requests hit network again

**Scenario: Invalid URL handling**
- Description: Verify malformed URLs throw appropriate errors
- Expected: TypeError or similar is thrown; error interceptors can handle it

### URL and Request Input Variants

**Scenario: Fetch with string URL**
- Description: Verify basic string URL input works
- Expected: Request is made to specified URL

**Scenario: Fetch with URL object**
- Description: Verify URL object input works (Bug #1 regression context)
- Expected: Request is made to URL; cache key is correctly generated

**Scenario: Fetch with Request object**
- Description: Verify Request object input works (Bug #1 regression context)
- Expected: Request properties (method, headers, body) are preserved; cache key is correctly generated

**Scenario: Fetch with Request object preserves method (Bug #4 regression)**
- Description: Verify Request object's method is used in cache key generation
- Expected: new Request(url, {method: 'POST'}) produces a POST cache key, not GET

---

## Interceptors: InterceptorManager.ts

### Request Interceptor Registration & Execution

**Scenario: Register single request interceptor**
- Description: Verify request interceptor is called before fetch
- Expected: Interceptor receives input and init; modifications apply to request

**Scenario: Register multiple request interceptors**
- Description: Verify multiple interceptors execute in order
- Expected: Each interceptor receives output of previous; final result is used for fetch

**Scenario: Request interceptor returns modified string URL**
- Description: Verify interceptor can change URL string
- Expected: New URL is used for fetch

**Scenario: Request interceptor returns URL object**
- Description: Verify interceptor can return URL instance
- Expected: URL object is correctly handled; 'input' in result check works (Bug #1 regression)

**Scenario: Request interceptor returns Request object**
- Description: Verify interceptor can return Request instance
- Expected: Request object is correctly handled; 'input' in result check works (Bug #1 regression)

**Scenario: Request interceptor returns modified init only**
- Description: Verify interceptor can modify options without changing URL
- Expected: Original URL is kept; init changes apply

**Scenario: Remove request interceptor by ID**
- Description: Verify removeInterceptor(id) removes specific request interceptor
- Expected: Removed interceptor doesn't execute; others continue to work

### Response Interceptor Registration & Execution

**Scenario: Register single response interceptor**
- Description: Verify response interceptor is called after fetch
- Expected: Interceptor receives Response; can transform it

**Scenario: Register multiple response interceptors**
- Description: Verify multiple response interceptors execute in registration order
- Expected: Each interceptor receives output of previous; final result returned to caller

**Scenario: Response interceptor returns cloned response**
- Description: Verify interceptor can clone and modify response
- Expected: Modified response is returned to caller and cached

**Scenario: Response interceptor modifies status or headers**
- Description: Verify interceptor can create synthetic response
- Expected: New Response object with modified properties is used

**Scenario: Remove response interceptor by ID**
- Description: Verify removeInterceptor(id) removes specific response interceptor
- Expected: Removed interceptor doesn't execute; others continue to work

### Error Interceptor Registration & Execution

**Scenario: Register single error interceptor**
- Description: Verify error interceptor is called on fetch failure
- Expected: Interceptor receives Error object; can return Response or void

**Scenario: Error interceptor returns Response (Bug #10 regression)**
- Description: Verify error interceptor can return synthetic Response to recover from error
- Expected: Type system allows Response return; fetch resolves with synthetic response instead of rejecting

**Scenario: Error interceptor returns void (Bug #10 regression)**
- Description: Verify error interceptor can observe error without handling
- Expected: Type system allows void return; error is re-thrown after interceptor runs

**Scenario: Multiple error interceptors with first returning Response**
- Description: Verify error recovery stops propagation to subsequent error interceptors
- Expected: When first error interceptor returns Response, subsequent error interceptors don't run

**Scenario: Multiple error interceptors all returning void**
- Description: Verify error interceptors chain when all return void
- Expected: All error interceptors run in order; final error is thrown

**Scenario: Remove error interceptor by ID**
- Description: Verify removeInterceptor(id) removes specific error interceptor
- Expected: Removed interceptor doesn't execute; others continue to work

### Edge Cases

**Scenario: Clear all interceptors**
- Description: Verify clearAll() removes all interceptors from all types
- Expected: No interceptors execute after clearAll(); fetch proceeds normally

**Scenario: Interceptor throws error**
- Description: Verify errors in request/response interceptors are handled
- Expected: Error propagates; error interceptors can catch it

**Scenario: Interceptor returns null or undefined**
- Description: Verify invalid interceptor return values are handled gracefully
- Expected: Original input/response is used or error is thrown with clear message

---

## Cache: InMemoryCache.ts

### Basic Operations

**Scenario: Set and get cache entry**
- Description: Verify basic cache storage and retrieval
- Expected: Stored response is retrievable with same key

**Scenario: Cache miss returns undefined**
- Description: Verify get() returns undefined for non-existent keys
- Expected: Undefined is returned; no errors thrown

**Scenario: Delete existing entry**
- Description: Verify delete() removes entry from cache
- Expected: Entry is removed; subsequent get() returns undefined

**Scenario: Delete non-existent entry**
- Description: Verify delete() handles missing keys gracefully
- Expected: No error; returns false or undefined

**Scenario: Clear entire cache**
- Description: Verify clear() removes all entries
- Expected: All entries are removed; subsequent gets return undefined

### LRU Eviction (Bug #5 regression)

**Scenario: Cache respects maxEntries limit**
- Description: Verify cache evicts oldest entry when maxEntries (500) is reached
- Expected: When 501st entry is added, 1st entry is evicted

**Scenario: LRU updates on get**
- Description: Verify accessing an entry updates its recency
- Expected: Accessed entries are moved to end; least recently accessed is evicted first

**Scenario: LRU updates on set (overwrite)**
- Description: Verify overwriting an entry updates its recency
- Expected: Overwritten entry becomes most recent

**Scenario: Eviction with custom maxEntries**
- Description: Verify custom maxEntries parameter works
- Expected: Cache evicts at custom limit (e.g., 100 entries)

### Response Handling

**Scenario: Cache clone of Response**
- Description: Verify cached responses are cloneable and don't consume body
- Expected: Original response remains usable; cached response is independent clone

**Scenario: Cache different responses with different keys**
- Description: Verify multiple entries coexist correctly
- Expected: Each key maps to correct response; no cross-contamination

---

## Cache: CacheStorageCache.ts

### Basic Operations

**Scenario: Set and get cache entry**
- Description: Verify storage and retrieval using Cache Storage API
- Expected: Stored response is retrievable; persists across instances

**Scenario: Cache miss returns undefined**
- Description: Verify get() returns undefined for non-existent keys
- Expected: Undefined is returned; no errors thrown

**Scenario: Delete existing entry**
- Description: Verify delete() removes entry from Cache Storage
- Expected: Entry is removed; subsequent get() returns undefined

**Scenario: Clear entire cache**
- Description: Verify clear() removes all entries from cache
- Expected: All entries are removed; Cache Storage is empty

### Request Object Keys (Bug #7 regression)

**Scenario: Use Request object as cache key**
- Description: Verify cache uses Request objects instead of string keys
- Expected: Entries are stored and retrieved correctly using Request objects

**Scenario: Match with equivalent Request object**
- Description: Verify Cache.match() finds entry with equivalent Request
- Expected: Request objects with same URL and method match successfully

**Scenario: Different methods create different entries**
- Description: Verify GET and POST requests to same URL are cached separately
- Expected: Two distinct cache entries exist; correct one is retrieved based on method

### Response Cloning (Bug #3 regression)

**Scenario: Set accepts pre-cloned response**
- Description: Verify set() expects already-cloned response and doesn't double-clone
- Expected: Response is stored without additional cloning; original remains usable

**Scenario: Get returns cloned response**
- Description: Verify get() returns usable response clone
- Expected: Retrieved response can be read; doesn't affect cached version

### Browser API Integration

**Scenario: Cache initialization with custom cache name**
- Description: Verify constructor accepts custom cache name
- Expected: Cache uses specified name; entries are isolated from other caches

**Scenario: Multiple cache instances with different names**
- Description: Verify multiple CacheStorageCache instances don't interfere
- Expected: Each cache name has isolated storage

---

## Cache: SessionStorageCache.ts

### Basic Operations

**Scenario: Set and get cache entry**
- Description: Verify storage and retrieval using sessionStorage
- Expected: Stored response is retrievable within same session

**Scenario: Cache miss returns undefined**
- Description: Verify get() returns undefined for non-existent keys
- Expected: Undefined is returned; no errors thrown

**Scenario: Delete existing entry**
- Description: Verify delete() removes entry from sessionStorage
- Expected: Entry is removed; sessionStorage key is deleted

**Scenario: Clear entire cache**
- Description: Verify clear() removes all cache entries from sessionStorage
- Expected: All cache entries are removed; non-cache sessionStorage items remain

### Binary Data Handling (Bug #8 regression)

**Scenario: Cache response with binary body**
- Description: Verify binary data (images, PDFs, etc.) is correctly encoded and decoded
- Expected: Binary data is base64 encoded on set; correctly decoded on get; no corruption

**Scenario: Cache response with text body**
- Description: Verify text responses are base64 encoded and decoded correctly
- Expected: Text content is preserved exactly after encode/decode cycle

**Scenario: Cache response with JSON body**
- Description: Verify JSON responses are correctly handled
- Expected: JSON is base64 encoded; decoded response can be parsed as JSON

**Scenario: Cache response with empty body**
- Description: Verify responses with no body are handled
- Expected: Empty body is stored and retrieved without errors

### Serialization

**Scenario: Serialize response metadata**
- Description: Verify response status, statusText, and headers are preserved
- Expected: Retrieved response has same status, statusText, and headers as original

**Scenario: Only clears prefixed keys on clear()**
- Description: Verify clear() only removes keys with the 'fetchplus:' prefix
- Expected: Non-FetchPlus sessionStorage items remain after clear()

---

## Cache: LocalStorageCache.ts

### Basic Operations

**Scenario: Set and get cache entry**
- Description: Verify storage and retrieval using localStorage
- Expected: Stored response is retrievable; persists across sessions

**Scenario: Cache miss returns undefined**
- Description: Verify get() returns undefined for non-existent keys
- Expected: Undefined is returned; no errors thrown

**Scenario: Delete existing entry**
- Description: Verify delete() removes entry from localStorage
- Expected: Entry is removed; localStorage key is deleted

**Scenario: Clear entire cache**
- Description: Verify clear() removes all cache entries from localStorage
- Expected: All cache entries are removed; non-cache localStorage items remain

### Binary Data Handling (Bug #8 regression)

**Scenario: Cache response with binary body**
- Description: Verify binary data is correctly base64 encoded and decoded
- Expected: Binary data is preserved exactly; no corruption on retrieval

**Scenario: Cache response with text body**
- Description: Verify text responses survive base64 encode/decode
- Expected: Text content is identical after round-trip

**Scenario: Cache response with JSON body**
- Description: Verify JSON responses are correctly handled
- Expected: JSON structure is preserved; can be parsed after retrieval

**Scenario: Cache response with empty body**
- Description: Verify empty body responses are handled
- Expected: Empty body is stored and retrieved without errors

### Serialization

**Scenario: Serialize response metadata**
- Description: Verify response status, statusText, and headers are preserved
- Expected: All response metadata is accurately restored

**Scenario: Only clears prefixed keys on clear()**
- Description: Verify clear() only removes keys with the 'fetchplus:' prefix
- Expected: Non-FetchPlus localStorage items remain after clear()

### Storage Limits

**Scenario: Handle localStorage quota exceeded**
- Description: Verify graceful handling when localStorage is full
- Expected: set() catches error; warns via console; does not throw

---

## Utils: cacheKey.ts

### Key Generation

**Scenario: Generate key from string URL**
- Description: Verify cache key is generated from string input
- Expected: Consistent key is produced for same URL string

**Scenario: Generate key from URL object**
- Description: Verify cache key is generated from URL instance
- Expected: Consistent key matches string URL equivalent

**Scenario: Generate key from Request object**
- Description: Verify cache key is generated from Request instance
- Expected: Key includes method and URL

**Scenario: Method affects cache key (Bug #4 regression)**
- Description: Verify GET and POST to same URL produce different keys
- Expected: Keys differ based on HTTP method; POST /api vs GET /api have distinct keys

**Scenario: Query parameter order normalization**
- Description: Verify query params are sorted for consistent keys
- Expected: /api?b=2&a=1 and /api?a=1&b=2 produce same cache key

**Scenario: Trailing slash normalization**
- Description: Verify trailing slashes are stripped for consistent keys
- Expected: /api/data/ and /api/data produce same cache key

**Scenario: Relative URL fallback**
- Description: Verify non-parseable URLs are used as-is for cache key
- Expected: Relative paths or invalid URLs don't throw; used as raw string key

---

## Utils: responseClone.ts

### Cacheability Checks

**Scenario: 200 response is cacheable (Bug #9 regression)**
- Description: Verify 2xx responses are considered cacheable
- Expected: isCacheable() returns true for 200, 201, 204, etc.

**Scenario: 404 response not cacheable (Bug #9 regression)**
- Description: Verify 4xx responses are not cacheable
- Expected: isCacheable() returns false for 404, 400, 403, etc.

**Scenario: 500 response not cacheable**
- Description: Verify 5xx responses are not cacheable
- Expected: isCacheable() returns false for 500, 502, 503, etc.

**Scenario: 301 redirect not cacheable (Bug #9 regression)**
- Description: Verify 3xx redirect responses are not cached
- Expected: isCacheable() returns false for 301, 302, 307, 308

**Scenario: 304 Not Modified not cacheable**
- Description: Verify 304 responses are not cached
- Expected: isCacheable() returns false for 304

### Response Cloning

**Scenario: Clone response for caching**
- Description: Verify response can be cloned for cache storage
- Expected: Clone is created; original response remains usable

**Scenario: Clone response with body already read**
- Description: Verify cloning fails gracefully when body is consumed
- Expected: Error is thrown or undefined is returned

---

## Sync: CacheSyncManager.ts

### Cross-Tab Synchronization

**Scenario: Initialize sync manager with cache**
- Description: Verify CacheSyncManager initializes with BroadcastChannel
- Expected: Manager is ready; channel is open

**Scenario: Broadcast cache update to other tabs**
- Description: Verify cache set triggers broadcast to other tabs
- Expected: Message is sent via BroadcastChannel with key and action

**Scenario: Broadcast cache delete to other tabs**
- Description: Verify cache delete triggers broadcast
- Expected: Message is sent with delete action

**Scenario: Broadcast cache clear to other tabs**
- Description: Verify cache clear triggers broadcast
- Expected: Message is sent with clear action

**Scenario: Receive update message in another tab**
- Description: Verify receiving tab updates its cache on message
- Expected: Cache is updated with received response data

**Scenario: Receive delete message in another tab**
- Description: Verify receiving tab deletes entry on message
- Expected: Cache entry is removed

**Scenario: Receive clear message in another tab**
- Description: Verify receiving tab clears cache on message
- Expected: Entire cache is cleared

### Error Handling

**Scenario: BroadcastChannel not supported**
- Description: Verify graceful degradation when BroadcastChannel is unavailable
- Expected: Sync manager doesn't error; operates in non-sync mode

**Scenario: Message serialization failure**
- Description: Verify handling of responses that can't be serialized for broadcast
- Expected: Error is caught; sync fails silently or logs warning

**Scenario: Close sync manager**
- Description: Verify close() method closes BroadcastChannel
- Expected: Channel is closed; no more messages sent or received

---

## Integration Scenarios

### End-to-End Workflows

**Scenario: Fetch → Cache → Interceptor → Return**
- Description: Verify complete request flow with all features
- Expected: Request interceptor runs → fetch executes → response interceptor runs → cache stores → response returns

**Scenario: Fetch → Cache Hit → Skip Network**
- Description: Verify cached responses skip network and most processing
- Expected: Cache returns response; no network call; response interceptors may still run

**Scenario: Fetch with forceRefresh → Update Cache**
- Description: Verify forceRefresh bypasses cache but updates it
- Expected: Network request executes; cache is updated with new response

**Scenario: Cross-tab cache sync**
- Description: Verify cache updates in tab A appear in tab B
- Expected: Tab A sets cache → broadcast → Tab B cache updated → Tab B gets cached response

**Scenario: Error → Error Interceptor → Cache Fallback**
- Description: Verify error interceptor can return cached response on network failure
- Expected: Fetch fails → error interceptor checks cache → returns cached response if available

**Scenario: Global fetch replacement integration**
- Description: Verify standard fetch() calls use FetchPlus after replacement
- Expected: window.fetch() behaves like FetchPlus.fetch(); caching and interceptors apply

### Cache Disable & Per-Request Override

**Scenario: Disable caching for specific request**
- Description: Verify fetchPlusCache: false disables caching for a single request
- Expected: Request always hits network; response is not stored in cache

**Scenario: Per-request cache implementation override**
- Description: Verify fetchPlusCache can accept a different CacheInterface for a single request
- Expected: The provided cache is used instead of the default; other requests unaffected

**Scenario: Global caching disabled**
- Description: Verify enableCaching: false disables caching for all requests
- Expected: All requests hit network; no cache reads or writes

---

## API Unavailability Scenarios

**Scenario: CacheStorageCache when Cache API not available**
- Description: Verify getCache() returns null and operations no-op gracefully
- Expected: get() returns null; set() is no-op; delete() returns false; has() returns false

**Scenario: SessionStorageCache when sessionStorage unavailable**
- Description: Verify all operations return safe defaults when sessionStorage is undefined
- Expected: get() returns null; set() is no-op; delete() returns false

**Scenario: LocalStorageCache when localStorage unavailable**
- Description: Verify all operations return safe defaults when localStorage is undefined
- Expected: get() returns null; set() is no-op; delete() returns false

**Scenario: BroadcastChannel not available**
- Description: Verify CacheSyncManager handles missing BroadcastChannel
- Expected: isAvailable() returns false; broadcast() is no-op; no errors thrown

---

## New Features (Planned)

Test scenarios for the following upcoming features are documented in `temp/new-feature-scenarios.md`:

1. **Automatic Retry with Exponential Backoff** — retry logic, backoff strategies, Retry-After header, abort integration
2. **Request Deduplication** — in-flight sharing, cleanup, cache key alignment
3. **Timeout Support** — TimeoutError, AbortSignal merging, global/per-request config
4. **Stale-While-Revalidate** — serve stale, background refresh, callbacks
5. **Offline Fallback** — offline detection, cache-first/network-first strategies, request queuing
6. **Request Rate Limiting / Throttling** — concurrency limits, priority queue, per-domain throttling

See also the implementation plan at `temp/implementation-plan.md` for architecture and task breakdown.
