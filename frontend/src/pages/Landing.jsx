import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import FloatingParticles from '../components/FloatingParticles'
import Hero from '../components/Hero'
import Features, { StatsBar } from '../components/Features'
import HowItWorks from '../components/HowItWorks'
import CTA from '../components/CTA'
import Footer from '../components/Footer'

export default function Landing() {
    const [telegramLink, setTelegramLink] = useState('https://t.me/Lumminese')

    useEffect(() => {
        fetch('/api/config')
            .then(r => r.json())
            .then(d => { if (d.telegramLink) setTelegramLink(d.telegramLink) })
            .catch(() => { })
    }, [])

    return (
        <>
            <FloatingParticles />
            <Navbar />
            <Hero telegramLink={telegramLink} />
            <StatsBar />
            <Features />
            <HowItWorks />
            <CTA telegramLink={telegramLink} />
            <Footer />
        </>
    )
}
