import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // The backend mounts production assets at /app/. Keep local Vite development
  // at / so the normal http://localhost:5173/ entry does not 404.
  base: command === 'serve' ? '/' : '/app/',
  plugins: [react()],
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'lucide-react',
      'chart.js',
    ],
  },
  build: {
    minify: 'esbuild',
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          if (id.includes('node_modules/chart.js')) {
            return 'vendor-charts';
          }
        }
      }
    }
  },
  server: {
    // Use IPv4 explicitly because localhost may resolve to ::1 while the
    // development backend is bound to 127.0.0.1.
    proxy: {
      '/crm':              'http://127.0.0.1:8000',
      '/auth':             'http://127.0.0.1:8000',
      '/website-assets':   'http://127.0.0.1:8000',
      '/processing':       'http://127.0.0.1:8000',

      '/criteria':         'http://127.0.0.1:8000',
      '/finance_accounts': 'http://127.0.0.1:8000',
      '/export_documents': 'http://127.0.0.1:8000',
      '/data-management':  'http://127.0.0.1:8000',
      '/export':           'http://127.0.0.1:8000',
      '/attendance':       'http://127.0.0.1:8000',
      '/admin':            'http://127.0.0.1:8000',
      '/support':          'http://127.0.0.1:8000',
      '/reports':          'http://127.0.0.1:8000',
      '/api':              'http://127.0.0.1:8000',
      '/summary':          'http://127.0.0.1:8000',
      '/inventory':        'http://127.0.0.1:8000',
      '/general_stock':    'http://127.0.0.1:8000',
      '/static':           'http://127.0.0.1:8000',
      '/dashboard':        'http://127.0.0.1:8000',
      '/helpdesk':         'http://127.0.0.1:8000',
      '/menu':             'http://127.0.0.1:8000',
      '/home':             'http://127.0.0.1:8000',
    }
  }
}))
