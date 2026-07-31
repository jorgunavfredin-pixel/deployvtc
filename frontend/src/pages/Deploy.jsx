import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { KeyRound, Settings, CheckCircle, Copy, ArrowLeft, Rocket, Home } from 'lucide-react'
import Navbar from '../components/Navbar'

// ==================== THEME COLORS ====================
const THEME_COLORS = {
    gold: { bg: 'linear-gradient(135deg, #1a1a2e, #16213e)', frame: '#ffd700', text: '#ffd700' },
    purple: { bg: 'linear-gradient(135deg, #0d0d0d, #1a0a2e)', frame: '#a855f7', text: '#a855f7' },
    blue: { bg: 'linear-gradient(135deg, #0a1628, #0f2645)', frame: '#3b82f6', text: '#3b82f6' },
    green: { bg: 'linear-gradient(135deg, #0a1a0a, #0d2818)', frame: '#22c55e', text: '#22c55e' },
    red: { bg: 'linear-gradient(135deg, #1a0a0a, #2d1111)', frame: '#ef4444', text: '#ef4444' },
    cyan: { bg: 'linear-gradient(135deg, #0a1a1a, #0d2828)', frame: '#06b6d4', text: '#06b6d4' },
    orange: { bg: 'linear-gradient(135deg, #1a120a, #2d1f0d)', frame: '#f97316', text: '#f97316' },
    white: { bg: 'linear-gradient(135deg, #1e293b, #0f172a)', frame: '#f8fafc', text: '#f8fafc' },
    pink: { bg: 'linear-gradient(135deg, #1a0a14, #2d0d1e)', frame: '#ec4899', text: '#ec4899' },
    lime: { bg: 'linear-gradient(135deg, #0a1a0a, #142d0d)', frame: '#84cc16', text: '#84cc16' },
}

const THEME_OPTIONS = [
    { value: 'gold', label: '🟡 Gold — Emas + Navy' },
    { value: 'purple', label: '🟣 Purple — Ungu + Hitam' },
    { value: 'blue', label: '🔵 Blue — Biru + Navy' },
    { value: 'green', label: '🟢 Green — Hijau + Hijau Tua' },
    { value: 'red', label: '🔴 Red — Merah + Merah Tua' },
    { value: 'cyan', label: '🔵 Cyan — Cyan + Teal' },
    { value: 'orange', label: '🟠 Orange — Oranye + Coklat' },
    { value: 'white', label: '⚪ White — Putih + Biru Tua' },
    { value: 'pink', label: '🩷 Pink — Pink + Merah Tua' },
    { value: 'lime', label: '🟢 Lime — Lime + Hijau Tua' },
]

// ==================== STEP INDICATOR ====================
function StepIndicator({ current }) {
    return (
        <div className="step-indicator">
            {[1, 2, 3].map((n, i) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className={`step-dot ${n < current ? 'done' : n === current ? 'active' : ''}`}>
                        {n < current ? '✓' : n}
                    </div>
                    {i < 2 && <div className={`step-line ${n < current ? 'active' : ''}`} />}
                </div>
            ))}
        </div>
    )
}

// ==================== STEP 1: LICENSE ====================
function LicenseStep({ onValid }) {
    const [key, setKey] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [info, setInfo] = useState(null)

    const validate = async () => {
        const k = key.trim().toUpperCase()
        if (!k) return setError('Masukkan license key.')
        setLoading(true)
        setError('')
        setInfo(null)

        try {
            const res = await fetch('/api/validate-license', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: k })
            })
            const data = await res.json()
            if (data.valid) {
                setInfo({ buyer: data.buyer_name, tier: data.tier || 'full' })
            } else {
                setError(data.reason || 'License tidak valid.')
            }
        } catch {
            setError('Gagal validasi. Coba lagi.')
        }
        setLoading(false)
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35 }}
        >
            <div className="deploy-header">
                <h1><KeyRound size={24} style={{ verticalAlign: '-4px', marginRight: '0.5rem' }} />License Key</h1>
                <p>Masukkan license key yang kamu terima setelah pembelian.</p>
            </div>

            {error && <div className="alert alert-error">❌ {error}</div>}

            <div className="form-group">
                <label className="form-label">License Key *</label>
                <input
                    className="form-input"
                    type="text"
                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                    maxLength={39}
                    value={key}
                    onChange={e => setKey(e.target.value)}
                    style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace", letterSpacing: '1px' }}
                    autoComplete="off"
                />
            </div>

            {info && (
                <div className="alert" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
                    <div><strong>👤 {info.buyer}</strong></div>
                    <div>Tier: {info.tier === 'chat' ? '🔵 Chat saja (tanpa web admin)' : '🟢 Full (Web + Chat)'}</div>
                </div>
            )}

            <button
                className="btn btn-primary btn-lg btn-full"
                onClick={validate}
                disabled={loading}
            >
                {loading ? <><span className="spinner" /> Validating...</> : <><CheckCircle size={18} /> Validasi License</>}
            </button>

            {info && (
                <button
                    className="btn btn-outline btn-full"
                    style={{ marginTop: '0.75rem' }}
                    onClick={() => onValid(key, info.tier || 'full')}
                >
                    Lanjut ke Konfigurasi →
                </button>
            )}
        </motion.div>
    )
}

// ==================== STEP 2: CONFIG ====================
function ConfigStep({ licenseKey, tier, onDeploy }) {
    const [form, setForm] = useState({
        botToken: '', adminId: '', storeName: '', orderPrefix: 'ORD',
        adminPanelPassword: '', supportUsername: '',
        supportHours: '09:00 - 23:00 WIB', themePreset: 'gold',
        // PaKasir
        pakasirApiKey: '', pakasirSlug: '',
        // WijayaPay
        wijayapayCodeMerchant: '', wijayapayApiKey: '',
        // Xoftware
        xoftwareApiKey: '', xoftwareMerchantId: '', xoftwareWebhookSecret: '',
        xoftwareNotifyUrl: '', xoftwareFeeDirection: 'merchant',
        // KlikQRIS
        klikqrisApiKey: '', klikqrisMerchantId: ''
    })
    const [banner, setBanner] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const theme = THEME_COLORS[form.themePreset] || THEME_COLORS.gold

    const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

    const deploy = async () => {
        const { botToken, adminId, storeName, adminPanelPassword, supportUsername } = form
        if (!botToken || !adminId || !storeName || !supportUsername) {
            return setError('Field wajib (bot token, admin id, nama toko, support username) harus diisi.')
        }
        if (tier === 'full' && !adminPanelPassword) {
            return setError('License tier FULL memerlukan Admin Panel Password.')
        }
        const hasGateway =
            (form.pakasirApiKey && form.pakasirSlug) ||
            (form.wijayapayCodeMerchant && form.wijayapayApiKey) ||
            (form.xoftwareApiKey && form.xoftwareMerchantId && form.xoftwareWebhookSecret) ||
            (form.klikqrisApiKey && form.klikqrisMerchantId)
        if (!hasGateway) return setError('Minimal satu payment gateway QRIS harus diisi (PaKasir / WijayaPay / Xoftware / KlikQRIS).')
        if (!banner) return setError('Banner toko wajib diupload (PNG only).')
        if (banner.type !== 'image/png') return setError('Banner harus berformat PNG.')

        setLoading(true)
        setError('')

        // Validate bot token first
        try {
            const tokenRes = await fetch('/api/validate-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: botToken.trim() })
            })
            const tokenData = await tokenRes.json()
            if (!tokenData.valid) {
                setLoading(false)
                return setError(tokenData.reason || 'Bot token tidak valid.')
            }
        } catch {
            setLoading(false)
            return setError('Gagal validasi token.')
        }

        // Build form data
        const fd = new FormData()
        fd.append('license_key', licenseKey)
        fd.append('bot_token', form.botToken.trim())
        fd.append('admin_id', form.adminId.trim())
        fd.append('store_name', form.storeName.trim())
        fd.append('order_prefix', form.orderPrefix.trim())
        fd.append('admin_panel_password', form.adminPanelPassword.trim())
        fd.append('support_username', form.supportUsername.trim())
        fd.append('support_hours', form.supportHours.trim())
        fd.append('theme_preset', form.themePreset)
        // PaKasir
        fd.append('pakasir_api_key', form.pakasirApiKey.trim())
        fd.append('pakasir_slug', form.pakasirSlug.trim())
        // WijayaPay
        fd.append('wijayapay_code_merchant', form.wijayapayCodeMerchant.trim())
        fd.append('wijayapay_api_key', form.wijayapayApiKey.trim())
        // Xoftware
        fd.append('xoftware_api_key', form.xoftwareApiKey.trim())
        fd.append('xoftware_merchant_id', form.xoftwareMerchantId.trim())
        fd.append('xoftware_webhook_secret', form.xoftwareWebhookSecret.trim())
        fd.append('xoftware_notify_url', form.xoftwareNotifyUrl.trim())
        fd.append('xoftware_fee_direction', form.xoftwareFeeDirection)
        // KlikQRIS
        fd.append('klikqris_api_key', form.klikqrisApiKey.trim())
        fd.append('klikqris_merchant_id', form.klikqrisMerchantId.trim())
        fd.append('banner', banner)

        try {
            const res = await fetch('/api/deploy', { method: 'POST', body: fd })
            const data = await res.json()
            if (data.success) {
                onDeploy(data)
            } else {
                setError(data.error || 'Deploy gagal.')
            }
        } catch (err) {
            setError('Deploy gagal: ' + err.message)
        }
        setLoading(false)
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35 }}
        >
            <div className="deploy-header">
                <h1><Settings size={24} style={{ verticalAlign: '-4px', marginRight: '0.5rem' }} />Konfigurasi Bot</h1>
                <p>Isi data di bawah untuk setup bot kamu.</p>
                <div className="alert" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 8, padding: '0.5rem 0.9rem', marginTop: '0.5rem', display: 'inline-block' }}>
                    {tier === 'chat' ? '🔵 Tier: Chat saja (tanpa web admin)' : '🟢 Tier: Full (Web + Chat)'}
                </div>
            </div>

            {error && <div className="alert alert-error">❌ {error}</div>}

            <div className="form-group">
                <label className="form-label">Bot Token *</label>
                <input className="form-input" placeholder="1234567890:ABCDefGHIJKLMNopqrstUVWXyz" value={form.botToken} onChange={set('botToken')} />
                <span className="form-hint">Dapatkan dari @BotFather di Telegram</span>
            </div>

            <div className="form-group">
                <label className="form-label">Admin Telegram ID *</label>
                <input className="form-input" placeholder="1234567890" value={form.adminId} onChange={set('adminId')} />
                <span className="form-hint">Dapatkan dari @userinfobot di Telegram</span>
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">Store Name *</label>
                    <input className="form-input" placeholder="NamaTokoKamu" value={form.storeName} onChange={set('storeName')} maxLength={30} />
                </div>
                <div className="form-group">
                    <label className="form-label">Format ID Pesanan *</label>
                    <input className="form-input" placeholder="ORD" value={form.orderPrefix} onChange={set('orderPrefix')} maxLength={5} />
                </div>
            </div>

            {tier !== 'chat' && (
                <div className="form-group">
                    <label className="form-label">Admin Panel Password *</label>
                    <input className="form-input" type="password" placeholder="Password untuk akses panel admin" value={form.adminPanelPassword} onChange={set('adminPanelPassword')} />
                    <span className="form-hint">Dipakai login di {`${window.location.origin}/admin`} setelah deploy</span>
                </div>
            )}

            <div className="form-group">
                <label className="form-label">Payment Gateway QRIS * (isi minimal satu)</label>
                <span className="form-hint">Pilih salah satu / beberapa provider. Yang kosong akan diabaikan.</span>
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">PaKasir API Key</label>
                    <input className="form-input" placeholder="API key dari PaKasir" value={form.pakasirApiKey} onChange={set('pakasirApiKey')} />
                </div>
                <div className="form-group">
                    <label className="form-label">PaKasir Slug</label>
                    <input className="form-input" placeholder="slug project PaKasir" value={form.pakasirSlug} onChange={set('pakasirSlug')} />
                </div>
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">WijayaPay Code Merchant</label>
                    <input className="form-input" placeholder="cth: WP692f1bafd86" value={form.wijayapayCodeMerchant} onChange={set('wijayapayCodeMerchant')} />
                </div>
                <div className="form-group">
                    <label className="form-label">WijayaPay API Key</label>
                    <input className="form-input" type="password" placeholder="API key dari WijayaPay" value={form.wijayapayApiKey} onChange={set('wijayapayApiKey')} />
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Xoftware API Key</label>
                <input className="form-input" type="password" placeholder="API key dari Xoftware" value={form.xoftwareApiKey} onChange={set('xoftwareApiKey')} />
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">Xoftware Merchant ID</label>
                    <input className="form-input" placeholder="cth: 12345" value={form.xoftwareMerchantId} onChange={set('xoftwareMerchantId')} />
                </div>
                <div className="form-group">
                    <label className="form-label">Xoftware Webhook Secret</label>
                    <input className="form-input" type="password" placeholder="Webhook secret Xoftware" value={form.xoftwareWebhookSecret} onChange={set('xoftwareWebhookSecret')} />
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">Xoftware Notify URL (opsional)</label>
                    <input className="form-input" placeholder="https://t.me/nama_bot" value={form.xoftwareNotifyUrl} onChange={set('xoftwareNotifyUrl')} />
                </div>
                <div className="form-group">
                    <label className="form-label">Xoftware Fee Direction</label>
                    <select className="form-input" value={form.xoftwareFeeDirection} onChange={set('xoftwareFeeDirection')}>
                        <option value="merchant">Merchant (fee dipotong settlement)</option>
                        <option value="user">User (fee ditambahkan ke buyer)</option>
                    </select>
                </div>
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">KlikQRIS API Key</label>
                    <input className="form-input" type="password" placeholder="API key dari KlikQRIS" value={form.klikqrisApiKey} onChange={set('klikqrisApiKey')} />
                </div>
                <div className="form-group">
                    <label className="form-label">KlikQRIS Merchant ID</label>
                    <input className="form-input" placeholder="cth: 123456789" value={form.klikqrisMerchantId} onChange={set('klikqrisMerchantId')} />
                </div>
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">Support Username *</label>
                    <input className="form-input" placeholder="username_telegram" value={form.supportUsername} onChange={set('supportUsername')} />
                    <span className="form-hint">Tanpa "@"</span>
                </div>
                <div className="form-group">
                    <label className="form-label">Support Hours *</label>
                    <input className="form-input" placeholder="09:00 - 23:00 WIB" value={form.supportHours} onChange={set('supportHours')} />
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Theme QRIS *</label>
                <select className="form-input" value={form.themePreset} onChange={set('themePreset')}>
                    {THEME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
            </div>

            {/* Theme Preview */}
            <div className="theme-preview">
                <div
                    className="theme-preview-box"
                    style={{
                        background: theme.bg,
                        border: `2px solid ${theme.frame}`
                    }}
                >
                    <div style={{
                        width: 120, height: 120,
                        background: 'rgba(255,255,255,0.15)',
                        borderRadius: 8,
                        border: `2px solid ${theme.frame}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '2.5rem'
                    }}>📱</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: theme.text }}>QRIS Preview</div>
                </div>
                <p>Preview frame QRIS sesuai theme</p>
            </div>

            <div className="form-group file-upload">
                <label className="form-label">Banner Toko * (PNG only)</label>
                <input
                    className="form-input"
                    type="file"
                    accept="image/png"
                    onChange={e => setBanner(e.target.files[0])}
                />
                <span className="form-hint">PNG only, maksimum 2MB. Akan tampil saat /start.</span>
            </div>

            <button
                className="btn btn-primary btn-lg btn-full"
                onClick={deploy}
                disabled={loading}
                style={{ marginTop: '0.75rem' }}
            >
                {loading ? <><span className="spinner" /> Deploying...</> : <><Rocket size={18} /> Deploy Bot</>}
            </button>
        </motion.div>
    )
}

// ==================== STEP 3: RESULT ====================
function ResultStep({ data, licenseKey }) {
    const [logs, setLogs] = useState('⏳ Waiting for container to start...\n')
    const logRef = useRef(null)

    useEffect(() => {
        try {
            const evtSource = new EventSource(`/api/deploy-logs/${licenseKey}`)
            evtSource.onmessage = (event) => {
                const d = JSON.parse(event.data)
                if (d.type === 'log') {
                    setLogs(d.content)
                }
                if (d.type === 'status' && d.running) {
                    setLogs(prev => prev + '\n\n✅ Bot is running!\n')
                }
                if (d.type === 'done') {
                    evtSource.close()
                    setLogs(prev => prev + (d.running ? '\n🟢 Container ready.' : '\n⚠️ Container may still be starting...'))
                }
            }
            evtSource.onerror = () => {
                evtSource.close()
                setLogs(prev => prev + '\n\n📡 Log stream ended.')
            }
            return () => evtSource.close()
        } catch {
            setLogs('Could not connect to log stream.')
        }
    }, [licenseKey])

    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, [logs])

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
        >
            <div className="deploy-header">
                <h1><CheckCircle size={24} style={{ verticalAlign: '-4px', marginRight: '0.5rem', color: 'var(--success)' }} />Deploy Berhasil!</h1>
                <p>Bot kamu sudah aktif dan berjalan.</p>
            </div>

            <div className="result-card">
                <h3>📋 Detail Deployment</h3>
                <div className="result-item">
                    <span className="result-label">Admin Panel</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className="result-value">{data.adminUrl}</span>
                        <button className="copy-btn" onClick={() => navigator.clipboard.writeText(data.adminUrl)}><Copy size={12} /> Copy</button>
                    </div>
                </div>
                <div className="result-item">
                    <span className="result-label">Webhook URL(s)</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {(data.webhooks || []).map(w => (
                            <div key={w.provider} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span className="result-value" style={{ fontSize: '0.8rem' }}>{w.provider}: {w.url}</span>
                                <button className="copy-btn" onClick={() => navigator.clipboard.writeText(w.url)}><Copy size={12} /> Copy</button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="result-item">
                    <span className="result-label">Port</span>
                    <span className="result-value">{data.port}</span>
                </div>
                <div className="result-item">
                    <span className="result-label">Status</span>
                    <span className="result-value" style={{ color: 'var(--success)' }}>🟢 Running</span>
                </div>
            </div>

            <div className="result-card">
                <h3>📄 Container Logs</h3>
                <div className="log-viewer" ref={logRef}>{logs}</div>
            </div>

            <div className="result-card">
                <h3>📝 Langkah Selanjutnya</h3>
                <ol className="instructions">
                    <li>Buka panel admin: <code>{data.adminUrl}</code> (password yang kamu isi)</li>
                    {data.webhooks && data.webhooks.length > 0 ? data.webhooks.map(w => (
                        <li key={w.provider}>Set callback <strong>{w.provider}</strong> ke: <code>{w.url}</code></li>
                    )) : null}
                    <li>Buka bot kamu di Telegram, ketik <code>/start</code></li>
                    <li>Tambah produk & stok dari Admin Panel</li>
                    <li>Bot sudah siap! 🎉 Mulai jualan sekarang</li>
                </ol>
            </div>

            <Link to="/" className="btn btn-outline btn-full" style={{ marginTop: '1rem' }}>
                <Home size={18} /> Kembali ke Home
            </Link>
        </motion.div>
    )
}

// ==================== MAIN DEPLOY PAGE ====================
export default function Deploy() {
    const [step, setStep] = useState(1)
    const [licenseKey, setLicenseKey] = useState('')
    const [licenseTier, setLicenseTier] = useState('full')
    const [deployData, setDeployData] = useState(null)

    const handleLicenseValid = (key, tier) => {
        setLicenseKey(key)
        setLicenseTier(tier || 'full')
        setStep(2)
    }

    const handleDeploy = (data) => {
        setDeployData(data)
        setStep(3)
    }

    return (
        <>
            <Navbar />
            <div className="deploy-page">
                <div className="deploy-container">
                    <StepIndicator current={step} />

                    <AnimatePresence mode="wait">
                        {step === 1 && <LicenseStep key="s1" onValid={handleLicenseValid} />}
                        {step === 2 && <ConfigStep key="s2" licenseKey={licenseKey} tier={licenseTier} onDeploy={handleDeploy} />}
                        {step === 3 && <ResultStep key="s3" data={deployData} licenseKey={licenseKey} />}
                    </AnimatePresence>
                </div>
            </div>
        </>
    )
}
