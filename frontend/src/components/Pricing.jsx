import Reveal from './Reveal'

const Check = () => (
    <svg className="icon-sm" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
)

// Two pricing plans — both CTAs order via Telegram (telegramLink prop preserved)
export default function Pricing({ telegramLink }) {
    return (
        <section className="ld-sec" id="harga">
            <div className="wrap">
                <Reveal className="ld-sec-head">
                    <div className="ld-eyebrow">Harga</div>
                    <h2>Pilih paket, mulai jualan hari ini.</h2>
                    <p>Tanpa biaya tersembunyi. Bayar bulanan, upgrade kapan saja.</p>
                </Reveal>
                <div className="ld-pricing">
                    <Reveal className="ld-plan">
                        <div className="pname">Chat Only</div>
                        <div className="pprice">Rp 20.000<small> /bulan</small></div>
                        <ul>
                            <li><Check />Bot chat Telegram</li>
                            <li><Check />Katalog produk</li>
                            <li><Check />Auto-delivery</li>
                            <li><Check />Pembayaran QRIS</li>
                            <li><Check />Sistem saldo</li>
                        </ul>
                        <a className="ld-btn ld-btn-glass" href={telegramLink} target="_blank" rel="noopener noreferrer">Order via Telegram</a>
                    </Reveal>
                    <Reveal className="ld-plan pop">
                        <div className="ld-pop-badge">Populer</div>
                        <div className="pname">Full Web Admin</div>
                        <div className="pprice">Rp 30.000<small> /bulan</small></div>
                        <ul>
                            <li className="hl"><Check />Semua fitur Chat Only</li>
                            <li className="hl"><Check />Panel Web Admin lengkap</li>
                            <li><Check />Dashboard analitik</li>
                            <li><Check />Manajemen stok &amp; produk</li>
                            <li><Check />Broadcast &amp; Voucher</li>
                            <li><Check />Flash Sale</li>
                            <li><Check />Multi payment gateway</li>
                            <li><Check />Laporan keuangan</li>
                            <li><Check />Auto-backup</li>
                        </ul>
                        <a className="ld-btn ld-btn-accent" href={telegramLink} target="_blank" rel="noopener noreferrer">Order via Telegram</a>
                    </Reveal>
                </div>
            </div>
        </section>
    )
}
