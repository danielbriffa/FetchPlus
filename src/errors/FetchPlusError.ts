/**
 * Base error class for FetchPlus errors
 */
export class FetchPlusError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'FetchPlusError';
    Object.setPrototypeOf(this, FetchPlusError.prototype);
  }
}
