import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter'
import './assets/main.css'
import App from './App'
import SettingsWindow from './SettingsWindow'
import Gate from './parts/Gate'
import { paintTheme, readTheme } from './themes'

paintTheme(readTheme())

const view = new URLSearchParams(window.location.search).get('view')

document.body.dataset.view = view === 'settings' || view === 'splash' ? view : 'shell'

const root = view === 'splash' ? <Gate /> : view === 'settings' ? <SettingsWindow /> : <App />

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{root}</React.StrictMode>
)
