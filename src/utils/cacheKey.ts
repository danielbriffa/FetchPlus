/**
 * Generates a consistent cache key from request parameters
 */
export function generateCacheKey(input: RequestInfo | URL, init?: RequestInit): string {
    // Extract URL
    let url: string;
    if (typeof input === 'string') {
        url = input;
    } else if (input instanceof URL) {
        url = input.toString();
    } else if (input instanceof Request) {
        url = input.url;
    } else {
        url = String(input);
    }

    // Normalize URL (remove trailing slashes, sort query params)
    const normalizedUrl = normalizeUrl(url);

    // Get method
    let method = 'GET';
    if (init?.method) {
        method = init.method.toUpperCase();
    } else if (input instanceof Request) {
        method = input.method.toUpperCase();
    }

    // Create base key
    return `${method}:${normalizedUrl}`;
}

/**
 * Normalizes a URL for consistent cache keys
 */
function normalizeUrl(url: string): string {
    try {
        const urlObj = new URL(url);

        // Sort query parameters
        const params = Array.from(urlObj.searchParams.entries()).sort((a, b) =>
            a[0].localeCompare(b[0])
        );

        urlObj.search = '';
        params.forEach(([key, value]) => {
            urlObj.searchParams.append(key, value);
        });

        // Remove trailing slash from pathname
        let pathname = urlObj.pathname;
        if (pathname.length > 1 && pathname.endsWith('/')) {
            pathname = pathname.slice(0, -1);
        }
        urlObj.pathname = pathname;

        return urlObj.toString();
    } catch {
        // If URL parsing fails, return as-is
        return url;
    }
}
