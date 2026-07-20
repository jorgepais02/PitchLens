import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, useLayoutEffect } from 'react'
import { Toaster } from 'sonner'
import { PredictionProvider } from './context/PredictionContext'
import { AuthProvider } from './context/AuthContext'
import Navbar from './components/Navbar'
import { Spinner } from './components/shared'

const PredictorPage    = lazy(() => import('./pages/PredictorPage'))
const PredictionPage   = lazy(() => import('./pages/prediction/PredictionPage'))
const ExplorePage      = lazy(() => import('./pages/ExplorePage'))
const ExploreMatchPage = lazy(() => import('./pages/ExploreMatchPage'))
const StudioPage       = lazy(() => import('./pages/StudioPage'))
const NotFoundPage     = lazy(() => import('./pages/NotFoundPage'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PredictionProvider>
          <ScrollToTop />
          <div className="min-h-svh flex flex-col" style={{ background: 'var(--color-bg)' }}>
            <Navbar />
            <main className="flex-1">
              <Suspense fallback={
                <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
                  <Spinner />
                </div>
              }>
                <Routes>
                  <Route path="/" element={<Navigate to="/new" replace />} />
                  <Route path="/new" element={<PredictorPage />} />
                  <Route path="/prediction/:id" element={<PredictionPage />} />
                  <Route path="/explore" element={<ExplorePage />} />
                  <Route path="/explore/:slug" element={<ExploreMatchPage />} />
                  <Route path="/studio/*" element={<StudioPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
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
      </AuthProvider>
    </BrowserRouter>
  )
}
