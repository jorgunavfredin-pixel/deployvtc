import { motion } from 'framer-motion'

// Animated Telegram bot phone mockup
export default function PhoneMockup() {
    const messages = [
        { from: 'bot', text: '🛍 Selamat datang di Store Bot!', delay: 0.3 },
        { from: 'bot', text: 'Pilih kategori produk:', delay: 0.8 },
        { from: 'user', text: '📦 Lihat Produk', delay: 1.5 },
        { from: 'bot', text: '⚡ Premium Account\n💰 Rp 25.000\n📦 Stok: 42', delay: 2.2 },
        { from: 'user', text: '🛒 Order Now', delay: 3.0 },
        { from: 'bot', text: '✅ Order #ORD-2847 dibuat!\n\n📱 Scan QRIS untuk bayar:', delay: 3.6 },
    ]

    return (
        <motion.div
            className="phone-mockup"
            initial={{ opacity: 0, y: 40, rotateY: -8 }}
            animate={{ opacity: 1, y: 0, rotateY: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
        >
            {/* Phone frame */}
            <div className="phone-frame">
                {/* Status bar */}
                <div className="phone-statusbar">
                    <span>9:41</span>
                    <div className="phone-notch" />
                    <div className="phone-statusbar-right">
                        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="0.5" /><rect x="4.5" y="4" width="3" height="8" rx="0.5" /><rect x="9" y="1.5" width="3" height="10.5" rx="0.5" /><rect x="13.5" y="0" width="2.5" height="12" rx="0.5" opacity="0.3" /></svg>
                        <svg width="20" height="12" viewBox="0 0 20 12" fill="currentColor"><rect x="0.5" y="0.5" width="17" height="11" rx="2" stroke="currentColor" fill="none" strokeWidth="1" /><rect x="2" y="2" width="12" height="8" rx="1" fill="currentColor" /><rect x="18" y="4" width="2" height="4" rx="0.5" /></svg>
                    </div>
                </div>

                {/* Chat header */}
                <div className="phone-header">
                    <div className="phone-header-back">‹</div>
                    <div className="phone-header-avatar">🤖</div>
                    <div className="phone-header-info">
                        <div className="phone-header-name">Store Bot</div>
                        <div className="phone-header-status">online</div>
                    </div>
                </div>

                {/* Chat area */}
                <div className="phone-chat">
                    {messages.map((msg, i) => (
                        <motion.div
                            key={i}
                            className={`chat-bubble ${msg.from}`}
                            initial={{ opacity: 0, y: 12, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ delay: msg.delay, duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                        >
                            {msg.text.split('\n').map((line, j) => (
                                <span key={j}>{line}{j < msg.text.split('\n').length - 1 && <br />}</span>
                            ))}
                        </motion.div>
                    ))}

                    {/* QRIS mockup */}
                    <motion.div
                        className="chat-bubble bot"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 4.2, duration: 0.4 }}
                    >
                        <div className="qris-mini">
                            <div className="qris-mini-header">QRIS Payment</div>
                            <div className="qris-mini-qr">
                                {/* Simple QR pattern */}
                                <svg viewBox="0 0 100 100" width="60" height="60">
                                    <rect fill="#000" x="5" y="5" width="25" height="25" rx="2" />
                                    <rect fill="#fff" x="10" y="10" width="15" height="15" rx="1" />
                                    <rect fill="#000" x="13" y="13" width="9" height="9" rx="1" />
                                    <rect fill="#000" x="70" y="5" width="25" height="25" rx="2" />
                                    <rect fill="#fff" x="75" y="10" width="15" height="15" rx="1" />
                                    <rect fill="#000" x="78" y="13" width="9" height="9" rx="1" />
                                    <rect fill="#000" x="5" y="70" width="25" height="25" rx="2" />
                                    <rect fill="#fff" x="10" y="75" width="15" height="15" rx="1" />
                                    <rect fill="#000" x="13" y="78" width="9" height="9" rx="1" />
                                    <rect fill="#000" x="35" y="5" width="5" height="5" />
                                    <rect fill="#000" x="45" y="5" width="5" height="5" />
                                    <rect fill="#000" x="55" y="10" width="5" height="5" />
                                    <rect fill="#000" x="35" y="15" width="5" height="5" />
                                    <rect fill="#000" x="50" y="20" width="5" height="5" />
                                    <rect fill="#000" x="40" y="35" width="5" height="5" />
                                    <rect fill="#000" x="50" y="40" width="5" height="5" />
                                    <rect fill="#000" x="35" y="50" width="5" height="5" />
                                    <rect fill="#000" x="45" y="55" width="5" height="5" />
                                    <rect fill="#000" x="55" y="45" width="5" height="5" />
                                    <rect fill="#000" x="65" y="35" width="5" height="5" />
                                    <rect fill="#000" x="75" y="40" width="5" height="5" />
                                    <rect fill="#000" x="85" y="50" width="5" height="5" />
                                    <rect fill="#000" x="70" y="55" width="5" height="5" />
                                    <rect fill="#000" x="80" y="70" width="5" height="5" />
                                    <rect fill="#000" x="70" y="75" width="5" height="5" />
                                    <rect fill="#000" x="85" y="85" width="5" height="5" />
                                    <rect fill="#000" x="40" y="70" width="5" height="5" />
                                    <rect fill="#000" x="50" y="80" width="5" height="5" />
                                    <rect fill="#000" x="60" y="70" width="5" height="5" />
                                </svg>
                            </div>
                            <div className="qris-mini-amount">Rp 25.000</div>
                        </div>
                    </motion.div>

                    {/* Payment success */}
                    <motion.div
                        className="chat-bubble bot success-bubble"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 5.0, duration: 0.4, type: 'spring' }}
                    >
                        ✅ Pembayaran berhasil!<br />
                        📦 Produk dikirim ke chat kamu.
                    </motion.div>
                </div>

                {/* Input bar */}
                <div className="phone-input">
                    <div className="phone-input-field">Ketik pesan...</div>
                    <div className="phone-input-send">➤</div>
                </div>
            </div>

            {/* Glow effect behind phone */}
            <div className="phone-glow" />
        </motion.div>
    )
}
