import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InterceptorManager } from '../../src/interceptors/InterceptorManager.js';

describe('InterceptorManager', () => {
    let manager: InterceptorManager;

    beforeEach(() => {
        manager = new InterceptorManager();
    });

    describe('Request Interceptors', () => {
        it('adds and executes a single request interceptor', async () => {
            const interceptor = vi.fn((input, init) => input);
            manager.addRequestInterceptor(interceptor);

            await manager.executeRequestInterceptors('https://api.example.com', { method: 'GET' });

            expect(interceptor).toHaveBeenCalledWith('https://api.example.com', { method: 'GET' });
        });

        it('executes multiple request interceptors in order', async () => {
            const calls: number[] = [];
            manager.addRequestInterceptor(() => {
                calls.push(1);
                return 'https://api.example.com/v1';
            });
            manager.addRequestInterceptor(() => {
                calls.push(2);
                return 'https://api.example.com/v2';
            });

            const result = await manager.executeRequestInterceptors('https://api.example.com');
            expect(calls).toEqual([1, 2]);
            expect(result.input).toBe('https://api.example.com/v2');
        });

        describe('Bug #1 regression: URL/Request object return handling', () => {
            it('handles request interceptor returning URL object', async () => {
                const interceptor = vi.fn(() => new URL('https://modified.example.com/data'));
                manager.addRequestInterceptor(interceptor);

                const result = await manager.executeRequestInterceptors('https://api.example.com');

                expect(result.input).toBeInstanceOf(URL);
                expect((result.input as URL).toString()).toBe('https://modified.example.com/data');
            });

            it('handles request interceptor returning Request object', async () => {
                const interceptor = vi.fn(
                    () => new Request('https://modified.example.com/data', { method: 'POST' })
                );
                manager.addRequestInterceptor(interceptor);

                const result = await manager.executeRequestInterceptors('https://api.example.com');

                expect(result.input).toBeInstanceOf(Request);
                expect((result.input as Request).url).toBe('https://modified.example.com/data');
                expect((result.input as Request).method).toBe('POST');
            });

            it('handles request interceptor returning {input, init} object', async () => {
                const interceptor = vi.fn(() => ({
                    input: 'https://modified.example.com/data',
                    init: { method: 'POST', headers: { 'x-custom': 'value' } },
                }));
                manager.addRequestInterceptor(interceptor);

                const result = await manager.executeRequestInterceptors('https://api.example.com');

                expect(result.input).toBe('https://modified.example.com/data');
                expect(result.init?.method).toBe('POST');
                expect(result.init?.headers).toEqual({ 'x-custom': 'value' });
            });

            it('handles request interceptor returning string URL', async () => {
                const interceptor = vi.fn(() => 'https://modified.example.com/data');
                manager.addRequestInterceptor(interceptor);

                const result = await manager.executeRequestInterceptors('https://api.example.com');

                expect(result.input).toBe('https://modified.example.com/data');
            });
        });

        it('modifies init without changing input', async () => {
            manager.addRequestInterceptor((input, init) => ({
                input,
                init: { ...init, headers: { 'x-modified': 'true' } },
            }));

            const result = await manager.executeRequestInterceptors(
                'https://api.example.com',
                { method: 'GET' }
            );

            expect(result.input).toBe('https://api.example.com');
            expect(result.init?.headers).toEqual({ 'x-modified': 'true' });
        });

        it('chains multiple interceptors correctly', async () => {
            manager.addRequestInterceptor((input) => 'https://api.example.com/v1');
            manager.addRequestInterceptor((input, init) => ({
                input,
                init: { ...init, method: 'POST' },
            }));
            manager.addRequestInterceptor((input) => `${input}/users`);

            const result = await manager.executeRequestInterceptors('https://api.example.com');

            expect(result.input).toBe('https://api.example.com/v1/users');
            expect(result.init?.method).toBe('POST');
        });

        it('removes request interceptor by ID', async () => {
            const id = manager.addRequestInterceptor(() => 'https://modified.example.com');
            const removed = manager.removeInterceptor(id);

            expect(removed).toBe(true);

            const result = await manager.executeRequestInterceptors('https://api.example.com');
            expect(result.input).toBe('https://api.example.com');
        });
    });

    describe('Response Interceptors', () => {
        it('adds and executes a single response interceptor', async () => {
            const response = new Response('test');
            const interceptor = vi.fn((res) => res);
            manager.addResponseInterceptor(interceptor);

            await manager.executeResponseInterceptors(response);

            expect(interceptor).toHaveBeenCalledWith(response);
        });

        it('executes multiple response interceptors in order', async () => {
            const calls: number[] = [];
            manager.addResponseInterceptor(async (res) => {
                calls.push(1);
                return res;
            });
            manager.addResponseInterceptor(async (res) => {
                calls.push(2);
                return res;
            });

            const response = new Response('test');
            await manager.executeResponseInterceptors(response);

            expect(calls).toEqual([1, 2]);
        });

        it('transforms response through interceptor chain', async () => {
            manager.addResponseInterceptor(async (res) => {
                return new Response('modified', { status: res.status });
            });

            const original = new Response('original', { status: 200 });
            const result = await manager.executeResponseInterceptors(original);
            const text = await result.text();

            expect(text).toBe('modified');
        });

        it('removes response interceptor by ID', async () => {
            const id = manager.addResponseInterceptor(async () => {
                return new Response('modified');
            });
            const removed = manager.removeInterceptor(id);

            expect(removed).toBe(true);

            const original = new Response('original');
            const result = await manager.executeResponseInterceptors(original);
            const text = await result.text();

            expect(text).toBe('original');
        });
    });

    describe('Error Interceptors', () => {
        describe('Bug #11 regression: Error interceptor return types', () => {
            it('error interceptor returns Response for recovery', async () => {
                const fallbackResponse = new Response('fallback', { status: 200 });
                manager.addErrorInterceptor(() => fallbackResponse);

                const error = new Error('Network failure');
                const result = await manager.executeErrorInterceptors(error);

                expect(result).toBe(fallbackResponse);
            });

            it('error interceptor returns void and error is re-thrown', async () => {
                manager.addErrorInterceptor((error) => {
                    // Log error but don't handle it
                    console.log(error.message);
                });

                const error = new Error('Network failure');
                await expect(manager.executeErrorInterceptors(error)).rejects.toThrow(
                    'Network failure'
                );
            });

            it('error interceptor returns Promise<Response> for async recovery', async () => {
                manager.addErrorInterceptor(async (error) => {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    return new Response('async fallback', { status: 200 });
                });

                const error = new Error('Network failure');
                const result = await manager.executeErrorInterceptors(error);
                const text = await result.text();

                expect(text).toBe('async fallback');
            });

            it('error interceptor returns Promise<void> and error is re-thrown', async () => {
                manager.addErrorInterceptor(async (error) => {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    // void return
                });

                const error = new Error('Network failure');
                await expect(manager.executeErrorInterceptors(error)).rejects.toThrow(
                    'Network failure'
                );
            });
        });

        it('first error interceptor returning Response stops chain', async () => {
            const calls: number[] = [];
            manager.addErrorInterceptor((error) => {
                calls.push(1);
                return new Response('recovered');
            });
            manager.addErrorInterceptor((error) => {
                calls.push(2);
                return new Response('should not run');
            });

            const error = new Error('Test error');
            await manager.executeErrorInterceptors(error);

            // Only first interceptor should run
            expect(calls).toEqual([1]);
        });

        it('chains error interceptors when all return void', async () => {
            const calls: number[] = [];
            manager.addErrorInterceptor((error) => {
                calls.push(1);
            });
            manager.addErrorInterceptor((error) => {
                calls.push(2);
            });

            const error = new Error('Test error');
            await expect(manager.executeErrorInterceptors(error)).rejects.toThrow('Test error');

            expect(calls).toEqual([1, 2]);
        });

        it('removes error interceptor by ID', async () => {
            const id = manager.addErrorInterceptor(() => new Response('fallback'));
            const removed = manager.removeInterceptor(id);

            expect(removed).toBe(true);

            const error = new Error('Test error');
            await expect(manager.executeErrorInterceptors(error)).rejects.toThrow('Test error');
        });
    });

    describe('clearAll', () => {
        it('clears all interceptors', async () => {
            manager.addRequestInterceptor(() => 'https://modified.example.com');
            manager.addResponseInterceptor(async () => new Response('modified'));
            manager.addErrorInterceptor(() => new Response('fallback'));

            manager.clearAll();

            // Request interceptors should be cleared
            const reqResult = await manager.executeRequestInterceptors('https://api.example.com');
            expect(reqResult.input).toBe('https://api.example.com');

            // Response interceptors should be cleared
            const response = new Response('original');
            const resResult = await manager.executeResponseInterceptors(response);
            const text = await resResult.text();
            expect(text).toBe('original');

            // Error interceptors should be cleared
            const error = new Error('Test error');
            await expect(manager.executeErrorInterceptors(error)).rejects.toThrow('Test error');
        });
    });

    describe('removeInterceptor', () => {
        it('returns false when ID not found', () => {
            const removed = manager.removeInterceptor(9999);
            expect(removed).toBe(false);
        });

        it('can remove from different interceptor types', () => {
            const reqId = manager.addRequestInterceptor(() => 'test');
            const resId = manager.addResponseInterceptor(async (res) => res);
            const errId = manager.addErrorInterceptor(() => new Response('fallback'));

            expect(manager.removeInterceptor(reqId)).toBe(true);
            expect(manager.removeInterceptor(resId)).toBe(true);
            expect(manager.removeInterceptor(errId)).toBe(true);
        });
    });
});
