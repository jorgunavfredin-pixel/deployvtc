import { Link } from 'react-router-dom'
import PhoneMockup from './PhoneMockup'
import Reveal from './Reveal'

export default function Hero({ telegramLink }) {
    return (
        <section className="ld-hero">
            <div className="ld-orbit">
                <div className="ld-circle ld-c1" />
                <div className="ld-circle ld-c2" />
                <div className="ld-circle ld-c3" />
            </div>
            <div className="wrap ld-hero-grid">
                <Reveal className="ld-hero-text">
                    <span className="ld-eyebrow-pill"><span className="dot" />Telegram Store Bot Platform</span>
                    <h1 className="ld-h1">
                        Automate Your <span className="ld-grad-text">Digital Store</span> on Telegram
                    </h1>
                    <p className="ld-sub">
                        Bot Telegram premium untuk jualan digital. QRIS auto payment, sistem saldo,
                        panel admin lengkap — deploy dalam hitungan menit.
                    </p>
                    <div className="ld-hero-cta">
                        <Link to="/deploy" className="ld-btn ld-btn-primary">
                            <svg className="icon-sm" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                            Deploy Bot Sekarang
                        </Link>
                        <a className="ld-btn ld-btn-glass" href={telegramLink} target="_blank" rel="noopener noreferrer">
                            <svg className="icon-sm" viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>
                            Order via Telegram
                        </a>
                    </div>
                    <div className="ld-trust-chips">
                        <span className="ld-chip"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>Secure Deploy</span>
                        <span className="ld-chip"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M13 2 3 14h9l-1 8 10-12h-9z" /></svg>Setup Cepat</span>
                        <span className="ld-chip"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>Server Stabil</span>
                    </div>
                </Reveal>

                <Reveal className="ld-phone-col">
                    <PhoneMockup />
                </Reveal>
            </div>
        </section>
    )
}
