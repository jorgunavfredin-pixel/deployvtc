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

# ==================== STEP 4: Rclone ====================
echo -e "${YELLOW}[4/8] Installing Rclone (Google Drive backup)...${NC}"
if command -v rclone &> /dev/null; then
    echo "Rclone already installed"
else
    curl https://rclone.org/install.sh | bash
    echo -e "${GREEN}Rclone installed${NC}"
fi

# Setup rclone config
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

# ==================== STEP 5: Clone Repos ====================
echo -e "${YELLOW}[5/8] Cloning repositories...${NC}"

cd /root

if [ -d "/root/store-bot" ] || [ -d "/root/vitacimin-deploy" ]; then
    echo -e "${CYAN}Repo sudah ada. Pull latest? (y/n)${NC}"
    read -p "> " DO_PULL
    if [ "$DO_PULL" = "y" ]; then
        [ -d "/root/store-bot" ] && cd /root/store-bot && git pull && cd /root
        [ -d "/root/vitacimin-deploy" ] && cd /root/vitacimin-deploy && git pull && cd /root
    fi
fi

# Clone if not exists
if [ ! -d "/root/store-bot" ] || [ ! -d "/root/vitacimin-deploy" ]; then
    echo ""
    echo "GitHub PAT token (untuk clone private repo):"
    read -p "> " GH_TOKEN
    while [ -z "$GH_TOKEN" ]; do
        echo -e "${RED}Token wajib diisi!${NC}"
        read -p "> " GH_TOKEN
    done

    [ ! -d "/root/store-bot" ] && git clone https://vitacimin00:${GH_TOKEN}@github.com/vitacimin00/store-bot.git
    [ ! -d "/root/vitacimin-deploy" ] && git clone https://vitacimin00:${GH_TOKEN}@github.com/vitacimin00/vitacimin-deploy.git
fi

# ==================== STEP 6: Build Docker Image ====================
echo -e "${YELLOW}[6/8] Building store-bot Docker image...${NC}"
cd /root/store-bot
docker build -t store-bot .
echo -e "${GREEN}Docker image 'store-bot' built!${NC}"

# ==================== STEP 7: Setup Vitacimin Deploy ====================
echo -e "${YELLOW}[7/8] Setting up vitacimin-deploy...${NC}"
cd /root/vitacimin-deploy

# Backend dependencies
npm install

# Frontend build
echo -e "${YELLOW}Building frontend...${NC}"
cd /root/vitacimin-deploy/frontend
npm install
npm run build
cd /root/vitacimin-deploy
echo -e "${GREEN}Frontend built!${NC}"

# Create directories
mkdir -p /root/data
mkdir -p /root/vitacimin-deploy/uploads

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

    # Bot Token (WAJIB)
    echo ""
    echo "Deploy Bot Token (dari @BotFather):"
    read -p "> " BOT_TOKEN
    while [ -z "$BOT_TOKEN" ]; do
        echo -e "${RED}Token wajib diisi!${NC}"
        read -p "> " BOT_TOKEN
    done

    # Max Containers
    echo ""
    echo "Max containers (default: 8):"
    read -p "> " MAX_C
    MAX_C=${MAX_C:-8}

    cat > .env << EOF
# Vitacimin Deploy Platform
DEPLOY_BOT_TOKEN=${BOT_TOKEN}
ADMIN_ID=1908897261
VPS_IP=${DETECTED_IP}
BOT_TEMPLATE_IMAGE=store-bot
DATA_DIR=/root/data
TELEGRAM_LINK=https://t.me/yuriot
MAX_CONTAINERS=${MAX_C}
PORT=800
# Auto Backup (Google Drive via rclone)
RCLONE_REMOTE=gdrive
BACKUP_HOUR=3
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
echo -e "${YELLOW}Starting vitacimin-deploy...${NC}"

pm2 delete vitacimin-deploy 2>/dev/null || true
pm2 start src/index.js --name vitacimin-deploy
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
echo "║  pm2 logs vitacimin-deploy                   ║"
echo "║  pm2 restart vitacimin-deploy                ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"
