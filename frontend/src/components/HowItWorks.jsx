import { motion } from 'framer-motion'

const steps = [
    {
        num: '1',
        title: 'Order & Dapatkan License',
        desc: 'Chat kami di Telegram, pilih paket, bayar, dan terima license key unik 32 karakter.'
    },
    {
        num: '2',
        title: 'Deploy via Web',
        desc: 'Buka halaman deploy, masukkan license key, isi konfigurasi bot, upload banner, klik Deploy.'
    },
    {
        num: '3',
        title: 'Profit! 🎉',
        desc: 'Bot langsung aktif. Paste webhook URL ke PaKasir, mulai jualan. Auto order, auto payment, auto delivery.'
    }
]

export default function HowItWorks() {
    return (
        <section className="section section-alt" id="how">
            <motion.div
                className="section-title"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
            >
                <h2>Cara <span className="gradient-text">Mulai</span></h2>
                <p>3 langkah sederhana untuk punya bot jualan sendiri.</p>
            </motion.div>

            <div className="steps-wrap">
                {steps.map((s, i) => (
                    <motion.div
                        className="step-card"
                        key={i}
                        initial={{ opacity: 0, x: -24 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.15, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                    >
                        <div className="step-num">{s.num}</div>
                        <div>
                            <h3>{s.title}</h3>
                            <p>{s.desc}</p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </section>
    )
}
