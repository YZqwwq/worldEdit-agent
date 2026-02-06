import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import prettier from 'eslint-plugin-prettier'

export default defineConfig({
  ignores: ['**/node_modules/**', '**/out/**', '**/dist/**', '**/.electron-vite/**'],
  files: ['src/**/*.{ts,tsx,js,jsx}'],
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  plugins: {
    '@typescript-eslint': tseslint.plugin,
    prettier
  },
  rules: {}
})
