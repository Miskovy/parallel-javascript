import js from '@eslint/js';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['**/*.mjs', '**/*.ts'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        SharedArrayBuffer: 'readonly',
        Atomics: 'readonly',
        structuredClone: 'readonly',
      },
    },
  },
);
