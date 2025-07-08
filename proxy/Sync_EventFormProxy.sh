#!/usr/bin/env bash

# Source and destination
SRC="$HOME/event-form-proxy/"
DEST="/var/www/event-proxy/"

echo "Syncing from $SRC to $DEST ..."

# Rsync: archive mode, verbose, exclude node_modules, NO delete
rsync -av \
  --exclude 'node_modules/' \
  "$SRC" "$DEST"

# Reset ownership to webuser:www-data
echo "Resetting ownership to webuser:www-data ..."
chown -R webuser:www-data "$DEST"

echo "✅ Sync complete!"
