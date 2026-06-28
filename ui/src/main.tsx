import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider } from 'convex/react'
import './index.css'
import App from './App.tsx'
import { convexClient } from './lib/convex'

// When a team's Convex deployment is configured (VITE_CONVEX_URL), wrap the app so its reactive
// hooks work. With no URL set, render App bare — fully local, no Convex, exactly as before.
const tree = <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {convexClient ? <ConvexProvider client={convexClient}>{tree}</ConvexProvider> : tree}
  </StrictMode>,
)
