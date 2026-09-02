import React from 'react'
import ReactDOM from 'react-dom/client'
import './assets/main.css'
import App from './App'
import SettingsWindow from './SettingsWindow'
import { paintTheme, readTheme } from './themes'

paintTheme(readTheme())

const settings = new URLSearchParams(window.location.search).get('view') === 'settings'

document.body.dataset.view = settings ? 'settings' : 'shell'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{settings ? <SettingsWindow /> : <App />}</React.StrictMode>
)
