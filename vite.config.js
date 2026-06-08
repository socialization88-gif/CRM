import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.VITE_API_BASE_URL || `http://localhost:${process.env.VITE_API_PORT || process.env.PORT || 3231}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/autosuggestion-source': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/task-report-feedback-source': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
