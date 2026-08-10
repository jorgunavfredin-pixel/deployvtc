import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { LogoIcon } from './Logo'

export default function Navbar({ telegramLink = 'https://t.me/vitacimin' }) {
    const [scrolled, setScrolled] = useState(false)
    const [open, setOpen] = useState(false)

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 10)
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    return (
        <div className="ld-nav-shell">
            <header className={`ld-nav ${scrolled ? 'scrolled' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Link to="/" className="ld-brand">
                        <span className="mark"><LogoIcon size={34} /></span>
                        Botable
                    </Link>
                    <nav className="ld-nav-links">
                        <a href="#cara">Cara Kerja</a>
                        <a href="#fitur">Fitur</a>
                        <a href="#harga">Harga</a>
                        <a href="#faq">FAQ</a>
                    </nav>
                </div>
                <div className="ld-nav-right">
                    <a className="ld-btn ld-btn-accent" href={telegramLink} target="_blank" rel="noopener noreferrer">Mulai Sewa</a>
                    <button className="ld-hamb" aria-label="Menu" onClick={() => setOpen(o => !o)}>
                        <svg className="icon" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
                    </button>
                </div>
                <div className={`ld-mobile-menu ${open ? 'open' : ''}`}>
                    <a href="#cara" onClick={() => setOpen(false)}>Cara Kerja</a>
                    <a href="#fitur" onClick={() => setOpen(false)}>Fitur</a>
                    <a href="#harga" onClick={() => setOpen(false)}>Harga</a>
                    <a href="#faq" onClick={() => setOpen(false)}>FAQ</a>
                    <a href={telegramLink} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>Mulai Sewa</a>
                </div>
            </header>
        </div>
    )
}
