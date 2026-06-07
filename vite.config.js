import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/we_love_merwan/', // This tells Vite we are in a GitHub Pages subfolder!
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  }
})