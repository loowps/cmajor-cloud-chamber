import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    cssCodeSplit: false,
    minify: false,
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      input: 'src/main.ts',
      output: {
        entryFileNames: `main.js`,
        assetFileNames: `assets/[name][extname]`
      }
    }
  },
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
