import { Zap, Globe, Sparkles, CreditCard, Wallet, Shield } from 'lucide-react'
import { motion } from 'framer-motion'

const stats = [
    { number: '24/7', label: 'Auto Order', icon: Zap },
    { number: 'QRIS', label: 'Auto Payment', icon: CreditCard },
    { number: '2', label: 'Bahasa', icon: Globe },
    { number: '5 min', label: 'Setup Time', icon: Sparkles },
]

const features = [
    {
        icon: CreditCard,
        title: 'QRIS Auto Payment',
        desc: 'Pembayaran otomatis via QRIS. Buyer scan, transfer, produk terkirim otomatis. Terintegrasi PaKasir.'
    },
    {
        icon: Wallet,
        title: 'Saldo System',
        desc: 'Topup saldo via QRIS, bayar dari saldo. Riwayat transaksi lengkap, admin kelola saldo buyer.'
    },
    {
        icon: Shield,
        title: 'Admin Panel',
        desc: 'Kelola produk, kategori, stok, voucher, user, broadcast — semua dari 1 dashboard.'
    },
    {
        icon: Zap,
        title: 'Auto Delivery',
        desc: 'Stok terkirim otomatis saat pembayaran berhasil. Support email:pass, lisensi, text format.'
    },
    {
        icon: Globe,
        title: 'Bilingual (ID/EN)',
        desc: 'Buyer bisa pilih bahasa Indonesia atau English. Semua pesan otomatis menyesuaikan.'
    },
    {
        icon: Sparkles,
        title: 'Custom Theme',
        desc: '10 preset warna QRIS frame. Gold, Purple, Blue, Cyan, dan lainnya. Branding toko kamu.'
    },
]

const cardVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: (i) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.08, duration: 0.5, ease: [0.4, 0, 0.2, 1] }
    })
}

export function StatsBar() {
    return (
        <div className="stats-bar">
            {stats.map((stat, i) => (
                <motion.div
                    className="stat-item"
                    key={i}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1, duration: 0.4 }}
                >
                    <span className="stat-number">{stat.number}</span>
                    <span className="stat-label">
                        <stat.icon size={14} />
                        {stat.label}
                    </span>
                </motion.div>
            ))}
        </div>
    )
}

export default function Features() {
    return (
        <section className="section" id="features">
            <motion.div
                className="section-title"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
            >
                <h2>Fitur <span className="gradient-text">Premium</span></h2>
                <p>Semua yang kamu butuhkan untuk jualan digital, sudah tersedia.</p>
            </motion.div>

            <div className="features-grid">
                {features.map((f, i) => (
                    <motion.div
                        className="feature-card"
                        key={i}
                        variants={cardVariants}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        custom={i}
                    >
                        <div className="feature-icon">
                            <f.icon size={24} />
                        </div>
                        <h3>{f.title}</h3>
                        <p>{f.desc}</p>
                    </motion.div>
                ))}
            </div>
        </section>
    )
}
