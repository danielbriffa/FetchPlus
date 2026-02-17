/**
 * Cache sync event types
 */
export type CacheSyncEventType = 'set' | 'delete' | 'clear';

/**
 * Cache sync message
 */
export interface CacheSyncMessage {
    type: CacheSyncEventType;
    key?: string;
    timestamp: number;
}

/**
 * Manages cache synchronization across browser tabs using BroadcastChannel
 */
export class CacheSyncManager {
    private channel: BroadcastChannel | null = null;
    private channelName: string;
    private listeners: Map<string, (message: CacheSyncMessage) => void> = new Map();

    constructor(channelName: string = 'fetchplus-sync') {
        this.channelName = channelName;
        this.initChannel();
    }

    /**
     * Initialize BroadcastChannel if available
     */
    private initChannel(): void {
        if (typeof BroadcastChannel === 'undefined') {
            console.warn('BroadcastChannel not available. Cross-tab sync disabled.');
            return;
        }

        try {
            this.channel = new BroadcastChannel(this.channelName);

            this.channel.onmessage = (event: MessageEvent<CacheSyncMessage>) => {
                const message = event.data;

                // Notify all listeners
                this.listeners.forEach((listener) => {
                    try {
                        listener(message);
                    } catch (error) {
                        console.error('Cache sync listener error:', error);
                    }
                });
            };
        } catch (error) {
            console.warn('Failed to create BroadcastChannel:', error);
        }
    }

    /**
     * Broadcast a cache event to other tabs
     */
    broadcast(type: CacheSyncEventType, key?: string): void {
        if (!this.channel) {
            return;
        }

        const message: CacheSyncMessage = {
            type,
            key,
            timestamp: Date.now(),
        };

        try {
            this.channel.postMessage(message);
        } catch (error) {
            console.error('Failed to broadcast cache sync:', error);
        }
    }

    /**
     * Add a listener for cache sync events
     */
    addListener(id: string, callback: (message: CacheSyncMessage) => void): void {
        this.listeners.set(id, callback);
    }

    /**
     * Remove a listener
     */
    removeListener(id: string): void {
        this.listeners.delete(id);
    }

    /**
     * Check if sync is available
     */
    isAvailable(): boolean {
        return this.channel !== null;
    }

    /**
     * Close the channel
     */
    close(): void {
        if (this.channel) {
            this.channel.close();
            this.channel = null;
        }
        this.listeners.clear();
    }
}
