import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          regression: resolve('src/main/regression/run.ts'),
          smoke: resolve('src/main/regression/smoke.ts'),
          playback: resolve('src/main/scenario/run.ts'),
          'playback-verify': resolve('src/main/scenario/verify.ts'),
          'record-verify': resolve('src/main/record/verify.ts'),
          verify: resolve('src/main/verify.ts'),
          'data-verify': resolve('src/main/data/verify.ts')
        }
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
