import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/google-sans-flex/wght.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/noto-sans-jp/300.css'
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/500.css'
import './styles/all.css'

import App from './App.tsx'
import { AppError, ErrorBoundary } from './components/ErrorBoundary'
import { installRipple } from './design/ripple'

installRipple()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={(error) => <AppError error={error} />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
