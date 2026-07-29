import { Link } from 'react-router-dom'
import { Rocket, Send } from 'lucide-react'
import { motion } from 'framer-motion'

export default function CTA({ telegramLink }) {
    return (
        <section className="cta-section">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
            >
                <h2>Siap Mulai <span className="gradient-text">Jualan?</span></h2>
                <p>Dapetin bot premium kamu sekarang. Setup cuma 5 menit.</p>
                <div className="cta-buttons">
                    <a
                        href={telegramLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary btn-lg"
                    >
                        <Send size={20} />
                        Order via Telegram
                    </a>
                    <Link to="/deploy" className="btn btn-outline btn-lg">
                        <Rocket size={20} />
                        Deploy Bot
                    </Link>
                </div>
            </motion.div>
        </section>
    )
}
