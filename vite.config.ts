import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'FetchPlus',
            formats: ['es', 'cjs'],
            fileName: (format: string) => `index.${format === 'es' ? 'js' : 'cjs'}`,
        },
        rollupOptions: {
            external: [],
            output: {
                globals: {},
                exports: 'named',
                compact: true,
            },
        },
        sourcemap: true,
        minify: 'terser',
        target: 'es2020',
        terserOptions: {
            compress: {
                drop_console: false,
                drop_debugger: true,
                pure_funcs: ['console.debug'],
                passes: 3,
                ecma: 2020,
                module: true,
                toplevel: true,
            },
            mangle: {
                toplevel: true,
                properties: false,
            },
            format: {
                comments: false,
                beautify: false,
                ecma: 2020,
                preamble: '/* FetchPlus */',
            },
            ecma: 2020,
            module: true,
            toplevel: true,
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './tests/setup.ts',
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/types/**'],
            reporter: ['text', 'text-summary', 'html'],
            reportsDirectory: './coverage',
        },
    },
});
