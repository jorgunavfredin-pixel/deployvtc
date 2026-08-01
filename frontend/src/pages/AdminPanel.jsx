import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    LayoutDashboard, KeyRound, Boxes, LogOut, RefreshCw, Plus,
    Play, Square, RotateCw, Hammer, Trash2, Clock, ExternalLink,
    Server, Wallet, HardDrive, Loader2, Download, Upload, Database,
    Settings2, ScrollText, Search, ShieldCheck, X, CheckCircle2, AlertTriangle
} from 'lucide-react'
import { LogoIcon } from '../components/Logo'

const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('id-ID') : '-'
const fmtTime = (iso) => iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'

const PROVIDERS = [
    { value: 'pakasir', label: 'PaKasir', fields: [{ key: 'api_key', label: 'API Key', type: 'password' }, { key: 'slug', label: 'Project Slug', type: 'text' }] },
    { value: 'wijayapay', label: 'WijayaPay', fields: [{ key: 'code_merchant', label: 'Code Merchant', type: 'text' }, { key: 'api_key', label: 'API Key', type: 'password' }] },
    { value: 'xoftware', label: 'Xoftware Pay', fields: [{ key: 'api_key', label: 'API Key', type: 'password' }, { key: 'merchant_id', label: 'Merchant ID', type: 'text' }, { key: 'webhook_secret', label: 'Webhook Secret', type: 'password' }] },
    { value: 'klikqris', label: 'KlikQRIS', fields: [{ key: 'api_key', label: 'API Key', type: 'password' }, { key: 'merchant_id', label: 'Merchant ID', type: 'text' }] },
]

function StatusBadge({ running, status }) {
    const ok = running || status === 'running'
    return (
        <span className={`badge ${ok ? 'badge-green' : status === 'expired' ? 'badge-red' : 'badge-gray'}`}>
            <span className="badge-dot" />
            {ok ? 'Running' : status === 'expired' ? 'Expired' : status === 'stopped' ? 'Stopped' : 'Off'}
        </span>
    )
}

function TierBadge({ tier }) {
    return <span className={`badge ${tier === 'full' ? 'badge-blue' : 'badge-cyan'}`}>{tier === 'full' ? 'Full' : 'Chat'}</span>
}

function LicStatusBadge({ status }) {
    const map = {
        used: <span className="badge badge-blue"><span className="badge-dot" />Used</span>,
        unused: <span className="badge badge-green"><span className="badge-dot" />Unused</span>,
        revoked: <span className="badge badge-red"><span className="badge-dot" />Revoked</span>,
    }
    return map[status] || <span className="badge badge-gray">{status}</span>
}

export default function AdminPanel({ onLogout }) {
    const [tab, setTab] = useState('dashboard')
    const [dash, setDash] = useState(null)
    const [licenses, setLicenses] = useState([])
    const [deployments, setDeployments] = useState([])
    const [audit, setAudit] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState('')
    const [toast, setToast] = useState(null)

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

    // Import modal
    const [showImport, setShowImport] = useState(false)
    const [importFile, setImportFile] = useState(null)
    const [importing, setImporting] = useState(false)

    // Config modal
    const [cfgDep, setCfgDep] = useState(null)
    const [cfgData, setCfgData] = useState(null)

    // Auto-refresh
    const [autoRefresh, setAutoRefresh] = useState(true)

    const api = async (url, opts = {}) => {
        const res = await fetch(url, {
            ...opts,
            headers: { 'Content-Type': 'application/json' }
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.error || 'Gagal')
        return data
    }

    const notify = (msg, type = 'ok') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3000)
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

    const loadAudit = useCallback(async () => {
        try { setAudit((await api('/api/admin/audit')).audit) } catch (e) { /* silent */ }
    }, [])

    useEffect(() => {
        (async () => {
            setLoading(true)
            await Promise.all([loadDashboard(), loadLicenses(), loadDeployments(), loadAudit()])
            setLoading(false)
        })()
    }, [loadDashboard, loadLicenses, loadDeployments, loadAudit])

    // Auto-refresh setiap 30 detik kalau aktif
    useEffect(() => {
        if (!autoRefresh) return
        const id = setInterval(() => {
            loadDashboard(); loadDeployments()
        }, 30000)
        return () => clearInterval(id)
    }, [autoRefresh, loadDashboard, loadDeployments])

    const switchTab = async (t) => {
        setTab(t)
        if (t === 'dashboard') await loadDashboard()
        if (t === 'licenses') await loadLicenses()
        if (t === 'deployments') await loadDeployments()
        if (t === 'audit') await loadAudit()
    }

    // ==================== ACTIONS ====================

    const createLicense = async () => {
        if (!newLicName.trim()) return notify('Nama buyer wajib diisi', 'err')
        setCreating(true)
        try {
            const d = await api('/api/admin/licenses', {
                method: 'POST',
                body: JSON.stringify({ buyer_name: newLicName.trim(), tier: newLicTier })
            })
            notify(`License dibuat: ${d.license.key}`)
            setShowNewLic(false)
            setNewLicName('')
            await loadLicenses(); await loadDashboard()
        } catch (e) { notify(e.message, 'err') }
        setCreating(false)
    }

    const changeTier = async (key, tier) => {
        setBusy(`tier-${key}`)
        try {
            const d = await api(`/api/admin/licenses/${key}/tier`, {
                method: 'POST', body: JSON.stringify({ tier })
            })
            notify(d.rebuild?.success ? 'Tier diubah + rebuild OK' : `Tier diubah${d.rebuild?.error ? ` (rebuild: ${d.rebuild.error})` : ''}`)
            await loadLicenses()
        } catch (e) { notify(e.message, 'err') }
        setBusy('')
    }

    const revokeLicense = async (key, name) => {
        if (!window.confirm(`Revoke license ${name || key}? Container akan di-stop.`)) return
        setBusy(`revoke-${key}`)
        try {
            await api(`/api/admin/licenses/${key}/revoke`, { method: 'POST' })
            notify('License di-revoke')
            await loadLicenses(); await loadDeployments(); await loadDashboard()
        } catch (e) { notify(e.message, 'err') }
        setBusy('')
    }

    const depAction = async (name, action) => {
        const labels = { start: 'Start', stop: 'Stop', restart: 'Restart', rebuild: 'Rebuild', delete: 'Hapus' }
        if (action === 'delete' && !window.confirm(`Hapus container ${name}? Data permanen hilang.`)) return
        if (action === 'rebuild' && !window.confirm(`Rebuild container ${name}? Data aman, butuh waktu.`)) return
        setBusy(`${action}-${name}`)
        try {
            await api(`/api/admin/deployments/${name}/${action}`, { method: 'POST' })
            notify(`${labels[action]} sukses`)
            if (action === 'delete') { await loadDeployments(); await loadDashboard() }
            else await loadDeployments()
        } catch (e) { notify(e.message, 'err') }
        setBusy('')
    }

    const showLogs = async (name) => {
        setLogDep(name); setLogs('Memuat...')
        try {
            const d = await api(`/api/admin/deployments/${name}/logs?lines=80`)
            setLogs(d.logs || '(kosong)')
        } catch (e) { setLogs(e.message) }
    }

    const setTimer = async () => {
        if (!timerDays || timerDays < 1) return notify('Hari tidak valid', 'err')
        setBusy(`timer-${timerDep.container_name}`)
        try {
            const d = await api(`/api/admin/deployments/${timerDep.container_name}/timer`, {
                method: 'POST',
                body: JSON.stringify({ days: timerDays, mode: timerMode })
            })
            notify(`Expiry di-set ke ${fmtDate(d.new_expires_at)}`)
            setTimerDep(null)
            await loadDeployments(); await loadDashboard()
        } catch (e) { notify(e.message, 'err') }
        setBusy('')
    }

    const doImport = async () => {
        if (!importFile) return notify('Pilih file .tar.gz dulu', 'err')
        setImporting(true)
        try {
            const fd = new FormData()
            fd.append('file', importFile)
            const res = await fetch('/api/admin/deployments/import', { method: 'POST', body: fd })
            const data = await res.json()
            if (!data.success) throw new Error(data.error || 'Import gagal')
            notify(`Import berhasil: ${data.container.store_name}`)
            setShowImport(false); setImportFile(null)
            await loadDeployments(); await loadDashboard()
        } catch (e) { notify(e.message, 'err') }
        setImporting(false)
    }

    const openConfig = async (dep) => {
        setCfgDep(dep); setCfgData(null)
        try {
            const d = await api(`/api/admin/deployments/${dep.container_name}/config`)
            setCfgData(d.config)
        } catch (e) { notify(e.message, 'err') }
    }

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
            <header className="admin-topbar">
                <div className="admin-brand">
                    <LogoIcon size={30} />
                    <span>Deploy Admin</span>
                </div>
                <div className="admin-top-actions">
                    <button
                        className={`btn btn-outline btn-sm ${autoRefresh ? 'active' : ''}`}
                        onClick={() => setAutoRefresh(v => !v)}
                        title="Auto-refresh 30 detik"
                    >
                        <RefreshCw size={14} /> Auto
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => { loadDashboard(); loadDeployments(); notify('Data diperbarui') }}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={onLogout}>
                        <LogOut size={14} /> Keluar
                    </button>
                </div>
            </header>

            <AnimatePresence>
                {toast && (
                    <motion.div
                        className={`admin-toast ${toast.type === 'err' ? 'toast-err' : ''}`}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                    >
                        {toast.type === 'err' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>

            {error && <div className="alert alert-error" style={{ margin: '1rem' }}>{error}</div>}

            <div className="admin-body">
                <nav className="admin-sidebar">
                    <button className={`admin-nav-item ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => switchTab('dashboard')}>
                        <LayoutDashboard size={18} /> <span>Dashboard</span>
                    </button>
                    <button className={`admin-nav-item ${tab === 'licenses' ? 'active' : ''}`} onClick={() => switchTab('licenses')}>
                        <KeyRound size={18} /> <span>Licenses</span>
                    </button>
                    <button className={`admin-nav-item ${tab === 'deployments' ? 'active' : ''}`} onClick={() => switchTab('deployments')}>
                        <Boxes size={18} /> <span>Deployments</span>
                    </button>
                    <button className={`admin-nav-item ${tab === 'audit' ? 'active' : ''}`} onClick={() => switchTab('audit')}>
                        <ScrollText size={18} /> <span>Audit Log</span>
                    </button>
                </nav>

                <main className="admin-content">
                    <AnimatePresence mode="wait">
                        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                            {tab === 'dashboard' && dash && <DashboardView data={dash} />}
                            {tab === 'licenses' && (
                                <LicensesView
                                    licenses={licenses}
                                    busy={busy}
                                    onNew={() => setShowNewLic(true)}
                                    onChangeTier={changeTier}
                                    onRevoke={revokeLicense}
                                    onConfig={openConfig}
                                />
                            )}
                            {tab === 'deployments' && (
                                <DeploymentsView
                                    deployments={deployments}
                                    busy={busy}
                                    onAction={depAction}
                                    onLogs={showLogs}
                                    onTimer={setTimerDep}
                                    onImport={() => setShowImport(true)}
                                    onConfig={openConfig}
                                />
                            )}
                            {tab === 'audit' && <AuditView audit={audit} />}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>

            {/* ==================== MODALS ==================== */}

            {showNewLic && (
                <div className="admin-modal-overlay" onClick={() => setShowNewLic(false)}>
                    <div className="admin-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-head">
                            <h3><Plus size={18} /> Buat License Baru</h3>
                            <button className="modal-close" onClick={() => setShowNewLic(false)}><X size={18} /></button>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Nama Buyer</label>
                            <input className="form-input" placeholder="Nama pembeli" value={newLicName} onChange={e => setNewLicName(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Tier</label>
                            <select className="form-input" value={newLicTier} onChange={e => setNewLicTier(e.target.value)}>
                                <option value="full">Full — Web + Chat</option>
                                <option value="chat">Chat saja</option>
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
                        <div className="modal-head">
                            <h3><Clock size={18} /> Set Expiry — {timerDep.store_name}</h3>
                            <button className="modal-close" onClick={() => setTimerDep(null)}><X size={18} /></button>
                        </div>
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
                        <div className="modal-head">
                            <h3><ExternalLink size={18} /> Logs — {logDep}</h3>
                            <button className="modal-close" onClick={() => setLogDep(null)}><X size={18} /></button>
                        </div>
                        <pre className="admin-logs">{logs}</pre>
                        <div className="admin-modal-actions">
                            <button className="btn btn-outline" onClick={() => setLogDep(null)}>Tutup</button>
                        </div>
                    </div>
                </div>
            )}

            {showImport && (
                <div className="admin-modal-overlay" onClick={() => setShowImport(false)}>
                    <div className="admin-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-head">
                            <h3><Upload size={18} /> Import Container</h3>
                            <button className="modal-close" onClick={() => { setShowImport(false); setImportFile(null) }}><X size={18} /></button>
                        </div>
                        <p className="modal-desc">
                            Upload file <code>.tar.gz</code> hasil export. Port & webhook dibuat ulang otomatis.
                        </p>
                        <div className="form-group">
                            <label className="form-label">File Export</label>
                            <input className="form-input" type="file" accept=".tar.gz,application/gzip" onChange={e => setImportFile(e.target.files[0])} />
                        </div>
                        <div className="admin-modal-actions">
                            <button className="btn btn-outline" onClick={() => { setShowImport(false); setImportFile(null) }}>Batal</button>
                            <button className="btn btn-primary" onClick={doImport} disabled={importing}>
                                {importing ? <><Loader2 className="spin" size={14} /> Mengimpor...</> : 'Import'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {cfgDep && <ConfigModal dep={cfgDep} data={cfgData} onClose={() => setCfgDep(null)} onDone={async () => { await loadDeployments(); }} />}
        </div>
    )
}

// ==================== DASHBOARD ====================

function DashboardView({ data }) {
    const { stats, expiring_soon, recent_renewals } = data
    const cards = [
        { icon: <KeyRound size={22} />, label: 'Total License', value: stats.licenses.total, sub: `${stats.licenses.unused} unused · ${stats.licenses.used} used` },
        { icon: <Server size={22} />, label: 'Deployments', value: `${stats.deployments.running}/${stats.deployments.total}`, sub: `${stats.deployments.expired} expired`, warn: stats.deployments.expired > 0 },
        { icon: <Wallet size={22} />, label: 'Revenue (Renewal)', value: fmtRp(stats.revenue), sub: 'dari renewals paid' },
        { icon: <HardDrive size={22} />, label: 'Disk', value: stats.disk.percent, sub: `${stats.disk.used} / ${stats.disk.total}` },
    ]

    return (
        <div>
            <h2 className="admin-title">Dashboard</h2>
            <div className="admin-stats-grid">
                {cards.map((c, i) => (
                    <motion.div key={i} className="admin-stat-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                        <div className={`admin-stat-icon ${c.warn ? 'warn' : ''}`}>{c.icon}</div>
                        <div className="admin-stat-value">{c.value}</div>
                        <div className="admin-stat-label">{c.label}</div>
                        <div className="admin-stat-sub">{c.sub}</div>
                    </motion.div>
                ))}
            </div>

            <div className="admin-grid-2">
                <div className="admin-card">
                    <h3><Clock size={15} /> Expiring Soon</h3>
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
                    <h3><Wallet size={15} /> Renewal Terbaru</h3>
                    {recent_renewals.length === 0 ? <p className="admin-empty">Belum ada renewal.</p> : (
                        <table className="admin-table">
                            <thead><tr><th>Order</th><th>Jumlah</th><th>Status</th><th>Waktu</th></tr></thead>
                            <tbody>
                                {recent_renewals.map(r => (
                                    <tr key={r.order_id}>
                                        <td className="admin-mono">{r.order_id.slice(0, 14)}...</td>
                                        <td>{fmtRp(r.amount)}</td>
                                        <td>{r.status === 'paid' ? <span className="badge badge-green">Paid</span> : r.status === 'pending' ? <span className="badge badge-amber">Pending</span> : <span className="badge badge-gray">Expired</span>}</td>
                                        <td>{fmtTime(r.created_at)}</td>
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

// ==================== LICENSES ====================

function LicensesView({ licenses, busy, onNew, onChangeTier, onRevoke, onConfig }) {
    const [filter, setFilter] = useState('all')
    const [q, setQ] = useState('')
    const filtered = licenses.filter(l => {
        const matchFilter = filter === 'all' || l.status === filter
        const matchQ = !q || (l.buyer_name || '').toLowerCase().includes(q.toLowerCase()) || l.key.toLowerCase().includes(q.toLowerCase())
        return matchFilter && matchQ
    })

    return (
        <div>
            <div className="admin-title-row">
                <h2 className="admin-title">Licenses</h2>
                <button className="btn btn-primary btn-sm" onClick={onNew}><Plus size={15} /> Buat License</button>
            </div>
            <div className="admin-toolbar">
                <div className="admin-filter-row">
                    {['all', 'unused', 'used', 'revoked'].map(f => (
                        <button key={f} className={`btn btn-outline btn-sm ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
                    ))}
                </div>
                <div className="admin-search">
                    <Search size={14} />
                    <input placeholder="Cari nama / key..." value={q} onChange={e => setQ(e.target.value)} />
                </div>
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
                                    <select className="admin-inline-select" value={l.tier} disabled={busy === `tier-${l.key}`} onChange={e => onChangeTier(l.key, e.target.value)}>
                                        <option value="full">Full</option>
                                        <option value="chat">Chat</option>
                                    </select>
                                </td>
                                <td><LicStatusBadge status={l.status} /></td>
                                <td>
                                    {l.deployment ? <span className="admin-mono" style={{ fontSize: '0.75rem' }}>{l.deployment.container_name} :{l.deployment.port}</span> : <span className="admin-dim">—</span>}
                                </td>
                                <td>
                                    <div className="admin-actions">
                                        {l.deployment && (
                                            <button className="btn btn-outline btn-xs" onClick={() => onConfig(l.deployment)} title="Konfigurasi Bot">
                                                <Settings2 size={12} /> Config
                                            </button>
                                        )}
                                        {l.status !== 'revoked' && (
                                            <button className="btn btn-danger btn-xs" disabled={busy === `revoke-${l.key}`} onClick={() => onRevoke(l.key, l.buyer_name)}>
                                                {busy === `revoke-${l.key}` ? <Loader2 className="spin" size={12} /> : <Trash2 size={12} />} Revoke
                                            </button>
                                        )}
                                    </div>
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

// ==================== DEPLOYMENTS ====================

function DeploymentsView({ deployments, busy, onAction, onLogs, onTimer, onImport, onConfig }) {
    const [filter, setFilter] = useState('all')
    const [q, setQ] = useState('')
    const filtered = deployments.filter(d => {
        const matchFilter = filter === 'all' || d.status === filter
        const matchQ = !q || (d.store_name || '').toLowerCase().includes(q.toLowerCase()) || (d.container_name || '').toLowerCase().includes(q.toLowerCase())
        return matchFilter && matchQ
    })

    return (
        <div>
            <div className="admin-title-row">
                <h2 className="admin-title">Deployments</h2>
                <button className="btn btn-primary btn-sm" onClick={onImport}><Upload size={15} /> Import Container</button>
            </div>
            <div className="admin-toolbar">
                <div className="admin-filter-row">
                    {['all', 'running', 'stopped', 'expired'].map(f => (
                        <button key={f} className={`btn btn-outline btn-sm ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
                    ))}
                </div>
                <div className="admin-search">
                    <Search size={14} />
                    <input placeholder="Cari store / container..." value={q} onChange={e => setQ(e.target.value)} />
                </div>
            </div>
            <div className="admin-card">
                <table className="admin-table">
                    <thead><tr><th>Store</th><th>Container</th><th>Port</th><th>Status</th><th>Uptime</th><th>Expired</th><th>Aksi</th></tr></thead>
                    <tbody>
                        {filtered.map(d => {
                            const cs = d.container_status || {}
                            return (
                                <tr key={d.container_name}>
                                    <td>
                                        <strong>{d.store_name}</strong>
                                        <div className="admin-dim">{d.buyer_name || '-'}</div>
                                    </td>
                                    <td className="admin-mono" style={{ fontSize: '0.75rem' }}>{d.container_name}</td>
                                    <td className="admin-mono">:{d.port}</td>
                                    <td><StatusBadge running={cs.running} status={cs.status || d.status} /></td>
                                    <td>{cs.uptime ? `${Math.floor(cs.uptime / 60)}m` : '-'}</td>
                                    <td>{fmtDate(d.expires_at)}</td>
                                    <td>
                                        <div className="admin-actions">
                                            {!cs.running && <button className="btn btn-success btn-xs" disabled={busy === `start-${d.container_name}`} onClick={() => onAction(d.container_name, 'start')} title="Start"><Play size={12} /></button>}
                                            {cs.running && <button className="btn btn-danger btn-xs" disabled={busy === `stop-${d.container_name}`} onClick={() => onAction(d.container_name, 'stop')} title="Stop"><Square size={12} /></button>}
                                            {cs.running && <button className="btn btn-outline btn-xs" disabled={busy === `restart-${d.container_name}`} onClick={() => onAction(d.container_name, 'restart')} title="Restart"><RotateCw size={12} /></button>}
                                            <button className="btn btn-outline btn-xs" disabled={busy === `rebuild-${d.container_name}`} onClick={() => onAction(d.container_name, 'rebuild')} title="Rebuild"><Hammer size={12} /></button>
                                            <button className="btn btn-outline btn-xs" onClick={() => onLogs(d.container_name)} title="Logs"><ExternalLink size={12} /></button>
                                            <button className="btn btn-outline btn-xs" onClick={() => onConfig(d)} title="Konfigurasi Bot"><Settings2 size={12} /></button>
                                            <button className="btn btn-outline btn-xs" onClick={() => onTimer(d)} title="Set Expiry"><Clock size={12} /></button>
                                            <a className="btn btn-outline btn-xs" href={`/api/admin/deployments/${d.container_name}/export`} target="_blank" rel="noreferrer" title="Export"><Download size={12} /></a>
                                            <a className="btn btn-outline btn-xs" href={`/api/admin/deployments/${d.container_name}/backup`} target="_blank" rel="noreferrer" title="Backup DB"><Database size={12} /></a>
                                            <button className="btn btn-danger btn-xs" disabled={busy === `delete-${d.container_name}`} onClick={() => onAction(d.container_name, 'delete')} title="Hapus"><Trash2 size={12} /></button>
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

// ==================== CONFIG MODAL ====================

function ConfigModal({ dep, data, onClose, onDone }) {
    const [provider, setProvider] = useState('')
    const [creds, setCreds] = useState({})
    const [theme, setTheme] = useState('')
    const [bannerFile, setBannerFile] = useState(null)
    const [saving, setSaving] = useState('')
    const [msg, setMsg] = useState(null)
    const [qrisPresets, setQrisPresets] = useState([])

    useEffect(() => {
        fetch('/api/qris-presets').then(r => r.json()).then(d => {
            if (d.success) setQrisPresets(d.presets)
        }).catch(() => { })
    }, [])

    useEffect(() => {
        if (!data) return
        const active = (data.gateways || []).find(g => g.enabled === 1)
        if (active) {
            setProvider(active.provider)
            const pf = PROVIDERS.find(p => p.value === active.provider)
            const c = {}
            if (pf) pf.fields.forEach(f => { c[f.key] = active.credentials?.[f.key] || '' })
            setCreds(c)
        }
        setTheme(data.theme_preset || '')
    }, [data])

    const notifyLocal = (m, type = 'ok') => {
        setMsg({ m, type })
        setTimeout(() => setMsg(null), 3000)
    }

    const saveGateway = async () => {
        if (!provider) return notifyLocal('Pilih provider', 'err')
        setSaving('gw')
        try {
            const res = await fetch(`/api/admin/deployments/${dep.container_name}/config/gateway`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, credentials: creds })
            })
            const d = await res.json()
            if (!d.success) throw new Error(d.error)
            notifyLocal(`Gateway ${provider} diaktifkan`)
            onDone()
        } catch (e) { notifyLocal(e.message, 'err') }
        setSaving('')
    }

    const saveTheme = async () => {
        if (!theme) return notifyLocal('Pilih theme', 'err')
        setSaving('theme')
        try {
            const res = await fetch(`/api/admin/deployments/${dep.container_name}/config/theme`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme_preset: theme })
            })
            const d = await res.json()
            if (!d.success) throw new Error(d.error)
            notifyLocal(`Theme diubah ke ${theme}`)
            onDone()
        } catch (e) { notifyLocal(e.message, 'err') }
        setSaving('')
    }

    const saveBanner = async () => {
        if (!bannerFile) return notifyLocal('Pilih file banner', 'err')
        setSaving('banner')
        try {
            const fd = new FormData()
            fd.append('banner', bannerFile)
            const res = await fetch(`/api/admin/deployments/${dep.container_name}/config/banner`, { method: 'POST', body: fd })
            const d = await res.json()
            if (!d.success) throw new Error(d.error)
            notifyLocal('Banner diperbarui')
            setBannerFile(null)
            onDone()
        } catch (e) { notifyLocal(e.message, 'err') }
        setSaving('')
    }

    const selectedProvider = PROVIDERS.find(p => p.value === provider)
    const activeGw = (data?.gateways || []).find(g => g.enabled === 1)

    return (
        <div className="admin-modal-overlay" onClick={onClose}>
            <div className="admin-modal admin-modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-head">
                    <h3><Settings2 size={18} /> Konfigurasi Bot — {dep.store_name}</h3>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>

                {msg && <div className={`alert ${msg.type === 'err' ? 'alert-error' : 'alert-success'}`}>{msg.m}</div>}

                {!data ? (
                    <div className="admin-loading" style={{ minHeight: '200px' }}>
                        <Loader2 className="spin" size={24} />
                        <p>Memuat konfigurasi...</p>
                    </div>
                ) : (
                    <>
                        {/* GATEWAY */}
                        <div className="config-section">
                            <div className="config-section-title">
                                <ShieldCheck size={16} /> Payment Gateway
                                <span className="config-current">
                                    Aktif: {activeGw ? PROVIDERS.find(p => p.value === activeGw.provider)?.label || activeGw.provider : 'Tidak ada'}
                                </span>
                            </div>
                            <div className="form-group">
                                <select className="form-input" value={provider} onChange={e => { setProvider(e.target.value); setCreds({}) }}>
                                    <option value="">Pilih Provider</option>
                                    {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                            </div>
                            {selectedProvider && (
                                <>
                                    {selectedProvider.fields.map(f => (
                                        <div className="form-group" key={f.key}>
                                            <label className="form-label">{f.label}</label>
                                            <input className="form-input" type={f.type} value={creds[f.key] || ''} onChange={e => setCreds(prev => ({ ...prev, [f.key]: e.target.value }))} />
                                        </div>
                                    ))}
                                    <button className="btn btn-primary btn-full" onClick={saveGateway} disabled={saving === 'gw'}>
                                        {saving === 'gw' ? <><Loader2 className="spin" size={14} /> Menyimpan...</> : 'Aktifkan Gateway Ini'}
                                    </button>
                                    <span className="form-hint">Gateway lain otomatis dinonaktifkan. Bot restart otomatis.</span>
                                </>
                            )}
                        </div>

                        {/* THEME */}
                        <div className="config-section">
                            <div className="config-section-title"><Settings2 size={16} /> Theme QRIS</div>
                            <div className="form-group">
                                <select className="form-input" value={theme} onChange={e => setTheme(e.target.value)}>
                                    <option value="">Pilih Preset</option>
                                    {qrisPresets.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                                </select>
                            </div>
                            <button className="btn btn-primary btn-full" onClick={saveTheme} disabled={saving === 'theme'}>
                                {saving === 'theme' ? <><Loader2 className="spin" size={14} /> Menyimpan...</> : 'Ganti Theme'}
                            </button>
                        </div>

                        {/* BANNER */}
                        <div className="config-section">
                            <div className="config-section-title"><Database size={16} /> Banner Toko</div>
                            <div className="form-group">
                                <input className="form-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => setBannerFile(e.target.files[0])} />
                            </div>
                            <button className="btn btn-primary btn-full" onClick={saveBanner} disabled={saving === 'banner'}>
                                {saving === 'banner' ? <><Loader2 className="spin" size={14} /> Upload...</> : 'Ganti Banner'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

// ==================== AUDIT ====================

function AuditView({ audit }) {
    const ACTION_LABELS = {
        LOGIN: 'Login',
        GANTI_GATEWAY: 'Ganti Gateway',
        GANTI_THEME: 'Ganti Theme',
        GANTI_BANNER: 'Ganti Banner',
    }
    return (
        <div>
            <h2 className="admin-title">Audit Log</h2>
            <div className="admin-card">
                {audit.length === 0 ? (
                    <p className="admin-empty">Belum ada aktivitas.</p>
                ) : (
                    <div className="audit-list">
                        {audit.map(a => (
                            <div className="audit-item" key={a.id}>
                                <span className={`badge badge-blue`}>{ACTION_LABELS[a.action] || a.action}</span>
                                <span className="audit-detail">{a.detail}</span>
                                <span className="audit-time">{fmtTime(a.at)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
