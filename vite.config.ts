import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// All JavaScript build output lives under the repository's dist directory.
export default defineConfig({
  root: 'app',
  plugins: [react()],
  clearScreen: false,
  cacheDir: '../node_modules/.vite',
  server: {
    port: 1421,
    strictPort: true,
    fs: { allow: ['..'] },
    watch: { ignored: ['**/src-tauri/**'] },
  },
  // Clear only frontend output; backend and packaged resources are siblings.
  build: { outDir: '../dist/frontend', emptyOutDir: true },
})
