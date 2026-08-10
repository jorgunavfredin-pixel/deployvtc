import Reveal from './Reveal'

// Dark orbital CTA — Order via Telegram (telegramLink prop preserved)
export default function CTA({ telegramLink }) {
    return (
        <section className="ld-sec" id="faq">
            <div className="wrap ld-cta-wrap">
                <Reveal className="ld-cta-card">
                    <div className="ld-cta-orbit"><div className="ld-circle ld-cc1" /><div className="ld-circle ld-cc2" /></div>
                    <h2>Siap punya toko digital sendiri di Telegram?</h2>
                    <p>Deploy dalam hitungan menit. Bayar QRIS otomatis, kelola dari panel admin.</p>
                    <a className="ld-btn ld-btn-accent" href={telegramLink} target="_blank" rel="noopener noreferrer">
                        <svg className="icon-sm" viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>
                        Order via Telegram
                    </a>
                </Reveal>
            </div>
        </section>
    )
}
