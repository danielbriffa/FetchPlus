import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheSyncManager } from '../../src/sync/CacheSyncManager.js';
import type { CacheSyncMessage } from '../../src/sync/CacheSyncManager.js';

describe('CacheSyncManager', () => {
    let syncManager: CacheSyncManager;

    beforeEach(() => {
        syncManager = new CacheSyncManager('test-channel');
    });

    afterEach(() => {
        syncManager.close();
    });

    describe('Initialization', () => {
        it('initializes with BroadcastChannel', () => {
            expect(syncManager.isAvailable()).toBe(true);
        });

        it('uses custom channel name', () => {
            const customSync = new CacheSyncManager('custom-channel-name');
            expect(customSync.isAvailable()).toBe(true);
            customSync.close();
        });
    });

    describe('Broadcasting', () => {
        it('broadcasts set message', () => {
            const postMessageSpy = vi.spyOn(BroadcastChannel.prototype, 'postMessage');

            syncManager.broadcast('set', 'test-key');

            expect(postMessageSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'set',
                    key: 'test-key',
                    timestamp: expect.any(Number),
                })
            );

            postMessageSpy.mockRestore();
        });

        it('broadcasts delete message', () => {
            const postMessageSpy = vi.spyOn(BroadcastChannel.prototype, 'postMessage');

            syncManager.broadcast('delete', 'test-key');

            expect(postMessageSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'delete',
                    key: 'test-key',
                    timestamp: expect.any(Number),
                })
            );

            postMessageSpy.mockRestore();
        });

        it('broadcasts clear message', () => {
            const postMessageSpy = vi.spyOn(BroadcastChannel.prototype, 'postMessage');

            syncManager.broadcast('clear');

            expect(postMessageSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'clear',
                    timestamp: expect.any(Number),
                })
            );

            postMessageSpy.mockRestore();
        });
    });

    describe('Listeners', () => {
        it('adds and receives messages through listener', (done) => {
            const listener = vi.fn((message: CacheSyncMessage) => {
                expect(message.type).toBe('set');
                expect(message.key).toBe('test-key');
                done();
            });

            syncManager.addListener('test-listener', listener);

            // Simulate receiving a message
            const channel = (syncManager as any).channel as BroadcastChannel;
            if (channel && channel.onmessage) {
                channel.onmessage(
                    new MessageEvent('message', {
                        data: { type: 'set', key: 'test-key', timestamp: Date.now() },
                    })
                );
            }
        });

        it('removes listener', () => {
            const listener = vi.fn();
            syncManager.addListener('test-listener', listener);

            syncManager.removeListener('test-listener');

            // Simulate receiving a message
            const channel = (syncManager as any).channel as BroadcastChannel;
            if (channel && channel.onmessage) {
                channel.onmessage(
                    new MessageEvent('message', {
                        data: { type: 'set', key: 'test-key', timestamp: Date.now() },
                    })
                );
            }

            expect(listener).not.toHaveBeenCalled();
        });

        it('multiple listeners receive the same message', () => {
            const listener1 = vi.fn();
            const listener2 = vi.fn();

            syncManager.addListener('listener1', listener1);
            syncManager.addListener('listener2', listener2);

            // Simulate receiving a message
            const channel = (syncManager as any).channel as BroadcastChannel;
            if (channel && channel.onmessage) {
                channel.onmessage(
                    new MessageEvent('message', {
                        data: { type: 'delete', key: 'test-key', timestamp: Date.now() },
                    })
                );
            }

            expect(listener1).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'delete',
                    key: 'test-key',
                })
            );
            expect(listener2).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'delete',
                    key: 'test-key',
                })
            );
        });
    });

    describe('Close', () => {
        it('closes the BroadcastChannel', () => {
            const closeSpy = vi.spyOn(BroadcastChannel.prototype, 'close');

            syncManager.close();

            expect(closeSpy).toHaveBeenCalled();
            expect(syncManager.isAvailable()).toBe(false);

            closeSpy.mockRestore();
        });

        it('clears all listeners on close', () => {
            const listener = vi.fn();
            syncManager.addListener('test', listener);

            syncManager.close();

            // Verify listeners map is cleared
            expect((syncManager as any).listeners.size).toBe(0);
        });
    });

    describe('Graceful degradation when BroadcastChannel unavailable', () => {
        it('handles missing BroadcastChannel gracefully', () => {
            const savedBC = globalThis.BroadcastChannel;
            // @ts-ignore - testing runtime behavior
            delete globalThis.BroadcastChannel;

            const manager = new CacheSyncManager('test');

            expect(manager.isAvailable()).toBe(false);

            // Should not throw
            expect(() => manager.broadcast('set', 'key')).not.toThrow();
            expect(() => manager.addListener('test', () => {})).not.toThrow();
            expect(() => manager.close()).not.toThrow();

            // Restore BroadcastChannel
            globalThis.BroadcastChannel = savedBC;
        });
    });
});
