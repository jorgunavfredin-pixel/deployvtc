// QRIS Theme color map
const THEME_COLORS = {
    gold: { bg: 'linear-gradient(135deg, #1a1a2e, #16213e)', frame: '#ffd700', text: '#ffd700' },
    purple: { bg: 'linear-gradient(135deg, #0d0d0d, #1a0a2e)', frame: '#a855f7', text: '#a855f7' },
    blue: { bg: 'linear-gradient(135deg, #0a1628, #0f2645)', frame: '#3b82f6', text: '#3b82f6' },
    green: { bg: 'linear-gradient(135deg, #0a1a0a, #0d2818)', frame: '#22c55e', text: '#22c55e' },
    red: { bg: 'linear-gradient(135deg, #1a0a0a, #2d1111)', frame: '#ef4444', text: '#ef4444' },
    cyan: { bg: 'linear-gradient(135deg, #0a1a1a, #0d2828)', frame: '#06b6d4', text: '#06b6d4' },
    orange: { bg: 'linear-gradient(135deg, #1a120a, #2d1f0d)', frame: '#f97316', text: '#f97316' },
    white: { bg: 'linear-gradient(135deg, #1e293b, #0f172a)', frame: '#f8fafc', text: '#f8fafc' },
    pink: { bg: 'linear-gradient(135deg, #1a0a14, #2d0d1e)', frame: '#ec4899', text: '#ec4899' },
    lime: { bg: 'linear-gradient(135deg, #0a1a0a, #142d0d)', frame: '#84cc16', text: '#84cc16' }
};

// Update QRIS preview when theme changes
const themeSelect = document.getElementById('themePreset');
const previewBox = document.getElementById('qrisPreviewBox');

const updateThemePreview = () => {
    const theme = THEME_COLORS[themeSelect.value] || THEME_COLORS.gold;
    previewBox.style.background = theme.bg;
    previewBox.style.border = `2px solid ${theme.frame}`;
    previewBox.querySelector('div').style.border = `2px solid ${theme.frame}`;
    previewBox.querySelectorAll('div')[1].style.color = theme.text;
};

themeSelect.addEventListener('change', updateThemePreview);
updateThemePreview(); // Initial

// ==================== STEP MANAGEMENT ====================

const showStep = (stepNum) => {
    document.getElementById('step1').style.display = stepNum === 1 ? 'block' : 'none';
    document.getElementById('step2').style.display = stepNum === 2 ? 'block' : 'none';
    const step3 = document.getElementById('step3');
    if (stepNum === 3) {
        step3.style.display = 'block';
        step3.classList.add('show');
    } else {
        step3.style.display = 'none';
        step3.classList.remove('show');
    }

    // Update dots
    for (let i = 1; i <= 3; i++) {
        const dot = document.getElementById(`dot${i}`);
        dot.classList.remove('active', 'done');
        if (i < stepNum) dot.classList.add('done');
        if (i === stepNum) dot.classList.add('active');
    }
    for (let i = 1; i <= 2; i++) {
        const line = document.getElementById(`line${i}`);
        line.classList.toggle('active', i < stepNum);
    }
};

const showError = (msg) => {
    const el = document.getElementById('alertError');
    document.getElementById('errorText').textContent = msg;
    el.classList.add('show');
    document.getElementById('alertSuccess').classList.remove('show');
    setTimeout(() => el.classList.remove('show'), 5000);
};

const showSuccess = (msg) => {
    const el = document.getElementById('alertSuccess');
    document.getElementById('successText').textContent = msg;
    el.classList.add('show');
    document.getElementById('alertError').classList.remove('show');
};

// ==================== VALIDATE LICENSE ====================

const validateLicense = async () => {
    const key = document.getElementById('licenseKey').value.trim().toUpperCase();
    if (!key) return showError('Masukkan license key.');

    const btn = document.getElementById('validateBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Validating...';

    try {
        const res = await fetch('/api/validate-license', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
        });
        const data = await res.json();

        if (data.valid) {
            document.getElementById('formLicenseKey').value = key;
            showSuccess('License valid! Silakan isi konfigurasi.');
            showStep(2);
        } else {
            showError(data.reason || 'License tidak valid.');
        }
    } catch (err) {
        showError('Gagal validasi. Coba lagi.');
    }

    btn.disabled = false;
    btn.innerHTML = 'Validasi License →';
};

// ==================== VALIDATE BOT TOKEN ====================

const validateBotToken = async (token) => {
    try {
        const res = await fetch('/api/validate-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        return await res.json();
    } catch (err) {
        return { valid: false, reason: 'Gagal validasi token.' };
    }
};

// ==================== DEPLOY BOT ====================

const deployBot = async () => {
    const btn = document.getElementById('deployBtn');

    // Gather form data
    const botToken = document.getElementById('botToken').value.trim();
    const adminId = document.getElementById('adminId').value.trim();
    const storeName = document.getElementById('storeName').value.trim();
    const orderPrefix = document.getElementById('orderPrefix').value.trim();
    const pakasirApiKey = document.getElementById('pakasirApiKey').value.trim();
    const pakasirSlug = document.getElementById('pakasirSlug').value.trim();
    const supportUsername = document.getElementById('supportUsername').value.trim();
    const supportHours = document.getElementById('supportHours').value.trim();
    const themePreset = document.getElementById('themePreset').value;
    const licenseKey = document.getElementById('formLicenseKey').value;
    const bannerFile = document.getElementById('bannerFile').files[0];

    // Validate required fields
    if (!botToken || !adminId || !storeName || !pakasirApiKey || !pakasirSlug || !supportUsername) {
        return showError('Semua field wajib harus diisi.');
    }

    if (!bannerFile) {
        return showError('Banner toko wajib diupload (PNG only).');
    }

    if (bannerFile.type !== 'image/png') {
        return showError('Banner harus berformat PNG.');
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Validating token...';

    // Validate bot token first
    const tokenCheck = await validateBotToken(botToken);
    if (!tokenCheck.valid) {
        btn.disabled = false;
        btn.innerHTML = '🚀 Deploy Bot';
        return showError(tokenCheck.reason || 'Bot token tidak valid.');
    }

    btn.innerHTML = '<span class="spinner"></span> Deploying...';

    // Show step 3 with loading
    showStep(3);
    document.getElementById('deployLoading').style.display = 'block';
    document.getElementById('logSection').style.display = 'none';

    // Build form data
    const formData = new FormData();
    formData.append('license_key', licenseKey);
    formData.append('bot_token', botToken);
    formData.append('admin_id', adminId);
    formData.append('store_name', storeName);
    formData.append('order_prefix', orderPrefix);
    formData.append('pakasir_api_key', pakasirApiKey);
    formData.append('pakasir_slug', pakasirSlug);
    formData.append('support_username', supportUsername);
    formData.append('support_hours', supportHours);
    formData.append('theme_preset', themePreset);
    formData.append('banner', bannerFile);

    try {
        const res = await fetch('/api/deploy', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            // Show success section
            document.getElementById('deployLoading').style.display = 'none';
            document.getElementById('logSection').style.display = 'block';

            document.getElementById('resultWebhook').textContent = data.webhookUrl;
            document.getElementById('resultPort').textContent = data.port;

            // Instructions
            const instrEl = document.getElementById('resultInstructions');
            instrEl.innerHTML = '';
            const steps = [
                `Buka <strong>PaKasir</strong> → Settings → Callback URL`,
                `Paste webhook URL: <code>${data.webhookUrl}</code>`,
                `Buka bot kamu di Telegram, ketik <code>/start</code>`,
                `Tambah produk & stok dari Admin Panel (<code>/admin</code>)`,
                `Bot sudah siap! 🎉 Mulai jualan sekarang`
            ];
            steps.forEach(s => {
                const li = document.createElement('li');
                li.innerHTML = s;
                instrEl.appendChild(li);
            });

            // Start SSE log stream
            startLogStream(licenseKey);
        } else {
            showStep(2);
            showError(data.error || 'Deploy gagal.');
        }
    } catch (err) {
        showStep(2);
        showError('Deploy gagal: ' + err.message);
    }

    btn.disabled = false;
    btn.innerHTML = '🚀 Deploy Bot';
};

// ==================== REAL-TIME LOG STREAM ====================

const startLogStream = (licenseKey) => {
    const logViewer = document.getElementById('logViewer');
    logViewer.textContent = '⏳ Waiting for container to start...\n';

    try {
        const evtSource = new EventSource(`/api/deploy-logs/${licenseKey}`);

        evtSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'log') {
                logViewer.textContent = data.content;
                logViewer.scrollTop = logViewer.scrollHeight;
            }

            if (data.type === 'status' && data.running) {
                const statusLine = '\n\n✅ Bot is running!\n';
                logViewer.textContent += statusLine;
            }

            if (data.type === 'done') {
                evtSource.close();
                if (data.running) {
                    logViewer.textContent += '\n🟢 Container ready.';
                } else {
                    logViewer.textContent += '\n⚠️ Container may still be starting...';
                }
            }
        };

        evtSource.onerror = () => {
            evtSource.close();
            logViewer.textContent += '\n\n📡 Log stream ended.';
        };
    } catch (e) {
        logViewer.textContent = 'Could not connect to log stream.';
    }
};

// ==================== UTILS ====================

const copyText = (elementId) => {
    const text = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = event.target;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1500);
    });
};
