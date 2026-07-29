# HTTPS Domain Setup Guide

Panduan lengkap setup domain + HTTPS untuk Vitacimin Deploy Platform.

## Prerequisites

- VPS Linux (Ubuntu/Debian)
- Domain yang sudah dibeli (contoh: `deploy.nama.com`)
- Deploy panel sudah jalan di port 3080

## Step 1: Arahkan Domain ke VPS

Login ke panel domain kamu (Namecheap, Cloudflare, Niagahoster, dll), lalu buat **A Record**:

```
Type: A
Name: deploy (atau @ untuk root domain)
Value: IP_VPS_KAMU
TTL: Auto
```

Tunggu propagasi DNS (biasanya 5-30 menit).

## Step 2: Install Nginx

```bash
sudo apt update
sudo apt install -y nginx
```

## Step 3: Konfigurasi Nginx

Buat file konfigurasi:

```bash
sudo nano /etc/nginx/sites-available/deploy
```

Paste konten ini (ganti `deploy.nama.com` dengan domain kamu):

```nginx
server {
    listen 80;
    server_name deploy.nama.com;

    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # SSE support (untuk real-time logs)
        proxy_buffering off;
        proxy_read_timeout 86400;
    }

    # Max upload size untuk banner
    client_max_body_size 5M;
}
```

Aktifkan site:

```bash
sudo ln -s /etc/nginx/sites-available/deploy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Sekarang coba akses `http://deploy.nama.com` — harusnya sudah muncul halaman deploy.

## Step 4: Install SSL (HTTPS)

Install Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Generate SSL certificate (ganti domain):

```bash
sudo certbot --nginx -d deploy.nama.com
```

Certbot akan otomatis:
- Generate SSL certificate
- Update config Nginx untuk redirect HTTP → HTTPS
- Setup auto-renew

## Step 5: Verifikasi

```bash
# Cek Nginx status
sudo systemctl status nginx

# Cek SSL certificate
sudo certbot certificates

# Test HTTPS
curl https://deploy.nama.com/health
```

## Auto-Renew SSL

Certbot sudah setup auto-renew. Cek status:

```bash
sudo systemctl status certbot.timer
```

## Troubleshooting

**Port 80/443 blocked:**
```bash
sudo ufw allow 80
sudo ufw allow 443
```

**DNS belum propagasi:**
```bash
dig deploy.nama.com
# atau
nslookup deploy.nama.com
```

**Nginx error:**
```bash
sudo nginx -t
sudo tail -20 /var/log/nginx/error.log
```
