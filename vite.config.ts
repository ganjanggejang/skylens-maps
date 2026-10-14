import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: mode === 'mod' ? './' : '/',
  publicDir: mode === 'mod' ? false : 'public',
  plugins: [react()],
  optimizeDeps: { include: ['clipper-lib'], exclude: ['maplibre-gl'] },
}))
