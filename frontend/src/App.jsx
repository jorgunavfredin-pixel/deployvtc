import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Landing from './pages/Landing'
import Deploy from './pages/Deploy'
import Renew from './pages/Renew'
import AdminLogin from './pages/AdminLogin'
import AdminPanel from './pages/AdminPanel'

function AdminRoute() {
    const [status, setStatus] = useState('checking') // checking | authed | guest

    useEffect(() => {
        fetch('/api/admin/me').then(async (res) => {
            if (res.ok) setStatus('authed')
            else setStatus('guest')
        }).catch(() => setStatus('guest'))
    }, [])

    if (status === 'checking') {
        return <div className="admin-loading"><p>Memeriksa sesi...</p></div>
    }

    if (status === 'guest') return <AdminLogin onLogin={() => setStatus('authed')} />
    return <AdminPanel onLogout={async () => {
        await fetch('/api/admin/logout', { method: 'POST' })
        setStatus('guest')
    }} />
}

// /admin publik → fake 404 (kayak halaman gak ada).
// Panel asli hanya di /admin-<random> (path rahasia dengan DASH, bukan slash).
// React Router v7: `*` harus setelah `/`, jadi /admin-xxx TIDAK bisa match via
// pattern route. Ditangani di AdminOr404 (cek pathname manual).
function Fake404() {
    return (
        <div style={{
            minHeight: '100vh', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-deep)', color: 'var(--text-dim)',
            fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '2rem'
        }}>
            <h1 style={{ fontSize: '4rem', margin: 0, color: 'var(--text-bright)' }}>404</h1>
            <p style={{ fontSize: '1.1rem' }}>Halaman tidak ditemukan.</p>
            <a href="/" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>← Kembali ke Beranda</a>
        </div>
    )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/deploy" element={<Deploy />} />
        <Route path="/renew" element={<Renew />} />
        {/* /admin → Fake404. /admin-xxx tidak bisa match pattern route (v7),
            jadi tangani lewat route khusus di bawah dengan pathname check */}
        <Route path="/admin" element={<Fake404 />} />
        {/* Catch-all: kalau pathname dimulai /admin- → render admin, selain itu 404 */}
        <Route path="*" element={<AdminOr404 />} />
      </Routes>
    </BrowserRouter>
  )
}

// Render admin panel kalau pathname /admin-*, selain itu Fake404.
function AdminOr404() {
  const location = useLocation()
  if (location.pathname.startsWith('/admin-')) {
    return <AdminRoute />
  }
  return <Fake404 />
}

export default App
