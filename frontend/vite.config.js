import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth':             'http://localhost:8000',
      '/processing':       'http://localhost:8000',
      '/criteria':         'http://localhost:8000',
      '/finance_accounts': 'http://localhost:8000',
      '/export_documents': 'http://localhost:8000',
      '/attendance':       'http://localhost:8000',
      '/admin':            'http://localhost:8000',
      '/reports':          'http://localhost:8000',
      '/api':              'http://localhost:8000',
      '/summary':          'http://localhost:8000',
      '/inventory':        'http://localhost:8000',
      '/general_stock':    'http://localhost:8000',
      '/static':           'http://localhost:8000',
      '/dashboard':        'http://localhost:8000',
      '/helpdesk':         'http://localhost:8000',
      '/menu':             'http://localhost:8000',
    }
  }
})
