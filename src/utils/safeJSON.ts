/**
 * Safely parse JSON, rejecting objects with prototype pollution vectors
 */
export function safeJSONParse<T>(json: string): T | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Check for own properties that could cause prototype pollution
      if (Object.prototype.hasOwnProperty.call(parsed, '__proto__') ||
          Object.prototype.hasOwnProperty.call(parsed, 'constructor') ||
          Object.prototype.hasOwnProperty.call(parsed, 'prototype')) {
        return null;
      }
    }
    return parsed as T;
  } catch {
    return null;
  }
}
