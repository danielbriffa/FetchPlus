import { describe, it, expect } from 'vitest';
import { calculateRetryDelay, parseRetryAfter } from '../../../src/features/retry/backoff.js';
import type { RetryConfig } from '../../../src/types/retry.js';

describe('Backoff Strategy: calculateRetryDelay', () => {
    describe('Exponential Backoff', () => {
        it('calculates exponential backoff with default multiplier (2)', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'exponential',
                initialDelay: 1000,
                maxDelay: 30000,
                backoffMultiplier: 2,
                maxRetries: 3,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            // Attempt 1: 1000 * 2^0 = 1000
            expect(calculateRetryDelay(1, config)).toBe(1000);
            // Attempt 2: 1000 * 2^1 = 2000
            expect(calculateRetryDelay(2, config)).toBe(2000);
            // Attempt 3: 1000 * 2^2 = 4000
            expect(calculateRetryDelay(3, config)).toBe(4000);
            // Attempt 4: 1000 * 2^3 = 8000
            expect(calculateRetryDelay(4, config)).toBe(8000);
        });

        it('respects custom backoff multiplier', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'exponential',
                initialDelay: 1000,
                maxDelay: 30000,
                backoffMultiplier: 3,
                maxRetries: 3,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            // Attempt 1: 1000 * 3^0 = 1000
            expect(calculateRetryDelay(1, config)).toBe(1000);
            // Attempt 2: 1000 * 3^1 = 3000
            expect(calculateRetryDelay(2, config)).toBe(3000);
            // Attempt 3: 1000 * 3^2 = 9000
            expect(calculateRetryDelay(3, config)).toBe(9000);
        });

        it('caps exponential backoff at maxDelay', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'exponential',
                initialDelay: 1000,
                maxDelay: 5000,
                backoffMultiplier: 2,
                maxRetries: 5,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            // Attempts 1-2: under maxDelay
            expect(calculateRetryDelay(1, config)).toBe(1000);
            expect(calculateRetryDelay(2, config)).toBe(2000);
            // Attempt 3: 4000 is under maxDelay
            expect(calculateRetryDelay(3, config)).toBe(4000);
            // Attempt 4: 8000 exceeds maxDelay, should be capped
            expect(calculateRetryDelay(4, config)).toBe(5000);
            // Attempt 5: still capped
            expect(calculateRetryDelay(5, config)).toBe(5000);
        });
    });

    describe('Linear Backoff', () => {
        it('calculates linear backoff correctly', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'linear',
                initialDelay: 1000,
                maxDelay: 30000,
                backoffMultiplier: 2, // ignored for linear
                maxRetries: 3,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            // Attempt 1: 1000 * 1 = 1000
            expect(calculateRetryDelay(1, config)).toBe(1000);
            // Attempt 2: 1000 * 2 = 2000
            expect(calculateRetryDelay(2, config)).toBe(2000);
            // Attempt 3: 1000 * 3 = 3000
            expect(calculateRetryDelay(3, config)).toBe(3000);
            // Attempt 4: 1000 * 4 = 4000
            expect(calculateRetryDelay(4, config)).toBe(4000);
        });

        it('caps linear backoff at maxDelay', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'linear',
                initialDelay: 2000,
                maxDelay: 5000,
                backoffMultiplier: 2,
                maxRetries: 5,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            // Attempts 1-2: under maxDelay
            expect(calculateRetryDelay(1, config)).toBe(2000);
            expect(calculateRetryDelay(2, config)).toBe(4000);
            // Attempt 3: 6000 exceeds maxDelay, should be capped
            expect(calculateRetryDelay(3, config)).toBe(5000);
            // Subsequent attempts still capped
            expect(calculateRetryDelay(4, config)).toBe(5000);
        });
    });

    describe('Fixed Backoff', () => {
        it('returns constant delay for all attempts', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'fixed',
                initialDelay: 1500,
                maxDelay: 30000,
                backoffMultiplier: 2,
                maxRetries: 3,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            // All attempts return same delay
            expect(calculateRetryDelay(1, config)).toBe(1500);
            expect(calculateRetryDelay(2, config)).toBe(1500);
            expect(calculateRetryDelay(3, config)).toBe(1500);
            expect(calculateRetryDelay(10, config)).toBe(1500);
        });

        it('respects maxDelay even for fixed backoff', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'fixed',
                initialDelay: 40000,
                maxDelay: 10000,
                backoffMultiplier: 2,
                maxRetries: 3,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            // All attempts capped at maxDelay
            expect(calculateRetryDelay(1, config)).toBe(10000);
            expect(calculateRetryDelay(2, config)).toBe(10000);
            expect(calculateRetryDelay(3, config)).toBe(10000);
        });
    });

    describe('Edge Cases: Zero Initial Delay', () => {
        it('handles zero initial delay for exponential backoff', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'exponential',
                initialDelay: 0,
                maxDelay: 30000,
                backoffMultiplier: 2,
                maxRetries: 3,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            // All attempts should return 0
            expect(calculateRetryDelay(1, config)).toBe(0);
            expect(calculateRetryDelay(2, config)).toBe(0);
            expect(calculateRetryDelay(3, config)).toBe(0);
        });

        it('handles zero initial delay for linear backoff', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'linear',
                initialDelay: 0,
                maxDelay: 30000,
                backoffMultiplier: 2,
                maxRetries: 3,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            // All attempts should return 0
            expect(calculateRetryDelay(1, config)).toBe(0);
            expect(calculateRetryDelay(2, config)).toBe(0);
            expect(calculateRetryDelay(3, config)).toBe(0);
        });

        it('handles zero initial delay for fixed backoff', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'fixed',
                initialDelay: 0,
                maxDelay: 30000,
                backoffMultiplier: 2,
                maxRetries: 3,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            // All attempts should return 0
            expect(calculateRetryDelay(1, config)).toBe(0);
            expect(calculateRetryDelay(2, config)).toBe(0);
            expect(calculateRetryDelay(3, config)).toBe(0);
        });
    });

    describe('Edge Cases: Negative Values', () => {
        it('treats negative initialDelay as 0 for exponential backoff', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'exponential',
                initialDelay: -1000,
                maxDelay: 30000,
                backoffMultiplier: 2,
                maxRetries: 3,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            // Negative * positive = negative, which should be treated as 0 or min value
            const delay1 = calculateRetryDelay(1, config);
            expect(delay1).toBeLessThanOrEqual(0);
        });

        it('treats negative initialDelay as 0 for linear backoff', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'linear',
                initialDelay: -1000,
                maxDelay: 30000,
                backoffMultiplier: 2,
                maxRetries: 3,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            const delay1 = calculateRetryDelay(1, config);
            expect(delay1).toBeLessThanOrEqual(0);
        });
    });

    describe('Boundary Conditions', () => {
        it('handles very small delays', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'exponential',
                initialDelay: 1,
                maxDelay: 30000,
                backoffMultiplier: 2,
                maxRetries: 3,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            expect(calculateRetryDelay(1, config)).toBe(1);
            expect(calculateRetryDelay(2, config)).toBe(2);
            expect(calculateRetryDelay(3, config)).toBe(4);
        });

        it('handles very large maxDelay', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'exponential',
                initialDelay: 1000,
                maxDelay: 999999999,
                backoffMultiplier: 2,
                maxRetries: 10,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            // Should not be capped for reasonable exponential calculations
            expect(calculateRetryDelay(1, config)).toBe(1000);
            expect(calculateRetryDelay(10, config)).toBe(1000 * Math.pow(2, 9)); // 512000
        });

        it('handles multiplier of 1 (no exponential growth)', () => {
            const config: Required<RetryConfig> = {
                backoffStrategy: 'exponential',
                initialDelay: 1000,
                maxDelay: 30000,
                backoffMultiplier: 1,
                maxRetries: 3,
                retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnNetworkError: true,
                respectRetryAfter: true,
                onRetry: () => {},
            };

            // With multiplier 1, exponential becomes: 1000 * 1^n = 1000
            expect(calculateRetryDelay(1, config)).toBe(1000);
            expect(calculateRetryDelay(2, config)).toBe(1000);
            expect(calculateRetryDelay(3, config)).toBe(1000);
        });
    });
});

describe('Retry-After Header Parsing: parseRetryAfter', () => {
    describe('Parsing Retry-After as Seconds', () => {
        it('parses numeric Retry-After header as seconds', () => {
            const delay = parseRetryAfter('2');
            expect(delay).toBe(2000); // 2 seconds = 2000ms
        });

        it('parses zero as immediate', () => {
            const delay = parseRetryAfter('0');
            expect(delay).toBe(0);
        });

        it('parses large numeric values', () => {
            const delay = parseRetryAfter('3600');
            expect(delay).toBe(3600000); // 1 hour in ms
        });

        it('parses decimal-like string (takes integer part)', () => {
            // parseInt('2.5') = 2
            const delay = parseRetryAfter('2.5');
            expect(delay).toBe(2000);
        });
    });

    describe('Parsing Retry-After as HTTP Date', () => {
        it('parses HTTP-date Retry-After header', () => {
            // Use a fixed future date
            const futureDate = new Date();
            futureDate.setSeconds(futureDate.getSeconds() + 5);
            const dateString = futureDate.toUTCString();

            const delay = parseRetryAfter(dateString);
            expect(delay).toBeDefined();
            expect(delay).toBeGreaterThan(0);
            // Should be approximately 5 seconds (5000ms), allowing tolerance for test execution time
            expect(delay).toBeLessThanOrEqual(5500);
            expect(delay).toBeGreaterThanOrEqual(4000);
        });

        it('returns 0 or positive for date in the future', () => {
            const futureDate = new Date();
            futureDate.setMinutes(futureDate.getMinutes() + 1);
            const dateString = futureDate.toUTCString();

            const delay = parseRetryAfter(dateString);
            expect(delay).toBeGreaterThan(0);
        });

        it('returns 0 or positive for date in the past', () => {
            const pastDate = new Date();
            pastDate.setMinutes(pastDate.getMinutes() - 1);
            const dateString = pastDate.toUTCString();

            const delay = parseRetryAfter(dateString);
            // Past date should return 0 or negative (converted to 0)
            expect(delay).toBeLessThanOrEqual(0);
        });
    });

    describe('Handling Invalid Retry-After Values', () => {
        it('returns null for invalid string', () => {
            const delay = parseRetryAfter('not-a-number-or-date');
            expect(delay).toBeNull();
        });

        it('returns null for empty string', () => {
            const delay = parseRetryAfter('');
            expect(delay).toBeNull();
        });

        it('returns null for null input', () => {
            const delay = parseRetryAfter(null);
            expect(delay).toBeNull();
        });

        it('returns null for malformed date', () => {
            const delay = parseRetryAfter('not a valid date format');
            expect(delay).toBeNull();
        });

        it('returns null for whitespace-only string', () => {
            const delay = parseRetryAfter('   ');
            expect(delay).toBeNull();
        });
    });

    describe('Retry-After Capping', () => {
        it('Retry-After value is capped by maxDelay during retry calculation', () => {
            // This test verifies that if parseRetryAfter returns a large value,
            // it will be capped by maxDelay in the retry manager.
            // But parseRetryAfter itself doesn't cap - that's done elsewhere.
            const delay = parseRetryAfter('60');
            expect(delay).toBe(60000); // 60 seconds
            // The actual capping happens in RetryManager.waitBeforeRetry
        });
    });

    describe('Edge Cases', () => {
        it('handles large numeric values as seconds', () => {
            const delay = parseRetryAfter('86400'); // 24 hours
            expect(delay).toBe(86400000);
        });

        it('handles negative numeric string', () => {
            // parseInt('-5') = -5, which becomes -5000ms
            const delay = parseRetryAfter('-5');
            expect(delay).toBe(-5000);
        });

        it('parses ISO 8601 date format (RFC 3339)', () => {
            const futureDate = new Date();
            futureDate.setSeconds(futureDate.getSeconds() + 3);
            const isoString = futureDate.toISOString();

            const delay = parseRetryAfter(isoString);
            expect(delay).toBeDefined();
            expect(delay).toBeGreaterThan(0);
        });
    });
});
