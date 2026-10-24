import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import App from './App'
import { store } from './store'

import './styles.css'

window.addEventListener('error', (e) => console.error('[global error]', e.message, e.error))
window.addEventListener('unhandledrejection', (e) => console.error('[global unhandledrejection]', e.reason))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
)
