#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-eventformproxy}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
DEST_BASE="${DEST_BASE:-/srv/event-form-proxy}"
DEST_APP="$DEST_BASE/app"
DEST_LOGS="$DEST_BASE/logs"
DEST_RUN="$DEST_BASE/run"

APP_NAME="${APP_NAME:-event-form-proxy}"
# Auto-detect entry; override via ENTRY=app.js ./pm2-setup-eventformproxy.sh
ENTRY="${ENTRY:-}"
INSTANCES="${INSTANCES:-1}"       # or "max"
EXEC_MODE="${EXEC_MODE:-fork}"    # or "cluster"
ENABLE_LOGROTATE="${ENABLE_LOGROTATE:-1}"

echo "==> PM2 setup for $APP_NAME as user $APP_USER"
echo "    Home: $DEST_BASE  App: $DEST_APP"

# 0) Ensure user and dirs exist (safe if already present)
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  echo "==> Creating system user: $APP_USER"
  sudo adduser --system --group --home "$DEST_BASE" "$APP_USER"
fi
sudo mkdir -p "$DEST_APP" "$DEST_LOGS" "$DEST_RUN"
sudo chown -R "$APP_USER:$APP_GROUP" "$DEST_BASE"

# 1) Ensure Node + pm2 exist (global)
if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Installing pm2 globally"
  sudo npm install -g pm2
fi

# 2) Detect entry file if not provided
if [[ -z "$ENTRY" ]]; then
  if sudo -u "$APP_USER" test -f "$DEST_APP/server.js"; then
    ENTRY="server.js"
  elif sudo -u "$APP_USER" test -f "$DEST_APP/index.js"; then
    ENTRY="index.js"
  else
    echo "!! Could not find server.js or index.js in $DEST_APP"
    echo "   Set ENTRY=your-entry.js and re-run."
    exit 1
  fi
fi
echo "==> Using entry: $ENTRY"

# 3) Write ecosystem.config.js (only if missing)
ECO="$DEST_APP/ecosystem.config.cjs"
if ! sudo -u "$APP_USER" test -f "$ECO"; then
  echo "==> Creating ecosystem.config.cjs"
  sudo -u "$APP_USER" bash -lc "cat > '$ECO' <<'EOF'
module.exports = {
  apps: [{
    name: process.env.APP_NAME || 'event-form-proxy',
    script: process.env.ENTRY || 'server.js',
    instances: process.env.INSTANCES || 1,
    exec_mode: process.env.EXEC_MODE || 'fork',
    time: true,
    watch: false,
    env: {
      NODE_ENV: 'production'
    },
    // If you keep a .env alongside your app, PM2 will load it:
    env_file: '.env',
    out_file: '/srv/event-form-proxy/logs/out.log',
    error_file: '/srv/event-form-proxy/logs/err.log',
    merge_logs: true,
    max_memory_restart: '512M'
  }]
}
EOF"
fi

# 4) Start (or reload) under the app user
echo "==> Starting with PM2 (user: $APP_USER)"
sudo -u "$APP_USER" -H bash -lc "
  set -e
  cd '$DEST_APP'
  # Provide runtime overrides via env so the ecosystem can pick them up
  APP_NAME='$APP_NAME' ENTRY='$ENTRY' INSTANCES='$INSTANCES' EXEC_MODE='$EXEC_MODE' \
    pm2 start ecosystem.config.cjs || pm2 reload ecosystem.config.cjs
  pm2 save
"

# 5) Install user-level systemd startup and enable
echo '==> Configuring PM2 to launch on boot (systemd user service)'
STARTUP_CMD=$(sudo -u "$APP_USER" -H bash -lc "pm2 startup systemd -u $APP_USER --hp '$DEST_BASE' | sed -n 's/^.*\(sudo .*pm2.*\)$/\1/p'")
if [[ -n "${STARTUP_CMD:-}" ]]; then
  # Execute the suggested sudo command once
  echo "==> Running: $STARTUP_CMD"
  eval "$STARTUP_CMD"
else
  echo "!! Could not parse pm2 startup output; you may need to run it manually."
fi

# 6) Optional: pm2-logrotate
if [[ "$ENABLE_LOGROTATE" == "1" ]]; then
  echo "==> Installing & configuring pm2-logrotate (optional)"
  sudo -u "$APP_USER" -H bash -lc "
    pm2 ls >/dev/null 2>&1
    pm2 install pm2-logrotate || true
    pm2 set pm2-logrotate:max_size 10M
    pm2 set pm2-logrotate:retain 14
    pm2 set pm2-logrotate:compress true
    pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
    pm2 set pm2-logrotate:workerInterval 30
    pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
    pm2 save
  "
fi

echo "✅ PM2 is set up. Commands you’ll use day-to-day:"
echo "   sudo -u $APP_USER pm2 status"
echo "   sudo -u $APP_USER pm2 logs $APP_NAME"
echo "   sudo -u $APP_USER pm2 reload $APP_NAME"
