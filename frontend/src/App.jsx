import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Landing from './pages/Landing'
import Deploy from './pages/Deploy'
import Renew from './pages/Renew'
import Manage from './pages/Manage'
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
// Panel asli hanya di /admin-<random> (path rahasia).
// Route /admin/* menangkap /admin dan /admin-xxx sekaligus.
function AdminGuard() {
    const location = useLocation()
    const isSecretPath = location.pathname.startsWith('/admin-')
    if (!isSecretPath) {
        return <Fake404 />
    }
    return <AdminRoute />
}

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
        <Route path="/manage" element={<Manage />} />
        <Route path="/admin/*" element={<AdminGuard />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
