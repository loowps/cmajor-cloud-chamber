import eslint from '@eslint/js'
import eslintPluginVue from 'eslint-plugin-vue'
import eslintPluginPlaywright from 'eslint-plugin-playwright'
import typescriptEslint from 'typescript-eslint'

export default typescriptEslint.config(
  {
    ignores: ['**/*.d.ts', '**/coverage', '**/dist', '**/test-results', '**/playwright-report']
  },
  {
    extends: [
      eslint.configs.recommended,
      ...typescriptEslint.configs.recommended,
      ...eslintPluginVue.configs['flat/essential']
    ],
    files: ['**/*.{ts,vue,js,jsx,tsx,cjs,mjs,cts,mts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        parser: typescriptEslint.parser
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    ...eslintPluginPlaywright.configs['flat/recommended'],
    files: ['e2e/**/*.{test,spec}.{js,ts,jsx,tsx}']
  }
)
