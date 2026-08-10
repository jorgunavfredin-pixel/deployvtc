import { useMemo, useEffect, useRef, useState } from 'react'

// Deterministic 21x21 QR-like pattern (mirrors the mockup's generator)
function useQrCells() {
    return useMemo(() => {
        const N = 21
        const finder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7)
        const finderOn = (r, c) => {
            let br, bc
            if (r < 7 && c < 7) { br = r; bc = c }
            else if (r < 7 && c >= N - 7) { br = r; bc = c - (N - 7) }
            else { br = r - (N - 7); bc = c }
            if (br === 0 || br === 6 || bc === 0 || bc === 6) return true
            if (br >= 2 && br <= 4 && bc >= 2 && bc <= 4) return true
            return false
        }
        let seed = 987654321
        const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
        const cells = []
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                let on = false
                if (finder(r, c)) on = finderOn(r, c)
                else if (r === 6 || c === 6) on = (r + c) % 2 === 0
                else on = rnd() > 0.5
                cells.push(on)
            }
        }
        return cells
    }, [])
}

// Botable dark Telegram store bot chat mockup
export default function PhoneMockup() {
    const cells = useQrCells()
    const ref = useRef(null)
    const [play, setPlay] = useState(false)

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduce) { setPlay(true); return }
        const io = new IntersectionObserver((es) => {
            es.forEach(e => { if (e.isIntersecting) { setPlay(true); io.disconnect() } })
        }, { threshold: 0.3 })
        io.observe(el)
        const fallback = setTimeout(() => setPlay(true), 3500)
        return () => { io.disconnect(); clearTimeout(fallback) }
    }, [])

    const shown = (i) => (play ? 'show' : '')

    return (
        <>
            <div className="ld-phone-glow" />
            <div className="ld-float-card ld-fc1">
                <span className="fc-ic"><svg className="icon-sm" viewBox="0 0 24 24" style={{ width: 13, height: 13 }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></span>QRIS Verified
            </div>
            <div className="ld-float-card ld-fc2">
                <span className="fc-ic"><svg className="icon-sm" viewBox="0 0 24 24" style={{ width: 13, height: 13 }}><path d="M20 6 9 17l-5-5" /></svg></span>Auto Delivery
            </div>
            <div className="ld-float-card ld-fc3"><span className="ld-fc-dot" />Bot Active 24/7</div>

            <div className="ld-phone" ref={ref}>
                <div className="ld-screen">
                    <div className="ld-island" />
                    <div className="ld-tg-head">
                        <span className="ld-tg-back"><svg className="icon-sm" viewBox="0 0 24 24" style={{ width: 20, height: 20 }}><path d="M15 18l-6-6 6-6" /></svg></span>
                        <span className="ld-tg-av">VC</span>
                        <div className="ld-tg-meta"><div className="ld-tg-name">Vitacimin Store Bot</div><div className="ld-tg-status">online</div></div>
                        <span className="ld-tg-menu"><svg className="icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></svg></span>
                    </div>
                    <div className="ld-tg-body">
                        <div className={`ld-msg bot ${shown(1)}`}>Selamat datang di Vitacimin Store! Pilih produk:
                            <div className="ld-kbd">
                                <button>📦 Netflix</button><button>🎬 Disney+</button>
                                <button>🎮 Steam</button><button>💎 Diamond ML</button>
                                <button>⚡ Pulsa</button><button>🎵 Spotify</button>
                            </div>
                        </div>
                        <div className={`ld-msg user ${shown(2)}`}>Beli Netflix 1 Bulan<div className="time">14:02</div></div>
                        {!play && (
                            <div className="ld-typing"><span /><span /><span /></div>
                        )}
                        <div className={`ld-msg bot ${shown(4)}`}>
                            <div className="ld-order-line"><span>Produk</span><b>Netflix 1 Bulan</b></div>
                            <div className="ld-order-line"><span>Total</span><span className="ld-price-big">Rp 45.000</span></div>
                            <div className="ld-qr">
                                {cells.map((on, i) => <i key={i} className={on ? 'on' : ''} />)}
                            </div>
                            <div className="ld-qr-label">Scan QRIS untuk bayar</div>
                            <div className="ld-pay-btns"><button className="ld-pay-qris">Bayar QRIS</button><button className="ld-pay-saldo">Bayar Saldo</button></div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
