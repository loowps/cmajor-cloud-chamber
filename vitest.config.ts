import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      /// The e2e specs are Playwright's and share the .spec.ts suffix, so vitest would otherwise
      /// pick them up and fail on an import it has no runner for.
      exclude: [...configDefaults.exclude, 'e2e/*'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      setupFiles: [fileURLToPath(new URL('./src/test/setup.ts', import.meta.url))],
      coverage: {
        provider: 'v8',
        /// The text table leaves out any file that is fully covered, so a file missing from it is
        /// a file at 100% rather than one nobody has tested. json-summary is the complete list.
        reporter: ['text', 'html', 'json-summary'],
        include: ['src/**/*.{ts,vue}'],
        exclude: ['src/dev/**', 'src/main.ts', 'src/fonts.ts', 'src/test/**', 'src/**/__tests__/**']
      }
    }
  })
)
