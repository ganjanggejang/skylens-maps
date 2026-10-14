import React from 'react'
import ReactDOM from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'
import './layer/layers.css'
import './sidebar/sidebar.css'
import './search/search.css'
import './sidebar/i18n.css'
import { App } from './App'
import { I18nProvider } from './i18n'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider><App /></I18nProvider>
  </React.StrictMode>,
)
