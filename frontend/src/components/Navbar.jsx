import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogoIcon } from './Logo'

export default function Navbar() {
    const [scrolled, setScrolled] = useState(false)
    const [open, setOpen] = useState(false)
    const location = useLocation()

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 10)
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    useEffect(() => {
        if (location.pathname === '/' && location.hash) {
            requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
        }
    }, [location.pathname, location.hash])

    return (
        <div className="ld-nav-shell">
            <header className={`ld-nav ${scrolled ? 'scrolled' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Link to="/" className="ld-brand">
                        <span className="mark"><LogoIcon size={34} /></span>
                        Botable
                    </Link>
                    <nav className="ld-nav-links">
                        <Link to="/#cara">Cara Kerja</Link>
                        <Link to="/#fitur">Fitur</Link>
                        <Link to="/#harga">Harga</Link>
                        <Link to="/#faq">FAQ</Link>
                    </nav>
                </div>
                <div className="ld-nav-right">
                    <Link className="ld-btn ld-btn-glass ld-nav-action" to="/renew">Renew</Link>
                    <Link className="ld-btn ld-btn-accent ld-nav-action" to="/deploy">Deploy Bot</Link>
                    <button className="ld-hamb" aria-label="Menu" onClick={() => setOpen(o => !o)}>
                        <svg className="icon" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
                    </button>
                </div>
                <div className={`ld-mobile-menu ${open ? 'open' : ''}`}>
                    <Link to="/#cara" onClick={() => setOpen(false)}>Cara Kerja</Link>
                    <Link to="/#fitur" onClick={() => setOpen(false)}>Fitur</Link>
                    <Link to="/#harga" onClick={() => setOpen(false)}>Harga</Link>
                    <Link to="/#faq" onClick={() => setOpen(false)}>FAQ</Link>
                    <Link to="/renew" onClick={() => setOpen(false)}>Renew</Link>
                    <Link to="/deploy" onClick={() => setOpen(false)}>Deploy Bot</Link>
                </div>
            </header>
        </div>
    )
}
