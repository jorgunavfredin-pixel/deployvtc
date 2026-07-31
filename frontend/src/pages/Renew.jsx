import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { KeyRound, RefreshCw, CheckCircle, Clock, CreditCard, Home, X, QrCode, Loader } from 'lucide-react'
import Navbar from '../components/Navbar'

const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')

export default function Renew() {
    const [key, setKey] = useState('')
    const [info, setInfo] = useState(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    // Durasi & harga
    const [customDays, setCustomDays] = useState('')
    const [paying, setPaying] = useState(false)

    // Popup pembayaran
    const [payModal, setPayModal] = useState(null) // { order_id, amount, days, qr, signature, status }
    const [confirming, setConfirming] = useState(false)
    const [successView, setSuccessView] = useState(null) // { days, newExpiresAt } — layar sukses penuh

    const checkLicense = async () => {
        const k = key.trim().toUpperCase()
        if (!k) return setError('Masukkan license key.')
        setLoading(true); setError(''); setInfo(null)
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

    const pricePerDay = info?.pricing?.price_per_day || 1000
    const pricePerMonth = info?.pricing?.price_per_month || 30000

    const selectedDays = () => {
        const c = parseInt(customDays)
        if (c > 0) return Math.min(3650, c)
        return 0
    }
    const totalPrice = () => selectedDays() * pricePerDay

    const startPay = async () => {
        const d = selectedDays()
        if (!info || !d) return setError('Pilih durasi dulu (hari bebas).')
        setPaying(true); setError('')
        try {
            const res = await fetch('/api/renew/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: info.license.key, days: d })
            })
            const data = await res.json()
            if (data.success) {
                setPayModal({
                    order_id: data.order_id,
                    amount: data.amount,
                    days: data.days,
                    signature: data.signature,
                    qr: data.qris_image || data.qris_url || null,
                    status: 'created'
                })
                // Trigger Snap KlikQRIS (kalau SDK tersedia) — QR juga ditampilkan manual
                if (data.signature) loadSnap(data)
            } else {
                setError(data.error || 'Gagal membuat transaksi.')
            }
        } catch { setError('Gagal membuat transaksi. Coba lagi.') }
        setPaying(false)
    }

    const loadSnap = (data) => {
        // Muat script Snap Payment KlikQRIS (idempoten)
        if (!document.getElementById('klikqris-snap')) {
            const script = document.createElement('script')
            script.id = 'klikqris-snap'
            script.src = 'https://klikqris.com/js/payment-snap.js?t=' + new Date().getTime()
            document.body.appendChild(script)
        }
    }

    const confirmPay = async () => {
        if (!payModal?.order_id) return
        setConfirming(true)
        try {
            const res = await fetch('/api/renew/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: payModal.order_id })
            })
            const data = await res.json()
            if (data.success && data.paid) {
                // Sukses: update detail license + tampilkan layar sukses penuh
                const chk = await fetch(`/api/renew/check?key=${encodeURIComponent(info.license.key)}`).then(r => r.json())
                if (chk.success) setInfo(chk)
                setPayModal(null)
                setSuccessView({
                    days: payModal.days,
                    amount: payModal.amount,
                    newExpiresAt: data.extended?.newExpiresAt || chk.license?.expires_at || null
                })
            } else if (data.success && data.already_paid) {
                // Sudah dibayar sebelumnya — langsung sukses juga
                const chk = await fetch(`/api/renew/check?key=${encodeURIComponent(info.license.key)}`).then(r => r.json())
                if (chk.success) setInfo(chk)
                setPayModal(null)
                setSuccessView({ days: payModal.days, amount: payModal.amount, newExpiresAt: chk.license?.expires_at || null })
            } else if (data.success) {
                setPayModal(m => ({ ...m, status: data.status === 'expired' ? 'expired' : 'pending', message: data.message }))
            } else {
                setError(data.error || 'Gagal konfirmasi.')
            }
        } catch { setError('Gagal konfirmasi. Coba lagi.') }
        setConfirming(false)
    }

    const closeModal = () => setPayModal(null)

    const closeIfPaid = () => {
        // Kalau status paid, tutup setelah user lihat konfirmasi (klik tombol tutup)
        setPayModal(null)
    }

    const closeSuccess = () => setSuccessView(null)

    return (
        <>
            <Navbar />

            {/* ==================== SUCCESS FULLSCREEN VIEW ==================== */}
            {successView && (
                <div className="success-fullscreen">
                    <motion.div
                        className="success-box"
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                    >
                        <motion.div
                            className="success-check"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 15 }}
                        >
                            <CheckCircle size={56} />
                        </motion.div>
                        <h2>Pembayaran Berhasil! 🎉</h2>
                        <p>License kamu berhasil diperpanjang.</p>
                        <div className="success-details">
                            <div className="success-row"><span>Durasi</span><strong>+{successView.days} hari</strong></div>
                            <div className="success-row"><span>Total Bayar</span><strong>{fmtRp(successView.amount)}</strong></div>
                            {successView.newExpiresAt && (
                                <div className="success-row"><span>Expired Baru</span><strong>{new Date(successView.newExpiresAt).toLocaleDateString('id-ID')}</strong></div>
                            )}
                        </div>
                        <button className="btn btn-primary btn-lg btn-full" onClick={closeSuccess} style={{ marginTop: '1rem' }}>
                            Lihat Detail Lisensi
                        </button>
                    </motion.div>
                </div>
            )}

            <div className="deploy-page">
                <div className="deploy-container">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                        <div className="deploy-header">
                            <h1><RefreshCw size={24} style={{ verticalAlign: '-4px', marginRight: '0.5rem', color: 'var(--accent)' }} />Perpanjang License</h1>
                            <p>Cek status & perpanjang masa aktif bot kamu. Pembayaran via QRIS.</p>
                        </div>

                        {error && <div className="alert alert-error">❌ {error}</div>}

                        {/* Step A: Check license */}
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

                        {/* Step B: License info */}
                        {info && (
                            <div className="result-card" style={{ marginTop: '1.25rem' }}>
                                <h3>📋 Detail Lisensi</h3>
                                <div className="result-item"><span className="result-label">Buyer</span><span className="result-value">{info.license.buyer_name}</span></div>
                                <div className="result-item"><span className="result-label">Tier</span><span className="result-value">{info.license.tier === 'chat' ? '🔵 Chat saja' : '🟢 Full (Web + Chat)'}</span></div>
                                <div className="result-item"><span className="result-label">Status</span><span className="result-value">{info.license.running ? '🟢 Aktif' : '⚪ Tidak deploy'}</span></div>
                                <div className="result-item"><span className="result-label">Store</span><span className="result-value">{info.license.store_name || '-'}</span></div>
                                <div className="result-item"><span className="result-label">Expired</span><span className="result-value">{info.license.expires_at ? new Date(info.license.expires_at).toLocaleDateString('id-ID') : '-'}</span></div>
                                <div className="result-item">
                                    <span className="result-label">Sisa Hari</span>
                                    <span className="result-value" style={{ color: info.license.days_left <= 7 ? 'var(--error)' : 'var(--success)', fontWeight: 700 }}>
                                        {info.license.days_left} hari
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Step C: Choose duration + pay */}
                        {info && info.license.running && (
                            <div className="result-card" style={{ marginTop: '1rem' }}>
                                <h3>💳 Perpanjang Masa Aktif</h3>
                                <p style={{ marginBottom: '0.9rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                                    Harga: {fmtRp(pricePerMonth)}/bulan · {fmtRp(pricePerDay)}/hari
                                </p>

                                <div className="duration-grid">
                                    {[30, 60, 90].map(d => {
                                        const active = String(customDays) === String(d)
                                        return (
                                            <div key={d} className={`duration-option ${active ? 'active' : ''}`} onClick={() => setCustomDays(String(d))}>
                                                <div className="d-months">{d / 30} Bulan</div>
                                                <div className="d-days">{d} hari</div>
                                                <div className="d-price">{fmtRp(pricePerDay * d)}</div>
                                            </div>
                                        )
                                    })}
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
                                    <span className="result-value">{selectedDays() > 0 ? selectedDays() + ' hari' : '-'}</span>
                                </div>
                                <div className="result-item">
                                    <span className="result-label">Total Bayar</span>
                                    <span className="result-value" style={{ color: 'var(--accent-dark)', fontWeight: 800, fontSize: '1.1rem' }}>{selectedDays() > 0 ? fmtRp(totalPrice()) : '-'}</span>
                                </div>

                                <button className="btn btn-primary btn-lg btn-full" onClick={startPay} disabled={paying || selectedDays() < 1}>
                                    {paying ? <><span className="spinner" /> Membuat transaksi...</> : <><CreditCard size={18} /> Bayar Sekarang</>}
                                </button>
                            </div>
                        )}
                    </motion.div>

                    <Link to="/" className="btn btn-outline btn-full" style={{ marginTop: '1rem' }}>
                        <Home size={18} /> Kembali ke Home
                    </Link>
                </div>
            </div>

            {/* ==================== PAYMENT MODAL ==================== */}
            {payModal && (
                <div className="modal-overlay" onClick={payModal.status !== 'paid' ? closeModal : undefined}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <button className="modal-close" onClick={closeIfPaid} aria-label="Tutup">✕</button>

                        <div className="modal-title">
                            <QrCode size={20} color="var(--accent)" />
                            Pembayaran QRIS
                        </div>

                        {payModal.status === 'paid' ? (
                            <div className="pay-status-success" style={{ marginBottom: '1rem' }}>
                                <CheckCircle size={28} style={{ marginBottom: '0.4rem' }} />
                                <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>Pembayaran Berhasil! 🎉</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 400, marginTop: '0.4rem' }}>
                                    Masa aktif license diperpanjang.
                                </div>
                                {payModal.extended && (
                                    <div style={{ fontSize: '0.8rem', fontWeight: 400, marginTop: '0.3rem' }}>
                                        Expired baru: {new Date(payModal.extended.newExpiresAt).toLocaleDateString('id-ID')}
                                    </div>
                                )}
                            </div>
                        ) : payModal.status === 'pending' || payModal.status === 'expired' ? (
                            <div className="pay-status-pending" style={{ marginBottom: '1rem' }}>
                                {payModal.status === 'expired' ? '⏰ Transaksi kadaluarsa.' : '⏳ Pembayaran belum terdeteksi.'}
                                {payModal.message ? <div style={{ fontSize: '0.8rem', fontWeight: 400, marginTop: '0.3rem' }}>{payModal.message}</div> : null}
                            </div>
                        ) : null}

                        {/* QR Image */}
                        {payModal.status !== 'paid' && payModal.qr && (
                            <div className="qr-image-wrap">
                                <img src={payModal.qr} alt="QRIS Pembayaran" />
                            </div>
                        )}

                        {/* Summary */}
                        {payModal.status !== 'paid' && (
                            <div className="pay-summary">
                                <div className="pay-row"><span className="label">Order ID</span><span className="value" style={{ fontFamily: 'monospace' }}>{payModal.order_id}</span></div>
                                <div className="pay-row"><span className="label">Durasi</span><span className="value">{payModal.days} hari</span></div>
                                <div className="pay-row pay-total"><span className="label">Total Bayar</span><span className="value">{fmtRp(payModal.amount)}</span></div>
                                <div className="pay-row" style={{ fontSize: '0.78rem' }}>
                                    <span className="label">Termasuk fee / biaya unik</span>
                                    <span className="value" style={{ color: 'var(--text-dim)' }}>Otomatis</span>
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        {payModal.status !== 'paid' && (
                            <div className="pay-actions">
                                <button className="btn btn-primary" onClick={confirmPay} disabled={confirming} style={{ width: '100%' }}>
                                    {confirming ? <><span className="spinner" /> Mengecek...</> : <><CheckCircle size={16} /> Saya Sudah Bayar — Cek Status</>}
                                </button>
                                <button className="btn btn-outline" onClick={closeModal} style={{ width: '100%' }}>
                                    Tutup
                                </button>
                            </div>
                        )}

                        {payModal.status === 'paid' && (
                            <div className="pay-actions">
                                <button className="btn btn-primary" onClick={closeIfPaid} style={{ width: '100%' }}>
                                    <CheckCircle size={16} /> Selesai
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
