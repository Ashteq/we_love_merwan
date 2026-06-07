import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  // Use the subfolder path ONLY when deploying (building), use root '/' for local dev!
  base: command === 'build' ? '/we_love_merwan/' : '/', 
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  }
}))
