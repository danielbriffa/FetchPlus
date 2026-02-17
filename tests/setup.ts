/**
 * Test setup file for vitest
 * Configures global test environment
 */

// Mock browser APIs that jsdom doesn't provide
if (typeof BroadcastChannel === 'undefined') {
    global.BroadcastChannel = class BroadcastChannel {
        name: string;
        onmessage: ((event: MessageEvent) => void) | null = null;

        constructor(name: string) {
            this.name = name;
        }

        postMessage(_message: any): void {
            // No-op in tests unless explicitly mocked
        }

        close(): void {
            // No-op
        }
    } as any;
}
