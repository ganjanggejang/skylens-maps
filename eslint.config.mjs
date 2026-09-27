import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  {
    ignores: ['dist/**', 'public/data/**', 'artifacts/**', 'exported_files/**'],
  },
  {
    files: ['src/**/*.{ts,tsx,mjs}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.worker, ...globals.node },
    },
  },
  {
    files: ['src/**/*.tsx'],
    extends: [react.configs.flat.recommended, react.configs.flat['jsx-runtime'], reactHooks.configs.flat.recommended],
    settings: { react: { version: 'detect' } },
  },
])
