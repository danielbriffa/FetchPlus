/**
 * Safely clones a Response object, handling various edge cases
 */
export async function cloneResponse(response: Response): Promise<Response> {
    // Clone the response to preserve the original
    return response.clone();
}

/**
 * Checks if a response can be cached
 */
export function isCacheable(response: Response): boolean {
    // Don't cache error responses
    if (!response.ok) {
        return false;
    }

    // Don't cache responses with no-store cache-control
    const cacheControl = response.headers.get('cache-control');
    if (cacheControl?.includes('no-store')) {
        return false;
    }

    return true;
}
