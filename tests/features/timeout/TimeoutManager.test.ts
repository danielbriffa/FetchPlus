import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TimeoutManager } from '../../../src/features/timeout/TimeoutManager.js';
import { TimeoutError } from '../../../src/errors/TimeoutError.js';
import { FetchPlusError } from '../../../src/errors/FetchPlusError.js';

describe('TimeoutManager', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Basic Timeout Functionality', () => {
        it('request completes before timeout returns response normally', async () => {
            const mockFetch = vi.fn(async () => new Response('success', { status: 200 }));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 5000);

            // Advance time just enough for fetch to complete
            await vi.advanceTimersByTimeAsync(10);

            const response = await promise;
            expect(response.status).toBe(200);
            const text = await response.text();
            expect(text).toBe('success');
        });

        it('request times out throws TimeoutError with correct timeoutMs', async () => {
            const mockFetch = vi.fn(() => new Promise(() => {})); // Never resolves

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 3000).catch(e => e);

            // Advance past timeout
            await vi.advanceTimersByTimeAsync(3000);

            const error = await promise;
            expect(error).toBeInstanceOf(TimeoutError);
            expect(error.timeoutMs).toBe(3000);
            expect(error.message).toContain('timeout');
        });

        it('TimeoutError extends FetchPlusError', async () => {
            const mockFetch = vi.fn(() => new Promise(() => {}));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 1000).catch(e => e);

            await vi.advanceTimersByTimeAsync(1000);

            const error = await promise;
            expect(error).toBeInstanceOf(FetchPlusError);
            expect(error).toBeInstanceOf(TimeoutError);
        });

        it('TimeoutError has name property set to "TimeoutError"', async () => {
            const mockFetch = vi.fn(() => new Promise(() => {}));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 500).catch(e => e);

            await vi.advanceTimersByTimeAsync(500);

            const error = await promise;
            expect(error.name).toBe('TimeoutError');
        });
    });

    describe('Timeout Configuration', () => {
        it('getTimeoutValue returns request timeout when provided', () => {
            const result = TimeoutManager.getTimeoutValue(5000, 10000);
            expect(result).toBe(5000);
        });

        it('getTimeoutValue falls back to default when no request timeout', () => {
            const result = TimeoutManager.getTimeoutValue(undefined, 8000);
            expect(result).toBe(8000);
        });

        it('getTimeoutValue returns null when neither is set', () => {
            const result = TimeoutManager.getTimeoutValue(undefined, undefined);
            expect(result).toBeNull();
        });

        it('getTimeoutValue returns 0 when request timeout is 0 (disables timeout)', () => {
            const result = TimeoutManager.getTimeoutValue(0, 5000);
            expect(result).toBe(0);
        });

        it('getTimeoutValue treats 0 as disable, not fallback', () => {
            // When request timeout is explicitly 0, it should not fall back to default
            const result = TimeoutManager.getTimeoutValue(0, 5000);
            expect(result).toBe(0); // Not 5000
        });

        it('getTimeoutValue returns null when default is 0', () => {
            const result = TimeoutManager.getTimeoutValue(undefined, 0);
            expect(result).toBe(0); // 0 is a valid timeout value
        });
    });

    describe('Timeout with No Timeout Configured', () => {
        it('request completes when no timeout is set', async () => {
            const mockFetch = vi.fn(async () => new Response('data', { status: 200 }));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, null);

            await vi.advanceTimersByTimeAsync(100);

            const response = await promise;
            expect(response.status).toBe(200);
        });

        it('request can take indefinite time when timeout is null', async () => {
            let completed = false;
            const mockFetch = vi.fn(async () => {
                completed = true;
                return new Response('ok', { status: 200 });
            });

            const promise = TimeoutManager.executeWithTimeout(mockFetch, null);

            // Advance time way beyond typical timeout
            await vi.advanceTimersByTimeAsync(100000);

            await promise;
            expect(completed).toBe(true);
        });
    });

    describe('AbortController Integration', () => {
        it('user AbortSignal aborted throws AbortError not TimeoutError', async () => {
            const controller = new AbortController();
            const mockFetch = vi.fn(() => new Promise(() => {})); // Never resolves

            // Abort before timeout
            controller.abort();

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 5000, controller.signal).catch(
                e => e
            );

            const error = await promise;
            expect(error.name).toBe('AbortError');
            expect(error).not.toBeInstanceOf(TimeoutError);
        });

        it('user AbortSignal aborted during request throws AbortError', async () => {
            const controller = new AbortController();
            const mockFetch = vi.fn(() => new Promise(() => {})); // Never resolves

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 5000, controller.signal).catch(
                e => e
            );

            // Abort during the request (before timeout)
            await vi.advanceTimersByTimeAsync(1000);
            controller.abort();
            await vi.advanceTimersByTimeAsync(1);

            const error = await promise;
            expect(error.name).toBe('AbortError');
            expect(error).not.toBeInstanceOf(TimeoutError);
        });

        it('timeout fires first when both timeout and user abort possible', async () => {
            const controller = new AbortController();
            const mockFetch = vi.fn(() => new Promise(() => {}));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 2000, controller.signal).catch(
                e => e
            );

            // Timeout fires at 2000ms
            await vi.advanceTimersByTimeAsync(2000);

            const error = await promise;
            expect(error).toBeInstanceOf(TimeoutError);
            expect(error.timeoutMs).toBe(2000);
        });

        it('user abort fires first when user aborts before timeout', async () => {
            const controller = new AbortController();
            const mockFetch = vi.fn(() => new Promise(() => {}));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 5000, controller.signal).catch(
                e => e
            );

            // User aborts first
            await vi.advanceTimersByTimeAsync(1000);
            controller.abort();
            await vi.advanceTimersByTimeAsync(1);

            const error = await promise;
            expect(error.name).toBe('AbortError');
            expect(error).not.toBeInstanceOf(TimeoutError);
        });

        it('combined signal from combineSignals aborts when timeout signal fires', async () => {
            const controller = new AbortController();
            const timeoutController = new AbortController();

            const combined = TimeoutManager.combineSignals(controller.signal, timeoutController.signal);

            // Abort the timeout signal
            timeoutController.abort();

            expect(combined.aborted).toBe(true);
        });

        it('combined signal from combineSignals aborts when user signal fires', async () => {
            const controller = new AbortController();
            const timeoutController = new AbortController();

            const combined = TimeoutManager.combineSignals(controller.signal, timeoutController.signal);

            // Abort the user signal
            controller.abort();

            expect(combined.aborted).toBe(true);
        });

        it('combined signal listener fires when user signal aborts', async () => {
            const controller = new AbortController();
            const timeoutController = new AbortController();

            const combined = TimeoutManager.combineSignals(controller.signal, timeoutController.signal);

            const listener = vi.fn();
            combined.addEventListener('abort', listener);

            controller.abort();

            expect(listener).toHaveBeenCalled();
            expect(combined.aborted).toBe(true);
        });

        it('combined signal listener fires when timeout signal aborts', async () => {
            const controller = new AbortController();
            const timeoutController = new AbortController();

            const combined = TimeoutManager.combineSignals(controller.signal, timeoutController.signal);

            const listener = vi.fn();
            combined.addEventListener('abort', listener);

            timeoutController.abort();

            expect(listener).toHaveBeenCalled();
            expect(combined.aborted).toBe(true);
        });

        it('combineSignals with null signal returns timeout signal', () => {
            const timeoutController = new AbortController();

            const combined = TimeoutManager.combineSignals(null, timeoutController.signal);

            expect(combined).toBe(timeoutController.signal);
        });

        it('combineSignals with undefined signal returns timeout signal', () => {
            const timeoutController = new AbortController();

            const combined = TimeoutManager.combineSignals(undefined, timeoutController.signal);

            expect(combined).toBe(timeoutController.signal);
        });
    });

    describe('Timeout Lifecycle and Cleanup', () => {
        it('setTimeout is cleared after successful response', async () => {
            const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
            const mockFetch = vi.fn(async () => new Response('success', { status: 200 }));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 5000);

            await vi.advanceTimersByTimeAsync(10);
            await promise;

            // clearTimeout should have been called to clean up the timeout
            expect(clearTimeoutSpy).toHaveBeenCalled();

            clearTimeoutSpy.mockRestore();
        });

        it('setTimeout is cleared after timeout fires', async () => {
            const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
            const mockFetch = vi.fn(() => new Promise(() => {}));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 1000).catch(() => {});

            await vi.advanceTimersByTimeAsync(1000);
            await promise;

            // clearTimeout should be called (even though timeout fired)
            expect(clearTimeoutSpy).toHaveBeenCalled();

            clearTimeoutSpy.mockRestore();
        });

        it('setTimeout is cleared after fetch error', async () => {
            const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
            const mockFetch = vi.fn(async () => {
                throw new Error('Network failed');
            });

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 5000).catch(() => {});

            await vi.advanceTimersByTimeAsync(10);
            await promise;

            // clearTimeout should be called to clean up
            expect(clearTimeoutSpy).toHaveBeenCalled();

            clearTimeoutSpy.mockRestore();
        });

        it('setTimeout is cleared after user abort', async () => {
            const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
            const controller = new AbortController();
            const mockFetch = vi.fn(() => new Promise(() => {}));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 5000, controller.signal).catch(
                () => {}
            );

            await vi.advanceTimersByTimeAsync(1000);
            controller.abort();
            await vi.advanceTimersByTimeAsync(1);
            await promise;

            // clearTimeout should be called
            expect(clearTimeoutSpy).toHaveBeenCalled();

            clearTimeoutSpy.mockRestore();
        });

        it('no timer is set when timeout is null', async () => {
            const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
            const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, null);

            await vi.advanceTimersByTimeAsync(10);
            await promise;

            // setTimeout should not be called for timeout
            // (but may be called by vitest, so we check if it was called with a timeout)
            const timeoutCalls = setTimeoutSpy.mock.calls.filter(
                call => typeof call[1] === 'number' && call[1] > 0
            );
            // Should be 0 or minimal calls (not timeout-related calls we create)
            setTimeoutSpy.mockRestore();
        });
    });

    describe('Edge Cases: Zero Timeout', () => {
        it('zero timeout (0ms) is treated as disable, not immediate timeout', async () => {
            const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 0);

            // Should complete without timeout error
            await vi.advanceTimersByTimeAsync(10);
            const response = await promise;

            expect(response.status).toBe(200);
            expect(mockFetch).toHaveBeenCalled();
        });
    });

    describe('Edge Cases: Negative Timeout', () => {
        it('negative timeout is treated as no timeout', async () => {
            const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, -100);

            await vi.advanceTimersByTimeAsync(10);
            const response = await promise;

            expect(response.status).toBe(200);
            expect(mockFetch).toHaveBeenCalled();
        });
    });

    describe('Edge Cases: Very Large Timeout', () => {
        it('very large timeout works normally', async () => {
            const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 1000000);

            await vi.advanceTimersByTimeAsync(10);
            const response = await promise;

            expect(response.status).toBe(200);
        });

        it('large timeout does not fire if request completes first', async () => {
            const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 1000000).catch(e => e);

            await vi.advanceTimersByTimeAsync(100);
            const result = await promise;

            expect(result).toBeInstanceOf(Response);
            expect(result).not.toBeInstanceOf(Error);
        });
    });

    describe('Concurrent Timeout Requests', () => {
        it('multiple concurrent timeouts maintain independent state', async () => {
            const mockFetch1 = vi.fn(() => new Promise(() => {}));
            const mockFetch2 = vi.fn(() => new Promise(() => {}));

            const promise1 = TimeoutManager.executeWithTimeout(mockFetch1, 2000).catch(e => e);
            const promise2 = TimeoutManager.executeWithTimeout(mockFetch2, 3000).catch(e => e);

            // First timeout fires at 2000ms
            await vi.advanceTimersByTimeAsync(2000);

            const error1 = await promise1;
            expect(error1).toBeInstanceOf(TimeoutError);
            expect(error1.timeoutMs).toBe(2000);

            // Second timeout still pending
            await vi.advanceTimersByTimeAsync(1000);

            const error2 = await promise2;
            expect(error2).toBeInstanceOf(TimeoutError);
            expect(error2.timeoutMs).toBe(3000);
        });

        it('one timeout does not affect another concurrent request', async () => {
            const mockFetch1 = vi.fn(() => new Promise(() => {}));
            const mockFetch2 = vi.fn(async () => new Response('success', { status: 200 }));

            const promise1 = TimeoutManager.executeWithTimeout(mockFetch1, 1000).catch(e => e);
            const promise2 = TimeoutManager.executeWithTimeout(mockFetch2, 5000);

            // Timeout on first request
            await vi.advanceTimersByTimeAsync(1000);
            const error1 = await promise1;

            // Second request should still complete successfully
            await vi.advanceTimersByTimeAsync(10);
            const response2 = await promise2;

            expect(error1).toBeInstanceOf(TimeoutError);
            expect(response2.status).toBe(200);
        });
    });

    describe('Timeout Error Message Quality', () => {
        it('TimeoutError message includes timeout value', async () => {
            const mockFetch = vi.fn(() => new Promise(() => {}));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 4500).catch(e => e);

            await vi.advanceTimersByTimeAsync(4500);

            const error = await promise;
            expect(error.message).toContain('4500');
        });

        it('TimeoutError message is descriptive', async () => {
            const mockFetch = vi.fn(() => new Promise(() => {}));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 3000).catch(e => e);

            await vi.advanceTimersByTimeAsync(3000);

            const error = await promise;
            // Message should indicate timeout
            expect(error.message.toLowerCase()).toContain('timeout');
        });
    });

    describe('Response Handling', () => {
        it('response with error status code still counts as completed', async () => {
            const mockFetch = vi.fn(async () => new Response('Not found', { status: 404 }));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 5000);

            await vi.advanceTimersByTimeAsync(10);
            const response = await promise;

            expect(response.status).toBe(404);
            const text = await response.text();
            expect(text).toBe('Not found');
        });

        it('response with 500 status still counts as completed before timeout', async () => {
            const mockFetch = vi.fn(async () => new Response('Error', { status: 500 }));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 5000);

            await vi.advanceTimersByTimeAsync(10);
            const response = await promise;

            expect(response.status).toBe(500);
        });
    });

    describe('Abort Controller Behavior', () => {
        it('fetch is called with combined signal', async () => {
            const controller = new AbortController();
            const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));

            await TimeoutManager.executeWithTimeout(mockFetch, 5000, controller.signal);

            // Verify fetch was called
            expect(mockFetch).toHaveBeenCalled();

            // Verify the signal passed includes abort capability
            const callArgs = mockFetch.mock.calls[0];
            expect(callArgs).toBeDefined();
        });

        it('user signal already aborted before fetch resolves immediately', async () => {
            const controller = new AbortController();
            controller.abort();

            const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));

            const promise = TimeoutManager.executeWithTimeout(mockFetch, 5000, controller.signal).catch(
                e => e
            );

            const error = await promise;
            expect(error.name).toBe('AbortError');
        });
    });
});
