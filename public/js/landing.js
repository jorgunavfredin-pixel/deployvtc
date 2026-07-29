// Landing page JS

// Smooth scroll nav shadow
window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    if (nav) {
        nav.classList.toggle('scrolled', window.scrollY > 10);
    }
});

// Order buttons — fetch Telegram link from config
const setupOrderButtons = async () => {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        const link = data.telegramLink || 'https://t.me/Lumminese';

        const btn1 = document.getElementById('orderBtn');
        const btn2 = document.getElementById('orderBtn2');
        if (btn1) btn1.href = link;
        if (btn2) btn2.href = link;
    } catch (e) {
        console.error('Failed to load config:', e);
    }
};

setupOrderButtons();

// Animate elements on scroll
const observerOptions = { threshold: 0.1 };
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.querySelectorAll('.feature-card, .step').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'all 0.5s ease';
    observer.observe(el);
});
