#!/bin/zsh
set -euo pipefail

TARGET_DIR="${TEST_TARGET_DIR:-$HOME/services/hiking-telegram-bot-test}"
SOURCE_DIR="${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}"
APP_NAME="hiking-bot-test"

echo "Deploying test to: $TARGET_DIR"

mkdir -p "$TARGET_DIR"

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required for deploy."
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is required on the server."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required on the server."
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
pm2 stop "$APP_NAME" >/dev/null 2>&1 || true
rm -rf node_modules
npm ci --omit=dev
test -f node_modules/telegraf/package.json
test -f node_modules/sharp/package.json
test -f node_modules/tesseract.js/package.json
APP_STAGE=test pm2 startOrReload ecosystem.config.cjs --only "$APP_NAME" --update-env
pm2 save

echo "Test deploy completed."
