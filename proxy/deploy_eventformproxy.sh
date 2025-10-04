#!/usr/bin/env bash
set -euo pipefail

### --- Config (override via env if you like) ---
APP_USER="${APP_USER:-eventformproxy}"
APP_GROUP="${APP_GROUP:-$APP_USER}"

SRC="${SRC:-$PWD}"   #"${SRC:-$HOME/event-form-proxy}"          # your local project folder
DEST_BASE="${DEST_BASE:-/srv/event-form-proxy}"
DEST_APP="$DEST_BASE/app"
DEST_LOGS="$DEST_BASE/logs"
DEST_RUN="$DEST_BASE/run"

# If you want rsync to delete files that no longer exist in SRC, set RSYNC_DELETE=1
RSYNC_DELETE="${RSYNC_DELETE:-0}"

echo "==> Source:      $SRC"
echo "==> Destination: $DEST_BASE (user: $APP_USER)"

### 1) Ensure system user exists (home set to DEST_BASE)
if id -u "$APP_USER" >/dev/null 2>&1; then
    echo "==> User $APP_USER already exists."
else
    echo "==> Creating system user: $APP_USER"
    sudo adduser --system --group --home "$DEST_BASE" "$APP_USER"
fi

### 2) Ensure directory structure
echo "==> Ensuring directory structure ($DEST_APP, $DEST_LOGS, $DEST_RUN)"
sudo mkdir -p "$DEST_APP" "$DEST_LOGS" "$DEST_RUN"

### 3) Rsync relevant files into app/
#   - no delete by default (matches your current behavior)
#   - sensible excludes (adjust to your repo)
echo "==> Syncing source files to $DEST_APP"
RSYNC_OPTS=(-av)
[[ "$RSYNC_DELETE" == "1" ]] && RSYNC_OPTS+=("--delete")

sudo rsync "${RSYNC_OPTS[@]}" \
    --exclude ".git/" \
    --exclude "node_modules/" \
    --exclude ".cache/" \
    --exclude ".DS_Store" \
    --exclude "logs/" \
    --exclude "run/" \
    "$SRC"/ "$DEST_APP"/

# Copy .env if present (optional; remove if you manage secrets differently)
if [[ -f "$SRC/.env" ]]; then
    echo "==> Copying .env"
    sudo cp "$SRC/.env" "$DEST_APP/.env"
    sudo chmod 600 "$DEST_APP/.env"
fi

### 4) Ownership (entire /srv/event-form-proxy tree)
echo "==> chown -R $APP_USER:$APP_GROUP $DEST_BASE"
sudo chown -R "$APP_USER:$APP_GROUP" "$DEST_BASE"

### 5) Install deps and build inside ./app/ as the app user
echo "==> npm install/build inside $DEST_APP"
sudo -u "$APP_USER" -H bash -lc "
    set -euo pipefail
    cd '$DEST_APP'
    if [[ -f package-lock.json ]]; then
        npm ci --no-audit --no-fund
    else
        npm install --no-audit --no-fund
    fi

    if npm run | grep -qE '^  build'; then
        npm run build
    else
        echo 'No build script found; skipping npm run build.'
    fi
"

echo "✅ Done. Deployed to $DEST_APP under $APP_USER."