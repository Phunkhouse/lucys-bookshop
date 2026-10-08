import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  {
    files: ['src/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'next', message: 'src/server must not import from Next.' },
            { name: 'react', message: 'src/server must not import React.' },
            { name: 'react-dom', message: 'src/server must not import React.' },
          ],
          patterns: [
            {
              group: ['next/**', 'react/**', 'react-dom/**'],
              message:
                'src/server must stay framework-free (no next or react imports).',
            },
            {
              group: ['@/app/**', '@/components/**'],
              message: 'src/server must not depend on the UI layers.',
            },
          ],
        },
      ],
    },
  },
])

export default eslintConfig
