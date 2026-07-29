import { Link } from 'react-router-dom'
import { Rocket, Send } from 'lucide-react'
import { motion } from 'framer-motion'
import PhoneMockup from './PhoneMockup'

export default function Hero({ telegramLink }) {
    return (
        <section className="hero">
            {/* Decorative gradient orbs */}
            <div className="hero-orb hero-orb-1" />
            <div className="hero-orb hero-orb-2" />
            <div className="hero-orb hero-orb-3" />

            <div className="hero-inner">
                <motion.div
                    className="hero-content"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
                >
                    <motion.div
                        className="hero-badge"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                    >
                        <span className="ping" />
                        Telegram Store Bot Platform
                    </motion.div>

                    <h1>
                        Automate Your{' '}
                        <span className="gradient-text">Digital Store</span>
                        {' '}on Telegram
                    </h1>

                    <p>
                        Bot Telegram premium untuk jualan digital. QRIS auto payment,
                        saldo system, admin panel lengkap — deploy 5 menit, langsung jualan.
                    </p>

                    <div className="hero-buttons">
                        <Link to="/deploy" className="btn btn-primary btn-lg">
                            <Rocket size={20} />
                            Deploy Bot Sekarang
                        </Link>
                        <a
                            href={telegramLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-outline btn-lg"
                        >
                            <Send size={20} />
                            Order via Telegram
                        </a>
                    </div>

                    {/* Trust badges */}
                    <motion.div
                        className="hero-trust"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                    >
                        <span>🔒 Secure Deploy</span>
                        <span>⚡ 5 min Setup</span>
                        <span>🎯 99.9% Uptime</span>
                    </motion.div>
                </motion.div>

                {/* Phone mockup */}
                <div className="hero-mockup">
                    <PhoneMockup />
                </div>
            </div>
        </section>
    )
}
