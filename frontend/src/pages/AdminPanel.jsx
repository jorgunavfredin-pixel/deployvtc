import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    LayoutDashboard, KeyRound, Boxes, LogOut, RefreshCw, Plus,
    Play, Square, RotateCw, Hammer, Trash2, Clock, ExternalLink,
    Server, Wallet, HardDrive, Loader2, Download, Upload, Database,
    Settings2, ScrollText, Search, ShieldCheck, X, CheckCircle2, AlertTriangle,
    Store, Save, Copy, AlertCircle
} from 'lucide-react'
import { LogoIcon } from '../components/Logo'

const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('id-ID') : '-'
const fmtTime = (iso) => iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'

const formatUptime = (minutes) => {
    if (!minutes || minutes < 1) return '0m'
    const d = Math.floor(minutes / 1440)
    const h = Math.floor((minutes % 1440) / 60)
    const m = Math.floor(minutes % 60)
    if (d > 0) return `${d}d ${h}h`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
}

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
    const [systemLogs, setSystemLogs] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState('')
    const [toast, setToast] = useState(null)

    // New license modal
    const [showNewLic, setShowNewLic] = useState(false)
    const [newLicName, setNewLicName] = useState('')
    const [newLicTier, setNewLicTier] = useState('full')
    const [newLicDays, setNewLicDays] = useState(30)
    const [newLicResult, setNewLicResult] = useState(null) // { key, buyer_name, tier, days } setelah dibuat
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
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...opts.headers }
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

    const loadSystemLogs = useCallback(async () => {
        try { setSystemLogs((await api('/api/admin/system-logs?limit=100')).logs) } catch (e) { /* silent */ }
    }, [])

    useEffect(() => {
        (async () => {
            setLoading(true)
            await Promise.all([loadDashboard(), loadLicenses(), loadDeployments(), loadAudit(), loadSystemLogs()])
            setLoading(false)
        })()
    }, [loadDashboard, loadLicenses, loadDeployments, loadAudit, loadSystemLogs])

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
                body: JSON.stringify({ buyer_name: newLicName.trim(), tier: newLicTier, initial_days: newLicDays })
            })
            notify(`License dibuat: ${d.license.key}`)
            setNewLicResult({ key: d.license.key, buyer_name: newLicName.trim(), tier: newLicTier, days: newLicDays })
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
            notify(d.rebuild?.success ? 'Akses diubah + rebuild OK' : `Akses diubah${d.rebuild?.error ? ` (rebuild: ${d.rebuild.error})` : ''}`)
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
                    <button className="btn btn-outline btn-sm" onClick={() => { loadDashboard(); loadDeployments(); notify('Data diperbarui') }} title="Refresh data">
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
                    <button className={`admin-nav-item ${tab === 'system-logs' ? 'active' : ''}`} onClick={() => switchTab('system-logs')}>
                        <AlertCircle size={18} /> <span>System Logs</span>
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
                            {tab === 'system-logs' && <SystemLogsView logs={systemLogs} onRefresh={loadSystemLogs} />}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>

            {/* ==================== MODALS ==================== */}

            {showNewLic && (
                <div className="admin-modal-overlay" onClick={() => { setShowNewLic(false); setNewLicResult(null) }}>
                    <div className="admin-modal admin-modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-head">
                            <h3><Plus size={18} /> Buat License Baru</h3>
                            <button className="modal-close" onClick={() => { setShowNewLic(false); setNewLicResult(null) }}><X size={18} /></button>
                        </div>

                        {newLicResult ? (
                            <div className="lic-result">
                                <div className="lic-result-ok">
                                    <CheckCircle2 size={22} /> License berhasil dibuat!
                                </div>
                                <div className="lic-result-meta">
                                    <div><span>Buyer</span><strong>{newLicResult.buyer_name}</strong></div>
                                    <div><span>Akses</span><strong>{newLicResult.tier === 'full' ? 'Web + Chat' : 'Chat saja'}</strong></div>
                                    <div><span>Durasi Awal</span><strong>{newLicResult.days} hari</strong></div>
                                </div>
                                <label className="form-label">Template pesan untuk buyer — tinggal copy & kirim</label>
                                <textarea className="form-input lic-template" readOnly rows={12} onFocus={e => e.target.select()}
                                    value={`Halo ${newLicResult.buyer_name}! 🎉

License bot kamu sudah jadi, berikut detailnya:

🔑 License Key:
${newLicResult.key}

✅ Akses: ${newLicResult.tier === 'full' ? 'Full (Web + Chat)' : 'Chat saja'}
⏳ Durasi Awal: ${newLicResult.days} hari

📌 Cara Deploy:
1. Buka link berikut di HP/PC kamu
2. Masukkan License Key di atas
3. Isi data toko & pilih template QRIS
4. Klik Deploy — bot otomatis jalan

🌐 Link Deploy:
${window.location.origin}/deploy

⏳ Masa aktif terhitung sejak deploy pertama.

Kalau butuh bantuan, balas chat ini ya! 🙏`} />
                                <div className="admin-modal-actions">
                                    <button className="btn btn-outline" onClick={() => { navigator.clipboard?.writeText(document.querySelector('.lic-template')?.value); notify('Template disalin!') }}><Copy size={14} /> Salin</button>
                                    <button className="btn btn-primary" onClick={() => { setShowNewLic(false); setNewLicResult(null) }}>Selesai</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="form-group">
                                    <label className="form-label">Nama Buyer</label>
                                    <input className="form-input" placeholder="Nama pembeli" value={newLicName} onChange={e => setNewLicName(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Akses</label>
                                    <select className="form-input" value={newLicTier} onChange={e => setNewLicTier(e.target.value)}>
                                        <option value="full">Web + Chat</option>
                                        <option value="chat">Chat saja</option>
                                    </select>
                                    <span className="form-hint">Web + Chat: akses penuh (web admin + bot chat). Chat saja: hanya bot chat.</span>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Durasi Awal (hari)</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        min="1"
                                        max="3650"
                                        placeholder="30"
                                        value={newLicDays}
                                        onChange={e => setNewLicDays(parseInt(e.target.value) || 0)}
                                    />
                                    <span className="form-hint">Durasi license saat pertama deploy. Setelah habis, buyer renew lewat flow yang ada. Contoh giveaway: 1 atau 7 hari.</span>
                                </div>
                                <div className="admin-modal-actions">
                                    <button className="btn btn-outline" onClick={() => setShowNewLic(false)}>Batal</button>
                                    <button className="btn btn-primary" onClick={createLicense} disabled={creating}>
                                        {creating ? <><Loader2 className="spin" size={14} /> Membuat...</> : 'Buat License'}
                                    </button>
                                </div>
                            </>
                        )}
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
                            <input className="form-input" type="number" min="1" max="9999" value={timerDays} onChange={e => setTimerDays(Math.max(1, parseInt(e.target.value) || 1))} />
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
                                        <td data-label="Store">{d.store_name}</td>
                                        <td data-label="Buyer">{d.buyer_name || '-'}</td>
                                        <td data-label="Sisa" className="admin-warn">{Math.max(0, Math.ceil((new Date(d.expires_at).getTime() - Date.now()) / 86400000))} hari</td>
                                        <td data-label="Expired">{fmtDate(d.expires_at)}</td>
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
                            <thead><tr><th>License</th><th>Durasi</th><th>Jumlah</th><th>Status</th><th>Waktu</th></tr></thead>
                            <tbody>
                                {recent_renewals.map(r => (
                                    <tr key={r.order_id}>
                                        <td data-label="License" className="admin-mono">{r.license_key ? r.license_key.slice(0, 12) + '…' : '-'}</td>
                                        <td data-label="Durasi">+{r.duration_days || 0} hari</td>
                                        <td data-label="Jumlah">{fmtRp(r.amount)}</td>
                                        <td data-label="Status">{r.status === 'paid' ? <span className="badge badge-green">Paid</span> : r.status === 'pending' ? <span className="badge badge-amber">Pending</span> : <span className="badge badge-gray">Expired</span>}</td>
                                        <td data-label="Waktu">{fmtTime(r.created_at)}</td>
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
                    <thead><tr><th>Buyer</th><th>Key</th><th>Akses</th><th>Durasi</th><th>Status</th><th>Deployment</th><th>Aksi</th></tr></thead>
                    <tbody>
                        {filtered.map(l => (
                            <tr key={l.key}>
                                <td data-label="Buyer"><strong>{l.buyer_name || '-'}</strong></td>
                                <td data-label="Key" className="admin-mono">{l.key}</td>
                                <td data-label="Akses">
                                    <select className="admin-inline-select" value={l.tier} disabled={busy === `tier-${l.key}`} onChange={e => onChangeTier(l.key, e.target.value)}>
                                        <option value="full">Full</option>
                                        <option value="chat">Chat</option>
                                    </select>
                                </td>
                                <td data-label="Durasi">{l.initial_days ? `${l.initial_days} hr` : '30 hr'}</td>
                                <td data-label="Status"><LicStatusBadge status={l.status} /></td>
                                <td data-label="Deployment">
                                    {l.deployment ? <span className="admin-mono" style={{ fontSize: '0.75rem' }}>{l.deployment.container_name} :{l.deployment.port}</span> : <span className="admin-dim">—</span>}
                                </td>
                                <td data-label="Aksi">
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
                                    <td data-label="Store">
                                        <strong>{d.store_name}</strong>
                                        <div className="admin-dim">{d.buyer_name || '-'}</div>
                                    </td>
                                    <td data-label="Container" className="admin-mono" style={{ fontSize: '0.75rem' }}>{d.container_name}</td>
                                    <td data-label="Port" className="admin-mono">:{d.port}</td>
                                    <td data-label="Status"><StatusBadge running={cs.running} status={cs.status || d.status} /></td>
                                    <td data-label="Uptime">{cs.running ? formatUptime(cs.uptime) : '-'}</td>
                                    <td data-label="Expired">{fmtDate(d.expires_at)}</td>
                                    <td data-label="Aksi">
                                        <div className="admin-actions-grid">
                                            <button className="act-btn btn-success" disabled={busy === `start-${d.container_name}` || cs.running} onClick={() => onAction(d.container_name, 'start')} title="Start container"><Play size={14} /><span>Start</span></button>
                                            <button className="act-btn btn-danger" disabled={busy === `stop-${d.container_name}` || !cs.running} onClick={() => onAction(d.container_name, 'stop')} title="Stop container"><Square size={14} /><span>Stop</span></button>
                                            <button className="act-btn btn-outline" disabled={busy === `restart-${d.container_name}` || !cs.running} onClick={() => onAction(d.container_name, 'restart')} title="Restart container"><RotateCw size={14} /><span>Restart</span></button>
                                            <button className="act-btn btn-outline" onClick={() => onConfig(d)} title="Konfigurasi bot (gateway, theme, banner, identitas)"><Settings2 size={14} /><span>Config</span></button>
                                            <button className="act-btn btn-outline" onClick={() => onLogs(d.container_name)} title="Lihat log container"><ExternalLink size={14} /><span>Logs</span></button>
                                            <button className="act-btn btn-outline" onClick={() => onTimer(d)} title="Atur tanggal expiry"><Clock size={14} /><span>Expiry</span></button>
                                            <a className="act-btn btn-outline" href={`/api/admin/deployments/${d.container_name}/export`} target="_blank" rel="noreferrer" title="Export container (.tar.gz)"><Download size={14} /><span>Export</span></a>
                                            <a className="act-btn btn-outline" href={`/api/admin/deployments/${d.container_name}/backup`} target="_blank" rel="noreferrer" title="Backup database (store.db)"><Database size={14} /><span>Backup</span></a>
                                            <button className="act-btn btn-danger" disabled={busy === `rebuild-${d.container_name}`} onClick={() => onAction(d.container_name, 'rebuild')} title="Rebuild container dari image terbaru"><Hammer size={14} /><span>Rebuild</span></button>
                                            <button className="act-btn btn-danger" disabled={busy === `delete-${d.container_name}`} onClick={() => onAction(d.container_name, 'delete')} title="Hapus container permanen"><Trash2 size={14} /><span>Delete</span></button>
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
    const [form, setForm] = useState({})
    const [provider, setProvider] = useState('')
    const [creds, setCreds] = useState({})
    const [bannerFile, setBannerFile] = useState(null)
    const [saving, setSaving] = useState('')
    const [msg, setMsg] = useState(null)

    // Init dari data backend (config.config = semua env field)
    useEffect(() => {
        if (!data?.config) return
        const c = data.config
        setForm({
            bot_token: c.bot_token || '',
            admin_telegram_id: c.admin_telegram_id || '',
            store_name: c.store_name || '',
            order_prefix: c.order_prefix || '',
            support_username: c.support_username || '',
            support_hours: c.support_hours || '',
            admin_panel_password: c.admin_panel_password || '',
            pakasir_api_key: c.pakasir_api_key || '',
            pakasir_slug: c.pakasir_slug || '',
            wijayapay_code_merchant: c.wijayapay_code_merchant || '',
            wijayapay_api_key: c.wijayapay_api_key || '',
            xoftware_api_key: c.xoftware_api_key || '',
            xoftware_merchant_id: c.xoftware_merchant_id || '',
            xoftware_webhook_secret: c.xoftware_webhook_secret || '',
            xoftware_notify_url: c.xoftware_notify_url || '',
            xoftware_fee_direction: c.xoftware_fee_direction || 'merchant',
            klikqris_api_key: c.klikqris_api_key || '',
            klikqris_merchant_id: c.klikqris_merchant_id || ''
        })
        // Provider aktif dari DB gateway
        const active = (data.gateways || []).find(g => g.enabled === 1)
        if (active) {
            setProvider(active.provider)
            const pf = PROVIDERS.find(p => p.value === active.provider)
            const cred = {}
            if (pf) pf.fields.forEach(f => { cred[f.key] = active.credentials?.[f.key] || '' })
            setCreds(cred)
        }
    }, [data])

    const notifyLocal = (m, type = 'ok') => {
        setMsg({ m, type })
        setTimeout(() => setMsg(null), 3500)
    }

    const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

    const envFor = (keys) => {
        const env = {}
        for (const k of keys) {
            const formKey = k.toLowerCase()
            if (form[formKey] !== undefined && form[formKey] !== '') env[k] = form[formKey]
        }
        return env
    }

    // ==================== SAVE PER SECTION ====================
    const saveBotTelegram = async (restart) => {
        setSaving('bottg')
        try {
            const res = await fetch(`/api/admin/deployments/${dep.container_name}/config/env`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ env: envFor(['BOT_TOKEN', 'ADMIN_TELEGRAM_ID']), restart })
            })
            const d = await res.json()
            if (!d.success) throw new Error(d.error)
            notifyLocal(d.message || 'Bot Telegram disimpan')
            onDone()
        } catch (e) { notifyLocal(e.message, 'err') }
        setSaving('')
    }

    const saveIdentitas = async (restart) => {
        setSaving('identitas')
        try {
            const res = await fetch(`/api/admin/deployments/${dep.container_name}/config/env`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ env: envFor(['STORE_NAME', 'ORDER_PREFIX', 'SUPPORT_USERNAME', 'SUPPORT_HOURS']), restart })
            })
            const d = await res.json()
            if (!d.success) throw new Error(d.error)
            notifyLocal(d.message || 'Identitas disimpan')
            onDone()
        } catch (e) { notifyLocal(e.message, 'err') }
        setSaving('')
    }

    const saveAdminPass = async (restart) => {
        setSaving('adminpass')
        try {
            const res = await fetch(`/api/admin/deployments/${dep.container_name}/config/env`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ env: envFor(['ADMIN_PANEL_PASSWORD']), restart })
            })
            const d = await res.json()
            if (!d.success) throw new Error(d.error)
            notifyLocal(d.message || 'Password admin disimpan')
            onDone()
        } catch (e) { notifyLocal(e.message, 'err') }
        setSaving('')
    }

    const saveGateway = async (restart) => {
        if (!provider) return notifyLocal('Pilih provider', 'err')
        setSaving('gw')
        try {
            const res = await fetch(`/api/admin/deployments/${dep.container_name}/config/gateway`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, credentials: creds, restart })
            })
            const d = await res.json()
            if (!d.success) throw new Error(d.error)
            notifyLocal(restart ? `Gateway ${provider} aktif + restart` : `Gateway ${provider} aktif (belum restart)`)
            onDone()
        } catch (e) { notifyLocal(e.message, 'err') }
        setSaving('')
    }

    const saveTheme = async (restart) => {
        setSaving('theme')
        try {
            const res = await fetch(`/api/admin/deployments/${dep.container_name}/config/env`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ env: envFor(['THEME_PRESET']), restart })
            })
            const d = await res.json()
            if (!d.success) throw new Error(d.error)
            notifyLocal(restart ? 'Theme disimpan + restart' : 'Theme disimpan (belum restart)')
            onDone()
        } catch (e) { notifyLocal(e.message, 'err') }
        setSaving('')
    }

    const saveBanner = async (restart) => {
        if (!bannerFile) return notifyLocal('Pilih file banner', 'err')
        setSaving('banner')
        try {
            const fd = new FormData()
            fd.append('banner', bannerFile)
            fd.append('restart', restart ? 'true' : 'false')
            const res = await fetch(`/api/admin/deployments/${dep.container_name}/config/banner`, { method: 'POST', body: fd })
            const d = await res.json()
            if (!d.success) throw new Error(d.error)
            notifyLocal(restart ? 'Banner disimpan + restart' : 'Banner disimpan (belum restart)')
            setBannerFile(null)
            onDone()
        } catch (e) { notifyLocal(e.message, 'err') }
        setSaving('')
    }

    // ==================== SAVE ALL ====================
    const saveAll = async (restart) => {
        setSaving('all')
        const errors = []
        const envPatch = {
            ...envFor(['BOT_TOKEN', 'ADMIN_TELEGRAM_ID', 'STORE_NAME', 'ORDER_PREFIX', 'SUPPORT_USERNAME', 'SUPPORT_HOURS', 'ADMIN_PANEL_PASSWORD', 'THEME_PRESET']),
            PAKASIR_API_KEY: form.pakasir_api_key || '',
            PAKASIR_SLUG: form.pakasir_slug || '',
            WIJAYAPAY_CODE_MERCHANT: form.wijayapay_code_merchant || '',
            WIJAYAPAY_API_KEY: form.wijayapay_api_key || '',
            XOWFTWARE_API_KEY: form.xoftware_api_key || '',
            XOWFTWARE_MERCHANT_ID: form.xoftware_merchant_id || '',
            XOWFTWARE_WEBHOOK_SECRET: form.xoftware_webhook_secret || '',
            XOWFTWARE_NOTIFY_URL: form.xoftware_notify_url || '',
            XOWFTWARE_FEE_DIRECTION: form.xoftware_fee_direction || 'merchant',
            KLIKQRIS_API_KEY: form.klikqris_api_key || '',
            KLIKQRIS_MERCHANT_ID: form.klikqris_merchant_id || ''
        }
        try {
            // 1. Simpan semua env (tanpa restart)
            const r1 = await fetch(`/api/admin/deployments/${dep.container_name}/config/env`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ env: envPatch, restart: false })
            })
            const d1 = await r1.json()
            if (!d1.success) throw new Error(d1.error)

            // 2. Kalau gateway dipilih, aktifkan (tanpa restart)
            if (provider) {
                const r2 = await fetch(`/api/admin/deployments/${dep.container_name}/config/gateway`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider, credentials: creds, restart: false })
                })
                const d2 = await r2.json()
                if (!d2.success) throw new Error(d2.error)
            }

            // 3. Banner kalau ada (tanpa restart)
            if (bannerFile) {
                const fd = new FormData()
                fd.append('banner', bannerFile)
                fd.append('restart', 'false')
                const r3 = await fetch(`/api/admin/deployments/${dep.container_name}/config/banner`, { method: 'POST', body: fd })
                const d3 = await r3.json()
                if (!d3.success) throw new Error(d3.error)
                setBannerFile(null)
            }

            // 4. Restart kalau diminta
            if (restart) {
                await fetch(`/api/admin/deployments/${dep.container_name}/config/restart`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
            }

            notifyLocal(restart ? 'Semua konfigurasi disimpan + container restart' : 'Semua konfigurasi disimpan (belum restart)')
            onDone()
        } catch (e) { notifyLocal(e.message, 'err') }
        setSaving('')
    }

    const selectedProvider = PROVIDERS.find(p => p.value === provider)
    const activeGw = (data?.gateways || []).find(g => g.enabled === 1)
    const isSaving = saving !== ''

    return (
        <div className="admin-modal-overlay" onClick={onClose}>
            <div className="admin-modal admin-modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-head">
                    <h3><Settings2 size={18} /> Konfigurasi — {dep.store_name}</h3>
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
                        {/* Konten scrollable */}
                        <div className="admin-modal-scroll">
                            {/* BOT TELEGRAM */}
                            <div className="config-section">
                                <div className="config-section-title"><Settings2 size={15} /> Bot Telegram</div>
                                <div className="config-grid">
                                    <div className="form-group">
                                        <label className="form-label">Bot Token <span className="cfg-tag cfg-tag-restart">perlu restart</span></label>
                                        <input className="form-input" type="password" placeholder="123456:ABC-DEF..." value={form.bot_token || ''} onChange={set('bot_token')} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Admin Telegram ID <span className="cfg-tag cfg-tag-restart">perlu restart</span></label>
                                        <input className="form-input" placeholder="123456789" value={form.admin_telegram_id || ''} onChange={set('admin_telegram_id')} />
                                    </div>
                                </div>
                                <SectionActions saving={saving === 'bottg'} onSave={() => saveBotTelegram(false)} onSaveRestart={() => saveBotTelegram(true)} />
                            </div>

                            {/* IDENTITAS */}
                            <div className="config-section">
                                <div className="config-section-title">
                                    <Store size={15} /> Identitas Bot
                                    <span className="cfg-tag cfg-tag-live">live tanpa restart</span>
                                </div>
                                <div className="config-grid">
                                    <div className="form-group">
                                        <label className="form-label">Nama Toko</label>
                                        <input className="form-input" value={form.store_name || ''} onChange={set('store_name')} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Prefix Order</label>
                                        <input className="form-input" value={form.order_prefix || ''} onChange={set('order_prefix')} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Support Username</label>
                                        <input className="form-input" placeholder="tanpa @" value={form.support_username || ''} onChange={set('support_username')} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Support Hours</label>
                                        <input className="form-input" placeholder="09:00 - 23:00 WIB" value={form.support_hours || ''} onChange={set('support_hours')} />
                                    </div>
                                </div>
                                <SectionActions saving={saving === 'identitas'} onSave={() => saveIdentitas(false)} onSaveRestart={() => saveIdentitas(true)} />
                            </div>

                            {/* ADMIN PANEL */}
                            <div className="config-section">
                                <div className="config-section-title"><ShieldCheck size={15} /> Admin Panel</div>
                                <div className="config-grid">
                                    <div className="form-group">
                                        <label className="form-label">Password Admin Panel <span className="cfg-tag cfg-tag-restart">perlu restart</span></label>
                                        <input className="form-input" type="password" placeholder="••••••••" value={form.admin_panel_password || ''} onChange={set('admin_panel_password')} />
                                    </div>
                                </div>
                                <SectionActions saving={saving === 'adminpass'} onSave={() => saveAdminPass(false)} onSaveRestart={() => saveAdminPass(true)} />
                            </div>

                            {/* PAYMENT GATEWAY */}
                            <div className="config-section">
                                <div className="config-section-title">
                                    <Wallet size={15} /> Payment Gateway
                                    <span className="config-current">
                                        {activeGw ? PROVIDERS.find(p => p.value === activeGw.provider)?.label || activeGw.provider : 'Belum aktif'}
                                    </span>
                                </div>
                                <div className="form-group">
                                    <select className="form-input" value={provider} onChange={e => { setProvider(e.target.value); setCreds({}) }}>
                                        <option value="">Pilih Provider</option>
                                        {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                    </select>
                                </div>
                                {selectedProvider ? (
                                    <div className="config-grid">
                                        {selectedProvider.fields.map(f => (
                                            <div className="form-group" key={f.key}>
                                                <label className="form-label">{f.label}</label>
                                                <input className="form-input" type={f.type} value={creds[f.key] || ''} onChange={e => setCreds(prev => ({ ...prev, [f.key]: e.target.value }))} />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        <div className="form-group">
                                            <label className="form-label">PaKasir API Key</label>
                                            <input className="form-input" type="password" value={form.pakasir_api_key || ''} onChange={set('pakasir_api_key')} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">PaKasir Slug</label>
                                            <input className="form-input" value={form.pakasir_slug || ''} onChange={set('pakasir_slug')} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">WijayaPay Code Merchant</label>
                                            <input className="form-input" value={form.wijayapay_code_merchant || ''} onChange={set('wijayapay_code_merchant')} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">WijayaPay API Key</label>
                                            <input className="form-input" type="password" value={form.wijayapay_api_key || ''} onChange={set('wijayapay_api_key')} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">KlikQRIS API Key</label>
                                            <input className="form-input" type="password" value={form.klikqris_api_key || ''} onChange={set('klikqris_api_key')} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">KlikQRIS Merchant ID</label>
                                            <input className="form-input" value={form.klikqris_merchant_id || ''} onChange={set('klikqris_merchant_id')} />
                                        </div>
                                    </>
                                )}
                                {selectedProvider && (
                                    <SectionActions saving={saving === 'gw'} onSave={() => saveGateway(false)} onSaveRestart={() => saveGateway(true)} />
                                )}
                            </div>

                            {/* THEME QRIS */}
                            <div className="config-section">
                                <div className="config-section-title"><Settings2 size={15} /> Theme QRIS</div>
                                <div className="form-group">
                                    <select className="form-input" value={form.theme_preset || ''} onChange={set('theme_preset')}>
                                        <option value="">Pilih Preset</option>
                                        {['qris-1', 'qris-2', 'qris-3'].map(id => <option key={id} value={id}>{id}</option>)}
                                    </select>
                                </div>
                                <SectionActions saving={saving === 'theme'} onSave={() => saveTheme(false)} onSaveRestart={() => saveTheme(true)} />
                            </div>

                            {/* BANNER */}
                            <div className="config-section">
                                <div className="config-section-title"><Database size={15} /> Banner Toko</div>
                                <div className="form-group">
                                    <input className="form-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => setBannerFile(e.target.files[0])} />
                                </div>
                                <SectionActions saving={saving === 'banner'} onSave={() => saveBanner(false)} onSaveRestart={() => saveBanner(true)} disabled={!bannerFile} />
                            </div>
                        </div>

                        {/* FOOTER SAVE ALL (sticky) */}
                        <div className="config-saveall">
                            <div className="config-actions">
                                <button className="btn btn-outline" onClick={() => saveAll(false)} disabled={isSaving}>
                                    {saving === 'all' ? <><Loader2 className="spin" size={14} /> Menyimpan...</> : <><Save size={14} /> Save All</>}
                                </button>
                                <button className="btn btn-primary" onClick={() => saveAll(true)} disabled={isSaving}>
                                    <><Save size={14} /> Save All & Restart</>
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

// Tombol aksi per section: [Save] [Save & Restart]
function SectionActions({ saving, onSave, onSaveRestart, disabled }) {
    return (
        <div className="config-actions">
            <button className="btn btn-outline btn-sm" onClick={onSave} disabled={saving || disabled}>
                {saving ? <><Loader2 className="spin" size={13} /> Menyimpan...</> : <><Save size={13} /> Save</>}
            </button>
            <button className="btn btn-primary btn-sm" onClick={onSaveRestart} disabled={saving || disabled}>
                <><Save size={13} /> Save & Restart</>
            </button>
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

function SystemLogsView({ logs, onRefresh }) {
    const [filter, setFilter] = useState('all')
    
    const filtered = filter === 'all' ? logs : logs.filter(l => l.type === filter)
    
    const renderDetails = (log) => {
        if (!log.details) return null
        const d = log.details
        
        if (log.type === 'expiry') {
            return (
                <div className="log-details">
                    <span>Stopped: {d.stopped || 0} ✅</span>
                    <span>Failed: {d.failed || 0} ❌</span>
                    {d.details && d.details.length > 0 && (
                        <div className="log-list">
                            {d.details.map((item, i) => <div key={i}>{item}</div>)}
                        </div>
                    )}
                </div>
            )
        }
        
        if (log.type === 'backup') {
            return (
                <div className="log-details">
                    <span>📅 {d.date}</span>
                    <span>Total: {d.total}</span>
                    <span>Success: {d.success} ✅</span>
                    <span>Failed: {d.failed} ❌</span>
                    <span style={{fontSize: '0.85em', color: '#888'}}>☁️ {d.remote_path}</span>
                    {d.details && d.details.length > 0 && (
                        <div className="log-list">
                            {d.details.map((item, i) => <div key={i}>{item}</div>)}
                        </div>
                    )}
                </div>
            )
        }
        
        return <pre style={{fontSize: '0.85em', color: '#888'}}>{JSON.stringify(d, null, 2)}</pre>
    }
    
    return (
        <div>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                <h2 className="admin-title">System Logs</h2>
                <button className="btn btn-outline btn-sm" onClick={onRefresh} title="Refresh logs">
                    <RotateCw size={14} /> Refresh
                </button>
            </div>
            
            <div className="admin-card" style={{marginBottom: '1rem'}}>
                <div style={{display: 'flex', gap: '0.5rem'}}>
                    <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('all')}>
                        All ({logs.length})
                    </button>
                    <button className={`btn btn-sm ${filter === 'expiry' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('expiry')}>
                        ⏰ Expiry ({logs.filter(l => l.type === 'expiry').length})
                    </button>
                    <button className={`btn btn-sm ${filter === 'backup' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('backup')}>
                        💾 Backup ({logs.filter(l => l.type === 'backup').length})
                    </button>
                </div>
            </div>

            <div className="admin-card">
                {filtered.length === 0 ? (
                    <p className="admin-empty">No logs yet.</p>
                ) : (
                    <div className="audit-list">
                        {filtered.map(log => (
                            <div className="audit-item" key={log.id} style={{display: 'block'}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
                                    <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                                        <span className={`badge ${log.type === 'expiry' ? 'badge-yellow' : 'badge-blue'}`}>
                                            {log.type === 'expiry' ? '⏰ Expiry' : '💾 Backup'}
                                        </span>
                                        <span style={{fontWeight: 500}}>{log.message}</span>
                                    </div>
                                    <span className="audit-time">{fmtTime(log.created_at)}</span>
                                </div>
                                {renderDetails(log)}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
