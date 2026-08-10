import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import Features from '../components/Features'
import AdminShowcase from '../components/AdminShowcase'
import HowItWorks from '../components/HowItWorks'
import Pricing from '../components/Pricing'
import CTA from '../components/CTA'
import Footer from '../components/Footer'

export default function Landing() {
    const [telegramLink, setTelegramLink] = useState('https://t.me/GREEBEL')

    useEffect(() => {
        fetch('/api/config')
            .then(r => r.json())
            .then(d => { if (d.telegramLink) setTelegramLink(d.telegramLink) })
            .catch(() => { })
    }, [])

    return (
        <div className="landing-dark">
            <Navbar telegramLink={telegramLink} />
            <Hero telegramLink={telegramLink} />
            <Features />
            <AdminShowcase />
            <HowItWorks />
            <Pricing telegramLink={telegramLink} />
            <CTA telegramLink={telegramLink} />
            <Footer telegramLink={telegramLink} />
        </div>
    )
}
