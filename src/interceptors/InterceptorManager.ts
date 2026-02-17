import type {
    RequestInterceptor,
    ResponseInterceptor,
    ErrorInterceptor,
    InterceptorId,
} from '../types/index.js';

interface Interceptor<T> {
    id: number;
    handler: T;
}

/**
 * Manages interceptor chains for requests, responses, and errors
 */
export class InterceptorManager {
    private requestInterceptors: Interceptor<RequestInterceptor>[] = [];
    private responseInterceptors: Interceptor<ResponseInterceptor>[] = [];
    private errorInterceptors: Interceptor<ErrorInterceptor>[] = [];
    private nextId = 0;

    /**
     * Add a request interceptor
     * @param handler Request interceptor function
     * @returns Interceptor ID for removal
     */
    addRequestInterceptor(handler: RequestInterceptor): InterceptorId {
        const id = this.nextId++;
        this.requestInterceptors.push({ id, handler });
        return id;
    }

    /**
     * Add a response interceptor
     * @param handler Response interceptor function
     * @returns Interceptor ID for removal
     */
    addResponseInterceptor(handler: ResponseInterceptor): InterceptorId {
        const id = this.nextId++;
        this.responseInterceptors.push({ id, handler });
        return id;
    }

    /**
     * Add an error interceptor
     * @param handler Error interceptor function
     * @returns Interceptor ID for removal
     */
    addErrorInterceptor(handler: ErrorInterceptor): InterceptorId {
        const id = this.nextId++;
        this.errorInterceptors.push({ id, handler });
        return id;
    }

    /**
     * Remove an interceptor by ID
     * @param id Interceptor ID
     * @returns true if removed, false if not found
     */
    removeInterceptor(id: InterceptorId): boolean {
        const reqIndex = this.requestInterceptors.findIndex((i) => i.id === id);
        if (reqIndex !== -1) {
            this.requestInterceptors.splice(reqIndex, 1);
            return true;
        }

        const resIndex = this.responseInterceptors.findIndex((i) => i.id === id);
        if (resIndex !== -1) {
            this.responseInterceptors.splice(resIndex, 1);
            return true;
        }

        const errIndex = this.errorInterceptors.findIndex((i) => i.id === id);
        if (errIndex !== -1) {
            this.errorInterceptors.splice(errIndex, 1);
            return true;
        }

        return false;
    }

    /**
     * Clear all interceptors
     */
    clearAll(): void {
        this.requestInterceptors = [];
        this.responseInterceptors = [];
        this.errorInterceptors = [];
    }

    /**
     * Execute request interceptor chain
     */
    async executeRequestInterceptors(
        input: RequestInfo | URL,
        init?: RequestInit
    ): Promise<{ input: RequestInfo | URL; init?: RequestInit }> {
        let currentInput = input;
        let currentInit = init;

        for (const interceptor of this.requestInterceptors) {
            try {
                const result = await interceptor.handler(currentInput, currentInit);

                // Support both returning modified input or an object with input/init
                if (
                    typeof result === 'object' &&
                    result !== null &&
                    !(result instanceof URL) &&
                    !(result instanceof Request) &&
                    'input' in result
                ) {
                    currentInput = result.input;
                    currentInit = result.init || currentInit;
                } else {
                    currentInput = result as RequestInfo | URL;
                }
            } catch (error) {
                console.error('Request interceptor error:', error);
                throw error;
            }
        }

        return { input: currentInput, init: currentInit };
    }

    /**
     * Execute response interceptor chain
     */
    async executeResponseInterceptors(response: Response): Promise<Response> {
        let currentResponse = response;

        for (const interceptor of this.responseInterceptors) {
            try {
                currentResponse = await interceptor.handler(currentResponse);
            } catch (error) {
                console.error('Response interceptor error:', error);
                throw error;
            }
        }

        return currentResponse;
    }

    /**
     * Execute error interceptor chain
     */
    async executeErrorInterceptors(error: Error): Promise<Response> {
        let currentError = error;

        for (const interceptor of this.errorInterceptors) {
            try {
                const result = await interceptor.handler(currentError);
                if (result instanceof Response) {
                    return result;
                }
            } catch (err) {
                console.error('Error interceptor failed:', err);
                currentError = err as Error;
            }
        }

        // If no interceptor handled the error, rethrow it
        throw currentError;
    }
}
