import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist/**',
    'android/**/build/**',
    'bank-el7az-original/**',
    'shakhbata-original/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // These React 19 compiler-oriented checks are useful migration signals,
      // but the app does not currently use the React Compiler. Keep them visible
      // without making ordinary linting fail on existing event/effect patterns.
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      // Context/hooks and shadcn modules intentionally co-export helpers.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
])
