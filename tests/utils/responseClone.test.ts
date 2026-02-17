import { describe, it, expect } from 'vitest';
import { isCacheable, cloneResponse } from '../../src/utils/responseClone.js';

describe('responseClone', () => {
    describe('isCacheable', () => {
        describe('Bug #10 regression: Cacheable status codes', () => {
            it('returns true for 200 OK', () => {
                const response = new Response('OK', { status: 200 });
                expect(isCacheable(response)).toBe(true);
            });

            it('returns true for 201 Created', () => {
                const response = new Response('Created', { status: 201 });
                expect(isCacheable(response)).toBe(true);
            });

            it('returns true for 204 No Content', () => {
                const response = new Response(null, { status: 204 });
                expect(isCacheable(response)).toBe(true);
            });
        });

        describe('Bug #10 regression: Non-cacheable redirect status codes', () => {
            it('returns false for 301 Moved Permanently', () => {
                const response = new Response('Moved', { status: 301 });
                expect(isCacheable(response)).toBe(false);
            });

            it('returns false for 302 Found', () => {
                const response = new Response('Found', { status: 302 });
                expect(isCacheable(response)).toBe(false);
            });

            it('returns false for 304 Not Modified', () => {
                const response = new Response(null, { status: 304 });
                expect(isCacheable(response)).toBe(false);
            });

            it('returns false for 307 Temporary Redirect', () => {
                const response = new Response('Redirect', { status: 307 });
                expect(isCacheable(response)).toBe(false);
            });

            it('returns false for 308 Permanent Redirect', () => {
                const response = new Response('Redirect', { status: 308 });
                expect(isCacheable(response)).toBe(false);
            });
        });

        describe('Error status codes', () => {
            it('returns false for 400 Bad Request', () => {
                const response = new Response('Bad Request', { status: 400 });
                expect(isCacheable(response)).toBe(false);
            });

            it('returns false for 404 Not Found', () => {
                const response = new Response('Not Found', { status: 404 });
                expect(isCacheable(response)).toBe(false);
            });

            it('returns false for 403 Forbidden', () => {
                const response = new Response('Forbidden', { status: 403 });
                expect(isCacheable(response)).toBe(false);
            });

            it('returns false for 500 Internal Server Error', () => {
                const response = new Response('Error', { status: 500 });
                expect(isCacheable(response)).toBe(false);
            });

            it('returns false for 502 Bad Gateway', () => {
                const response = new Response('Bad Gateway', { status: 502 });
                expect(isCacheable(response)).toBe(false);
            });

            it('returns false for 503 Service Unavailable', () => {
                const response = new Response('Unavailable', { status: 503 });
                expect(isCacheable(response)).toBe(false);
            });
        });

        describe('Cache-Control header', () => {
            it('returns false when cache-control: no-store is present', () => {
                const response = new Response('OK', {
                    status: 200,
                    headers: { 'cache-control': 'no-store' },
                });
                expect(isCacheable(response)).toBe(false);
            });

            it('returns false when cache-control includes no-store with other directives', () => {
                const response = new Response('OK', {
                    status: 200,
                    headers: { 'cache-control': 'max-age=3600, no-store' },
                });
                expect(isCacheable(response)).toBe(false);
            });

            it('returns true when cache-control: max-age is present', () => {
                const response = new Response('OK', {
                    status: 200,
                    headers: { 'cache-control': 'max-age=3600' },
                });
                expect(isCacheable(response)).toBe(true);
            });

            it('returns true when no cache-control header', () => {
                const response = new Response('OK', { status: 200 });
                expect(isCacheable(response)).toBe(true);
            });
        });
    });

    describe('cloneResponse', () => {
        it('clones a response successfully', async () => {
            const original = new Response('test data', { status: 200 });
            const cloned = await cloneResponse(original);

            expect(cloned).toBeInstanceOf(Response);
            expect(cloned.status).toBe(200);

            // Both should be readable
            const originalText = await original.text();
            const clonedText = await cloned.text();

            expect(originalText).toBe('test data');
            expect(clonedText).toBe('test data');
        });

        it('preserves response headers', async () => {
            const original = new Response('test', {
                status: 200,
                headers: { 'content-type': 'application/json', 'x-custom': 'value' },
            });
            const cloned = await cloneResponse(original);

            expect(cloned.headers.get('content-type')).toBe('application/json');
            expect(cloned.headers.get('x-custom')).toBe('value');
        });

        it('preserves response status and statusText', async () => {
            const original = new Response('created', {
                status: 201,
                statusText: 'Created',
            });
            const cloned = await cloneResponse(original);

            expect(cloned.status).toBe(201);
            expect(cloned.statusText).toBe('Created');
        });
    });
});
