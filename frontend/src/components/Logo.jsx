// Chat Spark logo — Botable brand (chat bubble + lightning bolt, cyan→indigo gradient)
export function LogoIcon({ size = 34 }) {
    // Unique gradient ids per render size to avoid collisions when multiple instances mount
    return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Botable">
            <defs>
                <linearGradient id="cs-bubble" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#22d3a6" />
                    <stop offset="55%" stopColor="#1e9a9e" />
                    <stop offset="100%" stopColor="#6d72ff" />
                </linearGradient>
                <linearGradient id="cs-bolt" x1="26" y1="16" x2="40" y2="48" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#d9fff3" />
                </linearGradient>
            </defs>
            {/* Chat bubble */}
            <path
                d="M10 12h44a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H26l-12 10V46h-4a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z"
                fill="url(#cs-bubble)"
            />
            {/* Lightning spark */}
            <path d="M35 19 24 34h7l-3 12 12-16h-7l2-11z" fill="url(#cs-bolt)" />
        </svg>
    )
}

// Favicon SVG string — Chat Spark (fallback; index.html uses PNG data URI)
export const faviconSvg = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#22d3a6"/><stop offset="55%" stop-color="#1e9a9e"/><stop offset="100%" stop-color="#6d72ff"/></linearGradient></defs><path d="M10 12h44a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H26l-12 10V46h-4a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" fill="url(#g)"/><path d="M35 19 24 34h7l-3 12 12-16h-7l2-11z" fill="#ffffff"/></svg>`)}`

export default LogoIcon
