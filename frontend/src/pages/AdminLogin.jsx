import { useState } from 'react'
import { motion } from 'framer-motion'
import { LogIn, ShieldCheck, Home, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LogoIcon } from '../components/Logo'
import '../admin-dark.css'

export default function AdminLogin({ onLogin }) {
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const submit = async (e) => {
        e.preventDefault()
        if (!password) return setError('Masukkan password admin.')
        setLoading(true); setError('')
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            })
            const data = await res.json()
            if (data.success) {
                onLogin()
            } else {
                setError(data.error || 'Login gagal')
            }
        } catch {
            setError('Gagal terhubung ke server.')
        }
        setLoading(false)
    }

    return (
        <div className="admin-login-page">
            <motion.div
                className="admin-login-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
            >
                <div className="admin-login-logo">
                    <LogoIcon size={48} />
                </div>
                <h1><ShieldCheck size={22} />Admin Panel</h1>
                <p className="admin-login-sub">Kelola license & deployment bot</p>

                {error && <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}><AlertCircle size={16} />{error}</div>}

                <form onSubmit={submit}>
                    <div className="form-group">
                        <label className="form-label">Password Admin</label>
                        <input
                            className="form-input"
                            type="password"
                            placeholder="••••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
                        {loading ? <><span className="spinner" /> Memverifikasi...</> : <><LogIn size={18} /> Masuk</>}
                    </button>
                </form>

                <Link to="/" className="btn btn-outline btn-full" style={{ marginTop: '0.75rem' }}>
                    <Home size={16} /> Kembali ke Home
                </Link>
            </motion.div>
        </div>
    )
}
