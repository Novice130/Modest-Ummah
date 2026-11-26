import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Pre-existing findings kept visible but not blocking. Everything else in
    // the Next and React Hooks presets, such as rules-of-hooks, stays an error.
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      // Mostly the `mounted` hydration pattern: an extra render, not a wrong one.
      'react-hooks/set-state-in-effect': 'warn',
      // A full page load instead of a client transition. global-error.tsx needs one.
      '@next/next/no-html-link-for-pages': 'warn',
    },
  },
  {
    // CommonJS config files loaded by Next and next-sitemap.
    files: ['*.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    'public/**',
    'Photos/**',
    // Dart/Python projects, and agent worktrees holding whole repo copies.
    'mobile/**',
    'loadtest/**',
    '.claude/**',
    '.commandcode/**',
    // Playwright output.
    'playwright-report/**',
    'test-results/**',
  ]),
]);
