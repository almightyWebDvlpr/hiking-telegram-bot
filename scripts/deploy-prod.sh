#!/bin/zsh
set -euo pipefail

TARGET_DIR="${PROD_TARGET_DIR:-$HOME/services/hiking-telegram-bot-prod}"
SOURCE_DIR="${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}"
APP_NAME="hiking-bot-prod"

echo "Deploying prod to: $TARGET_DIR"

mkdir -p "$TARGET_DIR"

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required for deploy."
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is required on the server."
  exit 1
fi

rsync -a --delete \
  --exclude ".git" \
  --exclude ".github" \
  --exclude "node_modules" \
  --exclude ".env" \
  "$SOURCE_DIR/" "$TARGET_DIR/"

if [ ! -f "$TARGET_DIR/.env" ]; then
  echo "Missing $TARGET_DIR/.env"
  exit 1
fi

cd "$TARGET_DIR"
npm ci --omit=dev
APP_STAGE=prod pm2 startOrReload ecosystem.config.cjs --only "$APP_NAME" --update-env
pm2 save

echo "Prod deploy completed."
