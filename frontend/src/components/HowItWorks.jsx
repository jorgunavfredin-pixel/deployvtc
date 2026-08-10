import Reveal from './Reveal'

// Dark 3-step "how it works" with animated connector
export default function HowItWorks() {
    return (
        <section className="ld-sec" id="cara">
            <div className="wrap">
                <Reveal className="ld-sec-head">
                    <div className="ld-eyebrow">Cara Kerja</div>
                    <h2>Tiga langkah, tokomu langsung jalan.</h2>
                </Reveal>
                <div className="ld-steps">
                    <div className="ld-connector" />
                    <Reveal className="ld-step">
                        <div className="num">01</div>
                        <div className="sic"><svg className="icon" viewBox="0 0 24 24"><path d="M3 11l19-9-9 19-2-8z" /></svg></div>
                        <h3>Order via Telegram</h3>
                        <p>Pilih paket, chat admin. Bot &amp; panel disiapkan untukmu.</p>
                    </Reveal>
                    <Reveal className="ld-step">
                        <div className="num">02</div>
                        <div className="sic"><svg className="icon" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg></div>
                        <h3>Konfigurasi Toko</h3>
                        <p>Isi produk, harga &amp; QRIS lewat panel admin yang intuitif.</p>
                    </Reveal>
                    <Reveal className="ld-step">
                        <div className="num">03</div>
                        <div className="sic"><svg className="icon" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></svg></div>
                        <h3>Mulai Jualan</h3>
                        <p>Bot online, pembayaran otomatis, order masuk sendiri.</p>
                    </Reveal>
                </div>
            </div>
        </section>
    )
}
