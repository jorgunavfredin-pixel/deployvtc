import { useEffect, useRef } from 'react'

// Animated floating particles/orbs background
export default function FloatingParticles() {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        let animId

        const resize = () => {
            canvas.width = window.innerWidth
            canvas.height = window.innerHeight
        }
        resize()
        window.addEventListener('resize', resize)

        // Particles
        const particles = []
        const colors = [
            'rgba(79, 110, 247, 0.15)',
            'rgba(124, 58, 237, 0.12)',
            'rgba(168, 85, 247, 0.1)',
            'rgba(96, 165, 250, 0.12)',
            'rgba(59, 130, 246, 0.08)',
        ]

        for (let i = 0; i < 35; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 80 + 20,
                dx: (Math.random() - 0.5) * 0.3,
                dy: (Math.random() - 0.5) * 0.2,
                color: colors[Math.floor(Math.random() * colors.length)],
                phase: Math.random() * Math.PI * 2,
            })
        }

        const draw = (t) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            particles.forEach(p => {
                p.x += p.dx + Math.sin(t * 0.0003 + p.phase) * 0.15
                p.y += p.dy + Math.cos(t * 0.0004 + p.phase) * 0.1

                // Wrap around
                if (p.x < -p.r) p.x = canvas.width + p.r
                if (p.x > canvas.width + p.r) p.x = -p.r
                if (p.y < -p.r) p.y = canvas.height + p.r
                if (p.y > canvas.height + p.r) p.y = -p.r

                const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
                grad.addColorStop(0, p.color)
                grad.addColorStop(1, 'transparent')
                ctx.fillStyle = grad
                ctx.beginPath()
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
                ctx.fill()
            })

            animId = requestAnimationFrame(draw)
        }

        animId = requestAnimationFrame(draw)
        return () => {
            cancelAnimationFrame(animId)
            window.removeEventListener('resize', resize)
        }
    }, [])

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: -1,
                pointerEvents: 'none',
            }}
        />
    )
}
