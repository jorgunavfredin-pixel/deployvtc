import { Link } from 'react-router-dom'
import { LogoIcon } from './Logo'

export default function Footer({ telegramLink = 'https://t.me/vitacimin' }) {
    return (
        <footer className="ld-footer">
            <div className="wrap ld-foot-inner">
                <Link to="/" className="ld-brand"><span className="mark"><LogoIcon size={34} /></span>Botable</Link>
                <div className="ld-foot-links">
                    <a href="#fitur">Fitur</a>
                    <a href="#panel">Panel</a>
                    <a href="#harga">Harga</a>
                    <a href={telegramLink} target="_blank" rel="noopener noreferrer">Telegram</a>
                </div>
                <div className="ld-foot-copy">© 2026 Botable. Telegram Store Bot Platform.</div>
            </div>
        </footer>
    )
}
