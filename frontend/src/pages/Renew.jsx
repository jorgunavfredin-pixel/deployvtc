import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { KeyRound, RefreshCw, CheckCircle, Clock, CreditCard, Home, ArrowLeft } from 'lucide-react'
import Navbar from '../components/Navbar'

const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')

export default function Renew() {
    const [key, setKey] = useState('')
    const [info, setInfo] = useState(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    // Pembayaran
    const [days, setDays] = useState(30)
    const [customDays, setCustomDays] = useState('')
    const [paying, setPaying] = useState(false)
    const [orderId, setOrderId] = useState(null)
    const [payStatus, setPayStatus] = useState(null)
    const [confirming, setConfirming] = useState(false)

    const checkLicense = async () => {
        const k = key.trim().toUpperCase()
        if (!k) return setError('Masukkan license key.')
        setLoading(true); setError(''); setInfo(null); setPayStatus(null); setOrderId(null)
        try {
            const res = await fetch(`/api/renew/check?key=${encodeURIComponent(k)}`)
            const data = await res.json()
            if (data.success) {
                setInfo(data)
            } else {
                setError(data.reason || 'License tidak ditemukan.')
            }
        } catch { setError('Gagal cek status. Coba lagi.') }
        setLoading(false)
    }

    const selectedDays = () => {
        if (customDays && parseInt(customDays) > 0) return Math.min(3650, parseInt(customDays))
        return parseInt(days) || 30
    }
    const pricePerDay = info?.pricing?.price_per_day || 1000
    const totalPrice = selectedDays() * pricePerDay

    const startPay = async () => {
        const d = selectedDays()
        if (!info || !d) return
        setPaying(true); setError(''); setPayStatus(null)
        try {
            const res = await fetch('/api/renew/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: info.license.key, days: d })
            })
            const data = await res.json()
            if (data.success) {
                setOrderId(data.order_id)
                setPayStatus({ type: 'created', order_id: data.order_id, amount: data.amount, signature: data.signature, qris_url: data.qris_url })
                openSnap(data)
            } else {
                setError(data.error || 'Gagal membuat transaksi.')
            }
        } catch { setError('Gagal membuat transaksi. Coba lagi.') }
        setPaying(false)
    }

    const openSnap = (data) => {
        // Muat script Snap Payment KlikQRIS (idempoten)
        if (!window.__klikqrisSnapLoaded) {
            const script = document.createElement('script')
            script.src = 'https://klikqris.com/js/payment-snap.js?t=' + new Date().getTime()
            script.onload = () => {
                window.__klikqrisSnapLoaded = true
                triggerSnap(data)
            }
            document.body.appendChild(script)
        } else {
            triggerSnap(data)
        }
    }

    const triggerSnap = (data) => {
        // Snap KlikQRIS membaca tombol dengan data-signature, lalu tampilkan modal.
        // Kita buat tombol tersembunyi & klik programatik kalau window.KlikQrisSnap tersedia.
        try {
            if (window.KlikQrisSnap) {
                window.KlikQrisSnap.pay(data.signature, {
                    onSuccess: () => setPayStatus(p => ({ ...p, snap: 'success' })),
                    onPending: () => setPayStatus(p => ({ ...p, snap: 'pending' })),
                    onError: () => setPayStatus(p => ({ ...p, snap: 'error' }))
                })
            } else {
                // Fallback: buka QRIS URL kalau ada
                if (data.qris_url) window.open(data.qris_url, '_blank')
                else setPayStatus(p => ({ ...p, snap: 'manual' }))
            }
        } catch (e) {
            if (data.qris_url) window.open(data.qris_url, '_blank')
            else setPayStatus(p => ({ ...p, snap: 'manual' }))
        }
    }

    const confirmPay = async () => {
        if (!orderId) return
        setConfirming(true); setError('')
        try {
            const res = await fetch('/api/renew/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId })
            })
            const data = await res.json()
            if (data.success && data.paid) {
                setPayStatus({ type: 'paid', ...data })
                // Refresh info license (sisa hari baru)
                const chk = await fetch(`/api/renew/check?key=${encodeURIComponent(info.license.key)}`).then(r => r.json())
                if (chk.success) setInfo(chk)
            } else if (data.success) {
                setPayStatus({ type: 'pending', message: data.message || 'Belum terbayar. Cek lagi nanti.' })
            } else {
                setError(data.error || 'Gagal konfirmasi.')
            }
        } catch { setError('Gagal konfirmasi. Coba lagi.') }
        setConfirming(false)
    }

    return (
        <>
            <Navbar />
            <div className="deploy-page">
                <div className="deploy-container">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                        <div className="deploy-header">
                            <h1><RefreshCw size={24} style={{ verticalAlign: '-4px', marginRight: '0.5rem', color: 'var(--success)' }} />Perpanjang License</h1>
                            <p>Cek status & perpanjang masa aktif bot kamu.</p>
                        </div>

                        {error && <div className="alert alert-error">❌ {error}</div>}

                        {/* STEP A: Check license */}
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
                            />
                        </div>
                        <button className="btn btn-primary btn-lg btn-full" onClick={checkLicense} disabled={loading}>
                            {loading ? <><span className="spinner" /> Cek...</> : <><KeyRound size={18} /> Cek Status License</>}
                        </button>

                        {/* STEP B: License info */}
                        {info && (
                            <div className="result-card" style={{ marginTop: '1.25rem' }}>
                                <h3>📋 Detail Lisensi</h3>
                                <div className="result-item"><span className="result-label">Buyer</span><span className="result-value">{info.license.buyer_name}</span></div>
                                <div className="result-item"><span className="result-label">Tier</span><span className="result-value">{info.license.tier === 'chat' ? '🔵 Chat saja' : '🟢 Full (Web + Chat)'}</span></div>
                                <div className="result-item"><span className="result-label">Status</span><span className="result-value">{info.license.running ? '🟢 Running' : '⚪ Tidak deploy'}</span></div>
                                <div className="result-item"><span className="result-label">Store</span><span className="result-value">{info.license.store_name || '-'}</span></div>
                                <div className="result-item"><span className="result-label">Expired</span><span className="result-value">{info.license.expires_at ? new Date(info.license.expires_at).toLocaleDateString('id-ID') : '-'}</span></div>
                                <div className="result-item">
                                    <span className="result-label">Sisa Hari</span>
                                    <span className="result-value" style={{ color: info.license.days_left <= 7 ? '#ef4444' : 'var(--success)', fontWeight: 700 }}>
                                        {info.license.days_left} hari
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* STEP C: Choose duration + pay */}
                        {info && info.license.running && (
                            <div className="result-card" style={{ marginTop: '1rem' }}>
                                <h3>💳 Perpanjang Masa Aktif</h3>
                                <p style={{ marginBottom: '0.75rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                                    Harga: {fmtRp(info.pricing.price_per_month)}/bulan · {fmtRp(info.pricing.price_per_day)}/hari
                                </p>
                                <div className="form-row">
                                    {[30, 60, 90].map(d => (
                                        <div className="form-group" key={d} style={{ flex: 1 }}>
                                            <button
                                                className={`btn ${days === d && !customDays ? 'btn-primary' : 'btn-outline'}`}
                                                style={{ width: '100%' }}
                                                onClick={() => { setDays(d); setCustomDays('') }}
                                            >
                                                {d / 30} bulan
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Atau durasi bebas (hari)</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        min="1"
                                        max="3650"
                                        placeholder="misal: 45"
                                        value={customDays}
                                        onChange={e => setCustomDays(e.target.value)}
                                    />
                                </div>
                                <div className="result-item">
                                    <span className="result-label">Durasi</span>
                                    <span className="result-value">{selectedDays()} hari</span>
                                </div>
                                <div className="result-item">
                                    <span className="result-label">Total Bayar</span>
                                    <span className="result-value" style={{ color: 'var(--success)', fontWeight: 700, fontSize: '1.1rem' }}>{fmtRp(totalPrice)}</span>
                                </div>
                                <button className="btn btn-primary btn-lg btn-full" onClick={startPay} disabled={paying}>
                                    {paying ? <><span className="spinner" /> Membuat transaksi...</> : <><CreditCard size={18} /> Bayar Sekarang</>}
                                </button>

                                {/* After payment created */}
                                {orderId && payStatus?.type === 'created' && (
                                    <div style={{ marginTop: '1rem', padding: '0.9rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 8 }}>
                                        <p><strong>Order ID:</strong> <code>{orderId}</code></p>
                                        <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                                            {payStatus.snap === 'success'
                                                ? '✅ Pembayaran berhasil! Klik tombol di bawah untuk konfirmasi & aktifkan perpanjangan.'
                                                : payStatus.snap === 'pending'
                                                    ? '⏳ Menunggu pembayaran... Setelah bayar, klik "Cek Status".'
                                                    : 'Setelah menyelesaikan pembayaran, klik tombol di bawah untuk konfirmasi.'}
                                        </p>
                                        <button className="btn btn-success btn-lg btn-full" onClick={confirmPay} disabled={confirming} style={{ marginTop: '0.5rem' }}>
                                            {confirming ? <><span className="spinner" /> Mengecek...</> : <><CheckCircle size={18} /> Cek Status & Aktifkan</>}
                                        </button>
                                    </div>
                                )}

                                {payStatus?.type === 'paid' && (
                                    <div style={{ marginTop: '1rem', padding: '0.9rem', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 8 }}>
                                        <p style={{ color: 'var(--success)', fontWeight: 700 }}>✅ Pembayaran dikonfirmasi! Masa aktif diperpanjang.</p>
                                        {payStatus.extended && (
                                            <p style={{ fontSize: '0.85rem' }}>Expired baru: {new Date(payStatus.extended.newExpiresAt).toLocaleDateString('id-ID')}</p>
                                        )}
                                    </div>
                                )}

                                {payStatus?.type === 'pending' && (
                                    <div style={{ marginTop: '1rem', padding: '0.9rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8 }}>
                                        <p style={{ color: '#f59e0b' }}>⏳ {payStatus.message || 'Pembayaran belum terdeteksi.'}</p>
                                    </div>
                                )}
                            </div>
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
