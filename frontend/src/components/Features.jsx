import Reveal from './Reveal'

// Botable dark features bento — 6 features, Lucide-style SVG icons, no fake statistics.
export default function Features() {
    return (
        <section className="ld-sec" id="fitur">
            <div className="wrap">
                <Reveal className="ld-sec-head">
                    <div className="ld-eyebrow">Fitur Lengkap</div>
                    <h2>Semua yang kamu butuhkan untuk jualan digital.</h2>
                </Reveal>
                <div className="ld-bento">
                    {/* Big preview — Deploy Instan */}
                    <Reveal className="ld-card ld-span2x2 ld-big-preview">
                        <div>
                            <div className="ld-feat-ic">
                                <svg className="icon" viewBox="0 0 24 24"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /></svg>
                            </div>
                            <h3>Deploy Instan</h3>
                            <p>Satu klik, bot langsung online. Panel admin &amp; payment gateway aktif otomatis dalam hitungan menit.</p>
                        </div>
                        <div className="ld-bp-viz">
                            <div className="row"><span className="rd" /><span className="rt">Provisioning bot</span><span className="rp">done</span></div>
                            <div className="row"><span className="rd" /><span className="rt">Payment gateway</span><span className="rp">aktif</span></div>
                            <div className="row"><span className="rd" /><span className="rt">Panel admin</span><span className="rp">live</span></div>
                            <div className="row"><span className="rt">Status</span><b style={{ marginLeft: 'auto' }}>Bot Online</b></div>
                        </div>
                    </Reveal>

                    {/* Multi-Payment (wide) */}
                    <Reveal className="ld-card ld-span2">
                        <div className="ld-feat-ic ind"><svg className="icon" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg></div>
                        <h3>Multi-Payment</h3>
                        <p>QRIS &amp; Binance terintegrasi. Konfirmasi otomatis, saldo langsung terisi.</p>
                    </Reveal>

                    <Reveal className="ld-card">
                        <div className="ld-feat-ic"><svg className="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M3 9h6" /></svg></div>
                        <h3>Panel Admin Lengkap</h3>
                        <p>Kelola produk, stok &amp; order dari satu dashboard.</p>
                    </Reveal>

                    <Reveal className="ld-card">
                        <div className="ld-feat-ic ind"><svg className="icon" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" /></svg></div>
                        <h3>Auto-Backup</h3>
                        <p>Data tersimpan aman &amp; otomatis tiap hari.</p>
                    </Reveal>

                    <Reveal className="ld-card">
                        <div className="ld-feat-ic"><svg className="icon" viewBox="0 0 24 24"><path d="M12 2 2 7l10 5 10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></svg></div>
                        <h3>Multi-Tenant</h3>
                        <p>Satu platform, banyak toko terisolasi rapi.</p>
                    </Reveal>

                    <Reveal className="ld-card">
                        <div className="ld-feat-ic ind"><svg className="icon" viewBox="0 0 24 24"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg></div>
                        <h3>Renew Mudah</h3>
                        <p>Perpanjang langganan pelanggan sekali klik.</p>
                    </Reveal>
                </div>
            </div>
        </section>
    )
}
