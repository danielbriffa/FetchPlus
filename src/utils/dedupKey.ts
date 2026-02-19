import { generateCacheKey } from './cacheKey.js';

/**
 * Generates a deduplication key that includes request body
 * For deduplication, we need to differentiate requests with different bodies
 */
export async function generateDedupKey(input: RequestInfo | URL, init?: RequestInit): Promise<string> {
    // Start with the base cache key (method + normalized URL)
    const baseKey = generateCacheKey(input, init);

    // If there's no body, return the base key
    if (!init?.body) {
        return baseKey;
    }

    // Include a hash of the body in the key
    // For simplicity, convert body to string representation
    let bodyKey = '';

    if (typeof init.body === 'string') {
        bodyKey = init.body;
    } else if (init.body instanceof URLSearchParams) {
        bodyKey = init.body.toString();
    } else if (init.body instanceof FormData) {
        // FormData is harder to serialize consistently, use a marker
        bodyKey = '[FormData]';
    } else if (init.body instanceof Blob) {
        // For Blob, we could read it but that's async and might consume the stream
        // Use size as a weak differentiator
        bodyKey = `[Blob:${init.body.size}:${init.body.type}]`;
    } else if (init.body instanceof ArrayBuffer) {
        bodyKey = `[ArrayBuffer:${init.body.byteLength}]`;
    } else if (ArrayBuffer.isView(init.body)) {
        bodyKey = `[ArrayBufferView:${init.body.byteLength}]`;
    } else {
        // For ReadableStream or other types, we can't easily serialize
        bodyKey = '[Stream]';
    }

    // Simple hash function for the body
    // We'll use a basic hash to keep the key reasonably sized
    const hash = simpleHash(bodyKey);

    return `${baseKey}:body:${hash}`;
}

/**
 * Synchronous version that doesn't handle all body types perfectly
 * but works for the common cases (string, URLSearchParams)
 */
export function generateDedupKeySync(input: RequestInfo | URL, init?: RequestInit): string {
    // Start with the base cache key (method + normalized URL)
    const baseKey = generateCacheKey(input, init);

    // If there's no body, return the base key
    if (!init?.body) {
        return baseKey;
    }

    // Include a hash of the body in the key
    let bodyKey = '';

    if (typeof init.body === 'string') {
        bodyKey = init.body;
    } else if (init.body instanceof URLSearchParams) {
        bodyKey = init.body.toString();
    } else if (init.body instanceof FormData) {
        // FormData is harder to serialize consistently, use a marker
        bodyKey = '[FormData]';
    } else if (init.body instanceof Blob) {
        bodyKey = `[Blob:${init.body.size}:${init.body.type}]`;
    } else if (init.body instanceof ArrayBuffer) {
        bodyKey = `[ArrayBuffer:${init.body.byteLength}]`;
    } else if (ArrayBuffer.isView(init.body)) {
        bodyKey = `[ArrayBufferView:${init.body.byteLength}]`;
    } else {
        // For ReadableStream or other types, we can't easily serialize
        bodyKey = '[Stream]';
    }

    // Simple hash function for the body
    const hash = simpleHash(bodyKey);

    return `${baseKey}:body:${hash}`;
}

/**
 * Simple hash function (djb2 algorithm)
 * Returns a short hash string for the input
 */
function simpleHash(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
    }
    // Convert to unsigned 32-bit integer and then to hex string
    return (hash >>> 0).toString(36);
}
