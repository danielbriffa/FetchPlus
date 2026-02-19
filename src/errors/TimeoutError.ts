import { FetchPlusError } from './FetchPlusError.js';

/**
 * Error thrown when a request times out
 */
export class TimeoutError extends FetchPlusError {
  constructor(message: string, public timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}
