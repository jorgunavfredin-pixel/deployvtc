import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Landing from './pages/Landing'
import Deploy from './pages/Deploy'
import Renew from './pages/Renew'
import Manage from './pages/Manage'
import AdminLogin from './pages/AdminLogin'
import AdminPanel from './pages/AdminPanel'

function AdminRoute() {
    const [status, setStatus] = useState('checking') // checking | authed | guest | disabled

    useEffect(() => {
        fetch('/api/admin/me').then(async (res) => {
            if (res.status === 503) { setStatus('disabled'); return }
            if (res.ok) setStatus('authed')
            else setStatus('guest')
        }).catch(() => setStatus('guest'))
    }, [])

    if (status === 'checking') {
        return <div className="admin-loading"><p>Memeriksa sesi...</p></div>
    }

    if (status === 'disabled') {
        return (
            <div className="admin-login-page">
                <div className="admin-login-card">
                    <h1>🔒 Admin Panel Nonaktif</h1>
                    <p className="admin-login-sub">
                        Admin panel belum dikonfigurasi.<br />
                        Set <code>ADMIN_PANEL_PASSWORD</code> & <code>ADMIN_JWT_SECRET</code> di .env server.
                    </p>
                </div>
            </div>
        )
    }

    if (status === 'guest') return <AdminLogin onLogin={() => setStatus('authed')} />
    return <AdminPanel onLogout={async () => {
        await fetch('/api/admin/logout', { method: 'POST' })
        setStatus('guest')
    }} />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/deploy" element={<Deploy />} />
        <Route path="/renew" element={<Renew />} />
        <Route path="/manage" element={<Manage />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
