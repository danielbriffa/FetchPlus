import { describe, it, expect } from 'vitest';
import { generateCacheKey } from '../../src/utils/cacheKey.js';

describe('cacheKey', () => {
    describe('generateCacheKey', () => {
        it('generates key from string URL', () => {
            const key = generateCacheKey('https://api.example.com/data');
            expect(key).toBe('GET:https://api.example.com/data');
        });

        it('generates key from URL object', () => {
            const url = new URL('https://api.example.com/data');
            const key = generateCacheKey(url);
            expect(key).toBe('GET:https://api.example.com/data');
        });

        it('generates key from Request object', () => {
            const request = new Request('https://api.example.com/data');
            const key = generateCacheKey(request);
            expect(key).toBe('GET:https://api.example.com/data');
        });

        describe('Bug #5 regression: Method affects cache key', () => {
            it('uses Request object method when no init.method provided', () => {
                const getRequest = new Request('https://api.example.com/data', { method: 'GET' });
                const postRequest = new Request('https://api.example.com/data', { method: 'POST' });

                const getKey = generateCacheKey(getRequest);
                const postKey = generateCacheKey(postRequest);

                expect(getKey).toBe('GET:https://api.example.com/data');
                expect(postKey).toBe('POST:https://api.example.com/data');
                expect(getKey).not.toBe(postKey);
            });

            it('init.method overrides Request object method', () => {
                const request = new Request('https://api.example.com/data', { method: 'POST' });
                const key = generateCacheKey(request, { method: 'PUT' });
                expect(key).toBe('PUT:https://api.example.com/data');
            });

            it('GET and POST to same URL produce different keys', () => {
                const url = 'https://api.example.com/data';
                const getKey = generateCacheKey(url, { method: 'GET' });
                const postKey = generateCacheKey(url, { method: 'POST' });

                expect(getKey).toBe('GET:https://api.example.com/data');
                expect(postKey).toBe('POST:https://api.example.com/data');
                expect(getKey).not.toBe(postKey);
            });
        });

        describe('Query parameter normalization', () => {
            it('sorts query parameters for consistent keys', () => {
                const key1 = generateCacheKey('https://api.example.com/data?b=2&a=1');
                const key2 = generateCacheKey('https://api.example.com/data?a=1&b=2');
                expect(key1).toBe(key2);
            });

            it('handles multiple parameters correctly', () => {
                const key1 = generateCacheKey('https://api.example.com/data?z=3&a=1&m=2');
                const key2 = generateCacheKey('https://api.example.com/data?a=1&m=2&z=3');
                expect(key1).toBe(key2);
            });
        });

        describe('Trailing slash normalization', () => {
            it('removes trailing slash from pathname', () => {
                const key1 = generateCacheKey('https://api.example.com/data/');
                const key2 = generateCacheKey('https://api.example.com/data');
                expect(key1).toBe(key2);
            });

            it('preserves root path trailing slash', () => {
                const key = generateCacheKey('https://api.example.com/');
                expect(key).toBe('GET:https://api.example.com/');
            });

            it('handles nested paths with trailing slashes', () => {
                const key1 = generateCacheKey('https://api.example.com/api/v1/users/');
                const key2 = generateCacheKey('https://api.example.com/api/v1/users');
                expect(key1).toBe(key2);
            });
        });

        describe('Relative URL fallback', () => {
            it('uses relative URL as-is when URL parsing fails', () => {
                const relativeUrl = '/api/data';
                const key = generateCacheKey(relativeUrl);
                expect(key).toBe('GET:/api/data');
            });
        });

        it('handles method case insensitivity', () => {
            const key1 = generateCacheKey('https://api.example.com/data', { method: 'post' });
            const key2 = generateCacheKey('https://api.example.com/data', { method: 'POST' });
            expect(key1).toBe(key2);
            expect(key1).toBe('POST:https://api.example.com/data');
        });
    });
});
