import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/google-sans-flex/wght.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource-variable/material-symbols-rounded/fill.css'
import '@fontsource/noto-sans-jp/300.css'
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/500.css'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'

import App from './App.tsx'
import { installRipple } from './design/ripple'

installRipple()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
