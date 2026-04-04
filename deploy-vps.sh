#!/bin/bash
# Deploy Munz-KFZ-Dispo zum VPS
# Aufruf: bash deploy-vps.sh

VPS="root@178.254.33.13"
REMOTE="/opt/munz-kfz-dispo"

echo "=== Munz-KFZ-Dispo Deploy ==="

# 1. Dateien zum VPS kopieren (OHNE dispo.db und node_modules)
echo "[1/3] Dateien kopieren..."
scp -r server.js database.js package.json public/ "$VPS:$REMOTE/"

# 2. npm install auf VPS
echo "[2/3] npm install..."
ssh "$VPS" "cd $REMOTE && npm install --production"

# 3. Cache-Buster setzen
CACHE_V=$(date +%Y%m%d%H%M)
echo "[3/3] Cache-Buster: v=$CACHE_V"
ssh "$VPS" "cd $REMOTE/public && sed -i 's/v=[0-9]*/v=$CACHE_V/g' index.html"

# 4. Service neustarten
echo "Service neustarten..."
ssh "$VPS" "systemctl restart munz-kfz-dispo 2>/dev/null || echo 'Service nicht eingerichtet - manuell starten: cd $REMOTE && node server.js'"

echo "=== Deploy fertig ==="
echo "URL: http://munz-server.de:3010"
