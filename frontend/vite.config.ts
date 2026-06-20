import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 1112,
    proxy: {
      '/api': {
        target: 'http://localhost:1111',
        changeOrigin: true,
      },
      '/authorize': {
        target: 'http://localhost:1111',
        changeOrigin: true,
      },
      '/token': {
        target: 'http://localhost:1111',
        changeOrigin: true,
      },
      '/introspect': {
        target: 'http://localhost:1111',
        changeOrigin: true,
      },
      '/userinfo': {
        target: 'http://localhost:1111',
        changeOrigin: true,
      },
      '/device_authorization': {
        target: 'http://localhost:1111',
        changeOrigin: true,
      },
      '/.well-known': {
        target: 'http://localhost:1111',
        changeOrigin: true,
      },
    },
  },
})
