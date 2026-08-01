import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
    LayoutDashboard, KeyRound, Boxes, LogOut, RefreshCw, Plus,
    Play, Square, RotateCw, Hammer, Trash2, Copy, Clock, ExternalLink,
    Users, Server, Wallet, HardDrive, Loader2
} from 'lucide-react'
import { LogoIcon } from '../components/Logo'

const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('id-ID') : '-'

export default function AdminPanel({ onLogout }) {
    const [tab, setTab] = useState('dashboard')
    const [dash, setDash] = useState(null)
    const [licenses, setLicenses] = useState([])
    const [deployments, setDeployments] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState('')
    const [toast, setToast] = useState('')

    // New license modal
    const [showNewLic, setShowNewLic] = useState(false)
    const [newLicName, setNewLicName] = useState('')
    const [newLicTier, setNewLicTier] = useState('full')
    const [creating, setCreating] = useState(false)

    // Timer modal
    const [timerDep, setTimerDep] = useState(null)
    const [timerDays, setTimerDays] = useState(30)
    const [timerMode, setTimerMode] = useState('add')

    // Logs modal
    const [logDep, setLogDep] = useState(null)
    const [logs, setLogs] = useState('')

    const api = async (url, opts = {}) => {
        const res = await fetch(url, {
            ...opts,
            headers: { 'Content-Type': 'application/json' }
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.error || 'Gagal')
        return data
    }

    const notify = (msg) => {
        setToast(msg)
        setTimeout(() => setToast(''), 3000)
    }

    const loadDashboard = useCallback(async () => {
        try { setDash(await api('/api/admin/dashboard')) } catch (e) { setError(e.message) }
    }, [])

    const loadLicenses = useCallback(async () => {
        try { setLicenses((await api('/api/admin/licenses')).licenses) } catch (e) { setError(e.message) }
    }, [])

    const loadDeployments = useCallback(async () => {
        try { setDeployments((await api('/api/admin/deployments')).deployments) } catch (e) { setError(e.message) }
    }, [])

    useEffect(() => {
        (async () => {
            setLoading(true)
            await loadDashboard()
            await loadLicenses()
            await loadDeployments()
            setLoading(false)
        })()
    }, [loadDashboard, loadLicenses, loadDeployments])

    const switchTab = async (t) => {
        setTab(t)
        if (t === 'dashboard') await loadDashboard()
        if (t === 'licenses') await loadLicenses()
        if (t === 'deployments') await loadDeployments()
    }

    // ==================== ACTIONS ====================

    const createLicense = async () => {
        if (!newLicName.trim()) return notify('Nama buyer wajib diisi')
        setCreating(true)
        try {
            const d = await api('/api/admin/licenses', {
                method: 'POST',
                body: JSON.stringify({ buyer_name: newLicName.trim(), tier: newLicTier })
            })
            notify(`✅ License dibuat: ${d.license.key}`)
            setShowNewLic(false)
            setNewLicName('')
            await loadLicenses()
            await loadDashboard()
        } catch (e) { notify(`❌ ${e.message}`) }
        setCreating(false)
    }

    const changeTier = async (key, tier) => {
        setBusy(`tier-${key}`)
        try {
            const d = await api(`/api/admin/licenses/${key}/tier`, {
                method: 'POST',
                body: JSON.stringify({ tier })
            })
            notify(d.rebuild?.success ? `✅ Tier diubah + rebuild OK` : `✅ Tier diubah${d.rebuild?.error ? ` (⚠️ rebuild: ${d.rebuild.error})` : ''}`)
            await loadLicenses()
        } catch (e) { notify(`❌ ${e.message}`) }
        setBusy('')
    }

    const revokeLicense = async (key, name) => {
        if (!confirm(`Revoke license ${name || key}? Container akan di-stop.`)) return
        setBusy(`revoke-${key}`)
        try {
            await api(`/api/admin/licenses/${key}/revoke`, { method: 'POST' })
            notify('✅ License di-revoke')
            await loadLicenses()
            await loadDeployments()
            await loadDashboard()
        } catch (e) { notify(`❌ ${e.message}`) }
        setBusy('')
    }

    const depAction = async (name, action) => {
        const labels = { start: 'Start', stop: 'Stop', restart: 'Restart', rebuild: 'Rebuild', delete: 'Hapus' }
        if (action === 'delete' && !confirm(`Hapus container ${name}? Data permanen hilang.`)) return
        if (action === 'rebuild' && !confirm(`Rebuild container ${name}? Data aman, tapi butuh waktu.`)) return
        setBusy(`${action}-${name}`)
        try {
            const d = await api(`/api/admin/deployments/${name}/${action}`, { method: 'POST' })
            notify(`✅ ${labels[action]} sukses`)
            if (action === 'delete') {
                await loadDeployments(); await loadDashboard()
            }
        } catch (e) { notify(`❌ ${e.message}`) }
        setBusy('')
    }

    const showLogs = async (name) => {
        setLogDep(name); setLogs('Memuat...')
        try {
            const d = await api(`/api/admin/deployments/${name}/logs?lines=80`)
            setLogs(d.logs || '(kosong)')
        } catch (e) { setLogs(`❌ ${e.message}`) }
    }

    const setTimer = async () => {
        if (!timerDays || timerDays < 1) return notify('Hari tidak valid')
        setBusy(`timer-${timerDep.container_name}`)
        try {
            const d = await api(`/api/admin/deployments/${timerDep.container_name}/timer`, {
                method: 'POST',
                body: JSON.stringify({ days: timerDays, mode: timerMode })
            })
            notify(`✅ Expiry di-set ke ${fmtDate(d.new_expires_at)}`)
            setTimerDep(null)
            await loadDeployments()
            await loadDashboard()
        } catch (e) { notify(`❌ ${e.message}`) }
        setBusy('')
    }

    // ==================== RENDER ====================

    if (loading) {
        return (
            <div className="admin-loading">
                <Loader2 className="spin" size={32} />
                <p>Memuat dashboard...</p>
            </div>
        )
    }

    return (
        <div className="admin-panel">
            {/* Topbar */}
            <header className="admin-topbar">
                <div className="admin-brand">
                    <LogoIcon size={30} />
                    <span>Admin Deploy</span>
                </div>
                <div className="admin-top-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => switchTab('dashboard')}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={onLogout}>
                        <LogOut size={14} /> Logout
                    </button>
                </div>
            </header>

            {error && <div className="alert alert-error" style={{ margin: '1rem' }}>❌ {error}</div>}
            {toast && <div className="admin-toast">{toast}</div>}

            <div className="admin-body">
                {/* Sidebar */}
                <nav className="admin-sidebar">
                    <button className={`admin-nav-item ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => switchTab('dashboard')}>
                        <LayoutDashboard size={18} /> Dashboard
                    </button>
                    <button className={`admin-nav-item ${tab === 'licenses' ? 'active' : ''}`} onClick={() => switchTab('licenses')}>
                        <KeyRound size={18} /> Licenses
                    </button>
                    <button className={`admin-nav-item ${tab === 'deployments' ? 'active' : ''}`} onClick={() => switchTab('deployments')}>
                        <Boxes size={18} /> Deployments
                    </button>
                </nav>

                {/* Content */}
                <main className="admin-content">
                    {tab === 'dashboard' && dash && <DashboardView data={dash} />}
                    {tab === 'licenses' && (
                        <LicensesView
                            licenses={licenses}
                            busy={busy}
                            onNew={() => { setShowNewLic(true) }}
                            onChangeTier={changeTier}
                            onRevoke={revokeLicense}
                        />
                    )}
                    {tab === 'deployments' && (
                        <DeploymentsView
                            deployments={deployments}
                            busy={busy}
                            onAction={depAction}
                            onLogs={showLogs}
                            onTimer={setTimerDep}
                        />
                    )}
                </main>
            </div>

            {/* Modals */}
            {showNewLic && (
                <div className="admin-modal-overlay" onClick={() => setShowNewLic(false)}>
                    <div className="admin-modal" onClick={e => e.stopPropagation()}>
                        <h3>➕ Buat License Baru</h3>
                        <div className="form-group">
                            <label className="form-label">Nama Buyer *</label>
                            <input className="form-input" placeholder="Nama pembeli" value={newLicName} onChange={e => setNewLicName(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Tier</label>
                            <select className="form-input" value={newLicTier} onChange={e => setNewLicTier(e.target.value)}>
                                <option value="full">🟢 Full (Web + Chat)</option>
                                <option value="chat">🔵 Chat saja</option>
                            </select>
                        </div>
                        <div className="admin-modal-actions">
                            <button className="btn btn-outline" onClick={() => setShowNewLic(false)}>Batal</button>
                            <button className="btn btn-primary" onClick={createLicense} disabled={creating}>
                                {creating ? <><Loader2 className="spin" size={14} /> Membuat...</> : 'Buat License'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {timerDep && (
                <div className="admin-modal-overlay" onClick={() => setTimerDep(null)}>
                    <div className="admin-modal" onClick={e => e.stopPropagation()}>
                        <h3>⏰ Set Expiry — {timerDep.store_name}</h3>
                        <div className="form-group">
                            <label className="form-label">Mode</label>
                            <select className="form-input" value={timerMode} onChange={e => setTimerMode(e.target.value)}>
                                <option value="add">Tambah dari expired sekarang</option>
                                <option value="set">Set dari hari ini</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Jumlah Hari</label>
                            <input className="form-input" type="number" min="1" max="9999" value={timerDays} onChange={e => setTimerDays(parseInt(e.target.value) || 0)} />
                        </div>
                        <div className="admin-modal-actions">
                            <button className="btn btn-outline" onClick={() => setTimerDep(null)}>Batal</button>
                            <button className="btn btn-primary" onClick={setTimer} disabled={busy === `timer-${timerDep.container_name}`}>
                                {busy === `timer-${timerDep.container_name}` ? <><Loader2 className="spin" size={14} /> Menyimpan...</> : 'Simpan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {logDep && (
                <div className="admin-modal-overlay" onClick={() => setLogDep(null)}>
                    <div className="admin-modal admin-modal-lg" onClick={e => e.stopPropagation()}>
                        <h3>📄 Logs — {logDep}</h3>
                        <pre className="admin-logs">{logs}</pre>
                        <div className="admin-modal-actions">
                            <button className="btn btn-outline" onClick={() => setLogDep(null)}>Tutup</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ==================== SUB-COMPONENTS ====================

function DashboardView({ data }) {
    const { stats, expiring_soon, recent_renewals } = data
    const cards = [
        { icon: <KeyRound size={22} />, label: 'Total License', value: stats.licenses.total, sub: `${stats.licenses.unused} unused · ${stats.licenses.used} used` },
        { icon: <Server size={22} />, label: 'Deployments', value: `${stats.deployments.running}/${stats.deployments.total}`, sub: `${stats.deployments.expired} expired`, color: stats.deployments.expired > 0 ? 'var(--danger)' : undefined },
        { icon: <Wallet size={22} />, label: 'Revenue (Renewal)', value: fmtRp(stats.revenue), sub: 'dari renewals paid' },
        { icon: <HardDrive size={22} />, label: 'Disk', value: stats.disk.percent, sub: `${stats.disk.used} / ${stats.disk.total}` },
    ]

    return (
        <div>
            <h2 className="admin-title">Dashboard</h2>
            <div className="admin-stats-grid">
                {cards.map((c, i) => (
                    <motion.div key={i} className="admin-stat-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                        <div className="admin-stat-icon">{c.icon}</div>
                        <div className="admin-stat-value" style={{ color: c.color }}>{c.value}</div>
                        <div className="admin-stat-label">{c.label}</div>
                        <div className="admin-stat-sub">{c.sub}</div>
                    </motion.div>
                ))}
            </div>

            <div className="admin-grid-2">
                <div className="admin-card">
                    <h3>⏰ Expiring Soon (3 hari)</h3>
                    {expiring_soon.length === 0 ? <p className="admin-empty">Tidak ada yang segera expired.</p> : (
                        <table className="admin-table">
                            <thead><tr><th>Store</th><th>Buyer</th><th>Sisa</th><th>Expired</th></tr></thead>
                            <tbody>
                                {expiring_soon.map(d => (
                                    <tr key={d.container_name}>
                                        <td>{d.store_name}</td>
                                        <td>{d.buyer_name || '-'}</td>
                                        <td className="admin-warn">{Math.max(0, Math.ceil((new Date(d.expires_at).getTime() - Date.now()) / 86400000))} hari</td>
                                        <td>{fmtDate(d.expires_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="admin-card">
                    <h3>🔄 Renewal Terbaru</h3>
                    {recent_renewals.length === 0 ? <p className="admin-empty">Belum ada renewal.</p> : (
                        <table className="admin-table">
                            <thead><tr><th>Order</th><th>Jumlah</th><th>Status</th><th>Tanggal</th></tr></thead>
                            <tbody>
                                {recent_renewals.map(r => (
                                    <tr key={r.order_id}>
                                        <td className="admin-mono">{r.order_id.slice(0, 12)}...</td>
                                        <td>{fmtRp(r.amount)}</td>
                                        <td>{r.status === 'paid' ? '✅ paid' : r.status === 'pending' ? '⏳ pending' : '❌ expired'}</td>
                                        <td>{fmtDate(r.created_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}

function LicensesView({ licenses, busy, onNew, onChangeTier, onRevoke }) {
    const [filter, setFilter] = useState('all')
    const filtered = filter === 'all' ? licenses : licenses.filter(l => l.status === filter)

    return (
        <div>
            <div className="admin-title-row">
                <h2 className="admin-title">Licenses</h2>
                <button className="btn btn-primary btn-sm" onClick={onNew}><Plus size={15} /> Buat License</button>
            </div>
            <div className="admin-filter-row">
                {['all', 'unused', 'used', 'revoked'].map(f => (
                    <button key={f} className={`btn btn-outline btn-sm ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
                ))}
            </div>
            <div className="admin-card">
                <table className="admin-table">
                    <thead><tr><th>Buyer</th><th>Key</th><th>Tier</th><th>Status</th><th>Deployment</th><th>Aksi</th></tr></thead>
                    <tbody>
                        {filtered.map(l => (
                            <tr key={l.key}>
                                <td><strong>{l.buyer_name || '-'}</strong></td>
                                <td className="admin-mono">{l.key}</td>
                                <td>
                                    <select
                                        className="admin-inline-select"
                                        value={l.tier}
                                        disabled={busy === `tier-${l.key}`}
                                        onChange={e => onChangeTier(l.key, e.target.value)}
                                    >
                                        <option value="full">🟢 Full</option>
                                        <option value="chat">🔵 Chat</option>
                                    </select>
                                </td>
                                <td>{l.status === 'used' ? '🔵 used' : l.status === 'unused' ? '🟢 unused' : '🔴 revoked'}</td>
                                <td>
                                    {l.deployment ? (
                                        <span className="admin-mono" style={{ fontSize: '0.75rem' }}>
                                            {l.deployment.container_name} :{l.deployment.port}
                                        </span>
                                    ) : <span className="admin-dim">—</span>}
                                </td>
                                <td>
                                    {l.status !== 'revoked' && (
                                        <button
                                            className="btn btn-danger btn-xs"
                                            disabled={busy === `revoke-${l.key}`}
                                            onClick={() => onRevoke(l.key, l.buyer_name)}
                                        >
                                            {busy === `revoke-${l.key}` ? '...' : 'Revoke'}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length === 0 && <p className="admin-empty">Tidak ada license.</p>}
            </div>
        </div>
    )
}

function DeploymentsView({ deployments, busy, onAction, onLogs, onTimer }) {
    const [filter, setFilter] = useState('all')
    const filtered = filter === 'all' ? deployments : deployments.filter(d => d.status === filter)

    return (
        <div>
            <div className="admin-title-row">
                <h2 className="admin-title">Deployments</h2>
            </div>
            <div className="admin-filter-row">
                {['all', 'running', 'stopped', 'expired'].map(f => (
                    <button key={f} className={`btn btn-outline btn-sm ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
                ))}
            </div>
            <div className="admin-card">
                <table className="admin-table">
                    <thead><tr><th>Store</th><th>Container</th><th>Port</th><th>Status</th><th>Uptime</th><th>Expired</th><th>Aksi</th></tr></thead>
                    <tbody>
                        {filtered.map(d => {
                            const cs = d.container_status || {}
                            return (
                                <tr key={d.container_name}>
                                    <td><strong>{d.store_name}</strong><br /><span className="admin-dim">{d.buyer_name || '-'}</span></td>
                                    <td className="admin-mono" style={{ fontSize: '0.75rem' }}>{d.container_name}</td>
                                    <td className="admin-mono">:{d.port}</td>
                                    <td>{cs.running ? '🟢 running' : `🔴 ${cs.status || d.status}`}</td>
                                    <td>{cs.uptime ? `${Math.floor(cs.uptime / 60)}m` : '-'}</td>
                                    <td>{fmtDate(d.expires_at)}</td>
                                    <td>
                                        <div className="admin-actions">
                                            {!cs.running && <button className="btn btn-success btn-xs" disabled={busy === `start-${d.container_name}`} onClick={() => onAction(d.container_name, 'start')}><Play size={12} /></button>}
                                            {cs.running && <button className="btn btn-danger btn-xs" disabled={busy === `stop-${d.container_name}`} onClick={() => onAction(d.container_name, 'stop')}><Square size={12} /></button>}
                                            {cs.running && <button className="btn btn-outline btn-xs" disabled={busy === `restart-${d.container_name}`} onClick={() => onAction(d.container_name, 'restart')}><RotateCw size={12} /></button>}
                                            <button className="btn btn-outline btn-xs" disabled={busy === `rebuild-${d.container_name}`} onClick={() => onAction(d.container_name, 'rebuild')}><Hammer size={12} /></button>
                                            <button className="btn btn-outline btn-xs" onClick={() => onLogs(d.container_name)}><ExternalLink size={12} /></button>
                                            <button className="btn btn-outline btn-xs" onClick={() => onTimer(d)}><Clock size={12} /></button>
                                            <button className="btn btn-danger btn-xs" disabled={busy === `delete-${d.container_name}`} onClick={() => onAction(d.container_name, 'delete')}><Trash2 size={12} /></button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
                {filtered.length === 0 && <p className="admin-empty">Tidak ada deployment.</p>}
            </div>
        </div>
    )
}
