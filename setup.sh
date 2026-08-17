#!/bin/bash
# ============================================================
#  Vitacimin Deploy — VPS Setup Script
#  Ubuntu 24 | Docker + Node.js + PM2 + Nginx + SSL
# ============================================================

set -e
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════╗"
echo "║    🚀 Vitacimin Deploy — VPS Setup       ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ==================== STEP 1: System Update ====================
echo -e "${YELLOW}[1/8] Updating system...${NC}"
apt update && apt upgrade -y
apt install -y curl git unzip

# ==================== STEP 2: Docker ====================
echo -e "${YELLOW}[2/8] Installing Docker...${NC}"
if command -v docker &> /dev/null; then
    echo "Docker already installed: $(docker --version)"
else
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}Docker installed: $(docker --version)${NC}"
fi

# ==================== STEP 3: Node.js 20 LTS + PM2 ====================
echo -e "${YELLOW}[3/8] Installing Node.js 20 + PM2...${NC}"
if command -v node &> /dev/null; then
    echo "Node.js already installed: $(node --version)"
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
    echo -e "${GREEN}Node.js installed: $(node --version)${NC}"
fi

if command -v pm2 &> /dev/null; then
    echo "PM2 already installed"
else
    npm install -g pm2
    echo -e "${GREEN}PM2 installed${NC}"
fi

# ==================== STEP 4: Rclone (opsional — bisa skip) ====================
echo -e "${YELLOW}[4/8] Rclone (Google Drive backup)...${NC}"
echo -e "${CYAN}Install rclone? (y/n, default n = skip)${NC}"
read -p "> " INSTALL_RCLONE
if [ "${INSTALL_RCLONE,,}" = "y" ]; then
    if command -v rclone &> /dev/null; then
        echo "Rclone already installed"
    else
        # Unduh binary rclone langsung dari GitHub release (lebih cepat & stabil
        # daripada curl install.sh yang lambat/redirect).
        cd /tmp
        RCLONE_VERSION="v1.68.2"
        ARCH=$(uname -m)
        case "$ARCH" in
            x86_64|amd64) RCLONE_ARCH="amd64" ;;
            aarch64|arm64) RCLONE_ARCH="arm64" ;;
            *) echo -e "${RED}Unsupported arch: $ARCH. Skip rclone.${NC}"; INSTALL_RCLONE=n ;;
        esac
        if [ "${INSTALL_RCLONE,,}" = "y" ]; then
            curl -L -o rclone.zip "https://github.com/rclone/rclone/releases/download/${RCLONE_VERSION}/rclone-${RCLONE_VERSION}-linux-${RCLONE_ARCH}.zip" || true
            if [ -f rclone.zip ]; then
                unzip -o rclone.zip >/dev/null 2>&1 && cp rclone-*/rclone /usr/local/bin/rclone && chmod +x /usr/local/bin/rclone && rm -rf rclone.zip rclone-* && echo -e "${GREEN}Rclone installed: $(rclone version 2>/dev/null | head -1)${NC}"
            else
                echo -e "${RED}Gagal download rclone. Auto-skip (backup ke GDrive nonaktif).${NC}"
                INSTALL_RCLONE=n
            fi
        fi
    fi
else
    echo "Skipped. Backup Google Drive nonaktif (cron backup akan skip)."
fi

# Setup rclone config (hanya bila rclone terpasang)
if [ "${INSTALL_RCLONE,,}" = "y" ] && command -v rclone &> /dev/null; then
    if [ -f "/root/.config/rclone/rclone.conf" ]; then
        echo "Rclone config already exists, skipping"
    else
        echo ""
        echo -e "${CYAN}Paste token rclone dari VPS lama:${NC}"
        echo "  (jalankan di VPS lama: cat /root/.config/rclone/rclone.conf)"
        echo "  Paste isi file (multi-line OK), lalu tekan Ctrl+D untuk selesai"
        echo "  Atau tekan Ctrl+D langsung untuk skip"
        echo ""
        RCLONE_TOKEN=$(cat)

        if [ -n "$RCLONE_TOKEN" ]; then
            mkdir -p /root/.config/rclone
            echo "$RCLONE_TOKEN" > /root/.config/rclone/rclone.conf
            echo -e "${GREEN}Rclone config created!${NC}"
            echo "Testing Google Drive connection..."
            if rclone lsd gdrive: --max-depth 1 2>/dev/null; then
                echo -e "${GREEN}✅ Google Drive connected!${NC}"
            else
                echo -e "${RED}⚠️ Failed. Setup manual nanti: rclone config${NC}"
            fi
        else
            echo "Skipped. Setup manual nanti: rclone config"
        fi
    fi
fi

# ==================== STEP 5: Clone Repos ====================
echo -e "${YELLOW}[5/8] Cloning repositories...${NC}"

cd /root

if [ -d "/root/vitaicmin" ] || [ -d "/root/deployvtc" ]; then
    echo -e "${CYAN}Repo sudah ada. Pull latest? (y/n)${NC}"
    read -p "> " DO_PULL
    if [ "$DO_PULL" = "y" ]; then
        [ -d "/root/vitaicmin" ] && cd /root/vitaicmin && git pull && cd /root
        [ -d "/root/deployvtc" ] && cd /root/deployvtc && git pull && cd /root
    fi
fi

# Clone from public repo if not exists
if [ ! -d "/root/vitaicmin" ]; then
    echo "Cloning vitaicmin from GitHub..."
    git clone https://github.com/jorgunavfredin-pixel/vitaicmin.git && echo -e "${GREEN}✓ vitaicmin cloned${NC}" || echo -e "${RED}✗ Clone failed. Manual: git clone <repo-url>${NC}"
fi

if [ ! -d "/root/deployvtc" ]; then
    echo "Cloning deployvtc from GitHub..."
    git clone https://github.com/jorgunavfredin-pixel/deployvtc.git && echo -e "${GREEN}✓ deployvtc cloned${NC}" || echo -e "${RED}✗ Clone failed. Manual: git clone <repo-url>${NC}"
fi

# ==================== STEP 6: Build Docker Image ====================
echo -e "${YELLOW}[6/8] Building store-bot Docker image...${NC}"
cd /root/vitaicmin

if [ ! -f "Dockerfile" ]; then
    echo -e "${RED}Dockerfile not found in /root/vitaicmin${NC}"
    echo "Manual: check repo or create Dockerfile"
    exit 1
fi

if ! docker build -t store-bot .; then
    echo -e "${RED}Docker build failed. Check logs above.${NC}"
    exit 1
fi

echo -e "${GREEN}Docker image 'store-bot' built!${NC}"

# ==================== STEP 7: Setup Deploy ====================
echo -e "${YELLOW}[7/8] Setting up deployvtc...${NC}"
cd /root/deployvtc

# Backend dependencies
npm install

# Frontend build
echo -e "${YELLOW}Building frontend...${NC}"
cd /root/deployvtc/frontend
npm install
npm run build
cd /root/deployvtc
echo -e "${GREEN}Frontend built!${NC}"

# Create directories
mkdir -p /root/data
mkdir -p /root/deployvtc/uploads

# Interactive .env setup
if [ -f ".env" ]; then
    echo -e "${YELLOW}.env sudah ada. Overwrite? (y/n)${NC}"
    read -p "> " OVERWRITE
    if [ "$OVERWRITE" != "y" ]; then
        echo "Keeping existing .env"
        CREATE_ENV=false
    else
        CREATE_ENV=true
    fi
else
    CREATE_ENV=true
fi

if [ "$CREATE_ENV" = true ]; then
    echo ""
    echo -e "${GREEN}━━━ .env Configuration ━━━${NC}"

    # Auto-detect VPS IP
    DETECTED_IP=$(curl -s ifconfig.me 2>/dev/null || echo "localhost")
    echo -e "VPS IP detected: ${GREEN}${DETECTED_IP}${NC}"

    # Max Containers
    echo ""
    echo "Max containers (default: 8):"
    read -p "> " MAX_C
    MAX_C=${MAX_C:-8}

    # Admin Panel Password (wajib — kalau kosong, auto-generate)
    echo ""
    echo "Password admin panel deploy (Enter = auto-generate):"
    read -p "> " ADMIN_PASS
    if [ -z "$ADMIN_PASS" ]; then
        ADMIN_PASS=$(openssl rand -base64 16 | tr -d '/+=' | head -c 16)
        echo -e "${GREEN}Auto-generated password: ${ADMIN_PASS}${NC}"
        echo -e "${YELLOW}⚠️ Simpan password ini! Tidak bisa dilihat lagi setelah setup.${NC}"
    fi

    # ---- Opsional: semua boleh di-skip, barisnya tetap ditulis ke .env ----
    echo ""
    echo -e "${CYAN}Berikut opsional — tekan Enter untuk skip.${NC}"
    echo -e "${CYAN}Baris tetap ditulis ke .env supaya bisa diisi manual nanti.${NC}"

    # Bot Telegram admin deploy
    echo ""
    echo "Token bot Telegram admin deploy (dari @BotFather):"
    read -p "> " DEPLOY_TOKEN

    echo ""
    echo "Telegram ID admin (dari @userinfobot, pisah koma kalau lebih dari satu):"
    read -p "> " ADMIN_TG_ID

    # KlikQRIS — dipakai fitur perpanjangan license
    echo ""
    echo "KlikQRIS API Key (untuk perpanjangan license buyer):"
    read -p "> " KQ_API_KEY

    echo ""
    echo "KlikQRIS Merchant ID:"
    read -p "> " KQ_MERCHANT_ID

    cat > .env << EOF
# ==============================================
# DEPLOYVTC — Panel Deploy Configuration
# Dibuat otomatis oleh setup.sh
# Baris yang kosong bisa diisi manual, lalu:
#   pm2 restart deployvtc
# ==============================================

# ---- Wajib ----
# IP publik VPS atau domain (dipakai membangun WEBHOOK_URL bot buyer)
VPS_IP=${DETECTED_IP}

# Port panel deploy (nginx mem-proxy ke port ini)
PORT=800

# ---- Bot Telegram admin deploy ----
# Kosong = bot admin nonaktif, panel web tetap jalan normal.
# Token dari @BotFather, format: 123456789:AAF...
DEPLOY_BOT_TOKEN=${DEPLOY_TOKEN}

# Telegram ID admin (dari @userinfobot). Pisah koma kalau lebih dari satu.
ADMIN_ID=${ADMIN_TG_ID}

# ---- Container ----
# Maksimum container bot yang boleh jalan bersamaan
MAX_CONTAINERS=${MAX_C}

# Template image untuk container bot (dibangun dari repo vitaicmin)
BOT_TEMPLATE_IMAGE=store-bot

# Direktori data buyer (db, assets, logs tiap bot)
DATA_DIR=/root/data

# Sumber preset twibbon QRIS. Kosongkan untuk memakai default:
# /root/vitaicmin/assets/qris-custom/presets
QRIS_PRESET_DIR=

# ---- Perpanjangan license (Renew) ----
# Harga per bulan (Rp). Harga per hari dihitung = harga/bulan / 30.
RENEW_PRICE_PER_MONTH=30000

# Callback renewal KlikQRIS. Nilai final disesuaikan otomatis setelah setup
# Nginx/domain selesai (IP:800 jika tanpa domain; domain tanpa port jika proxy).
RENEW_WEBHOOK_URL=http://${DETECTED_IP}:800/webhook/renew/klikqris

# Polling fallback jika callback tidak masuk (milidetik; minimum 10000).
RENEW_POLL_INTERVAL_MS=20000

# Kredensial KlikQRIS untuk pembayaran perpanjangan.
# Kosong = fitur renew tidak bisa dipakai buyer.
KLIKQRIS_API_KEY=${KQ_API_KEY}
KLIKQRIS_MERCHANT_ID=${KQ_MERCHANT_ID}

# ---- Auto Backup (via rclone ke Google Drive) ----
# Nama remote rclone. Cek dengan: rclone listremotes
RCLONE_REMOTE=gdrive

# Jam backup harian, waktu WIB (0-23)
BACKUP_HOUR=3

# ---- Admin Web Panel ----
# Password login admin panel.
ADMIN_PANEL_PASSWORD=${ADMIN_PASS}

# Secret JWT. Kosong = auto-generate 64 hex acak, persist di deploy-secrets.json
ADMIN_JWT_SECRET=

# Path admin rahasia (bukan /admin — itu sengaja fake 404).
# Kosong = random, URL lengkap tampil di log saat boot.
ADMIN_PATH=

# ---- Lain-lain ----
# Link Telegram yang tampil di frontend. Kosong = https://t.me/yuriot
TELEGRAM_LINK=
EOF

    echo -e "${GREEN}.env created!${NC}"

    # Ringkas apa yang belum terisi supaya tidak ada fitur mati diam-diam
    PENDING=""
    [ -z "$DEPLOY_TOKEN" ] && PENDING="${PENDING}\n  - DEPLOY_BOT_TOKEN  → bot Telegram admin nonaktif"
    [ -z "$ADMIN_TG_ID" ] && PENDING="${PENDING}\n  - ADMIN_ID          → bot admin tidak mengenali siapa pun"
    if [ -z "$KQ_API_KEY" ] || [ -z "$KQ_MERCHANT_ID" ]; then
        PENDING="${PENDING}\n  - KLIKQRIS_*        → buyer tidak bisa perpanjang license"
    fi

    if [ -n "$PENDING" ]; then
        echo ""
        echo -e "${YELLOW}Belum terisi di .env (isi manual kalau perlu):${NC}"
        echo -e "${YELLOW}${PENDING}${NC}"
        echo -e "${CYAN}  nano /root/deployvtc/.env && pm2 restart deployvtc${NC}"
    fi
fi

# ==================== STEP 8: Nginx + SSL ====================
echo -e "${YELLOW}[8/8] Setting up Nginx + SSL...${NC}"

# Install Nginx + Certbot
apt install -y nginx certbot python3-certbot-nginx

echo ""
echo -e "${CYAN}Domain/subdomain untuk web panel (contoh: s1.vitacimin.store):${NC}"
echo "Tekan Enter untuk skip (akses via IP:800)"
read -p "> " DOMAIN

if [ -n "$DOMAIN" ]; then
    # Create Nginx config
    cat > /etc/nginx/sites-available/vitacimin << NEOF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:800;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NEOF

    # Enable site
    ln -sf /etc/nginx/sites-available/vitacimin /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default

    # Test & reload nginx
    if ! nginx -t; then
        echo -e "${RED}Nginx config invalid. Fix manual lalu: systemctl reload nginx${NC}"
        exit 1
    fi
    systemctl reload nginx
    echo -e "${GREEN}Nginx configured for ${DOMAIN}${NC}"

    # SSL
    echo ""
    echo -e "${CYAN}Install SSL certificate? (y/n)${NC}"
    read -p "> " DO_SSL
    if [ "$DO_SSL" = "y" ]; then
        certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --email admin@${DOMAIN} || {
            echo -e "${YELLOW}Auto SSL failed. Coba manual: certbot --nginx -d ${DOMAIN}${NC}"
        }
    fi

    # Update .env VPS_IP to domain
    if [ -f ".env" ]; then
        sed -i "s|^VPS_IP=.*|VPS_IP=${DOMAIN}|" .env
        echo -e "${GREEN}VPS_IP updated to ${DOMAIN}${NC}"
    fi
else
    echo "Skipped Nginx. Akses via http://<IP>:800"
fi

# ==================== RENEW CALLBACK ENV ====================
# Berlaku untuk .env baru MAUPUN .env existing yang dipertahankan. Tidak menyentuh
# credential/harga; hanya memastikan key webhook/polling baru tersedia.
if [ -f ".env" ]; then
    ENV_PORT=$(grep "^PORT=" .env | cut -d= -f2-)
    ENV_PORT=${ENV_PORT:-800}
    ENV_VPS=$(grep "^VPS_IP=" .env | cut -d= -f2-)
    ENV_VPS=${ENV_VPS:-${DETECTED_IP:-localhost}}

    if [ -n "$DOMAIN" ]; then
        if [ "$DO_SSL" = "y" ]; then
            RENEW_CALLBACK="https://${DOMAIN}/webhook/renew/klikqris"
        else
            RENEW_CALLBACK="http://${DOMAIN}/webhook/renew/klikqris"
        fi
    else
        RENEW_CALLBACK="http://${ENV_VPS}:${ENV_PORT}/webhook/renew/klikqris"
    fi

    CURRENT_RENEW_CALLBACK=$(grep '^RENEW_WEBHOOK_URL=' .env | cut -d= -f2-)
    if ! grep -q '^RENEW_WEBHOOK_URL=' .env; then
        printf '\n# Callback KlikQRIS renewal (diisi otomatis setup.sh)\nRENEW_WEBHOOK_URL=%s\n' "$RENEW_CALLBACK" >> .env
    elif [ -z "$CURRENT_RENEW_CALLBACK" ]; then
        sed -i "s|^RENEW_WEBHOOK_URL=.*|RENEW_WEBHOOK_URL=${RENEW_CALLBACK}|" .env
    else
        # Existing custom callback milik user jangan ditimpa setup ulang.
        RENEW_CALLBACK="$CURRENT_RENEW_CALLBACK"
    fi

    if ! grep -q '^RENEW_POLL_INTERVAL_MS=' .env; then
        printf '# Polling fallback renewal (20 detik)\nRENEW_POLL_INTERVAL_MS=20000\n' >> .env
    fi

    echo -e "${GREEN}Renew webhook: ${RENEW_CALLBACK}${NC}"
fi

# ==================== START ====================
echo -e "${YELLOW}Starting deployvtc...${NC}"

pm2 delete deployvtc 2>/dev/null || true
pm2 start src/index.js --name deployvtc
pm2 save

# Setup PM2 startup (with warning if fails)
if pm2 startup systemd -u root --hp /root 2>&1 | grep -q "already"; then
    echo -e "${GREEN}PM2 startup already configured${NC}"
else
    if ! pm2 startup systemd -u root --hp /root; then
        echo -e "${YELLOW}⚠️ PM2 startup may have failed. Check: systemctl status pm2-root${NC}"
    fi
fi

# Read values for summary
VPS_IP_FINAL=$(grep "^VPS_IP=" .env | cut -d= -f2)
PORT_FINAL=$(grep "^PORT=" .env | cut -d= -f2)

echo ""
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════╗"
echo "║         ✅ Setup Complete!                    ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
if [ -n "$DOMAIN" ]; then
echo "║  🌐 Web: https://${DOMAIN}"
else
echo "║  🌐 Web: http://${VPS_IP_FINAL}:${PORT_FINAL}"
fi
echo "║  💳 Renew webhook: ${RENEW_CALLBACK}"
echo "║  🤖 Admin Bot: Running via PM2               ║"
echo "║  🐳 Docker Image: store-bot                  ║"
echo "║  📁 Data: /root/data                         ║"
echo "║                                              ║"
echo "║  📋 Commands:                                ║"
echo "║  pm2 logs deployvtc                          ║"
echo "║  pm2 restart deployvtc                      ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"
