import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/app/',
  plugins: [react()],
  server: {
    // Use IPv4 explicitly because localhost may resolve to ::1 while the
    // development backend is bound to 127.0.0.1.
    proxy: {
      '/auth':             'http://127.0.0.1:8000',
      '/processing':       'http://127.0.0.1:8000',
      '/criteria':         'http://127.0.0.1:8000',
      '/finance_accounts': 'http://127.0.0.1:8000',
      '/export_documents': 'http://127.0.0.1:8000',
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
})
