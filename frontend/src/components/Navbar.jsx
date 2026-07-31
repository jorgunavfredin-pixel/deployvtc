import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Rocket, RefreshCw, Settings } from 'lucide-react'
import { LogoIcon } from './Logo'

export default function Navbar() {
    const [scrolled, setScrolled] = useState(false)
    const location = useLocation()
    const isLanding = location.pathname === '/'

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 10)
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    return (
        <nav className={`nav ${scrolled ? 'scrolled' : ''}`}>
            <Link to="/" className="nav-brand">
                <LogoIcon size={36} />
                Vitacimin Store
            </Link>
            <div className="nav-links">
                {isLanding && (
                    <>
                        <a href="#features" className="hide-mobile">Features</a>
                        <a href="#how" className="hide-mobile">How It Works</a>
                    </>
                )}
                <Link to="/manage" className="btn btn-outline btn-sm nav-deploy-btn" style={{ marginRight: '0.5rem' }}>
                    <Settings size={15} />
                    <span className="nav-deploy-text">Kelola</span>
                </Link>
                <Link to="/renew" className="btn btn-outline btn-sm nav-deploy-btn" style={{ marginRight: '0.5rem' }}>
                    <RefreshCw size={15} />
                    <span className="nav-deploy-text">Perpanjang</span>
                </Link>
                <Link to="/deploy" className="btn btn-primary btn-sm nav-deploy-btn">
                    <Rocket size={16} />
                    <span className="nav-deploy-text">Deploy Bot</span>
                </Link>
            </div>
        </nav>
    )
}
