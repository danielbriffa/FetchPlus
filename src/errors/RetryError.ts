import { FetchPlusError } from './FetchPlusError.js';

/**
 * Error thrown when all retry attempts are exhausted
 */
export class RetryError extends FetchPlusError {
  constructor(
    message: string,
    public attempts: number,
    public lastError: Error,
    public totalDelay: number
  ) {
    super(message, lastError);
    this.name = 'RetryError';
    Object.setPrototypeOf(this, RetryError.prototype);
  }
}
