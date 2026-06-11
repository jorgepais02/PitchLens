import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { PredictionProvider } from './context/PredictionContext'
import Navbar from './components/Navbar'
import PredictorPage from './pages/PredictorPage'
import PredictionPage from './pages/PredictionPage'

export default function App() {
  return (
    <BrowserRouter>
      <PredictionProvider>
        <div className="min-h-svh flex flex-col" style={{ background: 'var(--color-bg)' }}>
          <Navbar />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Navigate to="/new" replace />} />
              <Route path="/new" element={<PredictorPage />} />
              <Route path="/prediction/:id" element={<PredictionPage />} />
              {/* /explore, /studio — próximas fases */}
            </Routes>
          </main>
        </div>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-ink)',
            },
          }}
        />
      </PredictionProvider>
    </BrowserRouter>
  )
}
