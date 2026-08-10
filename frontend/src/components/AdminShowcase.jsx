import Reveal from './Reveal'
import { LogoIcon } from './Logo'

// Admin panel showcase — dark browser mockup (sidebar groups, KPIs, area chart, order table)
export default function AdminShowcase() {
    return (
        <section className="ld-sec" id="panel">
            <div className="wrap">
                <Reveal className="ld-sec-head">
                    <div className="ld-eyebrow">Panel Web Admin</div>
                    <h2>Dashboard profesional, kendali penuh atas tokomu.</h2>
                    <p>Pantau omzet, order, stok, dan pelanggan secara real-time dari browser mana pun.</p>
                </Reveal>
                <Reveal className="ld-browser">
                    <div className="ld-b-bar">
                        <div className="ld-b-dots"><i /><i /><i /></div>
                        <div className="ld-b-url">
                            <svg className="icon-sm" viewBox="0 0 24 24" style={{ width: 13, height: 13, color: 'var(--accent)' }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                            admin.botable.id
                        </div>
                    </div>
                    <div className="ld-admin">
                        <aside className="ld-a-side">
                            <div className="ld-a-brand"><span className="m"><LogoIcon size={31} /></span>Botable</div>
                            <div className="ld-a-grp">General</div>
                            <div className="ld-a-item active"><svg className="icon-sm" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>Dashboard</div>
                            <div className="ld-a-item"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18M16 10a4 4 0 0 1-8 0" /></svg>Orders</div>
                            <div className="ld-a-item"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10z" /><circle cx="7" cy="7" r="1.4" /></svg>Products</div>
                            <div className="ld-a-item"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>Stock</div>
                            <div className="ld-a-item"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>Customers</div>
                            <div className="ld-a-grp">Marketing</div>
                            <div className="ld-a-item"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6" /><rect x="2" y="7" width="20" height="5" /><path d="M12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /></svg>Voucher</div>
                            <div className="ld-a-item"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M13 2 3 14h9l-1 8 10-12h-9z" /></svg>Flash Sale</div>
                            <div className="ld-a-item"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M3 11l19-9-9 19-2-8z" /></svg>Broadcast</div>
                            <div className="ld-a-grp">Finance</div>
                            <div className="ld-a-item"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" /></svg>Transactions</div>
                            <div className="ld-a-item"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>Balance</div>
                            <div className="ld-a-item"><svg className="icon-sm" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>Payment Gateway</div>
                            <div className="ld-a-grp">Bot</div>
                            <div className="ld-a-item"><svg className="icon-sm" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4M8 16h.01M16 16h.01" /></svg>Bot Settings</div>
                            <div className="ld-a-item"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>Logs</div>
                            <div className="ld-a-grp">System</div>
                            <div className="ld-a-item"><svg className="icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>Settings</div>
                        </aside>
                        <main className="ld-a-main">
                            <div className="ld-a-top">
                                <div className="ld-a-hi">Hai, Admin 👋<span>Ringkasan performa toko hari ini</span></div>
                                <div className="ld-a-search"><svg className="icon-sm" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>Cari order, produk…</div>
                            </div>
                            <div className="ld-kpis">
                                <div className="ld-kpi">
                                    <div className="ld-kpi-top"><div><div className="lbl">Omzet Hari Ini</div><div className="val">Rp 8,4jt</div></div><div className="ld-kpi-ic ld-k-green"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div></div>
                                    <svg className="ld-spark" viewBox="0 0 120 30" width="100%" height="26"><defs><linearGradient id="ld-sg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22d3a6" stopOpacity=".38" /><stop offset="1" stopColor="#22d3a6" stopOpacity="0" /></linearGradient></defs><path d="M0 22 20 18 40 20 60 10 80 14 100 6 120 9" fill="none" stroke="#22d3a6" strokeWidth="2" /><path d="M0 22 20 18 40 20 60 10 80 14 100 6 120 9 V30 H0Z" fill="url(#ld-sg1)" /></svg>
                                </div>
                                <div className="ld-kpi">
                                    <div className="ld-kpi-top"><div><div className="lbl">Total Order</div><div className="val">342</div></div><div className="ld-kpi-ic ld-k-blue"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18M16 10a4 4 0 0 1-8 0" /></svg></div></div>
                                    <svg className="ld-spark" viewBox="0 0 120 30" width="100%" height="26"><path d="M0 20 20 22 40 14 60 16 80 8 100 12 120 6" fill="none" stroke="#22d3a6" strokeWidth="2" /><path d="M0 20 20 22 40 14 60 16 80 8 100 12 120 6 V30 H0Z" fill="url(#ld-sg1)" /></svg>
                                </div>
                                <div className="ld-kpi">
                                    <div className="ld-kpi-top"><div><div className="lbl">Total User</div><div className="val">1.284</div></div><div className="ld-kpi-ic ld-k-blue"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg></div></div>
                                    <svg className="ld-spark" viewBox="0 0 120 30" width="100%" height="26"><path d="M0 24 20 20 40 18 60 14 80 12 100 8 120 5" fill="none" stroke="#22d3a6" strokeWidth="2" /><path d="M0 24 20 20 40 18 60 14 80 12 100 8 120 5 V30 H0Z" fill="url(#ld-sg1)" /></svg>
                                </div>
                                <div className="ld-kpi">
                                    <div className="ld-kpi-top"><div><div className="lbl">Stok Items</div><div className="val">856</div></div><div className="ld-kpi-ic ld-k-amber"><svg className="icon-sm" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96 12 12l8.73-5.04M12 22V12" /></svg></div></div>
                                    <svg className="ld-spark" viewBox="0 0 120 30" width="100%" height="26"><path d="M0 10 20 14 40 12 60 16 80 13 100 18 120 15" fill="none" stroke="#22d3a6" strokeWidth="2" /><path d="M0 10 20 14 40 12 60 16 80 13 100 18 120 15 V30 H0Z" fill="url(#ld-sg1)" /></svg>
                                </div>
                            </div>
                            <div className="ld-chart-card">
                                <div className="ct"><b>Grafik Penjualan</b><span>7 hari terakhir</span></div>
                                <svg viewBox="0 0 640 180" width="100%" height="170" preserveAspectRatio="none">
                                    <defs><linearGradient id="ld-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22d3a6" stopOpacity=".3" /><stop offset="1" stopColor="#22d3a6" stopOpacity="0" /></linearGradient></defs>
                                    <line x1="0" y1="45" x2="640" y2="45" stroke="rgba(255,255,255,.06)" /><line x1="0" y1="90" x2="640" y2="90" stroke="rgba(255,255,255,.06)" /><line x1="0" y1="135" x2="640" y2="135" stroke="rgba(255,255,255,.06)" />
                                    <path d="M0 130 C 60 120, 100 90, 160 96 S 260 60, 320 74 S 420 40, 480 52 S 580 24, 640 36" fill="none" stroke="#22d3a6" strokeWidth="3" strokeLinecap="round" />
                                    <path d="M0 130 C 60 120, 100 90, 160 96 S 260 60, 320 74 S 420 40, 480 52 S 580 24, 640 36 L640 180 L0 180Z" fill="url(#ld-area)" />
                                    <circle cx="320" cy="74" r="4" fill="#22d3a6" /><circle cx="640" cy="36" r="4" fill="#22d3a6" />
                                </svg>
                            </div>
                            <div className="ld-table-card">
                                <div className="th"><span>Order</span><span>Produk</span><span>Total</span><span>Status</span></div>
                                <div className="tr"><span>#ORD-2481</span><span>Netflix 1 Bln</span><span>Rp 45.000</span><span><span className="ld-pill paid">paid</span></span></div>
                                <div className="tr"><span>#ORD-2480</span><span>Diamond ML 86</span><span>Rp 24.000</span><span><span className="ld-pill pending">pending</span></span></div>
                                <div className="tr"><span>#ORD-2479</span><span>Spotify 1 Bln</span><span>Rp 27.000</span><span><span className="ld-pill paid">paid</span></span></div>
                                <div className="tr"><span>#ORD-2478</span><span>Steam Wallet</span><span>Rp 60.000</span><span><span className="ld-pill paid">paid</span></span></div>
                            </div>
                        </main>
                    </div>
                </Reveal>
            </div>
        </section>
    )
}
