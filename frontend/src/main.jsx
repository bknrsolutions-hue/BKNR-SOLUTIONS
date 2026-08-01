import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '../../backend/app/static/css/ui-color-customizer.css'
import '../../backend/app/static/js/ui-color-customizer.js'
import './index.css'
import App from './App.jsx'
import { installActionFeedback } from './utils/actionFeedback.js'

installActionFeedback()

// Recover from 404 stale chunk hashes after new builds/deployments
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  window.location.reload();
});

window.addEventListener('error', (event) => {
  if (event?.message && /Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(event.message)) {
    const lastReload = sessionStorage.getItem('bknr_chunk_reload');
    const now = Date.now();
    if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
      sessionStorage.setItem('bknr_chunk_reload', String(now));
      window.location.reload();
    }
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
