import { describe, it, expect } from 'vitest';
import { safeJSONParse } from '../../src/utils/safeJSON.js';

describe('safeJSONParse', () => {
    describe('Valid JSON Parsing', () => {
        it('parses valid JSON objects correctly', () => {
            const json = '{"name": "test", "value": 123}';
            const result = safeJSONParse<{ name: string; value: number }>(json);

            expect(result).not.toBeNull();
            expect(result?.name).toBe('test');
            expect(result?.value).toBe(123);
        });

        it('parses valid JSON arrays correctly', () => {
            const json = '[1, 2, 3, "four"]';
            const result = safeJSONParse<(number | string)[]>(json);

            expect(result).not.toBeNull();
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual([1, 2, 3, 'four']);
        });

        it('parses valid JSON string primitives', () => {
            const json = '"hello"';
            const result = safeJSONParse<string>(json);

            expect(result).toBe('hello');
        });

        it('parses valid JSON number primitives', () => {
            const json = '42';
            const result = safeJSONParse<number>(json);

            expect(result).toBe(42);
        });

        it('parses valid JSON boolean primitives', () => {
            const jsonTrue = 'true';
            const jsonFalse = 'false';

            expect(safeJSONParse<boolean>(jsonTrue)).toBe(true);
            expect(safeJSONParse<boolean>(jsonFalse)).toBe(false);
        });

        it('parses valid JSON null', () => {
            const json = 'null';
            const result = safeJSONParse<null>(json);

            expect(result).toBeNull();
        });

        it('parses deeply nested valid objects', () => {
            const json = '{"a": {"b": {"c": {"d": "value"}}}}';
            const result = safeJSONParse<any>(json);

            expect(result?.a?.b?.c?.d).toBe('value');
        });

        it('parses objects with numeric keys', () => {
            const json = '{"1": "one", "2": "two"}';
            const result = safeJSONParse<Record<string, string>>(json);

            expect(result?.['1']).toBe('one');
            expect(result?.['2']).toBe('two');
        });
    });

    describe('Invalid JSON Handling', () => {
        it('returns null for invalid JSON strings', () => {
            const json = '{invalid json}';
            const result = safeJSONParse(json);

            expect(result).toBeNull();
        });

        it('returns null for malformed JSON', () => {
            const json = '{"name": "test"';
            const result = safeJSONParse(json);

            expect(result).toBeNull();
        });

        it('returns null for empty string', () => {
            const json = '';
            const result = safeJSONParse(json);

            expect(result).toBeNull();
        });

        it('returns null for whitespace only', () => {
            const json = '   ';
            const result = safeJSONParse(json);

            expect(result).toBeNull();
        });

        it('returns null for undefined in string', () => {
            const json = 'undefined';
            const result = safeJSONParse(json);

            expect(result).toBeNull();
        });

        it('returns null for NaN in string', () => {
            const json = 'NaN';
            const result = safeJSONParse(json);

            expect(result).toBeNull();
        });

        it('returns null for single quotes (not valid JSON)', () => {
            const json = "{'name': 'test'}";
            const result = safeJSONParse(json);

            expect(result).toBeNull();
        });
    });

    describe('Security: Prototype Pollution Rejection', () => {
        it('rejects objects with __proto__ as own property', () => {
            const json = '{"__proto__": {"admin": true}, "name": "test"}';
            const result = safeJSONParse<any>(json);

            expect(result).toBeNull();
        });

        it('rejects objects with constructor as own property', () => {
            const json = '{"constructor": {"prototype": {"admin": true}}, "name": "test"}';
            const result = safeJSONParse<any>(json);

            expect(result).toBeNull();
        });

        it('rejects objects with prototype as own property', () => {
            const json = '{"prototype": {"admin": true}, "name": "test"}';
            const result = safeJSONParse<any>(json);

            expect(result).toBeNull();
        });

        it('accepts objects that do NOT have dangerous properties', () => {
            const json = '{"name": "test", "value": 123, "safe": true}';
            const result = safeJSONParse<any>(json);

            expect(result).not.toBeNull();
            expect(result?.name).toBe('test');
            expect(result?.value).toBe(123);
            expect(result?.safe).toBe(true);
        });

        it('accepts objects with properties that have similar names', () => {
            const json = '{"__prototest": "ok", "constructorFn": "ok", "prototypeId": "ok"}';
            const result = safeJSONParse<any>(json);

            expect(result).not.toBeNull();
            expect(result?.__prototest).toBe('ok');
            expect(result?.constructorFn).toBe('ok');
            expect(result?.prototypeId).toBe('ok');
        });

        it('rejects only when dangerous property is TOP-LEVEL own property', () => {
            // Nested __proto__ should be fine - we only check top-level object properties
            const json = '{"data": {"__proto__": {"admin": true}}, "name": "test"}';
            const result = safeJSONParse<any>(json);

            // The top-level object doesn't have __proto__ as own property, so it should be accepted
            expect(result).not.toBeNull();
            expect(result?.name).toBe('test');
        });

        it('arrays with dangerous properties in objects should be accepted', () => {
            // Arrays themselves are not checked for dangerous properties
            const json = '[{"name": "item1"}, {"name": "item2"}]';
            const result = safeJSONParse<any>(json);

            expect(Array.isArray(result)).toBe(true);
            expect(result?.length).toBe(2);
        });

        it('arrays are allowed regardless of nested dangerous-looking names', () => {
            // Arrays bypass the dangerous property check entirely
            const json = '[{"__proto__": "test"}]';
            const result = safeJSONParse<any>(json);

            expect(Array.isArray(result)).toBe(true);
            expect(result?.[0]?.__proto__).toBe('test');
        });

        it('multiple dangerous properties together are rejected', () => {
            const json = '{"__proto__": {}, "constructor": {}, "name": "test"}';
            const result = safeJSONParse<any>(json);

            expect(result).toBeNull();
        });

        it('dangerous property with null value is still rejected', () => {
            const json = '{"__proto__": null, "name": "test"}';
            const result = safeJSONParse<any>(json);

            expect(result).toBeNull();
        });

        it('dangerous property with empty object is still rejected', () => {
            const json = '{"constructor": {}, "name": "test"}';
            const result = safeJSONParse<any>(json);

            expect(result).toBeNull();
        });
    });

    describe('Edge Cases', () => {
        it('handles objects with numeric properties', () => {
            const json = '{"1": "one", "2": "two", "name": "test"}';
            const result = safeJSONParse<any>(json);

            expect(result).not.toBeNull();
            expect(result?.['1']).toBe('one');
            expect(result?.name).toBe('test');
        });

        it('handles objects with special characters in property names', () => {
            const json = '{"name-with-dash": "value", "name.with.dot": "value2"}';
            const result = safeJSONParse<any>(json);

            expect(result).not.toBeNull();
            expect(result?.['name-with-dash']).toBe('value');
        });

        it('handles objects with unicode properties', () => {
            const json = '{"名前": "テスト", "emoji🎉": "party"}';
            const result = safeJSONParse<any>(json);

            expect(result).not.toBeNull();
            expect(result?.['名前']).toBe('テスト');
        });

        it('handles empty object', () => {
            const json = '{}';
            const result = safeJSONParse<any>(json);

            expect(result).not.toBeNull();
            expect(Object.keys(result || {}).length).toBe(0);
        });

        it('handles empty array', () => {
            const json = '[]';
            const result = safeJSONParse<any>(json);

            expect(Array.isArray(result)).toBe(true);
            expect(result?.length).toBe(0);
        });

        it('handles large objects safely', () => {
            const largeObj: Record<string, string> = {};
            for (let i = 0; i < 1000; i++) {
                largeObj[`key${i}`] = `value${i}`;
            }
            const json = JSON.stringify(largeObj);
            const result = safeJSONParse<Record<string, string>>(json);

            expect(result).not.toBeNull();
            expect(result?.key0).toBe('value0');
            expect(result?.key999).toBe('value999');
        });

        it('handles objects with boolean values', () => {
            const json = '{"active": true, "deleted": false}';
            const result = safeJSONParse<any>(json);

            expect(result).not.toBeNull();
            expect(result?.active).toBe(true);
            expect(result?.deleted).toBe(false);
        });

        it('handles mixed types in object values', () => {
            const json = '{"str": "test", "num": 42, "bool": true, "arr": [1,2,3], "obj": {"nested": "value"}}';
            const result = safeJSONParse<any>(json);

            expect(result).not.toBeNull();
            expect(result?.str).toBe('test');
            expect(result?.num).toBe(42);
            expect(result?.bool).toBe(true);
            expect(Array.isArray(result?.arr)).toBe(true);
            expect(result?.obj?.nested).toBe('value');
        });

        it('handles very long strings', () => {
            const longStr = 'a'.repeat(10000);
            const json = `{"data": "${longStr}"}`;
            const result = safeJSONParse<any>(json);

            expect(result).not.toBeNull();
            expect(result?.data?.length).toBe(10000);
        });
    });

    describe('Type Safety', () => {
        it('returns typed result for valid JSON with generic', () => {
            interface TestType {
                name: string;
                age: number;
            }

            const json = '{"name": "John", "age": 30}';
            const result = safeJSONParse<TestType>(json);

            // TypeScript should allow these accesses without errors
            expect(result?.name).toBe('John');
            expect(result?.age).toBe(30);
        });

        it('returns correct type for primitives', () => {
            const strResult = safeJSONParse<string>('"test"');
            const numResult = safeJSONParse<number>('123');
            const boolResult = safeJSONParse<boolean>('true');
            const arrResult = safeJSONParse<number[]>('[1,2,3]');

            expect(typeof strResult).toBe('string');
            expect(typeof numResult).toBe('number');
            expect(typeof boolResult).toBe('boolean');
            expect(Array.isArray(arrResult)).toBe(true);
        });
    });

    describe('Real-world Scenarios', () => {
        it('handles typical API response JSON', () => {
            const json = '{"status": "success", "data": {"id": 1, "name": "Item"}, "timestamp": "2024-01-01T00:00:00Z"}';
            const result = safeJSONParse<any>(json);

            expect(result).not.toBeNull();
            expect(result?.status).toBe('success');
            expect(result?.data?.id).toBe(1);
            expect(result?.timestamp).toContain('2024');
        });

        it('handles cache entry metadata', () => {
            const json = '{"cachedAt": 1234567890, "revalidating": false}';
            const result = safeJSONParse<any>(json);

            expect(result).not.toBeNull();
            expect(result?.cachedAt).toBe(1234567890);
            expect(result?.revalidating).toBe(false);
        });

        it('rejects poisoned cache data with prototype pollution attempt', () => {
            const poisonedJson = '{"cachedAt": 1234567890, "__proto__": {"admin": true}}';
            const result = safeJSONParse<any>(poisonedJson);

            expect(result).toBeNull();
        });

        it('handles config objects safely', () => {
            const json = '{"apiUrl": "https://api.example.com", "timeout": 5000, "retryCount": 3, "enabled": true}';
            const result = safeJSONParse<any>(json);

            expect(result).not.toBeNull();
            expect(result?.apiUrl).toBe('https://api.example.com');
            expect(result?.timeout).toBe(5000);
        });
    });
});
