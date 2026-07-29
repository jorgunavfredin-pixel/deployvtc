// SVG Logo component for Vitacimin Store
export function LogoIcon({ size = 32 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="logo-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#4f6ef7" />
                    <stop offset="50%" stopColor="#7c3aed" />
                    <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
                <linearGradient id="bolt-grad" x1="28" y1="12" x2="36" y2="52" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#e0e7ff" />
                </linearGradient>
            </defs>
            {/* Rounded square bg */}
            <rect width="64" height="64" rx="16" fill="url(#logo-grad)" />
            {/* Shopping bag body */}
            <path d="M18 24C18 22.8954 18.8954 22 20 22H44C45.1046 22 46 22.8954 46 24V48C46 50.2091 44.2091 52 42 52H22C19.7909 52 18 50.2091 18 48V24Z" fill="rgba(255,255,255,0.2)" />
            {/* Bag handle */}
            <path d="M25 22V18C25 14.134 28.134 11 32 11C35.866 11 39 14.134 39 18V22" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            {/* Lightning bolt */}
            <path d="M35 26L28 37H32L29 44L38 33H33L35 26Z" fill="url(#bolt-grad)" />
        </svg>
    )
}

// Favicon SVG string for the HTML head
export const faviconSvg = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="%234f6ef7"/><stop offset="50%" stop-color="%237c3aed"/><stop offset="100%" stop-color="%23a855f7"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(%23g)"/><path d="M18 24c0-1.1.9-2 2-2h24c1.1 0 2 .9 2 2v24c0 2.2-1.8 4-4 4H22c-2.2 0-4-1.8-4-4V24z" fill="rgba(255,255,255,.2)"/><path d="M25 22v-4a7 7 0 0114 0v4" stroke="rgba(255,255,255,.5)" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M35 26l-7 11h4l-3 7 9-11h-5l2-7z" fill="white"/></svg>`)}`

export default LogoIcon
