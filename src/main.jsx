import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './AuthGate.jsx'
import LegalPage, { LEGAL_ROUTES } from './components/legal/LegalPages.jsx'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import './index.css'

// Pages légales : publiques, hors AuthGate (lisibles avant inscription — art. 13 RGPD).
const legalSlug = LEGAL_ROUTES[window.location.pathname.replace(/\/+$/, "") || "/"];

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {legalSlug
      ? <LegalPage slug={legalSlug} />
      : (
        <AuthGate>
          {({ session, signOut }) => <App session={session} signOut={signOut} />}
        </AuthGate>
      )}
  </StrictMode>,
)
