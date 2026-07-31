import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { KeyRound, Save, RefreshCw, Settings, Home, CheckCircle, Copy, AlertCircle } from 'lucide-react'
import Navbar from '../components/Navbar'

const PROVIDERS = [
    { value: 'pakasir', label: 'PaKasir', fields: [{ key: 'api_key', label: 'API Key', type: 'password' }, { key: 'slug', label: 'Project Slug', type: 'text' }] },
    { value: 'wijayapay', label: 'WijayaPay', fields: [{ key: 'code_merchant', label: 'Code Merchant', type: 'text' }, { key: 'api_key', label: 'API Key', type: 'password' }] },
    { value: 'xoftware', label: 'Xoftware Pay', fields: [{ key: 'api_key', label: 'API Key', type: 'password' }, { key: 'merchant_id', label: 'Merchant ID', type: 'text' }, { key: 'webhook_secret', label: 'Webhook Secret', type: 'password' }, { key: 'registered_notify_url', label: 'Notify URL (opsional)', type: 'text' }] },
    { value: 'klikqris', label: 'KlikQRIS', fields: [{ key: 'api_key', label: 'API Key', type: 'password' }, { key: 'merchant_id', label: 'Merchant ID', type: 'text' }] },
]

const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')

export default function Manage() {
    const [key, setKey] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [info, setInfo] = useState(null)

    // Gateway form
    const [provider, setProvider] = useState('')
    const [gatewayCreds, setGatewayCreds] = useState({})
    const [savingGw, setSavingGw] = useState(false)
    const [gwMsg, setGwMsg] = useState('')

    // Theme form
    const [qrisPresets, setQrisPresets] = useState([])
    const [themePreset, setThemePreset] = useState('')
    const [savingTheme, setSavingTheme] = useState(false)
    const [themeMsg, setThemeMsg] = useState('')

    // Banner
    const [bannerFile, setBannerFile] = useState(null)
    const [savingBanner, setSavingBanner] = useState(false)
    const [bannerMsg, setBannerMsg] = useState('')

    useEffect(() => {
        fetch('/api/qris-presets').then(r => r.json()).then(d => {
            if (d.success) setQrisPresets(d.presets)
        }).catch(() => { })
    }, [])

    const check = async () => {
        const k = key.trim().toUpperCase()
        if (!k) return setError('Masukkan license key.')
        setLoading(true); setError(''); setInfo(null)
        try {
            const res = await fetch('/api/manage/check', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: k })
            })
            const data = await res.json()
            if (data.success) {
                setInfo(data)
                setThemePreset(data.deployment.theme_preset || '')
                // Ambil gateway aktif sebagai default
                const active = (data.gateways || []).find(g => g.enabled === 1)
                if (active) {
                    setProvider(active.provider)
                    const pf = PROVIDERS.find(p => p.value === active.provider)
                    const creds = {}
                    if (pf) pf.fields.forEach(f => { creds[f.key] = active.credentials?.[f.key] || '' })
                    setGatewayCreds(creds)
                }
            } else {
                setError(data.error || 'Gagal cek. Coba lagi.')
            }
        } catch { setError('Gagal cek. Coba lagi.') }
        setLoading(false)
    }

    const setCred = (field) => (e) => setGatewayCreds(prev => ({ ...prev, [field]: e.target.value }))

    const saveGateway = async () => {
        if (!provider) return setGwMsg({ type: 'err', text: 'Pilih provider dulu.' })
        setSavingGw(true); setGwMsg('')
        try {
            const res = await fetch('/api/manage/update-gateway', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: info.license.key, provider, credentials: gatewayCreds })
            })
            const data = await res.json()
            setGwMsg({ type: data.success ? 'ok' : 'err', text: data.message || data.error })
        } catch { setGwMsg({ type: 'err', text: 'Gagal simpan gateway.' }) }
        setSavingGw(false)
    }

    const saveTheme = async () => {
        if (!themePreset) return setThemeMsg({ type: 'err', text: 'Pilih theme dulu.' })
        setSavingTheme(true); setThemeMsg('')
        try {
            const res = await fetch('/api/manage/update-theme', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: info.license.key, theme_preset: themePreset })
            })
            const data = await res.json()
            setThemeMsg({ type: data.success ? 'ok' : 'err', text: data.message || data.error })
        } catch { setThemeMsg({ type: 'err', text: 'Gagal simpan theme.' }) }
        setSavingTheme(false)
    }

    const saveBanner = async () => {
        if (!bannerFile) return setBannerMsg({ type: 'err', text: 'Pilih file banner dulu.' })
        setSavingBanner(true); setBannerMsg('')
        try {
            const fd = new FormData()
            fd.append('banner', bannerFile)
            fd.append('key', info.license.key)
            const res = await fetch('/api/manage/update-banner', { method: 'POST', body: fd })
            const data = await res.json()
            setBannerMsg({ type: data.success ? 'ok' : 'err', text: data.message || data.error })
        } catch { setBannerMsg({ type: 'err', text: 'Gagal upload banner.' }) }
        setSavingBanner(false)
    }

    const selectedProvider = PROVIDERS.find(p => p.value === provider)
    const activeGw = (info?.gateways || []).find(g => g.enabled === 1)

    return (
        <>
            <Navbar />
            <div className="deploy-page">
                <div className="deploy-container manage-container">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                        <div className="deploy-header">
                            <h1><Settings size={24} style={{ verticalAlign: '-4px', marginRight: '0.5rem', color: 'var(--accent)' }} />Kelola Bot</h1>
                            <p>Atur payment gateway & tampilan bot kamu. Akses pakai license key — tanpa perlu admin web.</p>
                        </div>

                        {error && <div className="alert alert-error">❌ {error}</div>}

                        {/* Step 1: license key */}
                        <div className="field-section">
                            <div className="field-section-head">
                                <span className="field-section-icon">🔑</span>
                                <div>
                                    <div className="field-section-title">Akses Kelola</div>
                                    <div className="field-section-desc">Masukkan license key bot kamu</div>
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                <input
                                    className="form-input"
                                    type="text"
                                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                                    maxLength={39}
                                    value={key}
                                    onChange={e => setKey(e.target.value)}
                                    style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace", letterSpacing: '1px' }}
                                />
                            </div>
                            <button className="btn btn-primary btn-full" onClick={check} disabled={loading}>
                                {loading ? <><span className="spinner" /> Mengecek...</> : <><KeyRound size={18} /> Cek & Buka Kelola</>}
                            </button>
                        </div>

                        {info && (
                            <>
                                {/* Status */}
                                <div className="field-section">
                                    <div className="field-section-head">
                                        <span className="field-section-icon">📊</span>
                                        <div>
                                            <div className="field-section-title">Status Bot</div>
                                            <div className="field-section-desc">{info.license.buyer_name} · {info.license.tier === 'chat' ? '🔵 Chat saja' : '🟢 Full (Web + Chat)'}</div>
                                        </div>
                                    </div>
                                    <div className="result-item"><span className="result-label">Store</span><span className="result-value">{info.deployment.store_name || '-'}</span></div>
                                    <div className="result-item"><span className="result-label">Port</span><span className="result-value">{info.deployment.port}</span></div>
                                    <div className="result-item"><span className="result-label">Status</span><span className="result-value" style={{ color: 'var(--success)' }}>🟢 Running</span></div>
                                    <div className="result-item"><span className="result-label">Expired</span><span className="result-value">{info.deployment.expires_at ? new Date(info.deployment.expires_at).toLocaleDateString('id-ID') : '-'}</span></div>
                                    {info.license.tier !== 'chat' && info.deployment.admin_url && (
                                        <div className="result-item">
                                            <span className="result-label">Admin Panel</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <span className="result-value" style={{ fontSize: '0.8rem' }}>{info.deployment.admin_url}</span>
                                                <button className="copy-btn" onClick={() => navigator.clipboard.writeText(info.deployment.admin_url)}><Copy size={12} /> Copy</button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Gateway */}
                                <div className="field-section">
                                    <div className="field-section-head">
                                        <span className="field-section-icon">💳</span>
                                        <div>
                                            <div className="field-section-title">Payment Gateway</div>
                                            <div className="field-section-desc">
                                                Aktif sekarang: <strong>{activeGw ? PROVIDERS.find(p => p.value === activeGw.provider)?.label || activeGw.provider : 'Tidak ada'}</strong>
                                            </div>
                                        </div>
                                    </div>

                                    {gwMsg && <div className={`alert ${gwMsg.type === 'ok' ? 'alert-success' : 'alert-error'}`}>{gwMsg.type === 'ok' ? '✅ ' : '❌ '}{gwMsg.text}</div>}

                                    <div className="form-group">
                                        <label className="form-label">Pilih Provider</label>
                                        <select className="form-input" value={provider} onChange={e => {
                                            setProvider(e.target.value)
                                            setGatewayCreds({})
                                        }}>
                                            <option value="">— Pilih Provider —</option>
                                            {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                        </select>
                                    </div>

                                    {selectedProvider && (
                                        <>
                                            {selectedProvider.fields.map(f => (
                                                <div className="form-group" key={f.key}>
                                                    <label className="form-label">{f.label} *</label>
                                                    <input
                                                        className="form-input"
                                                        type={f.type}
                                                        placeholder={f.label}
                                                        value={gatewayCreds[f.key] || ''}
                                                        onChange={setCred(f.key)}
                                                    />
                                                </div>
                                            ))}
                                            <button className="btn btn-primary btn-full" onClick={saveGateway} disabled={savingGw}>
                                                {savingGw ? <><span className="spinner" /> Menyimpan...</> : <><Save size={18} /> Aktifkan Gateway Ini</>}
                                            </button>
                                            <span className="form-hint" style={{ display: 'block', marginTop: '0.5rem' }}>
                                                Gateway lain otomatis dinonaktifkan. Bot restart otomatis.
                                            </span>
                                        </>
                                    )}
                                </div>

                                {/* Theme */}
                                <div className="field-section">
                                    <div className="field-section-head">
                                        <span className="field-section-icon">🎨</span>
                                        <div>
                                            <div className="field-section-title">Theme QRIS</div>
                                            <div className="field-section-desc">Ganti frame QRIS invoice</div>
                                        </div>
                                    </div>

                                    {themeMsg && <div className={`alert ${themeMsg.type === 'ok' ? 'alert-success' : 'alert-error'}`}>{themeMsg.type === 'ok' ? '✅ ' : '❌ '}{themeMsg.text}</div>}

                                    <div className="form-group">
                                        <label className="form-label">Preset</label>
                                        <select className="form-input" value={themePreset} onChange={e => setThemePreset(e.target.value)}>
                                            <option value="">— Pilih Preset —</option>
                                            {qrisPresets.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                                        </select>
                                    </div>
                                    <button className="btn btn-primary btn-full" onClick={saveTheme} disabled={savingTheme}>
                                        {savingTheme ? <><span className="spinner" /> Menyimpan...</> : <><Save size={18} /> Ganti Theme</>}
                                    </button>
                                </div>

                                {/* Banner */}
                                <div className="field-section">
                                    <div className="field-section-head">
                                        <span className="field-section-icon">🖼</span>
                                        <div>
                                            <div className="field-section-title">Banner Toko</div>
                                            <div className="field-section-desc">Ganti banner tampil di /start</div>
                                        </div>
                                    </div>

                                    {bannerMsg && <div className={`alert ${bannerMsg.type === 'ok' ? 'alert-success' : 'alert-error'}`}>{bannerMsg.type === 'ok' ? '✅ ' : '❌ '}{bannerMsg.text}</div>}

                                    <div className="form-group">
                                        <label className="form-label">File Banner</label>
                                        <input
                                            className="form-input"
                                            type="file"
                                            accept="image/png,image/jpeg,image/webp,image/gif"
                                            onChange={e => setBannerFile(e.target.files[0])}
                                        />
                                        <span className="form-hint">PNG/JPG/WebP/GIF, maks 5MB</span>
                                    </div>
                                    <button className="btn btn-primary btn-full" onClick={saveBanner} disabled={savingBanner}>
                                        {savingBanner ? <><span className="spinner" /> Upload...</> : <><Save size={18} /> Ganti Banner</>}
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>

                    <Link to="/" className="btn btn-outline btn-full" style={{ marginTop: '1rem' }}>
                        <Home size={18} /> Kembali ke Home
                    </Link>
                </div>
            </div>
        </>
    )
}
