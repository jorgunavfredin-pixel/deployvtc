import { useEffect, useRef } from 'react'

// Lightweight scroll-reveal wrapper (adds .in when in view; respects reduced motion)
export default function Reveal({ children, className = '', as: Tag = 'div', ...rest }) {
    const ref = useRef(null)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduce) { el.classList.add('in'); return }
        const io = new IntersectionObserver((es) => {
            es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } })
        }, { threshold: 0.12 })
        io.observe(el)
        const fallback = setTimeout(() => el.classList.add('in'), 3500)
        return () => { io.disconnect(); clearTimeout(fallback) }
    }, [])
    return (
        <Tag ref={ref} className={`ld-reveal ${className}`} {...rest}>
            {children}
        </Tag>
    )
}
