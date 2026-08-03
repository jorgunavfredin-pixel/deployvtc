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
        echo "  Paste isi token JSON, atau tekan Enter untuk skip"
        read -p "> " RCLONE_TOKEN

        if [ -n "$RCLONE_TOKEN" ]; then
            mkdir -p /root/.config/rclone
            cat > /root/.config/rclone/rclone.conf << REOF
[gdrive]
type = drive
scope = drive
token = ${RCLONE_TOKEN}
team_drive =
REOF
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

# Clone if not exists
if [ ! -d "/root/vitaicmin" ] || [ ! -d "/root/deployvtc" ]; then
    # Coba clone public dulu (tanpa token). Kalau repo sudah private, git akan
    # gagal → baru minta PAT token.
    echo ""
    echo "Mencoba clone public (tanpa token)..."
    if [ ! -d "/root/vitaicmin" ]; then
        git clone https://github.com/jorgunavfredin-pixel/vitaicmin.git && echo -e "${GREEN}✓ vitaicmin cloned${NC}" || echo -e "${RED}✗ gagal (kemungkinan repo private)${NC}"
    fi
    if [ ! -d "/root/deployvtc" ]; then
        git clone https://github.com/jorgunavfredin-pixel/deployvtc.git && echo -e "${GREEN}✓ deployvtc cloned${NC}" || echo -e "${RED}✗ gagal (kemungkinan repo private)${NC}"
    fi

    # Kalau masih ada yang belum ter-clone, minta PAT token
    if [ ! -d "/root/vitaicmin" ] || [ ! -d "/root/deployvtc" ]; then
        echo ""
        echo "GitHub PAT token (untuk clone private repo):"
        echo "  PAT = string acak (contoh: ghp_abc123...). BUKAN URL repo."
        echo "  Ketik 'skip' untuk melewati dan lanjut manual."
        read -p "> " GH_TOKEN
        if [ "${GH_TOKEN,,}" = "skip" ] || [ -z "$GH_TOKEN" ]; then
            echo -e "${YELLOW}Clone dilewati. Lanjut ke langkah berikutnya.${NC}"
        else
            # Validasi: PAT tidak boleh mengandung karakter URL
            case "$GH_TOKEN" in
                *"http"*|*"@"*|*"/"*) echo -e "${RED}Input tidak valid: itu bukan PAT token. Dilewati.${NC}" ;;
                *)
                    [ ! -d "/root/vitaicmin" ] && git clone "https://jorgunavfredin-pixel:${GH_TOKEN}@github.com/jorgunavfredin-pixel/vitaicmin.git"
                    [ ! -d "/root/deployvtc" ] && git clone "https://jorgunavfredin-pixel:${GH_TOKEN}@github.com/jorgunavfredin-pixel/deployvtc.git"
                    ;;
            esac
        fi
    fi
fi

# ==================== STEP 6: Build Docker Image ====================
echo -e "${YELLOW}[6/8] Building store-bot Docker image...${NC}"
cd /root/vitaicmin
docker build -t store-bot .
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

    # Admin Panel Password (opsional — kosong = auto-generate)
    echo ""
    echo "Password admin panel deploy (default: auto-generate):"
    read -p "> " ADMIN_PASS

    cat > .env << EOF
# Vitacimin Deploy Platform
VPS_IP=${DETECTED_IP}
BOT_TEMPLATE_IMAGE=store-bot
DATA_DIR=/root/data
MAX_CONTAINERS=${MAX_C}
PORT=800
# Perpanjangan license (Renew)
RENEW_PRICE_PER_MONTH=30000
# Auto Backup (Google Drive via rclone)
RCLONE_REMOTE=gdrive
BACKUP_HOUR=3
# Admin Web Panel (semua opsional; kosong = auto-generate & persist)
ADMIN_PANEL_PASSWORD=${ADMIN_PASS}
ADMIN_JWT_SECRET=
ADMIN_PATH=
# Telegram link untuk frontend (default t.me/yuriot)
TELEGRAM_LINK=
EOF

    echo -e "${GREEN}.env created!${NC}"
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
    nginx -t && systemctl reload nginx
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

# ==================== START ====================
echo -e "${YELLOW}Starting deployvtc...${NC}"

pm2 delete deployvtc 2>/dev/null || true
pm2 start src/index.js --name deployvtc
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

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
