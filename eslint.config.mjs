import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

const genericTypeScriptFiles = [
  'apps/api/src/**/*.{ts,tsx}',
  'packages/ai/src/**/*.{ts,tsx}',
  'packages/auth/src/**/*.{ts,tsx}',
  'packages/database/src/**/*.{ts,tsx}',
  'packages/shared-types/src/**/*.{ts,tsx}',
]

const webFiles = ['apps/web/src/**/*.{js,mjs,cjs,ts,tsx}']
const lintedFiles = [...genericTypeScriptFiles, ...webFiles]

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

const nextConfigs = compat.config({
  extends: ['next/core-web-vitals', 'next/typescript'],
  settings: {
    next: {
      rootDir: 'apps/web',
    },
  },
})

function scope(configs, files) {
  return configs.map((config) => ({ ...config, files }))
}

export default [
  {
    ignores: [
      '**/.next/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/*.{spec,test}.{js,mjs,cjs,ts,tsx}',
      '**/test-results/**',
    ],
  },
  {
    ...js.configs.recommended,
    files: genericTypeScriptFiles,
    rules: {
      ...js.configs.recommended.rules,
      // TypeScript resolves declared globals and types more accurately than
      // ESLint's JavaScript-only no-undef rule.
      'no-undef': 'off',
    },
  },
  ...scope(tseslint.configs.recommended, genericTypeScriptFiles),
  ...scope(nextConfigs, webFiles),
  {
    files: lintedFiles,
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
]
