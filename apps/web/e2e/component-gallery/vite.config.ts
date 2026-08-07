import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const galleryRoot = __dirname
const repositoryRoot = resolve(galleryRoot, '../../../..')

export default defineConfig({
  root: galleryRoot,
  clearScreen: false,
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1',
    port: 4317,
    strictPort: true,
    cors: false,
    fs: {
      strict: true,
      allow: [repositoryRoot],
    },
  },
})
