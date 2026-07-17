#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$SCRIPT_DIR/.." && pwd)}"
cd "$ROOT_DIR"

echo "Xcode Cloud: preparing Capacitor iOS dependencies"

if ! command -v npm >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "error: npm is required before resolving Capacitor Swift packages."
    exit 1
  fi
  echo "Xcode Cloud: npm not found; installing Node.js with Homebrew"
  brew install node
fi

export CAPACITOR_ENV=production

if [[ ! -d "node_modules/@capacitor/push-notifications" ]]; then
  echo "Xcode Cloud: installing JavaScript dependencies"
  npm ci
else
  echo "Xcode Cloud: JavaScript dependencies already installed"
fi

if [[ ! -d "node_modules/@capacitor/push-notifications" ]]; then
  echo "error: @capacitor/push-notifications was not installed under node_modules."
  exit 1
fi

echo "Xcode Cloud: syncing Capacitor iOS project"
npx cap sync ios
