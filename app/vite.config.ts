import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // must match the "Pelagic Web" OAuth client origin
    strictPort: true,
    // dev gallery pages import sample covers from ../design_handoff_pelagic/art
    fs: { allow: ['..'] },
  },
})
